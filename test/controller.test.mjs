// The built plugin's controller and services (run `npm run build` first; `npm test` does),
// with a stand-in Strapi and a stand-in VocalStack API.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const plugin = createRequire(import.meta.url)('../dist/server/index.js').default;

const API = 'https://api.example.com';
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const ACME = { id: '7b0d7c0e-0000-4000-8000-000000000001', name: 'Acme studio', personal: false, iconUrl: '/workspace-icons/7b0d?v=1&exp=9&sig=x' };
const PERSONAL = { id: '7b0d7c0e-0000-4000-8000-000000000002', name: 'Personal workspace', personal: true, iconUrl: null };

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Answers by path; records every request. */
function vocalstack(routes) {
  const calls = [];
  globalThis.fetch = (async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const call = { auth: headers.get('authorization'), body: init.body ? String(init.body) : '', method: init.method ?? 'GET', url: url.toString() };
    calls.push(call);
    const answer = (routes[`${call.method} ${url.pathname}`] ?? (() => ({ body: { error: { code: 'not_found', message: 'Not found.' } }, status: 404 })))(call);
    if (answer.type) return new Response(answer.body, { headers: { 'content-type': answer.type }, status: answer.status ?? 200 });
    return new Response(JSON.stringify(answer.body ?? {}), { headers: { 'content-type': 'application/json' }, status: answer.status ?? 200 });
  });
  return calls;
}

function strapiWith(config, stored = {}, entry) {
  const state = { entry, stored };
  const services = {};
  const strapi = {
    config: { get: (key) => (key === 'plugin::vocalstack' ? { apiURL: API, ...config } : key === 'server.url' ? 'https://cms.example.com' : undefined) },
    db: { query: () => ({ findOne: async () => ({ id: 5, mime: 'audio/mpeg', name: 'talk.mp3' }) }) },
    documents: () => ({
      findFirst: async () => state.entry ?? null,
      findMany: async () => (state.entry ? [state.entry] : []),
      update: async ({ data }) => (state.entry = { ...state.entry, ...data }),
    }),
    log: { debug() {}, error() {}, warn() {} },
    plugin: () => ({ service: (name) => services[name] }),
    store: () => ({ get: async () => state.stored, set: async ({ value }) => { state.stored = value; } }),
  };
  services.settings = plugin.services.settings({ strapi });
  services.transcriber = plugin.services.transcriber({ strapi });
  return { controller: plugin.controllers.vocalstack({ strapi }), services: services, state };
}

const ctx = (over = {}) => {
  const headers = {};
  return { body: undefined, headers, params: {}, query: {}, request: { body: undefined, origin: 'https://cms.example.com' }, set: (k, v) => { headers[k] = v; }, state: { user: { id: 1 } }, status: 200, type: '', ...over };
};

test('checking the connection reads the workspace from /v1/me, stores it and hands the admin its icon as a data URL', async () => {
  const calls = vocalstack({
    'GET /v1/me': () => ({ body: { workspace: ACME } }),
    'GET /workspace-icons/7b0d': () => ({ body: PNG, type: 'image/png' }),
  });
  const { controller, state } = strapiWith({ oneClickConnect: true }, { account: 'my key', apiKey: 'vs_key_old' });
  const c = ctx({ query: { check: '1' } });
  await controller.connection(c);
  assert.equal(c.body.connected, true);
  assert.equal(c.body.source, 'admin');
  assert.equal(c.body.account, 'Acme studio');
  assert.deepEqual(c.body.workspace, { ...ACME, iconUrl: `data:image/png;base64,${PNG.toString('base64')}` });
  assert.deepEqual(state.stored.workspace, ACME);
  assert.equal(state.stored.account, 'Acme studio');
  assert.equal(state.stored.apiKey, 'vs_key_old');
  assert.equal(calls.find((x) => x.url.includes('/v1/me'))?.auth, 'Bearer vs_key_old');
  assert.equal(calls.find((x) => x.url.includes('/workspace-icons/'))?.auth, null);
  assert.equal(JSON.stringify(c.body).includes('vs_key_'), false);
});

test('a rename in the dashboard reaches the plugin at the next check; without a check nothing is asked', async () => {
  const { controller, state } = strapiWith({}, { account: 'Acme studio', apiKey: 'vs_key_old', workspace: { ...ACME, iconUrl: null } });
  let calls = vocalstack({});
  const plain = ctx();
  await controller.connection(plain);
  assert.equal(calls.length, 0);
  assert.equal(plain.body.workspace.name, 'Acme studio');

  calls = vocalstack({ 'GET /v1/me': () => ({ body: { workspace: { ...ACME, iconUrl: null, name: 'Acme radio' } } }) });
  const checked = ctx({ query: { check: '1' } });
  await controller.connection(checked);
  assert.equal(checked.body.workspace.name, 'Acme radio');
  assert.equal(checked.body.workspace.iconUrl, null);
  assert.equal(state.stored.workspace.name, 'Acme radio');
});

