# Reproducible Figure jobs

The supported runner composes figures through `VibeMolSession.importText`,
`VibeMolFigure.listTargets` and `VibeMolFigure.compose`. It uses the existing
renderer, with no command bus, bundler, app module change or testing API.
It drives a disposable headless Chrome/Chromium directly over CDP; Playwright
is not a runtime dependency of the runner. Node 22.4+ is required. Linux and
macOS are exercised; Windows is not presently validated.

## Run a job

Start with [the example job](../api/examples/figure.json). Its browser pin is
the ordinary CI browser, Chromium **156.0.8078.4** (Playwright 1.64.1's browser
distribution). Supply that executable, or deliberately edit the full version
pin to match a different installed browser. The runner never silently updates
or substitutes the pin. `chrome --version` prints the installed version.
Prefer the pinned **Chrome Headless Shell** distribution. Full Chrome on the
development Mac reproduced its own teardown watchdog even on empty pages
(about 11 seconds after acknowledging close, exit 2). The runner treats any
abnormal/forced shutdown as failure, not a successful reproducible bundle.

The browser sandbox defaults to true and never silently falls back. Ubuntu's
AppArmor policy can deny the user namespaces used by downloaded Chromium;
see [Chromium's platform notes](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).
For an isolated trusted-fixture CI job, `environment.sandbox: false` explicitly
adds `--no-sandbox`, matching ordinary Playwright CI. It is recorded in the
environment/flags and checked on replay. Normal local jobs keep the sandbox.

```sh
node api/figure-runner.mjs api/examples/figure.json --browser /path/to/chrome
node api/figure-runner.mjs api/examples/figure.json --browser /path/to/chrome --list-targets
```

Paths in a job are relative to the job file. `session` accepts a UTF-8
`.vibemol-session` or its `.gz` compression, including older app versions with
the supported session schema. Original molecular files are unnecessary.
`output` names a **new directory**; existing outputs are refused. No server
needs starting: the runner serves the local app on an ephemeral loopback port.
`--app-root DIR` selects another app checkout. Remote HTTP requests are blocked,
so account preferences, analytics and network services cannot alter the run.

`figure.targets` must explicitly be `"all"` or an ordered array of stable layer
IDs / `{ "id": "cube-1", "label": "Panel A" }`. Listing prints the available
IDs and scene names without writing an output bundle. Unknown/duplicate IDs
fail, with the available inventory in the error. `all` includes the product
Figure target catalog, including hidden layers; it does not mean visible only.
Use an explicit array for a paper. Supplied labels are limited to 500 characters;
they are never silently truncated by the runner.

Figure sizing, camera `current`/`fit`, labels, iso and Look policies, limits,
PNG density and SVG composition remain those in [Figure composer](figure-composer.md).
The host rejects unknown keys, type coercions, callbacks and test-only options.
It also requires an explicit positive `iso` when `sharedIso` is true, to avoid
depending on whichever surface happens to be active. `width` and `widthIn`
are alternatives. All effective defaults are saved in the replay job/record.

## Readiness contract

There is no post-load fixed sleep and no retry of a failed export. The runner:

1. Waits for the exact navigation loader's DOMContentLoaded and the public APIs.
2. Sets theme and font preferences before startup in a fresh disposable profile.
3. Awaits session import, font readiness and completion/cancellation of finite
   CSS animations/transitions. It explicitly loads the requested bundled face
   and checks that the theme, face, viewport, device scale and SwiftShader
   renderer match their requested values.
4. Requires the public viewport **and** target inventory to remain stable over
   two consecutive animation-frame intervals. Changes reset the streak. Numeric
   viewport fields use Figure's existing 1e-12 relative/absolute tolerance;
   types, keys and target identity are exact. The last 12 observations, frame
   streak and elapsed time are recorded, including on a readiness deadline.

This boundary follows `figure.py`'s presented-view check. It matters because
session installation can return before the first frame updates depth limits.
The runner does not bypass the composer's own busy/calculation checks; a busy
export rejects with its actual error. A stable viewport is not a promise that
arbitrary future background jobs are idle. Such a rejection requires inspection,
not an automatic retry. Existing Figure preparation resolves deferred target
geometry through the product path.

Readiness permits 60 seconds of observable frame progress; an independent
host deadline bounds the entire job (default 300 seconds, configurable with
`--deadline-ms`, maximum one hour). The host deadline also covers a stalled
renderer/font/navigation that cannot deliver a frame or readback. It is a
failure ceiling, not a performance guarantee or discounted timing budget.

## Reproducible output and errors

A successful bundle contains:

| File | Meaning |
| --- | --- |
| `figure.png` or `figure.svg` | Product Figure output, with SHA256 and dimensions in the record |
| `session.vibemol-session` | Exact decompressed input, with SHA256 |
| `job.json` | Explicit ordered targets, labels, effective Figure options and pinned environment; paths permit replay beside this bundle |
| `environment.json` | Requested and actual environment, readiness observations, panel cameras, input/output hashes and cleanup |

The environment pins the full browser version, light/dark theme, Geist/Inter/Plex
font pair, CSS viewport, device scale and SwiftShader backend. Locale is en-US,
timezone UTC, color profile sRGB. The record includes actual loaded font faces,
font/CSS/JS/app-resource hashes, browser build/revision and flags, GL vendor and
renderer, OS/architecture, Node version, app commit/tree/dirty status when Git
is available, runner source hashes and device limits. Changing an app resource
during a run fails. Resource hashes identify actual served bytes even in a
checkout without Git or with uncommitted changes.

The session + Figure options + environment record is the reproducible unit.
The generated replay job references `environment.json`: replay refuses changed
session bytes, Figure options, browser build/revision, renderer, theme/typeface,
viewport/device scale or any recorded app/font resource hash. To intentionally
change these conditions, create a new job without `referenceEnvironment`; the
new record describes a new reproducible unit rather than claiming replay.
Matching those means retaining the matching app/browser/fonts as well; the
record is not a browser installer. Cross-OS/GPU/driver versions are recorded,
not claimed to produce byte-identical results. Ordinary CI verifies exact PNG
replay in the same environment. SVG embeds raster panels but references its
recorded typeface for vector labels; retain/install that bundled font when
viewing or converting SVG elsewhere.

The runner closes its browser, removes its profile and closes the loopback
server before publishing a complete bundle. Normal shutdown must exit 0 without
a signal or forced kill; acknowledgement and process-exit timings are recorded.
A sibling exclusive lock prevents
two jobs claiming the same output. Temporary files are removed on failure.
SIGINT/SIGTERM or the JS API's AbortSignal cancel; the Figure abort signal is
sent and the disposable browser's private process group is discarded. Normal
shutdown uses the same absolute job deadline; there is no short shutdown timing
threshold. At that deadline the group is killed and the job fails. Cancellation
never publishes a successful image bundle.
The API `runFigureJob(path, {browser, signal, onStage})` exposes deterministic
phase notifications, including for cancellation before composing.

Success emits one JSON receipt on stdout. Phase events go to stderr. Failure
emits JSON with stage, actual error/comparands, available targets when relevant,
readiness observations and recent browser events; exit is nonzero (130 for
cancellation). Once the output lock is held, a separately named `.error-*.json`
also preserves the report. A failed run is never replaced or retried to green.

Validation runs inside the existing Figure suite after retiring its original
browser: PNG, SVG, exact replay, alternate theme/font, target listing, pin
mismatch, unknown targets, deterministic cancellation, hash verification and
cleanup. The ordinary 37/0/37 gate and 102-capture goldens are unchanged.
