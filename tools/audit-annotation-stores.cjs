#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {unit} = require('./audit-capabilities.cjs');
const babel = name => require(process.env.VIBEMOL_BABEL_ROOT
  ? path.join(process.env.VIBEMOL_BABEL_ROOT, name) : '@babel/' + name);
const traverse = babel('traverse').default;
const ROOT = path.resolve(__dirname, '..');
const stores = ['builder', 'coordination', 'metalBonding'];
const stems = {builder: 'Builder', coordination: 'Coordination', metalBonding: 'MetalBonding'};
const purpose = {
  getAtomBuilderMeta: 'Read stored group/entry provenance, with legacy atom-field fallback.',
  setAtomBuilderMeta: 'Merge/write/remove per-atom provenance; retire migrated atom fields.',
  migrateLegacyBuilderAnnotations: 'Migrate legacy atom fields into the authoritative builder map.',
  getBuilderGroupIndices: 'Resolve the group move/rotation scope by stable group identity.',
  getBuilderEntryKindAtAtom: 'Choose fragment versus molecule selection/transform semantics.',
  getAtomCoordinationMeta: 'Read the stored preferred geometry id.',
  setAtomCoordinationMeta: 'Merge/write/remove the preferred geometry id.',
  applyEditAddCoordinationToAtom: 'Write the active Build coordination choice on a newly placed atom.',
  applyAtomCoordinationChoice: 'Undoable UI preference commit; refresh halo/menu and rebuild scene. Does not itself rearrange existing coordinates.',
  getStoredPreferredGeometryId: 'Feed the stored id (or an explicit preview override) into geometry inference.',
  getAtomMetalBondingMeta: 'Read and normalize the per-metal bond-perception override.',
  setAtomMetalBondingMeta: 'Merge/write/remove the override (auto removes the entry).',
  applyAtomMetalBondingChoice: 'Undoable UI commit; immediately re-perceive non-explicit bonds, then rebuild rendering.',
  buildBondAtomRecords: 'Project the override into metalBondMode on inference/render records.',
  buildVolumeSelectionClipboard: 'Serialize all three annotations alongside selected atoms and bonds.',
  appendVolumeSelectionClipboard: 'Restore all three annotations with new atom/group ids when pasting.',
  pruneVolumeAtomAnnotations: 'Read entries to remove missing atoms and caller-rejected preferences; never a geometry consumer.',
  cloneVolumeAnnotationsSnapshot: 'Prune/normalize then deep-copy all three maps for Undo/Redo and transport.',
  ensureVolumeSchema: 'Initialize the three namespaces, migrate provenance and prune dangling entries.',
  applyAtomsSnapshot: 'Replace the complete annotation snapshot for Undo/Redo; missing snapshots reset it.',
  rehydrateClonedVolume: 'Validate/normalize a whole transported volume, preserving its annotation maps.',
  serializeBuilderExtensions: 'Export builder operation provenance.',
  mergeBuilderExtensionsIntoVolume: 'Reconstruct group provenance from imported builder operations.',
  rehydrateBuilderStateForVolume: 'Reconstruct group provenance from imported builder operations.',
  getAtomCoordinationGeometryId: 'Supply the saved preference to the halo descriptor and geometry inference.',
  getSelectionMetalBondingCueState: 'Choose the currently selected Metal menu option; presentation only.',
  applyHydrogenPlanToVolume: 'Copy parent group/entry provenance onto newly added hydrogens.',
  applyPlan: 'Copy parent provenance onto hydrogens created by the auto-hydrogen controller.',
  describeTransformSelection: 'Describe homogeneous entry/group selection and whether it spans a whole group.',
  commitMoleculePlacement: 'Write group/entry provenance on atoms committed by molecule placement.',
  commitFuseRingPlacement: 'Write group/entry provenance on committed fused-ring atoms.',
  appendFragmentAtWorld: 'Write group/entry provenance on attached fragment atoms.',
  applyRecordSpatialState: 'Replace all annotation maps while restoring an Undo/Redo spatial snapshot.',
};

function owner(p) {
  for (let f = p.getFunctionParent(); f; f = f.getFunctionParent()) {
    const n = f.node.id?.name || (f.parentPath.isVariableDeclarator() && f.parentPath.node.id.name);
    if (n) return n;
    if (f.parentPath.isObjectProperty()) return f.parentPath.node.key.name;
  }
  return '<top-level>';
}

