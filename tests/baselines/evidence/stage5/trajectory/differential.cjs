const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const parser=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const root='/Users/fevange/Source/vibemol',out=root+'/out/test-artifacts/stage5/trajectory',work=out+'/source-worktree';
const base='83024dd0b71251a1e2cfacb4b9c52ab25e394f7a';
const before=cp.execFileSync('git',['show',base+':assets/app/js/app.js'],{cwd:work,encoding:'utf8',maxBuffer:32*1024*1024});
const after=fs.readFileSync(work+'/assets/app/js/app.js','utf8');
const names=JSON.parse(fs.readFileSync(out+'/extraction-inventory.json')).functions;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function parts(source){
 const funcs={},video={};
 traverse(parser.parse(source),{FunctionDeclaration(p){if(names.includes(p.node.id.name))funcs[p.node.id.name]=source.slice(p.node.start,p.node.end);},AssignmentExpression(p){
  if(p.node.left.name!=='trajectoryVideoController')return;
  const arg=p.get('right.arguments.0');
  for(const prop of arg.get('properties'))if(['setPlaybackState','restoreSessionState','startRecordingSequence'].includes(prop.node.key.name))video[prop.node.key.name]=source.slice(prop.node.value.start,prop.node.value.end);
 }});
 assert.equal(Object.keys(funcs).length,27);assert.equal(Object.keys(video).length,3);
 return {funcs,video};
}
const sources={before:parts(before),after:parts(after)},clock=fs.readFileSync(work+'/assets/app/js/trajectory-clock.js','utf8'),moduleSource=fs.readFileSync(work+'/assets/app/js/trajectory-playback.js','utf8');
function environment(which,spec){
 const context=vm.createContext({console});
 vm.runInContext(`this.window=this;this.spec=${JSON.stringify(spec)};`,context);
 vm.runInContext(clock,context);
 if(which==='after')vm.runInContext(moduleSource,context);
 vm.runInContext(`
 const events=[]; let volumes=[],currentIndex=0,currentMode='display'; const MODES={EDIT:'edit'};
 const state={syncMaster:{playing:false,frame:0,fps:12,lastStepMs:0}};
 const scenes=[];
 const sceneGraphController={getState:()=>state,getScenes:()=>scenes,listLayers:s=>[{record:s.moleculeRecord}],getFocusedScene:()=>scenes[currentIndex]||null};
 let exportTarget=null,exportStop=false;
 const trajectoryVideoController={getTargetRecord:()=>exportTarget,resolveAdvance:(next,last)=>{events.push(['export',next,last]);return exportStop?{nextFrameIndex:Math.min(next,last),stopPlayback:next>=last}:null;}};
 function applyAtomCoordinateFrame(vol,frame,count,options){events.push(['apply',options.record.name,Array.from(frame),count]);vol.atoms=Array.from({length:count},(_,i)=>({x:frame[i*3],y:frame[i*3+1],z:frame[i*3+2]}));}
 function markSessionChanged(){events.push(['session']);}
 ${which==='before'?'let trajectoryPlaying=false,trajectoryLastStepMs=0;':''}
 function syncTrajectoryControls(){events.push(['ui']);const info=getActiveTrajectoryInfo();const master=getTrajectorySyncMaster();
  ${which==='before'?'trajectoryPlaying=!!(info.enabled&&info.traj&&(info.traj.syncEnabled?master.playing:info.traj.playing));trajectoryLastStepMs=info.traj?Number(info.traj._lastStepMs)||0:0;':'trajectoryPlaybackController.observePlaybackOwner(info,master);'}
 }
 ${Object.values(sources[which].funcs).join('\n')}
 ${which==='after'?`const trajectoryPlaybackController=VibeMolTrajectoryPlayback.createTrajectoryPlaybackController({getSceneGraphController:()=>sceneGraphController,getActiveRecord:()=>currentIndex>=0&&volumes[currentIndex]?volumes[currentIndex]:null,TrajectoryClock:VibeMolTrajectoryClock,applyAtomCoordinateFrame,markSessionChanged,isEditMode:()=>currentMode===MODES.EDIT,syncTrajectoryControls,getVideoController:()=>trajectoryVideoController});`:''}
 const video={${Object.entries(sources[which].video).map(([k,v])=>k+':'+v).join(',')}};
 const snapshots=[];
 function observe(label,value){snapshots.push({label,value:value===undefined?null:value,records:volumes.map(r=>({name:r.name,atoms:r.vol.atoms,traj:{...r.vol.trajectory,frames:r.vol.trajectory.frames.map(frame=>Array.from(frame))}})),master:{...state.syncMaster},events:events.splice(0)});}
 function setup(lengths){volumes=lengths.map((n,i)=>({name:'record-'+i,vol:{atoms:[{x:0,y:0,z:0}],trajectory:{frames:Array.from({length:n},(_,j)=>new Float32Array([i+j,0,0])),frameIndex:0,currentFrame:0,fps:spec.fps||12,loop:spec.loop!==false,playing:false,syncEnabled:false}}}));scenes.splice(0,scenes.length,...volumes.map((r,i)=>({id:'scene-'+i,kind:'trajectory',moleculeRecord:r})));currentIndex=0;}
 this.run=()=>{
 setup(spec.lengths||[spec.frames||5]);
 observe('validation',getAllTrajectoryInfos().map(i=>({enabled:i.enabled,frames:i.frameCount})));
 if(spec.invalid){volumes[0].vol.trajectory.frames[1]=new Float32Array([0,0]);observe('invalid',getAllTrajectoryInfos().length);updateTrajectoryPlayback(300);observe('invalid tick');return snapshots;}
 if(spec.synced)for(const i of getAllTrajectoryInfos())setTrajectorySyncEnabled(i,true);
 setAllTrajectoryPlayback(spec.playing!==false);observe('play');
 if(spec.export){exportTarget=volumes[0];exportStop=true;}
 if(spec.edit)currentMode='edit';
 for(const now of [0,100,100.1,150,250,500,1500,3000,2950,4000]){updateTrajectoryPlayback(now);observe('tick '+now);}
 currentMode='display';
 if(spec.remove){
  setAllTrajectoryPlayback(spec.playing!==false);observe('before removal');
  // Deliberately remove the last owner before a UI sync: this is the mirror's
  // one formerly live cleanup use, beyond the ordinary deletion's eager sync.
  volumes=[];scenes.splice(0);currentIndex=-1;
  updateTrajectoryPlayback(4100);observe('last-record cleanup');
  updateTrajectoryPlayback(4200);observe('second empty tick');return snapshots;
 }
 resetAllTrajectoryFrames();observe('reset');
 const first=getActiveTrajectoryInfo();
 setTrajectoryPlayingForInfo(first,true);observe('individual play');
 setTrajectorySyncEnabled(first,true);observe('enable sync');
 setTrajectorySyncEnabled(first,false);observe('disable sync');
 video.setPlaybackState({playing:true,lastStepMs:123});observe('video state setter');
 video.startRecordingSequence(first);observe('video start');
 updateTrajectoryPlayback(100);updateTrajectoryPlayback(2100);observe('video advance');
 video.restoreSessionState({targetRecord:first.record,frameIndex:1,wasPlaying:true,loop:true,fps:24,syncEnabled:false,master:{frame:2,fps:24}});observe('video independent restore');
 video.restoreSessionState({targetRecord:first.record,frameIndex:1,wasPlaying:true,loop:false,fps:12,syncEnabled:true,master:{frame:2,fps:12}});observe('video synchronized restore');
 stopTrajectoryPlayback();observe('stop focused');stopAllTrajectoryPlayback();observe('stop all');
 observe('clone',cloneTrajectoryState(first.traj));
 return snapshots;
 };
 `,context);
 return context;
}
const scenarios=[];
for(const frames of [2,3,5,8])for(const fps of [1,12,120])for(const loop of [false,true])for(const synced of [false,true])for(const edit of [false,true])scenarios.push({frames,fps,loop,synced,edit});
for(const synced of [false,true])for(const playing of [false,true])scenarios.push({frames:4,synced,playing,remove:true});
for(const lengths of [[3,5],[2,8],[4,3,6]])for(const synced of [false,true])scenarios.push({lengths,synced});
for(const synced of [false,true])scenarios.push({frames:4,synced,export:true});
scenarios.push({invalid:true});
const results=[];
for(const [index,spec]of scenarios.entries()){
 const actual={};
 for(const which of ['before','after'])actual[which]=JSON.parse(JSON.stringify(vm.runInContext('run()',environment(which,spec))));
 const comparands={index,spec,expected:actual.before,actual:actual.after};
 try{assert.deepEqual(actual.after,actual.before);}catch(e){fs.writeFileSync(out+'/differential-failure.json',JSON.stringify(comparands,null,2));console.error(JSON.stringify(comparands));throw e;}
 results.push({index,spec,checkpoints:actual.before.length,readbacks:actual.after,status:'passed'});
}
const sourceReads=[];
const inertContext=vm.createContext({window:{}});vm.runInContext(moduleSource,inertContext);
const inertDeps=Object.fromEntries(['getSceneGraphController','getActiveRecord','TrajectoryClock','applyAtomCoordinateFrame','markSessionChanged','isEditMode','syncTrajectoryControls','getVideoController'].map(name=>[name,()=>{sourceReads.push(name);throw Error('eager dependency call: '+name);} ]));
inertContext.window.VibeMolTrajectoryPlayback.createTrajectoryPlaybackController(inertDeps);
assert.deepEqual(sourceReads,[]);
const report={status:'passed',base,sourceHashes:{beforeApp:hash(before),afterApp:hash(after),module:hash(moduleSource)},scenarioCount:results.length,checkpointCount:results.reduce((n,r)=>n+r.checkpoints,0),constructorDependencyCalls:sourceReads,policy:'Actual original functions and three exporter adapters vs actual extracted functions/adapters; clocks, coordinate applications, session marks, UI calls, exporter advances and return values compared after every action. No production/test override.',results};
fs.writeFileSync(out+'/differential.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,scenarios:report.scenarioCount,checkpoints:report.checkpointCount,constructorDependencyCalls:sourceReads}));
