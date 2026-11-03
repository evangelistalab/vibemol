"""Standing published-source write traps, run serially within the Figure suite."""
import json,sys,hashlib,os,argparse,subprocess,importlib.metadata
import playwright
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tests/e2e'))
import premerge as p
from surface_shadows import settle
OUT=None
COUNTS={}
INIT=Path(__file__).with_suffix('.js').read_text()
TRJ=''.join(f'2\nframe {i}\nC {-0.7+i*.1} 0 0\nC {0.7+i*.1} 0 0\n' for i in range(4))
XYZ='2\nvibration\nC -0.7 0 0\nC 0.7 0 0\n'
VIB=json.dumps({'kind':'vibemol.vibrations','version':1,'units':'angstrom','atomCount':2,'atomSymbols':['C','C'],'modes':[{'frequencyCm1':245,'displacements':[-.18,0,0,.18,0,0]}]})
lines=p.cube(0).splitlines();values=[float(v) for v in lines[-1].split()];SPIN='\n'.join(lines[:-1]+[' '.join(str(v*scale) for scale in (1,2,.5,.25) for v in values)])+'\n'
def checkpoint(page,case,stage):
 COUNTS['scientific-buffer-'+case]=COUNTS.get('scientific-buffer-'+case,0)+1
 r=page.evaluate('stage=>__scientificAliasProbe.checkpoint(stage)',stage);(OUT/(case+'-'+stage+'.json')).write_text(json.dumps(r,indent=2));print('[scientific-buffer-'+case+'] '+json.dumps({'case':case,'stage':stage,'arrays':len(r['arrays']),'sourceChanges':r['sourceChanges'],'expectedSourceChanges':[],'expectedViolations':[],'derivedChangedIds':[a['id'] for a in r['derivedChanges']],'workerMessages':len(r['workerMessages'])}),flush=True);assert r['livePublication'] and all(x['privateView'] for x in r['livePublication']),r['livePublication'];assert not r['sourceChanges'],r['sourceChanges'];assert not r['violations'],r['violations'];assert not any(m['transferredSourceIds'] for m in r['workerMessages']);return r

def settings(page,values):
 r=page.evaluate('values=>{const result=VibeMolPreset.import({kind:"vibemol.preset",presetVersion:1,settings:values},{mode:"strict"});const settings=VibeMolPreset.export().settings;return {result,actual:Object.fromEntries(Object.keys(values).map(k=>[k,settings[k]])),expected:values}}',values);print('[settings] '+json.dumps(r),flush=True);assert r['actual']==r['expected'],r;settle(page)

def ownership(page,case,kind):
 rows=page.evaluate('kind=>__scientificAliasProbe.checkOwnership(__scientificAliasProbe.publishedSource(kind),kind)',kind)
 folder=OUT/'ownership';folder.mkdir(exist_ok=True)
 (folder/(case+'-'+kind+'.json')).write_text(json.dumps(rows,indent=2))
 COUNTS['published-ownership']=COUNTS.get('published-ownership',0)+1
 print('[published-ownership] '+json.dumps({'case':case,'kind':kind,'controls':rows}),flush=True)
 assert rows and all(x['passed'] and x['actual']==x['expected'] for x in rows),rows
 return rows

