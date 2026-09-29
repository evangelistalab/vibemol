import schema from '../../tools.schema.json' with { type: 'json' };
import { helpSearch } from './help.js';
import { authEnabled, challenge, handleAuth, identityFromRequest } from './auth.js';

export { PairingRelay } from './relay.js';

const SERVER_INFO = { name: 'vibemol', title: 'VibeMol', version: '0.1.0' };
const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const CODE_PATTERN = /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/;

const INSTRUCTIONS = `VibeMol (vibemol.org) is a browser molecular viewer. These tools control the user's own open VibeMol tab.
Workflow:
1. Usually no pairing is needed: when the user authorized this connector, tools reach the VibeMol tab they most recently used in that browser. Just call the tools (start with vibemol_get_state) and omit "session".
   Only if a tool reports that no tab is open, ask the user to open vibemol.org in the browser where they authorized the connector. For another browser or device, they can pair with a code: they say "connect to Vibemol ABCDE-FGH23" (from the Claude menu at the top right of VibeMol); call vibemol_connect with it and pass that code as "session" in every later call.
2. Call vibemol_get_state before acting.
3. Pick the most direct route:
   a. Dedicated tools for structure edits (vibemol_list_atoms, vibemol_edit_atoms), moving molecules, and trajectories.
   b. vibemol_list_appearance_settings / vibemol_set_appearance for rendering settings (atom and bond sizes, colors, surfaces, background).
   c. For everything else that already exists in VibeMol (theme, sidebar, visibility, panels, modes, exports), find the real UI control with vibemol_list_controls and operate it with vibemol_operate_control; use vibemol_press_key for keyboard shortcuts (list: vibemol_read_text ref "helpOverlay").
   d. NEW functionality (a visualization, file format, panel, button, analysis) is built by writing JavaScript: VibeMol is a browser app, so adding features means adding JavaScript to the user's tab. Never say it requires a source-code change. First read vibemol_help topic "extending VibeMol" and study the relevant existing code with vibemol_read_source; prototype with vibemol_run_script; verify with vibemol_screenshot; then keep it with vibemol_save_extension so it survives reloads. If scripts are off, ask the user to tick "Allow scripts" in the Claude menu.
4. Distances are in Angstrom. For left/right/up/down/toward/away, use frame "screen" (x right, y up, z toward viewer).
5. After visual changes, call vibemol_screenshot to check the result. Structure edits are undoable with vibemol_history.
6. For "how do I…" questions, call vibemol_help and answer in terms of VibeMol's own UI.
7. Saved extensions live only in this user's browser. If a feature should ship to all VibeMol users, suggest downloading it from the Claude menu and turning it into a pull request.
8. When the user says "this", "what I circled", or "my selection", call vibemol_get_selection first. It returns an image of the circled region, the enclosed controls (their refs work with vibemol_operate_control), source locations for each element, and enclosed atom indices (usable with vibemol_edit_atoms).
Large files (cube, molden) stay in the browser: ask the user to open them in VibeMol rather than pasting them.`;

const SESSION_PROPERTY = { type: 'string', description: 'Optional pairing code from a "connect to Vibemol ABCDE-FGH23" message. Omit it to use the tab in the browser that authorized the connector.' };

const SERVER_TOOLS = [
  {
    name: 'vibemol_connect',
    description: 'Check which VibeMol tab Claude will control. Without "session": reports tabs open in the browser that authorized the connector. With a pairing code: pairs with that tab (for another browser or device).',
    inputSchema: { type: 'object', properties: { session: SESSION_PROPERTY }, additionalProperties: false },
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
    required: [...(tool.inputSchema.required || [])],
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

async function callTool(env, name, args = {}, identity = null) {
  if (name === 'vibemol_help') return text(helpSearch(args.topic));
  if (name !== 'vibemol_connect' && !TAB_TOOL_NAMES.has(name)) return text(`Unknown tool: ${name}`, true);
  const { session, ...toolArgs } = args;
  let channel, mode;
  if (session) {
    const code = normalizeCode(session);
    if (!code) return text('That pairing code is not valid. Ask the user to copy the message from the Claude menu (top right of VibeMol) again.', true);
    channel = code; mode = 'code';
  } else if (identity) {
    channel = `id:${identity}`; mode = 'identity';
  } else {
    return text('No VibeMol tab is linked yet. Ask the user to open the Claude menu (top right of VibeMol), click Connect Claude, and paste the copied message.', true);
  }
  const stub = env.RELAY.get(env.RELAY.idFromName(channel));
  const response = await stub.fetch('https://relay/call', {
    method: 'POST',
    body: JSON.stringify({ tool: name === 'vibemol_connect' ? '__connect' : name, args: toolArgs, mode }),
  });
  return toToolResult(await response.json());
}

async function handleRpc(env, msg, identity) {
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
    case 'tools/call': return ok(await callTool(env, params.name, params.arguments || {}, identity));
    default: return fail(-32601, `Method not found: ${method}`);
  }
}

async function handleMcp(request, env) {
  const origin = new URL(request.url).origin;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id', 'access-control-allow-methods': 'POST, OPTIONS' } });
  // With AUTH_SECRET set, the connector uses OAuth: no token → start sign-in.
  let identity = null;
  if (authEnabled(env)) {
    identity = await identityFromRequest(env, request);
    if (!identity) return challenge(origin);
  }
  if (request.method !== 'POST') return new Response('Use POST for MCP (Streamable HTTP, JSON responses).', { status: 405, headers: { allow: 'POST' } });
  let body;
  try { body = await request.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
  const replies = (await Promise.all((Array.isArray(body) ? body : [body]).map(m => handleRpc(env, m, identity)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0]);
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin') || '';
  return String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean).includes(origin);
}

function handleTab(request, env, rawCode) {
  if (!originAllowed(request, env)) return new Response('Origin not allowed', { status: 403 });
  const code = normalizeCode(decodeURIComponent(rawCode));
  if (!code) return new Response('Invalid pairing code', { status: 400 });
  const stub = env.RELAY.get(env.RELAY.idFromName(code));
  return stub.fetch(new Request('https://relay/connect?mode=code', request));
}

// Tabs of a browser that authorized the connector. The path carries only the
// identity's hash; the tab proves it holds the identity in its first message.
function handleIdentityTab(request, env, hash) {
  if (!originAllowed(request, env)) return new Response('Origin not allowed', { status: 403 });
  if (!/^[A-Za-z0-9_-]{43}$/.test(hash)) return new Response('Invalid identity', { status: 400 });
  const stub = env.RELAY.get(env.RELAY.idFromName(`id:${hash}`));
  return stub.fetch(new Request(`https://relay/connect?mode=identity&id=${hash}`, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') return handleMcp(request, env);
    const tab = /^\/tab\/([^/]+)$/.exec(url.pathname);
    if (tab) return handleTab(request, env, tab[1]);
    const idTab = /^\/tab-identity\/([^/]+)$/.exec(url.pathname);
    if (idTab) return handleIdentityTab(request, env, idTab[1]);
    if (authEnabled(env)) {
      const auth = await handleAuth(request, env);
      if (auth) return auth;
    }
    if (url.pathname === '/') return new Response('VibeMol MCP relay. Add <this origin>/mcp as a custom connector in Claude.\n');
    return new Response('Not found', { status: 404 });
  },
};
