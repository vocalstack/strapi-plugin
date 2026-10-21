# End-to-end test

`strapi.spec.mjs` drives a real Strapi 5 admin in Chromium against a real VocalStack: no mocks, no clicks by hand. It is a plain Node script on the `playwright` library (no test runner).

## What it checks

| Step (`STEPS`) | |
|---|---|
| `settings` | Settings → VocalStack: a wrong key is refused, a pasted `VS_API_KEY` connects. Skipped when the key comes from `config/plugins` (the page then only says so). |
| `transcribe` | Uploads `AUDIO_FILE` (a fresh copy under a unique name) through the Media Library, creates an Episode with it, clicks **Transcribe** in the VocalStack panel, sees progress, reloads mid-job and sees the job picked back up, waits for done, checks the transcript reads as English, and reads it over REST with `STRAPI_API_TOKEN`. |
| `stop` | **Transcribe again**, then **Stop**: the entry goes back to the first transcript and stays there. Needs `transcribe` in the same run. |
| `auto` | With `autoTranscribe: true`, a second upload gets a transcript with no click (saved by the server's poller, with no admin page open). |

Screenshots of each step land in `SHOTS_DIR`. The exit code is 0 only when every step passed.

## Needs

- A Strapi 5 app with this plugin, an **Episode** collection type (`api::episode.episode`: `title` string, `audio` single media), and a full-access API token.
- The plugin connected to a VocalStack (`apiURL`, plus `apiKey` in config or a key pasted in the `settings` step).
- `autoTranscribe` **off** for `transcribe`/`stop` (the step fails if an upload starts a job by itself) and **on** for `auto`. The test app reads it from `VOCALSTACK_AUTO_TRANSCRIBE`, so `auto` is a second run after a restart.
- `playwright` resolvable from this repo, or from `PLAYWRIGHT_DIR`.

## Environment

| Variable | |
|---|---|
| `STRAPI_URL` | Default `http://localhost:1337` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | A Super Admin. Strapi rate-limits admin logins (about 5 in 5 minutes); each run logs in once. |
| `AUDIO_FILE` | A short English speech clip (the plausible-English check wants 8+ words). |
| `STRAPI_API_TOKEN` | Full-access Strapi API token |
| `VS_API_KEY` | Optional: the key the `settings` step pastes |
| `STEPS` | Default `settings,transcribe,stop` |
| `SHOTS_DIR` | Default `./e2e-shots` |
| `CHROMIUM_PATH`, `PLAYWRIGHT_DIR`, `HEADED=1`, `JOB_TIMEOUT_MS` (default 300000) | |

## Run

```sh
STRAPI_URL=http://localhost:1337 ADMIN_EMAIL=… ADMIN_PASSWORD=… AUDIO_FILE=./clip.mp3 STRAPI_API_TOKEN=… \
  node e2e/strapi.spec.mjs

# then, with Strapi restarted on VOCALSTACK_AUTO_TRANSCRIBE=true:
STEPS=auto … node e2e/strapi.spec.mjs
```

Against a VocalStack that refuses private addresses (any local one), Strapi on localhost sends the file's bytes (upload mode) rather than its URL.
