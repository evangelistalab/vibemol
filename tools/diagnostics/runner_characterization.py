"""One explicitly dispatched runner/2,000-atom profile; not a merge gate."""
from __future__ import annotations
import hashlib,json,os,platform,subprocess,sys,threading,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/e2e'))
OUT=Path(os.environ['VIBEMOL_TEST_ARTIFACT_DIR']);OUT.mkdir(parents=True,exist_ok=True)

def read(path):
    try:return Path(path).read_text()
    except OSError:return None

def numbers(path):
    text=read(path)
    if text is None:return None
    return {line.split(':',1)[0]:int(line.split(':',1)[1].strip().split()[0])for line in text.splitlines()if ':'in line and line.split(':',1)[1].strip().split()[0].isdigit()}

def command(*args):
    run=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    return dict(exitCode=run.returncode,output=run.stdout)

def processes(root_pid):
    rows={}
    for path in Path('/proc').glob('[0-9]*/stat'):
        try:
            raw=path.read_text();fields=raw[raw.rfind(')')+2:].split();pid=int(path.parent.name)
            rows[pid]=dict(pid=pid,ppid=int(fields[1]),name=raw[raw.find('(')+1:raw.rfind(')')],
                           userTicks=int(fields[11]),systemTicks=int(fields[12]))
        except (OSError,ValueError,IndexError):continue
    selected={root_pid};changed=True
    while changed:
        children={pid for pid,row in rows.items()if row['ppid']in selected}-selected
        changed=bool(children);selected|=children
    result=[]
    for pid in sorted(selected&rows.keys()):
        row=rows[pid];memory=numbers(f'/proc/{pid}/smaps_rollup')
        row['memoryKiB']=memory;result.append(row)
    return result

class Capture:
    def __init__(self):self.phase='startup';self.rows=[];self.errors=[];self.lock=threading.Lock();self.stop=threading.Event();self.started=time.monotonic()
    def sample(self):
        with self.lock:
            rows=processes(os.getpid());known=[r['memoryKiB']for r in rows if r['memoryKiB']is not None]
            row=dict(elapsedMs=(time.monotonic()-self.started)*1000,phase=self.phase,processes=rows,
                     processPssKiB=sum(x.get('Pss',0)for x in known),processRssKiB=sum(x.get('Rss',0)for x in known),
                     missingProcessMemory=len(rows)-len(known),hostMemInfoKiB=numbers('/proc/meminfo'),
                     hostCpu=read('/proc/stat'),cpuPressure=read('/proc/pressure/cpu'),memoryPressure=read('/proc/pressure/memory'),
                     cgroup={name:read('/sys/fs/cgroup/'+name)for name in ['memory.current','memory.max','memory.peak','memory.events','cpu.max','cpu.stat','cpu.pressure','memory.pressure']})
            self.rows.append(row)
            with (OUT/'resource-samples.jsonl').open('a')as f:f.write(json.dumps(row)+'\n')
    def loop(self):
        while not self.stop.wait(1):
            try:self.sample()
            except Exception as error:self.errors.append(dict(elapsedMs=(time.monotonic()-self.started)*1000,error=repr(error)))
    def __enter__(self):
        self.sample();self.thread=threading.Thread(target=self.loop,daemon=True);self.thread.start();return self
    def __exit__(self,*errors):
        self.stop.set();self.thread.join();self.sample()
        valid=[r for r in self.rows if r['missingProcessMemory']==0]
        report=dict(sampleCount=len(self.rows),samplingErrors=self.errors,cadenceSeconds=1,performanceAcceptanceThreshold=None,
            peakProcessPssKiB=max((r['processPssKiB']for r in valid),default=None),
            peakProcessRssKiB=max((r['processRssKiB']for r in valid),default=None),
            minimumHostAvailableKiB=min((r['hostMemInfoKiB']['MemAvailable']for r in self.rows if r['hostMemInfoKiB']and'MemAvailable'in r['hostMemInfoKiB']),default=None),
            missingProcessMemorySamples=sum(r['missingProcessMemory']>0 for r in self.rows),
            byPhase={phase:dict(samples=sum(r['phase']==phase for r in self.rows),peakPssKiB=max((r['processPssKiB']for r in valid if r['phase']==phase),default=None))for phase in sorted({r['phase']for r in self.rows})},
            interpretation='PSS apportions shared pages; summed RSS double-counts them. These are sampled process-tree peaks, not allocation maxima. /proc/cgroup snapshots retain whole-runner memory/CPU pressure; absent data is null. No timeout cause is inferred from this one run.')
        (OUT/'resource-summary.json').write_text(json.dumps(report,indent=2)+'\n');print('[runner-resources] '+json.dumps(report),flush=True)

identity=dict(platform=platform.platform(),python=sys.version,logicalCpus=os.cpu_count(),
    runner={key:os.environ.get(key)for key in ['RUNNER_NAME','RUNNER_OS','RUNNER_ARCH','ImageOS','ImageVersion','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_SHA']},
    cpuInfo=read('/proc/cpuinfo'),memInfo=read('/proc/meminfo'),cgroup=read('/proc/self/cgroup'),
    osRelease=read('/etc/os-release'),lscpu=command('lscpu'),disk=command('df','-h','.'),
    appSha256=hashlib.sha256((ROOT/'assets/app/js/app.js').read_bytes()).hexdigest(),
    lockSha256=hashlib.sha256((ROOT/'api/requirements-ci.lock').read_bytes()).hexdigest())
(OUT/'runner-identity.json').write_text(json.dumps(identity,indent=2)+'\n')
import edit_picking as suite
from ci_gate_diagnostics import record_renderer
with Capture()as capture:
    with suite.p.run_http_server(suite.p.ROOT)as url,suite.p.sync_playwright()as pw:
        browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        page=browser.new_page(viewport=dict(width=1200,height=900),device_scale_factor=1)
        page.route('**/assets/app/js/app.js*',lambda route:route.fulfill(body=suite.instrumented_source(),content_type='application/javascript'))
        page.on('dialog',lambda dialog:dialog.dismiss());errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            page.goto(url+'?workspaceLab=1&appearanceStudy=1');page.wait_for_function('()=>window.__editProbe')
            record_renderer(page,OUT,'runner-profile')
            capture.phase='original Edit prelude';capture.sample()
            suite.single_atom_translation(page);suite.selection_position_fields(page)
            capture.phase='2000 atoms /5400 bonds';capture.sample();suite.slab(page)
            state=page.evaluate('()=>{const v=VibeMolStructure.exportActive().volume;return {atoms:v.atoms.length,bonds:v.bonds.length,heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null}}')
            print('[runner-scene] '+json.dumps(dict(actual=state,expected=dict(atoms=2000,bonds=5400))),flush=True)
            assert state['atoms']==2000 and state['bonds']==5400 and not errors,(state,errors)
            (OUT/'scene.json').write_text(json.dumps(state,indent=2)+'\n');capture.sample()
        finally:
            capture.phase='retirement';browser.close()
            assert not browser.contexts and not browser.is_connected(),'Runner profile must retire all browser contexts'
