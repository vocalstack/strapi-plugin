import { jsxs, jsx } from "react/jsx-runtime";
import { Flex, Typography, Button, Box, ProgressBar, Link, LinkButton } from "@strapi/design-system";
import { useFetchClient, useNotification, useRBAC } from "@strapi/strapi/admin";
import { Link as Link$1 } from "react-router-dom";
import { useState, useCallback, useEffect, useRef } from "react";
const PLUGIN_ID = "vocalstack";
const PERMISSIONS = {
  settings: [{ action: "plugin::vocalstack.settings", subject: null }],
  transcribe: [{ action: "plugin::vocalstack.transcribe", subject: null }]
};
function errorMessage(err) {
  const body = err?.response?.data;
  const error = body?.error;
  if (typeof error === "string") return error;
  return error?.message === "Policy Failed" ? "You may not do that. Ask an administrator for the VocalStack permissions." : error?.message ?? err?.message ?? String(err);
}
function errorCode(err) {
  return err?.response?.data?.code;
}
function useConnection() {
  const { get, post } = useFetchClient();
  const [connection, setConnection] = useState();
  const [connecting, setConnecting] = useState(false);
  const refresh = useCallback(
    () => get("/vocalstack/connection").then(
      (res) => setConnection(res.data),
      () => setConnection({ connected: false, enabled: false, oneClickConnect: false })
    ),
    [get]
  );
  useEffect(() => {
    void refresh();
    let channel;
    try {
      channel = new BroadcastChannel("vocalstack");
      channel.onmessage = (e) => {
        if (e.data?.type === "connect") {
          setConnecting(false);
          void refresh();
        }
      };
    } catch {
    }
    return () => channel?.close();
  }, [refresh]);
  useEffect(() => {
    if (!connecting) return;
    const onFocus = () => void refresh().then(() => setConnecting(false));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [connecting, refresh]);
  const connect = useCallback(async () => {
    const tab = window.open("about:blank", "_blank");
    setConnecting(true);
    try {
      const { data } = await post("/vocalstack/connect");
      if (tab) tab.location.href = data.url;
      else window.location.href = data.url;
    } catch (err) {
      tab?.close();
      setConnecting(false);
      throw new Error(errorMessage(err));
    }
  }, [post]);
  return { connect, connecting, connection, refresh, setConnection };
}
const POLL_MS = 3e3;
const clock = (s) => {
  const t = Math.floor(s);
  const [h, m, sec] = [Math.floor(t / 3600), Math.floor(t % 3600 / 60), t % 60];
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(sec).padStart(2, "0")}`;
};
const PHASES = {
  extracting: "Extracting audio",
  fetching: "Fetching the file",
  queued: "Queued",
  transcribing: "Transcribing"
};
const transcriptPath = (documentId) => `/content-manager/collection-types/plugin::vocalstack.transcript/${documentId}`;
const FileTranscriber = ({ file, initial, showName }) => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [transcript, setTranscript] = useState(initial ?? void 0);
  const [loaded, setLoaded] = useState(initial !== void 0);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState();
  const timer = useRef();
  const alive = useRef(true);
  const finish = useCallback(
    (res) => {
      setTranscript(res.transcript);
      setBusy(false);
      if (res.stopped) toggleNotification({ message: "Transcription stopped.", type: "info" });
      else if (res.status === "done") toggleNotification({ message: `Transcript ready: ${file.name ?? "audio"}.`, type: "success" });
      if (res.status === "failed") setError(res.error);
    },
    [file.name, toggleNotification]
  );
  const poll = useCallback(async () => {
    clearTimeout(timer.current);
    if (!alive.current) return;
    try {
      const { data } = await get(`/vocalstack/status/${file.id}`);
      if (!alive.current) return;
      if (data.status === "processing") {
        setBusy(true);
        setProgress({ audio: data.audio, pct: data.progress, phase: data.phase });
        if (data.transcript) setTranscript(data.transcript);
        timer.current = setTimeout(poll, POLL_MS);
        return;
      }
      finish(data);
    } catch (err) {
      if (err.response) {
        setBusy(false);
        setError(errorMessage(err));
      } else timer.current = setTimeout(poll, POLL_MS * 2);
    }
  }, [file.id, finish, get]);
  useEffect(() => {
    alive.current = true;
    if (initial === void 0) {
      get(`/vocalstack/status/${file.id}`).then(
        ({ data }) => {
          setTranscript(data.transcript);
          setLoaded(true);
          if (data.status === "processing") {
            setBusy(true);
            setProgress({ audio: data.audio, pct: data.progress, phase: data.phase });
            timer.current = setTimeout(poll, POLL_MS);
          } else if (data.status === "failed") setError(data.transcript?.error ?? void 0);
        },
        (err) => {
          setLoaded(true);
          setError(errorMessage(err));
        }
      );
    } else if (initial?.status === "processing") {
      setBusy(true);
      void poll();
    }
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, [file.id]);
  const transcribe = async () => {
    setError(void 0);
    setBusy(true);
    setStarting(true);
    setProgress({});
    try {
      const { data } = await post(`/vocalstack/transcribe/${file.id}`);
      if (data.transcript) setTranscript(data.transcript);
      setProgress({ pct: data.progress, phase: data.phase });
      timer.current = setTimeout(poll, POLL_MS);
    } catch (err) {
      setBusy(false);
      setError(errorCode(err) === "not_connected" ? `${errorMessage(err)} (Settings → VocalStack)` : errorMessage(err));
    } finally {
      setStarting(false);
    }
  };
  const stop = async () => {
    if (!window.confirm("Stop transcribing? What VocalStack has transcribed so far stays in your VocalStack dashboard.")) return;
    setStopping(true);
    try {
      const { data } = await post(`/vocalstack/stop/${file.id}`);
      if (data.status === "processing") return;
      clearTimeout(timer.current);
      finish(data);
    } catch (err) {
      toggleNotification({ message: errorMessage(err), type: "danger" });
    } finally {
      setStopping(false);
    }
  };
  const status = transcript?.status;
  const shownError = error ?? (status === "failed" ? transcript?.error ?? void 0 : void 0);
  return /* @__PURE__ */ jsxs(Flex, { alignItems: "stretch", direction: "column", gap: 2, width: "100%", children: [
    showName && /* @__PURE__ */ jsx(Typography, { ellipsis: true, fontWeight: "semiBold", textColor: "neutral800", title: file.name ?? void 0, variant: "omega", children: file.name ?? `File ${file.id}` }),
    !busy && /* @__PURE__ */ jsx(Flex, { gap: 2, wrap: "wrap", children: /* @__PURE__ */ jsx(Button, { disabled: !loaded, onClick: transcribe, size: "S", variant: status === "done" ? "secondary" : "default", children: status === "done" ? "Transcribe again" : "Transcribe" }) }),
    busy && /* @__PURE__ */ jsxs(Box, { children: [
      /* @__PURE__ */ jsxs(Typography, { textColor: "neutral600", variant: "pi", children: [
        PHASES[progress.phase ?? "queued"] ?? progress.phase,
        progress.pct ? ` · ${progress.pct}%` : "…",
        progress.audio?.totalS ? ` · ${clock(progress.audio.processedS)} of ${clock(progress.audio.totalS)}` : ""
      ] }),
      /* @__PURE__ */ jsx(Box, { paddingBottom: 2, paddingTop: 1, children: /* @__PURE__ */ jsx(ProgressBar, { size: "S", value: progress.pct ?? 2 }) }),
      /* @__PURE__ */ jsx(Button, { disabled: stopping || starting, onClick: stop, size: "S", variant: "tertiary", children: stopping ? "Stopping…" : "Stop" })
    ] }),
    !busy && status === "done" && !shownError && /* @__PURE__ */ jsxs(Typography, { textColor: "neutral600", variant: "pi", children: [
      "Transcribed",
      transcript?.language ? ` (${transcript.language})` : "",
      ".",
      " ",
      transcript?.documentId && /* @__PURE__ */ jsx(Link, { tag: Link$1, to: transcriptPath(transcript.documentId), children: "Open the transcript" })
    ] }),
    shownError && /* @__PURE__ */ jsx(Typography, { textColor: "danger600", variant: "pi", children: shownError })
  ] });
};
function audioFiles(value, found = /* @__PURE__ */ new Map(), depth = 0) {
  if (value && typeof value === "object" && depth < 12) {
    if (Array.isArray(value)) value.forEach((v) => audioFiles(v, found, depth + 1));
    else {
      const v = value;
      if (typeof v.mime === "string" && typeof v.id === "number" && "url" in v) {
        if (v.mime.startsWith("audio/")) found.set(v.id, { id: v.id, mime: v.mime, name: v.name, url: v.url });
      } else Object.values(v).forEach((x) => audioFiles(x, found, depth + 1));
    }
  }
  return [...found.values()];
}
const PanelContent = ({ connection, connect, connecting, files }) => /* @__PURE__ */ jsx(Flex, { alignItems: "stretch", direction: "column", gap: 4, width: "100%", children: !connection.connected ? connection.oneClickConnect ? /* @__PURE__ */ jsx(Flex, { alignItems: "flex-start", direction: "column", gap: 2, children: /* @__PURE__ */ jsx(LinkButton, { disabled: connecting, onClick: () => void connect().catch(() => void 0), size: "S", tag: "button", variant: "secondary", children: connecting ? "Waiting for VocalStack…" : "Connect VocalStack" }) }) : /* @__PURE__ */ jsx(LinkButton, { size: "S", tag: Link$1, to: "/settings/vocalstack", variant: "secondary", children: "Connect VocalStack" }) : files.map((file) => /* @__PURE__ */ jsx(FileTranscriber, { file, showName: files.length > 1 }, file.id)) });
const TranscribePanel = ({ document }) => {
  const { allowedActions, isLoading } = useRBAC({ transcribe: PERMISSIONS.transcribe });
  const { connect, connecting, connection } = useConnection();
  const files = audioFiles(document);
  if (!files.length || isLoading || !allowedActions.canTranscribe || !connection?.enabled) return null;
  return {
    title: "VocalStack",
    content: /* @__PURE__ */ jsxs(Flex, { alignItems: "stretch", direction: "column", gap: 3, width: "100%", children: [
      /* @__PURE__ */ jsx(PanelContent, { connect, connecting, connection, files }),
      connection.connected && /* @__PURE__ */ jsx(Typography, { textColor: "neutral600", variant: "pi", children: "A file added since the last save shows here once the entry is saved." })
    ] })
  };
};
const plugin = {
  register(app) {
    app.registerPlugin({ id: PLUGIN_ID, name: "VocalStack" });
    app.addSettingsLink("global", {
      id: PLUGIN_ID,
      to: PLUGIN_ID,
      intlLabel: { id: `${PLUGIN_ID}.settings.link`, defaultMessage: "VocalStack" },
      permissions: PERMISSIONS.settings,
      Component: () => import("./Settings-DeftinzX.mjs")
    });
  },
  bootstrap(app) {
    const apis = app.getPlugin("content-manager").apis;
    apis.addEditViewSidePanel?.([TranscribePanel]);
  },
  async registerTrads() {
    return [];
  }
};
export {
  FileTranscriber as F,
  PERMISSIONS as P,
  errorMessage as e,
  plugin as p,
  useConnection as u
};
