"""Freeze the corrected PR revision after all local evidence is complete."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

r=Path('/Users/fevange/Source/vibemol');o=r/'out/test-artifacts/stage4/pubchem-fixed';w=r/'out/test-artifacts/stage4/pubchem/source-worktree'
git=lambda *args:subprocess.check_output(['git',*args],cwd=w,text=True).strip()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
local=json.loads((o/'local-validation.json').read_text())
assert git('branch','--show-current')=='codex/pubchem-controller' and not git('status','--porcelain')
assert local['appSha256']==sha(w/'assets/app/js/app.js')=='cd069b02c7290e71e3ab45020a2be3a051655d1a427f209b3a4404d093e97fa8'
assert local['pubchemSha256']==sha(w/'assets/app/js/pubchem.js')=='e26de75bae7fcdfd8edc159cb08d8ba812daa68a308ea2e29063332681d62cd5'
assert local['qaSha256']==sha(w/'assets/app/js/qa-characterize.js')
assert local['genuineControllerDependencyCount']==13<15 and local['trackedLetAfter']==262
assert local['characterization']['runs']==2 and local['characterization']['captures']==102 and local['characterization']['allMinimaMet']
assert local['manualMatrix']['semanticReadbacksExact'] and local['constructionOrder']['otherStagesPassed']
order=json.loads((o/'construction-order-final.json').read_text())
assert order['toolSha256']==sha(w/'tools/audit-construction-order.cjs')
base='6c583556bcc84bff9442602a7dd8aed056b4a660'
assert git('merge-base',base,'HEAD')==base
protected=git('diff','--name-only',base,'--','assets','src','index.html','Makefile','.github','tools','tests/e2e','tests/unit','tests/fixtures').splitlines()
assert protected==['Makefile','assets/app/js/app.js','assets/app/js/pubchem.js','index.html','tests/e2e/look_references.py','tools/audit-construction-order.cjs'],protected
assert sha(w/'tests/e2e/look_references.py')=='2a1c894c25894779414bb7ca439d5b93fb6feab3a9436760fb76c1a2b340ec87'
cfg=dict(branch='codex/pubchem-controller',baseBranch='codex/app-js-decomposition',head=git('rev-parse','HEAD'),base=base,tree=git('rev-parse','HEAD^{tree}'),
 appSha256=local['appSha256'],pubchemSha256=local['pubchemSha256'],qaSha256=local['qaSha256'],controllerDependencyCount=13,
 controllerInputs=local['genuineControllerInputs'],letBefore=265,letAfter=262,newControllers=1,auditGroup='Corrected PubChem search/import/metadata',stage=4,
 ciFormat='sharded-with-independent-joins',candidateWorktree=str(w),localVerificationComplete=True,frozenAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
 sourceAuditSha256=sha(o/'independent-source-audit/audit-report.json'),localValidationSha256=sha(o/'local-validation.json'),constructionOrderSha256=sha(o/'construction-order-final.json'),
 originalFailedCandidate=local['originalCandidate'],productionFixCommit=git('rev-parse','35fd791'),pr=24,prUrl='https://github.com/evangelistalab/vibemol/pull/24',
 singlePr='Authorized correction on existing PR24. One own automatic first-pass ordinary CI on this fixed head. Original failed head/run and diagnostics preserved; no retry, dispatch, amendment or further branch push after freeze.')
with (o/'frozen-candidate.json').open('x') as f:f.write(json.dumps(cfg,indent=2)+'\n')
body=f'''The original PubChem extraction introduced an initialization-order regression: ordinary autosave restoration called the hoisted metadata wrapper before `pubchemController` existed. Construct the same inert controller immediately after `els`, so synchronous restoration can render metadata and finish reference migration. All 13 eager inputs are ready or hoisted; construction only captures dependencies, initializes private state and returns frozen methods. It performs no DOM/network work, listener registration or input callback. Original DOM-query and late listener positions remain unchanged.

This is the corrected revision of the single Stage 4 PR. Original `25fd30a` and rejected CI39057387687 (32/5/37) remain preserved. Instrumented three-source diagnostic39062919011 passed tagged/integration and failed only the original candidate; neither diagnostic nor the rejected run supplies merge evidence.

The error was caught by `restoreAppearancePresetAutosave`, logged as `console.warn` and returned as false to an ignoring caller. A controlled tagged-base failure independently reproduced partial restoration: identical rendered settings, but Basic/Basic modified references instead of Opal/Classic unmodified. This separate restore reliability defect is filed/carried as **#25**, without a rollback/user-error fix in this PR. Generic goldens use `appearanceStudy=1` and skip autosave; their earlier success never covered this path.

## Manual verification

- Fixed source passed the full instrumented `look_references.py`, including both original migration cases: `[opal, classic]` / `[false, false]` and `[classic, classic]` / `[false, false]`. Original predicates, readiness and waits are unchanged; both comparands/resolved state are emitted before either assertion.
- All **72 fixed native PubChem cases** matched the preserved immutable **72-case tagged control**, using the exact same harness: 18 scenarios across Workbench/legacy and light/dark. Covers search by click/Enter, autocomplete/cache/stale-token behavior, metadata/import preservation, HTTP/transport failure, malformed JSON/schema/SDF, metadata fallback and real browser request aborts at CID/SDF/autocomplete. No forced clicks, production handler replacements or cancellation UI was added.
- The inverse construction audit now checks incoming readers/callers and conservatively synchronous callback escape. **Stages1–3 and fixed4 pass; original4 is rejected as the negative control.** Introduced module/helper scopes, every reading reference, earliest possible activation and constructor proof are retained. The check and assertion-comparand rule are standing AGENTS requirements; Stage5 remains design only.
- Independent complete-source audit: **1,229 checks**, all **1,190** original declarations accounted for; **19** moved implementations exact after inverse lexical substitution, **1,171** other app declarations byte-identical. Full app/module reconstructions match. The old named-call-only exemption is explicitly superseded.
- Checks, **433 JS/29 Python** tests and local **102 unchanged goldens twice** passed, exact serialized repeat/zero diagnostic pixel changes. All **52 slots ×8 contexts**, fixed **47 live+5 known-absent Workbench /48+4 legacy**, every current observer/checkpoint minimum. Local characterization **{local['characterization']['wallTimeSeconds']:.2f}s**, Chromium **{local['characterization']['browserVersion']}**.

Tracked app lets **265 →262**; **13 genuine used controller dependencies**, under15. Periodic factory remains **11** (ten non-DOM+els). App **32,669 lines /1,163 direct declarations**, module **480 lines /21 declarations**. No golden, fixture, QA, workflow, expected predicate or wait changed; the exact authorized test logging and standalone audit tool are disclosed.

## CI

Pending this frozen corrected head's own first automatic ordinary CI. Merge requires the complete first-pass **34/3/37** conjunction, exact accepted raw failing workflows, 102 goldens twice/exact repeat, 52 slots/eight contexts/all minima, checks/unit/WebKit and both material-family paths. The baseline-record workflow must skip normally. No bare retry or diagnostic can satisfy the gate.

## Carried findings

Keep #3, #11, axis Escape/Coordinates Delete, #21 layout collapse (priority above #17), #17 and follow-ups #5/#14/#15, the material-preset intermittent and new #25. The rejected original PubChem run **did not cover either material-family path**; its recurrence status is **not assessed**, not “did not recur.” Stage5 design/notes are accepted, its mirror hypothesis is recorded as refuted, and no Stage5 implementation is included.

Evidence: `tests/baselines/evidence/stage4/pubchem/ordering-correction/`, `construction-order/`, `restore-fault/`, the preserved failed/diagnostic CI folders, and `tests/baselines/pubchem-validation.json`.
'''
(o/'pr-body-at-freeze.md').write_text(body)
print(json.dumps(cfg,indent=2))
