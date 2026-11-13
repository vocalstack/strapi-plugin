import type { Core } from '@strapi/strapi'

export const PLUGIN_ID = 'vocalstack'
export const TRANSCRIPT_UID = 'plugin::vocalstack.transcript'
export const FILE_UID = 'plugin::upload.file'

/** The plugin's options, from `config/plugins.ts` → `vocalstack.config`. */
export type VocalStackPluginOptions = {
  /** `false` keeps the transcript content type but removes the panel and turns the routes off. */
  enabled?: boolean
  /**
   * A VocalStack API key (`vs_key_…`, Read + Write). When set it wins over a key
   * connected from the admin panel; leave it out to connect from the admin instead.
   */
  apiKey?: string
  /** A Whisper language code (`en`, `ro`, …). Leave out to auto-detect. */
  spokenLanguage?: string
  /**
   * The public URL VocalStack fetches the audio from. Defaults to the file's `url`
   * (signed when the upload provider is private), made absolute against the server
   * URL. When that address is not public (localhost, a private network), the plugin
   * uploads the file's bytes instead.
   */
  fileURL?: (args: { file: UploadFile; strapi: Core.Strapi }) => Promise<string | undefined> | string | undefined
  /** Transcribe every audio file as it is uploaded to the Media Library. */
  autoTranscribe?: boolean
  /**
   * Show "Connect VocalStack" (opens the dashboard in a new tab; one click on
   * Authenticate there). Needs the dashboard's /connect flow; until then, paste a key.
   */
  oneClickConnect?: boolean
  /** Default https://api.vocalstack.com */
  apiURL?: string
  /** Default https://app.vocalstack.com */
  dashboardURL?: string
}

/** The fields of a Media Library file the plugin reads. */
export type UploadFile = {
  documentId?: string
  ext?: null | string
  hash?: string
  id: number
  mime?: null | string
  name?: null | string
  provider?: null | string
  url?: null | string
}

export type TranscriptStatus = 'done' | 'failed' | 'idle' | 'processing'

/** A `plugin::vocalstack.transcript` entry, as the routes answer it. */
export type TranscriptData = {
  documentId?: string
  error?: null | string
  fileId?: number
  fileName?: null | string
  /** The running job's transcription, while `status` is `processing`. */
  jobTranscriptionId?: null | string
  language?: null | string
  sentences?: null | TranscriptSentence[]
  status?: null | TranscriptStatus
  transcript?: null | string
  /** The transcription the saved `transcript` came from. */
  transcriptionId?: null | string
  transcribedAt?: null | string
}

/** [start, end, text], seconds. */
export type TranscriptWord = [number, number, string]

export type TranscriptSentence = {
  end: number
  /** VocalStack's sentenceId. */
  id?: number
  speaker: number
  start: number
  text: string
  words?: TranscriptWord[]
}

/** What the status route answers, and what the Transcribe button renders. */
export type StatusResponse = {
  /** Seconds of audio transcribed so far, and in all (while transcribing). */
  audio?: { processedS: number; totalS?: number }
  error?: string
  phase?: string
  progress?: number
  status: TranscriptStatus
  /** The job was stopped before it finished; the transcript is back to how it was before. */
  stopped?: boolean
  transcript?: TranscriptData
}

/**
 * The VocalStack workspace a key belongs to: everything the key creates lands there and is
 * billed there. From the API, `iconUrl` is a link relative to the API's address; in the
 * connection route's answer it is a `data:` URL the admin can show as it is. Null: no icon.
 */
export type Workspace = {
  iconUrl: null | string
  id: string
  name: string
  personal: boolean
}

export type ConnectionResponse = {
  /** The workspace's name when VocalStack names one; else the label the connection was saved with. */
  account?: string
  /** The panel and routes are on (the `enabled` option). */
  enabled: boolean
  connected: boolean
  oneClickConnect: boolean
  /** `options`: the key is in the plugin config; `admin`: connected from the admin panel. */
  source?: 'admin' | 'options'
  /** The workspace the key works in. Left out when not connected, or when the API does not say. */
  workspace?: Workspace
}
