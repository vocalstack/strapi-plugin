import { factories } from "@strapi/strapi";
import { randomUUID, timingSafeEqual, randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
const PLUGIN_ID = "vocalstack";
const TRANSCRIPT_UID = "plugin::vocalstack.transcript";
const FILE_UID = "plugin::upload.file";
const POLL_MS = 1e4;
let timer;
const bootstrap = async ({ strapi }) => {
  await strapi.service("admin::permission").actionProvider.registerMany([
    { section: "plugins", displayName: "Transcribe audio", uid: "transcribe", pluginName: PLUGIN_ID },
    { section: "settings", displayName: "Connect a VocalStack account", uid: "settings", category: "VocalStack", pluginName: PLUGIN_ID }
  ]);
  const settings2 = strapi.plugin(PLUGIN_ID).service("settings");
  const transcriber2 = strapi.plugin(PLUGIN_ID).service("transcriber");
  if (settings2.options().enabled === false) return;
  strapi.db.lifecycles.subscribe({
    models: [FILE_UID],
    afterCreate(event) {
      const file = event.result;
      if (!settings2.options().autoTranscribe || !file?.mime?.startsWith("audio/")) return;
      setImmediate(() => {
        transcriber2.start(file).catch((err) => strapi.log.warn(`[vocalstack] auto-transcribing ${file.name ?? file.id}: ${err.message}`));
      });
    },
    afterDelete(event) {
      const file = event.result;
      if (file?.id) transcriber2.forget(file.id).catch(() => void 0);
    }
  });
  let running = false;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    transcriber2.pollAll().catch((err) => strapi.log.debug(`[vocalstack] ${err.message}`)).finally(() => running = false);
  }, POLL_MS);
  timer.unref?.();
};
const stopPolling = () => {
  clearInterval(timer);
  timer = void 0;
};
const config = {
  default: {
    autoTranscribe: false,
    enabled: true,
    oneClickConnect: false
  },
  validator(config2) {
    if (config2.apiKey !== void 0 && config2.apiKey !== "" && !String(config2.apiKey).startsWith("vs_key_")) {
      throw new Error("vocalstack: apiKey is a VocalStack API key and starts with vs_key_.");
    }
    if (config2.fileURL !== void 0 && typeof config2.fileURL !== "function") throw new Error("vocalstack: fileURL is a function ({ file, strapi }) => string.");
    for (const key of ["apiURL", "dashboardURL"]) {
      if (config2[key]) new URL(config2[key]);
    }
  }
};
const kind = "collectionType";
const collectionName = "vocalstack_transcripts";
const info = { "singularName": "transcript", "pluralName": "transcripts", "displayName": "Transcript", "description": "VocalStack transcripts of Media Library audio files." };
const options = { "draftAndPublish": false };
const pluginOptions = { "content-manager": { "visible": true }, "content-type-builder": { "visible": false } };
const attributes = { "fileName": { "type": "string" }, "file": { "type": "media", "multiple": false, "allowedTypes": ["audios"] }, "fileId": { "type": "integer", "required": true, "unique": true }, "status": { "type": "enumeration", "enum": ["idle", "processing", "done", "failed"], "default": "idle" }, "transcript": { "type": "text" }, "sentences": { "type": "json" }, "language": { "type": "string" }, "error": { "type": "text" }, "recordingId": { "type": "string" }, "transcriptionId": { "type": "string" }, "transcribedAt": { "type": "datetime" } };
const schema = {
  kind,
  collectionName,
  info,
  options,
  pluginOptions,
  attributes
};
const contentTypes = {
  transcript: { schema }
};
const DEFAULT_API_URL = "https://api.vocalstack.com";
const DEFAULT_DASHBOARD_URL = "https://app.vocalstack.com";
class VocalStackAPIError extends Error {
  constructor(status, code, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
class VocalStackAPI {
  constructor(apiKey, baseURL = DEFAULT_API_URL) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
  }
  async request(method, path2, body, headers = {}) {
    const init = { headers: { accept: "application/json", authorization: `Bearer ${this.apiKey}`, ...headers }, method };
    if (body instanceof FormData) init.body = body;
    else if (body !== void 0) {
      init.body = JSON.stringify(body);
      init.headers["content-type"] = "application/json";
    }
    const res = await fetch(`${this.baseURL}${path2}`, init);
    const data = await res.json().catch(() => void 0);
    if (!res.ok) {
      const err = data?.error ?? data;
      throw new VocalStackAPIError(res.status, err?.code ?? "http_error", err?.message ?? `VocalStack answered ${res.status}`);
    }
    return data;
  }
  me() {
    return this.request("GET", "/v1/me");
  }
  transcribeURL(url, opts) {
    return this.request(
      "POST",
      "/v1/transcriptions",
      { name: opts.name, settings: opts.spokenLanguage ? { spokenLanguage: opts.spokenLanguage } : void 0, url },
      { "idempotency-key": opts.idempotencyKey }
    );
  }
  transcribeFile(file, fileName, opts) {
    const form = new FormData();
    form.append("options", JSON.stringify({ name: opts.name, settings: opts.spokenLanguage ? { spokenLanguage: opts.spokenLanguage } : void 0 }));
    form.append("file", file, fileName);
    return this.request("POST", "/v1/transcriptions", form, { "idempotency-key": opts.idempotencyKey });
  }
  job(recordingId) {
    return this.request("GET", `/v1/recordings/${encodeURIComponent(recordingId)}/job`);
  }
  /** Stop a job before it is done. Its job fails with `stopped`; what was transcribed so far stays in VocalStack. */
  stop(recordingId, reason) {
    return this.request("POST", `/v1/recordings/${encodeURIComponent(recordingId)}/stop`, { reason: reason ?? null });
  }
  transcript(recordingId) {
    return this.request("GET", `/v1/recordings/${encodeURIComponent(recordingId)}/transcript`);
  }
}
function accountLabel(me) {
  const pick2 = (o, ...keys) => {
    if (!o || typeof o !== "object") return void 0;
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v) return v;
    }
  };
  return pick2(me.principal, "name", "displayName") ?? pick2(me.organization, "name") ?? pick2(me.user, "email", "name") ?? pick2(me, "email", "name", "displayName");
}
function serverBase(strapi, origin) {
  const url = strapi.config.get("server.url") ?? "";
  if (/^https?:\/\//.test(url)) return url;
  return origin ?? strapi.config.get("server.absoluteUrl");
}
async function resolveFileURL(strapi, file, options2, origin) {
  const custom = await options2.fileURL?.({ file, strapi });
  const url = custom ?? (await strapi.plugin("upload").service("file").signFileUrls(file)).url;
  if (!url) return void 0;
  return new URL(url, serverBase(strapi, origin)).toString();
}
function isPublicURL(url) {
  const { hostname, protocol } = new URL(url);
  if (protocol !== "https:" && protocol !== "http:") return false;
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return !(a === 10 || a === 127 || a === 0 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127);
  }
  if (host.includes(":")) return !(host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"));
  return true;
}
async function fetchFile(strapi, file, url) {
  if (file.provider === "local" && file.url?.startsWith("/")) {
    const root = path.resolve(strapi.dirs.static.public);
    const local = path.resolve(root, `.${decodeURIComponent(file.url.split("?")[0])}`);
    if (local.startsWith(root + path.sep)) {
      const bytes = await readFile(local).catch(() => void 0);
      if (bytes) return new Blob([bytes], { type: file.mime ?? "application/octet-stream" });
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read the file (${res.status} from ${url})`);
  return res.blob();
}
const breaksParagraph = (s, prev) => !prev || s.speaker !== prev.speaker || s.start - prev.end > 2.5;
function paragraphs(sentences) {
  const out = [];
  sentences.forEach((s, i) => {
    if (breaksParagraph(s, sentences[i - 1])) out.push([]);
    out[out.length - 1].push(s);
  });
  return out;
}
function transcriptText(sentences) {
  return paragraphs(sentences).map((p) => p.map((s) => s.text.trim()).join(" ")).join("\n\n");
}
function attachWords(sentences, words) {
  const sorted = [...words].sort((a, b) => a.start - b.start);
  let i = 0;
  return sentences.map((s) => {
    const own = [];
    while (i < sorted.length && sorted[i].start < s.start - 0.05) i++;
    while (i < sorted.length && sorted[i].start < s.end + 0.05) {
      const w = sorted[i++];
      own.push([round(w.start), round(w.end), w.text.trim()]);
    }
    return own.length ? { ...s, words: own } : s;
  });
}
const round = (n) => Math.round(n * 100) / 100;
class RouteError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const FIELDS = ["documentId", "fileId", "fileName", "status", "transcript", "sentences", "language", "error", "recordingId", "transcriptionId", "transcribedAt"];
const pick = (entry) => Object.fromEntries(FIELDS.filter((k) => entry?.[k] !== void 0).map((k) => [k, entry?.[k]]));
function toSentences(t) {
  const sentences = t.sentences.filter((s) => !s.suppressed && s.text.trim()).map(({ end, sentenceId, speaker, start, text }) => ({ id: sentenceId, end, speaker, start, text: text.trim() }));
  return attachWords(sentences, (t.segments ?? []).filter((g) => !g.suppressed).flatMap((g) => g.words ?? []));
}
function routeError(err) {
  if (err instanceof RouteError) return err;
  if (err instanceof VocalStackAPIError) {
    if (err.status === 401) return new RouteError(409, "The VocalStack API key was refused. Reconnect VocalStack.", "not_connected");
    return new RouteError(err.status >= 500 ? 502 : err.status, err.message, err.code);
  }
  return new RouteError(500, err instanceof Error ? err.message : String(err));
}
const transcriber = ({ strapi }) => {
  const settings2 = () => strapi.plugin(PLUGIN_ID).service("settings");
  const transcripts = () => strapi.documents(TRANSCRIPT_UID);
  const queues = /* @__PURE__ */ new Map();
  const serially = (key, run) => {
    const next = (queues.get(key) ?? Promise.resolve()).then(run, run);
    const settled = next.catch(() => void 0);
    queues.set(key, settled);
    void settled.then(() => queues.get(key) === settled && queues.delete(key));
    return next;
  };
  const finishing = /* @__PURE__ */ new Map();
  const api = async () => {
    const apiKey = await settings2().apiKey();
    if (!apiKey) throw new RouteError(409, "Connect VocalStack first.", "not_connected");
    return new VocalStackAPI(apiKey, settings2().options().apiURL);
  };
  const self = {
    async file(fileId) {
      const file = await strapi.db.query(FILE_UID).findOne({ where: { id: fileId } });
      if (!file) throw new RouteError(404, "Not found.");
      return file;
    },
    async get(fileId) {
      return pick(await transcripts().findFirst({ filters: { fileId: { $eq: fileId } } }));
    },
    /** Merge into the file's transcript entry, creating it on first use. */
    save(file, patch) {
      return serially(file.id, async () => {
        const existing = await transcripts().findFirst({ filters: { fileId: { $eq: file.id } } });
        const data = { ...patch, fileName: file.name ?? null };
        const saved = existing?.documentId ? await transcripts().update({ data, documentId: String(existing.documentId) }) : await transcripts().create({ data: { ...data, file: file.id, fileId: file.id } });
        return pick(saved);
      });
    },
    /** Start a job for this file on VocalStack. */
    async start(fileOrId, origin) {
      const file = typeof fileOrId === "number" ? await self.file(fileOrId) : fileOrId;
      if (!file.mime?.startsWith("audio/")) throw new RouteError(400, "Only audio files can be transcribed.");
      const client = await api();
      const current = await self.get(file.id);
      if (current.status === "processing") return { status: "processing", transcript: current };
      const options2 = settings2().options();
      const url = await resolveFileURL(strapi, file, options2, origin);
      if (!url) throw new RouteError(400, "There is no audio file here.");
      const name = file.name || `file ${file.id}`;
      const call = { idempotencyKey: `strapi:file:${file.id}:${randomUUID()}`, name, spokenLanguage: options2.spokenLanguage };
      try {
        const tx = isPublicURL(url) ? await client.transcribeURL(url, call) : await client.transcribeFile(await fetchFile(strapi, file, url), file.name || decodeURIComponent(new URL(url).pathname.split("/").pop() || "audio"), call);
        if (!tx.job) throw new Error("VocalStack did not start a job for this file.");
        const transcript = await self.save(file, { error: null, recordingId: tx.job.recordingId, status: "processing", transcriptionId: tx.id });
        return { phase: tx.job.state, progress: 0, status: "processing", transcript };
      } catch (err) {
        throw routeError(err);
      }
    },
    /** Where the file's transcript stands; while a job runs, asks VocalStack and saves the outcome once it is over. */
    async status(fileId) {
      const current = await self.get(fileId);
      if (current.status !== "processing" || !current.recordingId) return { status: current.status ?? "idle", transcript: current };
      const file = await self.file(fileId);
      try {
        return await self.checkJob(await api(), file, current, current.recordingId);
      } catch (err) {
        throw routeError(err);
      }
    },
    /** Stop the job. The transcript goes back to how it was; VocalStack keeps what it transcribed so far. */
    async stop(fileId) {
      const file = await self.file(fileId);
      const client = await api();
      const current = await self.get(fileId);
      const { recordingId, status } = current;
      if (status !== "processing" || !recordingId) return { status: status ?? "idle", transcript: current };
      try {
        await client.stop(recordingId, "Stopped from Strapi");
        return await self.restore(file, current);
      } catch (err) {
        if (err instanceof VocalStackAPIError && err.status === 409) return self.checkJob(client, file, current, recordingId).catch(() => self.restore(file, current));
        throw routeError(err);
      }
    },
    /** Where a job stands, saving the outcome once it is over: the whole transcript when done, the reason when it failed. */
    async checkJob(client, file, current, recordingId) {
      const job = await client.job(recordingId);
      if (job.state === "failed" && job.errorCode === "stopped") return self.restore(file, current);
      if (job.state === "failed" || job.state === "cropping") {
        const error = job.state === "cropping" ? "VocalStack is waiting for a crop window; open the transcription in VocalStack." : job.error ?? "The transcription failed.";
        return { error, status: "failed", transcript: await self.save(file, { error, status: "failed" }) };
      }
      if (job.state !== "done") {
        const progress = job.state === "fetching" ? job.progress.phasePct ?? 0 : job.progress.pct;
        const audio = job.state === "transcribing" ? { processedS: job.progress.processedS ?? 0, totalS: job.progress.totalS ?? void 0 } : void 0;
        return { audio, phase: job.progress.phase ?? job.state, progress, status: "processing" };
      }
      let saving = finishing.get(recordingId);
      if (!saving) {
        saving = self.saveTranscript(client, file, recordingId);
        finishing.set(recordingId, saving);
        void saving.catch(() => void 0).then(() => finishing.delete(recordingId));
      }
      return saving;
    },
    /**
     * A stopped job leaves the entry as it was before Transcribe: the earlier transcript, if
     * there was one (a new job only replaces it once done), or none.
     */
    async restore(file, current) {
      const status = current.transcript ? "done" : "idle";
      return { status, stopped: true, transcript: await self.save(file, { error: null, status }) };
    },
    async saveTranscript(client, file, recordingId) {
      const transcript = await client.transcript(recordingId);
      const sentences = toSentences(transcript);
      const saved = await self.save(file, {
        error: null,
        language: transcript.lang ?? transcript.sentences.find((s) => s.language)?.language ?? null,
        sentences,
        status: "done",
        transcribedAt: (/* @__PURE__ */ new Date()).toISOString(),
        transcript: transcriptText(sentences)
      });
      return { progress: 100, status: "done", transcript: saved };
    },
    /** Statuses for several files at once (the Media Library list and the side panel). */
    async many(fileIds) {
      if (!fileIds.length) return {};
      const rows = await transcripts().findMany({ filters: { fileId: { $in: fileIds } }, limit: fileIds.length });
      return Object.fromEntries(rows.map((r) => [Number(r.fileId), pick(r)]));
    },
    /**
     * Follow every running job from the server, so a transcript is saved even when no
     * admin has the file open (autoTranscribe, a closed tab).
     */
    async pollAll() {
      const apiKey = await settings2().apiKey();
      if (!apiKey) return;
      const client = new VocalStackAPI(apiKey, settings2().options().apiURL);
      const running = await transcripts().findMany({ filters: { status: { $eq: "processing" } }, limit: 100 });
      for (const row of running) {
        const current = pick(row);
        if (!current.recordingId || !current.fileId) continue;
        try {
          const file = await strapi.db.query(FILE_UID).findOne({ where: { id: current.fileId } });
          if (file) await self.checkJob(client, file, current, current.recordingId);
        } catch (err) {
          strapi.log.debug(`[vocalstack] checking file ${current.fileId}: ${err.message}`);
        }
      }
    },
    /** The transcript goes with its file. */
    async forget(fileId) {
      const existing = await transcripts().findFirst({ filters: { fileId: { $eq: fileId } } });
      if (existing?.documentId) await transcripts().delete({ documentId: String(existing.documentId) });
    }
  };
  return self;
};
const base64url = (b) => b.toString("base64url");
const CONNECT_TTL_MS = 10 * 60 * 1e3;
const controller = ({ strapi }) => {
  const settings2 = () => strapi.plugin(PLUGIN_ID).service("settings");
  const transcriber2 = () => strapi.plugin(PLUGIN_ID).service("transcriber");
  const callbackURL = (ctx) => `${serverBase(strapi, ctx.request.origin)}/${PLUGIN_ID}/callback`;
  const fail = (ctx, status, error, code) => {
    ctx.status = status;
    ctx.body = code ? { code, error } : { error };
  };
  const route = (handler) => async (ctx) => {
    if (settings2().options().enabled === false) return fail(ctx, 404, "VocalStack is turned off (enabled: false).");
    try {
      await handler(ctx);
    } catch (err) {
      if (err instanceof RouteError) return fail(ctx, err.status, err.message, err.code);
      strapi.log.error(`[vocalstack] ${err.stack ?? err}`);
      fail(ctx, 500, err.message ?? String(err));
    }
  };
  const fileId = (ctx) => {
    const id = Number(ctx.params.fileId);
    if (!Number.isInteger(id) || id <= 0) throw new RouteError(400, "fileId is a Media Library file id.");
    return id;
  };
  const connection = async () => {
    const options2 = settings2().options();
    const common = { enabled: options2.enabled !== false, oneClickConnect: Boolean(options2.oneClickConnect) };
    if (options2.apiKey) return { ...common, connected: true, source: "options" };
    const stored = await settings2().read();
    return { ...common, account: stored.account ?? void 0, connected: Boolean(stored.apiKey), source: stored.apiKey ? "admin" : void 0 };
  };
  return {
    // Answers even when turned off, so the admin can say so.
    async connection(ctx) {
      ctx.body = await connection();
    },
    /** Paste a key (the fallback, and the way to connect until the dashboard ships /connect). */
    saveKey: route(async (ctx) => {
      const apiKey = ctx.request.body?.apiKey?.trim();
      if (!apiKey?.startsWith("vs_key_")) throw new RouteError(400, "A VocalStack API key starts with vs_key_.");
      try {
        const account = accountLabel(await new VocalStackAPI(apiKey, settings2().options().apiURL).me()) ?? null;
        await settings2().write({ account, apiKey });
      } catch (err) {
        throw new RouteError(400, err instanceof VocalStackAPIError && err.status === 401 ? "VocalStack refused that key." : String(err.message));
      }
      ctx.body = await connection();
    }),
    deleteKey: route(async (ctx) => {
      await settings2().write({ account: null, apiKey: null });
      ctx.body = await connection();
    }),
    /**
     * One-click connect, as OAuth 2.0 authorization code + PKCE (RFC 7636) whose
     * token is a VocalStack API key:
     *
     * 1. POST /vocalstack/connect   → state + verifier stored here; the admin opens
     *    {dashboard}/connect?response_type=code&redirect_uri=…&state=…&code_challenge=…
     * 2. The person clicks Authenticate on the dashboard, which redirects to
     *    /vocalstack/callback?code=…&state=…
     * 3. The callback redeems the code server-to-server at {api}/v1/connect/token with
     *    the verifier and stores the key it answers. The key never passes through a browser.
     */
    connect: route(async (ctx) => {
      const options2 = settings2().options();
      const state = base64url(randomBytes(24));
      const verifier = base64url(randomBytes(48));
      const challenge = base64url(createHash("sha256").update(verifier).digest());
      await settings2().write({
        connectAdmin: ctx.state.user?.id ?? null,
        connectExpiresAt: new Date(Date.now() + CONNECT_TTL_MS).toISOString(),
        connectState: state,
        connectVerifier: verifier
      });
      const site = new URL(serverBase(strapi, ctx.request.origin));
      const url = new URL("/connect", options2.dashboardURL);
      url.search = new URLSearchParams({
        client_name: `${site.host} (Strapi)`,
        code_challenge: challenge,
        code_challenge_method: "S256",
        redirect_uri: callbackURL(ctx),
        response_type: "code",
        scope: "read write",
        state
      }).toString();
      ctx.body = { url: url.toString() };
    }),
    /**
     * Where the dashboard sends the browser back. Strapi's admin signs requests with a
     * bearer token the redirect cannot carry, so this route is public: the state (random,
     * single-use, ten minutes, stored for the admin who clicked Connect) is what admits it.
     */
    async callback(ctx) {
      const page = (message, ok) => {
        ctx.status = ok ? 200 : 400;
        ctx.type = "text/html; charset=utf-8";
        ctx.set("cache-control", "no-store");
        ctx.set("content-security-policy", "default-src 'none'; img-src https://vocalstack.com; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
        ctx.body = callbackPage(message, ok);
      };
      const options2 = settings2().options();
      if (options2.enabled === false) return page("VocalStack is turned off in this Strapi.", false);
      const query = (k) => typeof ctx.query[k] === "string" ? ctx.query[k] : "";
      const stored = await settings2().read();
      const expected = stored.connectState ?? "";
      const state = query("state");
      const fresh = stored.connectExpiresAt && new Date(stored.connectExpiresAt).getTime() > Date.now();
      const matches = expected.length > 0 && state.length === expected.length && timingSafeEqual(Buffer.from(state), Buffer.from(expected));
      if (!matches || !fresh || !stored.connectVerifier) return page("This connect link has expired. Start again from the admin panel.", false);
      await settings2().write({ connectAdmin: null, connectExpiresAt: null, connectState: null, connectVerifier: null });
      if (query("error")) return page(query("error") === "access_denied" ? "Connection cancelled." : `VocalStack said: ${query("error_description") || query("error")}`, false);
      const res = await fetch(`${options2.apiURL}/v1/connect/token`, {
        body: new URLSearchParams({ code: query("code"), code_verifier: stored.connectVerifier, grant_type: "authorization_code", redirect_uri: callbackURL(ctx) }),
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        method: "POST"
      }).catch(() => void 0);
      const token = await res?.json().catch(() => ({})) ?? {};
      if (!res?.ok || !token.access_token) return page(`VocalStack did not issue a key: ${token.error_description ?? res?.status ?? "no answer"}`, false);
      const account = token.account?.name ?? accountLabel(await new VocalStackAPI(token.access_token, options2.apiURL).me().catch(() => ({}))) ?? null;
      await settings2().write({ account, apiKey: token.access_token });
      page(account ? `Connected to VocalStack as ${account}.` : "Connected to VocalStack.", true);
    },
    transcribe: route(async (ctx) => {
      const result = await transcriber2().start(fileId(ctx), ctx.request.origin);
      ctx.status = result.status === "processing" && result.progress === 0 ? 202 : 200;
      ctx.body = result;
    }),
    status: route(async (ctx) => {
      ctx.body = await transcriber2().status(fileId(ctx));
    }),
    stop: route(async (ctx) => {
      ctx.body = await transcriber2().stop(fileId(ctx));
    }),
    /** Audio in the Media Library, newest first, with each file's transcript. `?ids=1,2` for given files; `?page=` otherwise. */
    files: route(async (ctx) => {
      const pageSize = 20;
      const page = Math.max(1, Number(ctx.query.page) || 1);
      const ids = typeof ctx.query.ids === "string" ? ctx.query.ids.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0) : void 0;
      const where = ids ? { id: { $in: ids }, mime: { $startsWith: "audio/" } } : { mime: { $startsWith: "audio/" } };
      const query = strapi.db.query(FILE_UID);
      const [files, total] = await Promise.all([
        query.findMany({ limit: ids ? ids.length : pageSize, offset: ids ? 0 : (page - 1) * pageSize, orderBy: { createdAt: "desc" }, select: ["id", "documentId", "name", "mime", "size", "url", "createdAt"], where }),
        query.count({ where })
      ]);
      const transcripts = await transcriber2().many(files.map((f) => f.id));
      ctx.body = {
        files: files.map((f) => ({ ...f, transcript: transcripts[f.id] ?? null })),
        page,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        total
      };
    })
  };
};
const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function callbackPage(message, ok) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VocalStack</title>
<style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#131326}@media(prefers-color-scheme:dark){body{background:#131326;color:#eee}}main{text-align:center;padding:0 16px}main img{height:28px;width:auto}p{max-width:28rem;margin:24px auto 0}</style></head>
<body><main><picture><source media="(prefers-color-scheme: dark)" srcset="https://vocalstack.com/assets/logo-dark.svg"><img alt="VocalStack" height="28" src="https://vocalstack.com/assets/logo-light.svg"></picture><p>${escapeHTML(message)}${ok ? "<br><br>You can close this tab." : ""}</p></main>
<script>try{new BroadcastChannel('vocalstack').postMessage(${JSON.stringify({ ok, type: "connect" })})}catch(e){}${ok ? "setTimeout(function(){window.close()},1200)" : ""}<\/script></body></html>`;
}
const controllers = {
  // find / findOne / update for the content API (REST); enable them per role in Users & Permissions.
  transcript: factories.createCoreController(TRANSCRIPT_UID),
  vocalstack: controller
};
const destroy = () => {
  stopPolling();
};
const register = () => {
};
const authenticated = ["admin::isAuthenticatedAdmin"];
const can = (action) => [...authenticated, { name: "admin::hasPermissions", config: { actions: [`plugin::vocalstack.${action}`] } }];
const admin = {
  type: "admin",
  routes: [
    { method: "GET", path: "/connection", handler: "vocalstack.connection", config: { policies: authenticated } },
    { method: "POST", path: "/key", handler: "vocalstack.saveKey", config: { policies: can("settings") } },
    { method: "DELETE", path: "/key", handler: "vocalstack.deleteKey", config: { policies: can("settings") } },
    { method: "POST", path: "/connect", handler: "vocalstack.connect", config: { policies: can("settings") } },
    { method: "GET", path: "/callback", handler: "vocalstack.callback", config: { auth: false } },
    { method: "GET", path: "/files", handler: "vocalstack.files", config: { policies: can("transcribe") } },
    { method: "POST", path: "/transcribe/:fileId", handler: "vocalstack.transcribe", config: { policies: can("transcribe") } },
    { method: "POST", path: "/stop/:fileId", handler: "vocalstack.stop", config: { policies: can("transcribe") } },
    { method: "GET", path: "/status/:fileId", handler: "vocalstack.status", config: { policies: can("transcribe") } }
  ]
};
const contentAPI = {
  type: "content-api",
  routes: [
    { method: "GET", path: "/transcripts", handler: "transcript.find", config: { policies: [] } },
    { method: "GET", path: "/transcripts/:id", handler: "transcript.findOne", config: { policies: [] } },
    { method: "PUT", path: "/transcripts/:id", handler: "transcript.update", config: { policies: [] } }
  ]
};
const routes = {
  admin,
  "content-api": contentAPI
};
const settings = ({ strapi }) => {
  const store = () => strapi.store({ type: "plugin", name: PLUGIN_ID, key: "settings" });
  return {
    options() {
      const options2 = strapi.config.get(`plugin::${PLUGIN_ID}`) ?? {};
      return { ...options2, apiURL: options2.apiURL || DEFAULT_API_URL, dashboardURL: options2.dashboardURL || DEFAULT_DASHBOARD_URL };
    },
    async read() {
      return await store().get({}) ?? {};
    },
    async write(patch) {
      await store().set({ value: { ...await this.read(), ...patch } });
    },
    /** The key to call VocalStack with: the plugin option first, then a connected one. */
    async apiKey() {
      return this.options().apiKey || (await this.read()).apiKey || void 0;
    }
  };
};
const services = {
  settings,
  // The core service behind the content API's transcript controller.
  transcript: factories.createCoreService(TRANSCRIPT_UID),
  transcriber
};
const index = {
  bootstrap,
  config,
  contentTypes,
  controllers,
  destroy,
  register,
  routes,
  services
};
export {
  index as default
};
