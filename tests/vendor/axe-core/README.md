# axe-core (test only)

Unmodified `axe.min.js` and `LICENSE` from the official npm `axe-core@4.11.0`
package. This pinned audit dependency is injected only by browser QA, never
loaded by the app. Audits run offline, including CI.

- Source: https://registry.npmjs.org/axe-core/-/axe-core-4.11.0.tgz
- Tarball integrity (verified before extraction): `sha512-ilYanEU8vxxBexpJd8cWM4ElSQq4QctCLKih0TSfjIfCQTeyH/6zVrmIJfLPrKTKJRbiG+cfnZbQIjAlJmF1jQ==`
- `axe.min.js` SHA-256: `e9e5863c33a874f09bc01acd9234b7e3c871479f5eef8802fa582544465e6d01`
- API: https://github.com/dequelabs/axe-core/blob/v4.11.0/doc/API.md

To upgrade, verify the new package integrity, replace these two files, update
the version/hash in `tests/e2e/accessibility.py`, and review a new baseline.
