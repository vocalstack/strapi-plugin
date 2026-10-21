// End-to-end test of the plugin in a real Strapi 5 admin, against a real VocalStack.
// Plain Node + the playwright library (no test runner): `node e2e/strapi.spec.mjs`. See e2e/README.md.

import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

const env = (k, fallback) => {
  const v = process.env[k] ?? fallback
  if (v === undefined) throw new Error(`Set ${k} (see e2e/README.md).`)
  return v
}

const STRAPI_URL = env('STRAPI_URL', 'http://localhost:1337').replace(/\/$/, '')
const ADMIN_EMAIL = env('ADMIN_EMAIL')
const ADMIN_PASSWORD = env('ADMIN_PASSWORD')
const AUDIO_FILE = env('AUDIO_FILE')
const API_TOKEN = env('STRAPI_API_TOKEN') // a full-access Strapi API token
const VS_API_KEY = process.env.VS_API_KEY // optional: tests Settings → VocalStack's paste-a-key form
const VS_API_URL = process.env.VS_API_URL?.replace(/\/$/, '') // optional, with VS_API_KEY: stops a job on VocalStack's side, as the dashboard would
const SHOTS = env('SHOTS_DIR', path.resolve('e2e-shots'))
const STEPS = env('STEPS', 'settings,transcribe,stop').split(',').map((s) => s.trim())
const JOB_TIMEOUT = Number(env('JOB_TIMEOUT_MS', '300000'))
const HEADED = process.env.HEADED === '1'

// playwright from this repo's node_modules, or from PLAYWRIGHT_DIR (a folder that has it installed).
const require = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(path.resolve(process.env.PLAYWRIGHT_DIR), 'x.js') : import.meta.url)
const { chromium } = require('playwright')

const ENGLISH = new Set('a about all an and are as at be but by can do for from have he here i if in is it its just know like me my not of on one or our so that the there they this to was we what when will with you your'.split(' '))

