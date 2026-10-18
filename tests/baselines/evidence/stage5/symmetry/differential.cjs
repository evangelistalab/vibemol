// Compare the actual old/extracted presentation bodies with the real analysis module.
const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const parser=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const out=process.argv[2];assert(out);fs.mkdirSync(out,{recursive:true});
const base='63082febadb22d5351365b8f75267534494893e6',before=cp.execFileSync('git',['show',base+':assets/app/js/app.js'],{encoding:'utf8',maxBuffer:32e6}),moduleSource=fs.readFileSync('assets/app/js/symmetry-panel.js','utf8'),analysisSource=fs.readFileSync('assets/app/js/symmetry.js','utf8');
const plan=JSON.parse(fs.readFileSync('/Users/fevange/Source/vibemol/out/test-artifacts/stage5/symmetry/preflight-next-boundary.json'));
const fns={};traverse(parser.parse(before),{FunctionDeclaration(p){if(plan.functions.includes(p.node.id.name))fns[p.node.id.name]=before.slice(p.node.start,p.node.end);}});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),portable=v=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='number'&&!Number.isFinite(x)?String(x):x));
const observe=`({controller:symmetryController?{tolerance:symmetryController.getTolerance(),analysis:symmetryController.getAnalysis(),preview:symmetryController.getPreview()}:null,preview:symmetryPreviewState,cache:symmetryPopoverAnalysisCache,currentLabel:symmetryPopoverCurrentGroupLabel,timer:symmetryPopoverResultHighlightTimer,elementsKey:symmetryPopoverElementsRenderKey,selectedId:symmetryPopoverSelectedElementId})`;
function make(label,workspace,targetKind,missing){
 const events=[],timers=new Map(),els={},ctx={window:{},document:{activeElement:null},clearTimeout:id=>{events.push(['clearTimeout',id]);timers.delete(id);}};
 let serial=0,edit=true,api,target;
 const domNames=[...new Set([...before.matchAll(/els\.(edit(?:AdaptiveSymmetryPopover|Symmetry\w+)El)/g)].map(x=>x[1]))];
 for(const name of domNames){
  const attrs={'aria-hidden':'true'},classes=new Set();
  els[name]={dataset:{},value:'',innerHTML:'',textContent:'',disabled:false,
   setAttribute(k,v){attrs[k]=v;events.push(['attribute',name,k,v]);},getAttribute:k=>attrs[k]??null,
   classList:{add(c){classes.add(c);events.push(['classAdd',name,c]);},remove(c){classes.delete(c);events.push(['classRemove',name,c]);}},
   __read:()=>({attrs,classes:[...classes].sort()})};
 }
 // Some original optional nodes really can be absent; never fabricate readiness.
 if(missing)for(const n of ['editSymmetryExactResultCardEl','editSymmetryToleranceSelectEl','editSymmetryElementSelectEl'])els[n]=null;
 const atomsByKind={
  methane:[{Z:6,x:0,y:0,z:0},{Z:1,x:0.67,y:0.65,z:0.62},{Z:1,x:-0.6,y:-0.63,z:0.66},{Z:1,x:-0.62,y:0.67,z:-0.65},{Z:1,x:0.64,y:-0.62,z:-0.63}],
  water:[{Z:8,x:0,y:0,z:0},{Z:1,x:0.95,y:0,z:0},{Z:1,x:-0.24,y:0.92,z:0}],
  linear:[{Z:8,x:-1.1,y:0,z:0},{Z:6,x:0,y:0,z:0},{Z:8,x:1.1,y:0,z:0}],
  empty:[],
 };
 const atoms=atomsByKind[targetKind].map((a,i)=>({...a,id:'atom-'+i})),vol={atoms},record={name:'fixture',vol};
 target=atoms.length?{record,vol,indices:atoms.map((_,i)=>i),atoms,scopeLabel:`Whole structure (${atoms.length} atoms)`}:null;
 ctx.window.setTimeout=(cb,ms)=>{const id=++serial;timers.set(id,cb);events.push(['setTimeout',id,ms]);return id;};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/app/js/element-utils.js','utf8'),ctx);vm.runInContext(fs.readFileSync('assets/app/js/edit-utils.js','utf8'),ctx);vm.runInContext(analysisSource,ctx);const Symmetry=ctx.window.VibeMolSymmetry;
 const deps={els,Symmetry,resolveEditSymmetryTarget:()=>target,resolveVolumeAtomId:(v,a)=>a?.id||'',workspaceEnabled:workspace,isEditMode:()=>edit,
  clearSymmetryElementGuide:()=>events.push(['clearGuide']),
  renderSymmetryElementGuide:(a,t,...id)=>events.push(['guide',a?.exactGroupId??null,t?.indices??null,id.length?id[0]:api.__observe().selectedId]),
  positionSymmetryPopover:()=>events.push(['position']),updateEditAdaptiveMenuUi:()=>events.push(['menu']),setHintMessage:s=>events.push(['hint',s])};
 Object.assign(ctx,deps,{workspaceEnabled:workspace,MODES:{EDIT:'edit'},currentMode:'edit'},Symmetry);
 if(label==='original'){
  const constants=plan.constants.map(n=>before.match(new RegExp('^  const '+n+' = .+;$','m'))[0]).join('\n');
  const states=plan.states.map(n=>before.match(new RegExp('^  let '+n+' = .+;$','m'))[0]).join('\n');
  api=vm.runInContext(`(()=>{${constants}\n${states}\n${Object.values(fns).join('\n')}\nreturn {${plan.functions.join(',')},initializeAnalysisController(){symmetryController=createEditSymmetryController({toleranceAng:DEFAULT_SYMMETRY_TOLERANCE_ANG});},getAnalysisController(){return symmetryController;},getPreviewState(){return symmetryPreviewState;},setPreviewState(value){symmetryPreviewState=value;},getSelectedElementId(){return symmetryPopoverSelectedElementId;},setSelectedElementId(value){symmetryPopoverSelectedElementId=value;},setCurrentGroupLabel(value){symmetryPopoverCurrentGroupLabel=value;},__observe(){return ${observe};}};})()`,ctx);
 }else{
  const marker='    return Object.freeze({\n';assert.equal(moduleSource.split(marker).length,2);
  vm.runInContext(moduleSource.replace(marker,marker+`      __observe() { return ${observe}; },\n`),ctx);
  api=ctx.window.VibeMolSymmetryPanel.createSymmetryPanelController(deps);
 }
 assert.deepEqual(events,[],'Inert creation must call no dependency');
 return {api,els,events,timers,ctx,get target(){return target;},set target(t){target=t;},setEdit(value){edit=value;ctx.currentMode=value?'edit':'display';},snapshot(){return portable({state:api.__observe(),dom:Object.fromEntries(Object.entries(els).map(([n,e])=>[n,e?{...e,dataset:{...e.dataset},nodeState:e.__read()}:null])),events,pendingTimers:[...timers.keys()]});},flush(){for(const [id,fn] of [...timers]){timers.delete(id);fn();}}};
}
const records=[];let checkpoints=0,scenarios=0;
function compare(a,b,label,fn){
 const ar=fn(a),br=fn(b);const actual=portable({result:ar,snapshot:a.snapshot()}),expected=portable({result:br,snapshot:b.snapshot()});
 try{assert.deepEqual(actual,expected);}catch(error){fs.writeFileSync(out+'/failed-comparands.json',JSON.stringify({label,actual,expected},null,2));throw error;}
 checkpoints++;records.push({label,sha256:hash(JSON.stringify(actual))});return ar;
}
for(const workspace of [false,true])for(const targetKind of ['methane','water','linear','empty'])for(const missing of [false,true]){
 scenarios++;const a=make('original',workspace,targetKind,missing),b=make('extracted',workspace,targetKind,missing),prefix=`${workspace?'workbench':'legacy'}/${targetKind}/${missing?'optional-absent':'all-controls'}`;
 const step=(label,fn)=>compare(a,b,prefix+'/'+label,fn);
 step('inert-before-analysis-initialization',x=>x.api.getAnalysisController());
 step('fallback-analysis-before-child-initialization',x=>x.api.getSymmetryPopoverAnalysis(x.target));
 step('initialize-child-at-original-point',x=>x.api.initializeAnalysisController());
 step('closed-panel',x=>x.api.renderSymmetryPopover());
 step('open-panel',x=>{x.els.editAdaptiveSymmetryPopoverEl.setAttribute('aria-hidden','false');return x.api.renderSymmetryPopover();});
 for(const value of [0,NaN,-1,0.05,0.075,0.1,0.2,0.25,0.5,1,4,'0.100','invalid'])step('tolerance-'+String(value),x=>x.api.setSymmetryTolerance(value));
 step('stable-cache-identity',x=>x.api.getSymmetryPopoverAnalysis(x.target)===x.api.getSymmetryPopoverAnalysis(x.target));
 step('invalid-preview',x=>x.api.previewSymmetryCandidate('unknown-group'));
 step('preview-first-candidate',x=>{const a=x.api.getSymmetryPopoverAnalysis(x.target),candidate=x.api.getSymmetryPopoverCandidateList(a)[0];return candidate?x.api.previewSymmetryCandidate(candidate.groupId):false;});
 step('selected-analysis-and-candidate',x=>{const a=x.api.getSymmetryPopoverAnalysis(x.target);return [x.api.getSymmetryPopoverSelectedGroupId(),x.api.getSymmetryPopoverSelectedCandidate(a),x.api.getSymmetryElementDisplayAnalysis(a)];});
 step('element-selection-and-guide',x=>{const analysis=x.api.getSymmetryPopoverAnalysis(x.target),elements=x.api.renderSymmetryElementOptions(analysis);x.api.setSelectedElementId(elements[0]?.id||'');x.api.renderSymmetryPopover();return x.api.getSelectedElementId();});
 step('stale-element-cleared',x=>{x.api.setSelectedElementId('missing-element');x.api.renderSymmetryPopover();return x.api.getSelectedElementId();});
 step('focus-preserves-tolerance-input',x=>{x.ctx.document.activeElement=x.els.editSymmetryToleranceSelectEl;x.api.syncSymmetryToleranceUi();});
 step('highlight-change',x=>{x.api.updateSymmetryCurrentGroupUi('C1');x.api.updateSymmetryCurrentGroupUi('Td');x.api.updateSymmetryCurrentGroupUi('Oh');});
 step('flush-highlight-timers',x=>x.flush());
 step('cancel-preview',x=>x.api.cancelSymmetryPreview());
 step('second-cancel-idle',x=>x.api.cancelSymmetryPreview());
 step('geometry-invalidates-cache-key',x=>{if(x.target)x.target.atoms[0].x+=0.1;const old=x.api.__observe().cache?.key;x.api.renderSymmetryPopover();return old!==x.api.__observe().cache?.key;});
 step('no-target-render',x=>{x.target=null;x.api.renderSymmetryPopover();});
 step('non-edit-render-inert',x=>{x.setEdit(false);return x.api.renderSymmetryPopover();});
 for(const options of [{},{keepPopover:true},{quiet:true},{restore:false,keepPopover:true,quiet:true}])step('clear-'+JSON.stringify(options),x=>x.api.clearSymmetryPreview(options));
 step('hide-options-overload',x=>x.api.hideSymmetryPopover({restore:false,quiet:true}));
 step('hide-delay-retains-original-immediate-behavior',x=>x.api.hideSymmetryPopover(100,{quiet:false}));
 step('format-and-list-edge-values',x=>[x.api.getSymmetryTargetKey(null),x.api.buildSymmetryAnalysisCacheKey(null,0),x.api.findInternalSymmetryCandidate(null,'C1'),x.api.getSymmetryPopoverCandidateList({}),x.api.formatSymmetryResidual(NaN),x.api.formatSymmetryResidual(0.12349),x.api.buildSymmetryElementOptionHtml({id:'axis',label:'C2'})]);
}
const report={status:'passed',base,scenarios,checkpoints,allComparandsExact:true,realAnalysisModule:true,constructorDependencyCalls:0,inMemoryObservationOnly:true,productionSourceModified:false,oldAppSha256:hash(before),moduleSha256:hash(moduleSource),analysisSha256:hash(analysisSource),records};
fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,records:undefined},null,2));
