(config) => {
  const selector = '[data-vm-floating-panel],.wb-window,.wb-menu,.vm-outliner-context-menu,#inspector,#toolbar,#workbenchBar';
  const controls = 'button,input,select,textarea,[role="button"],[role="tab"],[data-vm-drag-handle]';
  const rect = e => { const r=e.getBoundingClientRect();return {x:r.x,y:r.y,left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
  const visible = e => {const r=rect(e),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.closest('[hidden],[aria-hidden="true"],[inert],[data-floating-contract]');};
  const intersect=(a,b)=>{const left=Math.max(a.left,b.left),top=Math.max(a.top,b.top),right=Math.min(a.right,b.right),bottom=Math.min(a.bottom,b.bottom);return right>left&&bottom>top?{left,top,right,bottom,width:right-left,height:bottom-top}:null;};
  const clipped=e=>{
    let r=intersect(rect(e),{left:0,top:0,right:innerWidth,bottom:innerHeight});
    for(let p=e.parentElement;p&&r;p=p.parentElement){
      const s=getComputedStyle(p),b=rect(p),x=/hidden|auto|scroll|clip/.test(s.overflowX),y=/hidden|auto|scroll|clip/.test(s.overflowY);
      if(x||y)r=intersect(r,{left:x?b.left+p.clientLeft:r.left,right:x?b.left+p.clientLeft+p.clientWidth:r.right,top:y?b.top+p.clientTop:r.top,bottom:y?b.top+p.clientTop+p.clientHeight:r.bottom});
    }
    return r;
  };
  const name=e=>e.id||e.getAttribute('data-vm-floating-panel')||e.className;
  const identity=e=>{
    if(e.id)return '#'+CSS.escape(e.id);
    if(e.hasAttribute('data-build-search-key'))return '[data-build-search-key='+JSON.stringify(e.getAttribute('data-build-search-key'))+']';
    if(e.hasAttribute('aria-label'))return '[aria-label='+JSON.stringify(e.getAttribute('aria-label'))+']';
    if(e.hasAttribute('data-row-index')&&e.hasAttribute('data-edit-field'))return '[data-row-index='+JSON.stringify(e.getAttribute('data-row-index'))+'][data-edit-field='+JSON.stringify(e.getAttribute('data-edit-field'))+']';
    if(e.hasAttribute('data-metal-bonding-choice'))return '[data-metal-bonding-choice='+JSON.stringify(e.getAttribute('data-metal-bonding-choice'))+']';
    return null;
  };
  const modals=[...document.querySelectorAll('[aria-modal="true"]')].filter(visible);
  if(modals.length>1)throw new Error('Ambiguous simultaneous modal ownership');
  const roots=[...document.querySelectorAll(selector)].filter(visible).filter(e=>!modals.length||modals[0].contains(e)||e.contains(modals[0]));
  const entries=[];
  for(const owner of roots)for(const target of owner.querySelectorAll(controls)){
    if(target.disabled||!visible(target)||getComputedStyle(target).pointerEvents==='none'||target.closest(selector)!==owner)continue;
    const box=clipped(target);if(box)entries.push({owner,target,box});
  }
  const result={timestampMs:performance.now(),sampling:config.sampling,viewport:{width:innerWidth,height:innerHeight},
    workbenchCompact:document.getElementById('workbenchBar')?.dataset.wbCompact||null,
    modalOwner:modals[0]?.id||null,registeredCatalog:window.VibeMolFloatingPanels.list(),
    surfaces:roots.map(e=>({id:name(e),rect:rect(e),zIndex:getComputedStyle(e).zIndex,moved:e.getAttribute('data-vm-floating-moved')})),
    pairs:[],targets:[],collisions:[],identityErrors:[]};
  for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++)if(!roots[i].contains(roots[j])&&!roots[j].contains(roots[i]))result.pairs.push([name(roots[i]),name(roots[j])].sort());
  const found=new Map();
  for(const {owner,target,box} of entries){
    const full=rect(target),id=identity(target),count=id?owner.querySelectorAll(id).length:0;
    const row={surface:name(owner),targetSelector:id,selectorMatches:count,target:target.id||target.getAttribute('aria-label')||target.textContent.trim().slice(0,120),rect:full,clippedRect:box};
    result.targets.push(row);
    const points=new Map(),point=r=>{if(r){const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;points.set(x+':'+y,{x,y});}};
    if(config.sampling==='centers'){
      const x=full.left+full.width/2,y=full.top+full.height/2;
      if(x>=box.left&&x<box.right&&y>=box.top&&y<box.bottom)points.set(x+':'+y,{x,y});
    }else{
      point(box);
      for(const other of roots)if(other!==owner&&!owner.contains(other)&&!other.contains(owner))point(intersect(box,rect(other)));
      for(const other of entries)if(other.owner!==owner&&!owner.contains(other.owner)&&!other.owner.contains(owner))point(intersect(box,other.box));
    }
    for(const center of points.values()){
      const hit=document.elementFromPoint(center.x,center.y),other=hit?.closest(selector);
      if(!hit||target===hit||target.contains(hit)||!other||other===owner||owner.contains(other)||other.contains(owner))continue;
      const key=JSON.stringify([name(other),name(owner),id]);
      const collision={...row,center,hit:hit.id||hit.getAttribute('class')||hit.tagName,hitSurface:name(other),ownsHit:false,
        hitStack:document.elementsFromPoint(center.x,center.y).slice(0,8).map(e=>({id:e.id,tag:e.tagName,classes:e.getAttribute('class'),zIndex:getComputedStyle(e).zIndex}))};
      if(!found.has(key))found.set(key,collision);
      if(count!==1)result.identityErrors.push({...collision,attributes:Object.fromEntries([...target.attributes].map(a=>[a.name,a.value]))});
    }
  }
  result.collisions=[...found.values()];
  return result;
}
