# Low-use app state locality audit

Audited main `994ec027` with Babel 7.24.4. The historical regex matches 250
declaration lines. The AST locates those same 250 lines and counts 252 `let`
declaration statements and 261 variable bindings. The Babel kind-`let` total is
263 because it includes `VmNumberInput` and `VmSlider`. Both classes are already
excluded from 261. Dropping `__lastBondUpdate` leaves 249 lines, 251 statements
and 260 variable bindings.

The original shortlist is reproducible as 37 IIFE-scope variable bindings with
at most three whole-word occurrences after subtracting the declaration.
The table replaces that textual approximation with Babel reference paths and
constant-violation sites for the actual binding. An update such as `counter++`
can be both a reference and a write. The use span covers both columns. All
lines refer to the audited main revision.

| Binding | Declaration | AST references | Write sites | Use span | Owner or disposition |
| --- | ---: | ---: | ---: | --- | --- |
| `hintMessageSticky` | 57 | 2 | 1 | 30875–30901 | Hint |
| `adaptivePopoverController` | 1643 | 0 | 1 | 15946 | Write-only holder |
| `calculationsSignature` | 2290 | 1 | 2 | 12066–12071 | Calculations sync |
| `calculationsPanelIntroduced` | 2291 | 1 | 1 | 11291–11293 | Mode entry |
| `measurementPanelIntroduced` | 2293 | 1 | 1 | 11277–11279 | Mode entry |
| `displayAdaptiveMenuAutoHideController` | 2297 | 2 | 1 | 11738–12196 | Adaptive display |
| `selectionCoordinationCuePointerHandled` | 2300 | 1 | 2 | 8290–8297 | Cue activation |
| `selectionCoordinationCuePopoverRenderKey` | 2301 | 1 | 2 | 19401–19468 | Coordination presentation |
| `selectionCoordinationCuePreviewRenderers` | 2302 | 2 | 1 | 19290–19366 | Coordination presentation |
| `selectionMetalBondingCuePointerHandled` | 2303 | 1 | 2 | 8307–8314 | Cue activation |
| `selectionMetalBondingCuePopoverRenderKey` | 2304 | 1 | 2 | 19524–19600 | Metal presentation |
| `lastHintMessage` | 2307 | 2 | 1 | 30901–32711 | Hint |
| `buildPaletteFilterQuery` | 2312 | 2 | 1 | 16900–16906 | Build filter |
| `wboitSupportChecked` | 2404 | 1 | 1 | 2877–2878 | WBOIT probe |
| `sceneOutlinerController` | 2609 | 2 | 1 | 2611–2675 | Outliner |
| `sceneGraphSceneKeyCounter` | 2698 | 1 | 1 | 9349 | Scene key allocator |
| `suspendPresetRebuild` | 3156 | 1 | 1 | 12221–26805 | Preset batch |
| `trajectoryUiController` | 6336 | 2 | 1 | 6338–6357 | Trajectory UI |
| `__fpsLast` | 6743 | 1 | 2 | 6748–7206 | FPS sampler |
| `helpRestoreFocusEl` | 11531 | 1 | 2 | 11763–11779 | Help focus |
| `hoverBondKey` | 12323 | 1 | 2 | 23038–23054 | Bond hover |
| `hoverBondSection` | 12324 | 1 | 2 | 23038–23055 | Bond hover |
| `editClipboardPasteSerial` | 12348 | 1 | 2 | 21434–21491 | Protected Edit state |
| `pastedTextStructureSerial` | 12349 | 1 | 1 | 21541 | Pasted XYZ |
| `editBondOrder` | 12409 | 1 | 1 | 15731–15941 | Protected Edit state |
| `editTransformAutoCleanupEnabled` | 12445 | 2 | 1 | 14203–27199 | Protected Edit state |
| `editFragmentListExpanded` | 12455 | 2 | 1 | 17152–17657 | Protected Edit state |
| `editMoleculeListExpanded` | 12456 | 2 | 1 | 17165–17651 | Protected Edit state |
| `addGrowNeighborDirs` | 12463 | 0 | 3 | 15956–24388 | Write-only grow state |
| `editSelectionClickAdditive` | 18192 | 0 | 3 | 25426–25517 | Protected Edit state |
| `editSelectionMarqueeActive` | 18193 | 1 | 2 | 22830–32943 | Protected Edit state |
| `editSelectionMarqueeRect` | 18194 | 1 | 2 | 17970–22850 | Protected Edit state |
| `editSelectionDragMode` | 18195 | 2 | 1 | 18325–18337 | Protected Edit state |
| `editBondSideCueMode` | 18196 | 2 | 1 | 18331–18346 | Protected Edit state |
| `__lastBondUpdate` | 25273 | 0 | 0 | None | Remove unused declaration |
| `nextIsoCalibrationRecordId` | 26395 | 1 | 1 | 26407 | Iso calibration identity |
| `figureUiState` | 32271 | 1 | 2 | 32281–32318 | Figure busy UI |

