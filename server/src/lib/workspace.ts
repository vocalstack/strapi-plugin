import type { Workspace } from './types'

/**
 * The workspace a key acts in, from the answer of `GET /v1/me` or `POST /v1/connect/token`.
 * An older API leaves it out.
 */
export function workspaceOf(answer: unknown): Workspace | undefined {
  const w = (answer as { workspace?: unknown } | null | undefined)?.workspace as Partial<Record<keyof Workspace, unknown>> | null | undefined
  if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !w.id || typeof w.name !== 'string' || !w.name.trim()) return undefined
  return { id: w.id, name: w.name.trim(), personal: w.personal === true, iconUrl: typeof w.iconUrl === 'string' && w.iconUrl ? w.iconUrl : null }
}

/** The icon's address: `iconUrl` is relative to the API's address, and only an address under the API is ever fetched. */
export function iconLink(apiURL: string, iconUrl: null | string | undefined): string | undefined {
  if (!iconUrl) return undefined
  try {
    const api = new URL(apiURL)
    const url = new URL(iconUrl, api)
    return url.origin === api.origin ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** Which icon a link shows: it stays the same while the link is only re-signed (`exp`, `sig`). */
export function iconVersion(link: string): string {
  const url = new URL(link)
  return `${url.origin}${url.pathname}?v=${url.searchParams.get('v') ?? ''}`
}

const ICON_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const ICON_MAX_BYTES = 1024 * 1024
const ICON_CACHE_MAX = 20
const icons = new Map<string, string>()

/**
 * The workspace's icon as a data URL, which Strapi's admin may show (its content security
 * policy allows `data:` images, not the API's address). `load: false` answers only an icon
 * already fetched. No key goes with the request.
 */
export async function workspaceIcon(apiURL: string, iconUrl: null | string | undefined, load = true, fetcher: typeof fetch = fetch): Promise<null | string> {
  const link = iconLink(apiURL, iconUrl)
  if (!link) return null
  const version = iconVersion(link)
  const known = icons.get(version)
  if (known || !load) return known ?? null
  try {
    const res = await fetcher(link, { headers: { accept: 'image/*' }, signal: AbortSignal.timeout(8000) })
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!res.ok || !ICON_TYPES.includes(type)) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (!bytes.length || bytes.length > ICON_MAX_BYTES) return null
    const data = `data:${type};base64,${bytes.toString('base64')}`
    if (icons.size >= ICON_CACHE_MAX) icons.delete(icons.keys().next().value as string)
    icons.set(version, data)
    return data
  } catch {
    return null
  }
}
