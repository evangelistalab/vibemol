import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import cp from 'node:child_process';
import {loadGlobalModules} from './load-global-module.mjs';
const {VibeMolForte2Format:F,ATOM_Z_TO_DATA:E}=loadGlobalModules(['assets/vendor/js/atomic-data.js','assets/app/js/forte2-format.js']);
const plain=value=>JSON.parse(JSON.stringify(value));
const oracle=JSON.parse(fs.readFileSync(new URL('../baselines/forte2-cas-oracle.json',import.meta.url)));
test('CAS agrees with all 1428 executions of upstream PR283 parameter checking',()=>{
 assert.equal(oracle.cases.length,1428);let accepted=0;
 for(const c of oracle.cases){
  const result=F.buildAvasArguments({options:{method:'cas',cas:c.cas,reference:c.reference,ms:c.ms,diagonalize:true},subspace:['C(2p)'],electrons:c.referenceElectrons,spatialMOs:c.spatialMOs});
  assert.equal(result.errors.length===0,c.ok,JSON.stringify({input:c,actual:result}));
  if(c.ok){accepted++;assert.equal(result.cas.occupied,c.occupied);assert.equal(result.cas.virtual,c.unoccupied);assert.match(result.lines.join('\n'),new RegExp('cas=\\('+c.cas.join(', ')+'\\),'));assert(!Object.hasOwn(result.arguments,'selection_method'));}
 }
 assert.equal(accepted,453);
});
test('CAS rejects invalid data, preserves totals, defers only actual SCF MO capacity',()=>{
 const opts={method:'cas',reference:'RHF',ms:0,diagonalize:false};
 for(const cas of [null,'8,6',[true,6],[8.5,6],[8,Infinity],[8,6,1],[-2,6],[2**53,6]])assert(F.buildAvasArguments({options:{...opts,cas},subspace:[],electrons:14}).errors.length,String(cas));
 const r=F.buildAvasArguments({options:{...opts,cas:[8,100]},subspace:['C(2p)'],electrons:14});
 assert.equal(r.errors.length,0);assert.equal(r.deferredChecks.length,1);assert.deepEqual(plain(r.arguments),{subspace:['C(2p)'],cas:[8,100],diagonalize:false});
 assert(F.buildAvasArguments({options:{...opts,cas:[8,100]},subspace:[],electrons:14,spatialMOs:30}).errors.length);
});
test('legacy methods keep exact argument order and GHF multiplication; CAS does not double',()=>{
 const options={reference:'GHF',method:'separate',docc:3,uocc:2,diagonalize:true};
 assert.deepEqual(plain(F.buildAvasArguments({options,subspace:['C(2p)']}).lines),['    subspace=["C(2p)"],','    selection_method="separate",','    num_active_docc=6,','    num_active_uocc=4,','    diagonalize=True,']);
 options.method='cas';options.cas=[6,10];assert.deepEqual(plain(F.buildAvasArguments({options,subspace:[],electrons:14}).cas),{errors:[],warnings:[],electrons:6,orbitals:10,occupied:6,virtual:4,singlyOccupied:0,units:'spinors',deferredChecks:['SCF virtual-orbital availability must be checked by forte2 after the reference is built.']});
});
function fixture(){
 const context={systemId:'s',fingerprint:'s:1',interactions:{},atoms:[{id:'a',index:0,Z:6,element:'C',ordinal:1,label:'C1',position:[.123456789012345,0,0]},{id:'b',index:1,Z:6,element:'C',ordinal:2,label:'C2',position:[2,0,0]}]};
 const deps={elements:E,appVersion:'0.10.1',readContext:()=>({ok:true,value:context}),resolveSelection:()=>({ok:true,value:{atomIds:['a'],indices:[0],context}}),readMinaoSnapshot:()=>({options:{reference:'RHF',method:'cas',cas:[4,3],diagonalize:true},subspace:['C(2p)'],planes:[],electrons:12})};
 return {context,deps,api:F.createForte2Controller(deps)};
}
test('frozen export materializes ASET labels, exact geometry and AVAS kwargs without mutating inputs',()=>{
 const {api,context}=fixture(),before=JSON.stringify(context),r=api.export({fragment:{kind:'all'},avas:{}});
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(JSON.stringify(context),before);assert(Object.isFrozen(r.value.geometry.atoms[0].position));
 assert.deepEqual(plain(r.value.aset),{fragment:['C1']});assert.match(r.value.python,/C 0.123456789012345 0 0/);assert.match(r.value.python,/cas=\(4, 3\)/);assert.equal(r.mutation.state,'none');
});
test('invalid/stale/busy requests fail atomically, with comparands; host errors survive',()=>{
 const {deps,context}=fixture();let read=0;const api=F.createForte2Controller(deps);
 for(const request of [{},{fragment:{kind:'all'},extra:1},{avas:{planes:[{kind:'all'}]}},{avas:{planes:'x'}},{system:{systemId:'old',fingerprint:'old'},avas:{}}]){
  const r=api.export(request);assert.equal(r.ok,false,JSON.stringify(request));assert.equal(r.mutation.state,'none');assert(r.error.details);
 }
 context.interactions.drag=true;assert.equal(api.export({fragment:{kind:'all'}}).error.code,'INTERACTION_BUSY');delete context.interactions.drag;
 deps.readContext=()=>({ok:true,value:{...context,fingerprint:++read===1?'s:1':'s:2'}});
 assert.equal(api.export({fragment:{kind:'all'}}).error.code,'STALE_CONTEXT');
 deps.readContext=()=>({ok:true,value:context});deps.resolveSelection=()=>({ok:false,error:{code:'ELEMENT_ABSENT',path:'selector',message:'absent',details:{actual:'O',expected:['C']}}});
 assert.equal(api.export({fragment:{kind:'element',element:'O'}}).error.code,'ELEMENT_ABSENT');
 const cycle={};cycle.fragment=cycle;assert.equal(api.export(cycle).error.code,'INVALID_REQUEST');
 const getter={get fragment(){throw new Error('must not run');}};assert.equal(api.export(getter).error.code,'INVALID_REQUEST');
});

