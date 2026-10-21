import type { Core } from '@strapi/strapi'

import type { SettingsService } from './services/settings'
import type { TranscriberService } from './services/transcriber'

import { FILE_UID, PLUGIN_ID, type UploadFile } from './lib/types'

const POLL_MS = 10_000
let timer: ReturnType<typeof setInterval> | undefined

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi.service('admin::permission').actionProvider.registerMany([
    { section: 'plugins', displayName: 'Transcribe audio', uid: 'transcribe', pluginName: PLUGIN_ID },
    { section: 'settings', displayName: 'Connect a VocalStack account', uid: 'settings', category: 'VocalStack', pluginName: PLUGIN_ID },
  ])

  const settings = strapi.plugin(PLUGIN_ID).service('settings') as SettingsService
  const transcriber = strapi.plugin(PLUGIN_ID).service('transcriber') as TranscriberService
  if (settings.options().enabled === false) return

  strapi.db.lifecycles.subscribe({
    models: [FILE_UID],
    afterCreate(event) {
      const file = event.result as UploadFile | undefined
      if (!settings.options().autoTranscribe || !file?.mime?.startsWith('audio/')) return
      // After the upload has answered: a failure here must not fail the upload.
      setImmediate(() => {
        transcriber.start(file).catch((err: Error) => strapi.log.warn(`[vocalstack] auto-transcribing ${file.name ?? file.id}: ${err.message}`))
      })
    },
    afterDelete(event) {
      const file = event.result as UploadFile | undefined
      if (file?.id) transcriber.forget(file.id).catch(() => undefined)
    },
  })

  // Jobs run on VocalStack; follow them from here too, so transcripts land with no admin watching.
  let running = false
  timer = setInterval(() => {
    if (running) return
    running = true
    transcriber
      .pollAll()
      .catch((err: Error) => strapi.log.debug(`[vocalstack] ${err.message}`))
      .finally(() => (running = false))
  }, POLL_MS)
  timer.unref?.()
}

export const stopPolling = () => {
  clearInterval(timer)
  timer = undefined
}

export default bootstrap
