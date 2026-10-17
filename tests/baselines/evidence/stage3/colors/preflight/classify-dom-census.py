"""Produce explicit dispositions for every observed retired-markup ID."""
import hashlib
import json
from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'colors-preflight-dea1a9b'
d = json.loads((p / 'dom-census.json').read_text())
q = json.loads((p / 'module-query-census.json').read_text())
assert all(d[k] == q[k] for k in ['sourceCommit', 'sourceTree', 'sourceAppSha256'])
assert all(not x['pageErrors'] for report in [d, q] for x in report['records'])
native = json.loads((p / 'reachability.json').read_text())
assert native['complete'] and len(native['results']) == 4
assert all(r['editorOpen'] and not r['pageErrors'] for r in native['results'])
wb, legacy = q['records']
retired = {row['id']: row for row in wb['references'] if not row['connected']}
legacy_ids = {row['id']: row for row in legacy['references']}
assert len(retired) == 39
assert set(retired) - set(legacy_ids) == {'surfaceStyleScopeStatus', 'appearancePreferencesSection'}
assert all(legacy_ids[i]['connected'] for i in retired if i in legacy_ids)
assert not any(r['connected'] and not r['sameAsLive'] for r in wb['references'])
app_ids = {row['id'] for row in d['workbenchDetachedOrReplaced']}
assert len(app_ids) == 25 and len(d['workbenchDetachedOrReplaced']) == 26

