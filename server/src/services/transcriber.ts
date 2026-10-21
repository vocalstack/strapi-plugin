import type { Core } from '@strapi/strapi'

import { randomUUID } from 'node:crypto'

import type { SettingsService } from './settings'

import { type Transcript, VocalStackAPI, VocalStackAPIError } from '../lib/api'
import { fetchFile, isPublicURL, resolveFileURL } from '../lib/fileSource'
import { attachWords, transcriptText } from '../lib/text'
import { FILE_UID, PLUGIN_ID, type StatusResponse, TRANSCRIPT_UID, type TranscriptData, type TranscriptSentence, type UploadFile } from '../lib/types'

/** An error a route answers with its own status and code. */
export class RouteError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

const FIELDS = ['documentId', 'fileId', 'fileName', 'status', 'transcript', 'sentences', 'language', 'error', 'recordingId', 'transcriptionId', 'transcribedAt'] as const

const pick = (entry: Record<string, unknown> | null | undefined): TranscriptData =>
  Object.fromEntries(FIELDS.filter((k) => entry?.[k] !== undefined).map((k) => [k, entry?.[k]])) as TranscriptData

/** A transcript's sentences, each with its words. */
export function toSentences(t: Pick<Transcript, 'segments' | 'sentences'>): TranscriptSentence[] {
  const sentences = t.sentences
    .filter((s) => !s.suppressed && s.text.trim())
    .map(({ end, sentenceId, speaker, start, text }) => ({ id: sentenceId, end, speaker, start, text: text.trim() }))
  return attachWords(sentences, (t.segments ?? []).filter((g) => !g.suppressed).flatMap((g) => g.words ?? []))
}

/** A VocalStack refusal, as the route answers it. */
export function routeError(err: unknown): RouteError {
  if (err instanceof RouteError) return err
  if (err instanceof VocalStackAPIError) {
    if (err.status === 401) return new RouteError(409, 'The VocalStack API key was refused. Reconnect VocalStack.', 'not_connected')
    return new RouteError(err.status >= 500 ? 502 : err.status, err.message, err.code)
  }
  return new RouteError(500, err instanceof Error ? err.message : String(err))
}

