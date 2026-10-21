import { Core } from '@strapi/strapi';
/** The slice of Koa's context the routes use. */
type Ctx = {
    body: unknown;
    params: Record<string, string>;
    query: Record<string, string | string[] | undefined>;
    request: {
        body?: unknown;
        origin: string;
    };
    set(field: string, value: string): void;
    state: {
        user?: {
            id: number | string;
        };
    };
    status: number;
    type: string;
};
declare const controller: ({ strapi }: {
    strapi: Core.Strapi;
}) => {
    connection(ctx: Ctx): Promise<void>;
    /** Paste a key (the fallback, and the way to connect until the dashboard ships /connect). */
    saveKey: (ctx: Ctx) => Promise<void>;
    deleteKey: (ctx: Ctx) => Promise<void>;
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
    connect: (ctx: Ctx) => Promise<void>;
    /**
     * Where the dashboard sends the browser back. Strapi's admin signs requests with a
     * bearer token the redirect cannot carry, so this route is public: the state (random,
     * single-use, ten minutes, stored for the admin who clicked Connect) is what admits it.
     */
    callback(ctx: Ctx): Promise<void>;
    transcribe: (ctx: Ctx) => Promise<void>;
    status: (ctx: Ctx) => Promise<void>;
    stop: (ctx: Ctx) => Promise<void>;
    /** Audio in the Media Library, newest first, with each file's transcript. `?ids=1,2` for given files; `?page=` otherwise. */
    files: (ctx: Ctx) => Promise<void>;
};
export default controller;
