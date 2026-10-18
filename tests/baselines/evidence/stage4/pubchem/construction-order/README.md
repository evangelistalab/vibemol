# Inverse construction-order audit

The old outgoing closure inventory missed the incoming startup caller. This audit enumerates new or changed-kind app bindings, new helper locals and each new extracted module's locals, records every reading reference, traces the earliest possible invoking/escaping context, and compares that bound with completion of construction. A callback handed to another module is conservatively callable immediately. `var` values are checked as well as lexical TDZ bindings. Only an independently parsed inert eager constructor permits a returned-method activation after construction. Full source hashes and all paths are in report.json.gz.

Stages 1–3 pass, including all seven other Stage 1 consumers and repeated els/cacheElement/periodic-controller audits after every cache group. The original Stage 4 candidate fails as the deliberate negative control; corrected Stage 4 passes. No additional unreviewed pre-construction exposure was found. Conservative warnings on the original candidate are possible paths, not claims that every branch ran. The actual restore stack is independently captured in ../restore-fault/result.json.

Run from the candidate repository checkout, with full historical Git objects present:

```sh
# Test-only packages, outside production and ignored by Git:
npm install --prefix out/test-artifacts/construction-order/runtime --no-save --ignore-scripts @babel/parser@7.24.4 @babel/traverse@7.24.1
VIBEMOL_BABEL_ROOT="$PWD/out/test-artifacts/construction-order/runtime/node_modules/@babel" node tools/audit-construction-order.cjs --self-test
VIBEMOL_BABEL_ROOT="$PWD/out/test-artifacts/construction-order/runtime/node_modules/@babel" node tools/audit-construction-order.cjs tests/baselines/evidence/stage4/pubchem/construction-order/config.json out/test-artifacts/construction-order/report.json
```

The final configuration reads corrected Stage 4 from the current working tree and historical stages from their exact Git references. The tool is a conservative syntax/callback-exposure check, not a general JavaScript verifier. An unresolved early activation fails closed; complete runtime gates remain required. No production code is executed or modified by the audit.
