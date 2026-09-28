(function (global) {
  'use strict';
  function create(deps) {
    const model=global.VibeMolCalculationsModel, panel=document.createElement('section');
    panel.id='subspacePanel';panel.className='vm-popover vm-list-popover vm-calculations';panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','AVAS subspace');panel.setAttribute('aria-hidden','true');
    panel.innerHTML=`<header class="vm-list-popover__header motionPanelHeader" data-vm-drag-handle tabindex="0"><span class="vm-list-popover__title title">Subspace</span><div class="vm-list-popover__actions"><button type="button" class="vm-btn vm-btn--ghost" data-close aria-label="Close Subspace">×</button></div></header>
      <div class="vm-list-popover__body">
        <p class="vm-session-status" data-active></p>
        <p class="vm-session-status">Click atoms to select or deselect them, then choose shells or orbitals in the popup. Atom selection alone does not change AVAS.</p>
        <p class="vm-session-status" data-loading role="status"></p>
        <p class="vm-session-status" data-selection-summary></p><button class="vm-btn vm-btn--ghost" type="button" data-choose>Choose orbitals</button><div data-atoms></div>
        <p class="vm-calculations-count" data-count aria-live="polite"></p><p class="vm-session-status" data-preview-basis></p>
        <div class="vm-field-row"><label class="vm-field-label" for="avas-lobe-size">Lobe size</label><div class="vm-field-control vm-avas-lobe-control"><input id="avas-lobe-size" type="range" class="vm-slider__range" min="35" max="85" step="1" aria-describedby="avas-contour-note"><output for="avas-lobe-size" data-contour></output></div></div>
        <details class="vm-appearance-section" data-planes><summary class="inspectorSubsectionSummary"><span class="vm-section-label">π planes</span></summary><div data-plane-atoms></div><p class="vm-session-status" data-plane-reason></p><button class="vm-btn vm-btn--ghost" type="button" data-fit>Fit selected atoms</button><div data-plane-list></div></details>
        <details class="vm-appearance-section" open><summary class="inspectorSubsectionSummary"><span class="vm-section-label">AVAS settings</span></summary><div data-fields></div><p class="vm-session-status" data-reference-note></p></details>
        <details class="vm-appearance-section"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Basis sets</span></summary><div data-basis></div></details>
        <details class="vm-appearance-section" open><summary class="inspectorSubsectionSummary"><span class="vm-section-label">forte2 input</span></summary><p class="vm-session-status" data-validation role="status"></p><button class="vm-btn vm-btn--ghost" type="button" data-copy>Copy input</button><textarea class="vm-mono" readonly aria-label="Generated forte2 input" spellcheck="false"></textarea></details>
        <p class="vm-session-status" id="avas-contour-note"></p>
      </div>`;
    document.body.append(panel);
    global.VibeMolFloatingPanels.register(panel,{label:'Subspace',handle:'[data-vm-drag-handle]'});
    const $=selector=>panel.querySelector(selector), planeChecked=new Map(), fields=new Map();
    let lobeTimer=0;
    function syncContour() {
      const percent=Math.round(deps.getContour()*100),input=$('#avas-lobe-size');
      input.value=100-percent;input.style.setProperty('--vm-slider-fill-percent',((65-percent)/50*100)+'%');input.setAttribute('aria-valuetext',`${percent}% peak-amplitude contour; higher size shows more of the tail`);
      $('[data-contour]').textContent=`${percent}% contour`;
      const basis=model.previewBasis(deps.getRecord());
      $('[data-preview-basis]').textContent=`Projector preview basis: ${basis}${basis==='cc-pvtz'?' · includes next-shell functions':''}.`;
      $('#avas-contour-note').textContent=`AO shapes use contracted ${basis} functions at a ${percent}% peak-amplitude contour per shell. Preview radii are normalized to bond scale (0.9–1.25 Å at 40%); these are orientation diagrams, not density surfaces. Lobe size changes only the preview. AVAS eigenvalues and the final active space require an SCF calculation. Nothing runs in VibeMol.`;
    }
    $('#avas-lobe-size').oninput=()=>{
      deps.setContour((100-Number($('#avas-lobe-size').value))/100);syncContour();
      clearTimeout(lobeTimer);lobeTimer=setTimeout(()=>deps.onPreviewChange(),120);
    };
    $('#avas-lobe-size').onchange=()=>{clearTimeout(lobeTimer);deps.onPreviewChange();};
    let signature='',lastRecord=null,ready=false,loading=false;
    const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='vm-btn vm-btn--ghost';b.textContent=text;b.onclick=fn;return b;};
    function field(key,text,type,choices=null) {
      const row=document.createElement('div');row.className='vm-field-row';row.dataset.option=key;
      const label=document.createElement('label');label.className='vm-field-label';label.htmlFor='avas-'+key;label.textContent=text;
      const holder=document.createElement('div');holder.className='vm-field-control';
      const input=document.createElement(choices?'select':'input');input.id=label.htmlFor;
      input.className=choices?'vm-select':type==='checkbox'?'vm-toggle__input':'vm-slider__value';
      if(choices)for(const [value,name]of choices){const o=document.createElement('option');o.value=value;o.textContent=name;input.append(o);}
      else input.type=type;
      if(type==='number'){input.step=key==='ms'?'0.5':['sigma','cutoff'].includes(key)?'0.01':'1';if(key!=='ms')input.min=key==='charge'?'-200':'0';}
      input.onchange=()=>{const record=deps.getRecord();if(!record)return;model.setOptions(record,{[key]:type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value.trim()});changed(false);};
      if(type==='checkbox'){
        const toggle=document.createElement('label');toggle.className='vm-toggle';input.setAttribute('role','switch');
        const thumb=document.createElement('span');thumb.className='vm-toggle__thumb';thumb.setAttribute('aria-hidden','true');
        toggle.append(input,thumb);holder.append(toggle);
      }else holder.append(input);
      row.append(label,holder);$(type==='text'?'[data-basis]':'[data-fields]').append(row);fields.set(key,input);
    }
    field('reference','Reference','select',[['RHF','RHF'],['ROHF','ROHF'],['GHF','GHF / two-component']]);
    field('charge','Charge','number');
    field('ms','Spin projection (ms)','number');
    fields.get('ms').setAttribute('aria-describedby','avas-reference-note');
    $('[data-reference-note]').id='avas-reference-note';
    field('method','Selection method','select',[['cumulative','Cumulative'],['cutoff','Cutoff'],['separate','Separate occupied / virtual'],['total','Total']]);
    for(const [key,title]of [['sigma','Sigma'],['cutoff','Cutoff'],['docc','Occupied'],['uocc','Virtual'],['total','Total active']])field(key,title,'number');
    const totalHelp=document.createElement('div'),totalNote=document.createElement('p');
    totalNote.id='avas-total-note';totalNote.className='vm-session-status';
    fields.get('total').setAttribute('aria-describedby',totalNote.id);
    const resetTotal=button('Use selection count',()=>{model.setOptions(deps.getRecord(),{totalFollowsSelection:true});changed(false);});
    totalHelp.append(totalNote,resetTotal);$('[data-fields]').append(totalHelp);
    field('diagonalize','Diagonalize','checkbox');
    for(const [key,title]of [['basis','Orbital basis'],['auxiliary','Auxiliary basis'],['minao','MINAO basis']])field(key,title,'text');
    // sync() rebuilds atom rows only when their selection/geometry changes.
    // Replacing them on an input's blur/change would swallow the next click.
    function changed(render=true){deps.onChange(render);sync();}
    async function ensureBasis(){if(ready||loading)return;loading=true;$('[data-loading]').textContent='Loading MINAO basis…';try{await model.loadBasis();ready=true;$('[data-loading]').textContent='';changed();}catch(e){$('[data-loading]').textContent=e.message+' Close and reopen Subspace to retry.';}finally{loading=false;}}
    function sync(){
      if(!isOpen())return;
      syncContour();
      const record=deps.getRecord(),s=model.state(record),all=model.atoms(record),projection=model.projection(record),options=model.optionsFor(record,projection);
      if(lastRecord!==record){lastRecord=record;signature='';planeChecked.clear();}
      $('[data-active]').textContent=record?`Active: ${record.name}`:'Load a structure to choose atomic functions.';
      const rohf=options.reference==='ROHF';
      for(const [key,input]of fields){input.disabled=!record||(key==='ms'&&!rohf);if(document.activeElement!==input){if(input.type==='checkbox')input.checked=options[key];else input.value=options[key];}}
      fields.get('total').closest('.vm-field-row').querySelector('label').textContent=rohf?'Additional active':'Total active';
      fields.get('docc').closest('.vm-field-row').querySelector('label').textContent=rohf?'Doubly occupied':'Occupied';
      const applicable={sigma:'cumulative',cutoff:'cutoff',docc:'separate',uocc:'separate',total:'total'};
      for(const [key,method]of Object.entries(applicable))fields.get(key).closest('.vm-field-row').hidden=s.options.method!==method;
      totalHelp.hidden=options.method!=='total';resetTotal.hidden=options.totalFollowsSelection;resetTotal.disabled=!record;
      totalNote.textContent=options.totalFollowsSelection?'Follows the selected subspace, including π planes, until edited.':`Custom count. The selected subspace suggests ${projection.functions.length}.`;
      $('[data-reference-note]').textContent=s.options.reference==='GHF'?'Active counts are entered as spatial pairs and doubled in the generated spinor input.':rohf?
        'ms = (Nα − Nβ)/2, in steps of 0.5. The generated CI state uses S = |ms| (multiplicity 2|ms| + 1). Counts are spatial orbitals, additional to all singly occupied orbitals, which AVAS always includes.':
        'RHF uses a singlet reference. Counts are spatial orbitals.';
      const context=model.selectionContext(record);
      $('[data-selection-summary]').textContent=context.error||`${context.atoms.length} atom${context.atoms.length===1?'':'s'} selected · period ${context.period}`;
      $('[data-choose]').disabled=!context.period;
      const next=JSON.stringify([s.selections,s.planes,all.map(a=>[a.id,a.label,a.point]),ready]);
      if(next!==signature){
        const focused=panel.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
        const body=$('.vm-list-popover__body'),scroll=body.scrollTop;
        signature=next;renderAtoms(record,s,all);renderPlanes(record,s,all);
        if(focused)panel.querySelector(`[aria-label="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
        body.scrollTop=scroll;
      }
      const countWord=s.options.reference==='GHF'?'spinor':'subspace orbital',plural=global.VibeMolUI.plural;
      $('[data-count]').textContent=`${plural(projection.minao,"MINAO function")} → ${plural(projection.orbitals,countWord)} · ${plural(projection.atomCount,"atom")}`;
      const validation=model.validation(record);
      $('[data-validation]').textContent=[...validation.errors,...validation.warnings].join(' ');
      const code=model.generate(record);$('textarea').value=code;$('[data-copy]').disabled=!code;
    }
    function renderAtoms(record,s,all){
      const container=$('[data-atoms]');container.replaceChildren();
      if(!s.selections.length){const p=document.createElement('p');p.className='vm-session-status';p.textContent='No orbitals assigned to AVAS.';container.append(p);}
      for(const atom of all.filter(a=>s.selections.some(r=>r.id===a.id))){
        const row=s.selections.find(r=>r.id===atom.id),entry=document.createElement('section');entry.className='vm-avas-atom';entry.dataset.atom=atom.label;
        const header=document.createElement('div');header.className='vm-avas-atom-title';
        const title=document.createElement('strong');title.textContent=`${atom.label} · atom ${atom.index+1}`;
        const edit=button('Edit',()=>deps.onSelect([atom.id]));edit.setAttribute('aria-label',`Edit orbitals for ${atom.label}`);
        const remove=button('Remove',()=>{model.removeOrbitals(record,[atom.id]);changed();});remove.setAttribute('aria-label',`Remove ${atom.label}`);
        const actions=document.createElement('div');actions.className='vm-list-popover__actions';actions.append(edit,remove);
        const summary=document.createElement('p');summary.className='vm-session-status';
        summary.textContent=Object.entries(row.shells).flatMap(([shell,choice])=>choice==='all'?[shell]:choice.map(c=>shell[0]+c)).join(', ');
        header.append(title,actions);entry.append(header,summary);container.append(entry);
      }
    }
    function planeIds(record){return model.state(record).selections.filter(r=>model.planeEligible(r)&&planeChecked.get(r.id)!==false).map(r=>r.id);}
    function renderPlanes(record,s,all){
      const container=$('[data-plane-atoms]');container.replaceChildren();
      for(const row of s.selections){const atom=all.find(a=>a.id===row.id);if(!atom)continue;
        const label=document.createElement('label');label.className='vm-avas-plane-atom';const input=document.createElement('input');input.type='checkbox';input.disabled=!model.planeEligible(row);input.checked=!input.disabled&&planeChecked.get(row.id)!==false;input.setAttribute('aria-label',`Include ${atom.label} in π plane`);
        input.onchange=()=>{planeChecked.set(row.id,input.checked);signature='';sync();};
        const text=document.createElement('span');text.textContent=atom.label+(input.disabled?' — select a whole p shell; planes do not apply to components.':'');label.append(input,text);container.append(label);
      }
      const fit=model.fitPlane(record,planeIds(record));$('[data-fit]').disabled=!!fit.error;
      $('[data-plane-reason]').textContent=fit.error||`Near-coplanar · RMS ${fit.rms.toFixed(3)} Å`;
      const list=$('[data-plane-list]');list.replaceChildren();
      s.planes.forEach((ids,index)=>{const row=document.createElement('div');row.className='vm-avas-atom-title';const text=document.createElement('span');text.textContent=`Plane ${index+1}: ${ids.map(id=>all.find(a=>a.id===id)?.label).join(', ')}`;row.append(text,button('Remove',()=>{s.planes.splice(index,1);changed();}));list.append(row);});
    }
    function isOpen(){return panel.classList.contains('open');}
    function setOpen(open){panel.classList.toggle('open',open);panel.setAttribute('aria-hidden',String(!open));if(open){sync();ensureBasis();}deps.onOpenChange?.();}
     $('[data-choose]').onclick=()=>deps.onSelect(model.selectedIds(deps.getRecord()));
    $('[data-close]').onclick=()=>setOpen(false);
    $('[data-fit]').onclick=()=>{const result=model.addPlane(deps.getRecord(),planeIds(deps.getRecord()));if(result.error)$('[data-plane-reason]').textContent=result.error;else changed();};
    $('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(model.generate(deps.getRecord()));$('[data-validation]').textContent='Input copied.';}catch(_){$('textarea').focus();$('textarea').select();$('[data-validation]').textContent='Press Cmd/Ctrl+C to copy the selected input.';}};
    return Object.freeze({panel,setOpen,isOpen,sync,ensureBasis,showPlanes:()=>{setOpen(true);$('[data-planes]').open=true;$('[data-planes]').scrollIntoView({block:'nearest'});},setStatus:text=>{$('[data-loading]').textContent=text;}});
  }
  global.VibeMolCalculationsPanel=Object.freeze({create});
})(window);