test('all old selector programs remain byte-identical except the declared current-forte2 GHF API adaptation',()=>{
 const sources=['assets/vendor/js/atomic-data.js','assets/app/js/edit-utils.js','assets/app/js/forte2-format.js','assets/app/js/calculations-model.js'];
 const current=loadGlobalModules(sources),prior=loadGlobalModules(sources);
 vm.runInContext(cp.execFileSync('git',['show','b1de909288d8ba85da017f18654771eca54547d0:assets/app/js/calculations-model.js'],{encoding:'utf8'}),prior);
 const data=JSON.parse(fs.readFileSync(new URL('../../assets/data/basis/cc-pvtz-minao.json',import.meta.url)));
 for(const context of [prior,current])context.VibeMolCalculationsModel.setBasis(data);
 let cases=0;
 for(const reference of ['RHF','ROHF','GHF'])for(const method of ['cumulative','cutoff','total','separate'])for(const ms of reference==='ROHF'?[-1,0,1]:[0]){
  const make=()=>({vol:{units:'angstrom',atoms:[{id:'a',Z:7,x:0,y:0,z:0},{id:'b',Z:7,x:0,y:0,z:1.1}]}});
  const old=make(),now=make();
  for(const [M,r]of [[prior.VibeMolCalculationsModel,old],[current.VibeMolCalculationsModel,now]]){M.selectShell(r,'a','2p');M.selectShell(r,'b','2p');M.setOptions(r,{reference,method,ms,total:4,docc:2,uocc:2});}
  const before=prior.VibeMolCalculationsModel.generate(old),after=current.VibeMolCalculationsModel.generate(now);assert(before);
  const expected=reference==='GHF'?before.replace('RelCISolver, System','RelCISolver, System, X2CParams').replace('x2c_type="so",','x2c=X2CParams(x2c_type="so"),'):before;
  assert.equal(after,expected,JSON.stringify({reference,method,ms}));cases++;
 }
 assert.equal(cases,20);
});

