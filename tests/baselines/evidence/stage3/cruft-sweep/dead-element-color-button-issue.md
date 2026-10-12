The normal Workbench Element Color Editor is reachable through Panels → Properties → Look → Colors → Edit… (`studioElementColorEdit.onclick` calls `deps.openElementColors()`). This is obsolete Workbench UI plumbing, not a user-facing Workbench regression.

The old `elementColorBtn` is read before Properties construction, then detached when `properties-inspector.js` removes the old `.tb-appearance` wrapper. On the unchanged integration tree b8baed5236cb675fe3361b630e304de24dc01fea, the cached node is a disconnected BUTTON and `document.getElementById('elementColorBtn')` is null. The strict expanded Stage 3 identity guard exposes it immediately at QA initialization.

## Requested 0.9.x cleanup

Remove the obsolete markup at index.html:2569, its app.js:6933 const lookup, and the individual controller input at app.js:10824. Do this separately from the structural refactor. Preserve access to the editor in both supported launch layouts. Important scope: the old button is still connected and its click handler is wired in explicit legacy launch; zero impact is established for Workbench, not an unqualified removal of the legacy shortcut. The newer Style Studio editor route already exists in legacy too.

## Dependency accounting

The measured hand-off is **19 → 11**, including the shared `els` table, even though its PR is held. The ten other inputs are THREE, ATOM_Z_TO_DATA, ATOM_SYMBOL_TO_Z, UI_PALETTE, getActiveElementHexColor, getElementSymbol, getElementName, editAppearanceSettings, exportElementColorOverrides and normalizeHexColor.

Removing the old button reduces the ungrouped interface to **18**. The requested follow-up expectation was **18 → 10**, but deletion of an entry *inside els* does not delete the `els` factory argument: the actual shared interface remains **11 = ten non-DOM inputs + els**. Reaching 10 requires identifying one additional removable input or explicitly changing that counting convention. Do not report 18 → 10 as measured on the current code.

## Sweep evidence

The before-resume sweep inspects all 2,215 module bindings, 322 direct-ID cache declarations/assignments, existing els fields and controller panel references. It observes 351 Workbench / 349 legacy DOM references. It finds 25 distinct IDs (26 references) detached in Workbench; every counterpart remains the same live reference in legacy. These are not all dead data: several are deliberately retained legacy preset backing controls and continue to be read/written. Audit their actual uses before removing them or subtracting dependencies.

| Cached binding | ID | app.js query line | index.html line |
| --- | --- | ---: | ---: |
| `surfaceMaterialPresetSelect` | `surfaceMaterialPreset` | 6915 | 2810 |
| `bgColor` | `bgColor` | 6923 | 2689 |
| `bgColorSwatchEl` | `bgColorSwatch` | 6925 | 2690 |
| `toggleAtoms` | `showAtoms` | 6926 | 2543 |
| `toggleBonds` | `showBonds` | 6927 | 2599 |
| `toggleMultiBonds` | `showMultiBonds` | 6928 | 2474 |
| `toggleAtomLabels` | `showAtomLabels` | 6929 | 2576 |
| `toggleAtomLabelNumbers` | `showAtomLabelNumbers` | 6930 | 2585 |
| `elementColors` | `elementColors` | 6931 | 2473 |
| `visibilityElementColorsToggleEl` | `visibilityElementColorsToggle` | 6932 | 2561 |
| `elementColorBtn` | `elementColorBtn` | 6933 | 2569 |
| `surfBtn` | `surfBtn` | 6948 | 2726 |
| `displayInspectorBtn` | `displayInspectorBtn` | 6967 | 2431 |
| `displayInspectorToggleIcon` | `displayInspectorToggleIcon` | 6968 | 2434 |
| `appearanceResetBtn` | `appearanceResetBtn` | 6969 | 2439 |
| `displayInspector` | `displayInspector` | 6973 | 2453 |
| `appearanceMoleculeStyleGroupEl` | `appearanceMoleculeStyleGroup` | 6974 | 2500 |
| `appearanceFontPairGroupEl` | `appearanceFontPairGroup` | 6975 | 2859 |
| `appearanceSimpleBondsToggleEl` | `appearanceSimpleBondsToggle` | 6980 | 2617 |
| `surfaceScopeLabelEl` | `surfaceScopeLabel` | 6982 | 2716 |
| `moleculeStyleSel` | `moleculeStyle` | 7329 | 2455 |
| `moleculeShadowsToggleEl` | `moleculeShadowsToggle` | 7332 | 2511 |
| `moleculeFogToggleEl` | `moleculeFogToggle` | 7333 | 2520 |
| `rowMoleculeFogDepth` | `rowMoleculeFogDepth` | 7334 | 2525 |
| `moleculeFogDepthEl` | `moleculeFogDepth` | 7335 | 2530 |

No other detached/replaced reference lies in the remaining Selection, Atoms-menu or Symmetry/shared-launcher cache groups. Four pre-existing null slots (old Atoms menu trio and fragment cue popover) have no matching markup in either layout and are tracked separately for the known-absence inventory. Three additional optional hex inputs are null as well, outside the 52-slot cache stage inventory.

Native reachability has no QA flag, injected source, private APIs, handler replacement, sleep or retries. The census uses only an observational export of unchanged-source private references; it changes no query, handler, state or DOM. Evidence is being retained under tests/baselines/evidence/stage3/cruft-sweep/. No production cleanup is authorized on the refactor branch.
