import type { Core } from '@strapi/strapi'

import { DEFAULT_API_URL, DEFAULT_DASHBOARD_URL } from '../lib/api'
import { PLUGIN_ID, type VocalStackPluginOptions } from '../lib/types'

/**
 * Where a key connected from the admin lives: Strapi's core store, which no REST or
 * GraphQL route reads. Only the plugin's routes touch it, so the key never reaches a browser.
 */
export type StoredSettings = {
  account?: null | string
  apiKey?: null | string
  /** A pending one-click connect: PKCE verifier and state, for ten minutes, for the admin who started it. */
  connectAdmin?: null | number | string
  connectExpiresAt?: null | string
  connectState?: null | string
  connectVerifier?: null | string
}

const settings = ({ strapi }: { strapi: Core.Strapi }) => {
  const store = () => strapi.store({ type: 'plugin', name: PLUGIN_ID, key: 'settings' })

  return {
    options(): VocalStackPluginOptions & { apiURL: string; dashboardURL: string } {
      const options = (strapi.config.get(`plugin::${PLUGIN_ID}`) ?? {}) as VocalStackPluginOptions
      return { ...options, apiURL: options.apiURL || DEFAULT_API_URL, dashboardURL: options.dashboardURL || DEFAULT_DASHBOARD_URL }
    },

    async read(): Promise<StoredSettings> {
      return ((await store().get({})) as StoredSettings | null) ?? {}
    },

    async write(patch: StoredSettings): Promise<void> {
      await store().set({ value: { ...(await this.read()), ...patch } })
    },

    /** The key to call VocalStack with: the plugin option first, then a connected one. */
    async apiKey(): Promise<string | undefined> {
      return this.options().apiKey || (await this.read()).apiKey || undefined
    },
  }
}

export default settings
export type SettingsService = ReturnType<typeof settings>
