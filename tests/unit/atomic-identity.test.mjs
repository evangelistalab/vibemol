import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGlobalModules } from './load-global-module.mjs';

const files=['assets/vendor/js/atomic-data.js','assets/app/js/element-utils.js',
  'assets/app/js/parsers.js','assets/app/js/structure.js','assets/app/js/bond-inference.js',
  'assets/app/js/coordination.js','assets/app/js/geometry-inference.js','assets/app/js/session-format.js'];
const setup=()=>loadGlobalModules(files);
const plain=value=>JSON.parse(JSON.stringify(value));
const cube=(z,two=false)=>['Identity boundary','one voxel','1 0 0 0',
  '1 1 0 0','1 0 1 0','1 0 0 1',`${z} 0 0 0 0`,two?'0.1 0.2 0.3 0.4':'0.1'].join('\n');
const molden=(z,symbol='C')=>['[Molden Format]','[Atoms] Angs',`${symbol} 1 ${z} 0 0 0`,
  '[GTO]','1 0','s 1 1.0','1.0 1.0','[MO]','Sym= A1','Ene= -0.5',
  'Spin= Alpha','Occup= 2.0','1 1.0'].join('\n');

test('identity domain is exactly the101 catalog entries including X/Dummy',()=>{
  const c=setup(),table=c.ATOM_Z_TO_DATA;
  assert.deepEqual(Object.keys(table).map(Number).sort((a,b)=>a-b),Array.from({length:101},(_,i)=>i));
  assert.equal(table[0].symbol,'X');
  for(let z=0;z<=100;z++){
    assert.equal(c.VibeMolElementUtils.getElementSymbolRaw(z,table),table[z].symbol);
    assert.ok(Number.isFinite(table[z].radius_covalent)&&table[z].radius_covalent>0);
    assert.equal(c.VibeMolParsers.parseCube(cube(z)).atoms[0].Z,z);
    assert.equal(c.VibeMolStructureCore.normalizeVolumeAtom({Z:z}).Z,z);
  }
  assert.equal(c.VibeMolBondInference.getCovalentRadiusAngstrom(0),0.18);
  assert.equal(c.VibeMolBondInference.isMetalAtomicNumber(0),false);
  assert.equal(c.VibeMolBondInference.getElementMaxCoordination(0),0);
});

test('CUBE and2C reject unsupported/fractional identities before normalization',()=>{
  const c=setup();
  for(const z of [-1,6.9,101,118,119,4294967302])for(const two of [false,true]){
    assert.throws(()=>c.VibeMolParsers[two?'parseTwoComponentCube':'parseCube'](cube(z,two)),
      /unsupported atomic number/,`Z=${z},twoComponent=${two}`);
  }
  for(const z of [0,1,6,100])assert.equal(c.VibeMolParsers.parseTwoComponentCube(cube(z,true)).atoms[0].Z,z);
});

test('Molden no longer parseInt-truncates a supplied bad identity',()=>{
  const c=setup();
  for(const z of ['6.9','119','-1','6junk','NaN']){
    assert.throws(()=>c.VibeMolParsers.parseMolden(molden(z)),/unsupported atomic number/,z);
  }
  for(const z of [6,'6.0','6e0','6D0'])assert.equal(c.VibeMolParsers.parseMolden(molden(z)).atoms[0].Z,6);
  assert.equal(c.VibeMolParsers.parseMolden(molden(0,'X')).atoms[0].Z,0);
  // Preserve the existing zero/unspecified Molden token's symbol resolution.
  assert.equal(c.VibeMolParsers.parseMolden(molden(0,'C')).atoms[0].Z,6);
});

test('structure validation precedes migration, inference, ID allocation and mutation',()=>{
  const c=setup(),s=c.VibeMolStructureCore;
  const first=s.normalizeVolumeAtom({Z:6});
  for(const value of [6.9,119,-1,undefined,null,'',true]){
    const volume={atoms:[{Z:6,builderGroupId:'group-99'},{Z:value}],metadata:{unchanged:true}};
    const before=plain(volume);let inferCalls=0;
    assert.throws(()=>s.ensureVolumeSchema(volume,{inferBonds:()=>inferCalls++}),/Unsupported atomic number/);
    assert.deepEqual(plain(volume),before);assert.equal(inferCalls,0);
  }
  assert.equal(s.normalizeVolumeAtom({Z:'6'}).id,'atom-'+(Number(first.id.slice(5))+1));
});

