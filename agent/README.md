# VibeMol agent (Claude connector)

Everything for letting a user's own Claude control their open VibeMol tab lives
in this directory. The rest of the app knows about it in exactly three places:

| Hook | Where | Purpose |
|---|---|---|
| `<div id="vibemolAgentMount">` | `index.html` | where the Connect Claude controls render |
| `<script src="./agent/web/loader.js">` | `index.html` (after `app.js`) | loads everything in `agent/web/` |
| `window.VibeMolAgentSeam` | end of `assets/app/js/app.js` | narrow list of existing internals the agent may call |

Delete those and the `agent/` folder and VibeMol is back to having no agent.

## Layout
```
agent/
  tools.schema.json   tool names + argument schemas, shared by browser and relay
  web/
    loader.js         single entry point; loads the files below and link.css
    config.js         relayUrl (edit after deploying the relay)
    ui.js             generic UI reflection: list/operate any labeled control, keys, read text, opt-in scripts
    host.js           agent actions built on VibeMolAgentSeam (moves, trajectories, atoms, screenshots)
    tools.js          one handler per schema tool
    link.js/.css      Connect Claude button, pairing code, WebSocket to the relay
  relay/              Cloudflare Worker: MCP endpoint + one Durable Object per pairing code
  tests/              unit tests (run by `make test-unit`)
```

## How Claude reaches features
1. Most UI features need no agent code: `vibemol_list_controls` / `vibemol_operate_control`
   find and operate any labeled control. Give new buttons/inputs an `aria-label` or `data-tooltip`.
2. Rendering settings in the preset registry appear automatically in `vibemol_list_appearance_settings`.
3. Add a dedicated tool only when the UI can't express the action (canvas picking, precise numeric edits):
   add it to `tools.schema.json`, a handler in `web/tools.js`, logic in `web/host.js`, and, only if a new
   internal is required, one entry in `VibeMolAgentSeam`. Then redeploy the relay.

## Local development
```bash
cd agent/relay && npm install && npm run dev     # relay on http://localhost:8787
python3 -m http.server 8000                      # from the repo root; open http://localhost:8000
```
Open `http://localhost:8000/?agentRelay=ws://localhost:8787` to point the page at the local relay
(the override only works on localhost), or set `relayUrl` in `web/config.js` (don't commit that).
Opening `index.html` as a file does not work; serve it over http.
`npm run inspect` opens the MCP Inspector (connect it to `http://localhost:8787/mcp`).

## Deploy (Cloudflare Workers free plan)
```bash
cd agent/relay && npx wrangler login && npm run deploy
```
Set `relayUrl` in `web/config.js` to the printed address with `wss://`. Add any extra site origins
(for example a beta domain) to `ALLOWED_ORIGINS` in `relay/wrangler.toml`.

## Connect in Claude
1. Customize → Connectors → Add custom connector → `https://<relay>/mcp`.
2. In VibeMol click **Connect Claude** and copy the pairing code.
3. In a new chat: "Connect to VibeMol ABCDE-FGH23, then …".
