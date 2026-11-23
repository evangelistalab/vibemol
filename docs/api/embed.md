# VibeMol embed bridge (protocol 1)

## Authorization and scope

Francesco authorizes this step as a continuation of the command registry v0 exception: **an embedded command bridge and a Python notebook widget built on `window.VibeMolCommands`**. Every limit from the registry prompts still applies, plus two more:

- No UI rerouting, no undo, no connector-prototype code, no Edit API audit widening.
- **No change to `assets/app/js/app.js`**: the 260/260 let-binding ratchet and the construction audit stay unchanged.
- **No new `window.VibeMol*` namespace and no change to existing namespace members**, so the promoted golden still matches and no new recording is needed.
- **No new product capabilities.** The bridge only transports registry commands and reports state that existing read commands expose. Orbital commands are Step 3b, under a separate prompt.
- **Don't publish anything** to PyPI, npm or any other index.

## Activation

Embed a compatible VibeMol page in an iframe with `?embed=commands#vmtoken=<token>`. The fragment must contain at least 32 URL-safe characters from `A–Z`, `a–z`, `0–9`, `_` and `-`. The bridge reads the token into memory and removes the fragment with `history.replaceState`. It installs listeners only when both URL parameters match. The notebook [Viewer](../../python/README.md) generates a random token for each instance.

## Messages

Every message contains `{ channel: 'vibemol.embed', v: 1, token, kind }` and the fields below.

| Direction | Kind | Additional fields | Meaning |
| --- | --- | --- | --- |
| Page → parent | `ready` | `info` | Sends the `app.info` value once the registry is available. |
| Parent → page | `request` | `id`, `command`, `params` | Runs `VibeMolCommands.run(command, params)`. The parent supplies a string ID. |
| Page → parent | `response` | `id`, `result` | Replies in completion order with the original ID and unchanged registry result envelope. |
| Page → parent | `state` | `state: { selection, calculations }` | Sends a changed snapshot from `edit.getSelection` and `calculations.state`. An unsuccessful read contributes `null`. |

The bridge reads state after a command marked `mutates` completes and after captured `pointerup`, `keyup` or `change` events, debounced by 150 ms. It compares canonical JSON before sending a snapshot. See the [command registry](commands.md) for available commands, parameters and result envelopes.

The bridge accepts at most 32 concurrent requests. Above that it replies with `failed` and `details.code: 'bridge-busy'`. A JSON request above 50 MB (52,428,800 UTF-8 bytes) receives `invalid-params` and `details.code: 'too-large'`.

## Message validation

The page accepts a request only from its direct parent window and requires matching channel, version and token. It silently ignores messages that fail these checks. The notebook widget applies the same envelope checks and verifies the iframe is the sender. The token belongs in the fragment so browsers keep it out of the HTTP request.

Replies target the request's origin, with `'*'` for an opaque origin reported as `'null'`. The initial `ready` goes to the direct parent with `'*'` because the page has yet to learn its origin. Input-triggered snapshots target the last authenticated request origin after the first request.

The legacy `vibemol:load-files` handler still supports the standalone [`vibemol()` iframe helper](../../api/README.md). Use `vibemol.embed` for a command result or live selection readback.
