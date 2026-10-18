"""Authorized read-only diagnostic. Original accessibility suite/assertions stay intact."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import sys
import time
import traceback

parser=argparse.ArgumentParser()
parser.add_argument('--harness-root',type=Path,required=True)
parser.add_argument('--source-root',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--source-commit',required=True)
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=False)
manifest=json.loads((Path(__file__).parent/'hint-diagnostic-manifest.json').read_text())
suite=args.harness_root/'tests/e2e/accessibility.py';baseline=args.harness_root/'tests/baselines/color-contrast.json'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(suite)==manifest['accessibilitySha256'] and sha(baseline)==manifest['baselineSha256']
sys.path.insert(0,str(args.harness_root/'tests/e2e'))
import accessibility as audit
# Same unmodified harness/baseline/axe bytes for every immutable source.
# Only the server root, evidence destination and truthful version metadata vary.
audit.p.ROOT=args.source_root;audit.p.ARTIFACTS=args.output
version=re.search(r"const APP_VERSION = '([^']+)';",(args.source_root/'assets/app/js/asset-urls.js').read_text()).group(1)
audit.read_app_version=lambda:version
original_prepare=audit.prepare;original_inspect=audit.inspect
measurements=[];case={'theme':None,'mode':None};scan=0;compositor_frames=[];sessions=[]
INIT=r'''(() => {
  const ids=new WeakMap();let nextId=0,firstSeen=null,lastMutation=null,signature=null;
  let frameCount=0,fontsReadyAt=null;const paints=[];const themeEvents=[];
  document.fonts.ready.then(()=>{fontsReadyAt=performance.now();themeEvents.push({kind:'fonts-ready',at:fontsReadyAt});});
  new PerformanceObserver(list=>paints.push(...list.getEntries().map(e=>({name:e.name,startTime:e.startTime})))).observe({type:'paint',buffered:true});
  ['transitionrun','transitionstart','transitionend','transitioncancel'].forEach(kind=>document.addEventListener(kind,e=>themeEvents.push({kind,at:performance.now(),target:e.target.id||e.target.tagName,property:e.propertyName,elapsed:e.elapsedTime}),true));
  new MutationObserver(records=>records.forEach(r=>themeEvents.push({kind:'theme-mutation',at:performance.now(),theme:document.documentElement.dataset.theme,old:r.oldValue}))).observe(document.documentElement||document,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['data-theme']});
  const events=[];const finite=v=>Number.isFinite(Number(v))?Number(v):null;
  function snapshot(kind){
    const e=document.getElementById('hint'),now=performance.now();
    if(!e)return {kind,at:now,node:null};
    if(!ids.has(e)){ids.set(e,++nextId);if(firstSeen===null)firstSeen=now;}
    const s=getComputedStyle(e),r=e.getBoundingClientRect();
    return {kind,at:now,timeOrigin:performance.timeOrigin,frameCount,fontsReadyAt,paints:paints.slice(),theme:document.documentElement.dataset.theme,
      activeTransitions:document.getAnimations().filter(a=>a instanceof CSSTransition&&a.playState!=='finished').map(a=>({target:a.effect?.target?.id||a.effect?.target?.tagName,property:a.transitionProperty,playState:a.playState,currentTime:finite(a.currentTime)})),
      canvases:Array.from(document.querySelectorAll('canvas')).map(c=>({width:c.width,height:c.height,rect:c.getBoundingClientRect().toJSON(),connected:c.isConnected})),nodeId:ids.get(e),firstSeenAt:firstSeen,lastMutationAt:lastMutation,
      sinceLastObservedMutationMs:lastMutation===null?null:now-lastMutation,
      connected:e.isConnected,html:e.outerHTML,className:e.className,ariaHidden:e.getAttribute('aria-hidden'),
      text:e.textContent,display:s.display,visibility:s.visibility,opacity:s.opacity,
      foreground:s.color,background:s.backgroundColor,transitionProperty:s.transitionProperty,
      transitionDuration:s.transitionDuration,transitionDelay:s.transitionDelay,
      rect:r.toJSON(),animations:e.getAnimations().map(a=>({type:a.constructor.name,
        playState:a.playState,currentTime:finite(a.currentTime),startTime:finite(a.startTime),
        progress:finite(a.effect?.getComputedTiming().progress)})),
      mode:window.VibeMolWorkbenchHost?.getMode?.()||null,version:window.VibeMolAssets?.version||null,
      viewport:{width:innerWidth,height:innerHeight},scrollTop:document.querySelector('#subspacePanel .vm-list-popover__body')?.scrollTop??null};
  }
  function capture(kind){const x=snapshot(kind);events.push(x);return x;}
  new MutationObserver(records=>{
    if(records.some(r=>r.target?.id==='hint'||r.target?.parentElement?.id==='hint'||
       Array.from(r.addedNodes||[]).some(n=>n.id==='hint')||Array.from(r.removedNodes||[]).some(n=>n.id==='hint'))){
      lastMutation=performance.now();capture('hint-mutation');
    }
  }).observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','aria-hidden','style']});
  function frame(){
    frameCount++;const x=snapshot('rAF-observation-not-a-paint-guarantee');
    const key=JSON.stringify([x.nodeId,x.className,x.ariaHidden,x.opacity,x.visibility,x.display,x.rect]);
    if(key!==signature){signature=key;events.push(x);}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__vmHintDiagnostic={mark:capture,read:()=>({now:performance.now(),events:events.slice(),themeEvents:themeEvents.slice(),paints:paints.slice(),frameCount})};
})();'''

def prepare(page,url,theme,mode):
    global scan
    case.update(theme=theme,mode=mode);scan=0
    page.add_init_script(INIT)
    if theme=='dark' and mode=='Calculations':
        # CDP compositor observations run alongside the original waits; no
        # sleeps or readiness conditions are introduced. Frames are evidence,
        # never a contrast substitute or a merge gate.
        session=page.context.new_cdp_session(page);sessions.append(session)
        frame_dir=args.output/'dark-calculations-compositor';frame_dir.mkdir()
        def on_frame(event):
            data=base64.b64decode(event['data']);index=len(compositor_frames)+1
            path=frame_dir/f'frame-{index:04d}.png';path.write_bytes(data)
            compositor_frames.append(dict(index=index,path=str(path.relative_to(args.output)),sha256=hashlib.sha256(data).hexdigest(),metadata=event['metadata']))
            session.send('Page.screencastFrameAck',{'sessionId':event['sessionId']})
        session.on('Page.screencastFrame',on_frame)
        session.send('Page.startScreencast',{'format':'png','maxWidth':320,'maxHeight':202,'everyNthFrame':1})
    return original_prepare(page,url,theme,mode)

def inspect(page):
    global scan
    scan+=1
    record={'theme':case['theme'],'mode':case['mode'],'scan':scan,
            'expectedNewIncompleteTargets':[],'expectedContrastRatio':'4.5:1',
            'before':page.evaluate("()=>__vmHintDiagnostic.mark('before-axe')")}
    try:
        result=original_inspect(page)
        record['axeHintResults']=[{'kind':kind,'rule':rule['id'],'node':node}
            for kind in ['passes','incomplete','violations','inapplicable']
            for rule in result[kind] for node in rule['nodes'] if node['target']==['#hint']]
        return result
    finally:
        record['after']=page.evaluate("()=>__vmHintDiagnostic.mark('after-axe')")
        record['timeline']=page.evaluate('()=>__vmHintDiagnostic.read()')
        measurements.append(record)
        print('[hint-diagnostic-comparands] '+json.dumps(record,sort_keys=True),flush=True)

audit.prepare=prepare;audit.inspect=inspect
status={'role':'diagnostic only; no merge acceptance','sourceCommit':args.source_commit,
        'sourceAppSha256':sha(args.source_root/'assets/app/js/app.js'),'sourceVersion':version,
        'harnessAccessibilitySha256':sha(suite),'baselineSha256':sha(baseline),
        'originalAssertionsAndWaitsUnchanged':True,'started':time.time(),
        'measurementLimit':'Readonly style/layout observations and CDP screencast may perturb timing. rAF is not proof of paint; actual compositor frames are separately retained for dark Calculations. firstSeenAt is first observation, not DOM creation time.'}
sys.argv=[str(suite)]
try:
    audit.main();status['originalSuiteExitCode']=0
except BaseException as error:
    status.update(originalSuiteExitCode=int(error.code) if isinstance(error,SystemExit) and isinstance(error.code,int) else 1,
                  exceptionType=type(error).__name__,error=str(error),traceback=traceback.format_exc())
    raise
finally:
    status.update(completed=time.time(),measurements=measurements,
        compositorFrames=compositor_frames,originalHarnessStillUnchanged=sha(suite)==manifest['accessibilitySha256'],
        baselineStillUnchanged=sha(baseline)==manifest['baselineSha256'])
    (args.output/'hint-measurements.json').write_text(json.dumps(status,indent=2)+'\n')