test('an older API that names no workspace leaves the connection as it reads today', async () => {
  vocalstack({ 'GET /v1/me': () => ({ body: { principal: { name: 'Someone' } } }) });
  const { controller, state } = strapiWith({}, { account: 'cms.example.com (Strapi)', apiKey: 'vs_key_old' });
  const c = ctx({ query: { check: '1' } });
  await controller.connection(c);
  assert.equal(c.body.workspace, undefined);
  assert.equal(c.body.account, 'cms.example.com (Strapi)');
  assert.equal(state.stored.account, 'cms.example.com (Strapi)');
});

test('VocalStack not answering keeps what was last seen', async () => {
  vocalstack({ 'GET /v1/me': () => ({ body: {}, status: 503 }) });
  const { controller, state } = strapiWith({}, { account: 'Acme studio', apiKey: 'vs_key_old', workspace: { ...ACME, iconUrl: null } });
  const c = ctx({ query: { check: '1' } });
  await controller.connection(c);
  assert.equal(c.body.connected, true);
  assert.equal(c.body.workspace.name, 'Acme studio');
  assert.deepEqual(state.stored.workspace, { ...ACME, iconUrl: null });
});

test('a key from the plugin config shows its workspace too', async () => {
  const calls = vocalstack({ 'GET /v1/me': () => ({ body: { workspace: PERSONAL } }) });
  const { controller, state } = strapiWith({ apiKey: 'vs_key_config', oneClickConnect: true }, { apiKey: 'vs_key_stored' });
  const c = ctx({ query: { check: '1' } });
  await controller.connection(c);
  assert.equal(c.body.source, 'options');
  assert.deepEqual(c.body.workspace, PERSONAL);
  assert.equal(calls[0].auth, 'Bearer vs_key_config');
  assert.equal(state.stored.workspace, undefined);
  const again = ctx();
  await controller.connection(again);
  assert.deepEqual(again.body.workspace, PERSONAL);
});

test('not connected: no workspace, and VocalStack is not asked', async () => {
  const calls = vocalstack({});
  const { controller } = strapiWith({});
  const c = ctx({ query: { check: '1' } });
  await controller.connection(c);
  assert.equal(c.body.connected, false);
  assert.equal(c.body.workspace, undefined);
  assert.equal(calls.length, 0);
});

test('a pasted key is saved with its workspace', async () => {
  vocalstack({ 'GET /v1/me': () => ({ body: { name: 'my key', workspace: PERSONAL } }) });
  const { controller, state } = strapiWith({});
  const c = ctx({ request: { body: { apiKey: 'vs_key_pasted' }, origin: 'https://cms.example.com' } });
  await controller.saveKey(c);
  assert.equal(c.body.account, 'Personal workspace');
  assert.deepEqual(c.body.workspace, PERSONAL);
  assert.deepEqual(state.stored.workspace, PERSONAL);

  const d = ctx();
  await controller.deleteKey(d);
  assert.equal(d.body.connected, false);
  assert.equal(state.stored.workspace, null);
  assert.equal(state.stored.apiKey, null);
});

/** Start a connect as the admin, and give back the state the dashboard would return. */
async function started(controller) {
  const c = ctx();
  await controller.connect(c);
  return new URL(c.body.url).searchParams.get('state');
}

test('a connect started while connected opens the consent screen on that workspace; otherwise no workspace is named', async () => {
  const calls = vocalstack({});
  const link = async (config, stored) => {
    const c = ctx();
    await strapiWith({ oneClickConnect: true, ...config }, stored).controller.connect(c);
    return new URL(c.body.url);
  };

  const connected = await link({}, { account: 'Acme studio', apiKey: 'vs_key_old', workspace: ACME });
  assert.equal(connected.pathname, '/connect');
  assert.equal(connected.searchParams.get('workspace'), ACME.id);
  assert.equal(connected.searchParams.get('response_type'), 'code');
  assert.ok(connected.searchParams.get('state'));

  assert.equal((await link({}, {})).searchParams.has('workspace'), false);
  assert.equal((await link({}, { account: 'my key', apiKey: 'vs_key_old' })).searchParams.has('workspace'), false);
  assert.equal((await link({}, { apiKey: 'vs_key_old', workspace: null })).searchParams.has('workspace'), false);
  // A workspace left in the store without its key, or belonging to a stored key the config key overrides, is not the one in use.
  assert.equal((await link({}, { apiKey: null, workspace: ACME })).searchParams.has('workspace'), false);
  assert.equal((await link({ apiKey: 'vs_key_config' }, { apiKey: 'vs_key_stored', workspace: ACME })).searchParams.has('workspace'), false);
  assert.equal(calls.length, 0);
});

