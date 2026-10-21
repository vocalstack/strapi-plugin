import type { VocalStackPluginOptions } from '../lib/types'

export default {
  default: {
    autoTranscribe: false,
    enabled: true,
    oneClickConnect: false,
  } satisfies VocalStackPluginOptions,

  validator(config: VocalStackPluginOptions) {
    if (config.apiKey !== undefined && config.apiKey !== '' && !String(config.apiKey).startsWith('vs_key_')) {
      throw new Error('vocalstack: apiKey is a VocalStack API key and starts with vs_key_.')
    }
    if (config.fileURL !== undefined && typeof config.fileURL !== 'function') throw new Error('vocalstack: fileURL is a function ({ file, strapi }) => string.')
    for (const key of ['apiURL', 'dashboardURL'] as const) {
      if (config[key]) new URL(config[key]) // throws on a malformed address
    }
  },
}
