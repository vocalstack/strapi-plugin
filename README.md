# @vocalstack/strapi

VocalStack for [Strapi](https://strapi.io) 5: a **Transcribe** button on every audio file. The transcript is saved as a Transcript entry: text plus timed sentences.

Read more about the [VocalStack transcription plugin for Strapi](https://vocalstack.com/strapi-transcription-plugin/) on the [VocalStack website](https://vocalstack.com/).

## Install

```sh
npm i @vocalstack/strapi
```

```ts
// config/plugins.ts
export default ({ env }) => ({
  vocalstack: {
    config: {
      // Optional. Without it, connect from Settings → VocalStack.
      apiKey: env('VOCALSTACK_API_KEY'),
    },
  },
})
```

Then rebuild the admin (`npm run build`, or restart `npm run develop`). The plugin adds a `vocalstack_transcripts` table, which Strapi creates on the next start.

Super Admins can use everything. For other roles, tick **Settings → Roles → Plugins → VocalStack → Transcribe audio** and, to change the connection, **Settings → VocalStack → Connect a VocalStack account**.

## What it adds

- **A VocalStack panel** in the Content Manager's edit view, beside every entry that holds audio (`audio/*` media at any depth: components, dynamic zones and repeatables are looked through). It lists each audio file with a **Transcribe** button. The button shows progress and survives a reload mid-job, and **Stop** ends a job you no longer want: the transcript goes back to how it was (an earlier transcript stays), and VocalStack keeps what it transcribed before the stop.
- **Settings → VocalStack**, where an admin connects VocalStack and sees which **workspace** the plugin works in (its name and icon), and below it **Audio in the Media Library**: every audio file, newest first, each with its own Transcribe button. The key is stored server-side (Strapi's core store) and never sent back to the admin.
- **A Transcript collection type** (`plugin::vocalstack.transcript`), one entry per transcribed file, listed under **Content Manager → Transcript**:
  - `transcript`: text you can edit; paragraphs break on a speaker change or a pause.
  - `sentences`: `[{ start, end, speaker, text }]` in seconds.
  - `file` (the media), `fileId`, `fileName`, `status` (`idle`, `processing`, `done`, `failed`), `language`, `error`, `recordingId` and `transcriptionId` (where the saved transcript came from), `jobRecordingId` and `jobTranscriptionId` (the running job's, while `processing`) and `transcribedAt`.
  - It is deleted with its file.
- **Admin routes** (signed with the admin's token): `POST /vocalstack/transcribe/:fileId`, `POST /vocalstack/stop/:fileId`, `GET /vocalstack/status/:fileId`, `GET /vocalstack/files`, `GET /vocalstack/connection` (`{ connected, source, account, workspace: { id, name, personal, iconUrl } }`; `?check=1` asks VocalStack for the workspace again and gives its icon as a `data:` URL, which Strapi's default content security policy allows), and the connect routes below.

### The workspace

A VocalStack API key belongs to one workspace: every transcription the plugin makes lands in that workspace and uses its credit. **Settings → VocalStack** shows the workspace of the key in use, whether it was connected with one click, pasted, or set in `config/plugins`, and asks VocalStack again each time the page opens, so a new name or icon made in the dashboard shows up.

- With `oneClickConnect`, **Change** beside the workspace opens VocalStack again: pick another workspace on the consent screen and click **Authenticate**. The plugin gets a new key for that workspace and switches to it; if you cancel, the connection stays as it was. The old key keeps working until you revoke it in VocalStack under **Developers → API keys**.
- With a pasted key, **Disconnect** and paste a key made in the other workspace. With `apiKey` in `config/plugins`, change the key there.
- Transcripts already saved in Strapi stay. A job that was still running in the old workspace cannot be followed with the new key: its file says so, and **Transcribe** makes it again in the new workspace.

**The Media Library itself.** Strapi 5's Media Library has no extension point for other plugins, so the button can't sit in the file's details dialog. Use the panel on the entry, the list in Settings → VocalStack, or `autoTranscribe: true` to transcribe every audio upload as it arrives.

### Reading transcripts

**REST.** `GET /api/vocalstack/transcripts`, `GET /api/vocalstack/transcripts/:documentId` and `PUT /api/vocalstack/transcripts/:documentId`. They are closed until you allow them: **Settings → Users & Permissions → Roles → (role) → Vocalstack → transcript** (`find`, `findOne`, `update`), or use an API token. The usual parameters work:

```
GET /api/vocalstack/transcripts?filters[fileId][$eq]=12&fields[0]=transcript&fields[1]=sentences&populate[file][fields][0]=url
```

**GraphQL** (with `@strapi/plugin-graphql`): `vocalstackTranscripts` and `vocalstackTranscript`, plus `updateVocalstackTranscript` (and Strapi's generated create and delete mutations), under the same role permissions.

```graphql
{
  vocalstackTranscripts(filters: { fileId: { eq: 12 } }) {
    transcript
    sentences
    language
    file { url }
  }
}
```

## Options

| Option | Default | |
|---|---|---|
| `apiKey` | none | A `vs_key_…` key with Read and Write. It wins over a key connected in the admin. |
| `spokenLanguage` | auto-detect | A Whisper language code (`en`, `ro`, …). |
| `fileURL` | the file's `url`, made absolute | `({ file, strapi }) => string`: the address VocalStack fetches. Point it at your CDN or bucket's public URL. |
| `autoTranscribe` | `false` | Transcribe every audio file as it is uploaded to the Media Library. |
| `oneClickConnect` | `false` | Show **Connect VocalStack**, and **Change** beside the connected workspace (see below). |
| `apiURL` / `dashboardURL` | `https://api.vocalstack.com` / `https://app.vocalstack.com` | |
| `enabled` | `true` | `false` keeps the Transcript type and its entries but removes the panel and turns the routes off. (Strapi's own `vocalstack: { enabled: false }` removes the plugin altogether.) |

**How the audio reaches VocalStack.** If the file has a public address, VocalStack fetches it (`POST /v1/transcriptions { url }`); with a private upload provider (a private bucket) that is a signed link. Otherwise (localhost, a private network) the plugin uploads the bytes, read from `public/uploads` for the local provider. Either way the job runs on VocalStack: the admin polls every 3 s while the panel is open, and the server checks running jobs every 10 s, so a transcript lands even with nobody watching. The account is billed per second, with a 5-minute minimum per transcription.

## One-click connect (protocol)

The alternative to pasting a key: **Connect VocalStack** opens the dashboard in a new tab, the person picks a workspace and clicks **Authenticate**, and the tab closes. **Change** beside the connected workspace runs the same flow again and swaps the stored key for the new one only once VocalStack has issued it. This is OAuth 2.0 authorization code + PKCE (RFC 7636) with an API key as the access token. There is no client registration: the consent screen shows the `redirect_uri` host instead.

```
Strapi admin                        Strapi server                      app.vocalstack.com / api.vocalstack.com
────────────                        ─────────────                      ───────────────────────────────────────
click Connect ── POST /vocalstack/connect ─▶ state, verifier (10 min)
◀──────────── { url } ──────────────
new tab ─▶ GET app/connect?response_type=code&client_name=…&redirect_uri=…&state=…
                                    &code_challenge=…&code_challenge_method=S256&scope=read write
           (sign in if needed; pick the workspace; "example.com wants to transcribe with VocalStack")
           click Authenticate ─▶ API stores a single-use grant (code hash, challenge, redirect, scopes, principal; 2 min)
           ◀── 302 redirect_uri?code=…&state=…
tab ─────── GET /vocalstack/callback ─▶ check state (single-use, 10 min)
                                    POST api/v1/connect/token (form) ─▶ grant_type=authorization_code, code,
                                                                        code_verifier, redirect_uri
                                                                        verify, burn the code, create the key
                                    ◀── { access_token: "vs_key_…", token_type: "api_key", key_id, account: { name },
                                          workspace: { id, name, personal, iconUrl } }
                                    stores the key (never sent to a browser) and its workspace
tab: "Connected", BroadcastChannel('vocalstack') ─▶ admin refreshes; tab closes
```

Strapi's admin signs its requests with a bearer token that a redirect cannot carry, so the callback is a public route: the state, random, single-use and stored server-side by the admin who clicked Connect, is what admits it. `redirect_uri` is `server.url` (or the address the admin used) + `/vocalstack/callback`; set `server.url` when Strapi runs behind a proxy. Cancel redirects with `?error=access_denied&state=…`. The key appears in the dashboard's API keys list as `example.com (Strapi)`, where it can be revoked.

## Issues and support

Found a bug or want a feature? [Open an issue](https://github.com/vocalstack/strapi-plugin/issues) with your Strapi version, the plugin version and what you saw. For questions about your VocalStack account or billing, use [vocalstack.com/contact](https://vocalstack.com/contact/).