test('real MINAO snapshot bridge rejects target mismatch and every silent normalization/pruning shortfall',()=>{
 const context=loadGlobalModules(['assets/vendor/js/atomic-data.js','assets/app/js/edit-utils.js','assets/app/js/forte2-format.js','assets/app/js/calculations-model.js']);
 const M=context.VibeMolCalculationsModel;M.setBasis(JSON.parse(fs.readFileSync(new URL('../../assets/data/basis/cc-pvtz-minao.json',import.meta.url))));
 const record={vol:{units:'angstrom',atoms:[{id:'a',Z:6,x:0,y:0,z:0},{id:'b',Z:6,x:1,y:0,z:0},{id:'c',Z:6,x:0,y:1,z:0}]}};
 M.setOptions(record,{method:'cumulative'}); // This fixture verifies the existing non-CAS bridge.
 for(const atom of record.vol.atoms)M.selectShell(record,atom.id,'2p');
 const target={atoms:M.atoms(record).map(a=>({...a,position:a.point}))},original=plain(record.calculations);
 const source=fs.readFileSync(new URL('../../assets/app/js/app.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  function readForte2MinaoSnapshot('),source.indexOf('  const forte2ProductApi='));
 const read=vm.runInNewContext('('+code+')',{measurementRecord:()=>record,calculationsModel:M,
  editApiFault:(code,path,actual,expected)=>{throw Object.assign(new Error(code),{code,path,actual,expected});}});
 const snapshot=read(target,[{atomIds:['a','b','c']}]);assert.deepEqual(plain(snapshot.planes),[['C1-3']]);assert.deepEqual(plain(record.calculations),original);
 for(const [change,expected]of [
  [()=>record.calculations.options.extra='unknown','AVAS_SETTINGS_SHORTFALL'],
  [()=>record.calculations.options.charge='0','AVAS_SETTINGS_SHORTFALL'],
  [()=>record.calculations.selections.push({id:'missing',shells:{'2p':'all'}}),'AVAS_SELECTION_SHORTFALL'],
  [()=>record.calculations.planes.push(['a','b','missing']),'AVAS_SELECTION_SHORTFALL']]){
  record.calculations=plain(original);change();const before=plain(record.calculations);
  assert.throws(()=>read(target),error=>error.code===expected);assert.deepEqual(plain(record.calculations),before);
 }
 record.calculations=plain(original);assert.throws(()=>read({atoms:target.atoms.map(a=>({...a,id:'wrong'+a.id}))}),error=>error.code==='GEOMETRY_TARGET_MISMATCH');
});

test('export target identity is exact and post-validation readback rejects a silently dropped plane',()=>{
 const ctx=loadGlobalModules(['assets/vendor/js/atomic-data.js','assets/app/js/edit-utils.js','assets/app/js/forte2-format.js','assets/app/js/calculations-model.js']);
 const M=ctx.VibeMolCalculationsModel;M.setBasis(JSON.parse(fs.readFileSync(new URL('../../assets/data/basis/cc-pvtz-minao.json',import.meta.url))));
 const record={vol:{units:'angstrom',atoms:[{id:'a',Z:6,x:0,y:0,z:0},{id:'b',Z:6,x:1.5,y:0,z:0},{id:'c',Z:6,x:0,y:1.5,z:0}]}};
 M.setOptions(record,{method:'cumulative'}); // This fixture verifies the existing non-CAS bridge.
 for(const atom of record.vol.atoms)M.selectShell(record,atom.id,'2p');
 const source=fs.readFileSync(new URL('../../assets/app/js/app.js',import.meta.url),'utf8');
 const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 const numeric=vm.runInNewContext('('+slice('  function editApiDifference(','  function createEditApiCandidateValidator(')+')');
 // Calibrate the real shared helper; a JSON-equality mock hid this mismatch.
 assert.equal(numeric(1.5,1.5+1e-10),null);
 const makeRead=model=>vm.runInNewContext('('+slice('  function readForte2MinaoSnapshot(','  const forte2ProductApi=')+')',{measurementRecord:()=>record,calculationsModel:model,
  editApiFault:(code,path,actual,expected)=>{throw Object.assign(new Error(code),{code,path,actual,expected});}});
 const read=makeRead(M),target=()=>({atoms:M.atoms(record).map(a=>({...a,position:a.point.slice()}))}),before=plain(record.calculations);
 assert(read(target()));
 for(const delta of [1e-10,-1e-10,1e-7]){const c=target();c.atoms[1].position[0]+=delta;assert.throws(()=>read(c),error=>error.code==='GEOMETRY_TARGET_MISMATCH');}
 const defective={...M,validation:copy=>{const result=M.validation(copy);copy.calculations.planes=[];return result;}};
 assert.throws(()=>makeRead(defective)(target(),[{atomIds:['a','b','c']}]),error=>error.code==='AVAS_SELECTION_SHORTFALL'&&error.actual.planes.length===0&&error.expected.planes.length===1);
 assert.deepEqual(plain(record.calculations),before);
});
