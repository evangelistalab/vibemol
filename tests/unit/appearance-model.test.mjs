import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
const { VibeMolAppearanceModel: M, VibeMolLooks: L } = loadGlobalModules(['assets/app/js/appearance-model.js','assets/app/js/appearance-looks.js']);
const plain = value => JSON.parse(JSON.stringify(value));

test('geometry and shading compose independently, and recipes do not share mutable data', () => {
  assert.deepEqual(plain(L.builtins.filter(item=>!item.experimental).map(item=>item.name)), ['Basic','Toon','Kit']);
  const kit = M.legacy('kit'), original = plain(kit);
  kit.materials.atoms = M.material({model:'toon'});
  kit.materials.surfaces = M.surfacePreset('enamel');
  const result = M.normalize(kit);
  assert.deepEqual(plain(result.geometry), original.geometry);
  assert.deepEqual(plain(result.lighting), original.lighting);
  assert.equal(result.materials.bonds.model, 'phong');
  assert.equal(result.materials.surfaces.model, 'physical');
  assert.equal(M.legacy('kit').materials.atoms.model, 'phong');
});

test('per-element accents survive saving, while explicit property edits override the accents', () => {
  const kit = M.legacy('kit');
  assert.equal(M.resolvedMaterial(kit,'atoms',26).shininess,175);
  kit.materials.atoms = M.patchMaterial(kit.materials.atoms,{shininess:45});
  assert.equal(M.resolvedMaterial(kit,'atoms',26).shininess,45);
  assert.equal(M.resolvedMaterial(kit,'atoms',26).specularColor,'#ffe7b8');
  kit.materials.bondsLinked=true;
  assert.equal(M.resolvedMaterial(kit,'bonds').shininess,45);
  assert.deepEqual(plain(M.normalize(plain(kit))),plain(kit));
});

test('old styles and v1 custom looks migrate to explicit independent descriptors', () => {
  for(const style of ['basic','toon','kit']) assert.deepEqual(plain(M.fromLegacy({'molecule.style':style})),plain(M.legacy(style)));
  const settings={...plain(L.defaults),'molecule.style':'toon','molecule.material.finish':'physical','molecule.material.polish':0.72,'lighting.custom':true,'lighting.key':2.3,'surface.followMoleculeStyle':false,'surface.materialPreset':'enamel'};
  delete settings['appearance.rendering'];
  const migrated=M.fromLegacy(settings);
  assert.equal(migrated.materials.atoms.model,'physical');
  assert.equal(migrated.materials.surfaces.model,'physical');
  assert.equal(migrated.materials.surfaces.roughness,0.28);
  assert.equal(migrated.geometry.atomScaleMain,1.16);
  assert.equal(migrated.lighting.dirIntensity,2.3);
  const file={kind:'vibemol.preset',presetVersion:1,meta:{lookVersion:1},settings:{...settings,'appearance.look':{id:'user-old',name:'Old look',revision:1,settings}}};
  assert.deepEqual(plain(L.importLook(file).settings['appearance.rendering']),plain(migrated));
});

test('appearance validation rejects invalid nested values before rendering', () => {
  for(const mutate of [
    x=>x.geometry.bondRadius=NaN, x=>x.geometry.connector='fancy', x=>x.lighting.dirPos=[0,0,0],
    x=>x.lighting.dirColor='red', x=>x.materials.atoms.byElement={26:{roughness:3}},
    x=>x.materials.bonds.toonSteps=[0], x=>x.materials.surfaces.clearcoat=-1,
  ]) { const value=M.legacy();mutate(value);assert.throws(()=>M.normalize(value)); }
});
