(function(global){
  'use strict';
  function create(deps){
    const model=global.VibeMolFigureComposer, panel=document.createElement('section');
    panel.id='figurePanel';panel.className='vm-popover vm-list-popover vm-figure';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Figure');panel.setAttribute('aria-hidden','true');
    panel.innerHTML=`<header class="vm-list-popover__header motionPanelHeader" data-vm-drag-handle tabindex="0"><span class="vm-list-popover__title title">Figure</span><div class="vm-list-popover__actions"><button type="button" class="vm-btn vm-btn--ghost" data-close aria-label="Close Figure">×</button></div></header>
      <div class="vm-list-popover__body"><p class="vm-figure-note">One fixed camera across every panel. Square panels keep a common scale.</p>
      <section><div class="vm-figure-row"><span class="vm-section-label">Panels</span><button type="button" class="vm-btn vm-btn--ghost vm-btn--sm" data-all>All</button><button type="button" class="vm-btn vm-btn--ghost vm-btn--sm" data-none>None</button></div><p class="vm-figure-note" data-empty>Load a structure or orbital file to compose a figure.</p><ol class="vm-figure-targets" aria-label="Figure panels"></ol></section>
      <section data-grid><p class="vm-section-label">Grid & labels</p></section>
      <fieldset class="vm-figure-camera"><legend class="vm-section-label">Camera</legend><label><input type="radio" name="figure-camera" value="current" checked> Current view</label><label><input type="radio" name="figure-camera" value="fit"> Fit all panels</label></fieldset>
      <section data-lock><p class="vm-section-label">Lock</p></section><p class="vm-figure-note" data-iso></p>
      <section data-output><p class="vm-section-label">Output</p></section>
      <p class="vm-figure-note" data-size></p><p class="vm-figure-note" data-limit></p>
      <div class="vm-figure-preview"><img alt="Composed figure preview" hidden><span data-placeholder>Choose panels to preview.</span></div>
      <p class="vm-figure-note" role="status" aria-live="polite" data-status></p>
      <div class="vm-figure-row"><button type="button" class="vm-btn vm-btn--ghost" data-refresh>Refresh preview</button><button type="button" class="vm-btn vm-btn--ghost" data-export>Export figure</button></div></div>`;
    document.body.append(panel);
    global.VibeMolFloatingPanels.register(panel,{label:'Figure',handle:'[data-vm-drag-handle]'});
    const $=s=>panel.querySelector(s), options={...model.defaults}, fields=new Map();
    let rows=[],listSignature='',revision=0,timer=0,previewUrl='',pending=false,dirty=true,job=null;
    const isOpen=()=>panel.classList.contains('open');
    function field(section,key,label,type,choices){
      const row=document.createElement('div');row.className='vm-field-row';
      const text=document.createElement('label');text.className='vm-field-label';text.htmlFor='figure-'+key;text.textContent=label;
      const holder=document.createElement('div');holder.className='vm-field-control';
      const input=document.createElement(choices?'select':'input');input.id=text.htmlFor;
      input.className=choices?'vm-select':type==='checkbox'?'vm-toggle__input':'vm-slider__value';
      if(choices)for(const [value,name] of choices){const o=document.createElement('option');o.value=value;o.textContent=name;input.append(o);}
      else {input.type=type;if(type==='number'){input.step=key==='widthIn'?'.1':'1';input.min=key==='gutter'?'0':'1';}}
      if(type==='checkbox')input.checked=options[key];else input.value=options[key];
      input.onchange=()=>{options[key]=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;changed();};
      if(type==='checkbox'){
        const toggle=document.createElement('label');toggle.className='vm-toggle';input.setAttribute('role','switch');
        const thumb=document.createElement('span');thumb.className='vm-toggle__thumb';thumb.setAttribute('aria-hidden','true');
        toggle.append(input,thumb);holder.append(toggle);
      }else holder.append(input);
      row.append(text,holder);$(section).append(row);fields.set(key,input);
    }
    field('[data-grid]','cols','Columns','number');field('[data-grid]','gutter','Gutter (px)','number');field('[data-grid]','border','Panel border','checkbox');
    field('[data-grid]','labelPosition','Labels','select',[['below','Below'],['overlay','Overlay top-left']]);field('[data-grid]','fontPt','Font size (pt)','number');
    field('[data-lock]','sharedIso','Shared iso value','checkbox');field('[data-lock]','sharedLook','Shared Look','checkbox');
    field('[data-output]','widthIn','Width (in)','number');field('[data-output]','dpi','DPI','number');
    field('[data-output]','background','Background','select',[['look','Look background'],['white','White'],['transparent','Transparent']]);
    field('[data-output]','format','Format','select',[['png','PNG'],['svg','SVG (editable labels)']]);
    panel.querySelectorAll('[name="figure-camera"]').forEach(input=>input.onchange=()=>{options.camera=input.value;changed();});
    function selected(){return rows.filter(r=>r.checked).map(r=>({id:r.id,label:r.label}));}
    function status(text){$('[data-status]').textContent=text;}
    function info(){
      const targets=selected(), limits=deps.limits();
      $('[data-limit]').textContent=`Device limit: ${limits.panel.toLocaleString()} px per panel (GPU: ${limits.gpu.toLocaleString()} px).`;
      let invalid='';
      try { const plan=model.layout(targets.length,options,limits.panel);$('[data-size]').textContent=`${plan.width.toLocaleString()} × ${plan.height.toLocaleString()} px · ${plan.cols} columns × ${plan.rows} rows`;invalid=plan.error; }
      catch(e){invalid=e.message;$('[data-size]').textContent=invalid;}
      const layers=deps.targets().filter(t=>targets.some(r=>r.id===t.id));
      const iso=deps.sharedIso(layers), values=layers.filter(t=>t.iso>0).map(t=>t.iso);
      $('[data-iso]').hidden=!values.length;
      $('[data-iso]').textContent=options.sharedIso
        ? `Uses ${Number(iso).toPrecision(4)} for every panel (active surface, or first selected surface). Overrides per-orbital Auto-iso.`+(values.some(v=>Math.abs(v-iso)>1e-10)?' Selected panels currently have different iso values.':'')
        : 'Uses each orbital’s Auto-iso setting or manual iso value.';
      $('[data-export]').disabled=!!invalid||pending||!targets.length;
      $('[data-refresh]').disabled=pending||!targets.length;
      if(invalid&&targets.length)status(invalid);
      return invalid;
    }
    function drawRows(){
      const list=$('.vm-figure-targets');list.replaceChildren();$('[data-empty]').hidden=!!rows.length;
      rows.forEach((r,index)=>{
        const li=document.createElement('li');li.dataset.target=r.id;
        const grip=document.createElement('button');grip.type='button';grip.className='vm-btn vm-btn--ghost vm-figure-grip';grip.draggable=true;
        grip.setAttribute('aria-label',`Reorder ${r.name}`);grip.title='Drag to reorder; Alt + Up/Down also moves this panel.';
        grip.innerHTML='<span class="material-symbols-rounded" aria-hidden="true">drag_indicator</span>';
        grip.ondragstart=e=>{e.dataTransfer.setData('text/x-vibemol-figure',r.id);e.dataTransfer.effectAllowed='move';};
        li.ondragover=e=>{if([...e.dataTransfer.types].includes('text/x-vibemol-figure')){e.preventDefault();e.dataTransfer.dropEffect='move';}};
        li.ondrop=e=>{const id=e.dataTransfer.getData('text/x-vibemol-figure');if(id){e.preventDefault();move(id,index);}};
        grip.onkeydown=e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();move(r.id,index+(e.key==='ArrowUp'?-1:1));}};
        const check=document.createElement('input');check.type='checkbox';check.checked=r.checked;check.setAttribute('aria-label',`Include ${r.name}`);
        check.onchange=()=>{r.checked=check.checked;changed();};
        const text=document.createElement('input');text.type='text';text.value=r.label;text.maxLength=500;text.setAttribute('aria-label',`Label for ${r.name}`);text.title=r.name;
        text.oninput=()=>{r.label=text.value;changed();};
        li.append(grip,check,text);list.append(li);
      });
    }
    function move(id,index){const old=rows.findIndex(r=>r.id===id);if(old<0)return;const [row]=rows.splice(old,1);rows.splice(Math.max(0,Math.min(rows.length,index)),0,row);drawRows();$('.vm-figure-targets').querySelector(`[data-target="${CSS.escape(id)}"] button`)?.focus();changed();}
    function sync(){
      if(!isOpen()||pending)return;
      const targets=deps.targets(), signature=JSON.stringify(targets.map(t=>[t.id,t.name]));
      if(signature!==listSignature){listSignature=signature;const byId=new Map(targets.map(t=>[t.id,t]));rows=rows.filter(r=>byId.has(r.id));
        for(const t of targets){const old=rows.find(r=>r.id===t.id);if(old)old.name=t.name;else rows.push({id:t.id,name:t.name,label:model.stem(t.name),checked:true});}drawRows();dirty=true;
      }
      info();if(dirty)schedule();
    }
    function schedule(){clearTimeout(timer);if(isOpen())timer=setTimeout(()=>preview(),700);}
    function invalidate(){revision++;dirty=true;if(isOpen())schedule();}
    function changed(){dirty=true;info();schedule();}
    async function preview(){
      if(!isOpen()||pending||!panel.getClientRects().length)return;
      // Do not interrupt a coordinate/label draft to refresh a thumbnail.
      if(document.activeElement?.matches('input[type="text"],input[type="number"],textarea'))return;
      sync();clearTimeout(timer);
      if(!selected().length){$('img').hidden=true;$('[data-placeholder]').hidden=false;dirty=false;return;}
      const rev=revision;
      pending=true;info();status('Updating preview…');job=new AbortController();
      try {const blob=await deps.compose({...options,targets:selected(),preview:true,signal:job.signal});
        if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(blob);$('img').src=previewUrl;$('img').hidden=false;$('[data-placeholder]').hidden=true;
        dirty=revision!==rev;status('Preview · export uses the requested print resolution.');
      }catch(e){if(e.name!=='AbortError')status(e.message);dirty=false;}
      finally {pending=false;job=null;info();if(dirty)schedule();}
    }
    async function download(){
      if(pending||info())return;
      clearTimeout(timer);pending=true;job=new AbortController();info();status('Preparing figure…');
      try {const blob=await deps.compose({...options,targets:selected(),signal:job.signal,onProgress:status});
        const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=model.stem(deps.sceneName())+'-figure.'+options.format;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);status('Figure downloaded.');
      }catch(e){status(e.name==='AbortError'?'Figure canceled.':e.message);}
      finally {pending=false;job=null;info();if(dirty)schedule();}
    }
    function setOpen(open){panel.classList.toggle('open',open);panel.setAttribute('aria-hidden',String(!open));if(open)sync();else{clearTimeout(timer);job?.abort();}deps.onOpenChange?.();}
    $('[data-close]').onclick=()=>setOpen(false);$('[data-refresh]').onclick=()=>{dirty=true;preview();};$('[data-export]').onclick=download;
    for(const [selector,checked] of [['[data-all]',true],['[data-none]',false]])$(selector).onclick=()=>{rows.forEach(r=>r.checked=checked);drawRows();changed();};
    panel.addEventListener('focusout',()=>{if(dirty)schedule();});
    new MutationObserver(records=>{
      if(dirty && records.some(r=>r.oldValue!==panel.getAttribute('data-wb-hidden')) && panel.dataset.wbHidden==='false')schedule();
    }).observe(panel,{attributes:true,attributeFilter:['data-wb-hidden'],attributeOldValue:true});
    return Object.freeze({panel,setOpen,isOpen,sync,invalidate,cancel:()=>job?.abort()});
  }
  global.VibeMolFigurePanel=Object.freeze({create});
})(window);
