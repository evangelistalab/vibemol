(function (global) {
  'use strict';
  const BOHR = 0.529177210903;
  const labels = [['s'], ['py', 'pz', 'px'], ['dxy', 'dyz', 'dz2', 'dxz', 'dx2-y2']];
  const defaults = Object.freeze({ reference: 'RHF', charge: 0, ms: 0, basis: 'cc-pvdz', auxiliary: 'def2-universal-jkfit',
    minao: 'cc-pvtz-minao', method: 'cumulative', sigma: 0.98, cutoff: 0.1, docc: 3, uocc: 3, total: 0, totalFollowsSelection: true, diagonalize: true });
  let basis = null, pending = null;
  const referenceBases = new Map();
  const atomSelections = new WeakMap(); // Editing focus, not scientific/session state.
  const componentsFor = type => (labels['spd'.indexOf(type)] || []).slice();
  function setBasis(data, name = 'cc-pvtz-minao') {
    const catalog = {};
    for (const [z, element] of Object.entries(data.elements)) {
      const next = [1, 2, 3, 4, 5, 6];
      catalog[z] = [];
      // Match forte2's general-contraction expansion and BasisInfo n counters.
      for (const source of element.electron_shells || []) {
        for (let i = 0; i < source.coefficients.length; i++) {
          const l = source.angular_momentum[Math.min(i, source.angular_momentum.length - 1)];
          if (l > 5) continue;
          catalog[z].push({ label: `${next[l]++}${'spdfgh'[l]}`, l,
            exponents: source.exponents.map(Number), coefficients: source.coefficients[i].map(Number) });
        }
      }
    }
    referenceBases.set(name,catalog);
    if(name==='cc-pvtz-minao')basis=catalog;
    return catalog;
  }
  async function loadBasis() {
    if (basis && referenceBases.has('cc-pvtz')) return basis;
    if (!pending) pending = Promise.all(['cc-pvtz-minao','cc-pvtz'].map(name=>{
      if(referenceBases.has(name))return referenceBases.get(name);
      const path=`assets/data/basis/${name}.json`;
      return fetch(global.VibeMolAssets?.url(path) || path).then(response=>{
        if(!response.ok)throw new Error(`${name} basis data could not be loaded.`);
        return response.json();
      }).then(data=>setBasis(data,name));
    })).then(()=>basis).catch(error => { pending = null; throw error; });
    return pending;
  }
  const shellsFor = (z,name='cc-pvtz-minao') => referenceBases.get(name)?.[z] || [];
  const previewBasis = record => state(record).options.minao.trim().toLowerCase()==='cc-pvtz-minao'?'cc-pvtz-minao':'cc-pvtz';
  const recordShells = (record,z) => shellsFor(z,previewBasis(record));
  function selectableShellsFor(z) {
    // H–Kr: complete occupied/core shells, outer s/p and the next s/p set;
    // once 3d is occupied, include 3d and its 4d correlation partner too.
    // Restrict choices, never the raw catalog used by older saved selections.
    const period=periodFor(z),catalog=referenceBases.get('cc-pvtz')?.[z]||shellsFor(z);
    return catalog.filter(shell=>shell.l<2?Number(shell.label[0])<=period+1:
      shell.l===2&&z>=21&&Number(shell.label[0])<=period)
      .slice().sort((a,b)=>(Number(a.label[0])+a.l)-(Number(b.label[0])+b.l)||Number(a.label[0])-Number(b.label[0]));
  }
  function ensureShellBasis(record,ids,shell) {
    const options=state(record).options;
    if(options.minao.trim().toLowerCase()==='cc-pvtz-minao'&&atoms(record).some(a=>ids.includes(a.id)&&!shellsFor(a.Z).some(s=>s.label===shell)))options.minao='cc-pvtz';
  }
  function normalize(value = {}) {
    const options = { ...defaults };
    for (const key of Object.keys(defaults)) if (typeof value.options?.[key] === typeof defaults[key]) options[key] = value.options[key];
    // Older sessions did not record whether a count was edited. Preserve their
    // explicit value rather than silently replacing a possible user choice.
    if (typeof value.options?.total === 'number' && typeof value.options?.totalFollowsSelection !== 'boolean') options.totalFollowsSelection = false;
    const selections = [];
    for (const row of Array.isArray(value.selections) ? value.selections.slice(0, 2000) : []) {
      if (typeof row?.id !== 'string' || row.id.length > 128 || selections.some(r => r.id === row.id)) continue;
      const shells = {};
      for (const [shell, choice] of Object.entries(row.shells || {}).slice(0, 40)) {
        if (!/^[1-9][spdfgh]$/.test(shell)) continue;
        if (choice === 'all') shells[shell] = 'all';
        else if (Array.isArray(choice)) {
          const allowed = componentsFor(shell[1]), selected = allowed.filter(c => choice.includes(c));
          if (selected.length) shells[shell] = selected.length === allowed.length ? 'all' : selected;
        }
      }
      selections.push({ id: row.id, shells });
    }
    const planes = (Array.isArray(value.planes) ? value.planes : []).slice(0, 40)
      .filter(p => Array.isArray(p) && p.length >= 3).map(p => [...new Set(p.slice(0,2000).filter(id => typeof id === 'string' && id.length <= 128))]).filter(p=>p.length>=3);
    return { selections, planes, options };
  }
  function state(record) {
    if (!record) return normalize();
    if (!record.calculations) record.calculations = normalize();
    return record.calculations;
  }
  function setOptions(record, patch) {
    const options = state(record).options;
    for (const key of Object.keys(defaults)) if (typeof patch[key] === typeof defaults[key]) options[key] = patch[key];
    if (Object.prototype.hasOwnProperty.call(patch, 'total') && patch.totalFollowsSelection !== true) options.totalFollowsSelection = false;
  }
  function optionsFor(record, projected) {
    const options = { ...state(record).options };
    // Derive this at use time: selection, plane, geometry and session changes
    // all use the same count without overwriting a saved manual value.
    if (options.totalFollowsSelection && basis) options.total = (projected || projection(record)).functions.length;
    return options;
  }
  function atoms(record) {
    const counts = {}, scale = record?.vol?.units === 'angstrom' ? 1 : BOHR;
    return (record?.vol?.atoms || []).map((a, index) => {
      const element = global.ATOM_Z_TO_DATA?.[a.Z]?.symbol || a.symbol || String(a.Z);
      const ordinal = counts[a.Z] = (counts[a.Z] || 0) + 1;
      return { id: String(a.id), index, Z: a.Z, element, ordinal, label: element + ordinal, point: [a.x * scale, a.y * scale, a.z * scale] };
    });
  }
  function defaultShell(z) {
    const shells = shellsFor(z), period = z<=2?1:z<=10?2:z<=18?3:4;
    const sBlock = [1,2,3,4,11,12,19,20].includes(z);
    return shells.find(s => s.label === (z>=21 && z<=30 ? '3d' : `${period}${sBlock?'s':'p'}`))?.label
      || shells.find(s => s.label === `${period}s`)?.label || shells[shells.length-1]?.label;
  }
  const periodFor = z => Number.isInteger(z)&&z>0&&z<=118 ? [2,10,18,36,54,86,118].findIndex(end=>z<=end)+1 : 0;
  function selectedIds(record) {
    if(!record)return [];
    const valid=new Set(atoms(record).map(a=>a.id));
    const ids=(atomSelections.get(record)||[]).filter(id=>valid.has(id));
    atomSelections.set(record,ids);return ids.slice();
  }
  function setSelectedAtoms(record,ids) {
    if(!record)return;
    const valid=new Set(atoms(record).map(a=>a.id));
    atomSelections.set(record,[...new Set(ids)].filter(id=>valid.has(id)).slice(0,2000));
  }
  function selectionContext(record,ids=selectedIds(record)) {
    const all=atoms(record),selected=[...new Set(ids)].map(id=>all.find(a=>a.id===id)).filter(Boolean);
    const period=periodFor(selected[0]?.Z);
    if(!selected.length)return {atoms:selected,shells:[],error:'Select an atom to choose its orbitals.'};
    if(selected.some(a=>periodFor(a.Z)!==period))return {atoms:selected,shells:[],error:'Select atoms from one periodic-table row to edit their orbitals together.'};
    const shells=selectableShellsFor(selected[0].Z).filter(shell=>selected.every(a=>selectableShellsFor(a.Z).some(s=>s.label===shell.label)));
    return {atoms:selected,period,shells,error:shells.length?'':'No shared shells are available in the bundled MINAO basis for these atoms.'};
  }
  function toggleAtom(record, id, extend = false) {
    if(!atoms(record).some(a=>a.id===id))return false;
    const ids=selectedIds(record),existing=ids.includes(id);
    setSelectedAtoms(record,existing&&!extend?ids.filter(i=>i!==id):existing?ids:[...ids,id]);
    return true;
  }
  function choiceFor(record,id,shell) {return state(record).selections.find(r=>r.id===id)?.shells[shell];}
  function writeChoice(record,id,shell,choice) {
    const s=state(record);let row=s.selections.find(r=>r.id===id);
    if(!row){row={id,shells:{}};s.selections.push(row);}
    if(choice)row.shells[shell]=choice;else delete row.shells[shell];
  }
  function selectShells(record,ids,shell) {
    const context=selectionContext(record,ids);
    if(context.error||context.atoms.length!==new Set(ids).size||!context.shells.some(s=>s.label===shell))return false;
    ensureShellBasis(record,ids,shell);
    const remove=context.atoms.every(a=>choiceFor(record,a.id,shell)==='all');
    for(const a of context.atoms)writeChoice(record,a.id,shell,remove?null:'all');
    prune(record);return true;
  }
  function selectComponents(record,ids,shell,component) {
    const context=selectionContext(record,ids),available=componentsFor(shell[1]);
    if(context.error||context.atoms.length!==new Set(ids).size||!context.shells.some(s=>s.label===shell)||!available.includes(component))return false;
    ensureShellBasis(record,ids,shell);
    // A component click replaces a whole shell with a partial selection.
    // For mixed groups, add it everywhere; remove only if all partial choices include it.
    const remove=context.atoms.every(a=>{const c=choiceFor(record,a.id,shell);return Array.isArray(c)&&c.includes(component);});
    for(const a of context.atoms){
      const old=choiceFor(record,a.id,shell),selected=new Set(Array.isArray(old)?old:[]);
      if(remove)selected.delete(component);else selected.add(component);
      const ordered=available.filter(c=>selected.has(c));
      writeChoice(record,a.id,shell,ordered.length===available.length?'all':ordered.length?ordered:null);
    }
    prune(record);return true;
  }
  const selectShell=(record,id,shell)=>selectShells(record,[id],shell);
  const selectComponent=(record,id,shell,component)=>selectComponents(record,[id],shell,component);
  function removeOrbitals(record,ids) {
    state(record).selections=state(record).selections.filter(row=>!ids.includes(row.id));prune(record);
  }
  function planeEligible(row) {
    const choices = Object.entries(row.shells).filter(([s]) => s[1] === 'p');
    return choices.some(([,v]) => v === 'all') && !choices.some(([,v]) => Array.isArray(v));
  }
  const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  function fitPlane(record, ids) {
    const all = atoms(record), selected = ids.map(id => all.find(a => a.id === id)).filter(Boolean);
    if (selected.length < 3) return { error: 'Select at least three atoms with whole p shells.' };
    const mean = list => [0,1,2].map(k => list.reduce((s,a) => s+a.point[k],0)/list.length);
    const center = mean(selected), covariance = [[0,0,0],[0,0,0],[0,0,0]];
    for (const a of selected) {
      const d = sub(a.point,center);
      for(let i=0;i<3;i++) for(let j=0;j<3;j++) covariance[i][j] += d[i]*d[j];
    }
    // Eigenvectors of XᵀX are the right singular vectors used by forte2.
    const {values,vectors} = global.VibeMolEditUtils.eigenSymmetric3x3(covariance);
    if (values[1] < 1e-8) return { error: 'The plane needs three non-collinear atoms.' };
    let normal = vectors[0];
    if (dot(normal,sub(center,mean(all))) < 0) normal = normal.map(v => -v);
    const rms = Math.sqrt(Math.max(0,values[0])/selected.length);
    if (rms > 0.1) return { error: `Atoms are not near-coplanar (RMS ${rms.toFixed(3)} Å; maximum 0.100 Å).` };
    return { center, normal, rms, radius: Math.max(...selected.map(a => Math.hypot(...sub(a.point,center)))) + 0.5 };
  }
  function prune(record) {
    const s = state(record), all = atoms(record), ids = new Set(all.map(a=>a.id));
    s.selections = s.selections.filter(r=>ids.has(r.id)&&Object.keys(r.shells).length);
    const eligible = new Set(s.selections.filter(planeEligible).map(r=>r.id));
    s.planes = s.planes.map(p=>p.filter(id=>eligible.has(id))).filter(p=>p.length>=3 && !fitPlane(record,p).error);
  }
  function addPlane(record, ids) {
    prune(record);
    const eligible = state(record).selections.filter(planeEligible).map(r=>r.id);
    const members = [...new Set(ids || eligible)];
    if(members.some(id=>!eligible.includes(id)))return {error:'Choose whole p shells on every plane atom; individual p components cannot define a plane.'};
    const fit = fitPlane(record,members);
    if (fit.error) return fit;
    const s = state(record);
    if (!s.planes.some(p=>p.length===members.length && p.every(id=>members.includes(id)))) s.planes.push(members);
    return fit;
  }
  function ranges(numbers) {
    const sorted = [...new Set(numbers)].sort((a,b)=>a-b), result=[];
    for(let i=0;i<sorted.length;i++) { const first=sorted[i];let last=first;while(sorted[i+1]===last+1)last=sorted[++i]; result.push(first===last?String(first):`${first}-${last}`); }
    return result;
  }
  function specs(record) {
    const all=atoms(record), s=state(record), groups=new Map();
    for(const a of all) {
      const row=s.selections.find(r=>r.id===a.id); if(!row)continue;
      for(const shell of recordShells(record,a.Z)) {
        const choice=row.shells[shell.label];if(!choice)continue;
        for(const token of choice==='all'?[shell.label]:choice.map(c=>shell.label[0]+c)) {
          const key=a.element+'|'+token;
          if(!groups.has(key))groups.set(key,{element:a.element,token,numbers:[]});
          groups.get(key).numbers.push(a.ordinal);
        }
      }
    }
    return [...groups.values()].flatMap(g=>{
      const total=all.filter(a=>a.element===g.element).length;
      return (g.numbers.length===total?['']:ranges(g.numbers)).map(range=>`${g.element}${range}(${g.token})`);
    });
  }
  function planeSpecs(record) {
    const all=atoms(record);
    return state(record).planes.map(ids=>{
      const groups=new Map();
      for(const a of all.filter(a=>ids.includes(a.id))){if(!groups.has(a.element))groups.set(a.element,[]);groups.get(a.element).push(a.ordinal);}
      return [...groups].flatMap(([element,numbers])=>ranges(numbers).map(r=>element+r));
    });
  }
  function projection(record) {
    prune(record);
    const s=state(record), all=atoms(record), normals=new Map();
    const planes=s.planes.map(ids=>({ids,...fitPlane(record,ids)}));
    for(const plane of planes)for(const id of plane.ids){const n=normals.get(id)||[0,0,0];normals.set(id,n.map((v,i)=>v+plane.normal[i]));}
    let error='';
    for(const [id,n]of normals){const norm=Math.hypot(...n);if(norm<1e-8)error='Overlapping plane normals cancel; remove one plane.';else normals.set(id,n.map(v=>v/norm));}
    const functions=[];let minao=0;
    for(const atom of all){const row=s.selections.find(r=>r.id===atom.id);if(!row)continue;
      for(const shell of recordShells(record,atom.Z)){const choice=row.shells[shell.label];if(!choice)continue;
        minao+=choice==='all'?2*shell.l+1:choice.length;
        if(shell.l===1 && choice==='all' && normals.has(atom.id))functions.push({atom,shell,component:2,normal:normals.get(atom.id)});
        else for(const component of choice==='all'?Array.from({length:2*shell.l+1},(_,i)=>i):choice.map(c=>componentsFor(shell.label[1]).indexOf(c)))functions.push({atom,shell,component});
      }
    }
    return {minao,orbitals:functions.length*(s.options.reference==='GHF'?2:1),functions,planes,error,atomCount:new Set(functions.map(f=>f.atom.id)).size};
  }
  function validation(record) {
    const projected=projection(record),o=optionsFor(record,projected), all=atoms(record), errors=[],warnings=[];
    if(!all.length)errors.push('Load a structure to prepare an input.');
    if(!specs(record).length)errors.push('Select at least one MINAO function.');
    if(!['RHF','ROHF','GHF'].includes(o.reference))errors.push('Choose RHF, ROHF or GHF.');
    if(!Number.isInteger(o.charge))errors.push('Charge must be an integer.');
    const electrons=all.reduce((sum,a)=>sum+a.Z,0)-o.charge;
    if(electrons<1)errors.push('The electron count must be positive; adjust the charge.');
    else if(o.reference==='RHF' && electrons%2)errors.push('RHF requires an even electron count; adjust charge or use ROHF/GHF.');
    const rohf=o.reference==='ROHF',twiceMs=2*o.ms;
    if(rohf){
      if(!Number.isFinite(o.ms) || !Number.isInteger(twiceMs))errors.push('ROHF ms must be an integer or half-integer (steps of 0.5).');
      else if(Number.isInteger(electrons)&&electrons>0){
        if(Math.abs(twiceMs)>electrons)errors.push('ROHF |ms| cannot exceed half the electron count.');
        else if((electrons-twiceMs)%2!==0)errors.push(`ROHF with ${electrons} electrons requires ${electrons%2?'half-integer':'integer'} ms.`);
      }
    }
    for(const key of ['basis','auxiliary','minao'])if(!o[key].trim() || o[key].length>200)errors.push('Enter a valid basis-set name.');
    const reference=previewBasis(record),known=referenceBases.has(o.minao.trim().toLowerCase());
    if(!known)warnings.push(`Shells, counts and previews use ${reference}. Verify these shells in your chosen MINAO basis before running.`);
    if(all.some(a=>!recordShells(record,a.Z).length))errors.push(`The bundled ${reference} basis is unavailable for one or more elements in this structure.`);
    for(const row of state(record).selections){
      const atom=all.find(a=>a.id===row.id);if(!atom)continue;
      const available=new Set(recordShells(record,atom.Z).map(s=>s.label));
      for(const shell of Object.keys(row.shells))if(!available.has(shell))errors.push(`${atom.label}(${shell}) is unavailable in ${reference}; choose a reference basis containing that shell (cc-pvtz supports the expanded choices).`);
    }
    if(o.method==='cumulative' && !(Number.isFinite(o.sigma) && o.sigma>=0 && o.sigma<=1))errors.push('Sigma must be between 0 and 1.');
    else if(o.method==='cutoff' && !(Number.isFinite(o.cutoff) && o.cutoff>0 && o.cutoff<0.999999))errors.push('Cutoff must be greater than 0 and less than 0.999999.');
    else if(o.method==='total' && !(Number.isInteger(o.total) && o.total>0))errors.push('Total active count must be a positive integer.');
    else if(o.method==='separate'){
      if(!(Number.isInteger(o.docc)&&o.docc>=0&&Number.isInteger(o.uocc)&&o.uocc>=0))errors.push('Occupied and virtual counts must be nonnegative integers.');
      else if(o.docc+o.uocc+(rohf?Math.abs(twiceMs):0)<=0)errors.push('Select at least one active orbital, including any ROHF singly occupied orbitals.');
      // forte2 AVAS._check_parameters currently uses signed 2*ms here.
      else if(rohf&&twiceMs<0&&o.docc+o.uocc+twiceMs<=0)errors.push('For negative ms, forte2 AVAS requires occupied + virtual + 2 ms > 0. Use Total selection or positive ms.');
    }
    else if(!['cumulative','cutoff','total','separate'].includes(o.method))errors.push('Choose an AVAS selection method.');
    if(projected.error)errors.push(projected.error);
    return {errors,warnings};
  }
  function generate(record) {
    const {errors}=validation(record);if(errors.length)return '';
    const o=optionsFor(record), ghf=o.reference==='GHF', rohf=o.reference==='ROHF', mf=ghf?'mf':o.reference.toLowerCase(), multiplier=ghf?2:1;
    const xyz=atoms(record).map(a=>`${a.element} ${a.point.map(v=>v.toFixed(10)).join(' ')}`).join('\n');
    const quote=JSON.stringify;
    const parameters=[`    subspace=${quote(specs(record))},`];
    if(state(record).planes.length)parameters.push(`    subspace_pi_planes=${quote(planeSpecs(record))},`);
    parameters.push(`    selection_method=${quote(o.method)},`);
    if(o.method==='cumulative')parameters.push(`    sigma=${o.sigma},`);
    if(o.method==='cutoff')parameters.push(`    cutoff=${o.cutoff},`);
    if(o.method==='total')parameters.push(`    num_active=${o.total*multiplier},`);
    if(o.method==='separate')parameters.push(`    num_active_docc=${o.docc*multiplier},`,`    num_active_uocc=${o.uocc*multiplier},`);
    parameters.push(`    diagonalize=${o.diagonalize?'True':'False'},`);
    const imports=ghf?'AVAS, CI, GHF, RelCISolver, System':`AVAS, CISolver, MCOptimizer, ${o.reference}, State, System`;
    const downstream=ghf?'ci = CI(RelCISolver(nel=mf.nel))(avas)\nci.run()':
      `ci_solver = CISolver(State(nel=${mf}.nel, multiplicity=${rohf?2*Math.abs(o.ms)+1:1}, ms=${rohf?o.ms:'0.0'}))\nmc = MCOptimizer(ci_solver)(avas)\nmc.run()`;
    return `from forte2 import ${imports}\n\nxyz = """\n${xyz}\n"""\n\nsystem = System(\n    xyz=xyz,\n    basis_set=${quote(o.basis)},\n    auxiliary_basis_set=${quote(o.auxiliary)},\n    minao_basis_set=${quote(o.minao)},${ghf?'\n    x2c_type="so",':''}\n)\n\n${mf} = ${o.reference}(charge=${o.charge}${rohf?`, ms=${o.ms}`:''})(system)\n\navas = AVAS(\n${parameters.join('\n')}\n)(${mf})\n\n${downstream}\n`;
  }
  global.VibeMolCalculationsModel=Object.freeze({defaults,loadBasis,setBasis,shellsFor,previewBasis,componentsFor,state,normalize,setOptions,optionsFor,atoms,defaultShell,periodFor,selectedIds,setSelectedAtoms,selectionContext,toggleAtom,choiceFor,selectShell,selectComponent,selectShells,selectComponents,removeOrbitals,planeEligible,fitPlane,addPlane,prune,specs,planeSpecs,projection,validation,generate});
})(window);
