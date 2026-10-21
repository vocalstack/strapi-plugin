import type { StrapiApp } from '@strapi/strapi/admin'

import { TranscribePanel } from './components/TranscribePanel'
import { PERMISSIONS, PLUGIN_ID } from './pluginId'

const plugin: StrapiApp['appPlugins'][string] = {
  register(app) {
    app.registerPlugin({ id: PLUGIN_ID, name: 'VocalStack' })

    // Settings → VocalStack: connect an account, and the Media Library's audio.
    app.addSettingsLink('global', {
      id: PLUGIN_ID,
      to: PLUGIN_ID,
      intlLabel: { id: `${PLUGIN_ID}.settings.link`, defaultMessage: 'VocalStack' },
      permissions: PERMISSIONS.settings,
      Component: () => import('./pages/Settings'),
    })
  },

  bootstrap(app) {
    // The Transcribe panel in the Content Manager's edit view, beside every entry with audio.
    const apis = app.getPlugin('content-manager').apis as { addEditViewSidePanel?: (panels: unknown[]) => void }
    apis.addEditViewSidePanel?.([TranscribePanel])
  },

  async registerTrads() {
    return []
  },
}

export default plugin
