#!/usr/bin/env node
import {readFile,writeFile,mkdir,mkdtemp,rename,rm,open,access,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {validateJob,selectTargets,stableValue,FigureError} from './figure-job.mjs';
import {digest,serveApp,launchChrome,waitForFigureReady,requireNormalShutdown} from './figure-browser.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MAX_SESSION_BYTES=512*1024*1024;
async function absent(filename) {
  try {await access(filename);} catch(e) {if(e.code==='ENOENT')return;throw e;}
  throw new FigureError('output',`Output already exists: ${filename}. Choose a new directory.`);
}
function gitIdentity(root) {
  try {const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    return {commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),trackedChanges:git('status','--porcelain','--untracked-files=no')};
  } catch {return {commit:null,tree:null,trackedChanges:null};}
}
export async function runFigureJob(jobPath,{browser,appRoot=ROOT,signal,deadlineMs=300000,listTargets=false,onStage=()=>{}}={}) {
  const [major,minor]=process.versions.node.split('.').map(Number);
  if (major<22||(major===22&&minor<4)) throw new FigureError('validation','Node 22.4 or newer is required.');
  if (!browser) throw new FigureError('validation','Supply --browser with a Chrome/Chromium executable matching the job version.');
  if (!Number.isSafeInteger(deadlineMs)||deadlineMs<1000||deadlineMs>3600000) throw new FigureError('validation','deadlineMs must be an integer in 1000..3600000.');
  const controller=new AbortController(),abort=()=>controller.abort(new FigureError('cancelled',signal.reason?.message||'Figure job cancelled.'));
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  let stage='validation',job,server,chrome,output,lock,temporary;
  const setStage=value=>{stage=value;onStage(value);};
  const observations={readiness:[],blockedRequests:[]},started=new Date().toISOString();
  const deadlineAt=Date.now()+deadlineMs;
  const timer=setTimeout(()=>controller.abort(new FigureError('deadline',`Figure job exceeded its ${deadlineMs} ms wall deadline.`,{stage})),deadlineMs);
  try {
    controller.signal.throwIfAborted();
    job=validateJob(JSON.parse(await readFile(jobPath,'utf8')));
    output=path.resolve(path.dirname(path.resolve(jobPath)),job.output);
    if (!listTargets) {
      await mkdir(path.dirname(output),{recursive:true});await absent(output);
      lock=await open(output+'.lock','wx');await lock.writeFile(String(process.pid));
      temporary=await mkdtemp(path.join(path.dirname(output),'.vibemol-figure-'));
    }
    const sessionPath=path.resolve(path.dirname(path.resolve(jobPath)),job.session);
    if ((await stat(sessionPath)).size>MAX_SESSION_BYTES) throw new FigureError('validation','Session file exceeds the 512 MiB text limit.');
    const input=await readFile(sessionPath),bytes=sessionPath.endsWith('.gz')?gunzipSync(input,{maxOutputLength:MAX_SESSION_BYTES}):input;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),envelope=JSON.parse(text);
    if (envelope.kind!=='vibemol.session'||envelope.sessionVersion!==1) throw new FigureError('validation','Expected a version-1 vibemol.session file.');
    setStage('browser');server=await serveApp(appRoot,text);chrome=await launchChrome(browser,controller.signal,{sandbox:job.environment.sandbox,deadlineAt});
    const {protocol:p,version}=chrome;
    observations.browser=version;
    const commandLine=(await p.send('Browser.getBrowserCommandLine',{},null)).arguments;
    const actualVersion=version.product.split('/').at(-1);
    if (actualVersion!==job.environment.browserVersion) throw new FigureError('environment',`Browser version mismatch: expected ${job.environment.browserVersion}, actual ${actualVersion}.`,{expected:job.environment.browserVersion,actual:actualVersion});
    p.onEvent=event=>{
      if (event.method==='Runtime.exceptionThrown') controller.abort(new FigureError('page','Uncaught page exception.',event.params));
      if (event.method==='Page.javascriptDialogOpening') controller.abort(new FigureError('page','Unexpected page dialog.',event.params));
      if (event.method==='Fetch.requestPaused') {
        const {requestId,request}=event.params,local=new URL(request.url).origin===server.origin;
        if (!local) observations.blockedRequests.push({url:request.url,reason:'Runner is offline except for its local app origin.'});
        p.send(local?'Fetch.continueRequest':'Fetch.failRequest',local?{requestId}:{requestId,errorReason:'BlockedByClient'}).catch(error=>{if(!controller.signal.aborted)controller.abort(error);});
      }
    };
    await p.send('Fetch.enable',{patterns:[{urlPattern:'http://*'},{urlPattern:'https://*'}]});
    await p.send('Emulation.setDeviceMetricsOverride',{...job.environment.viewport,mobile:false});
    await p.send('Emulation.setTimezoneOverride',{timezoneId:'UTC'});
    await p.send('Emulation.setLocaleOverride',{locale:'en-US'});
    await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('vm.prefs.font',${JSON.stringify(job.environment.font)});localStorage.setItem('vibemol.uiTheme',${JSON.stringify(job.environment.theme)});`});
    setStage('startup-readiness');
    await p.send('Page.setLifecycleEventsEnabled',{enabled:true});
    const navigation=await p.send('Page.navigate',{url:server.origin+'/?appearanceStudy=1'});
    if (navigation.errorText) throw new FigureError('navigation',navigation.errorText);
    await p.waitForEvent('Page.lifecycleEvent',e=>e.loaderId===navigation.loaderId&&e.name==='DOMContentLoaded');
    observations.readiness.push({stage, ...await p.evaluate(waitForFigureReady,stableValue.toString(),60000)});
    setStage('session-import');
    observations.import=await p.evaluate(async()=>{
      globalThis.__vmFigureAbort=new AbortController();
      return VibeMolSession.importText(await(await fetch('/__figure_session')).text());
    });
    if (!observations.import.ok) throw new FigureError('session-import','Session import did not report success.',{receipt:observations.import});
    setStage('import-readiness');
    observations.readiness.push({stage,...await p.evaluate(waitForFigureReady,stableValue.toString(),60000)});
    const environment=await p.evaluate(async()=>{
      const family=getComputedStyle(document.documentElement).getPropertyValue('--vm-font-sans').trim();
      const primary=family.split(',')[0].trim();
      const loaded=await document.fonts.load(`16px ${primary}`);
      await document.fonts.ready;
      const canvas=document.querySelector('#canvas'),gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');
      const ext=gl?.getExtension('WEBGL_debug_renderer_info');
      return {appVersion:VibeMolAssets.version,theme:document.documentElement.dataset.theme,font:VibeMolPrefs.getFontPair(),
        viewport:{width:innerWidth,height:innerHeight,deviceScaleFactor:devicePixelRatio},fontFamily:family,
        loadedFonts:loaded.map(f=>({family:f.family,weight:f.weight,style:f.style,status:f.status})),
        fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>({family:f.family,weight:f.weight,style:f.style,status:f.status})),
        renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,
        glVersion:gl?.getParameter(gl.VERSION),userAgent:navigator.userAgent,locale:navigator.language,
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,hardwareConcurrency:navigator.hardwareConcurrency};
    });
    observations.environment=environment;
    environment.sandbox=!commandLine.includes('--no-sandbox');
    for (const key of ['theme','font','viewport','sandbox']) {
      const expected=job.environment[key],actual=environment[key];
      const equal=key==='viewport'?Object.keys(expected).every(k=>expected[k]===actual[k]):expected===actual;
      if (!equal) throw new FigureError('environment',`${key} did not match the requested environment.`,{expected,actual});
    }
    if (!environment.loadedFonts.length||!environment.loadedFonts.every(f=>f.status==='loaded')) throw new FigureError('environment','The requested bundled typeface did not load.',{environment});
    if (!environment.renderer?.includes('SwiftShader')) throw new FigureError('environment','The renderer is not the requested SwiftShader backend.',{environment});
    // Font loading can affect layout: the final readiness boundary follows it.
    setStage('render-readiness');
    const ready=await p.evaluate(waitForFigureReady,stableValue.toString(),60000);
    observations.readiness.push({stage,...ready});
    if (listTargets) {
      const cleanup=await chrome.close();observations.cleanup=cleanup;
      if (controller.signal.aborted) throw controller.signal.reason;
      requireNormalShutdown(cleanup);chrome=undefined;
      await server.close();server=undefined;
      return {ok:true,targets:ready.targets,environment,observations,cleanup};
    }
    const selected=selectTargets(job.figure.targets,ready.targets),options={...job.figure,targets:selected};
    if (job.referenceEnvironment) {
      setStage('reference-environment');
      const reference=JSON.parse(await readFile(path.resolve(path.dirname(path.resolve(jobPath)),job.referenceEnvironment),'utf8'));
      if (reference.kind!=='vibemol.figure.environment'||reference.version!==1||!reference.ok) throw new FigureError('environment','Not a successful Figure environment record.');
      const expected={browser:reference.browser.product,revision:reference.browser.revision,renderer:reference.observed.renderer,
        vendor:reference.observed.vendor,glVersion:reference.observed.glVersion,theme:reference.observed.theme,font:reference.observed.font,
        fontFamily:reference.observed.fontFamily,viewport:reference.observed.viewport,sandbox:reference.observed.sandbox};
      const actual={browser:version.product,revision:version.revision,renderer:environment.renderer,vendor:environment.vendor,
        glVersion:environment.glVersion,theme:environment.theme,font:environment.font,fontFamily:environment.fontFamily,viewport:environment.viewport,sandbox:environment.sandbox};
      if (!stableValue(expected,actual)) throw new FigureError('environment','Replay environment differs from the reference record.',{expected,actual});
      for (const [name,value] of Object.entries(reference.app.resources)) {
        if (!/^\/(index\.html|assets\/[^\0]+|src\/[^\0]+)$/.test(name)||name.split('/').includes('..')) throw new FigureError('environment','Invalid resource path in reference record.');
        const actualHash=digest(await readFile(path.join(appRoot,name)));
        if (actualHash!==value.sha256) throw new FigureError('environment','Replay app/font resource differs from the reference record.',{resource:name,expected:value.sha256,actual:actualHash});
      }
      if (reference.session.sha256!==digest(bytes)) throw new FigureError('environment','Replay session differs from the reference record.',{expected:reference.session.sha256,actual:digest(bytes)});
      if (!stableValue(reference.figure,options)) throw new FigureError('environment','Replay Figure options differ from the reference record.',{expected:reference.figure,actual:options});
      observations.referenceEnvironmentVerified=true;
    }
    setStage('figure');
    const result=await p.evaluate(async options=>{
      // Reuse the product's layout/device limits. No second rendering arithmetic.
      const plan=VibeMolFigureComposer.layout(options.targets.length,options,VibeMolFigure.limits().panel);
      if (plan.error) throw Error(plan.error);
      const panels=[],start=performance.now();
      const blob=await VibeMolFigure.compose({...options,signal:__vmFigureAbort.signal,onPanel:p=>panels.push(p)});
      const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
      for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
      return {base64:btoa(binary),type:blob.type,bytes:blob.size,elapsedMs:performance.now()-start,panels,
        dimensions:{width:plan.width,height:plan.height},resolvedOptions:plan.options,limits:VibeMolFigure.limits()};
    },options);
    setStage('output');
    if (server.errors.length) throw new FigureError('resources','App resources failed to load.',{errors:server.errors});
    const image=Buffer.from(result.base64,'base64');delete result.base64;
    const imageName='figure.'+options.format;
    const replay={...job,session:'session.vibemol-session',output:'../replayed-figure',figure:options,referenceEnvironment:'environment.json'};
    const record={kind:'vibemol.figure.environment',version:1,ok:true,started,completed:new Date().toISOString(),
      requested:job.environment,observed:environment,browser:version,
      browserCommandLine:commandLine,
      chromeFlags:chrome.args.filter(a=>!a.startsWith('--user-data-dir=')&&!a.startsWith('--remote-debugging-port=')&&a!=='about:blank'),
      host:{platform:os.platform(),release:os.release(),arch:os.arch(),node:process.version},
      app:{...gitIdentity(appRoot),resources:Object.fromEntries([...server.resources].sort(([a],[b])=>a.localeCompare(b)))},
      runner:{files:Object.fromEntries(await Promise.all(['figure-runner.mjs','figure-browser.mjs','figure-job.mjs'].map(async name=>[name,digest(await readFile(new URL(name,import.meta.url)))])))},
      session:{originalPath:sessionPath,sha256:digest(bytes),bytes:bytes.length},
      image:{filename:imageName,sha256:digest(image),...result},figure:options,observations,deadlineMs,
      reproduction:'Same session, options, app-resource hashes, browser, fonts and renderer are required. The record exposes platform differences; it does not promise cross-platform byte identity.'};
    const targets=await p.send('Target.getTargets',{},null);
    const livePages=targets.targetInfos.filter(t=>t.type==='page');
    if (livePages.length!==1) throw new FigureError('cleanup','Unexpected extra browser pages.',{pages:livePages});
    record.cleanup={pagesBeforeClose:livePages.length,...await chrome.close()};
    observations.cleanup=record.cleanup;
    if (controller.signal.aborted) throw controller.signal.reason;
    requireNormalShutdown(record.cleanup);chrome=undefined;
    await server.close();server=undefined;record.cleanup.serverClosed=true;
    await writeFile(path.join(temporary,imageName),image,{flag:'wx'});
    await writeFile(path.join(temporary,'session.vibemol-session'),bytes,{flag:'wx'});
    await writeFile(path.join(temporary,'job.json'),JSON.stringify(replay,null,2)+'\n',{flag:'wx'});
    await writeFile(path.join(temporary,'environment.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    if (controller.signal.aborted) throw controller.signal.reason;
    await absent(output);await rename(temporary,output);temporary=undefined;
    return {ok:true,output,image:path.join(output,imageName),record:path.join(output,'environment.json'),imageSha256:record.image.sha256};
  } catch(error) {
    const failure={ok:false,stage:error.stage||stage,error:error.message,detail:error.detail||{},started,
      observedAt:new Date().toISOString(),observations,browserEvents:chrome?.protocol.events.slice(-40),chromeStderr:chrome?.stderr()};
    // A failed/cancelled run never publishes a success bundle or overwrites evidence.
    if (output&&lock) {
      const filename=output+'.error-'+Date.now()+'.json';
      await writeFile(filename,JSON.stringify(failure,null,2)+'\n',{flag:'wx'});failure.report=filename;
    }
    error.figureReport=failure;throw error;
  } finally {
    signal?.removeEventListener('abort',abort);
    // Even a browser/profile cleanup error must not strand the server or lock.
    try {await chrome?.close();}
    finally {
      try {await server?.close();}
      finally {
        try {if (temporary) await rm(temporary,{recursive:true,force:true});}
        finally {try {if (lock) {try {await lock.close();} finally {await rm(output+'.lock',{force:true});}}}finally{clearTimeout(timer);}}
      }
    }
  }
}

async function main(args) {
  const help='Usage: node api/figure-runner.mjs JOB.json --browser /path/to/chrome [--app-root DIR] [--list-targets] [--deadline-ms 300000]\nOutputs a new directory containing figure.png/svg, session.vibemol-session, job.json and environment.json. Never overwrites it. SIGINT/SIGTERM cancel; failures emit JSON and exit nonzero.';
  if(args.includes('--help')) {console.log(help);return;}
  const job=args.shift(),options={};
  if (!job) throw new FigureError('validation',help);
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--list-targets') options.listTargets=true;
    else if(['--browser','--app-root','--deadline-ms'].includes(args[i])&&args[i+1]) {
      const key={'--browser':'browser','--app-root':'appRoot','--deadline-ms':'deadlineMs'}[args[i]];options[key]=args[++i];if(key==='deadlineMs')options[key]=Number(options[key]);
    } else throw new FigureError('validation',`Unknown or incomplete option: ${args[i]}.`);
  }
  const controller=new AbortController();
  const cancel=()=>controller.abort(new FigureError('cancelled','Figure job cancelled by signal.'));
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  try {console.log(JSON.stringify(await runFigureJob(job,{...options,signal:controller.signal,onStage:stage=>console.error(JSON.stringify({event:'stage',stage}))})));}
  finally {process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error=>{
  console.error(JSON.stringify(error.figureReport||{ok:false,stage:error.stage||'validation',error:error.message}));
  process.exitCode=error.stage==='cancelled'?130:1;
});
