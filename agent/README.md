# VibeMol agent (Claude connector)

Everything for letting a user's own Claude control their open VibeMol tab lives
in this directory. The rest of the app knows about it in exactly three places:

| Hook | Where | Purpose |
|---|---|---|
| `<span id="vibemolAgentMount">` | `index.html`, next to the GitHub link | where the Claude menu button renders |
| `<script src="./agent/web/loader.js">` | `index.html` (after `app.js`) | loads everything in `agent/web/` |
| `window.VibeMolAgentSeam` | end of `assets/app/js/app.js` | narrow list of existing internals the agent may call |

Delete those and the `agent/` folder and VibeMol is back to having no agent.

## Layout
```
agent/
  tools.schema.json   tool names + argument schemas, shared by browser and relay
  EXTENDING.md        guide Claude reads before adding features (also served by vibemol_help)
  web/
    loader.js         single entry point; loads the files below and link.css
    config.js         relayUrl (edit after deploying the relay)
    ui.js             generic UI reflection: list/operate any labeled control, keys, read text, opt-in scripts
    host.js           agent actions built on VibeMolAgentSeam (moves, trajectories, atoms, screenshots)
    tools.js          one handler per schema tool
    link.js/.css      Claude menu: automatic browser link, pairing-code fallback, driving badge
    identity.js       anonymous browser identity used by the connector's OAuth sign-in
    authorize.html    consent page Claude opens when the connector is added
    lasso.js          Lasso button: circle part of the page; Claude reads it with vibemol_get_selection
    source.js         read-only access to the served source (vibemol_read_source, lasso source locations)
    extensions.js     Claude-written JavaScript: the `ext` helper, saved extensions, file-format hooks
    vendor/           html2canvas 1.4.1 (MIT), loaded only when a lasso image is captured
  relay/              Cloudflare Worker: MCP endpoint, OAuth (auth.js), Durable Objects per code/browser
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
cd agent/relay && npx wrangler login
npx wrangler secret put AUTH_SECRET     # paste 32+ random characters, e.g. from: openssl rand -base64 48
npm run deploy
```
Set `relayUrl` in `web/config.js` to the printed address with `wss://`. `SITE_URL` in `relay/wrangler.toml`
must be the site users open (it hosts the consent page and owns the browser identity). Add any extra
site origins (for example a beta domain) to `ALLOWED_ORIGINS`. Without `AUTH_SECRET` the relay runs in
pairing-code-only mode. For local OAuth testing copy `relay/.dev.vars.example` to `relay/.dev.vars`.

## Connecting (users)
One-time: in Claude, Settings → Connectors → Add custom connector → `https://<relay>/mcp` (the Claude
menu in VibeMol has a copy button). Click **Connect**, then **Allow** on the VibeMol page that opens.
That page gives this browser an anonymous ID (no account) and Claude a token for it.

After that, every VibeMol tab in that browser links itself automatically; Claude's tools reach the
most recently focused one, which shows "Claude is driving this tab". Just ask Claude.

Other browser or device: open the Claude menu → "Pair with a code instead" → copy the message or
click Open in Claude. "Forget this browser" in the menu removes the ID.

Press **L** anywhere (outside text fields) to lasso part of the page for Claude.

## Extensions (features Claude adds)
New features are JavaScript that Claude writes and runs in the user's tab (with "Allow scripts" on and
the user approving each script). Working features are saved as extensions in that browser's
localStorage, re-run on load, and listed in the Claude menu (toggle, download, delete). Open the page
with `?noExtensions` to skip them once, for example if one breaks the page. See `EXTENDING.md`.
