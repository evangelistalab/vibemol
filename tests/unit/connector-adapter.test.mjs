import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../../assets/app/js/connector-adapter.js', import.meta.url), 'utf8');
const origin = 'https://vibemol.example';
const subtle = webcrypto.subtle;

test('the enabled adapter signs privately and answers discovery with availability only', { timeout: 5000 }, async () => {
  const channels = [];
  const replies = [];
  const proofs = [];
  const publicKeys = [];
  const lifecycle = new EventTarget();
  let onLabel;
  let generations = 0;
  const button = Object.assign(new EventTarget(), {
    dataset: {},
    title: '',
    setAttribute(name, value) {
      if (name === 'aria-label' && value !== 'AI connector preparing. Release tab') onLabel?.();
    },
    removeAttribute() {},
  });
  const globals = {
    document: { getElementById: () => button, querySelector: () => null },
    location: { origin },
    isSecureContext: true,
    addEventListener: lifecycle.addEventListener.bind(lifecycle),
    console, btoa, Event, TextEncoder,
    crypto: {
      randomUUID: () => webcrypto.randomUUID(),
      subtle: {
        async generateKey(...args) {
          generations++;
          const pair = await subtle.generateKey(...args);
          publicKeys.push(pair.publicKey);
          return pair;
        },
        exportKey: subtle.exportKey.bind(subtle),
        importKey: subtle.importKey.bind(subtle),
        verify: subtle.verify.bind(subtle),
        async sign(algorithm, key, bytes) {
          const signature = await subtle.sign(algorithm, key, bytes);
          proofs.push({ algorithm, key, bytes, signature });
          return signature;
        },
      },
    },
    BroadcastChannel: class extends EventTarget {
      constructor(name) { super(); this.name = name; this.closed = false; channels.push(this); }
      postMessage(data) { replies.push(structuredClone(data)); }
      close() { this.closed = true; }
    },
  };
  globals.window = globals;
  const context = createContext(globals);
  const readGlobals = () => runInContext('Object.getOwnPropertyDescriptors(globalThis)', context);
  const globalsBefore = readGlobals();
  const buttonKeysBefore = Reflect.ownKeys(button);
  runInContext(source, context);
  const idle = { state: button.dataset.connectorState, generations, channels: channels.length };
  const activate = async () => {
    const settled = new Promise(resolve => { onLabel = resolve; });
    button.dispatchEvent(new Event('click'));
    await settled;
    onLabel = undefined;
  };
  const requestId = webcrypto.randomUUID();
  const send = (channel, type, id = requestId, sender = origin) => {
    channel?.dispatchEvent(new MessageEvent('message', { origin: sender, data: { type, requestId: id } }));
  };

  await activate();
  const [firstChannel] = channels;
  send(firstChannel, 'discover', requestId, 'https://other.example');
  send(firstChannel, 'discover', 'invalid');
  send(firstChannel, 'challenge');
  send(firstChannel, 'prepare');
  send(firstChannel, 'discover');
  const firstState = button.dataset.connectorState;
  const globalsAfter = readGlobals();
  const privateBindingsVisible = runInContext(
    '[typeof privateKey, typeof active, typeof sign, typeof enable, typeof consentAuthority].some(type => type !== "undefined")',
    context,
  );
  lifecycle.dispatchEvent(new Event('pagehide'));
  const releasedState = button.dataset.connectorState;
  send(firstChannel, 'discover');
  await activate();
  send(channels[1], 'discover');
  const [proof] = proofs;
  let privateExportError = null;
  const privateExportRejected = !!proof && await subtle.exportKey('pkcs8', proof.key).then(() => false, error => {
    privateExportError = error.name;
    return true;
  });
  const challenges = proofs.map(entry => new TextDecoder().decode(entry.bytes).split('\0'));
  const actual = {
    idle, firstState, releasedState, privateBindingsVisible, privateExportRejected,
    privateExtractable: proof?.key.extractable,
    changedGlobals: Reflect.ownKeys({ ...globalsBefore, ...globalsAfter })
      .filter(key => !isDeepStrictEqual(globalsBefore[key], globalsAfter[key])).map(String),
    addedButtonProperties: Reflect.ownKeys(button).filter(key => !buttonKeysBefore.includes(key)),
    channelNames: channels.map(channel => channel.name),
    oldChannelClosed: firstChannel?.closed,
    replies,
    differentIdentity: proofs.length === 2 && proofs[0].key !== proofs[1].key && challenges[0][1] !== challenges[1][1],
    signatures: proofs.length,
    enableChallenge: challenges.every(([domain, nonce]) => domain === 'vibemol.connector.enable.v1'
      && /^[a-f0-9-]{36}$/.test(nonce)),
    signatureVerifies: !!(proof && await subtle.verify(proof.algorithm, publicKeys[0], proof.signature, proof.bytes)),
  };
  const expected = {
    idle: { state: 'off', generations: 0, channels: 0 },
    firstState: 'waiting', releasedState: 'off', privateBindingsVisible: false,
    privateExportRejected: true, privateExtractable: false, changedGlobals: [], addedButtonProperties: [],
    channelNames: ['vibemol.connector.consent.v2', 'vibemol.connector.consent.v2'],
    oldChannelClosed: true, replies: [{ type: 'available', requestId }, { type: 'available', requestId }],
    differentIdentity: true, signatures: 2, enableChallenge: true, signatureVerifies: true,
  };
  console.log(JSON.stringify({ actual, expected, privateExportError }));
  assert.deepEqual(actual, expected);
});
