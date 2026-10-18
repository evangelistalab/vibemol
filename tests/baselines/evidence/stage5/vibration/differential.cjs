const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const parser=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const out='/Users/fevange/Source/vibemol/out/test-artifacts/stage5/vibration',work=out+'/source-worktree',base='7f9f9f9d01b3ec56e339b9bb4221db7e819338d1';
const before=cp.execFileSync('git',['show',base+':assets/app/js/app.js'],{cwd:work,encoding:'utf8',maxBuffer:32*1024*1024}),after=fs.readFileSync(work+'/assets/app/js/app.js','utf8'),moduleSource=fs.readFileSync(work+'/assets/app/js/vibration.js','utf8');
const names=['getActiveVibrationInfo','formatVibrationFrequencyCell','formatVibrationIntensityCell','getVibrationModeIrIntensity','collectVisibleVibrationSpectrumPeaks','renderVibrationSpectrum','shouldHideVibrationMode','getVisibleVibrationModeIndices','renderVibrationModeTable','syncVibrationControls','scheduleVibrationPanelLayoutSync','restoreActiveVibrationEquilibrium','applyActiveVibrationPhase','updateVibrationPlayback'];
const dom=['vibrationPanel','vibrationPanelBtn','vibrationRow','vibrationRow2','vibrationSpectrumWrap','vibrationSpectrumCanvas','vibrationSpectrumMeta','vibrationModeTableWrap','vibrationModeTable','vibrationModeTableBody','vibrationModeEmpty','vibrationNowPlaying','vibrationModeLabel','vibrationPlayBtn','vibrationFreqLabel','vibrationAmplitudeEl','vibrationSpeedEl'];
const constants=['VIBRATION_KIND','VIBRATION_DEFAULT_AMPLITUDE','VIBRATION_DEFAULT_SPEED','VIBRATION_HIDE_SMALL_FREQ_THRESHOLD_CM1','VIBRATION_IR_MIN_FREQ_CM1','VIBRATION_IR_DEFAULT_SIGMA_CM1','CM_INV_TEXT','CM_INV_HTML'];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function parts(source){const funcs={},adapters={};traverse(parser.parse(source),{
 FunctionDeclaration(p){if(names.includes(p.node.id.name))funcs[p.node.id.name]=source.slice(p.node.start,p.node.end);},
 AssignmentExpression(p){if(p.node.left.name!=='vibrationVideoController')return;for(const prop of p.get('right.arguments.0.properties'))if(['getPlaybackState','setPlaybackState','getCaptureFps','captureSessionState','restoreSessionState','startRecordingSequence'].includes(prop.node.key.name))adapters[prop.node.key.name]=source.slice(prop.node.value.start,prop.node.value.end);}
});assert.equal(Object.keys(funcs).length,14);assert.equal(Object.keys(adapters).length,6);return {funcs,adapters};}
const sources={before:parts(before),after:parts(after)};
function env(which,spec){const context=vm.createContext({console});vm.runInContext('this.window=this;',context);if(which==='after')vm.runInContext(moduleSource,context);
vm.runInContext(`
const spec=${JSON.stringify(spec)},events=[],draw=[],frames=new Map();let nextRaf=0,panelOpen=true,currentMode=spec.edit?'edit':'display',currentIndex=0;
const MODES={EDIT:'edit'};window.devicePixelRatio=1.5;
const document={activeElement:null};
const canvasContext=new Proxy({}, {get:(t,k)=>k in t?t[k]:(...args)=>draw.push([k,...args]),set:(t,k,v)=>{t[k]=v;draw.push(['set',k,v]);return true;}});
const els=Object.fromEntries(${JSON.stringify(dom)}.map(name=>[name,{name,style:{},value:'',textContent:'',innerHTML:'',attributes:{},clientWidth:300,clientHeight:128,width:0,height:0,classList:{contains:()=>panelOpen},setAttribute(k,v){this.attributes[k]=v;},getContext:()=>canvasContext}]));
${dom.map(name=>`const ${name}=els.${name};`).join('\n')}
const UI_PALETTE={irAxisStroke:'axis',irTextMuted:'muted',irCurve:'curve',irSelectedLine:'line',irSelectedBand:'band',irSelectedText:'selected',irAxisText:'text'};
function requestAnimationFrame(fn){frames.set(++nextRaf,fn);return nextRaf;}
function cancelAnimationFrame(id){frames.delete(id);events.push(['cancel',id]);}
function flushRaf(){for(const [id,fn] of [...frames]){frames.delete(id);fn();}}
function snapshotAtomCoordinates(vol,count){return new Float32Array(vol.atoms.flatMap(a=>[a.x,a.y,a.z]));}
function applyAtomCoordinateFrame(vol,frame,count,{record}){events.push(['apply',Array.from(frame),count,record.name]);vol.atoms=Array.from({length:count},(_,i)=>({x:frame[i*3],y:frame[i*3+1],z:frame[i*3+2]}));}
function markSessionChanged(){events.push(['session']);}
function escapeHtml(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');}
function setTooltipText(node,text){node.tooltip=text;events.push(['tooltip',node.name,text]);}
function setMotionPanelButtonGlyph(node,glyph){node.glyph=glyph;events.push(['glyph',node.name,glyph]);}
function setVibrationPanelOpen(open,options){panelOpen=open;events.push(['panel',open,options]);}
function updateDisplayWindowAdaptiveMenuUi(){events.push(['menu']);}
let exportActive=false,exportTarget=null,exportStop=false;
const vibrationVideoController={isActive:()=>exportActive,getTargetRecord:()=>exportTarget,
 discardForTargetRecordChange:()=>events.push(['discard']),syncUi:info=>events.push(['video-ui',info.enabled]),
 resolveAdvance:(phase,end)=>{events.push(['advance',phase,end]);return exportStop?{phase:Math.min(phase,end),stopPlayback:phase>=end}:null;}};
const volumes=[{name:'fixture',vol:{atoms:[{x:0,y:0,z:0},{x:1,y:0,z:0}],vibration:{modeIndex:spec.modeIndex||0,amplitude:spec.amplitude,speed:spec.speed,phase:0,modes:[
 {label:'Translation<&',frequencyCm1:3,displacements:new Float32Array([.1,0,0,.1,0,0])},
 {label:'Stretch',frequencyCm1:245,displacements:new Float32Array([-.18,0,0,.18,0,0]),irIntensityKmMol:spec.intensity?15:undefined},
 {label:'Imaginary',frequencyCm1:-80,displacements:new Float32Array([0,.2,0,0,-.2,0]),intensity:spec.intensity?0:undefined}
]}}}];
if(spec.invalid)volumes[0].vol.vibration.modes[0].displacements=new Float32Array(2);
${which==='before'?constants.map(name=>before.match(new RegExp('^  const '+name+' = .+;$','m'))[0]).join('\n'):'const {'+constants.join(',')+'}=VibeMolVibration;'}
${which==='before'?'let vibrationPlaying=false,vibrationLastStepMs=0,vibrationHideSmallFrequencies=true,vibrationPanelLayoutRaf=0;':''}
${Object.values(sources[which].funcs).join('\n')}
${which==='after'?`const vibrationRuntimeController=VibeMolVibration.createVibrationController({els,getActiveRecord:()=>currentIndex>=0?volumes[currentIndex]:null,snapshotAtomCoordinates,applyAtomCoordinateFrame,markSessionChanged,isEditMode:()=>currentMode===MODES.EDIT,UI_PALETTE,escapeHtml,getVideoController:()=>vibrationVideoController,setTooltipText,setMotionPanelButtonGlyph,setVibrationPanelOpen,updateDisplayWindowAdaptiveMenuUi});`:''}
const api=${which==='after'?'vibrationRuntimeController':`{getPlaybackState:()=>({playing:vibrationPlaying,lastStepMs:vibrationLastStepMs}),setPlaybackState:state=>{if(Object.hasOwn(state,'playing'))vibrationPlaying=state.playing;if(Object.hasOwn(state,'lastStepMs'))vibrationLastStepMs=state.lastStepMs;},getHideSmallFrequencies:()=>vibrationHideSmallFrequencies,setHideSmallFrequencies:value=>{vibrationHideSmallFrequencies=value;},cancelPanelLayoutSync:()=>{if(vibrationPanelLayoutRaf){cancelAnimationFrame(vibrationPanelLayoutRaf);vibrationPanelLayoutRaf=0;}}}`};
const video={${Object.entries(sources[which].adapters).map(([k,v])=>k+':'+v).join(',')}};
const snapshots=[];
function capture(label,value){snapshots.push({label,value:value===undefined?null:value,state:api.getPlaybackState(),hide:api.getHideSmallFrequencies(),volumes,events:events.splice(0),draw:draw.splice(0),raf:[...frames.keys()],panelOpen,dom:Object.fromEntries(Object.entries(els).map(([k,v])=>[k,{style:v.style,value:v.value,textContent:v.textContent,innerHTML:v.innerHTML,attributes:v.attributes,width:v.width,height:v.height,tooltip:v.tooltip,glyph:v.glyph}]))});
 // Retain value snapshots rather than references to subsequently mutated data.
 snapshots[snapshots.length-1]=JSON.parse(JSON.stringify(snapshots[snapshots.length-1]));}
this.run=()=>{
 api.setHideSmallFrequencies(spec.hide);capture('info',getActiveVibrationInfo());
 capture('format',[undefined,null,NaN,'bad',-34.56,0,12.345].map(v=>[formatVibrationFrequencyCell(v),formatVibrationIntensityCell(v)]));
 syncVibrationControls();capture('initial controls');
 api.setPlaybackState({playing:true,lastStepMs:0});
 for(const now of [0,100,100.1,150,350,600,10000,9000,10500]){updateVibrationPlayback(now);capture('tick'+now);}
 if(getActiveVibrationInfo().enabled){
  api.setPlaybackState({playing:false});capture('phase application',applyActiveVibrationPhase(1.25,{syncUi:false}));
  capture('restore equilibrium',restoreActiveVibrationEquilibrium({syncUi:false}));
  video.setPlaybackState({playing:'yes',lastStepMs:'321'});capture('export setter',video.getPlaybackState());
  const info=getActiveVibrationInfo();capture('capture fps',video.getCaptureFps(info));capture('export snapshot',video.captureSessionState(info));
  video.startRecordingSequence(info);capture('start recording');exportStop=true;
  for(const now of [100,300,500,700,900,1100,1300]){updateVibrationPlayback(now);capture('export tick'+now);}
  video.restoreSessionState({targetRecord:info.record,modeIndex:1,phase:2,wasPlaying:true});capture('restore playing export');
  currentMode='edit';video.restoreSessionState({targetRecord:info.record,modeIndex:2,phase:0,wasPlaying:true});capture('restore export in edit');currentMode='display';
 }
 panelOpen=true;scheduleVibrationPanelLayoutSync(3);flushRaf();capture('layout pending');api.cancelPanelLayoutSync();flushRaf();capture('layout cancelled');
 scheduleVibrationPanelLayoutSync(2);flushRaf();flushRaf();capture('layout completed');
 api.setPlaybackState({playing:true,lastStepMs:123});currentIndex=-1;updateVibrationPlayback(12000);capture('last record unavailable');
 return snapshots;
};`,context);
return context;}
const scenarios=[];
for(const modeIndex of [-1,0,1,99])for(const speed of [.1,.75,30])for(const hide of [false,true])for(const edit of [false,true])scenarios.push({modeIndex,speed,hide,edit,amplitude:.5,intensity:modeIndex===1});
for(const amplitude of [0,8,-1,99,'bad'])scenarios.push({speed:.75,hide:false,amplitude});
scenarios.push({invalid:true,amplitude:.5,speed:.75,hide:true});
const results=[];let checkpoints=0;
for(const [index,spec]of scenarios.entries()){
 const actual={};for(const which of ['before','after'])actual[which]=JSON.parse(JSON.stringify(vm.runInContext('run()',env(which,spec))));
 if(!require('node:util').isDeepStrictEqual(actual.before,actual.after)){
  fs.writeFileSync(out+'/differential-failure.json',JSON.stringify({index,spec,expected:actual.before,actual:actual.after},null,2));throw Error('Actual original/extracted comparands differ; see differential-failure.json');
 }
 checkpoints+=actual.before.length;
 results.push({index,spec,checkpoints:actual.before.length,readbackSha256:hash(JSON.stringify(actual.after)),readbacks:actual.after.map(s=>({...s,draw:{commands:s.draw.length,sha256:hash(JSON.stringify(s.draw))}})),status:'passed'});
}
const calls=[],context=vm.createContext({window:{}});vm.runInContext(moduleSource,context);
context.window.VibeMolVibration.createVibrationController(Object.fromEntries(['els','getActiveRecord','snapshotAtomCoordinates','applyAtomCoordinateFrame','markSessionChanged','isEditMode','UI_PALETTE','escapeHtml','getVideoController','setTooltipText','setMotionPanelButtonGlyph','setVibrationPanelOpen','updateDisplayWindowAdaptiveMenuUi'].map(n=>[n,()=>{calls.push(n);throw Error('eager '+n);}])));
assert.deepEqual(calls,[]);
const report={status:'passed',base,scenarioCount:scenarios.length,checkpointCount:checkpoints,constructorDependencyCalls:calls,sourceHashes:{beforeApp:hash(before),afterApp:hash(after),module:hash(moduleSource)},
 policy:'Actual original14 functions and6 exporter adapters against actual extracted source/adapters; exact live clocks, capped phase/frame coordinates, DOM/spectrum draw commands, playback/filter transitions, RAF cancellation and exporter capture/restore. Full comparands compared before compacting successful drawing readbacks to hashes.',results};
fs.writeFileSync(out+'/differential.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'passed',scenarios:scenarios.length,checkpoints,constructorDependencyCalls:calls}));
