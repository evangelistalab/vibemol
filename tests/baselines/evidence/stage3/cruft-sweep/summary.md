# Workbench DOM retirement census

On unchanged integration b8baed5, the normal UI route Panels → Properties → Look → Colors → Edit… opens the Element Color Editor via openElementColors. No QA or private API was used. The old elementColorBtn is absent in Workbench but still connected and wired in legacy; cleanup must preserve supported legacy editor access. Filed as [#14](https://github.com/evangelistalab/vibemol/issues/14).

All 2,215 module bindings, 322 direct-ID cache declarations/assignments, existing els properties, NodeLists and controller .panel references were observed. There are 351 Workbench / 349 legacy DOM references. Twenty-five distinct IDs (26 references) are detached in Workbench; the second displayInspector reference is displayInspectorRefs.panel. Each counterpart remains connected and matches its ID in legacy. There are no same-ID replacement mismatches in the remaining three stage groups.

Several are deliberate legacy preset backing controls, not globally dead dependencies: getMoleculeDisplay reads the retained showAtoms/showBonds controls, surface-control synchronization reads surfaceMaterialPreset, and setters maintain other backing values. Do not delete them or subtract dependency counts solely because their DOM is detached. properties-inspector.js explicitly documents retaining backing values off-DOM. The issue calls for a use audit during cleanup.

| Cached reference | ID | app.js query line | index.html line |
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

The pre-existing null slots editAtomsMenuEl, editAtomsMenuBodyEl, editAtomsMenuCurrentEl and editSelectionFragmentCuePopoverEl have no markup in either layout and are now issue-backed by [#15](https://github.com/evangelistalab/vibemol/issues/15). The optional posColorHexEl, negColorHexEl and bgColorHexEl lookups are also null, outside the stage's 52-slot inventory.

Thus the rigid 52-slot inventory composition is **Workbench 47 live + 5 known-absent; legacy 48 live + 4 known-absent**. A “51 + 1” claim would count the four already-absent editor slots as live. Known-absent entries must declare an issue, cached disposition and ID; live entries must exist and match the cached node. An unexpected disappearance, unexpected node for an absent slot, inventory drift or unexplained detached node must fail.

The Element Colors hand-off measured **19 → 11** factory inputs; it remains held. Removing the old button makes the original ungrouped count 18, while the grouped factory still has ten non-DOM inputs plus els (11). The requested 18 → 10 cleanup target is recorded in #14 as a counting/additional-dependency question, not represented as measured. Atoms menu resumes without landing the Element Colors conversion.
