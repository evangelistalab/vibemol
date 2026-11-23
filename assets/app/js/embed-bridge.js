(function () {
  'use strict';

  const url = new URL(window.location.href);
  const match = /^#vmtoken=([A-Za-z0-9_-]{32,})$/.exec(url.hash);
  if (url.searchParams.get('embed') !== 'commands' || !match) return;

  const token = match[1];
  window.history.replaceState(window.history.state, '', url.pathname + url.search);
  const commands = window.VibeMolCommands;
  if (!commands) return;

  const channel = 'vibemol.embed';
  const v = 1;
  const maxRequests = 32;
  const maxBytes = 50 * 1024 * 1024;
  const encoder = new TextEncoder();
  let inFlight = 0;
  let parentOrigin = '*';
  let lastState;
  let snapshotSequence = 0;
  let interactionTimer;

  function post(kind, fields, origin) {
    window.parent.postMessage({ channel, v, token, kind, ...fields }, origin);
  }

  function canonical(_, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  }

  async function snapshot(origin) {
    const sequence = ++snapshotSequence;
    const [selection, calculations] = await Promise.all([
      commands.run('edit.getSelection'),
      commands.run('calculations.state'),
    ]);
    const state = {
      selection: selection.ok ? selection.value : null,
      calculations: calculations.ok ? calculations.value : null,
    };
    const serialized = JSON.stringify(state, canonical);
    if (sequence !== snapshotSequence || serialized === lastState) return;
    lastState = serialized;
    post('state', { state }, origin);
  }

  function refuse(id, code, detail, message, origin) {
    post('response', { id, result: { ok: false, error: { code, message, details: { code: detail } } } }, origin);
  }

  async function receive(event) {
    const { data } = event;
    if (event.source !== window.parent || data?.channel !== channel || data.v !== v || data.token !== token
      || data.kind !== 'request' || typeof data.id !== 'string' || typeof data.command !== 'string') return;

    const origin = event.origin === 'null' ? '*' : event.origin;
    parentOrigin = origin;
    if (inFlight >= maxRequests) {
      refuse(data.id, 'failed', 'bridge-busy', 'The embed bridge already has 32 requests in flight', origin);
      return;
    }
    let size;
    try {
      size = encoder.encode(JSON.stringify(data)).byteLength;
    } catch {
      refuse(data.id, 'invalid-params', 'malformed-message', 'Expected a JSON request', origin);
      return;
    }
    if (size > maxBytes) {
      refuse(data.id, 'invalid-params', 'too-large', 'The embed bridge request exceeds 50 MB', origin);
      return;
    }

    inFlight++;
    try {
      const result = await commands.run(data.command, data.params);
      post('response', { id: data.id, result }, origin);
    } finally {
      inFlight--;
    }
    if (commands.describe(data.command)?.mutates) void snapshot(origin);
  }

  function onInteraction() {
    clearTimeout(interactionTimer);
    interactionTimer = setTimeout(() => { void snapshot(parentOrigin); }, 150);
  }

  window.addEventListener('message', receive);
  for (const type of ['pointerup', 'keyup', 'change']) document.addEventListener(type, onInteraction, true);
  void commands.run('app.info').then(result => {
    if (result.ok) post('ready', { info: result.value }, '*');
  });
})();