notes = {
 'surfaceMaterialPreset': 'App surfaceMaterialPresetSelect retains the legacy select: mixed-state display, selected-layer reads, preset restore and onchange. Properties uses new material controls. Keep backing state.',
 'bgColor': 'App bgColor retains canonical background picker value, preset restore and input/change handlers. Properties owns the visible background editor. Keep legacy backing state.',
 'bgColorSwatch': 'syncColorPickerFields writes the retained legacy swatch. Keep with its legacy picker.',
 'showAtoms': 'getMoleculeDisplay and global.showAtoms preset adapters read/write retained checkbox; legacy onchange rebuilds scene. Keep backing state.',
 'showBonds': 'getMoleculeDisplay and global.showBonds preset adapters read/write retained checkbox; legacy onchange rebuilds scene. Keep backing state.',
 'showMultiBonds': 'Initial multi-bond state, preset restore, disabled/UI sync and onchange retain this legacy checkbox. Keep backing state.',
 'showAtomLabels': 'Initial label state, label synchronization and onchange retain this legacy checkbox. Keep backing state.',
 'showAtomLabelNumbers': 'Initial numbering state, disabled/checked sync and onchange retain this legacy checkbox. Keep backing state.',
 'elementColors': 'App elementColors retains legacy color checkbox and preset restore; wired through legacy color state. Keep backing state.',
 'visibilityElementColorsToggle': 'Legacy mirror toggle retained by appearance controller; sync and preset restore still write it. Keep backing state.',
 'elementColorBtn': 'Retired Workbench launcher, issue #14. Native Workbench openElementColors route passed both themes. Supported legacy button is connected and opens editor in both themes. Exclude only from Workbench live identity set; retain legacy node/bridge and relocate its identical late wiring outside periodic factory.',
 'surfBtn': 'Legacy surface visibility button/checkbox and onchange/appearance sync use cached node. Properties owns replacement controls. Keep backing state.',
 'displayInspectorBtn': 'displayInspectorRefs.button is passed to toolbar toggle controller. Workbench aliases Appearance to Properties; legacy retains launcher. Keep supported legacy access.',
 'displayInspectorToggleIcon': 'displayInspectorRefs.icon updates legacy expansion icon. Keep with supported legacy launcher.',
 'appearanceResetBtn': 'Legacy reset-popover anchor, tooltip and onclick remain cached; popover itself is portaled. Workbench uses its appearance actions. Keep legacy access.',
 'displayInspector': 'Both app displayInspector and displayInspectorRefs.panel retain old shell. Workbench routes aliases to Properties; legacy toolbar controller uses original panel. Keep legacy access.',
 'appearanceMoleculeStyleGroup': 'Passed as styleGroupEl into appearance-ui controller; legacy style-button listeners and state sync remain. Keep legacy controls.',
 'appearanceFontPairGroup': 'Passed as fontPairGroupEl into appearance-ui controller; legacy typeface-button listeners and state sync remain. Workbench App settings owns visible typeface. Keep legacy controls.',
 'appearanceSimpleBondsToggle': 'Legacy mirrorToggles inputEl and syncMoleculeFeatureControlsState write the retained checkbox. Keep legacy backing state.',
 'surfaceScopeLabel': 'syncSurfaceControlsScope updates hidden/text state of retained legacy label. Workbench Properties presents current scope. Keep legacy compatibility.',
 'moleculeStyle': 'Legacy select synchronizes style and onchange with active look. Keep backing state and legacy access.',
 'moleculeShadowsToggle': 'Legacy shadow checkbox receives state synchronization and onchange. Keep legacy backing state.',
 'moleculeFogToggle': 'Legacy fog checkbox receives state synchronization and onchange. Keep legacy backing state.',
 'rowMoleculeFogDepth': 'syncMoleculeFeatureControlsState toggles retained row visibility. Keep legacy UI state.',
 'moleculeFogDepth': 'App cache plus VmSlider.valueInput and WeakMap entry retain legacy numeric fog control; preset restore and number binding use it. Keep legacy backing state.',
 'moleculeFogDepthRange': 'VmSlider.range is a cached child selected dynamically from .vm-slider; its input/change listeners close over the instance. Keep with legacy fog slider. This is outside direct literal-ID app binding count.',
 'styleStudio': 'floating-panels entries Map and register(panel) closures retain old Style Studio shell; Properties removes it in Workbench. Legacy retains shell. Record existing retired shell registration; no cleanup in Colors.',
 'appearanceFontPairGeistBtn': 'appearance-ui getGroupButtons returns buttonEl; click listener closes over it. Retained inside legacy fontPairGroupEl subtree. Keep legacy controls.',
 'appearanceFontPairInterBtn': 'appearance-ui getGroupButtons returns buttonEl; click listener closes over it. Retained inside legacy fontPairGroupEl subtree. Keep legacy controls.',
 'appearanceFontPairPlexBtn': 'appearance-ui getGroupButtons returns buttonEl; click listener closes over it. Retained inside legacy fontPairGroupEl subtree. Keep legacy controls.',
 'appearanceMoleculeStyleBasicBtn': 'appearance-ui getGroupButtons returns buttonEl; click listener closes over it. Retained inside legacy styleGroupEl subtree. Keep legacy controls.',
 'appearanceAtomColorFields': 'App passes atomFields to looks-ui and appearance-editor; hosts/deps retain legacy color root even though consolidated Workbench skips the old appearance color rows. Preserve legacy editor path.',
 'appearanceBondColorFields': 'App passes bondFields to looks-ui and appearance-editor; hosts/deps retain legacy color root even though consolidated Workbench skips the old appearance color rows. Preserve legacy editor path.',
 'styleStudioClose': 'Tooltip initialization uses a transient .motionPanelClose collection; no separate persistent cache identified. Child remains under the retained legacy Style Studio shell.',
 'rowSurfaceMaterialPreset': 'syncSurfaceMaterialControlState resolves transient presetRow on each call. Removed row is not a separate long-lived app binding; legacy row still exists.',
 'surfaceUseStyleColors': 'App writes onclick at original late registration; callback captures reset command, not the node. Properties removes parent. No separate persistent lexical node cache identified; legacy control remains wired.',
 'surfaceUseStyleOpacity': 'App writes onclick at original late registration; callback captures reset command, not the node. Old shell removes it. No separate persistent lexical node cache identified; legacy control remains wired.',
 'surfaceStyleScopeStatus': 'Properties construction resolves and removes this node; no separate persistent cache identified. Keep legacy markup.',
 'appearancePreferencesSection': 'Properties construction temporarily resolves preferences then removes section; no separate persistent cache identified. Legacy typeface subtree remains.',
}
assert set(notes) == set(retired)
transient = {'styleStudioClose', 'rowSurfaceMaterialPreset', 'surfaceUseStyleColors', 'surfaceUseStyleOpacity', 'surfaceStyleScopeStatus', 'appearancePreferencesSection'}
classification = []
for ident, row in sorted(retired.items()):
    app = [r for r in d['workbenchDetachedOrReplaced'] if r['id'] == ident]
    classification.append({'id': ident, 'classification': 'app cache' if ident in app_ids else 'transient/wiring lookup' if ident in transient else 'module/instance/listener cache',
      'workbenchConnected': row['connected'], 'workbenchLiveReplacementWithSameId': row['liveExists'],
      'legacyConnected': legacy_ids.get(ident, {}).get('connected'),
      'legacyEvidence': 'Observed connected in query trace' if ident in legacy_ids else 'Not queried in legacy startup. Initial markup plus workspaceEnabled-only Properties removal at app.js:32860; no dynamic connection claim.',
      'disposition': notes[ident],
      'appReferences': [{k: r[k] for k in ['name', 'declarationLine', 'queryLine', 'referenceSites', 'indexMarkup']} for r in app],
      'moduleQuerySites': row['sites']})
