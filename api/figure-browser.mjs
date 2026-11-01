import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {FigureError} from './figure-job.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const CHROME_FLAGS=Object.freeze(['--headless','--enable-automation','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--disable-background-networking','--disable-component-update','--disable-sync','--force-color-profile=srgb',
  '--lang=en-US','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']);
export function requireNormalShutdown(cleanup) {
  if (cleanup.forced||cleanup.exitCode!==0||cleanup.exitSignal!==null)
    throw new FigureError('cleanup','Chrome did not shut down normally; no output bundle was published.',{cleanup});
}

// Every pending protocol request rejects on disconnect or deadline, including startup.
export class Protocol {
  constructor(socket,signal) {
    this.socket=socket;this.next=0;this.pending=new Map();this.waiters=new Set();this.events=[];this.session=undefined;
    socket.addEventListener('message',e=>{
      const message=JSON.parse(e.data),call=this.pending.get(message.id);
      if (call) { this.pending.delete(message.id); message.error?call.reject(new FigureError('browser',message.error.message)):call.resolve(message.result); }
      else if (message.method) {
        this.events.push(message);
        for (const w of this.waiters) if (w.method===message.method&&w.predicate(message.params)) {this.waiters.delete(w);w.resolve(message.params);}
        this.onEvent?.(message);
      }
    });
    socket.addEventListener('close',()=>this.rejectAll(new FigureError('browser','Chrome disconnected.')));
    socket.addEventListener('error',()=>this.rejectAll(new FigureError('browser','Chrome connection failed.')));
    this.abort=()=>this.rejectAll(signal.reason||new FigureError('cancelled','Figure job cancelled.'));
    signal.addEventListener('abort',this.abort,{once:true});this.signal=signal;
  }
  rejectAll(error) { for (const call of [...this.pending.values(),...this.waiters]) call.reject(error);this.pending.clear();this.waiters.clear(); }
  waitForEvent(method,predicate) {
    if(this.signal.aborted)return Promise.reject(this.signal.reason);
    const found=this.events.find(e=>e.method===method&&predicate(e.params));
    if(found)return Promise.resolve(found.params);
    return new Promise((resolve,reject)=>this.waiters.add({method,predicate,resolve,reject}));
  }
  send(method,params={},session=this.session) {
    if (this.signal.aborted) return Promise.reject(this.signal.reason);
    if (this.socket.readyState!==1) return Promise.reject(new FigureError('browser','Chrome connection is closed.'));
    return new Promise((resolve,reject)=>{const id=++this.next;this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params,...(session?{sessionId:session}:{})}));});
  }
  async evaluate(fn,...args) {
    const r=await this.send('Runtime.evaluate',{expression:`(${fn.toString()})(...${JSON.stringify(args)})`,awaitPromise:true,returnByValue:true});
    if (r.exceptionDetails) throw new FigureError('page',r.exceptionDetails.exception?.description||r.exceptionDetails.text,{exception:r.exceptionDetails});
    return r.result.value;
  }
  closeBrowser() {
    // This one teardown request must work after the job's signal has aborted.
    return new Promise((resolve,reject)=>{const id=++this.next;this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method:'Browser.close'}));});
  }
  dispose() { this.signal.removeEventListener('abort',this.abort);this.socket.close();this.rejectAll(new FigureError('browser','Chrome closed.')); }
}

