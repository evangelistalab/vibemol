// Independent inverse audit: never imports the converter or its edit list.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const parser=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const out=process.argv[2];assert(out);fs.mkdirSync(out,{recursive:true});
const base='7f9f9f9d01b3ec56e339b9bb4221db7e819338d1',app='assets/app/js/app.js',mod='assets/app/js/vibration.js';
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});
const old=p=>git('show',base+':'+p),read=p=>fs.readFileSync(p,'utf8'),parse=s=>parser.parse(s),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const names=['getActiveVibrationInfo','formatVibrationFrequencyCell','formatVibrationIntensityCell','getVibrationModeIrIntensity','collectVisibleVibrationSpectrumPeaks','renderVibrationSpectrum','shouldHideVibrationMode','getVisibleVibrationModeIndices','renderVibrationModeTable','syncVibrationControls','scheduleVibrationPanelLayoutSync','restoreActiveVibrationEquilibrium','applyActiveVibrationPhase','updateVibrationPlayback'];
const deps=['els','getActiveRecord','snapshotAtomCoordinates','applyAtomCoordinateFrame','markSessionChanged','isEditMode','UI_PALETTE','escapeHtml','getVideoController','setTooltipText','setMotionPanelButtonGlyph','setVibrationPanelOpen','updateDisplayWindowAdaptiveMenuUi'];
const states=['vibrationPlaying','vibrationLastStepMs','vibrationHideSmallFrequencies','vibrationPanelLayoutRaf'];
const constants=['VIBRATION_KIND','VIBRATION_DEFAULT_AMPLITUDE','VIBRATION_DEFAULT_SPEED','VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1','VIBRATION_IR_MIN_FREQ_CM1','VIBRATION_IR_DEFAULT_SIGMA_CM1','CM_INV_TEXT','CM_INV_HTML'];
const dom=['vibrationPanel','vibrationPanelBtn','vibrationRow','vibrationRow2','vibrationSpectrumWrap','vibrationSpectrumCanvas','vibrationSpectrumMeta','vibrationModeTableWrap','vibrationModeTable','vibrationModeTableBody','vibrationModeEmpty','vibrationNowPlaying','vibrationModeLabel','vibrationPlayBtn','vibrationFreqLabel','vibrationAmplitudeEl','vibrationSpeedEl'];
const before=old(app),after=read(app),moduleSource=read(mod),b=parse(before),a=parse(after),m=parse(moduleSource);
function clean(n){if(Array.isArray(n))return n.map(clean);if(!n||typeof n!=='object')return n;return Object.fromEntries(Object.entries(n).filter(([k])=>!['start','end','loc','range','extra','leadingComments','trailingComments','innerComments','comments','tokens'].includes(k)).map(([k,v])=>[k,clean(v)]));}
const checks=[];
function firstDiff(a,b,p=''){if(Object.is(a,b))return null;if(!a||!b||typeof a!=='object'||typeof b!=='object')return {path:p,a,b};if(Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return {path:p,prototype:true};const ak=Reflect.ownKeys(a),bk=Reflect.ownKeys(b);if(!isDeepStrictEqual([...ak].sort(),[...bk].sort()))return {path:p,ak,bk};for(const k of ak){const d=firstDiff(a[k],b[k],p+'/'+String(k));if(d)return d;}return null;}
function check(label,actual,expected){const passed=isDeepStrictEqual(actual,expected);checks.push({label,passed,actual:typeof actual==='object'?hash(JSON.stringify(actual)):actual,expected:typeof expected==='object'?hash(JSON.stringify(expected)):expected});if(!passed){fs.writeFileSync(out+'/failed-comparands.json',JSON.stringify({label,actual,expected},null,2));console.error(require('node:util').inspect(firstDiff(actual,expected),{depth:5}));throw new Error(label+'; full actual/expected saved to '+out+'/failed-comparands.json');}}
const fns=ast=>{const out={};traverse(ast,{FunctionDeclaration(p){(out[p.node.id.name]??=[]).push(p);}});return out;};
const bf=fns(b),af=fns(a),mf=fns(m);
const beforeScope=bf.getActiveVibrationInfo[0].scope.parent,afterScope=af.getActiveVibrationInfo[0].scope.parent;
for(const name of dom){
 const original=beforeScope.bindings[name].path.node,current=afterScope.bindings[name].path.node;
 check('one canonical DOM query kept at original binding '+name,clean(current.init.right),clean(original.init));
 check('plain els field retains original query '+name,clean(current.init.left),{type:'MemberExpression',object:{type:'Identifier',name:'els'},property:{type:'Identifier',name},computed:false});
}
for(const name of names){
 let lexical=true;
 bf[name][0].traverse({ReferencedIdentifier(p){if(dom.includes(p.node.name)||states.includes(p.node.name))lexical=lexical&&p.scope.getBinding(p.node.name)===beforeScope.bindings[p.node.name];}});
 check('DOM/state rewrites resolve only original app lexical bindings '+name,lexical,true);
}
const body=ast=>ast.program.body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression').expression.callee.body.body;
const br=body(b),ar=body(a),declNames=n=>n.type==='VariableDeclaration'?n.declarations.flatMap(d=>d.id.type==='Identifier'?[d.id.name]:d.id.type==='ObjectPattern'?d.id.properties.map(p=>p.value?.name||p.argument?.name):[]):[];
const originalStates=br.filter(n=>declNames(n).some(x=>states.includes(x))),originalConstants=br.filter(n=>declNames(n).some(x=>constants.includes(x)));
check('four private state declarations',originalStates.length,4);check('eight immutable constants',originalConstants.length,8);
let cancel;
traverse(b,{IfStatement(p){if(p.node.test.type==='Identifier'&&p.node.test.name==='vibrationPanelLayoutRaf'&&p.getFunctionParent()?.node.id?.name==='setVibrationPanelOpen')cancel=p.node;}});
assert(cancel,'original host layout cancellation');
const expression=s=>clean(parse(s).program.body[0].expression),identifier=name=>({type:'Identifier',name});
const controllerCall=n=>n?.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.object.name==='vibrationRuntimeController';
const OMIT=Symbol('removed introduced statement');
function inverse(n){
 if(Array.isArray(n))return n.flatMap(x=>{const v=inverse(x);return v===OMIT?[]:Array.isArray(v)?v:[v];});
 if(!n||typeof n!=='object')return n;
 if(n.type==='FunctionDeclaration'&&names.includes(n.id.name))return clean(bf[n.id.name][0].node);
 if(n.type==='VariableDeclaration'){
  const ids=declNames(n);
  if(ids.includes('vibrationRuntimeController')||ids.includes('createVibrationController'))return OMIT;
  if(ids.includes('VIBRATION_KIND'))return clean(originalConstants);
  if(ids.length===1&&dom.includes(ids[0])&&n.declarations[0].init?.type==='AssignmentExpression'){
   const d=n.declarations[0],left=d.init.left;assert.equal(left.object.name,'els');assert.equal(left.property.name,ids[0]);
   return inverse({...n,declarations:[{...d,init:d.init.right}]});
  }
 }
 if(n.type==='IfStatement'&&JSON.stringify(clean(n.test)).includes('createVibrationController'))return OMIT;
 if(n.type==='ExpressionStatement'&&controllerCall(n.expression)){
  const call=n.expression,key=call.callee.property.name;
  if(key==='cancelPanelLayoutSync')return clean(cancel);
  if(key==='setHideSmallFrequencies')return {type:'ExpressionStatement',expression:{type:'AssignmentExpression',operator:'=',left:identifier('vibrationHideSmallFrequencies'),right:inverse(call.arguments[0])}};
  assert.equal(key,'setPlaybackState');assert.equal(call.arguments[0].properties.length,1);
  const p=call.arguments[0].properties[0];assert(['playing','lastStepMs'].includes(p.key.name));
  return {type:'ExpressionStatement',expression:{type:'AssignmentExpression',operator:'=',left:identifier(p.key.name==='playing'?'vibrationPlaying':'vibrationLastStepMs'),right:inverse(p.value)}};
 }
 if(n.type==='MemberExpression'&&controllerCall(n.object)&&n.object.callee.property.name==='getPlaybackState'){
  assert(['playing','lastStepMs'].includes(n.property.name));return identifier(n.property.name==='playing'?'vibrationPlaying':'vibrationLastStepMs');
 }
 if(controllerCall(n)&&n.callee.property.name==='getHideSmallFrequencies')return identifier('vibrationHideSmallFrequencies');
 const result=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,inverse(v)]));
 if(result.type==='ObjectProperty'&&result.key.type==='Identifier'&&result.value?.type==='Identifier'&&result.key.name===result.value.name&&result.key.name==='vibrationPlaying')result.shorthand=true;
 return result;
}
for(const name of names)check('original host forwarder '+name,clean(af[name][0].node),clean(parse(`function ${name}(...args) { return vibrationRuntimeController.${name}(...args); }`).program.body[0]));
const reconstructed=inverse(clean(a)),rr=body(reconstructed);
const last=br.indexOf(originalStates.at(-1)),following=br[last+1];assert.equal(following.type,'FunctionDeclaration');
const insert=rr.findIndex(n=>n.type==='FunctionDeclaration'&&n.id.name===following.id.name);assert(insert>=0);
rr.splice(insert,0,...clean(originalStates));
check('whole application exactly reconstructed after explicit state/API and DOM-field rewrites',reconstructed,clean(b));
function inverseMoved(n){
 if(Array.isArray(n))return n.map(inverseMoved);if(!n||typeof n!=='object')return n;
 if(n.type==='MemberExpression'&&n.object.name==='els'&&dom.includes(n.property.name))return identifier(n.property.name);
 if(n.type==='CallExpression'&&n.callee.type==='Identifier'){
  if(n.callee.name==='getActiveRecord')return expression('(currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null');
  if(n.callee.name==='getVideoController')return identifier('vibrationVideoController');
  if(n.callee.name==='isEditMode')return expression('currentMode === MODES.EDIT');
 }
 return Object.fromEntries(Object.entries(n).map(([k,v])=>[k,inverseMoved(v)]));
}
for(const name of names)check('moved original body '+name,inverseMoved(clean(mf[name][0].node)),clean(bf[name][0].node));
for(const n of originalConstants){const name=n.declarations[0].id.name;let found;traverse(m,{VariableDeclarator(p){if(p.node.id.name===name)found=p.parentPath.node;}});check('unchanged feature constant '+name,clean(found),clean(n));}
const factory=mf.createVibrationController[0],scope=factory.scope;
const actual=scope.bindings.deps.referencePaths[0].parentPath.node.id.properties.map(p=>p.value.name);
check('genuine dependency inventory',actual,deps);
const dependencies=deps.map(name=>({name,actualReferences:scope.bindings[name].referencePaths.length}));check('all13 inputs actually used',dependencies.every(d=>d.actualReferences>0),true);check('strictly under15',deps.length<15,true);
const globals=new Set();factory.traverse({ReferencedIdentifier(p){if(!p.scope.getBinding(p.node.name))globals.add(p.node.name);}});
check('complete platform-only ambient inventory',[...globals].sort(),['Array','Float32Array','Math','NaN','Number','Object','cancelAnimationFrame','document','requestAnimationFrame','window'].sort());
check('no host state shadows remain',states.some(name=>new RegExp('^  let '+name+'\\b','m').test(after)),false);
const cap='const dtSec = Math.max(0, Math.min(0.2, (nowMs - vibrationLastStepMs) / 1000));';
check('continuous capped delta expression byte exact',moduleSource.includes(cap)&&before.includes(cap),true);
check('continuous phase expression byte exact',moduleSource.includes('let nextPhase = (Number(vib.phase) || 0) + dtSec * speed * Math.PI * 2;'),true);
for(const p of ['assets/app/js/trajectory-playback.js','assets/app/js/trajectory-clock.js','assets/app/js/trajectory-ui.js','assets/app/js/trajectory-video.js','assets/app/js/symmetry.js','assets/app/js/periodic-table.js','assets/app/js/pubchem.js','assets/app/js/qa-characterize.js','tests/baselines/characterize.json.gz','tests/baselines/browser-shards.json'])check('protected source '+p,hash(fs.readFileSync(p)),hash(cp.execFileSync('git',['show',base+':'+p],{maxBuffer:32*1024*1024})));
check('only intended new script',read('index.html'),old('index.html').replace('  <script src="./assets/app/js/trajectory-playback.js?v=0.9.5"></script>','  <script src="./assets/app/js/vibration.js?v=0.9.5"></script>\n  <script src="./assets/app/js/trajectory-playback.js?v=0.9.5"></script>'));
const productionFiles=git('diff','--name-only',base,'--','assets','src','index.html').trim().split('\n');
check('only intended tracked production files',productionFiles.filter(p=>p!=='assets/app/js/vibration.js'),['assets/app/js/app.js','index.html']);
const editWidthOld="        assert page.locator('.wb-tools').evaluate('el=>el.scrollWidth<=el.clientWidth+1'),width";
const editWidthNew=`        tool_widths = page.locator('.wb-tools').evaluate('el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth})')
        print('[edit-tool-layout] '+json.dumps({
            'viewportWidth': width, 'actual': tool_widths,
            'expected': {'maximumScrollWidth': tool_widths['clientWidth'] + 1},
            'passed': tool_widths['scrollWidth'] <= tool_widths['clientWidth'] + 1,
        }, sort_keys=True), flush=True)
        assert tool_widths['scrollWidth'] <= tool_widths['clientWidth'] + 1, width`;
