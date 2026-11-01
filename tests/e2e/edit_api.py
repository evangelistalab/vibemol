"""Validated product Edit API matrix; no existing native-click test is converted."""
import json
from pathlib import Path
import premerge as p
from surface_shadows import settle
from assertion_contract import deadline_diagnostics, wait_for_budget

def ready(page,predicate,*,arg=None,site='state',readback=None,expected=True):
 # Reuse the existing 30s readiness policy/180s ceiling and shared stall/wall
 # attribution; this is a functional guard, never a performance detector.
 actual=None
 try:
  with deadline_diagnostics(page,label='Edit API readiness: '+site,policy='resize-readiness',site='edit-api.'+site) as report:
   wait_for_budget(page,predicate,report,arg=arg)
 finally:
  try:actual=page.evaluate(readback or predicate,arg)
  except Exception as error:actual={'unavailable':str(error)}
  print('[edit-api-readiness] '+json.dumps(dict(site=site,predicate=predicate,actual=actual,expected=expected)),flush=True)

XYZ='3\nAPI\nC 0 0 0\nC 1.5 0 0\nH -1 0 0\n'
CARBON='1\nAPI\nC 0 0 0\n'
METHANE='5\nAPI\nC 0 0 0\nH 1 0 0\nH -1 0 0\nH 0 1 0\nH 0 0 1\n'

def compare(label,actual,expected):
 print('[edit-api] '+json.dumps(dict(case=label,actual=actual,expected=expected)),flush=True)
 assert actual==expected,dict(case=label,actual=actual,expected=expected)

def result(page,expression):
 row=page.evaluate('()=>'+expression)
 print('[edit-api-result] '+json.dumps(row),flush=True)
 assert row['ok'],row
 return row