test('a key from the plugin config names its workspace on the connect link once it has been seen', async () => {
  vocalstack({ 'GET /v1/me': () => ({ body: { workspace: PERSONAL } }) });
  const { controller } = strapiWith({ apiKey: 'vs_key_config', oneClickConnect: true });
  await controller.connection(ctx({ query: { check: '1' } }));
  const c = ctx();
  await controller.connect(c);
  assert.equal(new URL(c.body.url).searchParams.get('workspace'), PERSONAL.id);
});

test('changing the workspace: the new key replaces the old one only once it is issued', async () => {
  const calls = vocalstack({ 'POST /v1/connect/token': () => ({ body: { access_token: 'vs_key_new', account: { name: 'Raul' }, token_type: 'api_key', workspace: ACME } }) });
  const { controller, state } = strapiWith({ oneClickConnect: true }, { account: 'Personal workspace', apiKey: 'vs_key_old', workspace: PERSONAL });
  const stateParam = await started(controller);
  assert.equal(state.stored.apiKey, 'vs_key_old');
  const c = ctx({ query: { code: 'abc', state: stateParam } });
  await controller.callback(c);
  assert.equal(c.status, 200);
  assert.match(c.body, /Connected to the VocalStack workspace Acme studio\./);
  assert.equal(state.stored.apiKey, 'vs_key_new');
  assert.deepEqual(state.stored.workspace, ACME);
  assert.equal(state.stored.account, 'Acme studio');
  assert.equal(calls.length, 1);
  assert.equal(c.body.includes('vs_key_'), false);
});

test('cancelling the change keeps the connection in use', async () => {
  const calls = vocalstack({});
  const before = { account: 'Personal workspace', apiKey: 'vs_key_old', workspace: PERSONAL };
  const { controller, state } = strapiWith({ oneClickConnect: true }, before);
  const c = ctx({ query: { error: 'access_denied', state: await started(controller) } });
  await controller.callback(c);
  assert.equal(c.status, 400);
  assert.match(c.body, /Connection cancelled\./);
  assert.equal(state.stored.apiKey, 'vs_key_old');
  assert.deepEqual(state.stored.workspace, PERSONAL);
  assert.equal(calls.length, 0);
});

test('a change VocalStack refuses, or a stale link, keeps the connection in use', async () => {
  vocalstack({ 'POST /v1/connect/token': () => ({ body: { error: 'invalid_grant', error_description: 'The code has expired.' }, status: 400 }) });
  const { controller, state } = strapiWith({ oneClickConnect: true }, { account: 'Personal workspace', apiKey: 'vs_key_old', workspace: PERSONAL });
  const c = ctx({ query: { code: 'abc', state: await started(controller) } });
  await controller.callback(c);
  assert.equal(c.status, 400);
  assert.match(c.body, /The code has expired\./);
  assert.equal(state.stored.apiKey, 'vs_key_old');
  assert.deepEqual(state.stored.workspace, PERSONAL);

  const stale = ctx({ query: { code: 'abc', state: 'not-the-state' } });
  await controller.callback(stale);
  assert.equal(stale.status, 400);
  assert.equal(state.stored.apiKey, 'vs_key_old');
});

test('a connect against an older API falls back to the account name', async () => {
  vocalstack({
    'GET /v1/me': () => ({ body: {} }),
    'POST /v1/connect/token': () => ({ body: { access_token: 'vs_key_new', account: { name: 'Raul' } } }),
  });
  const { controller, state } = strapiWith({ oneClickConnect: true });
  const c = ctx({ query: { code: 'abc', state: await started(controller) } });
  await controller.callback(c);
  assert.match(c.body, /Connected to VocalStack as Raul\./);
  assert.equal(state.stored.account, 'Raul');
  assert.equal(state.stored.workspace, null);
});

test('a running job that is in another workspace ends with a plain sentence, and the earlier transcript stays', async () => {
  vocalstack({});
  const entry = { documentId: 'd1', fileId: 5, jobRecordingId: 'rec_old', jobTranscriptionId: 'tx_old', status: 'processing', transcript: 'An earlier transcript.' };
  const { controller, services, state } = strapiWith({}, { apiKey: 'vs_key_new' }, entry);
  const c = ctx({ params: { fileId: '5' } });
  await controller.status(c);
  assert.equal(c.status, 200);
  assert.equal(c.body.status, 'failed');
  assert.match(c.body.error, /not in the connected VocalStack workspace/);
  assert.match(c.body.error, /Transcribe the file again/);
  assert.equal(state.entry?.status, 'failed');
  assert.equal(state.entry?.jobRecordingId, null);
  assert.equal(state.entry?.transcript, 'An earlier transcript.');

  state.entry = { ...entry };
  const s = ctx({ params: { fileId: '5' } });
  await controller.stop(s);
  assert.equal(s.body.status, 'failed');
  assert.match(s.body.error, /not in the connected VocalStack workspace/);

  state.entry = { ...entry };
  await services.transcriber.pollAll();
  assert.equal(state.entry?.status, 'failed');
});
