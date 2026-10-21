import type { PanelComponent } from '@strapi/content-manager/strapi-admin'

import { Flex, LinkButton, Typography } from '@strapi/design-system'
import { useRBAC } from '@strapi/strapi/admin'
import { Link as RouterLink } from 'react-router-dom'

import type { AudioFile, ConnectionResponse } from '../types'

import { PERMISSIONS } from '../pluginId'
import { FileTranscriber } from './FileTranscriber'
import { useConnection } from './useConnection'

/** Every audio file in an entry: media fields at any depth (components, dynamic zones, repeatables). */
export function audioFiles(value: unknown, found = new Map<number, AudioFile>(), depth = 0): AudioFile[] {
  if (value && typeof value === 'object' && depth < 12) {
    if (Array.isArray(value)) value.forEach((v) => audioFiles(v, found, depth + 1))
    else {
      const v = value as Record<string, unknown>
      if (typeof v.mime === 'string' && typeof v.id === 'number' && 'url' in v) {
        if (v.mime.startsWith('audio/')) found.set(v.id, { id: v.id, mime: v.mime, name: v.name as string, url: v.url as string })
      } else Object.values(v).forEach((x) => audioFiles(x, found, depth + 1))
    }
  }
  return [...found.values()]
}

const PanelContent = ({ connection, connect, connecting, files }: { connect: () => Promise<void>; connecting: boolean; connection: ConnectionResponse; files: AudioFile[] }) => (
  <Flex alignItems="stretch" direction="column" gap={4} width="100%">
    {!connection.connected ? (
      connection.oneClickConnect ? (
        <Flex alignItems="flex-start" direction="column" gap={2}>
          <LinkButton disabled={connecting} onClick={() => void connect().catch(() => undefined)} size="S" tag="button" variant="secondary">
            {connecting ? 'Waiting for VocalStack…' : 'Connect VocalStack'}
          </LinkButton>
        </Flex>
      ) : (
        <LinkButton size="S" tag={RouterLink} to="/settings/vocalstack" variant="secondary">
          Connect VocalStack
        </LinkButton>
      )
    ) : (
      files.map((file) => <FileTranscriber file={file} key={file.id} showName={files.length > 1} />)
    )}
  </Flex>
)

/**
 * The Content Manager side panel: Transcribe for each audio file the entry holds. Hidden on
 * entries with no audio, for admins without the Transcribe permission, and when `enabled: false`.
 */
export const TranscribePanel: PanelComponent = ({ document }) => {
  const { allowedActions, isLoading } = useRBAC({ transcribe: PERMISSIONS.transcribe })
  const { connect, connecting, connection } = useConnection()
  const files = audioFiles(document)

  if (!files.length || isLoading || !allowedActions.canTranscribe || !connection?.enabled) return null
  return {
    title: 'VocalStack',
    content: (
      <Flex alignItems="stretch" direction="column" gap={3} width="100%">
        <PanelContent connect={connect} connecting={connecting} connection={connection} files={files} />
        {connection.connected && (
          <Typography textColor="neutral600" variant="pi">
            A file added since the last save shows here once the entry is saved.
          </Typography>
        )}
      </Flex>
    ),
  }
}
