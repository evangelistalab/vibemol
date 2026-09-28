import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGlobalModules } from './load-global-module.mjs';
const {VibeMolCalculationsModel:M,VibeMolMinaoRenderer:R}=loadGlobalModules([
  'assets/vendor/js/atomic-data.js','assets/app/js/edit-utils.js','assets/app/js/calculations-model.js','assets/app/js/minao-renderer.js']);
M.setBasis(JSON.parse(fs.readFileSync(new URL('../../assets/data/basis/cc-pvtz-minao.json',import.meta.url),'utf8')));
M.setBasis(JSON.parse(fs.readFileSync(new URL('../../assets/data/basis/cc-pvtz.json',import.meta.url),'utf8')),'cc-pvtz');
const plain=x=>JSON.parse(JSON.stringify(x));
const record=rows=>({name:'fixture',vol:{units:'angstrom',atoms:rows.map(([Z,x,y,z],i)=>({id:'a'+i,Z,x,y,z}))}});
const ring=()=>record([[6,0,0,.859492],[6,0,-.651229,-.499559],[6,0,.651229,-.499559],[1,.91265,0,1.457504],[1,-.91265,0,1.457504],[1,0,-1.585659,-1.038624],[1,0,1.585659,-1.038624]]);
// Scientific fixtures explicitly assign shells; viewport selection has no AO side effects.
const pick=(r,...indices)=>indices.forEach(i=>{const id='a'+i;if(M.state(r).selections.some(row=>row.id===id))M.removeOrbitals(r,[id]);else M.selectShell(r,id,M.defaultShell(r.vol.atoms.find(a=>a.id===id).Z));});
test('atom selection is transient and does not create or erase AVAS assignments',()=>{
 const r=ring();M.toggleAtom(r,'a0');assert.deepEqual(plain(M.selectedIds(r)),['a0']);
 assert.equal(M.state(r).selections.length,0);assert.equal(M.optionsFor(r).total,0);
 M.selectComponent(r,'a0','2p','px');M.toggleAtom(r,'a0');assert.equal(M.selectedIds(r).length,0);
 assert.deepEqual(plain(M.specs(r)),['C1(2px)']);
 M.toggleAtom(r,'a0');M.toggleAtom(r,'a0',true);assert.deepEqual(plain(M.selectedIds(r)),['a0']);
 const restored={vol:r.vol,calculations:M.normalize(plain(M.state(r)))};
 assert.equal(M.selectedIds(restored).length,0);assert.deepEqual(plain(M.specs(restored)),['C1(2px)']);
 M.setSelectedAtoms(r,['a0','a1','a1','missing']);r.vol.atoms=r.vol.atoms.filter(a=>a.id!=='a0');
 assert.deepEqual(plain(M.selectedIds(r)),['a1']);
});
test('shared orbital editing requires a single period and the intersection of available shells',()=>{
 const r=record([[6,0,0,0],[8,0,1,0],[1,1,0,0],[20,0,0,1],[26,0,1,1],[19,1,1,1]]);
 M.setSelectedAtoms(r,['a0','a1']);assert.equal(M.selectionContext(r).period,2);
 assert.deepEqual(plain(M.selectionContext(r).shells.map(s=>s.label)),['1s','2s','2p','3s','3p']);
 M.selectShells(r,M.selectedIds(r),'2p');assert.deepEqual(plain(M.specs(r)),['C(2p)','O(2p)']);
 const before=plain(M.state(r));assert.equal(M.selectShells(r,['a0','a2'],'1s'),false);
 assert.deepEqual(plain(M.state(r)),before);assert.match(M.selectionContext(r,['a0','a2']).error,/one periodic-table row/);
 assert.equal(M.selectComponents(r,['a0','missing'],'2p','px'),false);
 assert.equal(M.selectShells(r,['a3','a4'],'7s'),false); // Fe has 7s; Ca does not.
 assert.ok(M.selectionContext(r,['a3','a4']).shells.every(s=>M.shellsFor(20).some(a=>a.label===s.label)&&M.shellsFor(26).some(a=>a.label===s.label)));
 M.toggleAtom(r,'a5');assert.match(M.selectionContext(r,['a5']).error,/No shared shells/);
 assert.deepEqual([2,3,10,11,18,19,36,37,54,55,86,87,118].map(M.periodFor),[1,2,2,3,3,4,4,5,5,6,6,7,7]);
});
test('batch editing resolves mixed choices without duplicate functions or changing unrelated atoms',()=>{
 const r=ring();M.selectShell(r,'a0','2p');M.selectComponent(r,'a1','2p','py');M.selectShell(r,'a2','2s');
 M.selectComponents(r,['a0','a1'],'2p','px');assert.deepEqual(plain(M.choiceFor(r,'a0','2p')),['px']);
 assert.deepEqual(plain(M.choiceFor(r,'a1','2p')),['py','px']);
 M.selectComponents(r,['a0','a1'],'2p','px');assert.equal(M.choiceFor(r,'a0','2p'),undefined);
 assert.deepEqual(plain(M.choiceFor(r,'a1','2p')),['py']);assert.equal(M.choiceFor(r,'a2','2s'),'all');
 M.selectShells(r,['a0','a1'],'2p');assert.equal(M.choiceFor(r,'a0','2p'),'all');assert.equal(M.choiceFor(r,'a1','2p'),'all');
 M.selectShells(r,['a0','a1'],'2p');assert.deepEqual(plain(M.specs(r)),['C3(2s)']);
});
test('occupied, outer and next-shell menus match C, S and Fe in filling order',()=>{
 const examples=[
  [6,['1s','2s','2p','3s','3p'],9],
  [16,['1s','2s','2p','3s','3p','4s','4p'],13],
  [26,['1s','2s','2p','3s','3p','4s','3d','4p','5s','4d','5p'],27]
 ];
 for(const [z,expected,count]of examples){
  const r=record([[z,0,0,0]]);
  assert.deepEqual(plain(M.selectionContext(r,['a0']).shells.map(s=>s.label)),expected);
  for(const shell of expected)assert.equal(M.selectShell(r,'a0',shell),true);
  assert.equal(M.projection(r).minao,count);assert.equal(M.optionsFor(r).total,count);
  assert.equal(M.validation(r).errors.length,0);assert.ok(M.generate(r));
  assert.equal(M.selectShell(r,'a0',z===6?'3d':z===16?'5s':'5d'),false);
 }
 const r=record([[26,0,0,0],[28,0,0,2],[20,0,0,4]]);
 assert.equal(M.selectShells(r,['a0','a1'],'5d'),false);
 assert.equal(M.selectComponents(r,['a0','a1'],'6d','dxy'),false);
 M.selectShells(r,['a0','a1'],'3d');M.selectComponents(r,['a0','a1'],'4d','dz2');
 assert.deepEqual(plain(M.specs(r)),['Fe(3d)','Fe(4dz2)','Ni(3d)','Ni(4dz2)']);
 assert.equal(M.optionsFor(r).total,12);
 for(const ids of [['a0','a2'],['a2','a0']])assert.deepEqual(plain(M.selectionContext(r,ids).shells.map(s=>s.label)),['1s','2s','2p','3s','3p','4s','4p','5s','5p']);
});
test('expanded light-element choices use real cc-pVTZ functions and matching input without changing old sessions',()=>{
 const r=record([[6,0,0,0],[8,0,0,2]]);
 M.selectComponent(r,'a0','2p','px');const old=plain(M.state(r));
 assert.equal(M.previewBasis(r),'cc-pvtz-minao');
 M.selectComponents(r,['a0','a1'],'3p','pz');
 assert.equal(M.previewBasis(r),'cc-pvtz');
 assert.equal(M.optionsFor(r).minao,'cc-pvtz');
 assert.deepEqual(plain(M.specs(r)),['C(2px)','C(3pz)','O(3pz)']);
 assert.match(M.generate(r),/minao_basis_set="cc-pvtz"/);
 for(const f of M.projection(r).functions){
  const actual=M.shellsFor(f.atom.Z,'cc-pvtz').find(s=>s.label===f.shell.label);
  assert.deepEqual(plain(f.shell),plain(actual));
  const g=R.grid(f.shell,f.component);assert.ok(g.iso>0&&g.data.some(v=>Math.abs(v)>g.iso));
 }
 const restored={vol:r.vol,calculations:M.normalize(plain(M.state(r)))};
 assert.deepEqual(plain(M.specs(restored)),plain(M.specs(r)));assert.equal(M.generate(restored),M.generate(r));
 const legacy={vol:r.vol,calculations:M.normalize(old)};
 assert.equal(M.previewBasis(legacy),'cc-pvtz-minao');assert.deepEqual(plain(M.specs(legacy)),['C(2px)']);
 assert.deepEqual(plain(M.projection(legacy).functions[0].shell),plain(M.shellsFor(6).find(s=>s.label==='2p')));
 // An explicit incompatible basis change must not silently drop higher shells.
 M.setOptions(r,{minao:'cc-pvtz-minao'});assert.equal(M.generate(r),'');
 assert.match(M.validation(r).errors.join(' '),/3p.*unavailable/);
});
test('older transition-metal assignments survive session normalization and can be explicitly removed',()=>{
 const r=record([[26,0,0,0]]);
 r.calculations=M.normalize({selections:[{id:'a0',shells:{'3d':'all','5d':['dz2']}}]});
 M.prune(r);assert.deepEqual(plain(M.specs(r)),['Fe(3d)','Fe(5dz2)']);
 assert.equal(M.projection(r).minao,6);assert.match(M.generate(r),/Fe\(5dz2\)/);
 assert.equal(M.selectShell(r,'a0','5d'),false);
 M.removeOrbitals(r,['a0']);assert.equal(M.specs(r).length,0);
});
test('plane fitting requires all requested atoms to have eligible shells and survives deselection',()=>{
 const r=ring();M.setSelectedAtoms(r,['a0','a1','a2']);assert.match(M.addPlane(r,M.selectedIds(r)).error,/whole p shells/);
 M.selectShells(r,M.selectedIds(r),'2p');assert.ok(!M.addPlane(r,M.selectedIds(r)).error);
 M.setSelectedAtoms(r,[]);assert.equal(M.projection(r).orbitals,3);assert.equal(M.state(r).planes.length,1);
 M.removeOrbitals(r,['a1']);assert.equal(M.state(r).planes.length,0);
});
test('MINAO labels and default shells follow forte2, including CCA components and whole f/g shells',()=>{
 assert.deepEqual(plain(M.componentsFor('p')),['py','pz','px']);assert.deepEqual(plain(M.componentsFor('d')),['dxy','dyz','dz2','dxz','dx2-y2']);assert.equal(M.componentsFor('f').length,0);
 assert.deepEqual(plain(M.shellsFor(6).map(s=>s.label)),['1s','2s','2p']);assert.equal(M.defaultShell(26),'3d');assert.equal(M.defaultShell(1),'1s');assert.equal(M.defaultShell(19),undefined);
 assert.equal(M.defaultShell(11),'3s');assert.equal(M.defaultShell(20),'4s');assert.equal(M.defaultShell(17),'3p');
 assert.ok(M.shellsFor(26).some(s=>s.label==='4f'));assert.ok(M.shellsFor(26).some(s=>s.label==='5g'));
});
test('whole-shell/component exclusivity, component collapse, and discontiguous ranges',()=>{
 const r=ring();pick(r,0);M.selectComponent(r,'a0','2p','px');assert.deepEqual(plain(M.specs(r)),['C1(2px)']);
 M.selectComponent(r,'a0','2p','py');M.selectComponent(r,'a0','2p','pz');assert.deepEqual(plain(M.specs(r)),['C1(2p)']);
 pick(r,2);assert.deepEqual(plain(M.specs(r)),['C1(2p)','C3(2p)']);pick(r,1);assert.deepEqual(plain(M.specs(r)),['C(2p)']);
 M.selectShell(r,'a0','2p');assert.deepEqual(plain(M.specs(r)),['C2-3(2p)']);
});
test('cyclopropene plane agrees with the SVD subspace and renders only its normal combination',()=>{
 const r=ring();pick(r,0,1,2);assert.ok(!M.addPlane(r).error);
 const p=M.projection(r);assert.equal(p.minao,9);assert.equal(p.orbitals,3);assert.equal(p.functions.length,3);assert.ok(Math.abs(p.planes[0].normal[0])>.999999);
 assert.deepEqual(plain(M.planeSpecs(r)),[['C1-3']]);assert.match(M.generate(r),/subspace=\["C\(2p\)"\]/);
 M.selectComponent(r,'a0','2p','px');assert.equal(M.planeEligible(M.state(r).selections[0]),false);assert.equal(M.state(r).planes.length,0);assert.equal(M.projection(r).orbitals,7);
});
test('automatic total follows shells, components and pi planes, with GHF doubling only in output',()=>{
 const r=ring();assert.equal(M.optionsFor(r).total,0);assert.equal(M.optionsFor(r).method,'cumulative');
 M.setOptions(r,{method:'total'});assert.equal(M.generate(r),'');
 pick(r,0,1,2);assert.equal(M.optionsFor(r).total,9);assert.match(M.generate(r),/num_active=9,/);
 M.addPlane(r);assert.equal(M.optionsFor(r).total,3);assert.match(M.generate(r),/num_active=3,/);
 M.setOptions(r,{reference:'GHF'});assert.equal(M.optionsFor(r).total,3);assert.match(M.generate(r),/num_active=6,/);
 M.selectComponent(r,'a0','2p','px');assert.equal(M.optionsFor(r).total,7);assert.match(M.generate(r),/num_active=14,/);
 M.setOptions(r,{reference:'RHF'});M.selectShell(r,'a0','2s');assert.equal(M.optionsFor(r).total,8);
 r.vol.atoms=r.vol.atoms.filter(a=>a.id!=='a0');assert.equal(M.optionsFor(r).total,6);
});
test('manual total survives selection, method, reference and session changes until explicitly reset',()=>{
 const r=ring();pick(r,0,1,2);M.setOptions(r,{method:'total',total:4});
 M.addPlane(r);assert.equal(M.optionsFor(r).total,4);assert.equal(M.optionsFor(r).totalFollowsSelection,false);
 M.setOptions(r,{method:'cumulative',reference:'GHF'});M.selectComponent(r,'a0','2p','px');
 r.calculations=M.normalize(plain(r.calculations));M.setOptions(r,{method:'total'});
 assert.equal(M.optionsFor(r).total,4);assert.match(M.generate(r),/num_active=8,/);
 M.setOptions(r,{total:0});assert.equal(M.generate(r),'');assert.equal(M.optionsFor(r).totalFollowsSelection,false);
 M.setOptions(r,{totalFollowsSelection:true});assert.equal(M.optionsFor(r).total,7);assert.match(M.generate(r),/num_active=14,/);
 r.calculations=M.normalize(plain(r.calculations));pick(r,2);assert.equal(M.optionsFor(r).total,4);
 const other=ring();pick(other,0);assert.equal(M.optionsFor(other).total,3);
});
test('older saved explicit totals are preserved and automatic totals resolve after basis loading',()=>{
 const r=ring();pick(r,0,1);const saved=plain(r.calculations);
 saved.options.total=11;delete saved.options.totalFollowsSelection;r.calculations=M.normalize(saved);
 assert.equal(M.optionsFor(r).total,11);assert.equal(M.optionsFor(r).totalFollowsSelection,false);
 const {VibeMolCalculationsModel:fresh}=loadGlobalModules(['assets/vendor/js/atomic-data.js','assets/app/js/edit-utils.js','assets/app/js/calculations-model.js']);
 saved.options.totalFollowsSelection=true;r.calculations=fresh.normalize(saved);
 assert.equal(fresh.optionsFor(r).total,11); // Loading must not discard a saved value.
 fresh.setBasis(JSON.parse(fs.readFileSync(new URL('../../assets/data/basis/cc-pvtz-minao.json',import.meta.url),'utf8')));
 assert.equal(fresh.optionsFor(r).total,6);
});
test('plane fitting rejects collinear/nonplanar atoms and matches the molecular-centroid phase convention',()=>{
 const r=record([[6,0,0,0],[6,1,0,0],[6,2,0,0]]);assert.match(M.fitPlane(r,['a0','a1','a2']).error,/non-collinear/);
 const tilted=record([[6,0,0,0],[6,0,2,0],[6,0,0,2],[1,2,0,0]]);const fit=M.fitPlane(tilted,['a0','a1','a2']);assert.ok(fit.normal[0]<-.999);
 const tetra=record([[6,1,1,1],[6,-1,-1,1],[6,-1,1,-1],[6,1,-1,-1]]);assert.match(M.fitPlane(tetra,['a0','a1','a2','a3']).error,/not near-coplanar/);
});
test('N2 GHF doubles emitted counts once and changes the downstream calculation chain',()=>{
 const r=record([[7,0,0,0],[7,0,0,1.2]]);pick(r,0,1);Object.assign(M.state(r).options,{method:'separate',docc:3,uocc:3});
 assert.match(M.generate(r),/num_active_docc=3/);assert.equal(M.projection(r).orbitals,6);
 M.state(r).options.reference='GHF';const code=M.generate(r);assert.match(code,/num_active_docc=6/);assert.match(code,/num_active_uocc=6/);assert.match(code,/CI\(RelCISolver\(nel=mf.nel\)\)\(avas\)/);assert.match(code,/x2c_type="so"/);assert.equal(M.projection(r).orbitals,12);
 M.state(r).options.reference='RHF';assert.match(M.generate(r),/num_active_docc=3/);assert.match(M.generate(r),/MCOptimizer/);
});
test('ROHF emits matching signed spin projections and high-spin CI states without doubling counts',()=>{
 const r=record([[7,0,0,0]]);pick(r,0);M.setOptions(r,{reference:'ROHF',ms:1.5,method:'total'});
 let code=M.generate(r);assert.match(code,/import AVAS, CISolver, MCOptimizer, ROHF, State, System/);
 assert.match(code,/rohf = ROHF\(charge=0, ms=1.5\)\(system\)/);assert.match(code,/\)\(rohf\)/);
 assert.match(code,/State\(nel=rohf.nel, multiplicity=4, ms=1.5\)/);assert.match(code,/num_active=3,/);
 assert.equal(M.projection(r).orbitals,3);assert.equal(M.optionsFor(r).total,3);
 M.setOptions(r,{ms:-0.5});code=M.generate(r);assert.match(code,/ROHF\(charge=0, ms=-0.5\)/);
 assert.match(code,/multiplicity=2, ms=-0.5/);
 r.calculations=M.normalize(plain(r.calculations));assert.equal(M.optionsFor(r).ms,-0.5);
 M.setOptions(r,{reference:'GHF'});assert.doesNotMatch(M.generate(r),/\bms=/);assert.match(M.generate(r),/num_active=6,/);
 M.setOptions(r,{reference:'ROHF'});assert.match(M.generate(r),/multiplicity=2, ms=-0.5/);
 const o2=record([[8,0,0,0],[8,0,0,1.2]]);pick(o2,0,1);M.setOptions(o2,{reference:'ROHF',ms:1});
 assert.match(M.generate(o2),/multiplicity=3, ms=1/);
 M.setOptions(o2,{ms:0});assert.match(M.generate(o2),/multiplicity=1, ms=0/);
 M.setOptions(o2,{reference:'RHF',ms:1});assert.match(M.generate(o2),/rhf = RHF\(charge=0\)/);
 assert.match(M.generate(o2),/multiplicity=1, ms=0.0/);
});
test('ROHF validates half-integer spin, charge parity and electron bounds only for ROHF',()=>{
 const r=record([[7,0,0,0]]);pick(r,0);M.setOptions(r,{reference:'ROHF'});
 for(const [ms,reason]of [[0,/requires half-integer/],[0.25,/steps of 0.5/],[4,/half the electron count/],[-4,/half the electron count/],[NaN,/steps of 0.5/],[Infinity,/steps of 0.5/]]){
   M.setOptions(r,{ms});assert.equal(M.generate(r),'');assert.match(M.validation(r).errors.join(' '),reason);
 }
 M.setOptions(r,{ms:.5});assert.ok(M.generate(r));
 M.setOptions(r,{charge:1});assert.match(M.validation(r).errors.join(' '),/requires integer/);
 M.setOptions(r,{ms:1});assert.match(M.generate(r),/ROHF\(charge=1, ms=1\)/);
 M.setOptions(r,{reference:'RHF',ms:.25});assert.ok(M.generate(r));
 M.setOptions(r,{reference:'GHF',charge:0});assert.ok(M.generate(r));
 assert.equal(M.normalize({options:{reference:'ROHF'}}).options.ms,0);
});
test('ROHF can select singly occupied orbitals alone with separate counts, respecting forte2 validation',()=>{
 const r=record([[7,0,0,0]]);pick(r,0);M.setOptions(r,{reference:'ROHF',ms:.5,method:'separate',docc:0,uocc:0});
 assert.match(M.generate(r),/num_active_docc=0,/);assert.match(M.generate(r),/num_active_uocc=0,/);
 M.setOptions(r,{ms:-.5});assert.equal(M.generate(r),'');assert.match(M.validation(r).errors.join(' '),/For negative ms, forte2 AVAS/);
 M.setOptions(r,{docc:2});assert.ok(M.generate(r));
 M.setOptions(r,{reference:'RHF',charge:1,docc:0});assert.equal(M.generate(r),'');
 M.setOptions(r,{reference:'ROHF',ms:0});assert.equal(M.generate(r),'');
 M.setOptions(r,{ms:1,docc:-1});assert.match(M.validation(r).errors.join(' '),/nonnegative integers/);
});
test('shared atoms use the normalized mean of independently fitted plane normals',()=>{
 const r=record([[6,0,0,0],[6,0,0,1],[6,0,1,0],[6,1,0,0],[1,10,10,10]]);pick(r,0,1,2,3);
 assert.ok(!M.addPlane(r,['a0','a1','a2']).error);assert.ok(!M.addPlane(r,['a0','a1','a3']).error);
 const p=M.projection(r);assert.equal(p.orbitals,4);assert.equal(p.minao,12);
 const normal=p.functions.find(f=>f.atom.id==='a0').normal;
 assert.ok(Math.abs(normal[0]+Math.SQRT1_2)<1e-8);assert.ok(Math.abs(normal[1]+Math.SQRT1_2)<1e-8);assert.ok(Math.abs(normal[2])<1e-8);
});
test('formaldehyde selects one px pair per atom; output includes the loaded XYZ and validates parameters',()=>{
 const r=record([[6,0,0,-.59954],[8,0,0,.59938],[1,0,-.9388,-1.187],[1,0,.9388,-1.187]]);pick(r,0,1);
 for(const id of ['a0','a1'])M.selectComponent(r,id,'2p','px');assert.equal(M.projection(r).minao,2);assert.equal(M.projection(r).orbitals,2);
 assert.deepEqual(plain(M.specs(r)),['C(2px)','O(2px)']);assert.match(M.generate(r),/C 0.0000000000 0.0000000000 -0.5995400000/);
 M.state(r).options.cutoff=1;M.state(r).options.method='cutoff';assert.equal(M.generate(r),'');
 M.state(r).options.cutoff=.1;assert.match(M.generate(r),/cutoff=0.1/);M.state(r).options.minao='custom';assert.ok(M.validation(r).warnings.length);
});
test('selection identity survives atom reorder/removal and normalized sessions cannot duplicate a shell',()=>{
 const r=ring();pick(r,0,2);r.vol.atoms.reverse();assert.deepEqual(plain(M.specs(r)),['C1(2p)','C3(2p)']);r.vol.atoms.pop();M.prune(r);assert.equal(M.state(r).selections.length,1);
 const s=M.normalize({selections:[{id:'a',shells:{'2p':['px','py','pz','px']}}]});assert.equal(s.selections[0].shells['2p'],'all');
});
test('contracted real harmonics have CCA axes, parity and unit radial/angular normalization',()=>{
 assert.ok(Math.abs(R.harmonic(1,2,1,0,0)-1)<1e-10);assert.ok(Math.abs(R.harmonic(1,2,0,1,0))<1e-10);
 assert.ok(Math.abs(R.harmonic(1,0,0,1,0)-1)<1e-10);assert.ok(Math.abs(R.harmonic(2,0,1,1,0)-Math.sqrt(3))<1e-10);
 for(let l=0;l<=4;l++)for(let m=0;m<=2*l;m++)assert.ok(Math.abs(R.harmonic(l,m,1,2,3)-(-1)**l*R.harmonic(l,m,-1,-2,-3))<1e-8);
 for(const shell of M.shellsFor(6)){const radial=R.radial(shell);let norm=0;const step=.001;for(let r=step/2;r<14;r+=step)norm+=radial(r*r)**2*r**(2*shell.l+2)*step*4*Math.PI/(2*shell.l+1);assert.ok(Math.abs(norm-1)<1e-5,[shell.label,norm]);}
});