def run(page,url,case):
 owned={}
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(INIT);page.goto(url+'?appearanceStudy=1&qa=1'+('&aliasWorker=1' if case=='worker' else ''));page.wait_for_function('()=>window.VibeMolSession&&window.VibeMolFigure&&window.VibeMolEmbed')
 assert p.load(page,[{'name':'a.cube','text':p.cube(-.4)},{'name':'b.cube','text':p.cube(.4)}])['ok'];owned['cube']=ownership(page,case,'cube');settings(page,{'surface.autoIsoEnabled':True});settle(page);checkpoint(page,case,'cube-surface-autoiso')
 # Exercise the worker branch deliberately on a real >1000-sample source; the
 # diagnostic factory option lowers only its routing threshold, not any gate.
 auto=page.evaluate('''async()=>{const n=11,header=['Alias worker fixture','Gaussian','1 -5 -5 -5','11 1 0 0','11 0 1 0','11 0 0 1','1 1 0 0 0'];const values=[];for(let i=0;i<n;i++)for(let j=0;j<n;j++)for(let k=0;k<n;k++)values.push(Math.exp(-.5*((i-5)**2+(j-5)**2+(k-5)**2)));const vol=VibeMolParsers.parseCube(header.concat([values.join(' ')]).join('\\n'));const c=__scientificAliasProbe.controllers.VibeMolAutoIso;const worker=c.shouldUseAutoIsoWorker(vol);const value=await c.estimateAutoIsoValueAsync(vol,'alphaRe',.85,1);const spin=VibeMolParsers.parseTwoComponentCube(header.concat([Array.from({length:4},(_,j)=>values.map(v=>v*(j+1)).join(' ')).join(' ')]).join('\\n'));const phase=await c.estimateAutoIsoValueAsync(spin,'alphaBetaPhase',.85,1);return {worker,value,phase}}''');print('[autoiso-route] '+json.dumps(auto),flush=True);assert auto['worker']==(case=='worker'),auto;assert auto['value']['value']>0;assert auto['value']['source']==('worker' if case=='worker' else 'sync');assert auto['phase']['value']>0;assert auto['phase']['source']==auto['value']['source'];checkpoint(page,case,'autoiso-explicit-route')
 settings(page,{'render.mode':'cloud','render.cloudType':'points'});checkpoint(page,case,'cube-cloud-points')
 settings(page,{'render.cloudType':'cubes'});checkpoint(page,case,'cube-cloud-cubes')
 r=page.evaluate('''async()=>{const vol=__scientificAliasProbe.source('cube');const operand={label:'source',coefficient:1,vol};const result=[];for(const worker of [true,false]){const runner=VibeMolArithmeticRunner.createArithmeticRunner(worker?{}:{createWorker:()=>null});const r=await runner.compute('linear_combination',[operand,operand],'audit');result.push({worker,ok:r.ok,sameBuffer:r.data.buffer===vol.data.buffer,length:r.data.length});}return result;}''');print('[arithmetic] '+json.dumps(r),flush=True);assert all(x['ok'] and not x['sameBuffer'] for x in r);checkpoint(page,case,'arithmetic-both-routes')
 settings(page,{'render.mode':'surface'});r=page.evaluate('''async()=>{const targets=VibeMolFigure.listTargets();const image=await VibeMolFigure.compose({targetIds:targets.map(t=>t.id),width:320,camera:'fit',sharedIso:false});return {type:image.type,bytes:image.size,targets:targets.length}}''');print('[figure] '+json.dumps(r),flush=True);assert r['bytes']>0;checkpoint(page,case,'cube-figure')
 assert p.load(page,[{'name':'spin.2ccube','text':SPIN}])['ok']
 owned['spin']=ownership(page,case,'spin')
 for mode in ('alphaRe','alphaBetaPhase'):
  settings(page,{'twoComponent.mode':mode,'render.mode':'surface'});checkpoint(page,case,'spin-'+mode+'-surface');settings(page,{'render.mode':'cloud','render.cloudType':'points'});checkpoint(page,case,'spin-'+mode+'-cloud')
 assert p.load(page,[{'name':'model.molden','text':p.MOLDEN}])['ok'];owned['molden']=ownership(page,case,'molden');settings(page,{'render.mode':'surface','surface.autoIsoEnabled':False,'surface.iso':.03});checkpoint(page,case,'molden-surface');page.evaluate('''async()=>VibeMolFigure.compose({width:320,camera:'fit',sharedIso:true,iso:.03})''');checkpoint(page,case,'molden-figure-all-orbitals')
 assert p.load(page,[{'name':'motion.xyz','text':TRJ}])['ok'];owned['trajectory']=ownership(page,case,'trajectory');r=page.evaluate('''()=>{const c=__scientificAliasProbe.controllers.VibeMolTrajectoryPlayback;const info=c.getActiveTrajectoryInfo();c.applyTrajectoryFrameForInfo(info,3);c.applyTrajectoryFrameForInfo(info,1);return {enabled:info.enabled,frames:info.frameCount,index:info.traj.frameIndex}}''');print('[trajectory] '+json.dumps(r),flush=True);assert r['frames']==4 and r['index']==1;checkpoint(page,case,'trajectory')
 assert p.load(page,[{'name':'vib.xyz','text':XYZ},{'name':'vib.vib.json','text':VIB}])['ok'];owned['vibration']=ownership(page,case,'vibration');r=page.evaluate('''()=>{const c=__scientificAliasProbe.controllers.VibeMolVibration;for(const phase of [.5,1,2])c.applyActiveVibrationPhase(phase);const info=c.getActiveVibrationInfo();return {enabled:info.enabled,equilibriumIsFrameBuffer:info.vib.equilibrium.buffer===info.vib.frameBuffer.buffer}}''');print('[vibration] '+json.dumps(r),flush=True);assert r['enabled'] and not r['equilibriumIsFrameBuffer'];checkpoint(page,case,'vibration')
 # The supported public export is encoded/copied. Exercise export/import without
 # exposing the app's private live buffers to the host.
 text=page.evaluate('()=>VibeMolSession.exportText()');assert page.evaluate('text=>VibeMolSession.importText(text)',text)['ok'];checkpoint(page,case,'session-roundtrip')
 exported=page.evaluate('()=>VibeMolStructure.exportActive()');assert exported['volume'];checkpoint(page,case,'structure-export')
 assert not errors,errors
 controls=page.evaluate('()=>({guards:__scientificAliasProbe.controls,detach:__scientificAliasProbe.detachControl})');print('[probe-controls] '+json.dumps(controls),flush=True);assert all(x['blocked'] and x['sourceUnchanged'] for x in controls['guards']);result=checkpoint(page,case,'final');result['ownershipControls']=owned;return result