def run(page,url):
 page.add_init_script(Path(__file__).with_name('edit_api_probe.js').read_text())
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:print('[console] '+m.text,flush=True) if m.type in ('warning','error') else None)
 page.goto(url+'?appearanceStudy=1&qa=1');ready(page,'()=>!!(window.VibeMolEdit&&window.VibeMolEmbed)')
 def load(text=XYZ,files=None):
  compare('load',p.load(page,files or [{'name':'api.xyz','text':text}])['ok'],True)
  result(page,'VibeMolEdit.enter()');settle(page)
 def build(operation,**fields):
  row=page.evaluate('''request=>{const c=VibeMolEdit.context().value;return VibeMolEdit.applyBuild({system:{systemId:c.systemId,fingerprint:c.fingerprint},hydrogens:'preserve',warnings:'allow',...request})}''',dict(operation=operation,**fields))
  print('[edit-api-build] '+json.dumps(row),flush=True);assert row['ok'],row
  compare('requested-applied-'+operation,row['requested'],row['applied']);return row
 ready(page,'()=>VibeMolEdit.listBuildCatalog().value.some(e=>e.entryId==="fusionphenyl")')
 load()
 negative=page.evaluate('''()=>{
  const context=VibeMolEdit.context().value,system={systemId:context.systemId,fingerprint:context.fingerprint},base={system,hydrogens:'preserve',warnings:'allow'};
  const anchor={kind:'labels',labels:['C1']},carbon={kind:'labels',labels:['C2']},hydrogen={kind:'labels',labels:['H1']};
  const atom={operation:'placeAtom',element:'O',position:[3,0,0]};
  const grow={operation:'growAtom',element:'C',anchor,direction:[1,0,0],bondOrder:1,attachPolicy:'append'};
  const cases=[
   [{...atom,element:'Qq'},'ELEMENT_UNKNOWN'],[{...atom,element:1.9},'ELEMENT_UNKNOWN'],[{...atom,position:[NaN,0,0]},'INVALID_COORDINATES'],
   [{...atom,position:[0,0]},'INVALID_COORDINATES'],[{...atom,extra:true},'INVALID_REQUEST'],[{...atom,system:'new',element:'Qq'},'ELEMENT_UNKNOWN'],
   [{...atom,operation:'unknown'},'INVALID_REQUEST'],[{...grow,direction:[0,0,0]},'INVALID_ORIENTATION'],[{...grow,direction:[Infinity,0,0]},'INVALID_COORDINATES'],
   ...[0,5,1.5,'1'].map(bondOrder=>[{...grow,bondOrder},'INVALID_BOND_ORDER']),
   [{...grow,anchor:{kind:'element',element:'C'}},'ANCHOR_INVALID'],[{...grow,attachPolicy:'guess'},'ATTACH_POLICY_UNSUPPORTED'],
   [{operation:'replaceHydrogen',element:'O',anchor,hydrogen:carbon,bondOrder:1},'NOT_TERMINAL_H'],
   [{operation:'attachFragment',entryId:'not-an-entry',anchor,direction:[1,0,0],bondOrder:1,attachPolicy:'append',spinAngle:0},'CATALOG_NOT_FOUND'],
   [{operation:'placeCatalog',entryId:'benzene',entryKind:'wrong',position:[0,0,0],quaternion:[0,0,0,1]},'CATALOG_KIND'],
   [{operation:'placeCatalog',entryId:'benzene',entryKind:'molecule',position:[0,0,0],quaternion:[0,0,0,2]},'INVALID_ORIENTATION'],
   [{operation:'fuseFragment',entryId:'fusionphenyl',host:{kind:'ids',ids:[context.atoms[1].id,context.atoms[2].id]},bondOrder:1,spinAngle:0},'HOST_BOND_INVALID'],
   [{...atom,position:[0,0,0],warnings:'reject'},'WARNINGS_NOT_ACKNOWLEDGED'],
   [{operation:'insertSelection',envelope:{},position:[0,0,0],quaternion:[0,0,0,1]},'INVALID_REQUEST'],
   ...['builderMeta','coordinationMeta','metalBondingMeta'].map(key=>[{operation:'insertSelection',envelope:{kind:'vibemol.edit-selection',version:1,units:'angstrom',atoms:[{atom:{Z:6,x:0,y:0,z:0,formalCharge:0}},{atom:{Z:1,x:1,y:0,z:0,formalCharge:0},[key]:0}],bonds:[]},position:[0,0,0],quaternion:[0,0,0,1]},'INVALID_REQUEST'])
  ];
  const rows=[];
  for(const [request,expected]of cases){
   const before={volume:VibeMolStructure.exportActive().volume,selection:VibeMolEdit.getSelection(),effects:__editApiEffects(),ui:VibeMolTesting.getEditBuildState()};
   const actual=VibeMolEdit.applyBuild({...base,...request});
   const after={volume:VibeMolStructure.exportActive().volume,selection:VibeMolEdit.getSelection(),effects:__editApiEffects(),ui:VibeMolTesting.getEditBuildState()};
   rows.push({operation:request.operation,actual,expected,unchanged:JSON.stringify(before)===JSON.stringify(after),beforeEffects:before.effects,afterEffects:after.effects});
  }
  const abort=new AbortController();abort.abort();const before=__editApiEffects();const actual=VibeMolEdit.applyBuild({...base,...atom},{signal:abort.signal});rows.push({operation:'aborted',actual,expected:'ABORTED',unchanged:JSON.stringify(before)===JSON.stringify(__editApiEffects())});
  return rows;
 }''')
 for row in negative:
  print('[edit-api-rejection] '+json.dumps(row),flush=True)
  compare('atomic-'+row['operation'],dict(code=row['actual']['error']['code'],mutation=row['actual']['mutation']['state'],unchanged=row['unchanged']),dict(code=row['expected'],mutation='none',unchanged=True))
 compare('public-methods',sorted(page.evaluate('()=>Object.keys(VibeMolEdit)')),sorted(['enter','context','resolveSelection','getSelection','setSelection','clearSelection','copySelection','listBuildCatalog','listBuildSites','validateBuild','applyBuild','translate']))
 for selector,code in [({'kind':'labels','labels':['C3']},'ELEMENT_INDEX_OUT_OF_RANGE'),({'kind':'element','element':'O'},'ELEMENT_ABSENT'),({'kind':'ids','ids':['missing']},'ATOM_NOT_FOUND')]:
  row=page.evaluate('q=>VibeMolEdit.resolveSelection(q)',selector);compare(code,dict(ok=row['ok'],code=row['error']['code'],mutation=row['mutation']['state']),dict(ok=False,code=code,mutation='none'))
 row=page.evaluate('()=>{const q=VibeMolEdit.resolveSelection({kind:"labels",labels:["C2"]});const original=VibeMolEdit.setSelection(q.value);const copy=VibeMolEdit.setSelection(JSON.parse(JSON.stringify(q.value)));return {original,copy}}')
 compare('provenance',dict(original=row['original']['value']['indices'],copied=row['copy']['error']['code']),dict(original=[1],copied='RESOLUTION_REQUIRED'))
 row=page.evaluate('()=>{const q=VibeMolEdit.resolveSelection({kind:"all"});const c=VibeMolEdit.copySelection(q.value);const move=VibeMolEdit.translate(q.value,[0.25,-0.5,1]);return {copy:c,move,stale:VibeMolEdit.setSelection(q.value)}}')
 assert row['copy']['ok'] and row['move']['ok'],row;compare('stale-after-translate',row['stale']['error']['code'],'STALE_CONTEXT')
 compare('translation-arithmetic',[[a[k] for k in ('x','y','z')] for a in row['move']['applied']['atoms']],[[.25,-.5,1],[1.75,-.5,1],[-.75,-.5,1]])
 page.evaluate('envelope=>window.__editApiEnvelope=envelope',row['copy']['value'])
 build('insertSelection',envelope=row['copy']['value'],position=[0,2,0],quaternion=[0,0,0,1])
 load(CARBON)
 reserved=page.evaluate('''()=>{const envelope=VibeMolStructure.exportActive();envelope.volume.atoms[0].id='@edit-api-atom:1';envelope.volume.annotations.builder.byAtomId={'@edit-api-atom:1':{groupId:'@edit-api-group:1',entryId:'methyl',entryKind:'fragment'}};envelope.volume.fragmentOps=[{opId:'@edit-api-op:1',timestamp:'@commit',entryId:'methyl',entryKind:'fragment',attachPolicy:'append',builderGroupId:'@edit-api-group:1',addedAtomIds:['@edit-api-atom:1'],transform:{note:'@edit-api-atom:2'},resultingBondOrder:1}];const imported=VibeMolStructure.importFromText(JSON.stringify(envelope),'reserved-id-fixture');return {imported:{name:imported.name,atoms:imported.vol.atoms.length},before:VibeMolStructure.exportActive().volume};}''')
 compare('reserved-source-import',reserved['imported']['atoms'],1)
 result(page,'VibeMolEdit.enter()')
 identity=build('placeAtom',element='O',position=[3,0,0]);compare('existing-reserved-atom-id',identity['applied']['atoms'][0],reserved['before']['atoms'][0]);compare('existing-opaque-operation',identity['applied']['fragmentOps'][0],reserved['before']['fragmentOps'][0]);compare('only-new-identity',dict(created=len(identity['value']['created']),removed=identity['value']['removed']),dict(created=1,removed=[]))
 load(CARBON);build('placeAtom',element='O',position=[3,0,0])
 load(CARBON);build('growAtom',element='N',anchor={'kind':'labels','labels':['C1']},direction=[1,0,0],bondOrder=1,attachPolicy='append')
 load(CARBON);build('attachFragment',entryId='methyl',anchor={'kind':'labels','labels':['C1']},direction=[1,0,0],bondOrder=1,attachPolicy='append',spinAngle=.3)
 load(METHANE);build('replaceHydrogen',element='O',anchor={'kind':'labels','labels':['C1']},hydrogen={'kind':'labels','labels':['H1']},bondOrder=1)
 ready(page,'()=>VibeMolEdit.listBuildCatalog().value.some(e=>e.entryId==="fusionphenyl")');load(XYZ);build('fuseFragment',entryId='fusionphenyl',host={'kind':'labels','labels':['C1','C2']},bondOrder=1,spinAngle=.2)
 load(CARBON);build('placeCatalog',entryKind='molecule',entryId='benzene',position=[4,0,0],quaternion=[0,0,0,1])
 row=page.evaluate('()=>{const before=VibeMolStructure.exportActive();const c=VibeMolEdit.context().value;const request={operation:"placeAtom",system:{systemId:c.systemId,fingerprint:c.fingerprint},element:"H",position:[20,0,0],hydrogens:"preserve",warnings:"allow"};const beforeEffects=__editApiEffects();const validated=VibeMolEdit.validateBuild(request);return {before,after:VibeMolStructure.exportActive(),validated,beforeEffects,afterEffects:__editApiEffects()}}')
 assert row['validated']['ok'],row;compare('validation-no-write',row['after']['volume'],row['before']['volume']);compare('validation-no-effects',row['afterEffects'],row['beforeEffects'])
 row=page.evaluate('()=>{const c=VibeMolEdit.context().value;return VibeMolEdit.listBuildSites({system:{systemId:c.systemId,fingerprint:c.fingerprint},anchor:{kind:"labels",labels:["C1"]},element:"H",bondOrder:1})}');print('[edit-api-sites] '+json.dumps(row),flush=True);assert row['ok'],row
 # Source resolution remains available; structural writes fail before even an
 # invalid operation can partially apply. Compare the complete exported source.
 trajectory='2\nframe0\nC 0 0 0\nH 1 0 0\n2\nframe1\nC .1 0 0\nH 1.1 0 0\n'
 for name,files in [('trajectory',[{'name':'motion.xyz','text':trajectory}]),('vibration',[{'name':'vib.xyz','text':'2\nvib\nC 0 0 0\nH 1 0 0\n'},{'name':'vib.vib.json','text':json.dumps({'kind':'vibemol.vibrations','version':1,'units':'angstrom','atomCount':2,'atomSymbols':['C','H'],'modes':[{'frequencyCm1':245,'irIntensityKmMol':1,'displacements':[-.18,0,0,.18,0,0]}]})}]),('cube',[{'name':'api.cube','text':p.cube(0)}]),('molden',[{'name':'api.molden','text':p.MOLDEN}])]:
  load(files=files)
  row=page.evaluate('()=>{const before=VibeMolStructure.exportActive(),c=VibeMolEdit.context().value;const resolved=VibeMolEdit.resolveSelection({kind:"all"});const rejected=VibeMolEdit.applyBuild({system:{systemId:c.systemId,fingerprint:c.fingerprint},operation:"placeAtom",element:"C",position:[2,0,0],hydrogens:"preserve",warnings:"allow"});return {before,after:VibeMolStructure.exportActive(),resolved,rejected}}')
  compare(name+'-resolution',row['resolved']['ok'],True);compare(name+'-write',dict(code=row['rejected']['error']['code'],mutation=row['rejected']['mutation']['state']),dict(code='SOURCE_NOT_EDITABLE',mutation='none'));compare(name+'-unchanged',row['after']['volume'],row['before']['volume'])
 compare('write-counter-controls',all(v>0 for k,v in page.evaluate('()=>__editApiEffects()').items() if k in ('atom','group','operation','history','apply')),True)
 compare('page-errors',errors,[])


