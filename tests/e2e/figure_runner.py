"""Native CDP Figure CLI contract; runs serially after the Figure parent retires."""
import copy
import hashlib
import json
import os
import re
import struct
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def check(label, actual, expected, process=None):
    row = dict(label=label, actual=actual, expected=expected)
    if process is not None:
        row.update(returncode=process.returncode, stderrTail=process.stderr[-6000:], artifactPath=str(process.artifact_path))
    print('[figure-runner] '+json.dumps(row), flush=True)
    assert actual == expected, row


def run(executable, artifacts):
    from checkpoint_contract import require_phase_counts
    count = 0

    def verify(*args, **kwargs):
        nonlocal count
        check(*args, **kwargs)
        count += 1

    artifacts.mkdir(parents=True, exist_ok=True)
    version = re.search(r'\d+\.\d+\.\d+\.\d+', subprocess.check_output([executable, '--version'], text=True))[0]
    base = json.loads((ROOT/'api/examples/figure.json').read_text())
    base['session'] = str(ROOT/'tests/fixtures/characterize/two-scenes.vibemol-session.gz')
    base['environment']['browserVersion'] = version
    # Same explicit trusted-fixture launch policy as ordinary Playwright CI.
    base['environment']['sandbox'] = os.environ.get('GITHUB_ACTIONS') != 'true'
    base['figure'].update(widthIn=4, dpi=128)

    def invoke(name, job, extra=(), success=True):
        job = copy.deepcopy(job)
        job['output'] = str(artifacts/name)
        source = artifacts/(name+'.json')
        source.write_text(json.dumps(job))
        result = subprocess.run(['node', str(ROOT/'api/figure-runner.mjs'), str(source), '--browser', executable, *extra],
                                cwd=ROOT, capture_output=True, text=True, timeout=360)
        (artifacts/(name+'.stdout')).write_text(result.stdout)
        (artifacts/(name+'.stderr')).write_text(result.stderr)
        result.artifact_path = artifacts/(name+'.stderr')
        verify(name+' exit succeeded', result.returncode == 0, success, process=result)
        receipt = json.loads(result.stdout if success else result.stderr.splitlines()[-1])
        return receipt, artifacts/name, source

    first, bundle, _ = invoke('png', base)
    record = json.loads((bundle/'environment.json').read_text())
    image = (bundle/'figure.png').read_bytes()
    verify('PNG dimensions', list(struct.unpack('>II', image[16:24])), [512, 273])
    verify('image hash', hashlib.sha256(image).hexdigest(), record['image']['sha256'])
    verify('session copy hash', hashlib.sha256((bundle/'session.vibemol-session').read_bytes()).hexdigest(), record['session']['sha256'])
    verify('pinned environment readback', {k:record['observed'][k] for k in ('theme', 'font', 'viewport')},
          {k:base['environment'][k] for k in ('theme', 'font', 'viewport')})
    verify('browser pin', record['browser']['product'].split('/')[-1], version)
    verify('all readiness boundaries presented', [r['stableFrames'] for r in record['observations']['readiness']], [2, 2, 2])
    verify('two selected targets captured in order', [p['layerId'] for p in record['image']['panels']], ['cube-1', 'molecule-2'])
    verify('only one research page before close', record['cleanup']['pagesBeforeClose'], 1)
    verify('browser/profile/server retired', [record['cleanup'][k] for k in ('browserExited', 'profileRemoved', 'serverClosed')], [True]*3)
    verify('normal close acknowledged without forced kill', record['cleanup']['exitSignal'], None)
    verify('normal close exit code', record['cleanup']['exitCode'], 0)
    verify('no forced shutdown', record['cleanup']['forced'], False)
    verify('actual browser sandbox flag', record['observed']['sandbox'], base['environment']['sandbox'])
    verify('loaded resource hashes include renderer and font',
          all(any(part in name for name in record['app']['resources']) for part in ('app.js', 'Geist-Variable.woff2')), True)

    replay = json.loads((bundle/'job.json').read_text())
    replay['session'] = str(bundle/'session.vibemol-session')
    replay['referenceEnvironment'] = str(bundle/'environment.json')
    second, _, _ = invoke('replay', replay)
    verify('same-session/options/environment replay is byte-identical', second['imageSha256'], first['imageSha256'])
    verify('replay reference verified', json.loads((artifacts/'replay/environment.json').read_text())['observations']['referenceEnvironmentVerified'], True)
    changed_record = copy.deepcopy(record)
    changed_record['app']['resources']['/index.html']['sha256'] = '0'*64
    reference = artifacts/'changed-environment.json'
    reference.write_text(json.dumps(changed_record))
    changed = copy.deepcopy(replay)
    changed['referenceEnvironment'] = str(reference)
    failed, dest, _ = invoke('changed-resource', changed, success=False)
    verify('changed resource blocked', [failed['stage'], failed['detail']['resource']], ['environment', '/index.html'])
    verify('changed resource publishes nothing', dest.exists(), False)

    svg = copy.deepcopy(base)
    svg['environment'].update(theme='dark', font='inter')
    svg['figure'].update(format='svg', targets=[{'id':'molecule-2', 'label':'Water <A> & š'}])
    del svg['figure']['widthIn']
    svg['figure']['width'] = 512
    _, sb, _ = invoke('svg', svg)
    sr = json.loads((sb/'environment.json').read_text())
    root = ET.parse(sb/'figure.svg').getroot()
    verify('SVG target label/escaping', [t.text for t in root.findall('{http://www.w3.org/2000/svg}text')], ['Water <A> & š'])
    verify('SVG explicit environment', [sr['observed']['theme'], sr['observed']['font']], ['dark', 'inter'])
    verify('all Inter subsets loaded before composing', len(sr['observed']['loadedFonts']), 2)
    verify('extended-Latin font bytes recorded', '/assets/app/fonts/Inter-Variable-LatinExt.woff2' in sr['app']['resources'], True)

    listed, listing, _ = invoke('listing', base, ('--list-targets',))
    verify('target listing', [t['id'] for t in listed['targets']], ['cube-1', 'molecule-2'])
    verify('listing writes no bundle', listing.exists(), False)
    mismatch = copy.deepcopy(base)
    mismatch['environment']['browserVersion'] = '0.0.0.0'
    failed, dest, _ = invoke('mismatch', mismatch, success=False)
    verify('mismatch attribution', failed['stage'], 'environment')
    verify('mismatch publishes nothing', dest.exists(), False)
    unknown = copy.deepcopy(base)
    unknown['figure']['targets'] = ['not-a-layer']
    failed, dest, _ = invoke('unknown', unknown, success=False)
    verify('unknown target attribution', failed['stage'], 'targets')
    verify('unknown target inventory', [t['id'] for t in failed['detail']['available']], ['cube-1', 'molecule-2'])
    verify('unknown target publishes nothing', dest.exists(), False)

    # Deterministic cancellation at a real phase boundary, not a timed host race.
    cancelled = copy.deepcopy(base)
    cancelled['output'] = str(artifacts/'cancelled')
    source = artifacts/'cancelled.json'
    source.write_text(json.dumps(cancelled))
    script = '''import {runFigureJob} from './api/figure-runner.mjs';
      import {FigureError} from './api/figure-job.mjs';
      const controller=new AbortController();
      try {await runFigureJob(process.argv[1], {browser:process.argv[2],signal:controller.signal,
        onStage:stage=>{if(stage==='figure')controller.abort(new FigureError('cancelled','Test cancellation at the Figure boundary.'));}});
        throw Error('Cancellation incorrectly succeeded');
      } catch(e) {if(e.stage!=='cancelled')throw e;console.log(JSON.stringify(e.figureReport));}'''
    result = subprocess.run(['node', '--input-type=module', '-e', script, str(source), executable], cwd=ROOT,
                            capture_output=True, text=True, timeout=360)
    (artifacts/'cancelled.stdout').write_text(result.stdout)
    (artifacts/'cancelled.stderr').write_text(result.stderr)
    result.artifact_path = artifacts/'cancelled.stderr'
    verify('cancellation classified', result.returncode, 0, process=result)
    verify('cancellation publishes nothing', (artifacts/'cancelled').exists(), False)
    verify('cancellation report', json.loads(result.stdout)['stage'], 'cancelled')
    verify('no output locks survive', [p.name for p in artifacts.glob('*.lock')], [])
    counts = {'figure-runner': count}
    require_phase_counts(counts, 'tests/e2e/figure.py', 'figure-runner')
    print('[figure-runner-summary] native CLI PNG/SVG, exact replay, pinning, readiness, targets, cancellation and cleanup: passed', flush=True)
    return counts


if __name__ == '__main__':
    import sys
    run(sys.argv[1], Path(sys.argv[2]).resolve())
