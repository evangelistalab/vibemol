(function (global) {
  'use strict';

  const button = document.getElementById('connectorPilotButton');
  const consentPage = document.querySelector('[data-connector-consent]');
  if (!button && !consentPage) return;

  const origin = global.location.origin;
  const crypto = global.crypto;
  const subtle = crypto?.subtle;
  if (!global.isSecureContext || origin === 'null' || !subtle
      || typeof crypto.randomUUID !== 'function' || typeof global.BroadcastChannel !== 'function') {
    if (button) {
      button.setAttribute('aria-label', 'AI connector unavailable');
      button.title = 'Open VibeMol on a secure page in a browser with Web Crypto and BroadcastChannel.';
      button.dataset.connectorState = 'unavailable';
    }
    return;
  }

  // Only a site deploy can supply the authority's issuer, audience and publicKeySpki.
  const consentAuthority = null;
  // Older enabled tabs on v1 answered discovery with their public key and nonce.
  const channelName = 'vibemol.connector.consent.v2';
  const keyAlgorithm = { name: 'ECDSA', namedCurve: 'P-256' };
  const signatureAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
  const requestDomain = 'vibemol.connector.request.v1';
  const approvalDomain = 'vibemol.connector.approval.v1';
  const requestLifetimeMs = 120_000;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const scopes = Object.freeze({
    read: 'Read the active molecule and selection.',
    select: 'Replace the highlighted atom selection.',
  });
  const generateKey = subtle.generateKey.bind(subtle);
  const exportKey = subtle.exportKey.bind(subtle);
  const importKey = subtle.importKey.bind(subtle);
  const sign = subtle.sign.bind(subtle);
  const verify = subtle.verify.bind(subtle);
  const encode = new TextEncoder();

  function base64Url(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  }

  function unbase64Url(value, maximum) {
    if (typeof value !== 'string' || value.length > maximum || !/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error('Invalid consent encoding.');
    }
    const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
    if (base64Url(bytes) !== value) throw new Error('Non-canonical consent encoding.');
    return bytes;
  }

  function importPublicKey(spki) {
    return importKey('spki', unbase64Url(spki, 160), keyAlgorithm, false, ['verify']);
  }

  async function createIdentity(isCurrent) {
    const pageInstanceNonce = crypto.randomUUID();
    const { publicKey, privateKey } = await generateKey(keyAlgorithm, false, ['sign', 'verify']);
    if (!isCurrent()) return null;
    const spki = await exportKey('spki', publicKey);
    if (!isCurrent()) return null;
    const challenge = encode.encode('vibemol.connector.enable.v1\0' + pageInstanceNonce);
    const signature = await sign(signatureAlgorithm, privateKey, challenge);
    if (!await verify(signatureAlgorithm, publicKey, signature, challenge)) {
      throw new Error('The connector key did not verify its challenge.');
    }
    return { privateKey, publicKeySpki: base64Url(spki), pageInstanceNonce };
  }

  function isSecureUrl(url) {
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1');
  }

  async function loadAuthority() {
    if (!consentAuthority || global.top !== global) return null;
    try {
      const issuer = new URL(consentAuthority.issuer);
      const audience = new URL(consentAuthority.audience);
      if (issuer.origin !== consentAuthority.issuer || !isSecureUrl(issuer) || !isSecureUrl(audience)) return null;
      const key = await importPublicKey(consentAuthority.publicKeySpki);
      return { issuer: issuer.origin, audience: consentAuthority.audience, key };
    } catch {
      return null;
    }
  }

  function validId(value) {
    return typeof value === 'string' && uuidPattern.test(value);
  }

  function validText(value) {
    return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 120
      && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
  }

  function requestIsCurrent({ issuedAt, expiresAt }) {
    const now = Date.now();
    return issuedAt <= now && now < expiresAt;
  }

  function validClaims(claims, authority) {
    return claims?.purpose === 'connect' && claims.issuer === authority.issuer && claims.audience === authority.audience
      && validId(claims.challenge) && validId(claims.grantId) && validText(claims.clientId) && validText(claims.clientName)
      && Number.isSafeInteger(claims.issuedAt) && Number.isSafeInteger(claims.expiresAt)
      && claims.expiresAt - claims.issuedAt <= requestLifetimeMs && requestIsCurrent(claims)
      && Array.isArray(claims.scopes) && claims.scopes.length > 0 && claims.scopes.length <= Object.keys(scopes).length
      && new Set(claims.scopes).size === claims.scopes.length
      && claims.scopes.every(scope => typeof scope === 'string' && Object.hasOwn(scopes, scope));
  }

  async function verifyRequest(envelope, authority) {
    if (!authority || !envelope) return null;
    try {
      const { payload, signature } = envelope;
      const bytes = unbase64Url(payload, 4096);
      const proof = unbase64Url(signature, 86);
      const message = encode.encode(requestDomain + '\0' + payload);
      if (proof.byteLength !== 64 || !await verify(signatureAlgorithm, authority.key, proof, message)) return null;
      const claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      return validClaims(claims, authority) ? { claims, envelope: { payload, signature } } : null;
    } catch {
      return null;
    }
  }

  function approvalMessage(request, { publicKeySpki, pageInstanceNonce }) {
    return encode.encode(approvalDomain + '\0' + JSON.stringify([request.envelope.payload, publicKeySpki, pageInstanceNonce]));
  }

  async function verifyApproval(request, { challenge, publicKeySpki, pageInstanceNonce, signature }) {
    if (challenge !== request.claims.challenge || !validId(pageInstanceNonce)) return null;
    try {
      const proof = unbase64Url(signature, 86);
      if (proof.byteLength !== 64) return null;
      const approval = { challenge, publicKeySpki, pageInstanceNonce, signature };
      const key = await importPublicKey(publicKeySpki);
      return await verify(signatureAlgorithm, key, proof, approvalMessage(request, approval)) ? approval : null;
    } catch {
      return null;
    }
  }

  function createApprovalDialog({ clientName, scopes: requestedScopes }) {
    const dialog = document.createElement('dialog');
    dialog.dataset.connectorApproval = '';
    dialog.setAttribute('aria-label', 'AI connector approval');
    dialog.setAttribute('aria-modal', 'true');
    dialog.style.maxInlineSize = 'min(28rem, calc(100% - 3rem))';
    const heading = document.createElement('h2');
    heading.textContent = 'Connect ' + clientName + '?';
    heading.style.overflowWrap = 'anywhere';
    const permissions = document.createElement('ul');
    for (const scope of requestedScopes) {
      const item = document.createElement('li');
      item.textContent = scopes[scope];
      permissions.append(item);
    }
    const screenshot = document.createElement('p');
    screenshot.textContent = 'Screenshot sharing is off and requires separate approval.';
    const decline = document.createElement('button');
    decline.type = 'button';
    decline.textContent = 'Decline';
    decline.autofocus = true;
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.textContent = 'Approve';
    dialog.append(heading, permissions, screenshot, decline, ' ', approve);
    return { dialog, approve, decline };
  }

  function startAdapter(button) {
    const enableHint = 'Enable this tab first, then add or connect VibeMol in your AI client.';
    const waitingLabel = 'AI connector waiting for a client. Release tab';
    const waitingHint = 'Add or connect VibeMol in your AI client now. Click to release this tab. Reloading releases it.';
    const seenChallenges = new Map();
    let active = null;

    function updateButton(state, label, hint) {
      button.setAttribute('aria-label', label);
      button.title = hint;
      button.dataset.connectorState = state;
      button.dispatchEvent(new Event('vm-connector-state'));
    }

    function release(hint = enableHint) {
      const instance = active;
      active = null;
      if (instance) {
        instance.channel?.close();
        instance.pending?.dialog.close();
        instance.privateKey = null;
        instance.approval = null;
      }
      updateButton('off', 'Enable AI connector', hint);
    }

    function canApprove(instance, pending) {
      return active === instance && instance.pending === pending && pending.dialog.open;
    }

    async function approveRequest(event, instance, pending) {
      const { request, dialog, approve } = pending;
      if (!event.isTrusted || !canApprove(instance, pending) || approve.disabled) return;
      if (!requestIsCurrent(request.claims)) {
        dialog.close();
        updateButton('waiting', waitingLabel, 'Consent expired. Start again in your AI client.');
        return;
      }
      approve.disabled = true;
      try {
        const proof = await sign(signatureAlgorithm, instance.privateKey, approvalMessage(request, instance));
        if (!canApprove(instance, pending)) return;
        if (!requestIsCurrent(request.claims)) {
          dialog.close();
          updateButton('waiting', waitingLabel, 'Consent expired. Start again in your AI client.');
          return;
        }
        instance.approval = { request, publicKeySpki: instance.publicKeySpki, pageInstanceNonce: instance.pageInstanceNonce };
        const approved = instance.approval;
        instance.channel.postMessage({
          type: 'approval', challenge: approved.request.claims.challenge, signature: base64Url(proof),
          publicKeySpki: approved.publicKeySpki, pageInstanceNonce: approved.pageInstanceNonce,
        });
        dialog.close();
        updateButton('waiting', waitingLabel, 'Approval sent. Click to release this tab. Reloading releases it.');
      } catch {
        if (!canApprove(instance, pending)) return;
        instance.approval = null;
        dialog.close();
        updateButton('waiting', waitingLabel, 'Could not sign the consent request. Start again in your AI client.');
      }
    }

    async function prepareApproval(instance, envelope) {
      if (!consentAuthority || instance.pending || instance.approval) return;
      const authority = await (instance.authority ??= loadAuthority());
      const request = await verifyRequest(envelope, authority);
      if (!request || active !== instance || instance.pending || instance.approval) return;
      const { challenge, expiresAt } = request.claims;
      const now = Date.now();
      for (const [id, deadline] of seenChallenges) {
        if (deadline <= now) seenChallenges.delete(id);
      }
      if (seenChallenges.has(challenge) || expiresAt <= now) return;
      const { dialog, approve, decline } = createApprovalDialog(request.claims);
      if (typeof dialog.showModal !== 'function') return;
      seenChallenges.set(challenge, expiresAt);
      const pending = { request, dialog, approve };
      instance.pending = pending;
      dialog.addEventListener('close', () => {
        if (instance.pending === pending) instance.pending = null;
        dialog.remove();
      }, { once: true });
      decline.addEventListener('click', () => dialog.close());
      approve.addEventListener('click', event => void approveRequest(event, instance, pending));
      document.body.append(dialog);
      dialog.showModal();
    }

    async function enable() {
      const instance = { channel: null, privateKey: null, pending: null, approval: null };
      active = instance;
      updateButton('preparing', 'AI connector preparing. Release tab', 'Preparing this tab. Click to cancel.');
      try {
        const identity = await createIdentity(() => active === instance);
        if (!identity || active !== instance) return;
        Object.assign(instance, identity);

        const channel = new global.BroadcastChannel(channelName);
        instance.channel = channel;
        channel.addEventListener('message', ({ origin: sender, data }) => {
          if (active !== instance || sender !== origin) return;
          if (data?.type === 'discover' && validId(data.requestId)) {
            channel.postMessage({ type: 'available', requestId: data.requestId });
          } else if (data?.type === 'prepare') {
            void prepareApproval(instance, data.request);
          }
        });
        updateButton('waiting', waitingLabel, waitingHint);
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
    // This script loads before the app's capture-phase shortcut handlers. Keep
    // their scene actions out of the dialog while preserving native defaults.
    global.addEventListener('keydown', event => {
      if (active?.pending?.dialog.open) event.stopImmediatePropagation();
    }, true);
    button.removeAttribute('aria-disabled');
    release();
  }

  async function startConsentPage(page) {
    const opener = global.opener;
    if (!opener || !consentAuthority) return;
    const status = page.querySelector('[data-consent-status]');
    const check = page.querySelector('[data-consent-check]');
    let session = null;
    let retired = false;
    let verifying = false;

    function show(state, message) {
      page.dataset.consentState = state;
      status.textContent = message;
    }

    function retire() {
      retired = true;
      session?.channel.close();
      session = null;
      check.hidden = true;
    }

    global.addEventListener('pagehide', retire, { once: true });
    const authority = await loadAuthority();
    if (!authority || retired || opener.closed) return;

    function discover() {
      if (!session) return;
      if (!requestIsCurrent(session.request.claims)) {
        retire();
        show('expired', 'This request expired. Start again in your AI client.');
        return;
      }
      session.discoveryId = crypto.randomUUID();
      session.prepared = false;
      show('find-tab', 'Open VibeMol, enable the AI connector in the tab you want, then check again.');
      session.channel.postMessage({ type: 'discover', requestId: session.discoveryId });
    }

    async function receiveTab({ origin: sender, data }) {
      const current = session;
      if (sender !== origin || !current || !requestIsCurrent(current.request.claims)) return;
      if (data?.type === 'available' && data.requestId === current.discoveryId && !current.prepared) {
        current.prepared = true;
        current.channel.postMessage({ type: 'prepare', request: current.request.envelope });
        show('confirm-tab', 'Approve the request in the VibeMol tab you want to connect.');
      } else if (data?.type === 'approval' && current.prepared) {
        const approval = await verifyApproval(current.request, data);
        if (!approval || session !== current || opener.closed || !requestIsCurrent(current.request.claims)) return;
        retire();
        opener.postMessage({ type: 'vibemol.connector.consent.approved', request: current.request.envelope, approval },
          authority.issuer);
        show('approval-sent', 'Approval sent. Return to your AI client to finish connecting.');
      }
    }

    async function receiveAuthority({ origin: sender, source, data }) {
      if (retired || session || verifying || sender !== authority.issuer || source !== opener
          || data?.type !== 'vibemol.connector.consent.request') return;
      verifying = true;
      const request = await verifyRequest(data.request, authority);
      verifying = false;
      if (retired || opener.closed) return;
      if (!request) {
        show('request-refused', 'Could not verify the request. Start again in your AI client.');
        return;
      }
      const channel = new global.BroadcastChannel(channelName);
      session = { request, channel, discoveryId: null, prepared: false };
      channel.addEventListener('message', receiveTab);
      check.hidden = false;
      discover();
    }

    global.addEventListener('message', receiveAuthority);
    check.addEventListener('click', discover);
    show('waiting-request', 'Waiting for a signed request from your AI client.');
    opener.postMessage({ type: 'vibemol.connector.consent.ready' }, authority.issuer);
  }

  if (consentPage) void startConsentPage(consentPage);
  else startAdapter(button);
})(window);
