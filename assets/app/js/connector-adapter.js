(function (global) {
  'use strict';

  const button = document.getElementById('connectorPilotButton');
  if (!button) return;

  const origin = global.location.origin;
  const crypto = global.crypto;
  const subtle = crypto?.subtle;
  if (!global.isSecureContext || origin === 'null' || !subtle
      || typeof crypto.randomUUID !== 'function' || typeof global.BroadcastChannel !== 'function') {
    button.setAttribute('aria-label', 'AI connector unavailable');
    button.title = 'Open VibeMol on a secure page in a browser with Web Crypto and BroadcastChannel.';
    button.dataset.connectorState = 'unavailable';
    return;
  }

  // Keep both the signing capability and the enabled instance in this closure.
  const generateKey = subtle.generateKey.bind(subtle);
  const exportKey = subtle.exportKey.bind(subtle);
  const sign = subtle.sign.bind(subtle);
  const verify = subtle.verify.bind(subtle);
  const signatureAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
  const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const enableHint = 'Enable this tab first, then add or connect VibeMol in your AI client.';
  let active = null;

  function updateButton(state, label, hint) {
    button.setAttribute('aria-label', label);
    button.title = hint;
    button.dataset.connectorState = state;
    button.dispatchEvent(new Event('vm-connector-state'));
  }

  function release(hint = enableHint) {
    if (active) {
      active.channel?.close();
      active.privateKey = null;
      active = null;
    }
    updateButton('off', 'Enable AI connector', hint);
  }

  async function enable() {
    const instance = { channel: null, privateKey: null };
    active = instance;
    updateButton('preparing', 'AI connector preparing. Release tab', 'Preparing this tab. Click to cancel.');
    try {
      const pageInstanceNonce = crypto.randomUUID();
      const { publicKey, privateKey } = await generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'],
      );
      if (active !== instance) return;
      instance.privateKey = privateKey;
      const spki = await exportKey('spki', publicKey);
      if (active !== instance) return;
      const publicKeySpki = btoa(String.fromCharCode(...new Uint8Array(spki)))
        .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
      const challenge = new TextEncoder().encode('vibemol.connector.enable.v1\0' + pageInstanceNonce);
      const signature = await sign(signatureAlgorithm, instance.privateKey, challenge);
      if (!await verify(signatureAlgorithm, publicKey, signature, challenge)) {
        throw new Error('The connector key did not verify its challenge.');
      }
      if (active !== instance) return;

      // A top-level consent page on this origin can request a public offer.
      // Consent must prove possession and register this key and nonce together.
      const channel = new global.BroadcastChannel('vibemol.connector.consent.v1');
      instance.channel = channel;
      channel.addEventListener('message', ({ origin: sender, data }) => {
        if (active !== instance || sender !== origin || data?.type !== 'discover'
            || typeof data.requestId !== 'string' || !requestIdPattern.test(data.requestId)) return;
        channel.postMessage({ type: 'offer', requestId: data.requestId, publicKeySpki, pageInstanceNonce });
      });
      updateButton('waiting', 'AI connector waiting for a client. Release tab',
        'Add or connect VibeMol in your AI client now. Click to release this tab. Reloading releases it.');
    } catch (error) {
      if (active !== instance) return;
      release('Could not enable this tab for the AI connector. Click to try again.');
      console.warn('AI connector setup failed', error);
    }
  }

  button.addEventListener('click', () => {
    if (active) release();
    else void enable();
  });
  global.addEventListener('pagehide', () => {
    if (active) release();
  });
  button.removeAttribute('aria-disabled');
  release();
})(window);
