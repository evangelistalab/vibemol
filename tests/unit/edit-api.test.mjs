import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadGlobalModules} from './load-global-module.mjs';
const text=fs.readFileSync(new URL('../../assets/app/js/app.js',import.meta.url),'utf8');
const block=text.split('// Validated Edit API: begin.')[1]?.split('// Validated Edit API: end.')[0];assert.ok(block);
const factories=vm.runInNewContext(`(()=>{${block};return {reader:createEditApiSystemReader,resolver:createEditApiResolver,selection:createEditSelectionApi,fragments:editApiFragmentMembership,source:classifyEditApiSource,prepare:createEditApiBuildPreparation,build:createEditApiBuildService,validator:createEditApiBuildValidator,commit:createEditApiCommitter,copy:editApiCopy,capture:editApiCapture,difference:editApiDifference,candidate:createEditApiCandidateValidator,envelope:createEditApiEnvelopeValidator,drafts:createEditApiDraftFactory,realize:editApiRealizeIds}})()`,{console,structuredClone,AbortSignal});
const plain=x=>JSON.parse(JSON.stringify(x));
const elements={0:{symbol:'X'},1:{symbol:'H'},6:{symbol:'C'},8:{symbol:'O'}};

function harness(){
 const context=loadGlobalModules(['assets/app/js/edit-utils.js','assets/app/js/forte2-format.js','assets/app/js/calculations-model.js'],{globals:{ATOM_Z_TO_DATA:elements}});
 let record={vol:{kind:'xyz',units:'angstrom',atoms:[{id:'a',Z:6,x:0,y:0,z:0},{id:'b',Z:6,x:1,y:0,z:0},{id:'c',Z:1,x:0,y:1,z:0}],bonds:[],annotations:{builder:{byAtomId:{}}},fragmentOps:[]}},mode='edit',busy={};
 let selected=[],writes=0,syncs=0;
 const read=factories.reader({getRecord:()=>record,capture:v=>plain({atoms:v.atoms,bonds:v.bonds,annotations:v.annotations,fragmentOps:v.fragmentOps,units:v.units}),elements,bohr:.529177210903,mode:()=>mode,fragments:factories.fragments,interlocks:()=>busy});
 const resolver=factories.resolver({elements,fitPlane:context.VibeMolCalculationsModel.fitPlane});
 const api=factories.selection({readSystem:read,resolve:resolver.resolve,readIndices:()=>selected.slice(),writeIndices:v=>{writes++;selected=v.slice();},syncPresentation:()=>{syncs++;},copy:(s,indices)=>({atoms:indices.map(i=>s.snapshot.atoms[i])})});
 return {api,read,resolver,record,mode:v=>{mode=v},busy:v=>{busy=v},recordReplace:()=>{record={vol:plain(record.vol)}},counts:()=>({writes,syncs}),selected:()=>selected};
}
function rejected(h,result,code){assert.equal(result.ok,false);assert.equal(result.error.code,code,JSON.stringify(result));assert.equal(result.mutation.state,'none');assert.deepEqual(h.counts(),{writes:0,syncs:0});}
test('product selection requires original resolver provenance, not raw IDs or copied receipts',()=>{
 const h=harness();rejected(h,h.api.setSelection(['a']),'RESOLUTION_REQUIRED');
 const r=h.api.resolveSelection({kind:'labels',labels:['C2']});assert.equal(r.ok,true);
 assert.ok(Object.isFrozen(r.value)&&Object.isFrozen(r.value.atomIds));
 rejected(h,h.api.setSelection(plain(r.value)),'RESOLUTION_REQUIRED');
 const applied=h.api.setSelection(r.value);assert.equal(applied.ok,true);assert.deepEqual(plain(applied.value.indices),[1]);assert.deepEqual(plain(applied.requested),plain(applied.applied));
});
test('all invalid selection members fail atomically with measured comparands',()=>{
 for(const [selector,code]of [[{kind:'labels',labels:['C3']},'ELEMENT_INDEX_OUT_OF_RANGE'],[{kind:'element',element:'O'},'ELEMENT_ABSENT'],[{kind:'element',element:'Qq'},'ELEMENT_UNKNOWN'],[{kind:'ids',ids:['a','missing']},'ATOM_NOT_FOUND'],[{kind:'ids',ids:['a','a']},'DUPLICATE_REFERENCE'],[{kind:'indices',indices:[0]},'INVALID_REQUEST'],[{kind:'all',ids:['a']},'INVALID_REQUEST']]){
  const h=harness();rejected(h,h.api.resolveSelection(selector),code);
 }
 const h=harness(),r=h.api.resolveSelection({kind:'labels',labels:['C3']});assert.deepEqual(plain(r.error.details.expected),{availableCount:2});
});
test('a resolver receipt becomes stale on reorder, coordinates, topology or system replacement',()=>{
 for(const mutate of [h=>h.record.vol.atoms.reverse(),h=>h.record.vol.atoms[0].x=2,h=>h.record.vol.bonds.push({a:'a',b:'b',order:1}),h=>h.recordReplace()]){
  const h=harness(),r=h.api.resolveSelection({kind:'all'});mutate(h);rejected(h,h.api.setSelection(r.value),'STALE_CONTEXT');
 }
});

