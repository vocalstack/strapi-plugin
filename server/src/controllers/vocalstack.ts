import type { Core } from '@strapi/strapi'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import type { SettingsService } from '../services/settings'
import type { TranscriberService } from '../services/transcriber'

import { accountLabel, VocalStackAPI, VocalStackAPIError } from '../lib/api'
import { serverBase } from '../lib/fileSource'
import { type ConnectionResponse, FILE_UID, PLUGIN_ID, type UploadFile } from '../lib/types'
import { RouteError } from '../services/transcriber'

/** The slice of Koa's context the routes use. */
type Ctx = {
  body: unknown
  params: Record<string, string>
  query: Record<string, string | string[] | undefined>
  request: { body?: unknown; origin: string }
  set(field: string, value: string): void
  state: { user?: { id: number | string } }
  status: number
  type: string
}

const base64url = (b: Buffer) => b.toString('base64url')
const CONNECT_TTL_MS = 10 * 60 * 1000

const controller = ({ strapi }: { strapi: Core.Strapi }) => {
  const settings = () => strapi.plugin(PLUGIN_ID).service('settings') as SettingsService
  const transcriber = () => strapi.plugin(PLUGIN_ID).service('transcriber') as TranscriberService
  const callbackURL = (ctx: Ctx) => `${serverBase(strapi, ctx.request.origin)}/${PLUGIN_ID}/callback`

  const fail = (ctx: Ctx, status: number, error: string, code?: string) => {
    ctx.status = status
    ctx.body = code ? { code, error } : { error }
  }

  /** Run a route, answering a RouteError with its status. The `enabled: false` option turns every route off. */
  const route =
    (handler: (ctx: Ctx) => Promise<unknown>) =>
    async (ctx: Ctx): Promise<void> => {
      if (settings().options().enabled === false) return fail(ctx, 404, 'VocalStack is turned off (enabled: false).')
      try {
        await handler(ctx)
      } catch (err) {
        if (err instanceof RouteError) return fail(ctx, err.status, err.message, err.code)
        strapi.log.error(`[vocalstack] ${(err as Error).stack ?? err}`)
        fail(ctx, 500, (err as Error).message ?? String(err))
      }
    }

  const fileId = (ctx: Ctx) => {
    const id = Number(ctx.params.fileId)
    if (!Number.isInteger(id) || id <= 0) throw new RouteError(400, 'fileId is a Media Library file id.')
    return id
  }

  const connection = async (): Promise<ConnectionResponse> => {
    const options = settings().options()
    const common = { enabled: options.enabled !== false, oneClickConnect: Boolean(options.oneClickConnect) }
    if (options.apiKey) return { ...common, connected: true, source: 'options' }
    const stored = await settings().read()
    return { ...common, account: stored.account ?? undefined, connected: Boolean(stored.apiKey), source: stored.apiKey ? 'admin' : undefined }
  }

  return {
    // Answers even when turned off, so the admin can say so.
    async connection(ctx: Ctx) {
      ctx.body = await connection()
    },

    /** Paste a key (the fallback, and the way to connect until the dashboard ships /connect). */
    saveKey: route(async (ctx) => {
      const apiKey = (ctx.request.body as { apiKey?: string } | undefined)?.apiKey?.trim()
      if (!apiKey?.startsWith('vs_key_')) throw new RouteError(400, 'A VocalStack API key starts with vs_key_.')
      try {
        const account = accountLabel(await new VocalStackAPI(apiKey, settings().options().apiURL).me()) ?? null
        await settings().write({ account, apiKey })
      } catch (err) {
        throw new RouteError(400, err instanceof VocalStackAPIError && err.status === 401 ? 'VocalStack refused that key.' : String((err as Error).message))
      }
      ctx.body = await connection()
    }),

    deleteKey: route(async (ctx) => {
      await settings().write({ account: null, apiKey: null })
      ctx.body = await connection()
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
      const options = settings().options()
      const state = base64url(randomBytes(24))
      const verifier = base64url(randomBytes(48))
      const challenge = base64url(createHash('sha256').update(verifier).digest())
      await settings().write({
        connectAdmin: ctx.state.user?.id ?? null,
        connectExpiresAt: new Date(Date.now() + CONNECT_TTL_MS).toISOString(),
        connectState: state,
        connectVerifier: verifier,
      })

      const site = new URL(serverBase(strapi, ctx.request.origin))
      const url = new URL('/connect', options.dashboardURL)
      url.search = new URLSearchParams({
        client_name: `${site.host} (Strapi)`,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: callbackURL(ctx),
        response_type: 'code',
        scope: 'read write',
        state,
      }).toString()
      ctx.body = { url: url.toString() }
    }),

    /**
     * Where the dashboard sends the browser back. Strapi's admin signs requests with a
     * bearer token the redirect cannot carry, so this route is public: the state (random,
     * single-use, ten minutes, stored for the admin who clicked Connect) is what admits it.
     */
    async callback(ctx: Ctx) {
      const page = (message: string, ok: boolean) => {
        ctx.status = ok ? 200 : 400
        ctx.type = 'text/html; charset=utf-8'
        ctx.set('cache-control', 'no-store')
        // Strapi's security middleware forbids inline scripts and outside images; this page needs both.
        ctx.set('content-security-policy', "default-src 'none'; img-src https://vocalstack.com; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
        ctx.body = callbackPage(message, ok)
      }
      const options = settings().options()
      if (options.enabled === false) return page('VocalStack is turned off in this Strapi.', false)
      const query = (k: string) => (typeof ctx.query[k] === 'string' ? (ctx.query[k] as string) : '')
      const stored = await settings().read()
      const expected = stored.connectState ?? ''
      const state = query('state')
      const fresh = stored.connectExpiresAt && new Date(stored.connectExpiresAt).getTime() > Date.now()
      const matches = expected.length > 0 && state.length === expected.length && timingSafeEqual(Buffer.from(state), Buffer.from(expected))

      if (!matches || !fresh || !stored.connectVerifier) return page('This connect link has expired. Start again from the admin panel.', false)
      await settings().write({ connectAdmin: null, connectExpiresAt: null, connectState: null, connectVerifier: null })
      if (query('error')) return page(query('error') === 'access_denied' ? 'Connection cancelled.' : `VocalStack said: ${query('error_description') || query('error')}`, false)

      const res = await fetch(`${options.apiURL}/v1/connect/token`, {
        body: new URLSearchParams({ code: query('code'), code_verifier: stored.connectVerifier, grant_type: 'authorization_code', redirect_uri: callbackURL(ctx) }),
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      }).catch(() => undefined)
      const token = ((await res?.json().catch(() => ({}))) ?? {}) as { access_token?: string; account?: { name?: string }; error_description?: string }
      if (!res?.ok || !token.access_token) return page(`VocalStack did not issue a key: ${token.error_description ?? res?.status ?? 'no answer'}`, false)

      const account = token.account?.name ?? accountLabel(await new VocalStackAPI(token.access_token, options.apiURL).me().catch(() => ({}))) ?? null
      await settings().write({ account, apiKey: token.access_token })
      page(account ? `Connected to VocalStack as ${account}.` : 'Connected to VocalStack.', true)
    },

    transcribe: route(async (ctx) => {
      const result = await transcriber().start(fileId(ctx), ctx.request.origin)
      ctx.status = result.status === 'processing' && result.progress === 0 ? 202 : 200
      ctx.body = result
    }),

    status: route(async (ctx) => {
      ctx.body = await transcriber().status(fileId(ctx))
    }),

    stop: route(async (ctx) => {
      ctx.body = await transcriber().stop(fileId(ctx))
    }),

    /** Audio in the Media Library, newest first, with each file's transcript. `?ids=1,2` for given files; `?page=` otherwise. */
    files: route(async (ctx) => {
      const pageSize = 20
      const page = Math.max(1, Number(ctx.query.page) || 1)
      const ids = typeof ctx.query.ids === 'string' ? ctx.query.ids.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) : undefined
      const where = ids ? { id: { $in: ids }, mime: { $startsWith: 'audio/' } } : { mime: { $startsWith: 'audio/' } }
      const query = strapi.db.query(FILE_UID)
      const [files, total] = await Promise.all([
        query.findMany({ limit: ids ? ids.length : pageSize, offset: ids ? 0 : (page - 1) * pageSize, orderBy: { createdAt: 'desc' }, select: ['id', 'documentId', 'name', 'mime', 'size', 'url', 'createdAt'], where }),
        query.count({ where }),
      ])
      const transcripts = await transcriber().many((files as UploadFile[]).map((f) => f.id))
      ctx.body = {
        files: (files as UploadFile[]).map((f) => ({ ...f, transcript: transcripts[f.id] ?? null })),
        page,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        total,
      }
    }),
  }
}

const escapeHTML = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** The tab the dashboard sends back to: tell the admin tab, then close. */
function callbackPage(message: string, ok: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VocalStack</title>
<style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#131326}@media(prefers-color-scheme:dark){body{background:#131326;color:#eee}}main{text-align:center;padding:0 16px}main img{height:28px;width:auto}p{max-width:28rem;margin:24px auto 0}</style></head>
<body><main><picture><source media="(prefers-color-scheme: dark)" srcset="https://vocalstack.com/assets/logo-dark.svg"><img alt="VocalStack" height="28" src="https://vocalstack.com/assets/logo-light.svg"></picture><p>${escapeHTML(message)}${ok ? '<br><br>You can close this tab.' : ''}</p></main>
<script>try{new BroadcastChannel('vocalstack').postMessage(${JSON.stringify({ ok, type: 'connect' })})}catch(e){}${ok ? 'setTimeout(function(){window.close()},1200)' : ''}</script></body></html>`
}

export default controller
