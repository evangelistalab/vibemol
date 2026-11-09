# Connector consent

`connector-consent.html` and the existing browser adapter implement the initial
approval exchange. The shipped adapter has no consent authority. The page stays
unavailable even if a browser message, URL or global supplies a candidate key.
The Workbench launcher retains its enable and release behavior.

## Authority and browser exchange

The adapter pins an issuer origin, canonical MCP audience, and ECDSA P-256 SPKI
verification key in its source. Rotation requires a site deploy and a fresh
load of the script in open tabs. The test supplies an ephemeral pin by
substituting the single configuration literal in the served fixture script.

1. The authority opens `connector-consent.html`. With a valid pin, the page
   sends `vibemol.connector.consent.ready` to that opener at the pinned origin.
   It accepts `vibemol.connector.consent.request` from that window and origin.
   The signed request travels in the message body.
2. A request is an object with `payload` and `signature`, both unpadded
   base64url. The payload is UTF-8 JSON with purpose `connect`, `issuer`,
   `audience`, `challenge`, `grantId`, `clientId`, `clientName`, `scopes`,
   `issuedAt`, and `expiresAt`. Challenge and grant IDs are v4 UUIDs and times
   are Unix milliseconds. The lifetime is at most 120 seconds. Initial scopes
   are `read` and `select`. The authority signs UTF-8
   `"vibemol.connector.request.v1\\0" + payload` with ECDSA and SHA-256 using
   WebCrypto's 64-byte signature encoding.
3. The page verifies the envelope before discovering enabled tabs. Discovery
   on the same-origin `vibemol.connector.consent.v2` channel returns only
   availability and the correlation ID. Each enabled tab verifies the
   subsequent `prepare` envelope before displaying the signed client name and
   requested access. A native approval event must be trusted.
4. The tab remembers the approved request and page instance in memory. It
   signs UTF-8 `"vibemol.connector.approval.v1\\0" + JSON.stringify([payload,
   publicKeySpki, pageInstanceNonce])` and sends the key, nonce and proof. The
   private key stays in the tab closure. The page verifies and forwards one
   proof with the request to the opener as
   `vibemol.connector.consent.approved`. That means approval was sent.
   Registration is an authority transaction.

Same-origin listeners can observe the channel. The proof shows key possession.
The trusted-event requirement applies inside the adapter. Page-privileged
scripts can affect that trust boundary, including Google Analytics today and
any future extension scripts unless isolated from the approval UI and signer.

## Boundaries for the next cuts

The authority must consume the challenge atomically with registration. The
consent page accepts one verified proof, and the enabled tab declines a replay
of a challenge already presented in the same page instance. A real binding
requires authenticated confirmation of the exact grant and page instance.

A reload or tab release retires the key, nonce, approval and handles. The grant
survives detachment. A client with a valid credential for that grant can request
an atomic replacement binding at the current scopes. The user enables the new
tab and approves the named reconnect there. Explicit disconnect revokes the
grant and both token types.

Screenshot access starts off. Adding it requires a separate, trusted in-tab
approval for the current grant, page instance and permission revision.
Revocation removes screenshot access independently and invalidates older
approvals. Every call must authenticate its grant and check the tab's active
approval, current page instance and scope.
