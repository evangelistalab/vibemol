// Independent inverse reconstruction: do not import or execute the converter.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const parser=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const root=process.cwd(),out=process.argv[2];assert(out);fs.mkdirSync(out,{recursive:true});
const base='83024dd0b71251a1e2cfacb4b9c52ab25e394f7a',appFile='assets/app/js/app.js',moduleFile='assets/app/js/trajectory-playback.js';
const old=p=>cp.execFileSync('git',['show',base+':'+p],{encoding:'utf8',maxBuffer:32*1024*1024});
const read=p=>fs.readFileSync(p,'utf8'),hash=s=>crypto.createHash('sha256').update(s).digest('hex'),parse=s=>parser.parse(s,{sourceType:'script'});
const before=old(appFile),after=read(appFile),moduleSource=read(moduleFile),b=parse(before),a=parse(after),m=parse(moduleSource);
const names=['getTrajectorySyncMaster','normalizeTrajectoryClock','getTrajectoryInfoForRecord','getTrajectoryRecordForScene','getTrajectoryInfoForScene','getAllTrajectoryInfos','getActiveTrajectoryInfo','shouldUseDynamicTrajectoryBondsForVolume','getTrajectoryInfoBySceneId','getTrajectoryMasterMaxFrames','normalizeTrajectoryMasterFrame','applyMasterFrameToSyncedTrajectories','applyTrajectoryFrameForInfo','applyTrajectoryFrame','mapMasterFrameToTrajectory','anyTrajectorySyncEnabled','stopAllTrajectoryPlayback','setAllTrajectoryPlayback','resetAllTrajectoryFrames','isAnyTrajectoryPlaybackActive','setTrajectorySyncEnabled','updateTrajectoryPlayback','setTrajectoryPlayingForInfo','stopTrajectoryPlayback','isTrajectoryVolumeRecord','getActiveTrajectoryInfoForRecord','cloneTrajectoryState'];
const deps=['getSceneGraphController','getActiveRecord','TrajectoryClock','applyAtomCoordinateFrame','markSessionChanged','isEditMode','syncTrajectoryControls','getVideoController'];
const clean=n=>{
 if(Array.isArray(n))return n.map(clean);
 if(!n||typeof n!=='object')return n;
 return Object.fromEntries(Object.entries(n).filter(([k])=>!['start','end','loc','extra','leadingComments','trailingComments','innerComments','comments','tokens'].includes(k)).map(([k,v])=>[k,clean(v)]));
};
const checks=[];
function check(label,actual,expected){
 const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 const compact=v=>{const s=JSON.stringify(stable(v));return s.length>2048?{canonicalJsonSha256:hash(s),bytes:Buffer.byteLength(s)}:v;};
 const result={label,actual:compact(actual),expected:compact(expected),passed:isDeepStrictEqual(actual,expected)};
 checks.push(result);if(!result.passed){fs.writeFileSync(out+'/failed-comparands.json',JSON.stringify({label,actual,expected}));console.error(JSON.stringify(result));}assert.deepEqual(actual,expected,label);
}
const declarations=ast=>{const r={};traverse(ast,{FunctionDeclaration(p){const name=p.node.id.name;assert(!r[name]||!names.includes(name),name);(r[name]??=[]).push(p);}});return r;};
const bf=declarations(b),af=declarations(a),mf=declarations(m);
function iife(ast){return ast.program.body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression').expression.callee.body.body;}
const bRoot=iife(b),aRoot=iife(a);
const originalShadowStatements=bRoot.filter(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>['trajectoryPlaying','trajectoryLastStepMs'].includes(d.id.name)));
check('exactly the two original shadows',originalShadowStatements.length,2);
const hostPairs={};
traverse(b,{AssignmentExpression(p){
 if(p.node.left.type!=='Identifier'||p.node.left.name!=='trajectoryPlaying')return;
 const statement=p.parentPath;
 assert(statement.isExpressionStatement());
 let owner=p.getFunctionParent();
 let key=owner?.node.id?.name;
 if(!key&&owner?.parentPath.isObjectProperty())key=owner.parentPath.node.key.name;
 if(owner?.parentPath.isVariableDeclarator()&&owner.parentPath.node.id.name==='install')key='install';
 if(['syncTrajectoryControls','setPlaybackState','restoreSessionState','startRecordingSequence','install'].includes(key)){
  const list=statement.container,index=list.indexOf(statement.node),pair=[statement.node];
  if(key!=='install'){assert(list[index+1].expression.left.name==='trajectoryLastStepMs');pair.push(list[index+1]);}
  assert(!hostPairs[key]);hostPairs[key]=pair;
 }
}});
check('all host mirror-write contexts enumerated',Object.keys(hostPairs).sort(),['install','restoreSessionState','setPlaybackState','startRecordingSequence','syncTrajectoryControls'].sort());
// Replace forwarders and the five host write contexts from independently read
// original AST fragments, then compare the entire app, not a name grep.
traverse(a,{FunctionDeclaration(p){if(names.includes(p.node.id.name)){
 const body=p.node.body.body;
 check('forwarder '+p.node.id.name,clean(body),clean(parse(`function f(...args){return trajectoryPlaybackController.${p.node.id.name}(...args);}`).program.body[0].body.body));
 p.replaceWith(structuredClone(bf[p.node.id.name][0].node));p.skip();
}},ExpressionStatement(p){
 const ex=p.node.expression;
 if(ex.type!=='CallExpression'||ex.callee.type!=='MemberExpression'||ex.callee.object.name!=='trajectoryPlaybackController')return;
 assert(['observePlaybackOwner','forgetPlaybackOwner'].includes(ex.callee.property.name));
 const owner=p.getFunctionParent();let key=owner?.node.id?.name;
 if(!key&&owner?.parentPath.isObjectProperty())key=owner.parentPath.node.key.name;
 if(owner?.parentPath.isVariableDeclarator()&&owner.parentPath.node.id.name==='install')key='install';
 assert(hostPairs[key],key);p.replaceWithMultiple(structuredClone(hostPairs[key]));p.skip();
}});
const removeNames=new Set(['createTrajectoryPlaybackController','trajectoryPlaybackController']);
for(let i=aRoot.length-1;i>=0;i--){const n=aRoot[i];
 if(n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='trajectoryPlaybackController'||d.id.type==='ObjectPattern'&&d.id.properties.some(p=>p.value?.name==='createTrajectoryPlaybackController')))aRoot.splice(i,1);
 else if(n.type==='IfStatement'&&n.test.type==='BinaryExpression'&&n.test.left.type==='UnaryExpression'&&n.test.left.argument.name==='createTrajectoryPlaybackController')aRoot.splice(i,1);
}
const pos=aRoot.findIndex(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='vibrationPlaying'));assert(pos>=0);
aRoot.splice(pos,0,...structuredClone(originalShadowStatements));
check('whole app reconstructed AST equals original',clean(a),clean(b));
// All other declarations also have a byte-level comparison, preserving timers,
// waits, geometry, video lifecycle, UI/query/listener and restoration bodies.
const changed=new Set([...names,'syncTrajectoryControls','applySessionState']);
const exact=[];
for(const [name,paths]of Object.entries(bf))for(let i=0;i<paths.length;i++){
 const prior=paths[i],current=af[name]?.[i];assert(current,name);
 if(!changed.has(name)){check('unchanged declaration '+name+'#'+i,hash(after.slice(current.node.start,current.node.end)),hash(before.slice(prior.node.start,prior.node.end)));exact.push(name+'#'+i);}
}
const shadowName=n=>n.type==='Identifier'&&['trajectoryPlaying','trajectoryLastStepMs'].includes(n.name);
const transformed=node=>{
 if(!node||typeof node!=='object')return node;
 if(Array.isArray(node))return node.map(transformed).filter(Boolean);
 if(node.type==='ExpressionStatement'){
  const ex=node.expression;
  if(ex.type==='AssignmentExpression'&&shadowName(ex.left))return null;
  if(ex.type==='CallExpression'&&['observePlaybackOwner','forgetPlaybackOwner'].includes(ex.callee.name))return null;
 }
 if(node.type==='VariableDeclaration'&&node.declarations.length===1&&node.declarations[0].id.name==='previousOwner')return null;
 if(node.type==='LogicalExpression'&&node.operator==='&&'&&node.left.name==='previousOwner'&&node.right.type==='MemberExpression'&&node.right.property.name==='playing')return {type:'Identifier',name:'trajectoryPlaying'};
 if(node.type==='CallExpression'){
  if(node.callee.name==='getSceneGraphController')return {type:'Identifier',name:'sceneGraphController'};
  if(node.callee.name==='getVideoController')return {type:'Identifier',name:'trajectoryVideoController'};
  if(node.callee.name==='isEditMode')return clean(parse('currentMode === MODES.EDIT').program.body[0].expression);
  if(node.callee.name==='getActiveRecord')return clean(parse('(currentIndex >= 0 && volumes[currentIndex]) ? volumes[currentIndex] : null').program.body[0].expression);
 }
 if(node.type==='Identifier'&&node.name==='TrajectoryClock')return {type:'MemberExpression',object:{type:'Identifier',name:'window'},property:{type:'Identifier',name:'VibeMolTrajectoryClock'},computed:false};
 return Object.fromEntries(Object.entries(node).map(([k,v])=>[k,transformed(v)]));
};
for(const name of names)check('moved implementation '+name,transformed(clean(mf[name][0].node)),transformed(clean(bf[name][0].node)));
check('no original shadow names remain in runtime',/\btrajectory(?:Playing|LastStepMs)\b/.test(after+moduleSource),false);
const moduleScope=mf.createTrajectoryPlaybackController[0].scope;
const actualDeps=moduleScope.bindings.deps.referencePaths[0].parentPath.get('id.properties').map(p=>p.node.value.name);
check('explicit genuine dependency list',actualDeps,deps);
const dependencyCounts=deps.map(name=>({name,actualReferences:moduleScope.bindings[name].referencePaths.length}));
check('all eight inputs used',dependencyCounts.every(x=>x.actualReferences>0),true);
check('exclusive under-15 budget',deps.length<15,true);
const globals=new Set();
mf.createTrajectoryPlaybackController[0].traverse({ReferencedIdentifier(p){if(!p.scope.getBinding(p.node.name))globals.add(p.node.name);}});
check('complete ambient free-reference inventory',[...globals].sort(),['Array','Float32Array','Math','Number','Object','String'].sort());
check('no hidden DOM or app-global reach',/\b(document|requestAnimationFrame|window\.|volumes|currentIndex|currentMode|trajectoryVideoController)\b/.test(moduleSource),false);
const index=old('index.html').replace('  <script src="./assets/app/js/trajectory-clock.js?v=0.9.5"></script>','  <script src="./assets/app/js/trajectory-clock.js?v=0.9.5"></script>\n  <script src="./assets/app/js/trajectory-playback.js?v=0.9.5"></script>');
check('only planned script tag added',read('index.html'),index);
check('only planned JS syntax-check input added',read('Makefile'),old('Makefile').replace('\tassets/app/js/trajectory-clock.js \\\n','\tassets/app/js/trajectory-clock.js \\\n\tassets/app/js/trajectory-playback.js \\\n'));
const contract=JSON.parse(old('tests/baselines/characterize-api-additions.json'));
contract.modules.push({stage:'5a',script:moduleFile,global:'VibeMolTrajectoryPlayback',keys:['createTrajectoryPlaybackController']});
check('planned API addition exact',JSON.parse(read('tests/baselines/characterize-api-additions.json')),contract);
for(const file of ['assets/app/js/trajectory-clock.js','assets/app/js/trajectory-ui.js','assets/app/js/trajectory-video.js','assets/app/js/pubchem.js','assets/app/js/periodic-table.js','assets/app/js/qa-characterize.js','tests/baselines/characterize.json.gz','tests/baselines/browser-suite.json','tests/baselines/browser-shards.json']){
 const bytes=fs.readFileSync(file),prior=cp.execFileSync('git',['show',base+':'+file],{maxBuffer:32*1024*1024});check('protected source '+file,hash(bytes),hash(prior));
}
const protectedDiff=cp.execFileSync('git',['diff','--name-only',base,'--','src','tests/e2e','tests/fixtures'],{encoding:'utf8'}).trim();check('all shipped assertions, fixtures, other consumers untouched',protectedDiff,'');
const unitChanges=cp.execFileSync('git',['diff','--name-only',base,'--','tests/unit'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
check('only new stricter-gate unit test allowed',unitChanges.every(p=>p==='tests/unit/test_refactor_run.py'),true);
function metrics(source){const ast=parse(source);let all=0;traverse(ast,{FunctionDeclaration(){all++;}});return {lines:source.split('\n').length-1,trackedTwoSpaceLetDeclarationLines:(source.match(/^  let /gm)||[]).length,directIifeFunctionDeclarations:iife(ast).filter(n=>n.type==='FunctionDeclaration').length,allFunctionDeclarations:all};}
const report={status:'passed',sourceHead:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline:base,functions:names,dependencies:dependencyCounts,controllerDependencyCount:deps.length,sourceHashes:{beforeAppSha256:hash(before),proposedAppSha256:hash(after),proposedModuleSha256:hash(moduleSource),qaSha256:hash(fs.readFileSync('assets/app/js/qa-characterize.js'))},metrics:{beforeApp:metrics(before),proposedApp:metrics(after),module:metrics(moduleSource)},proof:{wholeAppReconstructed:true,movedFunctionCount:names.length,originalDeclarationCount:Object.values(bf).reduce((n,v)=>n+v.length,0),unchangedDeclarationCount:exact.length,allExistingDeclarationsAccounted:true,allDepsUsed:true,noHiddenAppClosureReferences:true,ambientGlobals:[...globals].sort()},cleanup:'One retained authoritative clock-owner reference, cleared on the empty-scene tick and existing stop/session paths; no copied playing flag or timestamp. Actual original-vs-new execution proof covers last independent playing/paused removal and synchronized master cleanup.',construction:'Inert constructor before PubChem/startup callback registration, with live graph/selection/mode/video getters; outgoing and inverse audits are independent.',checks};
fs.writeFileSync(out+'/source-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,dependencies:deps.length,proof:report.proof,metrics:report.metrics},null,2));
