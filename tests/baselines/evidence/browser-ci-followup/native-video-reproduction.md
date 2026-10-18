# Native video Stop reproduction

Source: PR #9 merge `a1b00b72`, app.js SHA-256 `481543d9158aaff114f73b9113baea4b00b1cdf318627546df1ff668425eebd6`. Browser: Chromium 145.0.7632.6, macOS arm64, ANGLE Metal Renderer: Apple M1 Max (hardware). The normal legacy app URL `/?workspaceLab=0` used native MediaRecorder, normal file input and real pointer events. No QA flag, intercepted source, test globals, MediaRecorder/captureStream/download stubs or app testing API was used.

1. Open `two-frame.xyz` using Choose files. Open Trajectory if it is not already open.
2. Set FPS to 1 in the visible scene row. Choose Save video, choose a crop, and click Start recording.
3. While the control shows Stop, press and hold it. Wait until recording finishes and its download appears, then release the pointer.
4. The export completed and the overlay became hidden while the pointer was held. Releasing opens crop selection again, with Start recording and Cancel. Expected: a Stop interaction begun during recording leaves the export closed.
5. Repeat with `vibration-repro.xyz` and `vibration-repro.vib.json`, select the only mode, and set Speed to 1.00. The same transition occurs.

`native-video-results.json` records real DOM states at pointer-down, completion while held and pointer-up for both workflows. Two native WebM downloads were saved in ignored output; screenshots are adjacent. The mechanism is `trajectory-video.js:bindEvents`: pointer-down does not retain the action's mode, and click chooses its action from the current state. Completion changes recording → idle; the later click takes idle → selecting.

These steps reproduce a normal UI defect independently of the browser-suite timing. CI state traces are required to establish which state its automated Stop action actually entered.
