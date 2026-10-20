"""Pre-change fitted camera goldens; observe existing callbacks, never replace fitting."""
import argparse, gzip, hashlib, json, math, subprocess, sys, time, traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
import premerge as p
import characterize
import smoke
from playwright.sync_api import sync_playwright

HOOK = r'''() => {
  window.fitProbe = {updates: [], tracking: false};
  const intercept = (name, method, capture) => {
    let api;
    Object.defineProperty(window, name, {configurable: true, get: () => api, set(value) {
      api = Object.freeze({...value, [method](deps) {
        capture(deps);
        return value[method](deps);
      }});
    }});
  };
  intercept('VibeMolEditState', 'createEditStateController', deps => fitProbe.rebuild = deps.rebuildScene);
  intercept('VibeMolFigureRenderer', 'create', deps => {
    fitProbe.deps = deps;
    const update = THREE.OrthographicCamera.prototype.updateProjectionMatrix;
    THREE.OrthographicCamera.prototype.updateProjectionMatrix = function(...args) {
      const result = update.apply(this, args);
      if (fitProbe.tracking && this === deps.camera()) {
        fitProbe.updates.push({position: this.position.toArray(), target: deps.controls.target.toArray(),
          left: this.left, right: this.right, top: this.top, bottom: this.bottom,
          caller: new Error().stack.split('\n').slice(2, 5)});
      }
      return result;
    };
  });
  fitProbe.read = () => {
    const {camera: getCamera, controls, bounds, renderer} = fitProbe.deps;
    const c = getCamera(), box = bounds(), ndc = new THREE.Box3();
    c.updateMatrixWorld(true);
    if (!box.isEmpty()) for(const x of [box.min.x,box.max.x])
      for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z])
        ndc.expandByPoint(new THREE.Vector3(x,y,z).project(c));
    const rect = renderer.domElement.getBoundingClientRect();
    return {type: c.type, position: c.position.toArray(), target: controls.target.toArray(),
      quaternion: c.quaternion.toArray(), up: c.up.toArray(), zoom: c.zoom,
      left: c.left, right: c.right, top: c.top, bottom: c.bottom,
      fov: c.fov, aspect: c.aspect, near: c.near, far: c.far,
      projectionMatrix: c.projectionMatrix.elements.slice(),
      worldBounds: {min: box.min.toArray(), max: box.max.toArray()},
      projectedBounds: {min: ndc.min.toArray(), max: ndc.max.toArray()},
      viewport: {width: rect.width, height: rect.height},
      qaPinLoaded: !!window.__vmqa};
  };
}'''

