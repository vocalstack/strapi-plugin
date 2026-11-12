import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load.mjs';

const { iconLink, iconVersion, workspaceIcon, workspaceOf } = await load('../server/src/lib/workspace.ts');

const API = 'https://api.example.com';
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const png = (calls = []) => (async (url) => {
  calls.push(String(url));
  return new Response(PNG, { headers: { 'content-type': 'image/png' } });
});

test('the workspace is read from an answer that names one', () => {
  assert.deepEqual(workspaceOf({ workspace: { id: 'w1', name: ' Acme studio ', personal: false, iconUrl: '/workspace-icons/w1?v=2&exp=9&sig=x', extra: 1 } }), {
    id: 'w1', name: 'Acme studio', personal: false, iconUrl: '/workspace-icons/w1?v=2&exp=9&sig=x',
  });
  assert.deepEqual(workspaceOf({ workspace: { id: 'w2', name: 'Personal workspace', personal: true, iconUrl: null } }), { id: 'w2', name: 'Personal workspace', personal: true, iconUrl: null });
});

test('an older API that names no workspace gives none', () => {
  assert.equal(workspaceOf({ principal: { name: 'Acme' } }), undefined);
  assert.equal(workspaceOf({ workspace: null }), undefined);
  assert.equal(workspaceOf({ workspace: { id: 'w1' } }), undefined);
  assert.equal(workspaceOf({ workspace: { id: 'w1', name: ' ' } }), undefined);
  assert.equal(workspaceOf(undefined), undefined);
});

test('the icon link is read against the API address and never leaves it', () => {
  assert.equal(iconLink(API, '/workspace-icons/w1?v=2&exp=9&sig=x'), 'https://api.example.com/workspace-icons/w1?v=2&exp=9&sig=x');
  assert.equal(iconLink(API, 'https://elsewhere.example/icon.png'), undefined);
  assert.equal(iconLink(API, '//elsewhere.example/icon.png'), undefined);
  assert.equal(iconLink(API, null), undefined);
});

test('a re-signed link is the same icon', () => {
  assert.equal(iconVersion(`${API}/workspace-icons/w1?v=2&exp=9&sig=x`), iconVersion(`${API}/workspace-icons/w1?v=2&exp=10&sig=y`));
  assert.notEqual(iconVersion(`${API}/workspace-icons/w1?v=2&exp=9&sig=x`), iconVersion(`${API}/workspace-icons/w1?v=3&exp=9&sig=x`));
});

test('the icon comes back as a data URL and is fetched once per version', async () => {
  const calls = [];
  const first = await workspaceIcon(API, '/workspace-icons/a?v=1&exp=9&sig=x', true, png(calls));
  assert.equal(first, `data:image/png;base64,${PNG.toString('base64')}`);
  assert.equal(await workspaceIcon(API, '/workspace-icons/a?v=1&exp=10&sig=y', true, png(calls)), first);
  assert.equal(calls.length, 1);
  await workspaceIcon(API, '/workspace-icons/a?v=2&exp=10&sig=y', true, png(calls));
  assert.equal(calls.length, 2);
});

test('without load only an icon already fetched is answered', async () => {
  const calls = [];
  assert.equal(await workspaceIcon(API, '/workspace-icons/b?v=1', false, png(calls)), null);
  assert.equal(calls.length, 0);
  await workspaceIcon(API, '/workspace-icons/b?v=1', true, png(calls));
  assert.ok(await workspaceIcon(API, '/workspace-icons/b?v=1', false, png(calls)));
});

test('no icon, a refusal, a page that is not an image or an address elsewhere give no icon', async () => {
  const fails = (async () => new Response('no', { status: 403 }));
  const html = (async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }));
  const down = (async () => { throw new Error('offline'); });
  assert.equal(await workspaceIcon(API, null), null);
  assert.equal(await workspaceIcon(API, '/workspace-icons/c?v=1', true, fails), null);
  assert.equal(await workspaceIcon(API, '/workspace-icons/d?v=1', true, html), null);
  assert.equal(await workspaceIcon(API, '/workspace-icons/e?v=1', true, down), null);
  assert.equal(await workspaceIcon(API, 'https://elsewhere.example/i.png', true, png()), null);
});
