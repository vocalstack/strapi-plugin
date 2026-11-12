import type { CSSProperties } from 'react'

import { useTheme } from 'styled-components'

import type { Workspace } from '../types'

import { workspaceHue, workspaceInitials } from '../lib/workspaceMark'

const PERSON = 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z'

/**
 * A workspace's mark, as the VocalStack dashboard draws it: its own icon, a person for
 * the personal workspace, else its initials on a tile tinted with its colour.
 */
export const WorkspaceMark = ({ size = 28, workspace }: { size?: number; workspace: Workspace }) => {
  const colors: Partial<Record<'neutral150' | 'neutral200' | 'neutral600' | 'neutral800', string>> = (useTheme() as { colors?: object } | undefined)?.colors ?? {}
  const hair = colors.neutral200 ?? '#dcdce4'
  const tile: CSSProperties = {
    alignItems: 'center',
    borderRadius: Math.round(size * 0.29),
    boxSizing: 'border-box',
    display: 'inline-flex',
    flex: 'none',
    fontSize: Math.round(size * 0.39),
    fontWeight: 600,
    height: size,
    justifyContent: 'center',
    letterSpacing: '.02em',
    lineHeight: 1,
    overflow: 'hidden',
    width: size,
  }
  if (workspace.iconUrl) {
    return (
      <span aria-hidden="true" data-testid="vocalstack-workspace-mark" style={{ ...tile, background: colors.neutral150 ?? '#eaeaef', boxShadow: `inset 0 0 0 1px ${hair}` }}>
        <img alt="" draggable={false} src={workspace.iconUrl} style={{ display: 'block', height: '100%', objectFit: 'cover', width: '100%' }} />
      </span>
    )
  }
  if (workspace.personal) {
    return (
      <span aria-hidden="true" data-testid="vocalstack-workspace-mark" style={{ ...tile, background: colors.neutral150 ?? '#eaeaef', boxShadow: `inset 0 0 0 1px ${hair}`, color: colors.neutral600 ?? '#666687' }}>
        <svg fill="none" height={Math.round(size * 0.55)} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} viewBox="0 0 24 24" width={Math.round(size * 0.55)}>
          <path d={PERSON} />
        </svg>
      </span>
    )
  }
  const colour = `oklch(.66 .13 ${workspaceHue(workspace.id)})`
  return (
    <span
      aria-hidden="true"
      data-testid="vocalstack-workspace-mark"
      style={{
        ...tile,
        background: `color-mix(in oklab, ${colour} 22%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${colour} 30%, transparent)`,
        color: `color-mix(in oklab, ${colour} 72%, ${colors.neutral800 ?? '#32324d'})`,
      }}
    >
      {workspaceInitials(workspace.name)}
    </span>
  )
}
