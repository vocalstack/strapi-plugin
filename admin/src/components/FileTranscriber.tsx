import { Box, Button, Flex, Link, ProgressBar, Typography } from '@strapi/design-system'
import { useFetchClient, useNotification } from '@strapi/strapi/admin'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'

import type { AudioFile, StatusResponse, TranscriptData } from '../types'

import { errorCode, errorMessage } from './useConnection'

const POLL_MS = 3000

/** 2433.0 → "40:33", 4000 → "1:06:40". */
const clock = (s: number) => {
  const t = Math.floor(s)
  const [h, m, sec] = [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60]
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`
}

const PHASES: Record<string, string> = {
  extracting: 'Extracting audio',
  fetching: 'Fetching the file',
  queued: 'Queued',
  transcribing: 'Transcribing',
}

export const transcriptPath = (documentId: string) => `/content-manager/collection-types/plugin::vocalstack.transcript/${documentId}`

type Props = {
  file: AudioFile
  /** The saved transcript, when the caller already has it (the list); otherwise it is fetched. */
  initial?: null | TranscriptData
  /** Show the file's name above its button (more than one file). */
  showName?: boolean
}

/** Transcribe, progress and Stop for one Media Library file. Picks a running job back up after a reload. */
export const FileTranscriber = ({ file, initial, showName }: Props) => {
  const { get, post } = useFetchClient()
  const { toggleNotification } = useNotification()
  const [transcript, setTranscript] = useState<TranscriptData | undefined>(initial ?? undefined)
  const [loaded, setLoaded] = useState(initial !== undefined)
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  /** Transcribe was clicked and the server has not answered yet: there is no job to stop. */
  const [starting, setStarting] = useState(false)
  const [progress, setProgress] = useState<Pick<StatusResponse, 'audio'> & { pct?: number; phase?: string }>({})
  const [error, setError] = useState<string>()
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const alive = useRef(true)

  const finish = useCallback(
    (res: StatusResponse) => {
      setTranscript(res.transcript)
      setBusy(false)
      if (res.stopped) toggleNotification({ message: 'Transcription stopped.', type: 'info' })
      else if (res.status === 'done') toggleNotification({ message: `Transcript ready: ${file.name ?? 'audio'}.`, type: 'success' })
      if (res.status === 'failed') setError(res.error)
    },
    [file.name, toggleNotification],
  )

  const poll = useCallback(async () => {
    clearTimeout(timer.current)
    if (!alive.current) return
    try {
      const { data } = await get<StatusResponse>(`/vocalstack/status/${file.id}`)
      if (!alive.current) return
      if (data.status === 'processing') {
        setBusy(true)
        setProgress({ audio: data.audio, pct: data.progress, phase: data.phase })
        if (data.transcript) setTranscript(data.transcript)
        timer.current = setTimeout(poll, POLL_MS)
        return
      }
      finish(data)
    } catch (err) {
      // A network blip should not end the wait; anything the server refused should.
      if ((err as { response?: unknown }).response) {
        setBusy(false)
        setError(errorMessage(err))
      } else timer.current = setTimeout(poll, POLL_MS * 2)
    }
  }, [file.id, finish, get])

  // First look: the saved state; a running job is followed from here on.
  useEffect(() => {
    alive.current = true
    if (initial === undefined) {
      get<StatusResponse>(`/vocalstack/status/${file.id}`).then(
        ({ data }) => {
          setTranscript(data.transcript)
          setLoaded(true)
          if (data.status === 'processing') {
            setBusy(true)
            setProgress({ audio: data.audio, pct: data.progress, phase: data.phase })
            timer.current = setTimeout(poll, POLL_MS)
          } else if (data.status === 'failed') setError(data.transcript?.error ?? undefined)
        },
        (err) => {
          setLoaded(true)
          setError(errorMessage(err))
        },
      )
    } else if (initial?.status === 'processing') {
      setBusy(true)
      void poll()
    }
    return () => {
      alive.current = false
      clearTimeout(timer.current)
    }
    // Only when the file changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id])

  const transcribe = async () => {
    setError(undefined)
    setBusy(true)
    setStarting(true)
    setProgress({})
    try {
      const { data } = await post<StatusResponse>(`/vocalstack/transcribe/${file.id}`)
      if (data.transcript) setTranscript(data.transcript)
      setProgress({ pct: data.progress, phase: data.phase })
      timer.current = setTimeout(poll, POLL_MS)
    } catch (err) {
      setBusy(false)
      setError(errorCode(err) === 'not_connected' ? `${errorMessage(err)} (Settings → VocalStack)` : errorMessage(err))
    } finally {
      setStarting(false)
    }
  }

  /** Stop the job. The transcript goes back to how it was; VocalStack keeps what it heard so far. */
  const stop = async () => {
    if (!window.confirm('Stop transcribing? What VocalStack has transcribed so far stays in your VocalStack dashboard.')) return
    setStopping(true)
    try {
      const { data } = await post<StatusResponse>(`/vocalstack/stop/${file.id}`)
      if (data.status === 'processing') return
      clearTimeout(timer.current)
      finish(data)
    } catch (err) {
      toggleNotification({ message: errorMessage(err), type: 'danger' })
    } finally {
      setStopping(false)
    }
  }

  const status = transcript?.status
  const shownError = error ?? (status === 'failed' ? (transcript?.error ?? undefined) : undefined)

  return (
    <Flex alignItems="stretch" direction="column" gap={2} width="100%">
      {showName && (
        <Typography ellipsis fontWeight="semiBold" textColor="neutral800" title={file.name ?? undefined} variant="omega">
          {file.name ?? `File ${file.id}`}
        </Typography>
      )}
      {!busy && (
        <Flex gap={2} wrap="wrap">
          <Button disabled={!loaded} onClick={transcribe} size="S" variant={status === 'done' ? 'secondary' : 'default'}>
            {status === 'done' ? 'Transcribe again' : 'Transcribe'}
          </Button>
        </Flex>
      )}
      {busy && (
        <Box>
          <Typography textColor="neutral600" variant="pi">
            {PHASES[progress.phase ?? 'queued'] ?? progress.phase}
            {progress.pct ? ` · ${progress.pct}%` : '…'}
            {progress.audio?.totalS ? ` · ${clock(progress.audio.processedS)} of ${clock(progress.audio.totalS)}` : ''}
          </Typography>
          <Box paddingBottom={2} paddingTop={1}>
            <ProgressBar size="S" value={progress.pct ?? 2} />
          </Box>
          <Button disabled={stopping || starting} onClick={stop} size="S" variant="tertiary">
            {stopping ? 'Stopping…' : 'Stop'}
          </Button>
        </Box>
      )}
      {!busy && status === 'done' && !shownError && (
        <Typography textColor="neutral600" variant="pi">
          Transcribed{transcript?.language ? ` (${transcript.language})` : ''}.{' '}
          {transcript?.documentId && (
            <Link tag={RouterLink} to={transcriptPath(transcript.documentId)}>
              Open the transcript
            </Link>
          )}
        </Typography>
      )}
      {shownError && (
        <Typography textColor="danger600" variant="pi">
          {shownError}
        </Typography>
      )}
    </Flex>
  )
}