test('an invalid clipboard atom cannot partially append an earlier valid atom',()=>{
  const c=setup(),s=c.VibeMolStructureCore,vol={atoms:[{Z:6}],bonds:[]};
  s.ensureVolumeSchema(vol);const before=plain(vol);
  assert.throws(()=>s.appendVolumeSelectionClipboard(vol,{atoms:[{atom:{Z:6}},{atom:{Z:119}}]}),/Unsupported atomic number/);
  assert.deepEqual(plain(vol),before);
});

test('direct chemistry helpers reject unknown identity instead of generic topology',()=>{
  const c=setup(),b=c.VibeMolBondInference;
  const scalar=['getCovalentRadiusAngstrom','getMetalBondRadiusAngstrom','isMetalAtomicNumber',
    'getAllowedMainGroupValences','getElementMaxCoordination','isAutoBondSupportedAtomicNumber',
    'isMonovalentMainGroupAtomicNumber','isTransitionMetalAtomicNumber','isLanthanideOrActinideAtomicNumber'];
  for(const z of [119,6.9,-1,NaN,undefined])for(const name of scalar){
    assert.throws(()=>b[name](z),/Unsupported atomic number/,`${name}(${String(z)})`);
  }
  assert.throws(()=>b.getPairMaxBondOrder(6,119),/Unsupported atomic number/);
  assert.throws(()=>b.countsTowardAtomValence({Z:119},{Z:6}),/Unsupported atomic number/);
  const atoms=[{Z:6,pos:{distanceTo:()=>1}},{Z:119,pos:{distanceTo:()=>1}}];
  for(const name of ['hasBondCandidates','collectRawBondCandidates','collectBondCandidates','perceiveBondConnectivity',
    'acceptBondCandidatesByDistanceRank','inferBondOrders','inferAromaticSixRings']){
    const edges=[{i:0,j:1,order:2}],before=plain(edges);
    assert.throws(()=>b[name](atoms,edges),/Unsupported atomic number/,name);
    assert.deepEqual(edges,before);
  }
});

test('missing or malformed metadata cannot quietly classify an element',()=>{
  const c=setup(),raw=c.VibeMolElementUtils.getElementSymbolRaw;
  for(const table of [undefined,{}, {6:{symbol:''}},{6:{symbol:123}}]){
    assert.throws(()=>raw(6,table),/Missing element metadata/);
  }
  assert.equal(raw('6',{6:{symbol:' C '}}),'C');
});

test('coordination and geometry validate the original identity before truncation',()=>{
  const c=setup();
  for(const z of [6.9,101,118,119,undefined]){
    assert.throws(()=>c.VibeMolCoordination.getCoordinationProfile(z),/atomic number|element metadata/);
    assert.throws(()=>c.VibeMolGeometryInference.inferGeometryFromState({z,bonds:[]}),/atomic number|element metadata/);
  }
  for(const name of ['period','valenceElectrons','baseValence','resolveEffectiveValence']){
    for(const z of [6.9,119,null,NaN])assert.throws(()=>c.VibeMolGeometryInference[name](z,0),/Unsupported atomic number/);
  }
});

test('session validation agrees with the bundled catalog, including Dummy',()=>{
  const c=setup();
  const vol={atoms:[{id:'atom-1',Z:0,x:0,y:0,z:0}],bonds:[],units:'angstrom',
    origin:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]],nxyz:[0,0,0],data:new Float32Array(0)};
  assert.doesNotThrow(()=>c.VibeMolSessionFormat.validateVolume(vol,'Dummy'));
  for(const Z of [-1,6.9,101,118,119]){
    assert.throws(()=>c.VibeMolSessionFormat.validateVolume({...vol,atoms:[{...vol.atoms[0],Z}]},'invalid'),/invalid atom identity/);
  }
});
