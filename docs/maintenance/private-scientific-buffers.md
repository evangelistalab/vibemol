# Private scientific-buffer ownership

The alias audit found no current consumer that needs to mutate a published
scientific input. The app now adopts those inputs into private versions instead
of relying on that convention. This does not implement structural Undo.

`createScientificBufferOwner` is private to app.js, with no domain closure reads
and one optional violation reporter (1 input). Each bulk-reader wrapper has two
closure reads: the owner and the existing reader. There is no new script,
namespace, exported member, controller, or module-level `let`.

The intended observable changes are explicit: attempted writes through internal
published-source views now fail; shared-buffer adoption fails; retained session
captures are independent copies. Normal UI values, geometry and supported
encoded session/structure output must retain the unchanged golden contract.

The pure owner initializes before even the early function-reference guards.
Construction-order validation covers its helpers, the wrapper aliases, the
remaining readers, and all changed consumer-local bindings. No callback can
reach an unconstructed owner.

## Boundaries

App schema adoption, the orbital cache's explicit publication callback and
arithmetic-volume creation publish private scientific storage. Setters copy
subsequent whole-buffer or trajectory/vibration/Molden replacements. Numeric-bearing
Molden basis containers (basis, atom blocks, shells and primitives) also adopt on
replacement; their banks reject direct slot replacement while atomIndex remains
mutable. A regression test first demonstrated the raw-alias bypass and now rejects it. Source
samples, trajectory frames, equilibrium/displacements, MO coefficients and
primitive coefficients are protected. Parser/pure-helper results remain owned
by their callers until app adoption; creating an unrelated GridStore without
the app's publication callback does not grant access to the app's storage.

Ingress copies caller arrays. A draft exposes only its fresh writable copy;
sealing transfers its buffer, detaches all draft views, retires the token and
publishes a read-only facade. Shared buffers and foreign/reused/detached draft
tokens fail. Original caller buffers are never transferred or detached.

The facade exposes scalar reads and independent copies through `buffer`, `slice`
and `subarray`. Iteration callbacks receive the facade, never a backing view;
`valueOf` returns the facade. Indexed writes, mutators, property replacement and
prototype changes throw and report a named scientific-buffer write. Tests retain
inputs, draft aliases and exported copies and attempt writes in both directions.
This is structural isolation for ordinary consumers, not a security boundary
against arbitrary same-realm prototype monkeypatching.

The facade preserves `instanceof`, but native `ArrayBuffer.isView` deliberately
returns false. Structured-data copy adapters recognize its independent slice;
session validation still receives real arrays and its strict rules are unchanged.
The app does not patch `ArrayBuffer.isView` globally. The standing test's temporary
measurement adapter is separate from production.

Bulk readers receive one disposable native-array copy per operation. Grid loops
do not index through a Proxy and never allocate per sample. Trajectory frame
application and vibration phase evaluation also copy once at their frame
boundary, preserving the continuous phase calculation and its 0.2s delta cap. Arithmetic workers
receive copies rather than attempting to clone a facade; cooperative arithmetic
and Auto-iso similarly copy before their loops. Copies are not cached between
readers, so modifying one cannot poison a later read. The measured million-value
probe exposed the cost of direct Proxy indexing and is the reason for these
adapters; its raw durations are observations, not a performance gate.

The derived vibration `frameBuffer` remains writable, separately allocated from
equilibrium. Coordinates edits replace the frame bank through its owner rather
than assigning one slot in a sealed bank. Banks also trap slot writes explicitly,
because freeze alone would silently ignore assignment in non-strict app code. Basis atom indices and other structural
metadata remain mutable; coefficients do not. Unchanged sealed versions may be
shared, while a changed buffer is copied before publication. This supplies the
scientific-storage prerequisite, not the proposed history's metadata ownership.

## Named retained-capture case

Both `v0.9.5-pre-refactor` and main `d281e8f` reproduce the hazard: a held capture's
frame/atom/basis values change from `1 / 1 / 0` to `9 / 8 / 7` when live state is
edited. Supported export previously packed its copies before its first await;
no existing user-data corruption is claimed from this probe.

`captureVolume` now copies before returning, preserving within-capture aliases.
Full capture shares one copy memo across sources, preserving encoder buffer
deduplication both within and between volumes. It also owns record, graph, preset
and view metadata without duplicating the already copied volumes. The named unit cases retain a capture across a yield,
change live values and replacements, mutate capture data in the opposite direction,
and verify exported/decoded values. They do not rely on encode's current scheduling.

The ordinary Figure phase continues to trap declared read-only consumer inputs,
compare exact source bytes, require the worker routes and positive controls, and
assert zero residual contexts. Native protection remains finite coverage; it is
not a whole-program alias or reachability proof. Characterization alone is not
evidence for retained-capture independence.

Contract inventory: `tests/baselines/scientific-buffer-ownership.json`.

## Live integration controls

Byte stability alone cannot prove the owner is connected: a read-only workload
can pass on the old raw arrays. Every standing checkpoint now examines the actual
app record returned by the controller's getter, excluding parser outputs and
disposable render copies, and requires protected source views. Thirteen family
groups across the three cases exercise scalar, 2C, orbital, trajectory and
vibration storage. They attempt a real indexed write, verify its named rejection
and unchanged value, and mutate slice/buffer copies to prove isolation. Only the
one expected, verified rejection is removed from the diagnostic violation list;
unexpected reports or mutations remain failures and no source value is repaired.

The same new check deliberately rejects unchanged main59392f6 at cube.data, before
any mutation attempt. This negative control shows that removing app adoption
cannot leave the owner unit tests green while the browser check silently passes.
The original1e9cd5d candidate's complete103-check gate is archived unchanged; it
does not supply acceptance for this stricter revision.