export async function serveApp(root,sessionText) {
  const base=await realpath(root),resources=new Map(),errors=[];
  const server=http.createServer(async(req,res)=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if (pathname==='/favicon.ico') {res.statusCode=204;res.end();return;}
      if (pathname==='/__figure_session') {res.setHeader('Content-Type','application/json');res.end(sessionText);return;}
      if (pathname!=='/'&&pathname!=='/index.html'&&!pathname.startsWith('/assets/')&&!pathname.startsWith('/src/')) throw Error('Not a public app resource.');
      const target=await realpath(path.join(base,pathname==='/'?'index.html':pathname));
      if (!target.startsWith(base+path.sep)) throw Error('Resource escapes the app directory.');
      const bytes=await readFile(target),key=pathname==='/'?'/index.html':pathname,hash=digest(bytes);
      if (resources.has(key)&&resources.get(key).sha256!==hash) throw Error('App resource changed during the job.');
      resources.set(key,{sha256:hash,bytes:bytes.length});
      const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.xyz':'text/plain'}[path.extname(target)]||'application/octet-stream';
      res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.end(bytes);
    } catch(error) {errors.push({url:req.url,error:String(error)});res.statusCode=404;res.end(String(error));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {origin:`http://127.0.0.1:${server.address().port}`,resources,errors,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}

export async function launchChrome(executable,signal,{sandbox=true,deadlineAt=Date.now()+300000}={}) {
  signal.throwIfAborted();
  const profile=await mkdtemp(path.join(tmpdir(),'vibemol-figure-'));
  const args=[...CHROME_FLAGS,...(sandbox?[]:['--no-sandbox']),'--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'];
  const child=spawn(executable,args,{stdio:['ignore','ignore','pipe'],detached:true});let stderr='',protocol,closed;
  const exited=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
  const close=async()=>{
    if (closed) return closed;
    const start=performance.now();let forced=false,closeAckMs=null;
    const kill=()=>{if(child.exitCode!==null||child.signalCode!==null)return;forced=true;try {process.kill(-child.pid,'SIGKILL');}catch {child.kill('SIGKILL');}};
    // Normal shutdown shares the job's absolute deadline, not a short new
    // performance threshold. Cancellation discards this private process group.
    const force=setTimeout(kill,Math.max(1,deadlineAt-Date.now()));
    // AbortSignal may already be set: send the Figure abort/Browser.close directly.
    if (protocol?.socket.readyState===1) {
      protocol.socket.send(JSON.stringify({id:++protocol.next,method:'Runtime.evaluate',sessionId:protocol.session,
        params:{expression:'globalThis.__vmFigureAbort?.abort()'}}));
      // Await delivery/ack (or disconnect); closing the socket immediately after
      // queuing Browser.close can drop that command and force every teardown.
      if (signal.aborted) {kill();protocol.dispose();}
      else {try {await protocol.closeBrowser();closeAckMs=performance.now()-start;} catch {}}
    }
    if (child.exitCode===null) {
      if (!protocol) {if(signal.aborted)kill();else child.kill('SIGTERM');}
      await exited;
    }
    protocol?.dispose();
    clearTimeout(force);
    await rm(profile,{recursive:true,force:true,maxRetries:3});
    closed={browserExited:true,profileRemoved:true,exitCode:child.exitCode,exitSignal:child.signalCode,
      forced,closeAckMs,elapsedMs:performance.now()-start};return closed;
  };
  try {
    const endpoint=await new Promise((resolve,reject)=>{
      const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
      child.once('error',reject);child.once('exit',code=>reject(new FigureError('browser',`Chrome exited during startup (${code}).`,{stderr})));
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-65536);const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){signal.removeEventListener('abort',abort);resolve(m[1]);}});
    });
    const socket=new WebSocket(endpoint);
    await new Promise((resolve,reject)=>{
      const abort=()=>{socket.close();reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});
      socket.addEventListener('open',()=>{signal.removeEventListener('abort',abort);resolve();},{once:true});
      socket.addEventListener('error',()=>reject(new FigureError('browser','Could not connect to Chrome.')),{once:true});
    });
    protocol=new Protocol(socket,signal);
    const version=await protocol.send('Browser.getVersion',{},null);
    const {targetInfos}=await protocol.send('Target.getTargets',{},null),page=targetInfos.find(t=>t.type==='page');
    if (!page) throw new FigureError('browser','Chrome did not create a page.');
    protocol.session=(await protocol.send('Target.attachToTarget',{targetId:page.targetId,flatten:true},null)).sessionId;
    await protocol.send('Runtime.enable');await protocol.send('Page.enable');await protocol.send('Log.enable');
    return {protocol,version,close,args,stderr:()=>stderr};
  } catch(error) {await close();throw error;}
}

// Serialized into the browser. No app closures, private state, or testing API.
export async function waitForFigureReady(stableSource,deadlineMs) {
  const same=Function(`return (${stableSource})`)();
  const start=performance.now(),samples=[];
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const check=()=>{if (performance.now()-start>deadlineMs) throw Error('Figure readiness deadline: '+JSON.stringify({elapsedMs:performance.now()-start,samples}));};
  while (!(window.VibeMolSession&&window.VibeMolFigure&&window.VibeMolPrefs)) {check();await frame();}
  await document.fonts.ready;
  for (const animation of document.getAnimations()) {
    if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) await animation.finished.catch(()=>{});
  }
  let previous={viewport:VibeMolFigure.viewport(),targets:VibeMolFigure.listTargets()},stableFrames=0;
  while (stableFrames<2) {
    check();await frame();
    const current={viewport:VibeMolFigure.viewport(),targets:VibeMolFigure.listTargets()};
    stableFrames=same(previous,current)?stableFrames+1:0;
    samples.push({timeMs:performance.now()-start,stableFrames,state:current});if(samples.length>12)samples.shift();
    previous=current;
  }
  return {elapsedMs:performance.now()-start,stableFrames,samples,viewport:previous.viewport,targets:previous.targets};
}
