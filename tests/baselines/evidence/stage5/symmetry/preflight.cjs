// Read-only check of the accepted next boundary. It never writes product code.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const parser=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const out='/Users/fevange/Source/vibemol/out/test-artifacts/stage5/symmetry';
const plan=JSON.parse(fs.readFileSync('/Users/fevange/Source/vibemol/out/test-artifacts/stage5-seam-audit-6c58355/projections.json')).proposedDifferentCuts.symmetryPanel;
const states=['symmetryController','symmetryPreviewState','symmetryPopoverAnalysisCache','symmetryPopoverCurrentGroupLabel','symmetryPopoverResultHighlightTimer','symmetryPopoverElementsRenderKey','symmetryPopoverSelectedElementId'];
const constants=['DEFAULT_SYMMETRY_TOLERANCE_ANG','EXACT_SYMMETRY_TOLERANCE_ANG','MAX_SYMMETRY_TOLERANCE_ANG','SYMMETRY_TOLERANCE_OPTIONS_ANG'];
const source=fs.readFileSync('assets/app/js/app.js','utf8'),ast=parser.parse(source),refs={};
traverse(ast,{FunctionDeclaration(p){if(!plan.functionNames.includes(p.node.id.name))return;const free=new Set();
 p.traverse({ReferencedIdentifier(q){const b=q.scope.getBinding(q.node.name);if(!b||!(b.scope===p.scope||b.scope.path.findParent(x=>x===p)))free.add(q.node.name);}});
 refs[p.node.id.name]=[...free].sort();
}});
assert.equal(Object.keys(refs).length,24);assert.equal(plan.inputs.length,11);assert(plan.inputs.length<15);
const platform=['Array','Boolean','Math','Number','Object','String','window','document','clearTimeout'];
const free=[...new Set(Object.values(refs).flat())].sort(),allowed=new Set([...plan.functionNames,...plan.inputs,...states,...constants,'analyzePointGroup','describeSymmetryElements','createEditSymmetryController','currentMode','MODES',...platform]);
assert.deepEqual(free.filter(n=>!allowed.has(n)),[],'Unaccounted input requires re-cut before any implementation');
const report={status:'passed',predecessorAppSha256:crypto.createHash('sha256').update(source).digest('hex'),functions:plan.functionNames,dependencies:plan.inputs,dependencyCount:11,states,constants,freeReferencesByFunction:refs,platformFacilities:platform,
 constructionPlan:'Create the panel inertly with literal private state, then explicitly initialize its existing analysis controller at the original createEditSymmetryController assignment point. This retains eager child-construction timing while the new holder is fully initialized before any incoming callback can read it.',
 hostBoundary:'Show/focus/sibling-close, positioning, THREE guide and apply/auto snapshot/Undo stay host-owned. Guide receives selectedElementId explicitly. Host transactions access the sole private preview/analysis owner through explicit methods; no mirror or service bag.',
 noImplementationWritten:true,requiresFreshPushedVibrationBaseBeforeImplementation:true};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/preflight-next-boundary.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'passed',functions:24,dependencies:11,privateState:7,implementationWritten:false}));
