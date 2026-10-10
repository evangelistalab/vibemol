// Executable investigation of the Stage 1 compatibility audit, not a behavior fix.
import assert from 'node:assert/strict';
import { loadGlobalModules } from '../../../unit/load-global-module.mjs';
const c = loadGlobalModules([
  'assets/vendor/js/atomic-data.js', 'assets/app/js/element-utils.js',
  'assets/app/js/parsers.js', 'assets/app/js/structure.js', 'assets/app/js/bond-inference.js',
]);
const U = c.VibeMolElementUtils;
const symbols = (z, table) => ({ app: U.getElementSymbol(z, table),
  coordinationAndGeometry: U.getElementSymbolByAtomicNumber(z, table), bondInference: U.getElementSymbolRaw(z, table) });
const cube = z => ['Fractional Z investigation', 'density', '1 0 0 0',
  '1 1 0 0', '1 0 1 0', '1 0 0 1', `${z} 0 0 0 0`, '0.125'].join('\n');
const parsed = c.VibeMolParsers.parseCube(cube(6.9));
const parsed2c = c.VibeMolParsers.parseTwoComponentCube(cube(6.9));
assert.equal(parsed.atoms[0].Z, 6.9);
assert.equal(parsed2c.atoms[0].Z, 6.9);
const cubeParserZ = parsed.atoms[0].Z;
let zAtInference;
c.VibeMolStructureCore.ensureVolumeSchema(parsed, { inferBonds: vol => { zAtInference = vol.atoms[0].Z; vol.bonds = []; } });
assert.equal(zAtInference, 6);
const unknown = c.VibeMolParsers.parseCube(cube(119));
c.VibeMolStructureCore.ensureVolumeSchema(unknown, { inferMissingBonds: false });
assert.equal(unknown.atoms[0].Z, 119);
const jsonNumber = n => Number.isNaN(n) ? 'NaN' : n;
const result = {
  sourceCommit: 'f3f1fd6', baseTag: 'v0.9.5-pre-refactor',
  nonIntegerAtomicNumbers: {
    cubeParser: cubeParserZ, twoComponentCubeParser: parsed2c.atoms[0].Z,
    schemaBeforeInference: zAtInference, normalizedStructure: parsed.atoms[0].Z,
    conclusion: 'Fractional Z is possible in parser intermediates and direct low-level API calls, but supported live-app load/edit/session paths normalize or reject it before the three symbol callers. Fractional lookup divergences are unreachable in ordinary live structures, not universally unreachable API branches.',
    liveAppGuards: [
      'file-loader.js appendParsedVolumeRecord calls app ensureVolumeSchema before storing a volume',
      'structure.js ensureVolumeSchema normalizes every atom before invoking inferBonds; normalizeVolumeAtom uses Number(atom.Z)|0',
      'app.js buildBondAtomRecords again uses a.Z|0',
      'XYZ resolves symbols against the bundled integer table; Molden uses parseInt; editor/Coordinates use integer selection or Math.trunc',
      'structure-envelope import invokes ensureVolumeSchema; session-format validates safe integer Z in [1,118] before hydration',
    ],
  },
  workedExamples: {
    unknown119: symbols(119, c.ATOM_Z_TO_DATA),
    fractional6_9: symbols(6.9, {6:{symbol:'C'}}),
    spacedSymbol: symbols(6, {6:{symbol:' C '}}),
    numericSymbol: symbols(6, {6:{symbol:123}}),
    nanClamp: Object.fromEntries(['clamp','clampOrZero','clampWithUpperPriority'].map(k => [k,jsonNumber(U[k](NaN,-1,1))])),
    reversedClamp: Object.fromEntries(['clamp','clampOrZero','clampWithUpperPriority'].map(k => [k,U[k](0,1,-1)])),
  },
  reachableUnknownElement: {
    cubeZ119AfterNormalization: unknown.atoms[0].Z,
    metalClassification: c.VibeMolBondInference.isMetalAtomicNumber(119),
    covalentRadiusAngstrom: c.VibeMolBondInference.getCovalentRadiusAngstrom(119),
    mainGroupMaxCoordination: c.VibeMolBondInference.getElementMaxCoordination(119),
    metalRadiusAngstrom: c.VibeMolBondInference.getMetalBondRadiusAngstrom(119),
    note: 'Covalent radii read metadata by Z; metal classification/radii/coordination caps use symbol-keyed tables. A placeholder alone would still choose generic chemistry defaults; validation/error propagation is required.',
  },
  knownOutOfScopeClamp: {
    file: 'assets/app/js/workbench-model.js', line: 21, arity: 4,
    source: 'Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback))',
    note: 'Known separate finite-number/fallback contract; deliberately excluded from Stage 1 and future Stage 4/5 duplicate rediscovery.',
  },
};
console.log(JSON.stringify(result, null, 2));
