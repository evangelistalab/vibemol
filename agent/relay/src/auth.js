/*
 * OAuth for the VibeMol connector, so users never type a pairing code.
 *
 * When a user adds the connector, Claude runs the standard MCP OAuth flow
 * (dynamic client registration + PKCE). Our /authorize step sends them to a
 * consent page on the VibeMol site (agent/web/authorize.html). That page owns a
 * random, anonymous browser identity kept in the site's localStorage; on
 * "Allow" it posts the identity back here and we issue Claude a token bound to
 * sha256(identity). VibeMol tabs in that browser register under the same hash,
 * so tool calls reach them with no code. No accounts, emails, or storage: every
 * client id, code and token is an HMAC-signed blob (AUTH_SECRET).
 */

const enc = new TextEncoder();
const ACCESS_TTL_S = 24 * 3600;
const REFRESH_TTL_S = 180 * 24 * 3600;
const CODE_TTL_S = 300;
const REQUEST_TTL_S = 900;

export const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

export async function sha256b64(text) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

const keyCache = new Map();
async function hmacKey(secret) {
  if (!keyCache.has(secret)) {
    keyCache.set(secret, crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  }
  return keyCache.get(secret);
}

/** Sign a JSON payload of a given type: base64url(json).base64url(hmac). */
export async function seal(secret, typ, payload, ttlSeconds) {
  const body = { ...payload, typ, ...(ttlSeconds ? { exp: Math.floor(Date.now() / 1000) + ttlSeconds } : {}) };
  const data = b64url(enc.encode(JSON.stringify(body)));
  const sig = b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
  return `${data}.${sig}`;
}

/** Verify and decode; returns null if forged, expired, or of another type. */
export async function open(secret, typ, token) {
  const [data, sig] = String(token || '').split('.');
  if (!data || !sig) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(data)); } catch { return null; }
  if (!ok) return null;
  let body;
  try { body = JSON.parse(new TextDecoder().decode(fromB64url(data))); } catch { return null; }
  if (body.typ !== typ) return null;
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

const DEFAULT_REDIRECTS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];

/** Redirects allowed for registered clients: Claude's callbacks, loopback (Inspector, Claude Code), plus ALLOWED_REDIRECTS. */
export function redirectAllowed(env, uri) {
  let url;
  try { url = new URL(uri); } catch { return false; }
  if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return true;
  const extra = String(env.ALLOWED_REDIRECTS || '').split(',').map(s => s.trim()).filter(Boolean);
  return [...DEFAULT_REDIRECTS, ...extra].some(allowed => uri === allowed || (allowed.endsWith('*') && uri.startsWith(allowed.slice(0, -1))));
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors, ...headers } });
const oauthError = (error, description, status = 400) => jsonResponse({ error, error_description: description }, status);

export const authEnabled = env => typeof env.AUTH_SECRET === 'string' && env.AUTH_SECRET.length >= 32;

export function metadata(origin) {
  return {
    protectedResource: {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ['header'],
      scopes_supported: ['vibemol'],
      resource_name: 'VibeMol',
    },
    authorizationServer: {
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['vibemol'],
    },
  };
}

/** 401 that tells MCP clients where to start OAuth. */
export function challenge(origin, detail = 'Authorization required') {
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: detail }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': `Bearer realm="VibeMol", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      ...cors,
    },
  });
}

/** Returns the identity hash for a valid access token, or null. */
export async function identityFromRequest(env, request) {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const token = await open(env.AUTH_SECRET, 'access', match[1].trim());
  return token ? token.sub : null;
}

function siteUrl(env) {
  return String(env.SITE_URL || 'https://vibemol.org').replace(/\/+$/, '');
}

