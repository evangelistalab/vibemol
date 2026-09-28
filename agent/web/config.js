// Claude connector settings. The only file you normally edit after deploying
// the relay (agent/relay): set relayUrl to its wss:// address, without /mcp.
(function (global) {
  const config = Object.assign(global.VibeMolAgentConfig || {}, {
    relayUrl: 'wss://vibemol-mcp.YOUR-SUBDOMAIN.workers.dev',
  });
  // Local testing without editing this file: on localhost only, a URL like
  // http://localhost:8000/?agentRelay=ws://localhost:8787 overrides relayUrl.
  try {
    const host = global.location && global.location.hostname;
    const override = new URLSearchParams(global.location.search).get('agentRelay');
    if (override && (host === 'localhost' || host === '127.0.0.1')) config.relayUrl = override;
  } catch { /* no location (tests) */ }
  global.VibeMolAgentConfig = config;
})(typeof window !== 'undefined' ? window : globalThis);