test('selection checks mode and live interlocks after resolving',()=>{
 for(const [change,code]of [[h=>h.mode('display'),'MODE_REQUIRED'],[h=>h.busy({drag:true}),'INTERACTION_BUSY']]){const h=harness(),r=h.api.resolveSelection({kind:'all'});change(h);rejected(h,h.api.setSelection(r.value),code);}
});
test('fragment predicates distinguish owned atoms from shared fusion hosts',()=>{
 const h=harness();h.record.vol.annotations.builder.byAtomId.c={groupId:'g',entryId:'phenyl',entryKind:'fragment'};h.record.vol.fragmentOps=[{builderGroupId:'g',attachPolicy:'fuse_ring',addedAtomIds:['c'],hostBondAtomIds:['a','b']}];
 const owned=h.api.resolveSelection({kind:'fragment',instanceId:'g',role:'owned'}),footprint=h.api.resolveSelection({kind:'fragment',instanceId:'g',role:'footprint'});
 assert.deepEqual(plain(owned.value.atomIds),['c']);assert.deepEqual(plain(footprint.value.atomIds),['a','b','c']);
 rejected(h,h.api.resolveSelection({kind:'fragment',instanceId:'g',role:'owned',members:['a']}),'FRAGMENT_MEMBERSHIP');
 delete h.record.vol.fragmentOps[0].hostBondAtomIds;
 rejected(h,h.api.resolveSelection({kind:'fragment',instanceId:'g',role:'footprint'}),'FRAGMENT_MEMBERSHIP_UNAVAILABLE');
});
test('pi-plane validation reports SVD residual and rejects even inside a compound selector',()=>{
 const h=harness();let r=h.api.resolveSelection({kind:'piPlane',seed:{kind:'all'}});assert.equal(r.ok,true);assert.equal(r.value.planes[0].rms,0);
 h.record.vol.atoms.push({id:'d',Z:6,x:0,y:0,z:1});
 r=h.api.resolveSelection({kind:'union',selectors:[{kind:'ids',ids:['a']},{kind:'piPlane',seed:{kind:'all'}}]});
 rejected(h,r,'PLANE_NONCOPLANAR');assert.ok(r.error.details.actual.rms>.1);
 assert.equal(r.error.details.expected.rmsMaximumAng,.1);
});
test('cyclic selectors return a named request error rather than recursing forever',()=>{const h=harness(),s={kind:'component'};s.seed=s;rejected(h,h.api.resolveSelection(s),'INVALID_REQUEST');});

