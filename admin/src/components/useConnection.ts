import { useFetchClient } from '@strapi/strapi/admin'
import { useCallback, useEffect, useState } from 'react'

import type { ConnectionResponse } from '../types'

/** The message of a failed call: the plugin's own `{ error }`, or Strapi's `{ error: { message } }`. */
export function errorMessage(err: unknown): string {
  const body = (err as { response?: { data?: { code?: string; error?: string | { message?: string } } } })?.response?.data
  const error = body?.error
  if (typeof error === 'string') return error
  return error?.message === 'Policy Failed' ? 'You may not do that. Ask an administrator for the VocalStack permissions.' : (error?.message ?? (err as Error)?.message ?? String(err))
}

/** The plugin's own error code (`not_connected`), when a call failed with one. */
export function errorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { code?: string } } })?.response?.data?.code
}

/** The VocalStack connection, and the one-click flow that opens the dashboard in a new tab. */
export function useConnection() {
  const { get, post } = useFetchClient()
  const [connection, setConnection] = useState<ConnectionResponse>()
  const [connecting, setConnecting] = useState(false)

  const refresh = useCallback(
    () =>
      get<ConnectionResponse>('/vocalstack/connection').then(
        (res) => setConnection(res.data),
        () => setConnection({ connected: false, enabled: false, oneClickConnect: false }),
      ),
    [get],
  )

  useEffect(() => {
    void refresh()
    // The callback tab announces itself on this channel when it is done.
    let channel: BroadcastChannel | undefined
    try {
      channel = new BroadcastChannel('vocalstack')
      channel.onmessage = (e) => {
        if (e.data?.type === 'connect') {
          setConnecting(false)
          void refresh()
        }
      }
    } catch {}
    return () => channel?.close()
  }, [refresh])

  // Coming back from the dashboard tab: look again, in case the channel message was missed.
  useEffect(() => {
    if (!connecting) return
    const onFocus = () => void refresh().then(() => setConnecting(false))
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [connecting, refresh])

  const connect = useCallback(async () => {
    // Open the tab inside the click, before any await, or the popup blocker eats it.
    const tab = window.open('about:blank', '_blank')
    setConnecting(true)
    try {
      const { data } = await post<{ url: string }>('/vocalstack/connect')
      if (tab) tab.location.href = data.url
      else window.location.href = data.url
    } catch (err) {
      tab?.close()
      setConnecting(false)
      throw new Error(errorMessage(err))
    }
  }, [post])

  return { connect, connecting, connection, refresh, setConnection }
}
