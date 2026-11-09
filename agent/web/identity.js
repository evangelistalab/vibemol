(function (global) {
  'use strict';

  /*
   * Anonymous browser identity for the Claude connector. Created only when the
   * user clicks Allow on the connector's consent page (agent/web/authorize.html);
   * stored in this site's localStorage. It is a random secret: no account, email,
   * or personal data. The relay only ever sees its SHA-256 hash in URLs, and each
   * tab proves it holds the secret in its first WebSocket message.
   */
  const KEY = 'vibemol.agent.identity.v1';

  const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  function get(storage = global.localStorage) {
    try {
      const value = storage.getItem(KEY);
      return value && /^[A-Za-z0-9_-]{40,64}$/.test(value) ? value : null;
    } catch { return null; }
  }

  function create(storage = global.localStorage) {
    const existing = get(storage);
    if (existing) return existing;
    const value = b64url(global.crypto.getRandomValues(new Uint8Array(32)));
    storage.setItem(KEY, value);
    return value;
  }

  function forget(storage = global.localStorage) {
    try { storage.removeItem(KEY); } catch { /* ignore */ }
  }

  async function hash(identity) {
    return b64url(await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)));
  }

  /** http(s) origin of the relay, derived from the configured wss:// URL. */
  function relayHttpOrigin() {
    const ws = String((global.VibeMolAgentConfig || {}).relayUrl || '');
    if (!ws || /YOUR-SUBDOMAIN/i.test(ws)) return '';
    return ws.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
  }

  const connectorUrl = () => (relayHttpOrigin() ? `${relayHttpOrigin()}/mcp` : '');

  global.VibeMolAgentIdentity = Object.freeze({ KEY, get, create, forget, hash, relayHttpOrigin, connectorUrl });
})(typeof window !== 'undefined' ? window : globalThis);
