// The routes' answers; see server/src/lib/types.ts.
export type { ConnectionResponse, StatusResponse, TranscriptData, TranscriptStatus } from '../../server/src/lib/types'

/** A Media Library file, as the panel and the list hold it. */
export type AudioFile = {
  id: number
  mime?: null | string
  name?: null | string
  url?: null | string
}