/** Real words, and plausibly English: enough words, a share of them common English ones. */
function plausibleEnglish(text) {
  const words = (text ?? '').toLowerCase().match(/[a-z']+/g) ?? []
  const common = words.filter((w) => ENGLISH.has(w)).length
  return { common, ok: words.length >= 8 && common >= 3 && common / words.length >= 0.15, words: words.length }
}

const results = []
let shotN = 0
// A run of only `auto` keeps the screenshots of the run before it.
const SHOT_PREFIX = STEPS.join() === 'auto' ? 'auto-' : ''
const shot = async (page, name) => {
  const file = path.join(SHOTS, `${SHOT_PREFIX}${String(++shotN).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ fullPage: true, path: file })
  return file
}
const step = async (name, fn) => {
  const t0 = Date.now()
  try {
    const note = await fn()
    results.push({ name, note: note ?? '', ok: true, s: (Date.now() - t0) / 1000 })
    console.log(`PASS ${name}${note ? `: ${note}` : ''}`)
  } catch (err) {
    results.push({ name, note: err.message, ok: false, s: (Date.now() - t0) / 1000 })
    console.log(`FAIL ${name}: ${err.stack ?? err}`)
    throw err
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message)
}

/** Strapi's REST API with the API token. */
async function rest(p) {
  const res = await fetch(`${STRAPI_URL}${p}`, { headers: { authorization: `Bearer ${API_TOKEN}` } })
  const body = await res.json().catch(() => undefined)
  if (!res.ok) throw new Error(`GET ${p}: ${res.status} ${JSON.stringify(body)}`)
  return body
}
const transcriptOf = async (fileId) => (await rest(`/api/vocalstack/transcripts?filters[fileId][$eq]=${fileId}`)).data[0]
async function waitFor(fn, { every = 2000, message, timeout = JOB_TIMEOUT }) {
  const end = Date.now() + timeout
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error(message)
    await new Promise((r) => setTimeout(r, every))
  }
}

/** A copy of the clip under a name no earlier run used, so the run finds its own file. */
async function freshCopy(tag) {
  const dir = await mkdtemp(path.join(tmpdir(), 'vs-strapi-e2e-'))
  const ext = path.extname(AUDIO_FILE) || '.mp3'
  const file = path.join(dir, `${path.basename(AUDIO_FILE, ext)}-${tag}-${Date.now().toString(36)}${ext}`)
  await copyFile(AUDIO_FILE, file)
  return file
}

async function login(page) {
  await page.goto(`${STRAPI_URL}/admin/auth/login`)
  await page.fill('input[name=email]', ADMIN_EMAIL)
  await page.fill('input[name=password]', ADMIN_PASSWORD)
  await page.click('button[type=submit]')
  const limited = page.getByText(/too many requests/i)
  await page.waitForURL((u) => !u.pathname.includes('/auth/'), { timeout: 15000 }).catch(async (err) => {
    throw (await limited.isVisible()) ? new Error("Strapi's login rate limit answered Too many requests; wait a few minutes") : err
  })
  await page.getByRole('link', { name: /content manager/i }).first().waitFor({ timeout: 30000 })
}

/** Media Library → Add new assets → the file → Upload. Answers the new file's REST row. */
async function uploadThroughMediaLibrary(page, file) {
  const name = path.basename(file)
  await page.goto(`${STRAPI_URL}/admin/plugins/upload`)
  const legacy = page.getByRole('button', { name: /add new assets/i }).first() // Media Library before 5.5x
  const revamped = page.getByRole('button', { name: /^new$/i }).first() // the revamped one: New → File upload
  await legacy.or(revamped).waitFor({ timeout: 30000 })
  if (await revamped.isVisible()) {
    await revamped.click()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { exact: true, name: 'File upload' }).click()])
    await chooser.setFiles(file)
    await page.getByText(/upload successful/i).first().waitFor({ timeout: 60000 })
  } else {
    await legacy.click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles(file)
    await dialog.getByRole('button', { name: /upload 1 asset/i }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 60000 })
  }
  await page.getByText(name).first().waitFor({ timeout: 30000 })
  const row = await waitFor(async () => (await rest(`/api/upload/files?filters[name][$eq]=${encodeURIComponent(name)}`))[0], { message: `${name} is not in the Media Library`, timeout: 15000 })
  assert(row.mime?.startsWith('audio/'), `uploaded as ${row.mime}, not audio`)
  return row
}

async function createEpisode(page, title, fileName) {
  await page.goto(`${STRAPI_URL}/admin/content-manager/collection-types/api::episode.episode/create`)
  await page.locator('input[name=title]').fill(title)
  await page.getByText(/click to add an asset/i).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: /browse/i }).waitFor()
  // Search the library for this run's file, then tick it.
  const search = dialog.getByRole('button', { name: /search/i }).first()
  if (await search.isVisible().catch(() => false)) {
    await search.click()
    const box = dialog.locator('input[name=search], input[type=search], [role=searchbox]').first()
    await box.fill(fileName)
    await box.press('Enter')
  }
  const card = dialog.locator('article', { hasText: fileName }).first()
  await card.waitFor({ timeout: 30000 })
  await card.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: /^finish$/i }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: /^save$/i }).click()
  await page.waitForURL((u) => !u.pathname.endsWith('/create'), { timeout: 30000 })
  const documentId = page.url().split('?')[0].split('/').pop()
  const episode = (await rest(`/api/episodes/${documentId}?populate=audio`)).data
  assert(episode?.audio?.name === fileName, `the saved Episode holds ${JSON.stringify(episode?.audio?.name)}, not ${fileName}`)
  return documentId
}

const panel = (page) => page.locator('aside, [role=complementary], div').filter({ has: page.getByText('VocalStack', { exact: true }) }).filter({ has: page.getByRole('button', { name: /transcribe|stop/i }) }).last()
const progressText = /Queued|Fetching the file|Extracting audio|Transcribing/

async function main() {
  await mkdir(SHOTS, { recursive: true })
  const stale = new RegExp(`^${SHOT_PREFIX}\\d\\d-.*\\.png$`)
  for (const f of await readdir(SHOTS)) if (stale.test(f)) await rm(path.join(SHOTS, f))
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: !HEADED })
  const context = await browser.newContext({ viewport: { height: 1000, width: 1440 } })
  const page = await context.newPage()
  page.on('dialog', (d) => void d.accept()) // Stop asks to confirm
  const consoleErrors = []
  page.on('pageerror', (e) => consoleErrors.push(e.message))

  let file, documentId, firstText, firstRecording
  try {
    await step('log in', async () => {
      await login(page)
      await shot(page, 'logged-in')
    })

    if (STEPS.includes('settings')) {
      await step('Settings → VocalStack connection', async () => {
        await page.goto(`${STRAPI_URL}/admin/settings/vocalstack`)
        const fromConfig = page.getByText(/Connected with the API key from the plugin config/)
        const connected = page.getByRole('button', { name: /^disconnect$/i })
        const keyInput = page.getByPlaceholder('vs_key_…')
        await Promise.race([fromConfig.waitFor(), connected.waitFor(), keyInput.waitFor()])
        if (await fromConfig.isVisible()) {
          await shot(page, 'settings-config-key')
          return 'the key comes from config/plugins (apiKey), so the form is replaced by a note; unset it to test pasting'
        }
        if (!VS_API_KEY) return 'no VS_API_KEY given; the form was not tried'
        if (await connected.isVisible()) {
          await connected.click()
          await keyInput.waitFor()
        }
        // A wrong key is refused, with the reason.
        await keyInput.fill('vs_key_not_a_real_key')
        await page.getByRole('button', { name: /save key/i }).click()
        await page.getByText(/refused that key/i).waitFor({ timeout: 20000 })
        await shot(page, 'settings-wrong-key')
        await keyInput.fill(VS_API_KEY)
        await page.getByRole('button', { name: /save key/i }).click()
        await page.getByText(/Connected to VocalStack/).first().waitFor({ timeout: 20000 })
        await connected.waitFor()
        await shot(page, 'settings-connected')
        return (await page.getByText(/Entries with audio now have/).textContent()).trim()
      })
    }

    if (STEPS.includes('transcribe') || STEPS.includes('stop')) {
      await step('upload the clip through the Media Library', async () => {
        file = await uploadThroughMediaLibrary(page, await freshCopy('manual'))
        await shot(page, 'media-library-uploaded')
        // With autoTranscribe off, an upload alone starts nothing.
        await new Promise((r) => setTimeout(r, 3000))
        const t = await transcriptOf(file.id)
        assert(!t || t.status === 'idle', `the upload started a job by itself (status ${t?.status}); run with autoTranscribe off`)
        return `${file.name} (file ${file.id}, ${file.mime})`
      })

      await step('create an Episode with it', async () => {
        documentId = await createEpisode(page, `E2E episode ${new Date().toISOString()}`, file.name)
        await shot(page, 'episode-saved')
        return `episode ${documentId}`
      })

      await step('Transcribe in the VocalStack panel shows progress', async () => {
        await page.getByText('VocalStack', { exact: true }).first().waitFor({ timeout: 30000 })
        const [res] = await Promise.all([page.waitForResponse((r) => r.url().includes(`/vocalstack/transcribe/${file.id}`), { timeout: 120000 }), page.getByRole('button', { name: /^transcribe$/i }).click()])
        assert(res.ok(), `POST /vocalstack/transcribe answered ${res.status()}: ${await res.text()}`)
        await page.getByText(progressText).first().waitFor({ timeout: 30000 })
        await page.getByRole('button', { name: /^stop$/i }).waitFor()
        await shot(page, 'transcribing')
        return (await page.getByText(progressText).first().textContent()).trim()
      })

      await step('reload mid-job: the panel picks the job back up', async () => {
        const before = await transcriptOf(file.id)
        assert(before?.status === 'processing', `expected a running job before the reload, found ${before?.status}`)
        await page.reload()
        await page.getByText('VocalStack', { exact: true }).first().waitFor({ timeout: 30000 })
        // Either still running (progress + Stop) or it finished meanwhile; never back to a bare Transcribe.
        await page.getByText(progressText).or(page.getByText(/^Transcribed/)).first().waitFor({ timeout: 30000 })
        const running = await page.getByRole('button', { name: /^stop$/i }).isVisible()
        await shot(page, 'after-reload')
        return running ? `still running after the reload: ${(await page.getByText(progressText).first().textContent()).trim()}` : 'the job had finished by the time the page came back'
      })

      await step('wait for done; the transcript has real English words', async () => {
        await page.getByText(/^Transcribed/).first().waitFor({ timeout: JOB_TIMEOUT })
        await page.getByRole('button', { name: /transcribe again/i }).waitFor()
        await shot(page, 'done')
        const t = await transcriptOf(file.id)
        assert(t?.status === 'done', `REST says ${t?.status}`)
        const check = plausibleEnglish(t.transcript)
        assert(check.ok, `does not read as English (${check.words} words, ${check.common} common): ${JSON.stringify(t.transcript)}`)
        firstText = t.transcript
        firstRecording = t.recordingId
        assert(firstRecording && !t.jobRecordingId, `done, but recordingId ${t.recordingId} / jobRecordingId ${t.jobRecordingId}`)
        return `${check.words} words, language ${t.language}: ${JSON.stringify(t.transcript)}`
      })

      await step('the transcript over REST (API token)', async () => {
        const list = await rest(`/api/vocalstack/transcripts?filters[fileId][$eq]=${file.id}&populate[file][fields][0]=name`)
        const t = list.data[0]
        assert(t, 'no transcript entry over REST')
        const one = (await rest(`/api/vocalstack/transcripts/${t.documentId}`)).data
        assert(one.transcript === firstText, 'findOne and find disagree')
        assert(Array.isArray(one.sentences) && one.sentences.length > 0 && one.sentences.every((s) => typeof s.start === 'number' && s.text), 'sentences are missing or malformed')
        assert(t.file?.name === file.name, `the entry's file is ${t.file?.name}`)
        // The panel's link opens the entry in the Content Manager.
        await page.getByRole('link', { name: /open the transcript/i }).click()
        await page.getByText(firstText.split('\n')[0].slice(0, 30)).first().waitFor({ timeout: 30000 })
        await shot(page, 'transcript-entry')
        await page.goBack()
        return `${one.sentences.length} sentences, recording ${one.recordingId}`
      })
    }

    if (STEPS.includes('stop')) {
      await step('Stop on a second run keeps the earlier transcript', async () => {
        await page.getByRole('button', { name: /transcribe again/i }).click()
        await page.getByRole('button', { name: /^stop$/i }).waitFor({ timeout: 30000 })
        await shot(page, 'second-run')
        await page.getByRole('button', { name: /^stop$/i }).click()
        await page.getByText('Transcription stopped.').first().waitFor({ timeout: 30000 })
        await page.getByRole('button', { name: /transcribe again/i }).waitFor()
        await shot(page, 'stopped')
        const t = await transcriptOf(file.id)
        assert(t.status === 'done', `after Stop the entry is ${t.status}, not done`)
        assert(t.transcript === firstText, 'Stop changed the earlier transcript')
        assert(t.recordingId === firstRecording, `after Stop the entry points at recording ${t.recordingId}, not the transcript's ${firstRecording}`)
        // And it stays stopped: the server's poller must not bring the stopped job's outcome back.
        await new Promise((r) => setTimeout(r, 12000))
        const later = await transcriptOf(file.id)
        assert(later.status === 'done' && later.transcript === firstText, `12 s after Stop the entry is ${later.status}`)
        return 'stopped; entry back to done with the first transcript and its recording'
      })

      if (VS_API_URL && VS_API_KEY) {
        await step('a job stopped in VocalStack (not from Strapi) ends the run here too', async () => {
          const [res] = await Promise.all([page.waitForResponse((r) => r.url().includes(`/vocalstack/transcribe/${file.id}`)), page.getByRole('button', { name: /transcribe again/i }).click()])
          const recordingId = (await res.json()).transcript?.jobRecordingId
          assert(recordingId, `the start answered no jobRecordingId: ${JSON.stringify(await res.json())}`)
          const stopped = await fetch(`${VS_API_URL}/v1/recordings/${recordingId}/stop`, { body: '{}', headers: { authorization: `Bearer ${VS_API_KEY}`, 'content-type': 'application/json' }, method: 'POST' })
          assert(stopped.ok, `VocalStack refused the stop: ${stopped.status} ${await stopped.text()}`)
          await page.getByRole('button', { name: /transcribe again/i }).waitFor({ timeout: 30000 })
          await shot(page, 'stopped-in-vocalstack')
          const t = await transcriptOf(file.id)
          assert(t.status === 'done' && t.transcript === firstText && t.recordingId === firstRecording, `the entry is ${t.status}, recording ${t.recordingId}`)
          return `recording ${recordingId} stopped over the API; the panel and entry went back to the first transcript`
        })
      }
    }

    if (STEPS.includes('auto')) {
      let autoFile
      await step('autoTranscribe: an upload is transcribed with no click', async () => {
        autoFile = await uploadThroughMediaLibrary(page, await freshCopy('auto'))
        await shot(page, 'auto-uploaded')
        const started = await waitFor(() => transcriptOf(autoFile.id), { message: 'no transcript entry 20 s after the upload: is autoTranscribe on (VOCALSTACK_AUTO_TRANSCRIBE=true)?', timeout: 20000 })
        assert(started.status !== 'failed', `the job failed: ${started.error}`)
        // Settings → VocalStack lists it with its progress.
        await page.goto(`${STRAPI_URL}/admin/settings/vocalstack`)
        await page.getByText(autoFile.name).first().waitFor({ timeout: 30000 })
        await shot(page, 'auto-settings-list')
        // Nobody watches this job: the server's own poller saves the outcome.
        await page.goto(`${STRAPI_URL}/admin`)
        const t = await waitFor(
          async () => {
            const row = await transcriptOf(autoFile.id)
            if (row?.status === 'failed') throw new Error(`the job failed: ${row.error}`)
            return row?.status === 'done' && row
          },
          { every: 3000, message: 'the auto transcript never finished' },
        )
        const check = plausibleEnglish(t.transcript)
        assert(check.ok, `does not read as English: ${JSON.stringify(t.transcript)}`)
        await page.goto(`${STRAPI_URL}/admin/settings/vocalstack`)
        await page.getByText(autoFile.name).first().waitFor({ timeout: 30000 })
        await shot(page, 'auto-done')
        return `${autoFile.name}: ${JSON.stringify(t.transcript)}`
      })
    }
  } catch {
    await shot(page, 'failure').catch(() => undefined)
  } finally {
    await browser.close()
  }

  console.log('\n' + results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.s.toFixed(1)} s)`).join('\n'))
  if (consoleErrors.length) console.log(`\npage errors:\n${consoleErrors.join('\n')}`)
  console.log(`\nscreenshots: ${SHOTS}`)
  process.exit(results.every((r) => r.ok) && results.length ? 0 : 1)
}

await main()
