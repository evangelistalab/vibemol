import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
const { VibeMolAppearanceModel: M, VibeMolLooks: L, StyleLabLooks: Lab } = loadGlobalModules([
  'assets/app/js/appearance-model.js','assets/app/js/appearance-looks.js','docs/experiments/style-lab/looks.js']);
const plain = value => JSON.parse(JSON.stringify(value));

test('one material is shared by atoms, bonds, and surfaces independently of geometry and lighting', () => {
  assert.deepEqual(plain(L.builtins.filter(item=>!item.experimental).map(item=>item.name)), ['Basic','Toon','Kit','Classic','Porcelain','Ink','Opal']);
  const kit = M.legacy('kit'), original = plain(kit);
  kit.material = M.material({model:'toon'});
  const result = M.normalize(kit);
  assert.deepEqual(plain(result.geometry), original.geometry);
  assert.deepEqual(plain(result.lighting), original.lighting);
  for (const target of ['atoms','bonds','surfaces']) assert.equal(M.resolvedMaterial(result,target),result.material);
  assert.equal(result.material.model,'toon');
  assert.equal(M.legacy('kit').material.model,'phong');
  assert.ok(!('materials' in result));
});

test('v2 looks migrate to the atom base material without retaining hidden material overrides', () => {
  const old = plain(M.legacy('kit')); old.version=2;
  old.materials={atoms:old.material,bonds:M.surfacePreset('matte'),surfaces:M.surfacePreset('glossy'),bondsLinked:false};
  old.materials.atoms.byElement={26:{shininess:175}};delete old.material;
  delete old.geometry.atomRadii;delete old.lighting.rimPos;delete old.lighting.toneMapping;
  const result=M.normalize(old);
  assert.equal(result.version,3);assert.equal(result.material.shininess,145);
  assert.deepEqual(plain(result.material.byElement),{});
  assert.deepEqual(plain(result.lighting.rimPos),[-1.4,1,-0.8]);assert.equal(result.lighting.toneMapping,'linear');
  assert.deepEqual(plain(M.normalize(result)),plain(result));
  old.materials.surfaces.roughness=-1;assert.throws(()=>M.normalize(old));
});

test('v1 custom looks migrate with their material and lighting values', () => {
  for(const style of ['basic','toon','kit']) assert.deepEqual(plain(M.fromLegacy({'molecule.style':style})),plain(M.legacy(style)));
  const settings={...plain(L.defaults),'molecule.style':'toon','molecule.material.finish':'physical','molecule.material.polish':0.72,'lighting.custom':true,'lighting.key':2.3};
  delete settings['appearance.rendering'];
  const migrated=M.fromLegacy(settings);
  assert.equal(migrated.material.model,'physical');assert.equal(migrated.material.roughness,0.92-0.72*0.85);
  assert.equal(migrated.geometry.atomScaleMain,1.16);assert.equal(migrated.lighting.dirIntensity,2.3);
  const file={kind:'vibemol.preset',presetVersion:1,meta:{lookVersion:1},settings:{...settings,'appearance.look':{id:'user-old',name:'Old look',revision:1,settings}}};
  assert.deepEqual(plain(L.importLook(file).settings['appearance.rendering']),plain(migrated));
});

test('curated studio looks retain the original lab light rig, finishes, palettes, and display radii', () => {
  for(const id of ['classic','porcelain','ink','opal']) {
    const reference=Lab.builtins.find(look=>look.id===id).settings;
    const look=L.builtins.find(look=>look.id===id), value=look.settings['appearance.rendering'];
    assert.equal(value.lighting.dirIntensity,reference.key);assert.equal(value.lighting.hemiIntensity,reference.fill);
    assert.equal(value.lighting.rimIntensity,reference.rim);assert.equal(value.lighting.ambIntensity,0);
    assert.deepEqual(plain(value.lighting.dirPos),[-3.5,5,7]);assert.deepEqual(plain(value.lighting.rimPos),[3.5,2,-5]);
    assert.equal(value.lighting.toneMapping,reference.finish==='phong'?'none':'aces');
    assert.equal(value.material.model,reference.finish);assert.equal(value.material.envMapIntensity,reference.environment);
    assert.equal(value.material.clearcoat,reference.coat);assert.equal(value.material.iridescence,reference.iridescence);
    assert.equal(value.material.roughness,0.92-reference.smoothness*0.85);
    assert.deepEqual(plain(value.material.iridescenceThicknessRange),[130,380]);
    assert.equal(value.geometry.atomScaleMain,reference.atomScale);assert.equal(value.geometry.bondRadius,reference.bondRadius);
    assert.deepEqual(plain(value.geometry.atomRadii),{1:0.28,6:0.43,7:0.42,8:0.4});
    assert.equal(look.settings['global.backgroundColor'],reference.background);
    assert.equal(look.settings['surface.posColor'],reference.positive);assert.equal(look.settings['surface.negColor'],reference.negative);
  }
});

test('appearance validation rejects invalid shared materials and lighting before rendering', () => {
  for(const mutate of [
    x=>x.geometry.bondRadius=NaN, x=>x.geometry.connector='fancy', x=>x.geometry.atomRadii={6:-1},
    x=>x.lighting.dirPos=[0,0,0], x=>x.lighting.rimPos=[0,0,0],x=>x.lighting.toneMapping='unknown',
    x=>x.lighting.dirColor='red', x=>x.material.byElement={26:{roughness:3}},
    x=>x.material.toonSteps=[0], x=>x.material.clearcoat=-1,x=>x.material.iridescenceThicknessRange=[300,100],
  ]) { const value=M.legacy();mutate(value);assert.throws(()=>M.normalize(value)); }
});
