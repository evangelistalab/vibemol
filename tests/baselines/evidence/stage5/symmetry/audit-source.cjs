// Independent inverse audit; does not import the converter or its edit plan.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const parser=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const out=process.argv[2];assert(out);fs.mkdirSync(out,{recursive:true});
const base='63082febadb22d5351365b8f75267534494893e6',app='assets/app/js/app.js',mod='assets/app/js/symmetry-panel.js';
const git=(...a)=>cp.execFileSync('git',a,{encoding:'utf8',maxBuffer:32e6}),old=p=>git('show',base+':'+p),read=p=>fs.readFileSync(p,'utf8'),parse=s=>parser.parse(s),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const names=['isSymmetryPopoverOpen','getSymmetryTargetKey','invalidateSymmetryPopoverAnalysisCache','buildSymmetryAnalysisCacheKey','getSymmetryPopoverAnalysis','clearSymmetryPreview','snapSymmetryTolerance','syncSymmetryToleranceUi','findInternalSymmetryCandidate','getSymmetryPopoverCandidateList','getSymmetryPopoverSelectedGroupId','getSymmetryPopoverSelectedCandidate','getSymmetryElementDisplayAnalysis','clearSymmetryCurrentGroupHighlight','updateSymmetryCurrentGroupUi','buildSymmetryElementOptionHtml','renderSymmetryElementOptions','formatSymmetryResidual','renderSymmetryCandidates','renderSymmetryPopover','hideSymmetryPopover','setSymmetryTolerance','previewSymmetryCandidate','cancelSymmetryPreview'];
const deps=['els','Symmetry','resolveEditSymmetryTarget','resolveVolumeAtomId','workspaceEnabled','isEditMode','clearSymmetryElementGuide','renderSymmetryElementGuide','positionSymmetryPopover','updateEditAdaptiveMenuUi','setHintMessage'];
const states=['symmetryController','symmetryPreviewState','symmetryPopoverAnalysisCache','symmetryPopoverCurrentGroupLabel','symmetryPopoverResultHighlightTimer','symmetryPopoverElementsRenderKey','symmetryPopoverSelectedElementId'];
const constants=['DEFAULT_SYMMETRY_TOLERANCE_ANG','EXACT_SYMMETRY_TOLERANCE_ANG','MAX_SYMMETRY_TOLERANCE_ANG','SYMMETRY_TOLERANCE_OPTIONS_ANG'];
const before=old(app),after=read(app),moduleSource=read(mod),b=parse(before),a=parse(after),m=parse(moduleSource);
function clean(n){if(Array.isArray(n))return n.map(clean);if(!n||typeof n!=='object')return n;return Object.fromEntries(Object.entries(n).filter(([k])=>!['start','end','loc','range','extra','leadingComments','trailingComments','innerComments','comments','tokens'].includes(k)).map(([k,v])=>[k,clean(v)]));}
const checks=[];function check(label,actual,expected){const passed=isDeepStrictEqual(actual,expected);checks.push({label,passed,actual:typeof actual==='object'?hash(JSON.stringify(actual)):actual,expected:typeof expected==='object'?hash(JSON.stringify(expected)):expected});if(!passed){fs.writeFileSync(out+'/failed-comparands.json',JSON.stringify({label,actual,expected},null,2));throw new Error(label+'; actual/expected saved in '+out+'/failed-comparands.json');}}
const fns=ast=>{const f={};traverse(ast,{FunctionDeclaration(p){(f[p.node.id.name]??=[]).push(p);}});return f;};
const bf=fns(b),af=fns(a),mf=fns(m),body=ast=>ast.program.body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression').expression.callee.body.body;
const declNames=n=>n.type==='VariableDeclaration'?n.declarations.flatMap(d=>d.id.type==='Identifier'?[d.id.name]:d.id.type==='ObjectPattern'?d.id.properties.map(p=>p.value?.name||p.argument?.name):[]):[];
const br=body(b),originalStates=br.filter(n=>declNames(n).some(x=>states.includes(x))),originalConstants=br.filter(n=>declNames(n).some(x=>constants.includes(x)));
check('seven original private states',originalStates.length,7);check('four immutable constants',originalConstants.length,4);
const identifier=name=>({type:'Identifier',name}),expression=s=>clean(parse(s).program.body[0].expression);
const panelCall=n=>n?.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.object.name==='symmetryPanelController';
const init=br.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.name==='symmetryController');assert(init);
const reads={getAnalysisController:'symmetryController',getPreviewState:'symmetryPreviewState',getSelectedElementId:'symmetryPopoverSelectedElementId'};
const writes={setPreviewState:'symmetryPreviewState',setCurrentGroupLabel:'symmetryPopoverCurrentGroupLabel',setSelectedElementId:'symmetryPopoverSelectedElementId'};
const OMIT=Symbol('introduced');
function inverse(n){
 if(Array.isArray(n))return n.flatMap(x=>{const v=inverse(x);return v===OMIT?[]:Array.isArray(v)?v:[v];});
 if(!n||typeof n!=='object')return n;
 if(n.type==='FunctionDeclaration'&&names.includes(n.id.name))return clean(bf[n.id.name][0].node);
 if(n.type==='FunctionDeclaration'&&n.id.name==='renderSymmetryElementGuide'){
  check('guide has exactly one explicit selected-ID parameter',n.params.length,3);
  n={...n,params:n.params.slice(0,2)};
 }
 if(n.type==='VariableDeclaration'){
  const ids=declNames(n);
  if(ids.includes('symmetryPanelController')||ids.includes('createSymmetryPanelController'))return OMIT;
  if(ids.includes('DEFAULT_SYMMETRY_TOLERANCE_ANG'))return clean(originalConstants);
 }
 if(n.type==='IfStatement'&&JSON.stringify(clean(n.test)).includes('createSymmetryPanelController'))return OMIT;
 if(n.type==='ExpressionStatement'&&panelCall(n.expression)){
  const call=n.expression,key=call.callee.property.name;
  if(key==='initializeAnalysisController')return [...clean(originalStates),clean(init)];
  assert(writes[key],key);assert.equal(call.arguments.length,1);
  return {type:'ExpressionStatement',expression:{type:'AssignmentExpression',operator:'=',left:identifier(writes[key]),right:inverse(call.arguments[0])}};
 }
 if(panelCall(n)&&reads[n.callee.property.name]){assert.equal(n.arguments.length,0);return identifier(reads[n.callee.property.name]);}
 if(n.type==='Identifier'&&n.name==='selectedElementId')return identifier('symmetryPopoverSelectedElementId');
 if(n.type==='CallExpression'&&n.callee.name==='renderSymmetryElementGuide'&&n.arguments.length===3){
  check('host guide explicitly receives unchanged current selected ID',n.arguments.map(clean),[expression('null'),expression('null'),expression('symmetryPanelController.getSelectedElementId()')]);
  return {...n,arguments:[]};
 }
 return Object.fromEntries(Object.entries(n).map(([k,v])=>[k,inverse(v)]));
}
for(const name of names)check('exact host forwarder '+name,clean(af[name][0].node),clean(parse(`function ${name}(...args) { return symmetryPanelController.${name}(...args); }`).program.body[0]));
check('whole application exactly reconstructed after explicit owner APIs and guide parameter',inverse(clean(a)),clean(b));
function inverseMoved(n){
 if(Array.isArray(n))return n.map(inverseMoved);if(!n||typeof n!=='object')return n;
 if(n.type==='MemberExpression'&&n.object.name==='Symmetry'&&['analyzePointGroup','describeSymmetryElements'].includes(n.property.name))return identifier(n.property.name);
 if(n.type==='UnaryExpression'&&n.operator==='!'&&n.argument.type==='CallExpression'&&n.argument.callee.name==='isEditMode')return expression('currentMode !== MODES.EDIT');
 if(n.type==='CallExpression'&&n.callee.name==='renderSymmetryElementGuide'){
  check('moved guide explicitly receives sole private selected ID',clean(n.arguments[2]),identifier('symmetryPopoverSelectedElementId'));
  return {...n,arguments:n.arguments.slice(0,2).map(inverseMoved)};
 }
 return Object.fromEntries(Object.entries(n).map(([k,v])=>[k,inverseMoved(v)]));
}
for(const name of names)check('moved original body '+name,inverseMoved(clean(mf[name][0].node)),clean(bf[name][0].node));
for(const n of originalConstants){const name=n.declarations[0].id.name;let found;traverse(m,{VariableDeclarator(p){if(p.node.id.name===name)found=p.parentPath.node;}});check('unchanged feature constant '+name,clean(found),clean(n));}
const factory=mf.createSymmetryPanelController[0],scope=factory.scope;
const actual=scope.bindings.deps.referencePaths[0].parentPath.node.id.properties.map(p=>p.value.name);
check('full genuine dependency inventory',actual,deps);
const dependencies=deps.map(name=>({name,actualReferences:scope.bindings[name].referencePaths.length}));check('every input used',dependencies.every(d=>d.actualReferences>0),true);check('strictly under15',deps.length<15,true);
const globals=new Set();factory.traverse({ReferencedIdentifier(p){if(!p.scope.getBinding(p.node.name))globals.add(p.node.name);}});
check('platform-only ambient globals',[...globals].sort(),['Array','Boolean','Math','Number','Object','String','clearTimeout','document','window'].sort());
check('new constructor performs no dependency operation',factory.node.body.body.filter(n=>n.type!=='FunctionDeclaration'&&n.type!=='VariableDeclaration'&&n.type!=='ReturnStatement').length,0);
for(const name of states){const current=scope.bindings[name];check('private literal state retains initial value '+name,clean(current.path.node.init),clean(originalStates.find(n=>declNames(n).includes(name)).declarations[0].init));}
const initActual=mf.initializeAnalysisController[0].node.body.body[0].expression;
check('analysis child construction unchanged except explicit module input',clean(initActual.right),expression('Symmetry.createEditSymmetryController({ toleranceAng: DEFAULT_SYMMETRY_TOLERANCE_ANG })'));
const host=body(a),holder=host.findIndex(n=>declNames(n).includes('symmetryPanelController')),els=host.findIndex(n=>declNames(n).includes('els'));
check('holder immediately follows els, before other callback exposure',holder,els+1);
check('guide clearing does not mutate the private selected ID',/symmetryPopoverSelectedElementId|selectedElementId|symmetryPanelController/.test(before.slice(bf.clearSymmetryElementGuide[0].node.start,bf.clearSymmetryElementGuide[0].node.end)),false);
check('no host state shadows remain',states.some(n=>new RegExp('^  let '+n+'\\b','m').test(after)),false);
for(const p of ['assets/app/js/symmetry.js','assets/app/js/vibration.js','assets/app/js/trajectory-playback.js','assets/app/js/trajectory-clock.js','assets/app/js/trajectory-ui.js','assets/app/js/trajectory-video.js','assets/app/js/periodic-table.js','assets/app/js/pubchem.js','assets/app/js/qa-characterize.js','tests/baselines/characterize.json.gz','tests/baselines/browser-suite.json','tests/baselines/browser-shards.json'])check('protected source '+p,hash(fs.readFileSync(p)),hash(cp.execFileSync('git',['show',base+':'+p],{maxBuffer:32e6})));
check('only intended new script',read('index.html'),old('index.html').replace('  <script src="./assets/app/js/vibration.js?v=0.9.5"></script>','  <script src="./assets/app/js/symmetry-panel.js?v=0.9.5"></script>\n  <script src="./assets/app/js/vibration.js?v=0.9.5"></script>'));
check('all shipped browser assertions/waits/fixtures unchanged',git('diff','--name-only',base,'--','tests/e2e','tests/fixtures').trim(),'');
const allCount=ast=>Object.values(fns(ast)).reduce((n,v)=>n+v.length,0),metrics=s=>{const ast=parse(s);return {lines:s.split('\n').length-1,trackedTwoSpaceLetDeclarationLines:(s.match(/^  let /gm)||[]).length,directIifeFunctionDeclarations:body(ast).filter(n=>n.type==='FunctionDeclaration').length,allFunctionDeclarations:allCount(ast)};};
check('all original declarations retained through24 exact forwarders',allCount(a),allCount(b));
const report={status:'passed',baseline:base,sourceHead:git('rev-parse','HEAD').trim(),functions:names,dependencies,controllerDependencyCount:deps.length,
 sourceHashes:{beforeAppSha256:hash(before),proposedAppSha256:hash(after),proposedModuleSha256:hash(moduleSource),qaSha256:hash(fs.readFileSync('assets/app/js/qa-characterize.js'))},metrics:{beforeApp:metrics(before),proposedApp:metrics(after),module:metrics(moduleSource)},
 proof:{wholeAppReconstructed:true,allMovedBodiesExactAfterLexicalAdapterSubstitution:true,allExistingDeclarationsAccounted:true,allDepsUsed:true,noHiddenAppClosureReferences:true,inertHolderBeforeCallbackExposure:true,analysisConstructionAtOriginalPoint:true,guideSelectedIdExplicit:true,analysisAndExportersUntouched:true,ambientGlobals:[...globals].sort()},checks};
fs.writeFileSync(out+'/source-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:checks.length,dependencies:deps.length,metrics:report.metrics},null,2));
