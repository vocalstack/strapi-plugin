const authenticated = ['admin::isAuthenticatedAdmin']
const can = (action: 'settings' | 'transcribe') => [...authenticated, { name: 'admin::hasPermissions', config: { actions: [`plugin::vocalstack.${action}`] } }]

/** Mounted under /vocalstack and signed with the admin's token (except the connect callback). */
export default {
  type: 'admin',
  routes: [
    { method: 'GET', path: '/connection', handler: 'vocalstack.connection', config: { policies: authenticated } },
    { method: 'POST', path: '/key', handler: 'vocalstack.saveKey', config: { policies: can('settings') } },
    { method: 'DELETE', path: '/key', handler: 'vocalstack.deleteKey', config: { policies: can('settings') } },
    { method: 'POST', path: '/connect', handler: 'vocalstack.connect', config: { policies: can('settings') } },
    { method: 'GET', path: '/callback', handler: 'vocalstack.callback', config: { auth: false } },
    { method: 'GET', path: '/files', handler: 'vocalstack.files', config: { policies: can('transcribe') } },
    { method: 'POST', path: '/transcribe/:fileId', handler: 'vocalstack.transcribe', config: { policies: can('transcribe') } },
    { method: 'POST', path: '/stop/:fileId', handler: 'vocalstack.stop', config: { policies: can('transcribe') } },
    { method: 'GET', path: '/status/:fileId', handler: 'vocalstack.status', config: { policies: can('transcribe') } },
  ],
}
