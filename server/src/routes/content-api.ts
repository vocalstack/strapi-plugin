/**
 * Transcripts over REST, at /api/vocalstack/transcripts. Off for everyone until a role
 * (Users & Permissions) or an API token is given Vocalstack → transcript → find / findOne / update.
 */
export default {
  type: 'content-api',
  routes: [
    { method: 'GET', path: '/transcripts', handler: 'transcript.find', config: { policies: [] } },
    { method: 'GET', path: '/transcripts/:id', handler: 'transcript.findOne', config: { policies: [] } },
    { method: 'PUT', path: '/transcripts/:id', handler: 'transcript.update', config: { policies: [] } },
  ],
}
