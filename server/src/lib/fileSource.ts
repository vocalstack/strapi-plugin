import type { Core } from '@strapi/strapi'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { UploadFile, VocalStackPluginOptions } from './types'

/**
 * The server's own address: `server.url` when it is absolute, else the address the
 * request came in on (behind a proxy, with `proxy: true`), else Strapi's guess.
 */
export function serverBase(strapi: Core.Strapi, origin?: string): string {
  const url = strapi.config.get<string>('server.url') ?? ''
  if (/^https?:\/\//.test(url)) return url
  return origin ?? strapi.config.get<string>('server.absoluteUrl')
}

/** The absolute address of a Media Library file. */
export async function resolveFileURL(strapi: Core.Strapi, file: UploadFile, options: VocalStackPluginOptions, origin?: string): Promise<string | undefined> {
  const custom = await options.fileURL?.({ file, strapi })
  // A private upload provider (a private bucket) hands out signed, expiring links.
  const url = custom ?? ((await strapi.plugin('upload').service('file').signFileUrls(file)) as UploadFile).url
  if (!url) return undefined
  return new URL(url, serverBase(strapi, origin)).toString()
}

/**
 * Whether VocalStack can fetch this address itself. The API refuses loopback,
 * private and link-local hosts, so for those (local development, an intranet)
 * the plugin sends the bytes instead.
 */
export function isPublicURL(url: string): boolean {
  const { hostname, protocol } = new URL(url)
  if (protocol !== 'https:' && protocol !== 'http:') return false
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) return isPublicIPv4(Number(v4[1]), Number(v4[2]))
  if (host.includes(':')) {
    // An IPv4-mapped address (::ffff:127.0.0.1, which URL writes as ::ffff:7f00:1) is that IPv4 address.
    const mapped = host.match(/^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/)
    if (mapped) {
      const high = parseInt(mapped[1], 16)
      return isPublicIPv4(high >> 8, high & 0xff)
    }
    return !(host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))
  }
  return true
}

/** Whether an IPv4 address, by its first two bytes, is outside the loopback, private and link-local ranges. */
const isPublicIPv4 = (a: number, b: number) =>
  !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127))

/** The file's bytes, for a file VocalStack cannot reach by link. */
export async function fetchFile(strapi: Core.Strapi, file: UploadFile, url: string): Promise<Blob> {
  // The local provider keeps files under public/: read them from disk rather than over HTTP.
  if (file.provider === 'local' && file.url?.startsWith('/')) {
    const root = path.resolve(strapi.dirs.static.public)
    const local = path.resolve(root, `.${decodeURIComponent(file.url.split('?')[0])}`)
    if (local.startsWith(root + path.sep)) {
      const bytes = await readFile(local).catch(() => undefined)
      if (bytes) return new Blob([bytes], { type: file.mime ?? 'application/octet-stream' })
    }
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not read the file (${res.status} from ${url})`)
  return res.blob()
}