def compatibility(page,url):
 import smoke
 page.goto(url+'?workspaceLab=0&appearanceStudy=1&qa=1');ready(page,'()=>!!(window.VibeMolEdit&&window.VibeMolTesting)');ready(page,'()=>VibeMolEdit.listBuildCatalog().value.some(e=>e.entryId==="fusionphenyl")')
 def load(text):
  compare('wrapper-load',p.load(page,[{'name':'wrapper.xyz','text':text}])['ok'],True)
  result(page,"VibeMolEdit.enter({tool:'build'})");smoke.load_build_query(page,'methyl');settle(page)
 def selection_and_cue():
  result(page,'VibeMolTesting.setEditSelectionIndices([0])');settle(page)
  # #17's existing matrix documents the separate unopened legacy card /
  # utilities overlap. The three-source API probe observes the same rectangle
  # on v0.9.5, main and candidate. Stage a reachable card with shipped keyboard
  # movement before any click; no force, CSS injection or selection recovery.
  grip=page.locator('#editSelectionTranslateCue [data-vm-drag-handle]').first
  grip.press('Alt+Home')
  for _ in range(10):grip.press('Alt+ArrowDown')
  settle(page)
  button=page.locator('#editSelectionAddFragmentCueButton');box=button.bounding_box();assert box,box
  point={'x':box['x']+box['width']/2,'y':box['y']+box['height']/2};page.mouse.move(point['x'],point['y'])
  ready(page,'p=>{const el=document.getElementById("editSelectionAddFragmentCueButton");const hit=document.elementFromPoint(p.x,p.y);return getComputedStyle(el).pointerEvents!=="none"&&(hit===el||el.contains(hit));}',arg=point,site='native-cue-hit',readback='p=>{const e=document.getElementById("editSelectionAddFragmentCueButton"),r=e.getBoundingClientRect(),h=document.elementFromPoint(p.x,p.y);return {eligible:h===e||e.contains(h),pointerEvents:getComputedStyle(e).pointerEvents,hit:h?.id||h?.tagName,bounds:{x:r.x,y:r.y,width:r.width,height:r.height}}}',expected={'eligible':True,'pointerEvents':'auto'})
  hit=page.evaluate('p=>{const el=document.getElementById("editSelectionAddFragmentCueButton"),hit=document.elementFromPoint(p.x,p.y);return {eligible:hit===el||el.contains(hit),pointerEvents:getComputedStyle(el).pointerEvents,hit:hit?.id||hit?.tagName}}',point);print('[edit-api-native-cue-hit] '+json.dumps(hit),flush=True);assert hit['eligible'],hit
  button.click();ready(page,'()=>document.getElementById("editSelectionAddFragmentCueButton").getAttribute("aria-pressed")==="true"');settle(page)
 load(METHANE)
 row=page.evaluate('()=>VibeMolTesting.attachFragmentFromAnchorIndex(0,{x:1.5,y:0,z:0})');print('[edit-api-wrapper] '+json.dumps(row),flush=True)
 compare('attach-wrapper',dict(attached=row.get('attached'),policy=row.get('receipt',{}).get('value',{}).get('policy')),dict(attached=True,policy='replace_h'))
 compare('attach-wrapper-hint','Attached Methyl via Replace H' in page.locator('#hint').inner_text(),True)
 load(METHANE);selection_and_cue()
 index=page.evaluate('()=>VibeMolEdit.listBuildSites({system:((c)=>({systemId:c.systemId,fingerprint:c.fingerprint}))(VibeMolEdit.context().value),anchor:{kind:"labels",labels:["C1"]},element:"H",bondOrder:1}).value.replacements[0].atomId')
 index=page.evaluate('id=>VibeMolEdit.context().value.atoms.find(a=>a.id===id).index',index)
 row=page.evaluate('i=>VibeMolTesting.triggerHaloReplaceTargetByAtomIndex(i)',index);print('[edit-api-wrapper] '+json.dumps(row),flush=True);compare('replace-target-wrapper',row.get('attached'),True)
 load(CARBON);selection_and_cue()
 ghosts=page.evaluate('()=>VibeMolTesting.getHaloGhostWorlds()');assert ghosts,ghosts
 row=page.evaluate('i=>VibeMolTesting.triggerHaloGhostByIndex(i)',ghosts[0]['index']);print('[edit-api-wrapper] '+json.dumps(row),flush=True);compare('ghost-wrapper',row.get('attached'),True)
 compare('ghost-wrapper-hint','Attached Methyl via Append (open site)' in page.locator('#hint').inner_text(),True)
 load(METHANE)
 row=page.evaluate('()=>VibeMolTesting.replaceGestureTerminalHydrogen(0,1,{elementZ:6})');print('[edit-api-wrapper] '+json.dumps(row),flush=True);compare('terminal-wrapper',row.get('attached'),True)
 before=page.evaluate('()=>VibeMolStructure.exportActive().volume')
 bad=page.evaluate('()=>VibeMolTesting.setEditSelectionIndices([0,999])');compare('strict-wrapper-code',bad['error']['code'],'INDEX_OUT_OF_RANGE')
 compare('strict-wrapper-unchanged',page.evaluate('()=>VibeMolStructure.exportActive().volume'),before)


def run_matrix(output):
 output=Path(output);output.mkdir(parents=True,exist_ok=False)
 with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True)
  try:
   for name,phase in [('product',run),('compatibility',compatibility)]:
    context=browser.new_context(viewport={'width':1280,'height':900},device_scale_factor=1)
    try:phase(context.new_page(),url)
    except Exception:
     if context.pages:p.write_failure_artifacts(context.pages[0],output,'edit-api-'+name,[],[])
     raise
    finally:context.close()
    compare('residual-contexts-'+name,len(browser.contexts),0)
  finally:browser.close()
 (output/'summary.json').write_text(json.dumps(dict(passed=True,residualContexts=0)))

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();run_matrix(args.output)
