#!/usr/bin/env python3
"""CPU profiles for the NaCl Edit-mode regression; requires Playwright Chromium.

Example (Apple hardware renderer):
  python tools/profile_nacl_edit.py --angle metal --output /tmp/vibemol-nacl-profile
Run on an otherwise idle machine. Frame durations measure the render callback's
CPU time, not GPU completion time or presentation FPS.
"""
import argparse
import asyncio
import json
import pathlib
import sys
import time

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
from helpers import run_http_server

MONITOR = '''() => {
  window.profileFrames = {}; window.profileLongTasks = {}; window.profilePhase = '';
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(function(timestamp) {
    if (callback.name !== 'render') return callback(timestamp);
    const start = performance.now(), phase = window.profilePhase;
    try { return callback(timestamp); }
    finally { if (phase) (profileFrames[phase] ||= []).push([start, performance.now()-start]); }
  });
  new PerformanceObserver(list => {
    if (profilePhase) (profileLongTasks[profilePhase] ||= []).push(...list.getEntries().map(e=>[e.startTime,e.duration]));
  }).observe({entryTypes:['longtask']});
}'''


async def profile_edit_mode(args):
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--use-angle='+args.angle] if args.angle else [])
        context = await browser.new_context(viewport={'width':1200,'height':900}, device_scale_factor=1)
        page = await context.new_page(); errors=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: asyncio.create_task(dialog.dismiss()))
        await page.add_init_script('('+MONITOR+')()')
        with run_http_server(ROOT) as url:
            try:
                await page.goto(url+'?workspaceLab=1')
                await page.wait_for_function('() => window.VibeMolTesting && window.VibeMolEmbed')
                print('Ready',flush=True)
                await page.evaluate('''() => {
                  const original=THREE.Mesh.prototype.onBeforeRender;
                  THREE.Mesh.prototype.onBeforeRender=function(renderer, scene, camera, ...args){
                    if(this.userData.type==='atom'){ window.profileRenderer=renderer;window.profileScene=scene; }
                    return original.call(this, renderer,scene,camera,...args);
                  };
                }''')
                cdp=await context.new_cdp_session(page)
                await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{'interval':1000})
                summary={'errors':errors}

                async def phase(name, action=None, seconds=0):
                    print('Start '+name,flush=True)
                    await page.evaluate('name=>profilePhase=name',name)
                    await cdp.send('Profiler.start')
                    started=time.perf_counter()
                    result=await asyncio.wait_for(action(),timeout=100) if action else None
                    action_ms=(time.perf_counter()-started)*1000
                    if seconds: await asyncio.sleep(seconds)
                    profile=(await cdp.send('Profiler.stop'))['profile']
                    (out/(name+'.cpuprofile')).write_text(json.dumps(profile))
                    measured=await page.evaluate('''name=>({frames:profileFrames[name]||[],longTasks:profileLongTasks[name]||[],
                      memory:profileRenderer?profileRenderer.info.memory:null})''',name)
                    summary[name]={'action_ms':action_ms,'result':result,**measured}
                    (out/'summary.json').write_text(json.dumps(summary,indent=2))
                    print(name+': '+json.dumps({k:v for k,v in summary[name].items() if k not in ['frames','longTasks']})+
                          ' frames='+str(len(measured['frames'])),flush=True)
                    await page.evaluate("() => profilePhase=''")

                nx,ny,nz=20,20,5
                rows=[f"{'Na' if (i+j+k)%2==0 else 'Cl'} {(i-(nx-1)/2)*2.82} {(j-(ny-1)/2)*2.82} {(k-(nz-1)/2)*2.82}" for i in range(nx) for j in range(ny) for k in range(nz)]
                xyz='\n'.join([str(len(rows)),'NaCl slab, 20 x 20 x 5, 2.82 angstrom lattice spacing']+rows)+'\n'
                (out/'nacl-2000.xyz').write_text(xyz)
                await phase('load',lambda:page.evaluate('text=>VibeMolEmbed.loadFiles([{name:"NaCl-2000.xyz",text}],{clearFirst:true})',xyz))
                summary['gpu']=await page.evaluate('''() => {const g=profileRenderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');
                  return {vendor:e?g.getParameter(e.UNMASKED_VENDOR_WEBGL):'',renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):''};}''')
                summary['settings']=await page.evaluate('() => VibeMolPreset.export().settings')
                summary['structure']=await page.evaluate('() => { const v=VibeMolStructure.exportActive().volume;return {atoms:v.atoms.length,bonds:v.bonds.length};}')
                await asyncio.sleep(1)
                await phase('view_idle',seconds=args.seconds)
                await phase('enter_edit',lambda:page.evaluate('''() => {const start=performance.now();document.querySelector('#modeEditBtn').click();return performance.now()-start;}'''),seconds=1)
                await phase('edit_idle',seconds=args.seconds)
                await phase('edit_hover',lambda:page.mouse.move(750,450),seconds=args.seconds)
                await phase('leave_edit',lambda:page.evaluate("() => {const start=performance.now();document.querySelector('#modeDisplayBtn').click();return performance.now()-start;}"),seconds=1)
                await page.screenshot(path=str(out/'slab.png'))
                (out/'summary.json').write_text(json.dumps(summary,indent=2))
            finally:
                (out/'errors.json').write_text(json.dumps(errors))
                await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, required=True, help='Directory for CPU profiles, JSON, XYZ and screenshot')
    parser.add_argument('--angle', choices=['metal','swiftshader','gl','vulkan'], help='Explicit renderer (omit for browser default)')
    parser.add_argument('--seconds', type=float, default=4, help='Duration of each idle/hover phase')
    arguments = parser.parse_args()
    if arguments.seconds <= 0:
        parser.error('--seconds must be positive')
    asyncio.run(profile_edit_mode(arguments))
