import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModules } from './load-global-module.mjs';
const { VibeMolAppearanceModel: M, VibeMolLooks: L, StyleLabLooks: Lab } = loadGlobalModules([
  'assets/app/js/appearance-model.js','assets/app/js/appearance-looks.js','docs/experiments/style-lab/looks.js']);
const plain = value => JSON.parse(JSON.stringify(value));

test('shared materials remain independent of geometry and lighting', () => {
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

test('Basic restores its original orbital finish without changing the polished atom material', () => {
  const basic=M.normalize(M.legacy('basic'));
  assert.equal(M.resolvedMaterial(basic,'atoms'),basic.material);
  assert.equal(M.resolvedMaterial(basic,'bonds'),basic.material);
  assert.equal(basic.material.roughness,0.16);assert.equal(basic.material.clearcoat,0.82);
  assert.equal(basic.material.emissiveIntensity,0);
  assert.deepEqual(plain(M.resolvedMaterial(basic,'surfaces')),plain(M.surfacePreset('emissive')));
  assert.equal(basic.surfaceMaterial.vertexEmissiveColor,'#000000');
  assert.deepEqual(plain(M.normalize(basic)),plain(basic));
  for(const look of L.builtins.filter(item=>item.id!=='basic')) {
    const rendering=look.settings['appearance.rendering'];
    assert.equal(rendering.surfaceMaterial,null,look.id);
    assert.equal(M.resolvedMaterial(rendering,'surfaces'),rendering.material,look.id);
  }
});

test('older v3 looks keep their stored shared finish rather than adopting new Basic defaults', () => {
  const saved=plain(M.legacy('basic'));delete saved.surfaceMaterial;
  const reopened=M.normalize(saved);
  assert.equal(reopened.surfaceMaterial,null);
  assert.equal(M.resolvedMaterial(reopened,'surfaces'),reopened.material);
  assert.deepEqual(plain(reopened.material),saved.material);
  const explicit=M.fromLegacy({'molecule.style':'basic','surface.materialPreset':'gel'});
  assert.equal(explicit.surfaceMaterial,null);
  assert.equal(M.resolvedMaterial(explicit,'surfaces'),explicit.material);
  assert.equal(explicit.material.roughness,0.15);
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
    // Classic uses the approved app proportions; the standalone lab is the original study.
    assert.equal(value.geometry.atomScaleMain,id==='classic'?1:reference.atomScale);
    assert.equal(value.geometry.atomScaleTransitionMetal,id==='classic'?1.15:reference.atomScale);
    assert.equal(value.geometry.bondRadius,id==='classic'?0.11:reference.bondRadius);
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
    x=>x.surfaceMaterial={...x.material,roughness:-0.1},x=>x.surfaceMaterial='emissive',
  ]) { const value=M.legacy();mutate(value);assert.throws(()=>M.normalize(value)); }
});

test('all color-fill edits release legacy vertex emission overrides', () => {
  const original=M.material({vertexEmissiveColor:'#000000',vertexEmissiveIntensity:0.1});
  for(const patch of [{emissiveIntensity:0.5},{emissiveScale:0.3},{emissiveMix:0.2},{emissiveColor:'#aabbcc'},{emissiveUsesColor:false}]) {
    const updated=M.patchMaterial(original,patch);
    assert.equal(updated.vertexEmissiveColor,null);assert.equal(updated.vertexEmissiveIntensity,null);
    for(const [key,value] of Object.entries(patch)) assert.equal(updated[key],value);
  }
  assert.equal(M.patchMaterial(original,{roughness:0.4}).vertexEmissiveColor,'#000000');
});