function scanUnit(u, add, discovered, functions) {
  const file = u.file, name = path.basename(file);
  traverse(u.ast, {
    FunctionDeclaration(p) { functions.set(file+'#'+p.node.id.name, p); },
    ReturnStatement(p) {
      if (name !== 'structure.js') return;
      const value = p.node.argument;
      if (value?.type !== 'MemberExpression' || value.computed || value.property.name !== 'byAtomId') return;
      const store = value.object;
      const annotations = store?.object;
      if (store?.type === 'MemberExpression' && !store.computed
          && annotations?.type === 'MemberExpression' && !annotations.computed
          && annotations.property.name === 'annotations' && annotations.object.type === 'Identifier'
          && annotations.object.name === 'vol') discovered.add(store.property.name);
    },
    CallExpression(p) {
      const callee = p.get('callee'), name = callee.isIdentifier() ? callee.node.name : callee.node.property?.name;
      for (const [s, stem] of Object.entries(stems)) {
        if (name === `getAtom${stem}Meta`) add(p, [s], 'read', name);
        if (name === `setAtom${stem}Meta`) add(p, [s], 'write', name);
        if (name === `get${stem}AnnotationsMap`) add(p, [s], 'map-access', name,
          purpose[owner(p)] || 'Create/access the map; see getter/setter/pruning owner for mutation semantics.');
      }
      if (name === 'cloneVolumeAnnotationsSnapshot') add(p, stores, 'snapshot-read-and-prune', name,
        'Capture all annotations for an edit history/transaction snapshot; snapshot helper also prunes dangling ids.');
    },
    MemberExpression(p) {
      const text = p.toString();
      if (!/\.annotations(?:\.|$)/.test(text)) return;
      if (p.parentPath.isMemberExpression() && p.parentPath.node.object === p.node) return;
      const names = stores.filter(s => text.includes('.annotations.' + s));
      const assignment = p.parentPath.isAssignmentExpression() && p.parentPath.node.left === p.node;
      const operation = assignment ? 'direct-write' : 'direct-read';
      add(p, names.length ? names : stores, operation, text,
        purpose[owner(p)] || (owner(p).startsWith('get') ? 'Create/read map shape at the storage boundary.' : null));
    },
  });
}

function collect(root = ROOT) {
  const edges = [], discovered = new Set(), functions = new Map();
  for (const name of fs.readdirSync(path.join(root, 'assets/app/js')).filter(x => x.endsWith('.js')).sort()) {
    const file = 'assets/app/js/' + name, code = fs.readFileSync(path.join(root, file), 'utf8');
    const u = unit(file, code);
    const add = (p, names, operation, route, why) => edges.push({stores: names, file,
      line: p.node.loc.start.line, owner: owner(p), operation, route,
      purpose: why || purpose[owner(p)] || null});
    scanUnit(u, add, discovered, functions);
  }
  assert.deepEqual([...discovered].sort(), [...stores].sort(), 'New/removed structure.js annotation maps require an explicit audit disposition');
  // Generic whole-volume serialization does not spell each map name at its use
  // site. These reviewed routes supplement the getter/direct-member census.
  const transport = [
    ['session.js', 'captureVolume', 'transport-read', 'pick(vol, VOLUME_FIELDS)', 'Serialize annotations through the explicit volume field allow-list for session save/autosave.'],
    ['session.js', 'hydrate', 'transport-write', 'prepareVolume(vol)', 'Stage and hydrate complete saved volumes, including annotations, before workspace commit.'],
    ['structure-transport.js', 'exportStructureVolume', 'transport-read', 'deps.cloneStructuredData(vol)', 'Clone/normalize the whole volume including annotations for structure export.'],
    ['structure-transport.js', 'parseStructureEnvelopeText', 'transport-write', 'parsed.volume', 'Validate/clone/normalize imported whole-volume annotations before the explicit import commit.'],
    ['session-format.js', 'pack', 'transport-read', 'Object.entries(value)', 'Recursively encode all ordinary object children, including annotation maps.'],
    ['session-format.js', 'unpack', 'transport-write', 'Object.entries(value)', 'Recursively restore ordinary object children; no annotation-specific filtering.'],
  ];
  const session = fs.readFileSync(path.join(root, 'assets/app/js/session.js'), 'utf8');
  assert(/const VOLUME_FIELDS\s*=\s*\[[\s\S]*?'annotations'[\s\S]*?\];/.test(session), 'Session field list lost annotations');
  for (const [name, fn, operation, marker, why] of transport) {
    const file = 'assets/app/js/'+name, p = functions.get(file+'#'+fn);
    assert(p && p.toString().includes(marker), `Reviewed transport route changed: ${name}:${fn}`);
    edges.push({stores, file, line:p.node.loc.start.line, owner:fn, operation, route:marker, purpose:why});
  }
  const consumerRoutes = {
    builder: [
      ['app.js','getBuilderGroupIndices','getAtomBuilderMeta'],
      ['app.js','describeTransformSelection','getAtomBuilderMeta'],
      ['structure.js','buildVolumeSelectionClipboard','getAtomBuilderMeta'],
    ],
    coordination: [
      ['geometry-inference.js','getStoredPreferredGeometryId','vol.annotations.coordination'],
      ['geometry-inference.js','inferAtomGeometry','getStoredPreferredGeometryId'],
      ['geometry-inference.js','inferMainGroupGeometryFromState','preferredCandidate || derivedCandidate'],
      ['edit-halo.js','buildCoordinationDescriptor','getAtomCoordinationGeometryId'],
      ['app.js','createAutoHydrogenGeometryResolver','inferAtomGeometry'],
      ['structure.js','buildVolumeSelectionClipboard','getAtomCoordinationMeta'],
    ],
    metalBonding: [
      ['app.js','buildBondAtomRecords','getAtomMetalBondingMeta'],
      ['bond-inference.js','getMetalBondMode','atom.metalBondMode'],
      ['app.js','applyAtomMetalBondingChoice','inferVolumeBonds'],
      ['structure.js','buildVolumeSelectionClipboard','getAtomMetalBondingMeta'],
    ],
  };
  const assessments = stores.map(store => {
    const consumers = consumerRoutes[store].map(([name,fn,marker]) => {
      const file = 'assets/app/js/'+name, p = functions.get(file+'#'+fn);
      const present = !!p && p.toString().includes(marker);
      assert(present, `Known ${store} consumer changed; review the wire before accepting: ${name}:${fn}`);
      return {file,owner:fn,line:p.node.loc.start.line,marker,present};
    });
    return {store, orphaned:false, disposition:'retain: UI-written value has substantive consumers and export transport', consumers};
  });
  return {schemaVersion: 1, scope: 'The three atom-indexed maps declared in structure.js; measurements/calculations have separate owners.',
    assessments, edges, missingPurposes: edges.filter(x => !x.purpose)};
}