test('request accessors and prototype names cannot execute through validation or diagnostics',()=>{
 const h=harness();let calls=0;const selector={kind:'ids',get ids(){calls++;return ['a']}};
 rejected(h,h.api.resolveSelection(selector),'INVALID_REQUEST');assert.equal(calls,0);
 rejected(h,h.api.resolveSelection({kind:'constructor'}),'INVALID_REQUEST');
});
test('changing only source capabilities invalidates an old resolution',()=>{
 const h=harness(),r=h.api.resolveSelection({kind:'all'});h.record.vol.trajectory={frames:[1,2]};rejected(h,h.api.setSelection(r.value),'STALE_CONTEXT');
});
test('post-write readback failures cannot claim no mutation',()=>{
 const h=harness(),r=h.api.resolveSelection({kind:'all'});let writes=0;
 const api=factories.selection({readSystem:h.read,resolve:h.resolver.resolve,readIndices:()=>[],writeIndices:()=>{writes++},syncPresentation:()=>{},copy:()=>null});
 const receipt=api.resolveSelection({kind:'all'}),bad=api.setSelection(receipt.value);
 assert.equal(writes,1);assert.equal(bad.ok,false);assert.equal(bad.error.code,'APPLIED_MISMATCH');assert.equal(bad.mutation.state,'applied');
});
function buildHarness(source={kind:'xyz'}){
 const h=harness();Object.assign(h.record.vol,source);let prepares=0,commits=0;
 const prepare=factories.prepare({readSystem:h.read,newSnapshot:()=>{throw Error('unused')},validate:()=>{prepares++;return {}},makeDraft:()=>{},place:()=>{},attach:()=>{},fuse:()=>{},insert:()=>{},validateCandidate:()=>{}});
 const build=factories.build({prepare,readSystem:h.read,makeDraft:()=>{},validateCandidate:x=>x,commit:()=>{commits++;},inspectResolution:h.api.inspectResolution});
 return {...h,build,countsBuild:()=>({prepares,commits})};
}
test('scientific sources reject writes with source comparands before planner, counters or UI changes',()=>{
 for(const source of [{trajectory:{}},{vibration:{}},{kind:'cube',data:[1],nxyz:[1,1,1]},{molden:{}},{alphaRe:[1]}]){
  const h=buildHarness(source),c=h.read().context,before=plain(h.record.vol);
  const r=h.build.applyBuild({system:{systemId:c.systemId,fingerprint:c.fingerprint},operation:'placeAtom'});
  rejected(h,r,'SOURCE_NOT_EDITABLE');assert.equal(r.error.details.expected.staticStructureOnly,true);assert.equal(r.error.details.actual.staticStructure,false);
  assert.deepEqual(h.countsBuild(),{prepares:0,commits:0});assert.deepEqual(plain(h.record.vol),before);
 }
});
test('commit verifies actual application, ignoring a false changed flag rather than trusting it',()=>{
 const h=harness(),before=plain(h.record.vol);before.natoms=3;
 const snapshot=h.read(),candidate=plain(snapshot.snapshot);candidate.natoms=3;candidate.atoms[0].x=2;
 let histories=0;
 const commit=factories.commit({readSystem:h.read,checkNew:()=>{},realize:v=>({result:v,ids:{}}),canonicalize:x=>x,createRecord:()=>null,
  apply:(record,value)=>{record.vol=plain(value);return false},capture:v=>plain(v),history:()=>{histories++}});
 const r=commit({snapshot,request:{operation:'translate',originalIds:['a','b','c']},draft:{vol:candidate},result:{label:'test'}});
 assert.equal(r.applied.atoms[0].x,2);assert.equal(r.mutation.state,'applied');assert.equal(histories,1);
});
test('partial commit returns a mismatch and actual state; later calls cannot reinterpret it as success',()=>{
 const h=harness(),snapshot=h.read(),candidate=plain(snapshot.snapshot);candidate.atoms[0].x=2;
 const commit=factories.commit({readSystem:h.read,checkNew:()=>{},realize:v=>({result:v,ids:{}}),canonicalize:x=>x,createRecord:()=>null,
  apply:record=>{record.vol.atoms[1].x=9},capture:v=>plain(v),history:()=>{throw Error('must not record an unverified edit')}});
 assert.throws(()=>commit({snapshot,request:{operation:'translate',originalIds:['a','b','c']},draft:{vol:candidate},result:{}}),e=>e.editApi.code==='APPLIED_MISMATCH'&&e.mutationState==='applied'&&e.actual.atoms[1].x===9);
});
test('draft realization remaps references and annotation keys exactly once, preserving old IDs',()=>{
 let n=0;const vol={atoms:[{id:'old'},{id:'@edit-api-atom:1'}],bonds:[{id:'bond:old:@edit-api-atom:1',a:'old',b:'@edit-api-atom:1'}],fragmentOps:[{opId:'@edit-api-op:1',builderGroupId:'@edit-api-group:1',addedAtomIds:['@edit-api-atom:1'],timestamp:'@commit'}],annotations:{builder:{byAtomId:{'@edit-api-atom:1':{groupId:'@edit-api-group:1'}}}}};
 const r=factories.realize(vol,new Map([['@edit-api-atom:1','atom'],['@edit-api-op:1','op'],['@edit-api-group:1','group']]),{atom:()=>`atom-${++n}`,op:()=>`op-${++n}`,group:()=>`group-${++n}`},(a,b)=>`bond:${a}:${b}`);
 assert.equal(n,3);assert.equal(r.result.atoms[0].id,'old');assert.equal(r.result.bonds[0].b,r.result.atoms[1].id);assert.ok(r.result.annotations.builder.byAtomId[r.result.atoms[1].id]);assert.equal(vol.atoms[1].id,'@edit-api-atom:1');
});