## Relocation proposals

These are design cuts. Each input count covers the named slice's free app
bindings, with explicitly injected runtime dependencies counted where noted.
Arguments that are the operation's data stay arguments.

| Usage group | Proposed owner and inputs |
| --- | --- |
| Hint | One hint presentation owner for message text, stickiness and both timers. The visibility and message functions use 7 app bindings. Keep the existing test readback and mode-specific timing. |
| Calculations sync | Own the signature with `syncCalculations` (12 app inputs) and keep the disabled-mode reset. This is a separate sync seam from the panel's first-entry flag. |
| Mode entry | Hold both first-entry flags in the current lifecycle. Moving `setMode` as a unit needs 67 app bindings. A future panel-private first-entry cut needs to preserve the two different open conditions. |
| Adaptive display | Hold the existing auto-hide handle. Configuration plus `updateCanvasAdaptiveMenuUi` needs 21 app bindings. |
| Cue activation | Move each pointer latch into the existing wiring closure. The two wiring blocks use the relevant buttons and toggle callbacks (3 app bindings together). These uses are at 8290–8314. |
| Cue presentation | The render keys and preview resources are used at 19290–19600. A joint cut has 15 app bindings plus injected THREE, so hold that cut. Use a Coordination presentation owner (10 app bindings plus THREE) and a Metal render-key owner (7). Keep preview disposal with its renderer resources and placement at its existing call points. |
| Build filter | Own the query with its getter and setter (one input, the search element). Preserve the option to skip mirroring into the field. |
| WBOIT probe | Keep the checked flag with the capability probe (3 app inputs). Preserve the frame code's ability to update support status and the failure reason. |
| Outliner | Hold the lazy holder. The current receiving factory is supplied 62 inputs. |
| Scene key allocator | Move the counter with `allocateVolumeSceneKey` (one graph input). Preserve collision checks and the current allocation lifetime. |
| Preset batch | Hold the cross-cutting suppression flag until preset batching has a lifecycle owner. Its write and read belong to the batch bracket and the molecule-style callback. |
| Trajectory UI | Hold the lazy holder. The current receiving factory is supplied 17 inputs. |
| FPS sampler | Keep all four timing values with sampling and visibility reset (zero free app bindings). The sampler consumes the frame timestamp and uses the browser clock and document. |
| Help focus | Keep the restore target with Help open/close (3 app inputs). Preserve asynchronous focus restoration. |
| Bond hover | Keep the four hover values with `setBondHover` (5 app inputs). Preserve the overlay lifecycle. |
| Pasted XYZ | Keep the serial with `importPastedXyzText` (4 app inputs). Preserve increment and naming order. |
| Iso calibration identity | Move the counter and its WeakMap into one owner (zero free app bindings). Keep the existing per-record identity. |
| Figure busy UI | Own the frozen canvas, busy overlay and focus record together (2 app inputs, canvas and cancellation callback). The render/session lifecycle stays with its current owner. |
| Write-only state | `adaptivePopoverController` has a sole write of `null`. `addGrowNeighborDirs` has three writes. Both are retained in this pass. |
| Protected Edit state | Keep all 39 `edit*` bindings, including the 10 in the shortlist, at their current owners. |

The four protected core names have 301, 242, 214 and 170 textual uses
respectively. Their Babel reference counts are 280, 233, 150 and 165 in the
same order (`currentIndex`, `volumes`, `camera`, `currentMode`). The textual
search also picks up shadowed names and non-binding occurrences. These four
bindings stay in place.

The only app-state change in this pass is the removal of `__lastBondUpdate`.
