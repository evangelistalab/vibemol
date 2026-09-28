(function (global) {
  'use strict';
  function create(deps) {
    const model=global.VibeMolCalculationsModel, popup=document.createElement('section');
    popup.id='calculationOrbitalsPopup';popup.className='vm-avas-picker';
    popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Atomic orbitals');popup.setAttribute('aria-hidden','true');
    popup.innerHTML=`<div class="editSelectionCueActions vm-avas-chips" data-shells role="group" aria-label="Atomic shells">
      <button class="editSelectionCueButton" type="button" data-plane data-fit hidden aria-label="Fit π plane"><span class="material-symbols-rounded" aria-hidden="true">layers</span></button>
      <button class="editSelectionCueButton is-delete" type="button" data-remove aria-label="Remove orbitals" data-tooltip="Remove orbitals from selected atoms"><span class="material-symbols-rounded" aria-hidden="true">delete</span></button></div>
      <div id="avasOrbitalOptions" class="vm-selection-card vm-avas-components" data-components role="group" hidden></div>`;
    document.body.append(popup);
    const floating=global.VibeMolFloatingPanels.register(popup,{label:'Atomic orbitals',grip:true,inlineGrip:true});
    const $=selector=>popup.querySelector(selector),remove=$('[data-remove]'),plane=$('[data-plane]'),details=$('[data-components]');
    let signature='',focusKey='',lastRecord=null,expanded=null,indices=[];
    const isOpen=()=>popup.classList.contains('open');
    function close(){if(isOpen()){popup.classList.remove('open');popup.setAttribute('aria-hidden','true');}}
    function button(text,label,callback){const b=document.createElement('button');b.type='button';b.className='editSelectionCueButton';b.textContent=text;b.setAttribute('aria-label',label);b.onclick=callback;return b;}
    function reposition(){
      if(!isOpen())return;
      const viewport=deps.getViewport(),margin=12,gap=14;
      const leftEdge=Math.max(margin,viewport.left+margin),rightEdge=Math.min(global.innerWidth-margin,viewport.right-margin);
      const topEdge=Math.max(margin,viewport.top+margin),bottomEdge=Math.min(global.innerHeight-margin,viewport.bottom-margin);
      popup.style.maxWidth=Math.max(120,Math.min(440,rightEdge-leftEdge))+'px';
      popup.style.maxHeight=Math.max(100,bottomEdge-topEdge)+'px';
      // Keep the dropdown beneath its own shell, including after wrapping or dragging.
      if(!details.hidden){
        const shell=popup.querySelector(`[data-shell="${expanded}"]`),box=popup.getBoundingClientRect(),anchor=shell.getBoundingClientRect();
        details.style.marginLeft=Math.max(0,Math.min(box.width-details.offsetWidth,anchor.left-box.left+(anchor.width-details.offsetWidth)/2))+'px';
      }
      floating.refresh();
      if(floating.getPosition())return;
      const selection=deps.getSelectionBounds(indices),box=popup.getBoundingClientRect();
      if(!selection)return;
      let left=selection.maxX+gap,top=selection.minY;
      if(left+box.width>rightEdge)left=selection.minX-box.width-gap;
      if(left<leftEdge){
        left=(selection.minX+selection.maxX-box.width)/2;
        top=selection.minY-box.height-gap;
        if(top<topEdge)top=selection.maxY+gap;
      }
      popup.style.left=Math.max(leftEdge,Math.min(left,rightEdge-box.width))+'px';
      popup.style.top=Math.max(topEdge,Math.min(top,bottomEdge-box.height))+'px';
    }
    function sync(){
      if(!isOpen())return;
      const record=deps.getRecord(),context=model.selectionContext(record);
      if(!deps.isActive()||record!==lastRecord||!context.period){close();return;}
      const s=model.state(record),ids=context.atoms.map(a=>a.id),key=JSON.stringify(ids);
      if(key!==focusKey){focusKey=key;expanded=null;floating.reset();}
      indices=context.atoms.map(a=>a.index);
      const next=JSON.stringify([context.atoms,context.shells.map(s=>s.label),s.selections,s.planes,expanded]);
      if(next===signature){reposition();return;}signature=next;
      const focused=popup.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
      const scroll=details.scrollTop;
      popup.setAttribute('aria-description',context.error||(ids.length===1?`${context.atoms[0].label}, atom ${context.atoms[0].index+1}`:`Applies to all ${ids.length} selected atoms.`));
      const chips=$('[data-shells]');chips.replaceChildren();details.replaceChildren();details.hidden=true;
      for(const shell of context.shells){
        const wrapper=document.createElement('div');wrapper.className='vm-avas-shell';
        const choices=ids.map(id=>model.choiceFor(record,id,shell.label)),components=model.componentsFor(shell.label[1]);
        const chip=button(shell.label,`${shell.label} shell`,()=>{
          expanded=components.length>1?shell.label:null;
          model.selectShells(record,ids,shell.label);deps.onChange();
        });
        chip.dataset.shell=shell.label;
        global.VibeMolEditUi.setCueState(chip,choices.every(c=>c==='all')?'true':choices.some(Boolean)?'mixed':'false',{checkbox:true,allowMixed:true});wrapper.append(chip);
        if(components.length>1){
          const caret=button('▾',`${shell.label} components`,()=>{expanded=expanded===shell.label?null:shell.label;sync();});
          caret.className='motionPanelIconBtn vm-avas-caret';caret.setAttribute('aria-expanded',String(expanded===shell.label));
          caret.setAttribute('aria-controls',details.id);chip.setAttribute('aria-controls',details.id);wrapper.append(caret);
          caret.setAttribute('data-tooltip',`Choose individual ${shell.label} orbitals`);
          if(expanded===shell.label){
            details.hidden=false;details.setAttribute('aria-label',`${shell.label} orbitals`);
            for(const component of components){
              const b=button(shell.label,`${shell.label[0]}${component} orbital`,()=>{model.selectComponents(record,ids,shell.label,component);deps.onChange();});
              const sub=document.createElement('sub');sub.textContent=component.slice(1);b.append(sub);
              global.VibeMolEditUi.setCueState(b,choices.every(c=>c==='all'||Array.isArray(c)&&c.includes(component)),{checkbox:true});details.append(b);
            }
          }
        }
        chips.append(wrapper);
      }
      chips.append(plane,remove);remove.disabled=!ids.some(id=>s.selections.some(r=>r.id===id));
      plane.hidden=ids.length<3;
      const eligible=ids.every(id=>{const row=s.selections.find(r=>r.id===id);return row&&model.planeEligible(row);});
      const fit=model.fitPlane(record,ids),existing=s.planes.findIndex(p=>p.length===ids.length&&p.every(id=>ids.includes(id)));
      const reason=!eligible?'Choose whole p shells on every selected atom before fitting a π plane.':fit.error||`Near-coplanar · RMS ${fit.rms.toFixed(3)} Å`;
      const planeLabel=existing>=0?'Remove π plane':'Fit π plane';
      plane.disabled=!eligible||!!fit.error;plane.setAttribute('aria-label',planeLabel);plane.setAttribute('data-tooltip',`${planeLabel}. ${reason}`);
      global.VibeMolEditUi.setCueState(plane,existing>=0);
      plane.onclick=()=>{if(existing>=0)s.planes.splice(existing,1);else model.addPlane(record,ids);deps.onChange();};
      if(focused)popup.querySelector(`[aria-label="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
      details.scrollTop=scroll;reposition();
    }
    function show(focus=false){
      const record=deps.getRecord(),context=model.selectionContext(record);
      if(!deps.isActive()||!context.period){close();return;}
      if(record!==lastRecord)focusKey='';
      lastRecord=record;signature='';popup.classList.add('open');popup.setAttribute('aria-hidden','false');sync();
      if(focus)($('[data-shells] button')||$('[data-vm-drag-handle]')).focus({preventScroll:true});
    }
    remove.onclick=()=>{model.removeOrbitals(deps.getRecord(),model.selectedIds(deps.getRecord()));deps.onChange();};
    document.addEventListener('pointerdown',e=>{if(isOpen()&&!popup.contains(e.target))close();},true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen()){e.preventDefault();e.stopImmediatePropagation();close();}},true);
    popup.addEventListener('keydown',e=>{if(e.altKey&&e.key==='Home')reposition();});
    global.addEventListener('resize',reposition);
    return Object.freeze({show,close,sync,isOpen,reposition});
  }
  global.VibeMolCalculationsPicker=Object.freeze({create});
})(window);