report = {k: d[k] for k in ['sourceCommit', 'sourceTree', 'sourceAppSha256']}
report.update(appModuleBindings=d['moduleBindingsInspected'], directLiteralIdCaches=d['directIdCacheBindings'], canonicalElsFields=d['canonicalElsFields'],
  appRetiredReferences=26, appRetiredIds=25, queriedRetiredMarkupIds=39, additionalCachedIds=8, transientOrWiringOnlyIds=6,
  unexpectedSameIdReplacements=0, legacyObservedConnectedIds=37, legacyNotQueriedTransientIds=2, allRetainedCacheIdsObservedConnectedInLegacy=True,
  retainedLegacyReferencesAreNotGloballyDead=True, remainingStage3MutableCachesDetached=False,
  classification=classification, knownNullAppSlots=[{'name': r['name'], 'id': r['id'], 'disposition': 'Issue #15 retained historical null slot' if r['id'].startswith('edit') else 'Optional legacy hex field absent in both layouts; outside composed 52-slot inventory'} for r in d['nullAbsentReferences']],
  removalSites=[{'file':'assets/app/js/properties-inspector.js', 'lines':[39,40,41,48,57], 'operation':'Remove obsolete surface rows/status, preferences, old Appearance shell and Style Studio after moving live sections'},
    {'file':'assets/app/js/workbench.js','lines':[44,45], 'operation':'Move original mode controls into new bar before removing old wrapper; moved controls stay connected. Other menu/tab replaceChildren calls rebuild generated chrome, not original app cached IDs.'}],
  limitation='Runtime lookup trace observes all loaded modules during startup; source inspection distinguishes retained caches from transient lookups. It does not claim every lookup is a cache, exercise every future feature, or substitute for candidate identity/manual/CI gates. No source changes or cleanup were performed.')
(p / 'overlay-sweep.json').write_text(json.dumps(report, indent=2) + '\n')
lines = ['# Workbench removed-markup sweep', '',
 f"Source `{d['sourceCommit']}`; app SHA256 `{d['sourceAppSha256']}`. This read-only prerequisite can be carried only if merged integration has the same source.", '',
 'The app census inspected 2,188 lexical bindings, 296 direct literal-ID cache bindings, and 41 canonical els fields. It found 25 retired Workbench IDs in 26 app references. A separate startup lookup trace across all loaded modules found 39 removed-markup IDs: those 25, eight additional module/instance/listener cache IDs, and six transient or direct-wiring lookups. All 33 cache IDs and four transient IDs were observed connected in legacy mode. surfaceStyleScopeStatus and appearancePreferencesSection were not queried in legacy startup; their removal is in the workspaceEnabled-only Properties constructor, and their legacy presence is a source inference. No same-ID replacement was observed.', '',
 'The native Workbench Panels → Properties → Look → Colors → Edit… route through openElementColors opened the editor in both themes. The original elementColorBtn is absent only in Workbench and remains connected/wired in both supported legacy themes. Issue #14 and the 52-slot bridge disposition remain; the factory can exclude its launcher dependency while app-owned late wiring preserves legacy access.', '',
 '| ID | Reference category | Use-site disposition |', '| --- | --- | --- |']
for row in classification:
    lines.append(f"| `{row['id']}` | {row['classification']} | {row['disposition']} |")
lines += ['', 'Raw app reference sites, initial markup ancestors, module-query stacks, browser/renderer metadata and all four native routes are preserved in the adjacent JSON evidence. The four issue-15 null slots remain in the composed identity inventory; three optional null hex fields are outside it. No additional remaining Stage 3 mutable cache was detached.', '',
 'Collector diagnostics are retained separately. The initial legacy-dark theme-label pointer attempt used the hidden utility tray incorrectly; a later readiness collector called exportActive before asynchronous import completed. Only that unfinished case was resumed through native keyboard access and the documented pending-import condition. The original traceback is retained, but its screenshot/HTML were accidentally replaced by the second collector attempt. These are collector limitations, not passing shipped tests or production fixes.', '',
 'Count correction: the current periodic factory has 19 inputs (ten used non-DOM and nine DOM). Excluding the legacy-only button makes 18. Grouping the remaining eight DOM fields as els makes **11**, because all ten non-DOM inputs have real uses. Reaching ten would require another cut or hiding/removing a used dependency; no such change is proposed.', '']
(p / 'overlay-sweep.md').write_text('\n'.join(lines))
print(json.dumps({k: report[k] for k in ['appRetiredReferences','appRetiredIds','queriedRetiredMarkupIds','additionalCachedIds','transientOrWiringOnlyIds','unexpectedSameIdReplacements']}))