test('identity realization preserves existing draft-looking IDs and opaque metadata',()=>{
 const vol={atoms:[{id:'@edit-api-atom:1'},{id:'@edit-api-atom:2'}],bonds:[],annotations:{builder:{byAtomId:{'@edit-api-atom:1':{groupId:'@edit-api-group:1',entryId:'@edit-api-atom:2'},'@edit-api-atom:2':{groupId:'@edit-api-group:2',entryId:'@edit-api-atom:2'}}}},fragmentOps:[{opId:'@edit-api-op:1',builderGroupId:'@edit-api-group:1',addedAtomIds:['@edit-api-atom:1'],timestamp:'@commit',transform:{note:'@edit-api-atom:2'}},{opId:'@edit-api-op:2',builderGroupId:'@edit-api-group:2',addedAtomIds:['@edit-api-atom:2'],timestamp:'@commit'}]};
 const minted=new Map([['@edit-api-atom:2','atom'],['@edit-api-group:2','group'],['@edit-api-op:2','op']]);let n=0;
 const r=factories.realize(vol,minted,{atom:()=>`atom-${++n}`,group:()=>`group-${++n}`,op:()=>`op-${++n}`},(a,b)=>a+b).result;
 assert.equal(r.atoms[0].id,'@edit-api-atom:1');assert.equal(r.fragmentOps[0].opId,'@edit-api-op:1');assert.equal(r.fragmentOps[0].timestamp,'@commit');assert.equal(r.fragmentOps[0].transform.note,'@edit-api-atom:2');
 assert.equal(r.annotations.builder.byAtomId[r.atoms[1].id].entryId,'@edit-api-atom:2');assert.equal(r.annotations.builder.byAtomId['@edit-api-atom:1'].groupId,'@edit-api-group:1');assert.notEqual(r.fragmentOps[1].timestamp,'@commit');assert.equal(n,3);
});
test('draft allocation reserves annotation-only groups and old ID-like strings',()=>{
 const h=harness(),snapshot=h.read();snapshot.snapshot.annotations.builder.byAtomId.a={groupId:'@edit-api-group:1',entryId:'@edit-api-atom:1'};
 const draft=factories.drafts({bohr:1,builderMeta:()=>{},coordinationMeta:()=>{},hydrogenError:()=>'',upsertBond:()=>{}})(snapshot);
 assert.equal(draft.group('methyl','fragment').groupId,'@edit-api-group:2');const atom=draft.add(6,[0,0,0]);assert.equal(atom.id,'@edit-api-atom:2');assert.equal(draft.minted.get(atom.id),'atom');assert.equal(draft.minted.has('a'),false);
});
test('whole envelope validation rejects malformed late fields, type coercion and duplicate source IDs',()=>{
 const validate=factories.envelope({elements,coordination:()=>({choices:[]})});
 const base={kind:'vibemol.edit-selection',version:1,units:'angstrom',atoms:[{atom:{id:'a',Z:6,x:0,y:0,z:0,formalCharge:0}},{atom:{id:'b',Z:1,x:1,y:0,z:0,formalCharge:0}}],bonds:[{a:0,b:1,order:1,kind:'normal',origin:'explicit',style:'covalent'}]};
 assert.deepEqual(plain(validate(base)),base);
 for(const mutate of [v=>v.atoms[1].builderMeta=0,v=>v.atoms[1].atom.Z='H',v=>v.atoms[1].atom.id='a',v=>v.bonds[0].b=99,v=>v.atoms[1].metalBondingMeta={mode:'guess'}]){
  const input=plain(base);mutate(input);const before=plain(input);assert.throws(()=>validate(input),e=>!!e.editApi);assert.deepEqual(input,before);
 }
});
