(function (global) {
  'use strict';

  // Pairs this tab with the VibeMol MCP relay so the user's own Claude can
  // drive it. Only tools from the agent registry can run; no arbitrary code.
  const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const PING_MS = 25000;

  function makePairCode(random = n => crypto.getRandomValues(new Uint32Array(n))) {
    const values = random(10);
    let code = '';
    for (let i = 0; i < 10; i++) code += CODE_ALPHABET[values[i] % CODE_ALPHABET.length];
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  }

  function getRelayUrl() {
    const url = String((global.VibeMolAgentConfig || {}).relayUrl || '').replace(/\/+$/, '');
    return /YOUR-SUBDOMAIN/i.test(url) ? '' : url;
  }

  // Builds the connector controls inside #vibemolAgentMount so index.html only
  // needs an empty mount point.
  function renderControls(mount) {
    mount.classList.add('vm-agent-link');
    mount.setAttribute('aria-label', 'Claude connector');
    mount.innerHTML = `
      <button id="connectClaudeBtn" class="secondary" type="button" data-tooltip="Let your Claude control this tab through the VibeMol connector">Connect Claude</button>
      <button id="agentLinkCopyBtn" class="secondary tb-iconBtn ms-icon-button" type="button" aria-label="Copy pairing code" data-tooltip="Copy pairing code" hidden>content_copy</button>
      <label class="vm-agent-link-scripts" data-tooltip="Let Claude ask to run custom scripts in this tab (you approve each one)"><input id="agentAllowScripts" type="checkbox" /> Allow scripts</label>
      <div id="agentLinkStatus" class="vm-agent-link-status" role="status" aria-live="polite" data-state="idle"></div>`;
  }

  function install() {
    const mount = document.getElementById('vibemolAgentMount');
    if (!mount || mount.dataset.installed) return;
    mount.dataset.installed = '1';
    renderControls(mount);
    const button = document.getElementById('connectClaudeBtn');
    const status = document.getElementById('agentLinkStatus');
    const copyBtn = document.getElementById('agentLinkCopyBtn');
    if (!button || !status) return;
    let socket = null, pingTimer = null, code = '';

    const setStatus = (text, state) => { status.textContent = text; status.dataset.state = state; };
    const hint = text => { try { global.VibeMolAgentHost && global.VibeMolAgentHost.setHint(text); } catch { /* ignore */ } };

    function disconnect(message = 'Claude disconnected') {
      clearInterval(pingTimer);
      if (socket) { socket.onclose = null; try { socket.close(1000, 'user'); } catch { /* ignore */ } }
      socket = null; code = '';
      button.textContent = 'Connect Claude';
      if (copyBtn) copyBtn.hidden = true;
      setStatus(message, 'idle');
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
      if (!relay) { setStatus('Set relayUrl in agent/web/config.js to your deployed relay.', 'error'); return; }
      code = makePairCode();
      setStatus('Connecting…', 'pending');
      socket = new WebSocket(`${relay}/tab/${encodeURIComponent(code)}`);
      socket.onopen = () => {
        button.textContent = 'Disconnect Claude';
        if (copyBtn) copyBtn.hidden = false;
        setStatus(`Pairing code ${code}. Tell Claude: "Connect to VibeMol ${code}"`, 'ready');
        pingTimer = setInterval(() => socket && socket.readyState === 1 && socket.send('{"type":"ping"}'), PING_MS);
      };
      socket.onmessage = event => {
        let msg = null;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg && msg.type === 'call' && msg.id) void handleCall(msg);
        else if (msg && msg.type === 'paired') setStatus(`Claude connected (${code})`, 'connected');
      };
      socket.onerror = () => setStatus('Could not reach the agent relay.', 'error');
      socket.onclose = event => {
        if (!button.textContent.startsWith('Disconnect')) return disconnect('Could not reach the agent relay. Is it deployed, and is the page served over http(s) rather than opened as a file?');
        disconnect(event.reason ? `Claude disconnected: ${event.reason}` : 'Claude disconnected');
      };
    }

    button.addEventListener('click', () => (socket ? disconnect() : connect()));
    if (copyBtn) copyBtn.addEventListener('click', () => { if (code && navigator.clipboard) void navigator.clipboard.writeText(code); });
    global.addEventListener('beforeunload', () => socket && socket.close(1001, 'tab closed'));
  }

  global.VibeMolAgentLink = Object.freeze({ makePairCode, install });
  if (typeof document !== 'undefined' && document.readyState !== undefined) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
  }
})(typeof window !== 'undefined' ? window : globalThis);