def frames(page):
    page.evaluate('() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

def settings(page, values):
    result = page.evaluate('settings=>VibeMolPreset.import({kind:"vibemol.preset",presetVersion:1,settings},{mode:"strict"})', values)
    assert result['ok'], result
    frames(page)

def pubchem(page, fixtures):
    # Reuse the shipped four-endpoint replay. Autocomplete response JSON is
    # availability/UI data, not geometric fit input; triggering it would also
    # require responses for every suggested compound, absent from this corpus.
    if page.locator('body').evaluate('e=>e.classList.contains("sidebar-collapsed")'):
        page.locator('#toolbarShowBtn').click()
    return characterize.pubchem(page)

def fixtures():
    # Match the release's geometric corpus directly from live fixtures/builders.
    cases = []
    root = ROOT / 'tests/fixtures/characterize'
    def file(path):
        pth = root / path
        return dict(name=pth.name.removesuffix('.gz'), text=gzip.decompress(pth.read_bytes()).decode() if path.endswith('.gz') else pth.read_text())
    for path in sorted(root.rglob('*')):
        if not path.is_file(): continue
        name = str(path.relative_to(root))
        if name.endswith(('.cube.gz','.2ccube.gz','.xyz','.vibemol-session.gz')):
            files = [file(name)]
            if name == 'vibration.xyz': files.append(file('vibration.vib.json'))
            cases.append(dict(id=name,files=files))
    path = ROOT / 'tests/fixtures/psi4-bohr-frequencies.dat'
    cases.append(dict(id=path.name,files=[dict(name=path.name,text=path.read_text())]))
    for function,name in [('build_fixture_structure','bond.structure.json'),('build_fixture_cleanup_structure','cleanup.structure.json'),
                         ('build_fixture_dihedral_structure','dihedral.structure.json'),('build_fixture_optimize_structure','optimize.structure.json'),
                         ('build_fixture_water_structure','water.structure.json'),('build_fixture_distorted_methane_structure','methane.structure.json'),
                         ('build_fixture_inferred_xyz','inferred.xyz'),('build_fixture_trajectory_xyz','generated-trajectory.xyz'),('build_fixture_molden','generated.molden')]:
        cases.append(dict(id='smoke:'+function,files=[dict(name=name,text=getattr(smoke,function)())]))
    cases.append(dict(id='smoke:build_fixture_vibration_payload',files=[dict(name='two-carbons.xyz',text=smoke.build_fixture_inferred_xyz()),
                                                                   dict(name='two-carbons.vib.json',text=smoke.build_fixture_vibration_payload())]))
    for directory, ident in [('methane','characterize:methane-assembly'),('2ccubes','characterize:two-component-assembly')]:
        paths = [str(path.relative_to(root)) for path in sorted((root / directory).glob('*.gz'))]
        cases.append(dict(id=ident, files=[file(path) for path in paths]))
    cases.append(dict(id='basic.look.json', files=[file('sample.cube.gz')], look=True))
    cases.append(dict(id='pubchem:recorded-benzene', pubchem=True))
    return cases

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--limit',type=int)
    parser.add_argument('--context',action='append')
    parser.add_argument('--resume',type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=False)
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    sources = {str(path.relative_to(ROOT)):sha(path) for path in [ROOT/'index.html',*sorted((ROOT/'assets/app/js').glob('*.js'))]}
    commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    cases = fixtures()[:args.limit]
    inventory = {str(path.relative_to(ROOT)):sha(path) for path in sorted((ROOT/'tests/fixtures').rglob('*')) if path.is_file()}
    contexts = [('legacy-wide',1512,1000,False),('workbench-wide',1512,1000,True),
                ('workbench-mid',1280,1000,True),('workbench-compact',1024,1000,True),('workbench-narrow',390,850,True)]
    chosen = args.context or ['workbench-wide','workbench-narrow']
    contexts = [row for row in contexts if row[0] in chosen]
    assert len(contexts) == len(chosen), chosen
    report = dict(status='running',sourceCommit=commit,sourceHashes=sources,fixtureHashes=inventory,
      cases=[dict(id=c['id'],files=[dict(name=f['name'],sha256=hashlib.sha256(f['text'].encode()).hexdigest()) for f in c.get('files',[])]) for c in cases],
      policy='Observed real existing fit callbacks. No QA camera pin. Raw fitted extents, matrices, world bounds and projected bounds are the goldens; no formula-derived expected fitting values.',
      rows=[])
    completed = set()
    if args.resume:
        previous = json.loads(args.resume.read_text())
        assert previous['sourceCommit']==commit and previous['sourceHashes']==sources and previous['fixtureHashes']==inventory
        assert previous['cases']==report['cases']
        report['inheritedFrom'] = dict(path=str(args.resume),sha256=sha(args.resume),
            disposition='Original failed collector and its log remain unchanged; inherit only its completed successful cases.')
        report['rows'] = [row for row in previous['rows'] if row['status']=='passed']
        completed = {(row['context'],row['fixture']) for row in report['rows']}
    started = time.monotonic()
    with p.run_http_server(ROOT) as url,sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
        report['browserVersion'] = browser.version
        try:
            for name,width,height,workbench in contexts:
                context = browser.new_context(viewport=dict(width=width,height=height))
                context.add_init_script('('+HOOK+')()')
                for case in cases:
                    if (name,case['id']) in completed: continue
                    page = context.new_page(); errors=[]
                    page.on('pageerror',lambda e:errors.append(str(e)))
                    page.on('dialog',lambda d:d.dismiss())
                    row = dict(context=name,fixture=case['id'])
                    try:
                        page.goto(url+'?appearanceStudy=1'+('' if workbench else '&workspaceLab=0'))
                        page.wait_for_function('()=>!!window.VibeMolSession && !!window.fitProbe.deps && !!window.fitProbe.rebuild')
                        settings(page,{'view.projection':'orthographic','view.autoRotate':False})
                        if case.get('pubchem'):
                            row['recordedEndpoints'] = pubchem(page,ROOT/'tests/fixtures/characterize')
                        else:
                            result = p.load(page,case['files'])
                            assert result['ok'], result
                        if case.get('look'):
                            page.locator('#lookFileInput').set_input_files(str(ROOT/'tests/fixtures/characterize/basic.look.json'))
                        frames(page)
                        row['fits'] = {}
                        for projection in ['orthographic','perspective']:
                            # Session fixtures intentionally restore a saved view first. This
                            # then invokes the exact existing default-fit callback to measure
                            # fitting all their loaded visible geometry, not the saved view.
                            settings(page,{'view.projection':projection,'view.autoRotate':False})
                            immediate = page.evaluate('''()=>{
                              fitProbe.updates=[];fitProbe.tracking=true;
                              fitProbe.rebuild({preserveView:false});
                              const result=fitProbe.read();fitProbe.tracking=false;
                              return {state:result,projectionUpdates:fitProbe.updates};
                            }''')
                            frames(page)
                            presented = page.evaluate('()=>fitProbe.read()')
                            assert not presented['qaPinLoaded'] and presented['type'] == ('OrthographicCamera' if projection=='orthographic' else 'PerspectiveCamera'),presented
                            assert presented['worldBounds']['min'] and all(math.isfinite(x) for x in presented['projectionMatrix']),presented
                            row['fits'][projection] = dict(immediate=immediate,presented=presented)
                            if len(report['rows'])==0 and projection=='orthographic':
                                row['idleTrace'] = page.evaluate('''()=>new Promise(resolve=>{
                                  const states=[];fitProbe.updates=[];fitProbe.tracking=true;
                                  function tick(){states.push(fitProbe.read());if(states.length<120)requestAnimationFrame(tick);
                                    else{fitProbe.tracking=false;resolve({states,updates:fitProbe.updates});}}
                                  requestAnimationFrame(tick);
                                })''')
                        assert not errors,errors
                        row.update(status='passed',pageErrors=errors)
                    except Exception as e:
                        row.update(status='failed',error=str(e),pageErrors=errors)
                        traceback.print_exc()
                        try: page.screenshot(path=str(args.output/'failure.png'))
                        except Exception as screenshot_error: row['screenshotError'] = str(screenshot_error)
                        raise
                    finally:
                        report['rows'].append(row)
                        (args.output/'result.json').write_text(json.dumps(report,indent=2)+'\n')
                        page.close()
                    print(json.dumps(dict(context=name,fixture=case['id'],status=row['status'],orthoTop=row['fits']['orthographic']['presented']['top'])),flush=True)
                context.close()
        finally:
            browser.close()
    assert all(sha(ROOT/name)==value for name,value in sources.items())
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==commit
    report.update(status='complete',seconds=time.monotonic()-started,sourceUnchanged=True,
      expectedRows=len(cases)*len(contexts),actualRows=len(report['rows']))
    assert report['actualRows']==report['expectedRows'],report
    (args.output/'result.json').write_text(json.dumps(report,indent=2)+'\n')
    (args.output/'manifest.json').write_text(json.dumps(dict(resultSha256=sha(args.output/'result.json'),harnessSha256=sha(Path(__file__)),rows=report['actualRows'],fittedStates=report['actualRows']*2),indent=2)+'\n')
    print(json.dumps(dict(status='complete',rows=report['actualRows'],fittedStates=report['actualRows']*2,seconds=report['seconds'])),flush=True)

if __name__=='__main__':main()
