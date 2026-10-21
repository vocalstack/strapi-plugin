import { Box, Button, Field, Flex, Link, Table, Tbody, Td, Th, Thead, TextInput, Tr, Typography } from '@strapi/design-system'
import { Layouts, Page, useFetchClient, useNotification, useRBAC } from '@strapi/strapi/admin'
import { useCallback, useEffect, useState } from 'react'

import type { AudioFile, ConnectionResponse, TranscriptData } from '../types'

import { Logo } from '../components/Brand'
import { FileTranscriber } from '../components/FileTranscriber'
import { errorMessage, useConnection } from '../components/useConnection'
import { PERMISSIONS } from '../pluginId'

const KEYS_URL = 'https://app.vocalstack.com/developers/keys'

const Connection = () => {
  const { post, del } = useFetchClient()
  const { toggleNotification } = useNotification()
  const { connect, connecting, connection, setConnection } = useConnection()
  const [apiKey, setAPIKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const run = async (fn: () => Promise<{ data: ConnectionResponse }>, done: string) => {
    setSaving(true)
    setError(undefined)
    try {
      setConnection((await fn()).data)
      setAPIKey('')
      toggleNotification({ message: done, type: 'success' })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const save = () => void run(() => post<ConnectionResponse>('/vocalstack/key', { apiKey }), 'Connected to VocalStack.')

  if (!connection) return <Typography textColor="neutral600">Checking the VocalStack connection…</Typography>
  if (!connection.enabled) return <Typography textColor="neutral600">VocalStack is turned off in this Strapi (`enabled: false` in config/plugins).</Typography>
  if (connection.source === 'options') return <Typography textColor="neutral600">Connected with the API key from the plugin config. Change it there.</Typography>

  return (
    <Flex alignItems="stretch" direction="column" gap={4} maxWidth="560px">
      {connection.connected ? (
        <>
          <Typography>
            Connected to VocalStack{connection.account ? ` as ${connection.account}` : ''}. Entries with audio now have a VocalStack panel with a Transcribe button.
          </Typography>
          <Box>
            <Button disabled={saving} onClick={() => run(() => del<ConnectionResponse>('/vocalstack/key'), 'Disconnected.')} variant="secondary">
              Disconnect
            </Button>
          </Box>
        </>
      ) : (
        <>
          <Typography>Connect a VocalStack account to transcribe audio files. Transcriptions use that account's credit.</Typography>
          {connection.oneClickConnect && (
            <Flex alignItems="flex-start" direction="column" gap={2}>
              <Button disabled={connecting} onClick={() => connect().catch((e: Error) => setError(e.message))}>
                {connecting ? 'Waiting for VocalStack…' : 'Connect VocalStack'}
              </Button>
              <Typography textColor="neutral600" variant="pi">
                Opens VocalStack in a new tab; click Authenticate there.
              </Typography>
            </Flex>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (apiKey.trim()) save()
            }}
          >
            <Flex alignItems="stretch" direction="column" gap={2}>
              <Field.Root name="vocalstack-api-key">
                <Field.Label>{connection.oneClickConnect ? 'Or paste an API key' : 'API key'}</Field.Label>
                <TextInput autoComplete="off" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAPIKey(e.target.value)} placeholder="vs_key_…" type="password" value={apiKey} />
                <Typography textColor="neutral600" variant="pi">
                  Create one with Read and Write permissions under{' '}
                  <Link href={KEYS_URL} isExternal>
                    Developers → API keys
                  </Link>
                  . It is stored on the server and never shown again.
                </Typography>
              </Field.Root>
              <Box>
                <Button disabled={saving || !apiKey.trim()} type="submit">
                  Save key
                </Button>
              </Box>
            </Flex>
          </form>
        </>
      )}
      {error && <Typography textColor="danger600">{error}</Typography>}
    </Flex>
  )
}

type FileRow = AudioFile & { createdAt?: string; size?: number; transcript: null | TranscriptData }

/**
 * Strapi's Media Library has no extension point for other plugins, so its audio is listed
 * here: every audio file, newest first, each with its own Transcribe button.
 */
const MediaLibraryAudio = () => {
  const { get } = useFetchClient()
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ files: FileRow[]; pageCount: number; total: number }>()
  const [error, setError] = useState<string>()

  const load = useCallback(
    (p: number) =>
      get<{ files: FileRow[]; pageCount: number; total: number }>(`/vocalstack/files?page=${p}`).then(
        ({ data }) => setData(data),
        (err) => setError(errorMessage(err)),
      ),
    [get],
  )
  useEffect(() => void load(page), [load, page])

  if (error) return <Typography textColor="danger600">{error}</Typography>
  if (!data) return <Typography textColor="neutral600">Loading the Media Library…</Typography>
  if (!data.total) return <Typography textColor="neutral600">No audio in the Media Library yet.</Typography>

  return (
    <Flex alignItems="stretch" direction="column" gap={4}>
      <Table colCount={2} rowCount={data.files.length + 1}>
        <Thead>
          <Tr>
            <Th>
              <Typography variant="sigma">File</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Transcript</Typography>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {data.files.map((file) => (
            <Tr key={file.id}>
              <Td style={{ maxWidth: 320, verticalAlign: 'top' }}>
                <Typography ellipsis textColor="neutral800" title={file.name ?? undefined}>
                  {file.name}
                </Typography>
                <Typography textColor="neutral600" variant="pi">
                  {file.mime}
                  {file.createdAt ? ` · ${new Date(file.createdAt).toLocaleDateString()}` : ''}
                </Typography>
              </Td>
              <Td style={{ minWidth: 280, paddingBlock: 12, verticalAlign: 'top' }}>
                <FileTranscriber file={file} initial={file.transcript} />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {data.pageCount > 1 && (
        <Flex gap={2}>
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)} size="S" variant="tertiary">
            Newer
          </Button>
          <Typography textColor="neutral600" variant="pi">
            Page {page} of {data.pageCount}
          </Typography>
          <Button disabled={page >= data.pageCount} onClick={() => setPage(page + 1)} size="S" variant="tertiary">
            Older
          </Button>
        </Flex>
      )}
    </Flex>
  )
}

const Settings = () => {
  const { allowedActions } = useRBAC({ transcribe: PERMISSIONS.transcribe })
  return (
    <Page.Main>
      <Page.Title>VocalStack</Page.Title>
      <Layouts.Header subtitle="Transcribe audio files with VocalStack." title="VocalStack" />
      <Layouts.Content>
        <Flex alignItems="stretch" direction="column" gap={6}>
          <Box background="neutral0" hasRadius padding={6} shadow="filterShadow">
            <Flex alignItems="stretch" direction="column" gap={4}>
              <Logo height={22} />
              <Connection />
            </Flex>
          </Box>
          {allowedActions.canTranscribe && (
            <Box background="neutral0" hasRadius padding={6} shadow="filterShadow">
              <Flex alignItems="stretch" direction="column" gap={4}>
                <Typography tag="h2" variant="delta">
                  Audio in the Media Library
                </Typography>
                <MediaLibraryAudio />
              </Flex>
            </Box>
          )}
        </Flex>
      </Layouts.Content>
    </Page.Main>
  )
}

const ProtectedSettings = () => (
  <Page.Protect permissions={PERMISSIONS.settings}>
    <Settings />
  </Page.Protect>
)

export default ProtectedSettings