check('Edit logging only; original comparison, waits and all other assertions preserved',read('tests/e2e/edit_tool.py'),old('tests/e2e/edit_tool.py').replace(editWidthOld,editWidthNew));
check('all other shipped browser suites and fixtures unchanged',git('diff','--name-only',base,'--','tests/e2e','tests/fixtures').trim().split('\n'),['tests/e2e/browser_suite.py','tests/e2e/edit_tool.py','tests/e2e/join_browser_shards.py']);
const allCount=ast=>Object.values(fns(ast)).reduce((n,v)=>n+v.length,0);
const movedDeclarationCount=names.reduce((n,name)=>{let nested=0;bf[name][0].traverse({FunctionDeclaration(){nested++;}});return n+1+nested;},0);
check('all original declarations accounted after14 forwarders and moved nested helper',allCount(a)+movedDeclarationCount-names.length,allCount(b));
const metrics=s=>{const ast=parse(s);return {lines:s.split('\n').length-1,trackedTwoSpaceLetDeclarationLines:(s.match(/^  let /gm)||[]).length,directIifeFunctionDeclarations:body(ast).filter(n=>n.type==='FunctionDeclaration').length,allFunctionDeclarations:allCount(ast)};};
const report={status:'passed',baseline:base,sourceHead:git('rev-parse','HEAD').trim(),functions:names,dependencies,controllerDependencyCount:deps.length,
 sourceHashes:{beforeAppSha256:hash(before),proposedAppSha256:hash(after),proposedModuleSha256:hash(moduleSource),qaSha256:hash(fs.readFileSync('assets/app/js/qa-characterize.js'))},
 metrics:{beforeApp:metrics(before),proposedApp:metrics(after),module:metrics(moduleSource)},
 proof:{wholeAppReconstructed:true,allMovedBodiesExactAfterLexicalAdapterSubstitution:true,originalDeclarationCount:allCount(b),movedFunctionCount:names.length,allExistingDeclarationsAccounted:true,allDepsUsed:true,noHiddenAppClosureReferences:true,ambientGlobals:[...globals].sort(),continuousPhaseAnd02sCapUnchanged:true},checks};
fs.writeFileSync(out+'/source-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'passed',checks:checks.length,dependencies:deps.length,metrics:report.metrics},null,2));
