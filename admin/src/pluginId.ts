export const PLUGIN_ID = 'vocalstack'

export const PERMISSIONS = {
  settings: [{ action: 'plugin::vocalstack.settings', subject: null }],
  transcribe: [{ action: 'plugin::vocalstack.transcribe', subject: null }],
}
