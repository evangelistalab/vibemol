"""Initial interactive-overlap guard: real co-open surfaces, no placement repair.

The current three opening profiles are an initial subset. Default execution
fails after collecting every collision. --diagnostic collects the same failures
without supplying any merge-gate acceptance. No known-pair allow-list exists.
"""
import sys,json,hashlib,os,itertools,argparse
from pathlib import Path
HARNESS_ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--source-root',type=Path,default=HARNESS_ROOT)
parser.add_argument('--out',type=Path,required=True)
parser.add_argument('--diagnostic',action='store_true')
args=parser.parse_args()
ROOT=args.source_root.resolve()
sys.path.insert(0,str(HARNESS_ROOT/'tests/e2e'))
import premerge as p
from helpers import wait_for_presented_state
OUT=args.out;OUT.mkdir(parents=True,exist_ok=False)
SNAP=r'''() => {
 const selectors='[data-vm-floating-panel],.wb-window,.wb-menu,.vm-outliner-context-menu,#inspector,#toolbar,#workbenchBar';
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.closest('[hidden],[aria-hidden="true"]')};
 const unclipped=(target,x,y)=>{
  for(let e=target.parentElement;e;e=e.parentElement){
   const s=getComputedStyle(e),r=e.getBoundingClientRect();
   if(/hidden|auto|scroll|clip/.test(s.overflowX)&&(x<r.left+e.clientLeft||x>=r.left+e.clientLeft+e.clientWidth))return false;
   if(/hidden|auto|scroll|clip/.test(s.overflowY)&&(y<r.top+e.clientTop||y>=r.top+e.clientTop+e.clientHeight))return false;
  }
  return true;
 };
 const selector=e=>{
  if(e.id)return '#'+CSS.escape(e.id);
  if(e.hasAttribute('data-build-search-key'))return '[data-build-search-key='+JSON.stringify(e.getAttribute('data-build-search-key'))+']';
  if(e.hasAttribute('aria-label'))return '[aria-label='+JSON.stringify(e.getAttribute('aria-label'))+']';
  const row=e.closest('[data-atom-index],[data-row-index]');
  if(row&&e.hasAttribute('data-edit-field'))return '[data-atom-index='+JSON.stringify(row.getAttribute('data-atom-index'))+'] [data-edit-field='+JSON.stringify(e.getAttribute('data-edit-field'))+']';
  if(e.hasAttribute('data-metal-bonding-choice'))return '[data-metal-bonding-choice='+JSON.stringify(e.getAttribute('data-metal-bonding-choice'))+']';
  return null; // An unidentified control fails closed; never key on DOM position.
 };
 const ownerFor=e=>e.closest(selectors);
 const label=e=>e.id||e.getAttribute('data-vm-floating-panel')||e.className;
 const roots=[...document.querySelectorAll(selectors)].filter(visible);
 const result={surfaces:roots.map(e=>({id:label(e),rect:rect(e),zIndex:getComputedStyle(e).zIndex,moved:e.getAttribute('data-vm-floating-moved')})),targets:[],collisions:[],pairs:[],identityErrors:[]};
 for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++)if(!roots[i].contains(roots[j])&&!roots[j].contains(roots[i]))result.pairs.push([label(roots[i]),label(roots[j])].sort());
 for(const owner of roots)for(const target of owner.querySelectorAll('button,input,select,textarea,[role="button"],[role="tab"],[data-vm-drag-handle]')){
  if(target.disabled||!visible(target)||getComputedStyle(target).pointerEvents==='none'||target.closest(selectors)!==owner)continue;
  const r=target.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
  if(x<0||y<0||x>=innerWidth||y>=innerHeight||!unclipped(target,x,y))continue;
  const hit=document.elementFromPoint(x,y),other=hit?.closest(selectors);
  const row={surface:label(owner),targetSelector:selector(target),targetText:target.textContent.trim().slice(0,120),target:target.id||target.getAttribute('aria-label')||target.getAttribute('data-coords-action')||target.tagName,rect:rect(target),center:{x,y},hit:hit?.id||hit?.className||null,hitSurface:other?label(other):null,ownsHit:!!hit&&(hit===target||target.contains(hit)),zIndex:getComputedStyle(owner).zIndex};
  row.selectorMatches=row.targetSelector ? owner.querySelectorAll(row.targetSelector).length : 0;
  if(row.selectorMatches!==1)result.identityErrors.push({...row,attributes:Object.fromEntries([...target.attributes].map(a=>[a.name,a.value]))});
  result.targets.push(row);
  if(!row.ownsHit&&other&&other!==owner&&!owner.contains(other)&&!other.contains(owner))result.collisions.push({...row,hitStack:document.elementsFromPoint(x,y).slice(0,8).map(e=>({id:e.id,tag:e.tagName,classes:e.className,zIndex:getComputedStyle(e).zIndex}))});
 }
 return result;
}'''
report=dict(sourceSha256=hashlib.sha256((ROOT/'assets/app/js/app.js').read_bytes()).hexdigest(),harnessSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),diagnosticOnly=args.diagnostic,catalogComplete=False,cases=[],errors=[])
with p.run_http_server(ROOT) as url,p.sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader']);report['browserVersion']=browser.version
 try:
  for legacy,width,profile in itertools.product([False,True],[1512,1024,390],['coordinates-selection','build-selection','metal-selection']):
   context=browser.new_context(viewport=dict(width=width,height=1000));page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   name=('legacy' if legacy else 'Workbench')+f'-{width}-{profile}'
   try:
    page.goto(url+'?appearanceStudy=1'+('&workspaceLab=0' if legacy else ''));page.wait_for_function('()=>window.VibeMolTesting')
    page.evaluate('async()=>{await document.fonts.ready;}')
    payload='O 0 0 0\nH .95 0 0\nH -.24 .92 0' if profile!='metal-selection' else 'Fe 0 0 0'
    loaded=p.load(page,[dict(name='surface.xyz',text=payload)]);print('[surface-load] '+json.dumps(dict(actual=loaded,expected={'ok':True})),flush=True);assert loaded['ok'],loaded
    if profile=='coordinates-selection':page.locator('#coordsPanelBtn').evaluate('e=>e.click()')
    page.locator('#modeEditBtn').evaluate('e=>e.click()')
    if not legacy:page.locator('#editTransformToolBtn').evaluate('e=>e.click()')
    page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0])')
    wait_for_presented_state(page,'()=>document.getElementById("editSelectionTranslateCue").getAttribute("aria-hidden")==="false"')
    if profile=='build-selection':page.locator('#editAdaptiveAddAtomBtn').evaluate('e=>e.click()')
    if profile=='metal-selection':page.locator('#editSelectionMetalBondingCueButton').evaluate('e=>e.click()')
    wait_for_presented_state(page,'()=>true')
    row=dict(context=name,legacy=legacy,width=width,profile=profile,**page.evaluate(SNAP),pageerrors=errors)
    report['cases'].append(row);page.screenshot(path=str(OUT/(name+'.png')))
    print('[surface-identities] '+json.dumps(dict(context=name,actual=row['identityErrors'],expected=[])),flush=True)
    assert not row['identityErrors'],row['identityErrors']
    print(json.dumps(dict(context=name,surfaces=len(row['surfaces']),pairs=len(row['pairs']),targets=len(row['targets']),collisions=len(row['collisions']))),flush=True)
   except Exception as e:report['errors'].append(dict(context=name,error=str(e)));raise
   finally:context.close();(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
 finally:browser.close()
pairs={tuple(sorted([c['surface'],c['hitSurface']])) for r in report['cases'] for c in r['collisions']}
report['collisionPairs']=sorted(pairs);report['pairCount']=len(pairs)
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(collisionPairs=report['collisionPairs'],count=len(pairs))),flush=True)

report['passed']=not pairs and not report['errors'] and report['catalogComplete']
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
if not args.diagnostic:assert report['passed'],dict(actual=report['collisionPairs'],expected=[],catalogComplete=report['catalogComplete'])
