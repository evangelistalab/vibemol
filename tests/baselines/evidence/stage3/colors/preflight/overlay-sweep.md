# Workbench removed-markup sweep

Source `dea1a9b745d7c6ca4c69f579927f5365d70a1a74`; app SHA256 `40853e5b547e34e8fa9e7dddcc5d11d4df50fe7186de1d9dad4130d302cfc95c`. This read-only prerequisite can be carried only if merged integration has the same source.

The app census inspected 2,188 lexical bindings, 296 direct literal-ID cache bindings, and 41 canonical els fields. It found 25 retired Workbench IDs in 26 app references. A separate startup lookup trace across all loaded modules found 39 removed-markup IDs: those 25, eight additional module/instance/listener cache IDs, and six transient or direct-wiring lookups. All 33 cache IDs and four transient IDs were observed connected in legacy mode. surfaceStyleScopeStatus and appearancePreferencesSection were not queried in legacy startup; their removal is in the workspaceEnabled-only Properties constructor, and their legacy presence is a source inference. No same-ID replacement was observed.

The native Workbench Panels → Properties → Look → Colors → Edit… route through openElementColors opened the editor in both themes. The original elementColorBtn is absent only in Workbench and remains connected/wired in both supported legacy themes. Issue #14 and the 52-slot bridge disposition remain; the factory can exclude its launcher dependency while app-owned late wiring preserves legacy access.

