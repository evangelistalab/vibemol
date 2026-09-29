(function (global) {
  'use strict';

  // Pairs this tab with the VibeMol MCP relay so the user's own Claude can
  // drive it. Only tools from the agent registry can run; no arbitrary code.
  // UI: a Claude button in the top-right utilities with a popup menu holding
  // every connector control (connect, pairing text, lasso, scripts).
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
        aria-label="Claude connector" data-tooltip="Claude">
        <span class="material-symbols-rounded" aria-hidden="true">auto_awesome</span>
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
      <div class="vm-agent-menu-row">
        <button id="connectClaudeBtn" class="vm-agent-btn vm-agent-btn-primary" type="button">Connect Claude</button>
      </div>
      <div class="vm-agent-menu-row vm-agent-pair" id="agentPairRow" hidden>
        <span id="agentLinkStatus" class="vm-agent-note" role="status" aria-live="polite"></span>
        <button id="agentLinkCopyBtn" class="vm-agent-icon-btn material-symbols-rounded" type="button" aria-label="Copy connect message" data-tooltip="Copy connect message">content_copy</button>
      </div>
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
      <label class="vm-agent-check"><input id="agentAllowScripts" type="checkbox" /> Allow scripts <span class="vm-agent-note">(you approve each)</span></label>`;
    document.body.appendChild(menu);
    return { trigger: mount.querySelector('#agentMenuBtn'), menu };
  }

  function install() {
    const mount = document.getElementById('vibemolAgentMount');
    if (!mount || mount.dataset.installed) return;
    mount.dataset.installed = '1';
    const { trigger, menu } = render(mount);
    const $ = id => document.getElementById(id);
    const button = $('connectClaudeBtn'), state = $('agentLinkState'), pairRow = $('agentPairRow');
    const pairText = $('agentLinkStatus'), errorText = $('agentLinkError'), copyBtn = $('agentLinkCopyBtn');
    let socket = null, pingTimer = null, code = '';

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

    // ---- connection state ----
    function setConnected(connected) {
      state.dataset.connected = String(connected);
      state.querySelector('.vm-agent-state-text').textContent = connected ? 'Connected' : 'Not connected';
      mount.dataset.connected = String(connected);
    }
    const setError = text => { errorText.textContent = text || ''; };
    const hint = text => { try { global.VibeMolAgentHost && global.VibeMolAgentHost.setHint(text); } catch { /* ignore */ } };

    function disconnect(error = '') {
      clearInterval(pingTimer);
      if (socket) { socket.onclose = null; try { socket.close(1000, 'user'); } catch { /* ignore */ } }
      socket = null; code = '';
      button.textContent = 'Connect Claude';
      button.classList.add('vm-agent-btn-primary');
      pairRow.hidden = true;
      setConnected(false);
      setError(error);
    }

    async function handleCall(msg) {
      const reply = payload => socket && socket.readyState === 1 && socket.send(JSON.stringify(Object.assign({ type: 'result', id: msg.id }, payload)));
      try {
        const tools = await global.VibeMolAgentTools.whenReady();
        hint(`Claude: ${String(msg.tool).replace(/^vibemol_/, '').replace(/_/g, ' ')}`);
        reply({ ok: true, result: await tools.call(msg.tool, msg.args) });
      } catch (error) {
        reply({ ok: false, error: error && error.message ? error.message : String(error) });
      }
    }

    function connect() {
      const relay = getRelayUrl();
      if (!relay) { setError('Relay not configured (agent/web/config.js).'); return; }
      setError('');
      code = makePairCode();
      button.textContent = 'Connecting…';
      socket = new WebSocket(`${relay}/tab/${encodeURIComponent(code)}`);
      socket.onopen = () => {
        button.textContent = 'Disconnect';
        button.classList.remove('vm-agent-btn-primary');
        pairText.textContent = `Tell Claude: "${pairingPhrase(code)}"`;
        pairRow.hidden = false;
        pingTimer = setInterval(() => socket && socket.readyState === 1 && socket.send('{"type":"ping"}'), PING_MS);
      };
      socket.onmessage = event => {
        let msg = null;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg && msg.type === 'call' && msg.id) { setConnected(true); void handleCall(msg); }
        else if (msg && msg.type === 'paired') setConnected(true);
      };
      socket.onclose = () => {
        const opened = pairRow.hidden === false;
        disconnect(opened ? '' : 'Could not reach the relay. Serve the page over http(s) and check the relay is running.');
      };
    }

    button.addEventListener('click', () => (socket ? disconnect() : connect()));
    copyBtn.addEventListener('click', () => {
      if (!code || !navigator.clipboard) return;
      void navigator.clipboard.writeText(pairingPhrase(code)).then(() => {
        copyBtn.textContent = 'check';
        setTimeout(() => { copyBtn.textContent = 'content_copy'; }, 1200);
      });
    });
    global.addEventListener('beforeunload', () => socket && socket.close(1001, 'tab closed'));
  }

  global.VibeMolAgentLink = Object.freeze({ makePairCode, pairingPhrase, install, LASSO_KEY });
  if (typeof document !== 'undefined' && document.readyState !== undefined) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
  }
})(typeof window !== 'undefined' ? window : globalThis);