function main() {
  const report = collect();
  assert.deepEqual(report.missingPurposes, [], 'Every new annotation reader/writer needs a reviewed purpose');
  const out = process.argv[2];
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  const index = process.argv.indexOf('--markdown');
  if (index >= 0) {
    const rows = ['# Annotation store consumers', '',
      'Generated by `tools/audit-annotation-stores.cjs`. Source inspection, not proof that every UI path renders. Nothing is removed or repaired.', '',
      'Exactly three atom-indexed maps are declared in structure.js. Each has substantive consumers and whole-volume export/persistence; **no wholly orphaned UI-written store was found**.', '',
      '| Store | UI writers | Substantive consumers | Disposition |', '| --- | --- | --- | --- |',
      '| builder.byAtomId | Molecule/fragment/fused-ring placement; imported builder operations; inherited hydrogen provenance | Group selection and transform scope, fragment-versus-molecule semantics, clipboard remapping and structure/session export | Retain: connected provenance store. |',
      '| coordination.byAtomId | Build coordination choice and undoable selection Coordination choice | getStoredPreferredGeometryId → inferAtomGeometry; halo choice/ghost construction; transform reference geometry; createAutoHydrogenGeometryResolver → hydrogen site planning; clipboard and whole-volume export | Retain: preference has geometry/render/export consumers. Setting it does not itself reposition existing atoms. |',
      '| metalBonding.byAtomId | Undoable selection Metal mode | buildBondAtomRecords → metalBondMode → bond-inference getMetalBondMode/perceiveBondConnectivity → perceived edges/styles → renderer; menu selected state; clipboard/export | Retain: immediate re-perception consumes the override while explicit bonds survive. |', '',
      'The unused exported listHaloCoordinationChoices helper is distinct from these stores. The current halo obtains choices from getCoordinationProfile().choices and inference.compatibleGeometryIds. Its absence from the product call graph does not establish a missing store-to-geometry wire.', '',
      'Preferences may be pruned when atoms disappear or geometry becomes incompatible. Coordination is a preferred target for incomplete atoms, not an instruction to reshape saturated atoms. A different user expectation would need its own behavioral investigation; this audit makes no product change.', '',
      '## Every storage/read/write boundary', '',
      'Map-access rows include creation and mutable-map returns. Snapshot reads can prune invalid entries. Direct leaf use, migration, copying, Undo/Redo replacement and generic transport are distinguished. The setter/getter implementations contain the local map indexing; their callers are enumerated below.', '',
      '| Store(s) | Source / owner | Operation / route | Purpose |', '| --- | --- | --- | --- |'];
    for (const e of report.edges) rows.push(`| ${e.stores.join(', ')} | [${e.file}:${e.line}](../../${e.file}#L${e.line}) · ${e.owner} | ${e.operation}: ${e.route.replaceAll('|','\\|')} | ${e.purpose} |`);
    rows.push('', '## Persistence and scope limits', '',
      'Structure export deep-clones the whole normalized volume; clipboard copies each map explicitly and remaps ids. Session capture includes annotations in VOLUME_FIELDS; the generic pack/unpack codec carries its children and hydration stages the whole volume. Recovery stores the serialized session, with no independent annotation interpretation. These are persistence consumers, not evidence of a geometry effect.', '',
      'This trace covers the atom-indexed maps owned by structure.js. Measurements and Calculations are separate record stores, not additional maps declared there. It inventories known accessors and direct annotations paths, supplemented by the reviewed generic transport routes; it is not arbitrary whole-program alias/data-flow analysis. New accessor names or reflective storage access need review. The tool rejects a newly declared map or a known access path with an unreviewed reader/writer purpose.', '',
      'Part C (dead DOM / unread els) remains deferred. Neither this trace nor the export inventory detects a correctly wired control that never renders, or transitive deadness without a reachability pass.', '');
    fs.writeFileSync(process.argv[index+1], rows.join('\n'));
  }
  console.log(JSON.stringify({stores, edges: report.edges.length, missingPurposes: report.missingPurposes}));
}
module.exports = {collect, scanUnit};
if (require.main === module) main();
