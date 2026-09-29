import { DurableObject } from 'cloudflare:workers';

const CALL_TIMEOUT_MS = 30000;
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

/**
 * One Durable Object per pairing code. It holds the VibeMol tab's WebSocket
 * and forwards tool calls from the MCP endpoint to that tab.
 */
export class PairingRelay extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.pending = new Map();
    // Answer keep-alive pings without waking the object (hibernation-friendly).
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/connect') return this.connectTab(request);
    if (pathname === '/call' && request.method === 'POST') return json(await this.call(await request.json()));
    return new Response('Not found', { status: 404 });
  }

  connectTab(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    if (this.ctx.getWebSockets().length > 0) return new Response('Pairing code already in use', { status: 409 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async call({ tool, args }) {
    const [tab] = this.ctx.getWebSockets();
    if (!tab) {
      return { ok: false, error: 'No VibeMol tab is paired with this code. Ask the user to open the Claude menu in VibeMol, click Connect Claude, and paste the new message.' };
    }
    if (tool === '__connect') {
      tab.send('{"type":"paired"}');
      return { ok: true, result: { paired: true } };
    }
    const id = crypto.randomUUID();
    const reply = new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: `The VibeMol tab did not answer within ${CALL_TIMEOUT_MS / 1000} s.` });
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, msg => { clearTimeout(timer); resolve(msg); });
    });
    tab.send(JSON.stringify({ type: 'call', id, tool, args: args || {} }));
    return reply;
  }

  webSocketMessage(ws, message) {
    let msg = null;
    try { msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); } catch { return; }
    if (msg && msg.type === 'result' && this.pending.has(msg.id)) {
      const resolve = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      resolve(msg);
    }
  }

  webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch { /* already closed */ }
  }
}
