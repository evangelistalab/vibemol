import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadGlobalModule } from './load-global-module.mjs';

const sdf = readFileSync(new URL('../fixtures/characterize/pubchem/benzene.sdf', import.meta.url), 'utf8');
const json = value => new Response(JSON.stringify(value));
const busy = (retryAfter = '0') => new Response('<html>Service busy</html>', {
  status: 503,
  headers: { 'Retry-After': retryAfter },
});

function setup(responses) {
  const requests = [], notices = [], imported = [];
  let now = 0;
  const input = { value: 'benzene', addEventListener() {}, closest: () => ({ after: node => notices.push(node) }) };
  const button = { setAttribute() {} };
  const context = loadGlobalModule('assets/app/js/pubchem.js', { globals: {
    console: { error() {}, warn() {} },
    document: { createElement: () => ({ setAttribute() {} }) },
    performance: { now: () => now },
    setTimeout: (callback, ms) => { now += ms; queueMicrotask(callback); },
    fetch: async url => {
      requests.push({ path: new URL(url).pathname, at: now });
      assert.ok(responses.length, { requests });
      return responses.shift();
    },
    alert: () => assert.fail('PubChem must not block the app with an alert'),
  } });
  const controller = context.VibeMolPubChem.createPubChemController({
    els: { pubchemQueryInput: input, pubchemLoadBtn: button },
    setTooltipText() {},
    setHintMessage() {},
    setNavigationHint() {},
    parseXYZ: text => ({ atoms: text.trim().split('\n').slice(2) }),
    handleSceneDropRecords(records) { imported.push(...records); return true; },
  });
  controller.bindControls();
  return { requests, notices, imported, button };
}

test('PubChem retries a busy lookup once after Retry-After and imports the structure', async () => {
  const { requests, notices, imported, button } = setup([
    busy('2'), json({ IdentifierList: { CID: [241] } }), json({ InformationList: {} }),
    new Response(sdf), json({ PropertyTable: { Properties: [{ Title: 'Benzene' }] } }),
  ]);
  await button.onclick();
  assert.deepEqual(requests.map(({ at }) => at), [0, 2000, 2250, 2500, 2750]);
  assert.equal(requests[0].path, requests[1].path);
  assert.deepEqual(imported.map(record => [record.extras.pubchemMeta.cid, record.vol.atoms.length]), [[241, 12]]);
  assert.equal(notices.length, 0);
  assert.equal(button.disabled, false);
});

test('PubChem reports repeated 503s inline and preserves the current workspace', async () => {
  const { requests, notices, imported, button } = setup([busy(), busy()]);
  await button.onclick();
  assert.deepEqual(requests.map(({ at }) => at), [0, 1000]);
  assert.equal(notices[0].textContent, 'PubChem is temporarily busy. Try the search again in a moment.');
  assert.equal(notices[0].hidden, false);
  assert.equal(imported.length, 0);
  assert.equal(button.disabled, false);
});

test('PubChem distinguishes no match from a busy service and honors a longer wait', async () => {
  for (const [response, message] of [
    [new Response(null, { status: 404 }), 'No PubChem match for “benzene”. Check the spelling or try another name.'],
    [json({ IdentifierList: { CID: [] } }), 'No PubChem match for “benzene”. Check the spelling or try another name.'],
    [busy('60'), 'PubChem is temporarily busy. Try the search again in a moment.'],
  ]) {
    const { requests, notices, imported, button } = setup([response]);
    await button.onclick();
    assert.equal(requests.length, 1, { message, requests });
    assert.equal(notices[0].textContent, message);
    assert.equal(imported.length, 0);
    assert.equal(button.disabled, false);
  }
});