test('MINAO size changes contour with fixed per-shell preview scaling and bond-scale bounds',()=>{
 for(const [z,label]of [[6,'2p'],[7,'2p'],[8,'2p'],[26,'3d']]) {
  const shell=M.shellsFor(z).find(s=>s.label===label);
  const small=R.grid(shell,0,.65),normal=R.grid(shell,0),large=R.grid(shell,0,.15);
  assert.ok(large.iso<normal.iso&&normal.iso<small.iso);
  assert.ok(Math.abs(large.origin[0])>Math.abs(normal.origin[0]));
  const radial=R.radial(shell);let peak=0,outer=0;
  for(let i=0;i<=4000;i++){const r=i/1000/.529177210903;peak=Math.max(peak,Math.abs(radial(r*r))*r**shell.l);}
  for(let i=0;i<=4000;i++){const r=i/1000/.529177210903;if(Math.abs(radial(r*r))*r**shell.l>=peak*R.DEFAULT_CONTOUR)outer=i/1000;}
  assert.ok(outer>.5&&outer<1,`${z} ${label}: ${outer} Å`);
  assert.equal(small.previewScale,normal.previewScale);assert.equal(large.previewScale,normal.previewScale);
  assert.ok(outer*normal.previewScale>=.89 && outer*normal.previewScale<=1.26);
 }
 assert.equal(R.normalizeContour(NaN),R.DEFAULT_CONTOUR);
 assert.equal(R.normalizeContour(0),.15);assert.equal(R.normalizeContour(1),.65);
});