const transcriber = ({ strapi }: { strapi: Core.Strapi }) => {
  const settings = () => strapi.plugin(PLUGIN_ID).service('settings') as SettingsService
  // The document service is typed by the app's generated content types, which a plugin does not have.
  const transcripts = () => strapi.documents(TRANSCRIPT_UID as never) as unknown as {
    create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>
    delete(args: { documentId: string }): Promise<unknown>
    findFirst(args: { filters: Record<string, unknown> }): Promise<null | Record<string, unknown>>
    findMany(args: { filters?: Record<string, unknown>; limit?: number }): Promise<Record<string, unknown>[]>
    update(args: { data: Record<string, unknown>; documentId: string }): Promise<Record<string, unknown>>
  }

  /** Saves to one transcript, one at a time, so two overlapping saves cannot create two entries. */
  const queues = new Map<number, Promise<unknown>>()
  const serially = <T>(key: number, run: () => Promise<T>): Promise<T> => {
    const next = (queues.get(key) ?? Promise.resolve()).then(run, run)
    const settled = next.catch(() => undefined)
    queues.set(key, settled)
    void settled.then(() => queues.get(key) === settled && queues.delete(key))
    return next
  }

  /** Finished jobs being saved, so that every "done" signal for one job shares a single save. */
  const finishing = new Map<string, Promise<StatusResponse>>()

  const api = async () => {
    const apiKey = await settings().apiKey()
    if (!apiKey) throw new RouteError(409, 'Connect VocalStack first.', 'not_connected')
    return new VocalStackAPI(apiKey, settings().options().apiURL)
  }

  const self = {
    async file(fileId: number): Promise<UploadFile> {
      const file = (await strapi.db.query(FILE_UID).findOne({ where: { id: fileId } })) as null | UploadFile
      if (!file) throw new RouteError(404, 'Not found.')
      return file
    },

    async get(fileId: number): Promise<TranscriptData> {
      return pick(await transcripts().findFirst({ filters: { fileId: { $eq: fileId } } }))
    },

    /** Merge into the file's transcript entry, creating it on first use. */
    save(file: UploadFile, patch: TranscriptData): Promise<TranscriptData> {
      return serially(file.id, async () => {
        const existing = await transcripts().findFirst({ filters: { fileId: { $eq: file.id } } })
        const data = { ...patch, fileName: file.name ?? null }
        const saved = existing?.documentId
          ? await transcripts().update({ data, documentId: String(existing.documentId) })
          : await transcripts().create({ data: { ...data, file: file.id, fileId: file.id } })
        return pick(saved)
      })
    },

    /** Start a job for this file on VocalStack. */
    async start(fileOrId: number | UploadFile, origin?: string): Promise<StatusResponse> {
      const file = typeof fileOrId === 'number' ? await self.file(fileOrId) : fileOrId
      if (!file.mime?.startsWith('audio/')) throw new RouteError(400, 'Only audio files can be transcribed.')
      const client = await api()
      const current = await self.get(file.id)
      if (current.status === 'processing') return { status: 'processing', transcript: current }

      const options = settings().options()
      const url = await resolveFileURL(strapi, file, options, origin)
      if (!url) throw new RouteError(400, 'There is no audio file here.')

      const name = file.name || `file ${file.id}`
      const call = { idempotencyKey: `strapi:file:${file.id}:${randomUUID()}`, name, spokenLanguage: options.spokenLanguage }
      try {
        const tx = isPublicURL(url)
          ? await client.transcribeURL(url, call)
          : await client.transcribeFile(await fetchFile(strapi, file, url), file.name || decodeURIComponent(new URL(url).pathname.split('/').pop() || 'audio'), call)
        if (!tx.job) throw new Error('VocalStack did not start a job for this file.')
        const transcript = await self.save(file, { error: null, recordingId: tx.job.recordingId, status: 'processing', transcriptionId: tx.id })
        return { phase: tx.job.state, progress: 0, status: 'processing', transcript }
      } catch (err) {
        throw routeError(err)
      }
    },

    /** Where the file's transcript stands; while a job runs, asks VocalStack and saves the outcome once it is over. */
    async status(fileId: number): Promise<StatusResponse> {
      const current = await self.get(fileId)
      if (current.status !== 'processing' || !current.recordingId) return { status: current.status ?? 'idle', transcript: current }
      const file = await self.file(fileId)
      try {
        return await self.checkJob(await api(), file, current, current.recordingId)
      } catch (err) {
        throw routeError(err)
      }
    },

    /** Stop the job. The transcript goes back to how it was; VocalStack keeps what it transcribed so far. */
    async stop(fileId: number): Promise<StatusResponse> {
      const file = await self.file(fileId)
      const client = await api()
      const current = await self.get(fileId)
      const { recordingId, status } = current
      if (status !== 'processing' || !recordingId) return { status: status ?? 'idle', transcript: current }
      try {
        await client.stop(recordingId, 'Stopped from Strapi')
        return await self.restore(file, current)
      } catch (err) {
        // Too late to stop: the job ended meanwhile, so take its outcome instead.
        if (err instanceof VocalStackAPIError && err.status === 409) return self.checkJob(client, file, current, recordingId).catch(() => self.restore(file, current))
        throw routeError(err)
      }
    },

    /** Where a job stands, saving the outcome once it is over: the whole transcript when done, the reason when it failed. */
    async checkJob(client: VocalStackAPI, file: UploadFile, current: TranscriptData, recordingId: string): Promise<StatusResponse> {
      const job = await client.job(recordingId)
      if (job.state === 'failed' && job.errorCode === 'stopped') return self.restore(file, current)
      if (job.state === 'failed' || job.state === 'cropping') {
        const error = job.state === 'cropping' ? 'VocalStack is waiting for a crop window; open the transcription in VocalStack.' : (job.error ?? 'The transcription failed.')
        return { error, status: 'failed', transcript: await self.save(file, { error, status: 'failed' }) }
      }
      if (job.state !== 'done') {
        const progress = job.state === 'fetching' ? (job.progress.phasePct ?? 0) : job.progress.pct
        const audio = job.state === 'transcribing' ? { processedS: job.progress.processedS ?? 0, totalS: job.progress.totalS ?? undefined } : undefined
        return { audio, phase: job.progress.phase ?? job.state, progress, status: 'processing' }
      }
      let saving = finishing.get(recordingId)
      if (!saving) {
        saving = self.saveTranscript(client, file, recordingId)
        finishing.set(recordingId, saving)
        void saving.catch(() => undefined).then(() => finishing.delete(recordingId))
      }
      return saving
    },

    /**
     * A stopped job leaves the entry as it was before Transcribe: the earlier transcript, if
     * there was one (a new job only replaces it once done), or none.
     */
    async restore(file: UploadFile, current: TranscriptData): Promise<StatusResponse> {
      const status = current.transcript ? 'done' : 'idle'
      return { status, stopped: true, transcript: await self.save(file, { error: null, status }) }
    },

    async saveTranscript(client: VocalStackAPI, file: UploadFile, recordingId: string): Promise<StatusResponse> {
      const transcript = await client.transcript(recordingId)
      const sentences = toSentences(transcript)
      const saved = await self.save(file, {
        error: null,
        language: transcript.lang ?? transcript.sentences.find((s) => s.language)?.language ?? null,
        sentences,
        status: 'done',
        transcribedAt: new Date().toISOString(),
        transcript: transcriptText(sentences),
      })
      return { progress: 100, status: 'done', transcript: saved }
    },

    /** Statuses for several files at once (the Media Library list and the side panel). */
    async many(fileIds: number[]): Promise<Record<number, TranscriptData>> {
      if (!fileIds.length) return {}
      const rows = await transcripts().findMany({ filters: { fileId: { $in: fileIds } }, limit: fileIds.length })
      return Object.fromEntries(rows.map((r) => [Number(r.fileId), pick(r)]))
    },

    /**
     * Follow every running job from the server, so a transcript is saved even when no
     * admin has the file open (autoTranscribe, a closed tab).
     */
    async pollAll(): Promise<void> {
      const apiKey = await settings().apiKey()
      if (!apiKey) return
      const client = new VocalStackAPI(apiKey, settings().options().apiURL)
      const running = await transcripts().findMany({ filters: { status: { $eq: 'processing' } }, limit: 100 })
      for (const row of running) {
        const current = pick(row)
        if (!current.recordingId || !current.fileId) continue
        try {
          const file = (await strapi.db.query(FILE_UID).findOne({ where: { id: current.fileId } })) as null | UploadFile
          if (file) await self.checkJob(client, file, current, current.recordingId)
        } catch (err) {
          strapi.log.debug(`[vocalstack] checking file ${current.fileId}: ${(err as Error).message}`)
        }
      }
    },

    /** The transcript goes with its file. */
    async forget(fileId: number): Promise<void> {
      const existing = await transcripts().findFirst({ filters: { fileId: { $eq: fileId } } })
      if (existing?.documentId) await transcripts().delete({ documentId: String(existing.documentId) })
    },
  }
  return self
}

export default transcriber
export type TranscriberService = ReturnType<typeof transcriber>