| ID | Reference category | Use-site disposition |
| --- | --- | --- |
| `appearanceAtomColorFields` | module/instance/listener cache | App passes atomFields to looks-ui and appearance-editor; hosts/deps retain legacy color root even though consolidated Workbench skips the old appearance color rows. Preserve legacy editor path. |
| `appearanceBondColorFields` | module/instance/listener cache | App passes bondFields to looks-ui and appearance-editor; hosts/deps retain legacy color root even though consolidated Workbench skips the old appearance color rows. Preserve legacy editor path. |
| `appearanceFontPairGeistBtn` | module/instance/listener cache | appearance-ui getGroupButtons returns buttonEl; click listener closes over it. Retained inside legacy fontPairGroupEl subtree. Keep legacy controls. |
| `appearanceFontPairGroup` | app cache | Passed as fontPairGroupEl into appearance-ui controller; legacy typeface-button listeners and state sync remain. Workbench App settings owns visible typeface. Keep legacy controls. |
| `appearanceFontPairInterBtn` | module/instance/listener cache | appearance-ui getGroupButtons returns buttonEl; click listener closes over it. Retained inside legacy fontPairGroupEl subtree. Keep legacy controls. |
| `appearanceFontPairPlexBtn` | module/instance/listener cache | appearance-ui getGroupButtons returns buttonEl; click listener closes over it. Retained inside legacy fontPairGroupEl subtree. Keep legacy controls. |
| `appearanceMoleculeStyleBasicBtn` | module/instance/listener cache | appearance-ui getGroupButtons returns buttonEl; click listener closes over it. Retained inside legacy styleGroupEl subtree. Keep legacy controls. |
| `appearanceMoleculeStyleGroup` | app cache | Passed as styleGroupEl into appearance-ui controller; legacy style-button listeners and state sync remain. Keep legacy controls. |
| `appearancePreferencesSection` | transient/wiring lookup | Properties construction temporarily resolves preferences then removes section; no separate persistent cache identified. Legacy typeface subtree remains. |
| `appearanceResetBtn` | app cache | Legacy reset-popover anchor, tooltip and onclick remain cached; popover itself is portaled. Workbench uses its appearance actions. Keep legacy access. |
| `appearanceSimpleBondsToggle` | app cache | Legacy mirrorToggles inputEl and syncMoleculeFeatureControlsState write the retained checkbox. Keep legacy backing state. |
| `bgColor` | app cache | App bgColor retains canonical background picker value, preset restore and input/change handlers. Properties owns the visible background editor. Keep legacy backing state. |
| `bgColorSwatch` | app cache | syncColorPickerFields writes the retained legacy swatch. Keep with its legacy picker. |
| `displayInspector` | app cache | Both app displayInspector and displayInspectorRefs.panel retain old shell. Workbench routes aliases to Properties; legacy toolbar controller uses original panel. Keep legacy access. |
| `displayInspectorBtn` | app cache | displayInspectorRefs.button is passed to toolbar toggle controller. Workbench aliases Appearance to Properties; legacy retains launcher. Keep supported legacy access. |
| `displayInspectorToggleIcon` | app cache | displayInspectorRefs.icon updates legacy expansion icon. Keep with supported legacy launcher. |
| `elementColorBtn` | app cache | Retired Workbench launcher, issue #14. Native Workbench openElementColors route passed both themes. Supported legacy button is connected and opens editor in both themes. Exclude only from Workbench live identity set; retain legacy node/bridge and relocate its identical late wiring outside periodic factory. |
| `elementColors` | app cache | App elementColors retains legacy color checkbox and preset restore; wired through legacy color state. Keep backing state. |
| `moleculeFogDepth` | app cache | App cache plus VmSlider.valueInput and WeakMap entry retain legacy numeric fog control; preset restore and number binding use it. Keep legacy backing state. |
| `moleculeFogDepthRange` | module/instance/listener cache | VmSlider.range is a cached child selected dynamically from .vm-slider; its input/change listeners close over the instance. Keep with legacy fog slider. This is outside direct literal-ID app binding count. |
| `moleculeFogToggle` | app cache | Legacy fog checkbox receives state synchronization and onchange. Keep legacy backing state. |
| `moleculeShadowsToggle` | app cache | Legacy shadow checkbox receives state synchronization and onchange. Keep legacy backing state. |
| `moleculeStyle` | app cache | Legacy select synchronizes style and onchange with active look. Keep backing state and legacy access. |
| `rowMoleculeFogDepth` | app cache | syncMoleculeFeatureControlsState toggles retained row visibility. Keep legacy UI state. |
| `rowSurfaceMaterialPreset` | transient/wiring lookup | syncSurfaceMaterialControlState resolves transient presetRow on each call. Removed row is not a separate long-lived app binding; legacy row still exists. |
| `showAtomLabelNumbers` | app cache | Initial numbering state, disabled/checked sync and onchange retain this legacy checkbox. Keep backing state. |
| `showAtomLabels` | app cache | Initial label state, label synchronization and onchange retain this legacy checkbox. Keep backing state. |
| `showAtoms` | app cache | getMoleculeDisplay and global.showAtoms preset adapters read/write retained checkbox; legacy onchange rebuilds scene. Keep backing state. |
| `showBonds` | app cache | getMoleculeDisplay and global.showBonds preset adapters read/write retained checkbox; legacy onchange rebuilds scene. Keep backing state. |
| `showMultiBonds` | app cache | Initial multi-bond state, preset restore, disabled/UI sync and onchange retain this legacy checkbox. Keep backing state. |
| `styleStudio` | module/instance/listener cache | floating-panels entries Map and register(panel) closures retain old Style Studio shell; Properties removes it in Workbench. Legacy retains shell. Record existing retired shell registration; no cleanup in Colors. |
| `styleStudioClose` | transient/wiring lookup | Tooltip initialization uses a transient .motionPanelClose collection; no separate persistent cache identified. Child remains under the retained legacy Style Studio shell. |
| `surfBtn` | app cache | Legacy surface visibility button/checkbox and onchange/appearance sync use cached node. Properties owns replacement controls. Keep backing state. |
| `surfaceMaterialPreset` | app cache | App surfaceMaterialPresetSelect retains the legacy select: mixed-state display, selected-layer reads, preset restore and onchange. Properties uses new material controls. Keep backing state. |
| `surfaceScopeLabel` | app cache | syncSurfaceControlsScope updates hidden/text state of retained legacy label. Workbench Properties presents current scope. Keep legacy compatibility. |
| `surfaceStyleScopeStatus` | transient/wiring lookup | Properties construction resolves and removes this node; no separate persistent cache identified. Keep legacy markup. |
| `surfaceUseStyleColors` | transient/wiring lookup | App writes onclick at original late registration; callback captures reset command, not the node. Properties removes parent. No separate persistent lexical node cache identified; legacy control remains wired. |
| `surfaceUseStyleOpacity` | transient/wiring lookup | App writes onclick at original late registration; callback captures reset command, not the node. Old shell removes it. No separate persistent lexical node cache identified; legacy control remains wired. |
| `visibilityElementColorsToggle` | app cache | Legacy mirror toggle retained by appearance controller; sync and preset restore still write it. Keep backing state. |

Raw app reference sites, initial markup ancestors, module-query stacks, browser/renderer metadata and all four native routes are preserved in the adjacent JSON evidence. The four issue-15 null slots remain in the composed identity inventory; three optional null hex fields are outside it. No additional remaining Stage 3 mutable cache was detached.

Collector diagnostics are retained separately. The initial legacy-dark theme-label pointer attempt used the hidden utility tray incorrectly; a later readiness collector called exportActive before asynchronous import completed. Only that unfinished case was resumed through native keyboard access and the documented pending-import condition. The original traceback is retained, but its screenshot/HTML were accidentally replaced by the second collector attempt. These are collector limitations, not passing shipped tests or production fixes.

Count correction: the current periodic factory has 19 inputs (ten used non-DOM and nine DOM). Excluding the legacy-only button makes 18. Grouping the remaining eight DOM fields as els makes **11**, because all ten non-DOM inputs have real uses. Reaching ten would require another cut or hiding/removing a used dependency; no such change is proposed.
