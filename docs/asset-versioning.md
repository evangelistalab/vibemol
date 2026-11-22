# Release asset versions

`assets/app/js/asset-urls.js` owns the single `APP_VERSION` constant. The main app reads it for the toolbar, Help, welcome screen, and export metadata. The bootstrap itself loads with the same version query as every other local script.

For a release, run:

```sh
python3 tools/sync_asset_versions.py --version <release-version>
make check
```

Replace the placeholder with the intended release number. Alternatively, edit the constant and run `make version-assets`. Commit the generated changes with the release. `make check` rejects stale generated URLs. Beta deployment is retired. The web app still runs directly from the committed files with no build step; VS Code packaging copies those same files and preserves their query strings.

The generator stamps all local script, stylesheet, image, icon, and preload URLs in the production `index.html`, plus local `url()` references in application stylesheets (including fonts). HTML attributes are generated before the browser parses the document, so its preload scanner never requests an unversioned script. Script order is unchanged. Historical standalone experiments are not production entry points.

`VibeMolAssets.url(path)` adds the same `v` query to runtime requests for bundled workers, worker imports, MINAO basis data, fragment manifests/XYZ files, samples, environment textures, and Look previews. Other query values and fragments are retained. External services, blob/data URLs, navigation, and user file URLs outside the bundle are unchanged. Subdirectory hosting, `file://`, and VS Code resource roots retain their original path semantics.

An HTML-only `?cb=…` does not version its dependencies. Returning browsers now request a distinct asset URL for each app version, while repeated visits to the same version retain ordinary browser caching. Normally a release changes the version when publishing changed assets; existing open tabs continue using their loaded release until refreshed.

`tests/e2e/asset_cache.py` primes old query-free responses under long-lived HTTP cache headers, verifies they really are cached, then loads the current release and a simulated next release. It checks initial and dynamic requests, both workers (including the arithmetic worker's import), fonts, rendering data, and same-release cache reuse. It uses a server under a subdirectory and no request interception, because Playwright routing disables browser caching.

## Approved 0.10.11 panel patch

PR #107 was explicitly requested as a same-version patch. Its changed model loads as `workbench-model.js?patch=right-dock&v=0.10.11`, preventing reuse of a cached original model. No other production script changed in that patch. This exception does not authorize reusing asset URLs for future changes.

The deployed patch is `297e608fa88038151fa73edc10362281fc6103db`. The existing `v0.10.11` tag stays at the original release, `2d594bb6be90fd2893e3df8abbaf11c422616962`; do not move it. See [handoff evidence](../VIBEMOL_CONTEXT.md#release-and-verification-state).

## Publishing and saved comparisons

Pushing main publishes Pages to vibemol.org independently of ordinary CI. Verify a candidate's complete checks before an authorized push, then confirm the deployed SHA. A future release tag must identify the deployed commit; the visible version string alone is insufficient.

Characterization compares version values exactly. Updating the usual 204 fields across 102 captures requires separate approval, exact post-record comparison and zero unrelated differences. Prior version/layout approval is not permission to record another change; no version mapping remains.
