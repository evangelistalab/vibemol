(function (global) {
  'use strict';
  function create(deps) {
    const model=global.VibeMolCalculationsModel, popup=document.createElement('section');
    popup.id='calculationOrbitalsPopup';popup.className='vm-list-popover vm-selection-card vm-avas-picker';
    popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Atomic orbitals');popup.setAttribute('aria-hidden','true');
    popup.innerHTML=`<header class="vm-list-popover__header vm-selection-card__header" data-vm-drag-handle tabindex="0"><span class="editAddAtomOperatorTitle"><span class="material-symbols-rounded" aria-hidden="true">drag_indicator</span><span class="editAddAtomOperatorLabel">Atomic orbitals</span></span><button class="motionPanelIconBtn" type="button" data-close aria-label="Close atomic orbitals">×</button></header>
      <div class="vm-list-popover__body"><p class="vm-stat-label" data-selection></p>
      <p class="vm-avas-note" data-reason></p><div class="vm-avas-chips" data-shells></div>
      <section class="vm-avas-plane" data-plane><p class="vm-stat-label">π plane</p><p class="vm-avas-note" data-plane-reason></p><div class="editAddMoleculeOperatorButtonRow vm-avas-actions"><button type="button" data-fit>Fit π plane</button></div></section>
      <p class="vm-avas-note">Shells include all components. Expand p or d to choose individual orbitals. An underline marks mixed assignments.</p>
      <div class="editAddMoleculeOperatorButtonRow vm-avas-actions"><button type="button" data-remove>Remove orbitals</button><button type="button" data-deselect>Deselect atoms</button></div></div>`;
    document.body.append(popup);
    const floating=global.VibeMolFloatingPanels.register(popup,{label:'Atomic orbitals',handle:'[data-vm-drag-handle]'});
    const $=selector=>popup.querySelector(selector),expanded=new Set();
    let signature='',lastRecord=null;
    const isOpen=()=>popup.classList.contains('open');
    function close(){if(isOpen()){popup.classList.remove('open');popup.setAttribute('aria-hidden','true');}}
    function pressed(values){return values.every(Boolean)?'true':values.some(Boolean)?'mixed':'false';}
    function button(text,label,callback){const b=document.createElement('button');b.type='button';b.className='editSelectionCueButton';b.textContent=text;b.setAttribute('aria-label',label);b.onclick=callback;return b;}
    function markPressed(button,value){button.setAttribute('aria-pressed',value);button.classList.toggle('is-active',value==='true');}
    function sync(){
      if(!isOpen())return;
      const record=deps.getRecord(),context=model.selectionContext(record);
      if(!deps.isActive()||record!==lastRecord||!context.period){close();return;}
      const s=model.state(record),ids=context.atoms.map(a=>a.id);
      const next=JSON.stringify([context.atoms,context.shells.map(s=>s.label),s.selections,s.planes,[...expanded]]);
      if(next===signature)return;signature=next;
      const focused=popup.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
      const scroll=$('.vm-list-popover__body').scrollTop;
      $('[data-selection]').textContent=context.atoms.length===1?`${context.atoms[0].label} · atom ${context.atoms[0].index+1}`:
        `${context.atoms.length} atoms · period ${context.period} · ${[...new Set(context.atoms.map(a=>a.element))].join(', ')}`;
      $('[data-reason]').textContent=context.error||'Changes apply to every selected atom. Selecting atoms alone adds no orbitals.';
      const chips=$('[data-shells]');chips.replaceChildren();
      for(const shell of context.shells){
        const wrapper=document.createElement('div');wrapper.className='vm-avas-shell';
        const choices=ids.map(id=>model.choiceFor(record,id,shell.label));
        const chip=button(shell.label,`${shell.label} shell`,()=>{model.selectShells(record,ids,shell.label);deps.onChange();});
        markPressed(chip,choices.every(c=>c==='all')?'true':choices.some(Boolean)?'mixed':'false');wrapper.append(chip);
        const components=model.componentsFor(shell.label[1]);
        if(components.length>1){
          const caret=button('▾',`${shell.label} components`,()=>{if(expanded.has(shell.label))expanded.delete(shell.label);else expanded.add(shell.label);sync();});
          caret.className='motionPanelIconBtn vm-avas-caret';caret.setAttribute('aria-expanded',String(expanded.has(shell.label)));wrapper.append(caret);
          if(expanded.has(shell.label)){
            wrapper.classList.add('is-expanded');
            const row=document.createElement('div');row.className='vm-avas-components';
            for(const component of components){
              const b=button(component,`${shell.label[0]}${component} orbital`,()=>{model.selectComponents(record,ids,shell.label,component);deps.onChange();});
              markPressed(b,pressed(choices.map(c=>c==='all'||Array.isArray(c)&&c.includes(component))));row.append(b);
            }
            wrapper.append(row);
          }
        }
        chips.append(wrapper);
      }
      $('[data-remove]').disabled=!ids.some(id=>s.selections.some(r=>r.id===id));
      $('[data-plane]').hidden=ids.length<3;
      const eligible=ids.every(id=>{const row=s.selections.find(r=>r.id===id);return row&&model.planeEligible(row);});
      const fit=model.fitPlane(record,ids),existing=s.planes.findIndex(p=>p.length===ids.length&&p.every(id=>ids.includes(id)));
      const reason=!eligible?'Choose whole p shells on every selected atom before fitting a π plane.':fit.error||`Near-coplanar · RMS ${fit.rms.toFixed(3)} Å`;
      $('[data-plane-reason]').textContent=reason;
      $('[data-fit]').disabled=!eligible||!!fit.error;
      $('[data-fit]').textContent=existing>=0?'Remove π plane':'Fit π plane';
      $('[data-fit]').onclick=()=>{if(existing>=0)s.planes.splice(existing,1);else model.addPlane(record,ids);deps.onChange();};
      if(focused)popup.querySelector(`[aria-label="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
      $('.vm-list-popover__body').scrollTop=scroll;
      floating.refresh();
    }
    function show(focus=false){
      const record=deps.getRecord(),context=model.selectionContext(record);
      if(!deps.isActive()||!context.period){close();return;}
      lastRecord=record;signature='';popup.classList.add('open');popup.setAttribute('aria-hidden','false');sync();
      if(!floating.getPosition()){
        const bounds=deps.getViewport(),box=popup.getBoundingClientRect();
        popup.style.left=Math.max(12,Math.min(bounds.right-box.width-12,global.innerWidth-box.width-12))+'px';
        popup.style.top=Math.max(12,Math.min(bounds.top+16,global.innerHeight-box.height-12))+'px';
      }
      if(focus)($('[data-shells] button')||$('[data-close]')).focus({preventScroll:true});
    }
    $('[data-close]').onclick=close;
    $('[data-deselect]').onclick=()=>{deps.onDeselect();close();};
    $('[data-remove]').onclick=()=>{model.removeOrbitals(deps.getRecord(),model.selectedIds(deps.getRecord()));deps.onChange();};
    document.addEventListener('pointerdown',e=>{if(isOpen()&&!popup.contains(e.target))close();},true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen()){e.preventDefault();e.stopImmediatePropagation();close();}},true);
    global.addEventListener('resize',()=>{if(isOpen()&&!floating.getPosition())show();});
    return Object.freeze({show,close,sync,isOpen});
  }
  global.VibeMolCalculationsPicker=Object.freeze({create});
})(window);
