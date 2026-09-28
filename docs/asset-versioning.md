# Release asset versions

`assets/app/js/asset-urls.js` owns the single `APP_VERSION` constant. The main app reads it for the toolbar, Help, welcome screen, and export metadata. The bootstrap itself loads with the same version query as every other local script.

For a release, run:

```sh
python3 tools/sync_asset_versions.py --version 0.9.3
make check
```

Use the intended release number. Alternatively, edit the constant and run `make version-assets`. Commit the generated changes with the release. `make check` and the beta deployment workflow reject stale generated URLs. The web app still runs directly from the committed files with no build step; VS Code packaging copies those same files and preserves their query strings.

The generator stamps all local script, stylesheet, image, icon, and preload URLs in the production `index.html`, plus local `url()` references in application stylesheets (including fonts). HTML attributes are generated before the browser parses the document, so its preload scanner never requests an unversioned script. Script order is unchanged. Historical standalone experiments are not production entry points.

`VibeMolAssets.url(path)` adds the same `v` query to runtime requests for bundled workers, worker imports, MINAO basis data, fragment manifests/XYZ files, samples, environment textures, and Look previews. Other query values and fragments are retained. External services, blob/data URLs, navigation, and user file URLs outside the bundle are unchanged. Subdirectory hosting, `file://`, and VS Code resource roots retain their original path semantics.

An HTML-only `?cb=…` does not version its dependencies. Returning browsers now request a distinct asset URL for each app version, while repeated visits to the same version retain ordinary browser caching. A release must change the version when publishing changed assets; existing open tabs continue using their loaded release until refreshed.

`tests/e2e/asset_cache.py` primes old query-free responses under long-lived HTTP cache headers, verifies they really are cached, then loads the current release and a simulated next release. It checks initial and dynamic requests, both workers (including the arithmetic worker's import), fonts, rendering data, and same-release cache reuse. It uses a server under a subdirectory and no request interception, because Playwright routing disables browser caching.
