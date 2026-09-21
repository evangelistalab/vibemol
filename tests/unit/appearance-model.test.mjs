import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGlobalModules } from './load-global-module.mjs';
const { VibeMolAppearanceModel: M, VibeMolLooks: L, StyleLabLooks: Lab } = loadGlobalModules([
  'assets/app/js/appearance-model.js','assets/app/js/appearance-looks.js','docs/experiments/style-lab/looks.js']);
const plain = value => JSON.parse(JSON.stringify(value));
const basicStudy = JSON.parse(readFileSync(new URL('../../docs/experiments/style-lab/basic-materials/recipes.json', import.meta.url), 'utf8'));

test('material disclosure follows shader capabilities and optional channels', () => {
  const active = material => M.materialParameters(material).active;
  for (const type of ['matte', 'gel', 'ceramic', 'lacquer', 'metal']) {
    const keys = active(M.surfacePreset(type));
    assert.ok(keys.includes('roughness'), type);
    assert.ok(!keys.includes('toonSteps'), type);
    assert.equal(keys.includes('clearcoatRoughness'), M.surfacePreset(type).clearcoat > 0, type);
    assert.ok(!keys.includes('iridescenceThicknessRange'), type);
  }
  const toon = active(M.material({model:'toon'}));
  assert.ok(toon.includes('toonSteps'));
  assert.ok(!toon.includes('clearcoat'));
  assert.ok(!toon.includes('roughness'));
  assert.ok(!active(M.surfacePreset('metal')).includes('specularIntensity'));
  assert.ok(active(M.material({iridescence:0.5})).includes('iridescenceThicknessRange'));
  assert.ok(!active(M.material({emissiveIntensity:0})).includes('emissiveScale'));
  assert.ok(active(M.material({emissiveIntensity:1})).includes('emissiveScale'));
  assert.ok(!active(M.material({emissiveIntensity:1,emissiveMix:1})).includes('emissiveScale'));
  for (const material of [M.legacy('kit').material,L.materialRecipe('classic').material]) {
    assert.ok(active(material).includes('shininess'));
    assert.ok(!M.materialParameters(material).supported.includes('envMapIntensity'));
  }
});

test('recipes match by active shader settings without changing serialized descriptors', () => {
  for (const [from, to] of [['basic','porcelain'],['classic','kit'],['ink','toon']]) {
    const source=L.materialRecipe(from).material, target=L.materialRecipe(to).material;
    assert.ok(!M.materialEqual(source,target));
    const edited=plain(source);
    for (const key of M.materialParameters(target).supported) edited[key]=plain(target[key]);
    assert.notDeepEqual(edited,plain(target),'inactive fields remain different');
    const before=plain(edited);
    assert.ok(M.materialEqual(edited,target),`${from} → ${to}`);
    assert.ok(M.materialEqual(target,edited),'symmetric');
    assert.deepEqual(edited,before);
    const rendering=plain(M.legacy());rendering.material=edited;
    assert.deepEqual(plain(M.normalize(rendering).material),before,'saving stays lossless');
  }
});

test('material matching ignores dormant channels and retains meaningful differences', () => {
  const base=M.material({model:'physical',specularColor:'#abcdef'});
  const dormant={...plain(base),shininess:99,toonSteps:[1,240],clearcoatRoughness:0.8,
    iridescenceThicknessRange:[0,990],emissiveColor:'#123456',emissiveScale:0.8,emissiveMix:0.3,
    specularColor:'#ABCDEF',roughness:base.roughness+1e-12};
  assert.ok(M.materialEqual(base,dormant));
  for (const patch of [{roughness:0.3},{model:'toon'},{clearcoat:0.1},{iridescence:0.1},{tint:'#aabbcc'},
    {specularColor:'#123456'},{emissiveIntensity:0.5},{envMapIntensity:0.5}]) {
    assert.ok(!M.materialEqual(base,{...plain(base),...patch}),JSON.stringify(patch));
  }
  const metal=L.materialRecipe('metal').material;
  assert.ok(M.materialEqual(metal,{...plain(metal),reflectivity:0.1,specularIntensity:0.2,specularColor:'#123456'}));
  assert.ok(!M.materialEqual(M.material({clearcoat:1}),M.material({clearcoat:1,clearcoatRoughness:0.8})));
  assert.ok(!M.materialEqual(M.material({iridescence:1}),M.material({iridescence:1,iridescenceThicknessRange:[0,900]})));
  assert.ok(!M.materialEqual(null,base));assert.ok(M.materialEqual(null,undefined));
});

test('recipe matching preserves legacy vertex fill overrides', () => {
  const gel=L.materialRecipe('gel').material;
  assert.ok(!M.materialEqual(gel,M.surfacePreset('gel')));
  assert.ok(!M.materialEqual(gel,{...plain(gel),vertexEmissiveIntensity:0.7}));
  assert.ok(M.materialEqual(gel,{...plain(gel),vertexEmissiveIntensity:gel.emissiveIntensity}));
  const dark=M.material({emissiveIntensity:0,vertexEmissiveColor:'#123456'});
  assert.ok(M.materialEqual(dark,M.material()));
  assert.ok(!M.materialEqual(dark,{...plain(dark),vertexEmissiveIntensity:1}));
  assert.ok(!M.materialEqual(M.material({emissiveIntensity:0,vertexEmissiveIntensity:1}),
    M.material({emissiveIntensity:0,vertexEmissiveIntensity:1,emissiveScale:0.5})));
});

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

test('Basic uses the approved Luminous material on atoms, bonds, and surfaces', () => {
  const basic=M.normalize(M.legacy('basic'));
  assert.deepEqual(plain(basic.material),basicStudy.options.find(item=>item.id==='luminous').material);
  assert.equal(basic.surfaceMaterial,null);
  for (const key of ['geometry','lighting','coloring','effects']) {
    assert.deepEqual(plain(basic[key]),basicStudy.referenceSettings['appearance.rendering'][key],key);
  }
  assert.deepEqual(plain(M.normalize(basic)),plain(basic));
  for(const look of L.builtins) {
    const rendering=look.settings['appearance.rendering'];
    assert.equal(rendering.surfaceMaterial,null,look.id);
    for (const target of ['atoms','bonds','surfaces']) assert.equal(M.resolvedMaterial(rendering,target),rendering.material,look.id);
  }
});

test('older v3 looks retain both paired and shared finishes instead of adopting new Basic defaults', () => {
  const saved=plain(basicStudy.referenceSettings['appearance.rendering']);
  assert.deepEqual(plain(M.normalize(saved)),saved);
  assert.notDeepEqual(saved.material,plain(M.legacy('basic').material));
  delete saved.surfaceMaterial;
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

test('curated studio looks preserve lab rendering with approved Classic defaults', () => {
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
    assert.equal(look.settings['surface.colorScheme'],id==='classic'?'national':'custom');
    assert.equal(look.settings['surface.posColor'],id==='classic'?'#e60000':reference.positive);
    assert.equal(look.settings['surface.negColor'],id==='classic'?'#0033a0':reference.negative);
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
