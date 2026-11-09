(function (global) {
  'use strict';

  // Links this tab to the user's own Claude through the VibeMol relay.
  //  - Browser channel (default): after the user authorized the connector once,
  //    every VibeMol tab in this browser connects automatically; Claude's calls
  //    go to the most recently focused tab (see agent/web/identity.js).
  //  - Code channel (fallback): a one-off pairing code for other browsers.
  // Only tools from the agent registry can run. UI: the Claude button in the
  // top-right utilities with a popup menu.
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const PING_MS = 25000;
  const LASSO_KEY = 'L';

  function makePairCode(random = n => crypto.getRandomValues(new Uint32Array(n))) {
    const values = random(10);
    let code = '';
    for (let i = 0; i < 10; i++) code += CODE_ALPHABET[values[i] % CODE_ALPHABET.length];
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  }

  const pairingPhrase = code => `connect to Vibemol ${code}`;
  // claude.ai has accepted a prefilled prompt via ?q=; if that ever changes, the
  // user can still paste the copied message.
  const claudeUrl = text => `https://claude.ai/new?q=${encodeURIComponent(text)}`;
  const RECONNECT_MS = [1000, 3000, 8000, 20000, 45000];

  function getRelayUrl() {
    const url = String((global.VibeMolAgentConfig || {}).relayUrl || '').replace(/\/+$/, '');
    return /YOUR-SUBDOMAIN/i.test(url) ? '' : url;
  }

  // The trigger renders into #vibemolAgentMount (next to the GitHub link); the
  // menu is appended to <body> so the utilities' hover fade doesn't hide it.
  function render(mount) {
    mount.classList.add('vm-agent-link');
    mount.innerHTML = `
      <button id="agentMenuBtn" class="topRightUtilityLink vm-agent-trigger" type="button" aria-haspopup="dialog" aria-expanded="false"
        aria-label="Pair to Claude" data-tooltip="Pair to Claude">
        <span class="material-symbols-rounded vm-agent-trigger-icon" aria-hidden="true">auto_awesome</span>
        <span class="vm-agent-trigger-dot" aria-hidden="true"></span>
      </button>`;
    const menu = document.createElement('div');
    menu.id = 'agentMenu';
    menu.className = 'vm-agent-link vm-agent-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'Claude connector');
    menu.hidden = true;
    menu.innerHTML = `
      <div class="vm-agent-menu-head">
        <span class="vm-agent-menu-title">Claude</span>
        <span id="agentLinkState" class="vm-agent-state" data-connected="false"><span class="vm-agent-dot" aria-hidden="true"></span><span class="vm-agent-state-text">Not connected</span></span>
      </div>

      <div id="agentSetup" class="vm-agent-setup" hidden>
        <div class="vm-agent-menu-sub">One-time setup</div>
        <ol class="vm-agent-steps">
          <li>In Claude, open <strong>Settings → Connectors → Add custom connector</strong> and paste:</li>
        </ol>
        <div class="vm-agent-menu-row vm-agent-pair">
          <span id="agentConnectorUrl" class="vm-agent-note"></span>
          <button id="agentCopyConnectorBtn" class="vm-agent-icon-btn material-symbols-rounded" type="button" aria-label="Copy connector URL" data-tooltip="Copy connector URL">content_copy</button>
        </div>
        <ol class="vm-agent-steps" start="2">
          <li>Click <strong>Connect</strong>, then <strong>Allow</strong>. This tab connects on its own; then just ask Claude.</li>
        </ol>
      </div>

      <div id="agentBrowserRow" class="vm-agent-note" hidden></div>

      <details id="agentCodeBox" class="vm-agent-code">
        <summary class="vm-agent-note">Pair with a code instead</summary>
        <div class="vm-agent-menu-row">
          <button id="connectClaudeBtn" class="vm-agent-btn" type="button">Get pairing code</button>
        </div>
        <div class="vm-agent-menu-row vm-agent-pair" id="agentPairRow" hidden>
          <span id="agentLinkStatus" class="vm-agent-note" role="status" aria-live="polite"></span>
          <button id="agentLinkCopyBtn" class="vm-agent-icon-btn material-symbols-rounded" type="button" aria-label="Copy connect message" data-tooltip="Copy connect message">content_copy</button>
          <button id="agentOpenClaudeBtn" class="vm-agent-icon-btn material-symbols-rounded" type="button" aria-label="Open in Claude" data-tooltip="Open in Claude with this message">open_in_new</button>
        </div>
      </details>
      <div id="agentLinkError" class="vm-agent-note" role="status" aria-live="polite"></div>

      <div class="vm-agent-divider"></div>
      <div class="vm-agent-menu-row">
        <button id="agentLassoBtn" class="vm-agent-btn" type="button">
          <span class="material-symbols-rounded" aria-hidden="true">lasso_select</span>Lasso
        </button>
        <kbd class="vm-agent-kbd" title="Keyboard shortcut">${LASSO_KEY}</kbd>
      </div>
      <div id="agentLassoStatus" class="vm-agent-note" role="status" aria-live="polite"></div>
      <div class="vm-agent-divider"></div>
      <label class="vm-agent-check" data-tooltip="Let Claude add features by writing JavaScript in this tab (you approve each script)"><input id="agentAllowScripts" type="checkbox" /> Allow scripts <span class="vm-agent-note">(you approve each)</span></label>
      <div class="vm-agent-divider"></div>
      <div class="vm-agent-menu-sub">Extensions</div>
      <div id="agentExtensionsList" class="vm-agent-ext-list"></div>
      <div id="agentForgetRow" class="vm-agent-menu-row vm-agent-forget" hidden>
        <button id="agentForgetBtn" class="vm-agent-link-btn" type="button">Forget this browser</button>
      </div>`;
    document.body.appendChild(menu);
    const badge = document.createElement('div');
    badge.id = 'agentDrivingBadge';
    badge.className = 'vm-agent-link vm-agent-driving';
    badge.setAttribute('role', 'status');
    badge.hidden = true;
    badge.innerHTML = '<span class="material-symbols-rounded vm-agent-trigger-icon" aria-hidden="true">auto_awesome</span>Claude is driving this tab';
    document.body.appendChild(badge);
    return { trigger: mount.querySelector('#agentMenuBtn'), menu, badge };
  }

  // Always sit directly after the GitHub link, wherever the app places it (the
  // floating top-right utilities or the workbench header), even if an older
  // index.html still has the mount elsewhere.
  function placeMount() {
    let mount = document.getElementById('vibemolAgentMount');
    const github = document.getElementById('githubRepoLink');
    if (!mount && github) { mount = document.createElement('span'); mount.id = 'vibemolAgentMount'; }
    if (mount && github && github.nextElementSibling !== mount) github.insertAdjacentElement('afterend', mount);
    return mount;
  }

  function copyWithFeedback(btn, text) {
    if (!text || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'check';
      setTimeout(() => { btn.textContent = 'content_copy'; }, 1200);
    });
  }

  function install() {
    const mount = placeMount();
    if (!mount || mount.dataset.installed) return;
    mount.dataset.installed = '1';
    const { trigger, menu, badge } = render(mount);
    const $ = id => document.getElementById(id);
    const Identity = global.VibeMolAgentIdentity;
    const state = $('agentLinkState'), errorText = $('agentLinkError');
    const codeBtn = $('connectClaudeBtn'), pairRow = $('agentPairRow'), pairText = $('agentLinkStatus');

    // ---- menu open/close ----
    function place() {
      const r = trigger.getBoundingClientRect();
      menu.style.top = `${Math.round(r.bottom + 8)}px`;
      menu.style.right = `${Math.max(8, Math.round(global.innerWidth - r.right))}px`;
    }
    function setOpen(open) {
      menu.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('vm-agent-menu-open', open);
      if (open) place();
    }
    trigger.addEventListener('click', () => setOpen(menu.hidden));
    document.addEventListener('pointerdown', e => {
      if (!menu.hidden && !menu.contains(e.target) && !trigger.contains(e.target)) setOpen(false);
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); trigger.focus(); } });
    global.addEventListener('resize', () => { if (!menu.hidden) place(); });
    $('agentLassoBtn').addEventListener('click', () => setOpen(false)); // lasso.js handles the click itself

    // ---- shared state ----
    const channels = { browser: { socket: null, ready: false }, code: { socket: null, ready: false, code: '' } };
    const setError = text => { errorText.textContent = text || ''; };
    const hint = text => { try { global.VibeMolAgentHost && global.VibeMolAgentHost.setHint(text); } catch { /* ignore */ } };
    function refresh() {
      const connected = channels.browser.ready || channels.code.ready;
      state.dataset.connected = String(connected);
      state.querySelector('.vm-agent-state-text').textContent = connected ? 'Connected' : 'Not connected';
      mount.dataset.connected = String(connected);
      const hasIdentity = !!(Identity && Identity.get());
      $('agentSetup').hidden = hasIdentity;
      $('agentForgetRow').hidden = !hasIdentity;
      $('agentConnectorUrl').textContent = (Identity && Identity.connectorUrl()) || 'Relay not configured (agent/web/config.js)';
      const row = $('agentBrowserRow');
      row.hidden = !hasIdentity;
      row.textContent = channels.browser.ready ? 'Linked to your Claude connector. Just ask Claude.' : 'Linking this tab to your Claude connector…';
      if (!connected) setDriving(false);
    }
    function setDriving(active) { badge.hidden = !active; }

    async function handleCall(socket, msg) {
      const reply = payload => socket && socket.readyState === 1 && socket.send(JSON.stringify(Object.assign({ type: 'result', id: msg.id }, payload)));
      try {
        const tools = await global.VibeMolAgentTools.whenReady();
        hint(`Claude: ${String(msg.tool).replace(/^vibemol_/, '').replace(/_/g, ' ')}`);
        reply({ ok: true, result: await tools.call(msg.tool, msg.args) });
      } catch (error) {
        reply({ ok: false, error: error && error.message ? error.message : String(error) });
      }
    }

    function keepAlive(socket) {
      const timer = setInterval(() => socket.readyState === 1 && socket.send('{"type":"ping"}'), PING_MS);
      socket.addEventListener('close', () => clearInterval(timer));
    }

    // ---- browser channel (automatic) ----
    let retry = 0, retryTimer = null;
    async function connectBrowser() {
      clearTimeout(retryTimer);
      const identity = Identity && Identity.get();
      const relay = getRelayUrl();
      if (!identity || !relay || channels.browser.socket) { refresh(); return; }
      const hash = await Identity.hash(identity);
      const socket = new WebSocket(`${relay}/tab-identity/${hash}`);
      channels.browser.socket = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'hello', identity, focused: document.hasFocus() }));
        keepAlive(socket);
      };
      socket.onmessage = event => {
        let msg = null;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (!msg) return;
        if (msg.type === 'ready') { channels.browser.ready = true; retry = 0; setError(''); refresh(); }
        else if (msg.type === 'driving') setDriving(!!msg.active);
        else if (msg.type === 'call' && msg.id) { setDriving(true); void handleCall(socket, msg); }
      };
      socket.onclose = event => {
        channels.browser = { socket: null, ready: false };
        refresh();
        if (event.code === 4003) { setError('This browser\'s link to Claude is invalid. Use "Forget this browser" and add the connector again.'); return; }
        if (Identity.get()) retryTimer = setTimeout(connectBrowser, RECONNECT_MS[Math.min(retry++, RECONNECT_MS.length - 1)]);
      };
    }
    const sendFocus = () => {
      const s = channels.browser.socket;
      if (s && s.readyState === 1 && channels.browser.ready) s.send('{"type":"focus"}');
    };
    global.addEventListener('focus', sendFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      sendFocus();
      if (!channels.browser.socket) connectBrowser();
    });
    let lastPointer = 0;
    document.addEventListener('pointerdown', () => { const now = Date.now(); if (now - lastPointer > 5000) { lastPointer = now; sendFocus(); } }, true);
    // The consent page (another tab) creates the identity: connect as soon as it appears.
    global.addEventListener('storage', event => { if (Identity && event.key === Identity.KEY) { if (event.newValue) connectBrowser(); else forgetLocal(); } });
    global.addEventListener('online', () => { if (!channels.browser.socket) connectBrowser(); });

    function forgetLocal() {
      clearTimeout(retryTimer);
      const s = channels.browser.socket;
      channels.browser = { socket: null, ready: false };
      if (s) { s.onclose = null; try { s.close(1000, 'forgotten'); } catch { /* ignore */ } }
      refresh();
    }
    $('agentForgetBtn').addEventListener('click', () => {
      if (!global.confirm('Forget this browser? Claude will no longer reach VibeMol tabs here until you add the connector again (in Claude, remove and re-add it).')) return;
      Identity.forget();
      forgetLocal();
    });
    $('agentCopyConnectorBtn').addEventListener('click', e => copyWithFeedback(e.currentTarget, Identity && Identity.connectorUrl()));

    // ---- code channel (fallback) ----
    function disconnectCode(error = '') {
      const s = channels.code.socket;
      channels.code = { socket: null, ready: false, code: '' };
      if (s) { s.onclose = null; try { s.close(1000, 'user'); } catch { /* ignore */ } }
      codeBtn.textContent = 'Get pairing code';
      pairRow.hidden = true;
      setError(error);
      refresh();
    }
    function connectCode() {
      const relay = getRelayUrl();
      if (!relay) { setError('Relay not configured (agent/web/config.js).'); return; }
      setError('');
      const code = makePairCode();
      codeBtn.textContent = 'Connecting…';
      const socket = new WebSocket(`${relay}/tab/${encodeURIComponent(code)}`);
      channels.code = { socket, ready: false, code };
      socket.onopen = () => {
        codeBtn.textContent = 'Stop pairing';
        pairText.textContent = `Tell Claude: "${pairingPhrase(code)}"`;
        pairRow.hidden = false;
        keepAlive(socket);
      };
      socket.onmessage = event => {
        let msg = null;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg && msg.type === 'call' && msg.id) { channels.code.ready = true; refresh(); setDriving(true); void handleCall(socket, msg); }
        else if (msg && msg.type === 'paired') { channels.code.ready = true; refresh(); }
      };
      socket.onclose = () => disconnectCode(pairRow.hidden ? 'Could not reach the relay. Serve the page over http(s) and check the relay is running.' : '');
    }
    codeBtn.addEventListener('click', () => (channels.code.socket ? disconnectCode() : connectCode()));
    $('agentLinkCopyBtn').addEventListener('click', e => copyWithFeedback(e.currentTarget, channels.code.code && pairingPhrase(channels.code.code)));
    $('agentOpenClaudeBtn').addEventListener('click', () => {
      if (channels.code.code) global.open(claudeUrl(pairingPhrase(channels.code.code)), '_blank', 'noopener');
    });

    global.addEventListener('beforeunload', () => {
      for (const ch of Object.values(channels)) if (ch.socket) ch.socket.close(1001, 'tab closed');
    });
    refresh();
    connectBrowser();
  }

  global.VibeMolAgentLink = Object.freeze({ makePairCode, pairingPhrase, claudeUrl, install, LASSO_KEY });
  if (typeof document !== 'undefined' && document.readyState !== undefined) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
  }
})(typeof window !== 'undefined' ? window : globalThis);