def coordinate_owners(page,url):
 case='coordinate-owners';owned={};errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(INIT);page.goto(url+'?workspaceLab=0&appearanceStudy=1&qa=1');page.wait_for_function('()=>window.VibeMolSession&&window.VibeMolEmbed')
 def mode_edit():
  page.locator('#modeEditBtn').evaluate('el=>el.click()');settle(page)
  if page.locator('#editAdaptiveAddAtomPopover').get_attribute('aria-hidden')=='false':
   page.locator('#editAdaptiveAddAtomPopover [data-vm-drag-handle]').focus();page.keyboard.press('/');settle(page)
   hidden=page.locator('#editAdaptiveAddAtomPopover').get_attribute('aria-hidden');print('[close-build-precondition] '+json.dumps({'actual':hidden,'expected':'true'}),flush=True);assert hidden=='true'
  if not page.locator('#coordsPanel').is_visible():page.locator('#canvas').focus();page.keyboard.press('c')
 def edit(row,key,value):
  hit=page.evaluate('''({row,key})=>{const cell=document.querySelector(`#coordsContent [data-atom-index="${row}"] [data-edit-field="${key}"]`);const r=cell.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {cell:{x:r.x,y:r.y,width:r.width,height:r.height},target:target?.outerHTML.slice(0,300),eligible:target===cell||cell.contains(target),buildHidden:document.getElementById('editAdaptiveAddAtomPopover').getAttribute('aria-hidden')}}''',{'row':row,'key':key});print('[coordinate-hit] '+json.dumps(hit),flush=True);assert hit['eligible'],hit
  page.locator(f'#coordsContent [data-atom-index="{row}"] [data-edit-field="{key}"]').click();editor=page.locator('#coordsContent .coordsCellEditor');editor.fill(str(value));editor.press('Enter');settle(page)
 assert p.load(page,[{'name':'owner.xyz','text':TRJ}])['ok'];owned['trajectory']=ownership(page,case,'trajectory');mode_edit();checkpoint(page,case,'trajectory-before-edit');page.evaluate("()=>__scientificAliasProbe.oldFrame=__scientificAliasProbe.source('trajectory').trajectory.frames[0]");edit(0,'x',-.25)
 r=page.evaluate("()=>{const vol=__scientificAliasProbe.source('trajectory');return {replaced:vol.trajectory.frames[0]!==__scientificAliasProbe.oldFrame,value:vol.trajectory.frames[0][0],oldValue:__scientificAliasProbe.oldFrame[0]}}");print('[owner-edit] '+json.dumps(r),flush=True);assert r=={'replaced':True,'value':-.25,'oldValue':-0.699999988079071};checkpoint(page,case,'trajectory-coordinate-rebind')
 page.evaluate("()=>__scientificAliasProbe.beforeOrder=__scientificAliasProbe.source('trajectory').trajectory.frames.slice()");edit(1,'order',1)
 r=page.evaluate("()=>{const frames=__scientificAliasProbe.source('trajectory').trajectory.frames,old=__scientificAliasProbe.beforeOrder;return {allReplaced:frames.every((f,i)=>f.buffer!==old[i].buffer),exactPermutation:frames.every((f,i)=>Array.from(f).every((v,j)=>v===old[i][j<3?j+3:j-3]))}}");print('[owner-permutation] '+json.dumps(r),flush=True);assert r=={'allReplaced':True,'exactPermutation':True};checkpoint(page,case,'trajectory-order-rebind')
 assert p.load(page,[{'name':'vib.xyz','text':XYZ},{'name':'vib.vib.json','text':VIB}])['ok'];owned['vibration']=ownership(page,case,'vibration');mode_edit();checkpoint(page,case,'vibration-before-edit');page.evaluate("()=>__scientificAliasProbe.oldEq=__scientificAliasProbe.source('vibration').vibration.equilibrium");edit(0,'x',-.25)
 r=page.evaluate("()=>{const vib=__scientificAliasProbe.source('vibration').vibration;return {replaced:vib.equilibrium!==__scientificAliasProbe.oldEq,value:vib.equilibrium[0],oldValue:__scientificAliasProbe.oldEq[0],separateScratch:vib.frameBuffer.buffer!==vib.equilibrium.buffer}}");print('[owner-equilibrium] '+json.dumps(r),flush=True);assert r=={'replaced':True,'value':-.25,'oldValue':-0.699999988079071,'separateScratch':True};checkpoint(page,case,'vibration-coordinate-rebind')
 # Deliberate owner metadata writes are separate from coefficient-buffer writes.
 molden='\n'.join(['[Molden Format]','[Atoms] Angs','H 1 1 -.4 0 0','H 2 1 .4 0 0','[GTO]','1 0','s 1 1.0','1.0 1.0','','2 0','s 1 1.0','1.0 1.0','','[MO]','Sym=1','Ene=-.5','Spin=Alpha','Occup=2','1 .7','2 .7','Sym=2','Ene=.1','Spin=Alpha','Occup=0','1 .7','2 -.7'])
 assert p.load(page,[{'name':'owner.molden','text':molden}])['ok'];owned['molden']=ownership(page,case,'molden');mode_edit();checkpoint(page,case,'molden-before-order');page.evaluate("()=>__scientificAliasProbe.oldCoeffs=__scientificAliasProbe.source('molden').molden.mos.map(m=>m.coefficients)");edit(1,'order',1)
 r=page.evaluate("()=>{const m=__scientificAliasProbe.source('molden').molden;return {basisIndices:m.basis.atomBlocks.map(b=>b.atomIndex),sameCoefficientBuffers:m.mos.every((mo,i)=>mo.coefficients===__scientificAliasProbe.oldCoeffs[i])}}");print('[owner-basis] '+json.dumps(r),flush=True);assert r=={'basisIndices':[1,0],'sameCoefficientBuffers':True};checkpoint(page,case,'molden-metadata-only');assert not errors,errors;result=checkpoint(page,case,'final');result['ownershipControls']=owned;return result

