import { DurableObject } from 'cloudflare:workers';
import { sha256b64 } from './auth.js';

const CALL_TIMEOUT_MS = 30000;
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

/**
 * Relay between Claude's tool calls and VibeMol tabs. One Durable Object per
 * channel:
 *  - "code" channels (name = pairing code): exactly one tab, paired by code.
 *  - "identity" channels (name = id:<hash of a browser identity>): every tab in
 *    the browser that authorized the connector. Tabs prove they hold the
 *    identity in a hello message; calls go to the most recently focused tab,
 *    which is told it is now the one Claude is driving.
 */
export class PairingRelay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.pending = new Map();
    // Answer keep-alive pings without waking the object (hibernation-friendly).
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/connect') return this.connectTab(request, url.searchParams);
    if (url.pathname === '/call' && request.method === 'POST') return json(await this.call(await request.json()));
    return new Response('Not found', { status: 404 });
  }

  connectTab(request, params) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const mode = params.get('mode') === 'identity' ? 'identity' : 'code';
    if (mode === 'code' && this.ctx.getWebSockets().length > 0) return new Response('Pairing code already in use', { status: 409 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(mode === 'identity'
      ? { mode, expect: params.get('id') || '', verified: false, focusedAt: 0, driving: false }
      : { mode, verified: true, focusedAt: Date.now(), driving: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  tabs() {
    return this.ctx.getWebSockets()
      .map(ws => ({ ws, meta: ws.deserializeAttachment() || {} }))
      .filter(t => t.meta.verified);
  }

  pickTab() {
    const tabs = this.tabs().sort((a, b) => (b.meta.focusedAt || 0) - (a.meta.focusedAt || 0));
    const chosen = tabs[0];
    if (!chosen) return null;
    // Keep exactly one tab marked "Claude is driving this tab".
    for (const t of tabs) {
      const active = t === chosen;
      if (!!t.meta.driving !== active) {
        t.ws.serializeAttachment({ ...t.meta, driving: active });
        try { t.ws.send(JSON.stringify({ type: 'driving', active })); } catch { /* closing */ }
      }
    }
    return chosen.ws;
  }

  async call({ tool, args, mode = 'code' }) {
    if (tool === '__connect' && mode === 'identity') {
      const count = this.tabs().length;
      return count
        ? { ok: true, result: { connected: true, tabs: count, note: 'No pairing code needed: tools reach the most recently focused VibeMol tab in the authorized browser.' } }
        : { ok: false, error: 'No VibeMol tab is open in the browser that authorized this connector. Ask the user to open vibemol.org there, or to pair with a code from the Claude menu.' };
    }
    const tab = this.pickTab();
    if (!tab) {
      return {
        ok: false,
        error: mode === 'identity'
          ? 'No VibeMol tab is open in the browser that authorized this connector. Ask the user to open vibemol.org in that browser, or to pair another browser with a code from the Claude menu (top right of VibeMol).'
          : 'No VibeMol tab is paired with this code. Ask the user to open the Claude menu in VibeMol, click Connect Claude, and paste the new message.',
      };
    }
    if (tool === '__connect') {
      tab.send('{"type":"paired"}');
      return { ok: true, result: { paired: true } };
    }
    const id = crypto.randomUUID();
    const reply = new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: `The VibeMol tab did not answer within ${CALL_TIMEOUT_MS / 1000} s. It may be in a background window; ask the user to bring it forward.` });
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, msg => { clearTimeout(timer); resolve(msg); });
    });
    tab.send(JSON.stringify({ type: 'call', id, tool, args: args || {} }));
    return reply;
  }

  async webSocketMessage(ws, message) {
    let msg = null;
    try { msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); } catch { return; }
    if (!msg) return;
    const meta = ws.deserializeAttachment() || {};
    if (msg.type === 'hello' && meta.mode === 'identity' && !meta.verified) {
      const ok = typeof msg.identity === 'string' && (await sha256b64(msg.identity)) === meta.expect;
      if (!ok) { ws.close(4003, 'identity mismatch'); return; }
      ws.serializeAttachment({ ...meta, verified: true, focusedAt: msg.focused ? Date.now() : 1 });
      ws.send('{"type":"ready"}');
      return;
    }
    if (msg.type === 'focus' && meta.verified) {
      ws.serializeAttachment({ ...meta, focusedAt: Date.now() });
      return;
    }
    if (msg.type === 'result' && meta.verified && this.pending.has(msg.id)) {
      const resolve = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      resolve(msg);
    }
  }

  webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch { /* already closed */ }
  }
}
