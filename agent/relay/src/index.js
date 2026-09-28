import schema from '../../tools.schema.json' with { type: 'json' };
import { helpSearch } from './help.js';

export { PairingRelay } from './relay.js';

const SERVER_INFO = { name: 'vibemol', title: 'VibeMol', version: '0.1.0' };
const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const CODE_PATTERN = /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/;

const INSTRUCTIONS = `VibeMol (vibemol.org) is a browser molecular viewer. These tools control the user's own open VibeMol tab.
Workflow:
1. If you do not have a pairing code, ask the user to click "Connect Claude" in VibeMol and paste the code (format ABCDE-FGH23). Then call vibemol_connect.
2. Call vibemol_get_state before acting. Pass the same session code to every tab tool.
3. Pick the most direct route:
   a. Dedicated tools for structure edits (vibemol_list_atoms, vibemol_edit_atoms), moving molecules, and trajectories.
   b. vibemol_list_appearance_settings / vibemol_set_appearance for rendering settings (atom and bond sizes, colors, surfaces, background).
   c. For everything else (theme, sidebar, visibility, panels, modes, exports, newer features), find the real UI control with vibemol_list_controls and operate it with vibemol_operate_control; use vibemol_press_key for keyboard shortcuts (list: vibemol_read_text ref "helpOverlay").
   d. vibemol_run_script only as a last resort, and only if the user enabled scripts.
4. Distances are in Angstrom. For left/right/up/down/toward/away, use frame "screen" (x right, y up, z toward viewer).
5. After visual changes, call vibemol_screenshot to check the result. Structure edits are undoable with vibemol_history.
6. For "how do I…" questions, call vibemol_help and answer in terms of VibeMol's own UI.
7. When the user says "this", "what I circled", or "my selection", call vibemol_get_selection first. It returns an image of the circled region, the enclosed controls (their refs work with vibemol_operate_control), source locations for each element, and enclosed atom indices (usable with vibemol_edit_atoms).
Large files (cube, molden) stay in the browser: ask the user to open them in VibeMol rather than pasting them.`;

const SESSION_PROPERTY = { type: 'string', description: 'Pairing code shown in VibeMol after clicking "Connect Claude", e.g. ABCDE-FGH23.' };

const SERVER_TOOLS = [
  {
    name: 'vibemol_connect',
    description: 'Pair with the user\'s open VibeMol tab using the code it displays. Call once per conversation before other tab tools.',
    inputSchema: { type: 'object', properties: { session: SESSION_PROPERTY }, required: ['session'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'vibemol_help',
    description: 'Search VibeMol documentation (features, file types, panels, shortcuts). Does not need a paired tab.',
    inputSchema: { type: 'object', properties: { topic: { type: 'string' } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

const TAB_TOOLS = schema.tools.map(tool => ({
  name: tool.name,
  description: tool.description,
  inputSchema: {
    ...tool.inputSchema,
    properties: { session: SESSION_PROPERTY, ...(tool.inputSchema.properties || {}) },
    required: ['session', ...(tool.inputSchema.required || [])],
  },
  annotations: { readOnlyHint: !!(tool.annotations && tool.annotations.readOnlyHint) },
}));
const TAB_TOOL_NAMES = new Set(TAB_TOOLS.map(t => t.name));

export function normalizeCode(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const code = raw.length === 10 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
  return CODE_PATTERN.test(code) ? code : null;
}

const text = (value, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

function toToolResult(reply) {
  if (!reply || !reply.ok) return text(reply && reply.error ? reply.error : 'VibeMol reported an unknown error.', true);
  const result = reply.result || {};
  if (result.image && result.image.data) {
    const { image, ...rest } = result;
    const { data, mimeType, ...meta } = image;
    const details = Object.keys(rest).length ? { ...rest, image: meta } : meta;
    return { content: [{ type: 'image', data, mimeType: mimeType || 'image/jpeg' }, { type: 'text', text: JSON.stringify(details, null, 2) }] };
  }
  return text(result);
}

async function callTool(env, name, args = {}) {
  if (name === 'vibemol_help') return text(helpSearch(args.topic));
  if (name !== 'vibemol_connect' && !TAB_TOOL_NAMES.has(name)) return text(`Unknown tool: ${name}`, true);
  const code = normalizeCode(args.session);
  if (!code) return text('Missing or invalid pairing code. Ask the user to click "Connect Claude" in VibeMol and share the code it shows.', true);
  const { session, ...toolArgs } = args;
  const stub = env.RELAY.get(env.RELAY.idFromName(code));
  const response = await stub.fetch('https://relay/call', {
    method: 'POST',
    body: JSON.stringify({ tool: name === 'vibemol_connect' ? '__connect' : name, args: toolArgs }),
  });
  return toToolResult(await response.json());
}

async function handleRpc(env, msg) {
  const { id, method, params = {} } = msg || {};
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(-32600, 'Invalid request');
  if (id === undefined || id === null) return null; // notification (e.g. notifications/initialized)
  switch (method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      return ok({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: [...SERVER_TOOLS, ...TAB_TOOLS] });
    case 'tools/call': return ok(await callTool(env, params.name, params.arguments || {}));
    default: return fail(-32601, `Method not found: ${method}`);
  }
}

async function handleMcp(request, env) {
  if (request.method !== 'POST') return new Response('Use POST for MCP (Streamable HTTP, JSON responses).', { status: 405, headers: { allow: 'POST' } });
  let body;
  try { body = await request.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
  const replies = (await Promise.all((Array.isArray(body) ? body : [body]).map(m => handleRpc(env, m)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0]);
}

function handleTab(request, env, rawCode) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 });
  const code = normalizeCode(decodeURIComponent(rawCode));
  if (!code) return new Response('Invalid pairing code', { status: 400 });
  const stub = env.RELAY.get(env.RELAY.idFromName(code));
  return stub.fetch(new Request('https://relay/connect', request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') return handleMcp(request, env);
    const tab = /^\/tab\/([^/]+)$/.exec(url.pathname);
    if (tab) return handleTab(request, env, tab[1]);
    if (url.pathname === '/') return new Response('VibeMol MCP relay. Add <this origin>/mcp as a custom connector in Claude.\n');
    return new Response('Not found', { status: 404 });
  },
};
