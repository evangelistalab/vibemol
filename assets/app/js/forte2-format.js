(function (global) {
  'use strict';
  // forte2 PR283, e03c169bdf1b2aac62ea4197cd0ffa1b875d3b9f. No SCF runs here.
  function casPartition(options, electrons, spatialMOs) {
    const errors=[],warnings=[],cas=options.cas,reference=options.reference;
    const fail=message=>errors.push(message);
    if(!Array.isArray(cas)||cas.length!==2||cas.some(n=>!Number.isSafeInteger(n)||n<0))
      return {errors:['CAS must contain two nonnegative safe integers: electrons and orbitals (spinors for GHF).'],warnings};
    const [nel,norb]=cas,socc=reference==='ROHF'?Math.abs(2*options.ms):0;
    if(!['RHF','ROHF','GHF'].includes(reference)||!Number.isSafeInteger(electrons)||electrons<1||!Number.isSafeInteger(socc))
      return {errors:['Choose a valid reference, electron count and ROHF spin projection before specifying CAS.'],warnings};
    const ghf=reference==='GHF',paired=nel-socc,remaining=norb-socc;
    if(ghf?nel>norb:paired<0||remaining<0||paired%2!==0||paired>2*remaining)
      fail(ghf?'CAS electrons cannot exceed the number of active spinors.':`CAS must include all ${socc} singly occupied orbitals and an even, capacity-compatible number of remaining electrons.`);
    const occupied=ghf?nel:paired/2,virtual=ghf?norb-nel:remaining-occupied;
    const availableOccupied=ghf?electrons:(electrons-socc)/2;
    if(!Number.isSafeInteger(availableOccupied)||availableOccupied<0)fail('Reference electron count and spin projection are incompatible.');
    if(occupied>availableOccupied)fail(`CAS requests ${occupied} occupied ${ghf?'spinors':'orbitals'}; the reference has ${availableOccupied}.`);
    if(spatialMOs!==undefined&&spatialMOs!==null){
      if(!Number.isSafeInteger(spatialMOs)||spatialMOs<1)fail('The SCF spatial MO count must be a positive safe integer.');
      else if(virtual>(ghf?2*spatialMOs:spatialMOs)-availableOccupied-socc)fail('CAS requests more virtual orbitals than the SCF reference provides.');
    }
    if(occupied+virtual+socc<=0)fail('Select at least one active orbital, including any ROHF singly occupied orbitals.');
    if(!socc&&(!occupied||!virtual))warnings.push('CAS contains no active occupied or no active virtual orbitals; forte2 will warn about this choice.');
    return {errors,warnings,electrons:nel,orbitals:norb,occupied,virtual,singlyOccupied:socc,units:ghf?'spinors':'spatial orbitals',
      deferredChecks:spatialMOs==null?['SCF virtual-orbital availability must be checked by forte2 after the reference is built.']:[]};
  }
  function buildAvasArguments({options,subspace,planes=[],electrons,spatialMOs=null}) {
    const args={subspace:subspace.slice()},lines=[`    subspace=${JSON.stringify(subspace)},`];
    if(planes.length){args.subspace_pi_planes=planes.map(p=>p.slice());lines.push(`    subspace_pi_planes=${JSON.stringify(planes)},`);}
    let cas=null;
    const add=(key,value,python=JSON.stringify(value))=>{args[key]=value;lines.push(`    ${key}=${python},`);};
    if(options.method==='cas'){
      cas=casPartition(options,electrons,spatialMOs);
      if(cas.errors.length)return {arguments:null,lines:[],...cas,cas};
      add('cas',options.cas.slice(),`(${options.cas[0]}, ${options.cas[1]})`);
    }else{
      add('selection_method',options.method);
      const multiplier=options.reference==='GHF'?2:1;
      if(options.method==='cumulative')add('sigma',options.sigma);
      if(options.method==='cutoff')add('cutoff',options.cutoff);
      if(options.method==='total')add('num_active',options.total*multiplier);
      if(options.method==='separate'){add('num_active_docc',options.docc*multiplier);add('num_active_uocc',options.uocc*multiplier);}
    }
    add('diagonalize',options.diagonalize,options.diagonalize?'True':'False');
    return {arguments:args,lines,cas,errors:[],warnings:cas?.warnings||[],deferredChecks:cas?.deferredChecks||[]};
  }
  function forte2Copy(value) {
    if(typeof value==='number'&&!Number.isFinite(value))return String(value);
    if(value===undefined)return null;
    if(!value||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(forte2Copy);
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,forte2Copy(v)]));
  }
  function forte2Freeze(value) {
    if(value&&typeof value==='object'){for(const item of Object.values(value))forte2Freeze(item);Object.freeze(value);}return value;
  }
  function forte2Fault(code,path,actual,expected,message=code) {
    const error=new Error(message);error.forte2={code,path,message,details:{actual:forte2Copy(actual),expected:forte2Copy(expected)}};throw error;
  }
  function forte2Shape(value,allowed,required,path) {
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>d.get||d.set)
      ||Object.keys(value).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(value,k)))
      forte2Fault('INVALID_REQUEST',path,value,{allowed,required});
  }
  function forte2Data(value,ancestors=new Set()) {
    if(value===null||['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value))return;
    if(!value||typeof value!=='object'||ancestors.has(value)||!Array.isArray(value)&&Object.getPrototypeOf(value)!==null&&Object.getPrototypeOf(Object.getPrototypeOf(value))!==null
      ||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>d.get||d.set))forte2Fault('INVALID_REQUEST','request','non-JSON data','finite, acyclic plain data');
    ancestors=new Set(ancestors);ancestors.add(value);for(const item of Object.values(value))forte2Data(item,ancestors);
  }
  function prepareRequest(request) {
    forte2Data(request);forte2Shape(request,['system','fragment','avas'],[],'request');
    if(!Object.hasOwn(request,'fragment')&&!Object.hasOwn(request,'avas'))forte2Fault('INVALID_REQUEST','request',request,'fragment and/or avas');
    if(request.system!==undefined)forte2Shape(request.system,['systemId','fingerprint'],['systemId','fingerprint'],'system');
    if(request.avas!==undefined){forte2Shape(request.avas,['planes'],[],'avas');if(request.avas.planes!==undefined&&(!Array.isArray(request.avas.planes)||request.avas.planes.length>40))forte2Fault('INVALID_REQUEST','avas.planes',request.avas.planes,'at most 40 piPlane predicates');}
    return request;
  }
  function forte2Value(result,path) {
    if(!result?.ok){if(result?.error){const error=new Error(result.error.message);error.forte2={...result.error,path:path+'.'+result.error.path};throw error;}forte2Fault('HOST_FAILED',path,result,'successful host result');}return result.value;
  }
  function assertContext(current,expected,path='system') {
    if(current.systemId!==expected.systemId||current.fingerprint!==expected.fingerprint)
      forte2Fault('STALE_CONTEXT',path,expected,{systemId:current.systemId,fingerprint:current.fingerprint});
    if(Object.values(current.interactions||{}).some(Boolean))forte2Fault('INTERACTION_BUSY','interactions',current.interactions,'idle');
  }
  function resolveSelections(plan,context,resolve) {
    const fragment=plan.fragment===undefined?null:forte2Value(resolve(plan.fragment),'fragment');
    const planes=plan.avas?.planes?.map((predicate,index)=>{
      if(predicate?.kind!=='piPlane')forte2Fault('INVALID_REQUEST',`avas.planes[${index}]`,predicate,'explicit piPlane predicate');
      return forte2Value(resolve(predicate),`avas.planes[${index}]`);
    });
    for(const resolution of [fragment,...(planes||[])].filter(Boolean))assertContext(context,resolution.context,'selection');
    return {fragment,planes};
  }
  function atomRanges(atoms) {
    const groups=new Map();for(const atom of atoms){if(!groups.has(atom.element))groups.set(atom.element,[]);groups.get(atom.element).push(atom.ordinal);}
    return [...groups].flatMap(([symbol,values])=>{
      const sorted=[...new Set(values)].sort((a,b)=>a-b),result=[];
      for(let i=0;i<sorted.length;i++){const first=sorted[i];let last=first;while(sorted[i+1]===last+1)last=sorted[++i];result.push(symbol+first+(last===first?'':'-'+last));}return result;
    });
  }
  function createGeometryEncoder(elements) {
    return context=>{
      const ids=new Set();
      const atoms=context.atoms.map(atom=>{
        if(typeof atom.id!=='string'||ids.has(atom.id)||!Number.isSafeInteger(atom.Z)||elements[atom.Z]?.symbol!==atom.element
          ||!Array.isArray(atom.position)||atom.position.length!==3||atom.position.some(n=>!Number.isFinite(n)))
          forte2Fault('GEOMETRY_INVALID','atoms',atom,'distinct IDs, canonical elements and finite Angstrom positions');
        ids.add(atom.id);return {id:atom.id,Z:atom.Z,element:atom.element,label:atom.label,ordinal:atom.ordinal,position:atom.position.slice()};
      });
      if(!atoms.length)forte2Fault('EMPTY_SYSTEM','atoms',atoms,'nonempty geometry');
      return {units:'angstrom',atoms,xyz:atoms.map(a=>`${a.element} ${a.position.join(' ')}`).join('\n')};
    };
  }
  function assembleExport(data,encodeGeometry) {
    const geometry=encodeGeometry(data.context),fragment=data.resolved.fragment;
    const selected=fragment?geometry.atoms.filter(a=>fragment.atomIds.includes(a.id)):null;
    const aset=selected?{fragment:atomRanges(selected)}:null;
    const avas=data.minao?buildAvasArguments(data.minao):null;
    if(avas?.errors.length)forte2Fault('AVAS_INVALID','avas',avas.errors,'valid AVAS settings and reference');
    const lines=['# Frozen VibeMol geometry; no calculation is executed.','xyz = """',geometry.xyz,'"""'];
    if(aset)lines.push('',`aset_kwargs = {"fragment": ${JSON.stringify(aset.fragment)}}`);
    if(avas)lines.push('','avas_kwargs = dict(',...avas.lines,')');
    return {kind:'vibemol.forte2',version:1,appVersion:data.appVersion,forte2Commit:'e03c169bdf1b2aac62ea4197cd0ffa1b875d3b9f',
      system:{systemId:data.context.systemId,fingerprint:data.context.fingerprint},geometry,aset,
      avas:avas?{arguments:avas.arguments,cas:avas.cas,warnings:avas.warnings,deferredChecks:avas.deferredChecks}:null,
      ...(data.minao?{reference:data.minao.options}:{}),python:lines.join('\n')+'\n'};
  }
  function forte2Result(action) {
    try{return forte2Freeze({ok:true,value:action(),mutation:{state:'none'}});}
    catch(error){return forte2Freeze({ok:false,error:error.forte2||error.editApi||{code:'EXPORT_FAILED',path:'',message:String(error.message||error),details:{}},mutation:{state:'none'}});}
  }
  function createForte2Controller(deps) {
    const encodeGeometry=createGeometryEncoder(deps.elements);
    return Object.freeze({export:request=>forte2Result(()=>{
      const plan=prepareRequest(request),context=forte2Value(deps.readContext(),'context');
      assertContext(context,plan.system||context);
      const resolved=resolveSelections(plan,context,deps.resolveSelection);
      const minao=plan.avas===undefined?null:deps.readMinaoSnapshot(context,resolved.planes);
      const value=assembleExport({context,resolved,minao,appVersion:deps.appVersion},encodeGeometry);
      assertContext(forte2Value(deps.readContext(),'context'),context);
      return value;
    })});
  }
  global.VibeMolForte2Format=Object.freeze({buildAvasArguments,createForte2Controller});
})(window);
