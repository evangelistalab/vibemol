import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'worktree/tests/e2e'))
from accessibility import settled_frame
from playwright.sync_api import sync_playwright
out=Path(__file__).parent
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
 try:
  for action in ['no-transition','transition','cancellation']:
   page=browser.new_page()
   page.set_content('<style>div{color:rgb(0,0,0);transition:color 200ms linear}div.changed{color:rgb(255,255,255)}</style><div id="hint">Text</div>')
   page.evaluate("""action=>{window.events=[];window.frames=0;function frame(){frames++;requestAnimationFrame(frame)}requestAnimationFrame(frame);document.addEventListener('transitionend',e=>events.push({kind:e.type,at:performance.now()}),true);document.addEventListener('transitioncancel',e=>events.push({kind:e.type,at:performance.now()}),true);const e=document.getElementById('hint');getComputedStyle(e).color;if(action!=='no-transition'){e.classList.add('changed');getComputedStyle(e).color;}if(action==='cancellation')requestAnimationFrame(()=>{e.style.transition='none';});window.startFrames=frames;}""",action)
   state=settled_frame(page)
   observation=page.evaluate('()=>({events,frames:frames-startFrames,at:performance.now(),color:getComputedStyle(document.getElementById("hint")).color})')
   assert state['fonts']=='loaded' and state['activeTransitions']==0 and observation['frames']>=2,(action,state,observation)
   if action=='transition':assert observation['events'] and state['at']>=observation['events'][-1]['at'],(action,state,observation)
   results.append(dict(action=action,state=state,observation=observation))
   page.close()
 finally:browser.close()
(out/'barrier-control.json').write_text(json.dumps(dict(status='passed',results=results),indent=2)+'\n')
print(json.dumps(results,indent=2))