def validate_ownership(groups,expected_kinds):
 assert set(groups)==expected_kinds,{'actual':list(groups),'expected':sorted(expected_kinds)}
 for kind,rows in groups.items():
  assert rows,kind
  for row in rows:
   expected={'privateView':True,'indexBlocked':True,'copyIsolated':True,'bufferCopyIsolated':None if row['type']=='Array' else True,'sourceUnchanged':True,'reportedWrites':1}
   assert row['passed'] and row['actual']==row['expected']==expected and row['before']==row['after'],row

def validate_results(results):
 assert len(results)==3,{'cases':len(results),'expected':3}
 for index,result in enumerate(results):
  validate_ownership(result['ownershipControls'],{'cube','spin','molden','trajectory','vibration'} if index<2 else {'molden','trajectory','vibration'})
  assert result['stage']=='final',result['stage']
  assert result['guardedCalls']>0,result['guardedCalls']
  assert result['livePublication'] and all(x['privateView'] for x in result['livePublication']),result['livePublication']
  assert result['arrays'] and any('source' in a['kinds'] for a in result['arrays'])
  assert not result['sourceChanges'],result['sourceChanges']
  assert not result['violations'],result['violations']
  assert not result['bufferAccesses'],result['bufferAccesses']
  assert not any(m['transferredSourceIds'] for m in result['workerMessages'])
  assert any('frameBuffer' in label for a in result['derivedChanges'] for label in a['labels']),result['derivedChanges']
 # The routing case must really reach both workers, not silently exercise sync.
 assert {m['kind'] for m in results[1]['workerMessages']}=={'autoiso','arithmetic'},results[1]['workerMessages']