export async function handleAuth(request, env) {
  const url = new URL(request.url);
  const origin = url.origin;
  const { pathname } = url;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const meta = metadata(origin);

  if (pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp') {
    return jsonResponse(meta.protectedResource);
  }
  if (pathname === '/.well-known/oauth-authorization-server' || pathname === '/.well-known/oauth-authorization-server/mcp' || pathname === '/.well-known/openid-configuration') {
    return jsonResponse(meta.authorizationServer);
  }

  // Dynamic client registration: the client id is a signed record of its redirects.
  if (pathname === '/register' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return oauthError('invalid_client_metadata', 'Body must be JSON.'); }
    const redirects = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
    if (!redirects.length) return oauthError('invalid_redirect_uri', 'redirect_uris is required.');
    const refused = redirects.filter(uri => !redirectAllowed(env, uri));
    if (refused.length) return oauthError('invalid_redirect_uri', `Redirect not allowed: ${refused.join(', ')} (add it to ALLOWED_REDIRECTS).`);
    const clientName = String(body.client_name || 'MCP client').slice(0, 80);
    const clientId = await seal(env.AUTH_SECRET, 'client', { r: redirects, n: clientName });
    return jsonResponse({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirects,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }, 201);
  }

  // Step 1: validate, then hand off to the consent page on the VibeMol site.
  if (pathname === '/authorize' && request.method === 'GET') {
    const q = url.searchParams;
    const client = await open(env.AUTH_SECRET, 'client', q.get('client_id'));
    const redirect = q.get('redirect_uri') || '';
    if (!client) return new Response('Unknown client. Remove and re-add the connector in Claude.', { status: 400 });
    if (!client.r.includes(redirect)) return new Response('redirect_uri does not match the registered client.', { status: 400 });
    if (q.get('response_type') !== 'code') return new Response('response_type must be code.', { status: 400 });
    if (!q.get('code_challenge') || (q.get('code_challenge_method') || 'plain') !== 'S256') return new Response('PKCE with S256 is required.', { status: 400 });
    const req = await seal(env.AUTH_SECRET, 'authreq', {
      c: q.get('client_id'), n: client.n, r: redirect, ch: q.get('code_challenge'), s: q.get('state') || '', sc: q.get('scope') || 'vibemol',
    }, REQUEST_TTL_S);
    const consent = new URL(`${siteUrl(env)}/agent/web/authorize.html`);
    consent.searchParams.set('req', req);
    consent.searchParams.set('client', client.n);
    consent.searchParams.set('to', new URL(redirect).host);
    // Lets localhost test pages talk to this relay; ignored by the page on other hosts.
    consent.searchParams.set('agentRelay', origin.replace(/^http/, 'ws'));
    return Response.redirect(consent.href, 302);
  }

  // Step 2: the consent page posts the browser identity (or a denial) here.
  if (pathname === '/authorize/complete' && request.method === 'POST') {
    const form = await request.formData();
    const req = await open(env.AUTH_SECRET, 'authreq', form.get('req'));
    if (!req) return new Response('This sign-in link expired. Start again from Claude.', { status: 400 });
    const back = new URL(req.r);
    if (req.s) back.searchParams.set('state', req.s);
    if (form.get('decision') !== 'allow') {
      back.searchParams.set('error', 'access_denied');
      return Response.redirect(back.href, 302);
    }
    const identity = String(form.get('identity') || '');
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(identity)) return new Response('Missing browser identity.', { status: 400 });
    const code = await seal(env.AUTH_SECRET, 'code', { c: req.c, r: req.r, ch: req.ch, sub: await sha256b64(identity), sc: req.sc }, CODE_TTL_S);
    back.searchParams.set('code', code);
    return Response.redirect(back.href, 302);
  }

  if (pathname === '/token' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    if (!form) return oauthError('invalid_request', 'Expected application/x-www-form-urlencoded.');
    const grant = form.get('grant_type');
    let sub, scope, clientId;
    if (grant === 'authorization_code') {
      const code = await open(env.AUTH_SECRET, 'code', form.get('code'));
      if (!code) return oauthError('invalid_grant', 'Code is invalid or expired.');
      if (form.get('client_id') && form.get('client_id') !== code.c) return oauthError('invalid_grant', 'Code was issued to another client.');
      if (form.get('redirect_uri') && form.get('redirect_uri') !== code.r) return oauthError('invalid_grant', 'redirect_uri mismatch.');
      const verifier = String(form.get('code_verifier') || '');
      if (!verifier || (await sha256b64(verifier)) !== code.ch) return oauthError('invalid_grant', 'PKCE verification failed.');
      ({ sub, sc: scope, c: clientId } = code);
    } else if (grant === 'refresh_token') {
      const refresh = await open(env.AUTH_SECRET, 'refresh', form.get('refresh_token'));
      if (!refresh) return oauthError('invalid_grant', 'Refresh token is invalid or expired.');
      ({ sub, sc: scope, c: clientId } = refresh);
    } else {
      return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
    }
    return jsonResponse({
      access_token: await seal(env.AUTH_SECRET, 'access', { sub, sc: scope }, ACCESS_TTL_S),
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_S,
      refresh_token: await seal(env.AUTH_SECRET, 'refresh', { sub, sc: scope, c: clientId }, REFRESH_TTL_S),
      scope,
    });
  }
  return null;
}