def validate_controls(controls):
 assert [x['name'] for x in controls['guards']]==['index','set','subarray','callback-array'],controls
 assert all(x['blocked'] and x['sourceUnchanged'] for x in controls['guards']),controls
 assert controls['detach']['readThrows'] and controls['detach']['methodWriteThrows'] and controls['detach']['transferredOwnerUnchanged'],controls

def run_matrix(output,owners_only=False):
 global OUT,COUNTS
 COUNTS={key:0 for key in ('scientific-buffer-synchronous','scientific-buffer-worker','scientific-buffer-coordinate-owners','published-ownership')}
 OUT=Path(output).resolve();OUT.mkdir(parents=True,exist_ok=False)
 results=[]
 with p.run_http_server(ROOT) as url,p.sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True)
  try:
   from pinned_figure_browser import resolve_pinned_headless_browser
   executable=resolve_pinned_headless_browser(pw.chromium.executable_path,browser.version,Path(playwright.__file__).parent/'driver/package/browsers.json')
   lock=(ROOT/'api/requirements-ci.lock').read_text();expected=next(l.split('==',1)[1] for l in lock.splitlines() if l.startswith('playwright=='));assert importlib.metadata.version('playwright')==expected
   environment={'playwright':expected,'browser':browser.version,'executable':executable,'viewport':{'width':1280,'height':900},'deviceScaleFactor':1,'python':sys.version,'lockSha256':hashlib.sha256(lock.encode()).hexdigest()}
   (OUT/'environment.json').write_text(json.dumps(environment,indent=2))
   for case in (() if owners_only else ('synchronous','worker')):
    context=browser.new_context(viewport={'width':1280,'height':900},device_scale_factor=1)
    try:
     page=context.new_page();results.append(run(page,url,case));validate_controls(page.evaluate('()=>({guards:__scientificAliasProbe.controls,detach:__scientificAliasProbe.detachControl})'))
    except Exception:
     page=context.pages[0];p.write_failure_artifacts(page,OUT,case,[],[]);raise
    finally:context.close()
    assert len(browser.contexts)==0
   context=browser.new_context(viewport={'width':1280,'height':900},device_scale_factor=1)
   try:
    page=context.new_page();results.append(coordinate_owners(page,url));validate_controls(page.evaluate('()=>({guards:__scientificAliasProbe.controls,detach:__scientificAliasProbe.detachControl})'))
   except Exception:
    page=context.pages[0];p.write_failure_artifacts(page,OUT,'coordinate-owners',[],[]);raise
   finally:context.close()
   assert len(browser.contexts)==0
  finally:browser.close()
 if not owners_only:
  validate_results(results)
  from checkpoint_contract import require_phase_counts
  require_phase_counts(COUNTS,'tests/e2e/figure.py',*COUNTS)
 summary={'checkpointCounts':dict(COUNTS),'standingCheck':not owners_only,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'appSha256':hashlib.sha256((ROOT/'assets/app/js/app.js').read_bytes()).hexdigest(),'probeSha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (Path(__file__).resolve(),Path(__file__).with_suffix('.js').resolve())},'cases':results,'residualContexts':0}
 (OUT/'summary.json').write_text(json.dumps(summary,indent=2))
 print('[scientific-buffers] '+json.dumps({'standingCheck':not owners_only,'cases':len(results),'sourceChanges':0,'writeViolations':0,'sourceTransfers':0,'residualContexts':0}),flush=True)
 return summary

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--owners-only',action='store_true');args=parser.parse_args()
 run_matrix(args.output,args.owners_only)
if __name__=='__main__':main()
