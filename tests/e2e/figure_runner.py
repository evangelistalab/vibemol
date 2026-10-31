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


def check(label, actual, expected):
    row = dict(label=label, actual=actual, expected=expected)
    print('[figure-runner] '+json.dumps(row), flush=True)
    assert actual == expected, row


def run(executable, artifacts):
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
        check(name+' exit succeeded', result.returncode == 0, success)
        receipt = json.loads(result.stdout if success else result.stderr.splitlines()[-1])
        return receipt, artifacts/name, source

    first, bundle, _ = invoke('png', base)
    record = json.loads((bundle/'environment.json').read_text())
    image = (bundle/'figure.png').read_bytes()
    check('PNG dimensions', list(struct.unpack('>II', image[16:24])), [512, 273])
    check('image hash', hashlib.sha256(image).hexdigest(), record['image']['sha256'])
    check('session copy hash', hashlib.sha256((bundle/'session.vibemol-session').read_bytes()).hexdigest(), record['session']['sha256'])
    check('pinned environment readback', {k:record['observed'][k] for k in ('theme', 'font', 'viewport')},
          {k:base['environment'][k] for k in ('theme', 'font', 'viewport')})
    check('browser pin', record['browser']['product'].split('/')[-1], version)
    check('all readiness boundaries presented', [r['stableFrames'] for r in record['observations']['readiness']], [2, 2, 2])
    check('two selected targets captured in order', [p['layerId'] for p in record['image']['panels']], ['cube-1', 'molecule-2'])
    check('only one research page before close', record['cleanup']['pagesBeforeClose'], 1)
    check('browser/profile/server retired', [record['cleanup'][k] for k in ('browserExited', 'profileRemoved', 'serverClosed')], [True]*3)
    check('normal close acknowledged without forced kill', record['cleanup']['exitSignal'], None)
    check('actual browser sandbox flag', record['observed']['sandbox'], base['environment']['sandbox'])
    check('loaded resource hashes include renderer and font',
          all(any(part in name for name in record['app']['resources']) for part in ('app.js', 'Geist-Variable.woff2')), True)

    replay = json.loads((bundle/'job.json').read_text())
    replay['session'] = str(bundle/'session.vibemol-session')
    replay['referenceEnvironment'] = str(bundle/'environment.json')
    second, _, _ = invoke('replay', replay)
    check('same-session/options/environment replay is byte-identical', second['imageSha256'], first['imageSha256'])
    check('replay reference verified', json.loads((artifacts/'replay/environment.json').read_text())['observations']['referenceEnvironmentVerified'], True)
    changed_record = copy.deepcopy(record)
    changed_record['app']['resources']['/index.html']['sha256'] = '0'*64
    reference = artifacts/'changed-environment.json'
    reference.write_text(json.dumps(changed_record))
    changed = copy.deepcopy(replay)
    changed['referenceEnvironment'] = str(reference)
    failed, dest, _ = invoke('changed-resource', changed, success=False)
    check('changed resource blocked', [failed['stage'], failed['detail']['resource']], ['environment', '/index.html'])
    check('changed resource publishes nothing', dest.exists(), False)

    svg = copy.deepcopy(base)
    svg['environment'].update(theme='dark', font='inter')
    svg['figure'].update(format='svg', targets=[{'id':'molecule-2', 'label':'Water <A> & B'}])
    del svg['figure']['widthIn']
    svg['figure']['width'] = 512
    _, sb, _ = invoke('svg', svg)
    sr = json.loads((sb/'environment.json').read_text())
    root = ET.parse(sb/'figure.svg').getroot()
    check('SVG target label/escaping', [t.text for t in root.findall('{http://www.w3.org/2000/svg}text')], ['Water <A> & B'])
    check('SVG explicit environment', [sr['observed']['theme'], sr['observed']['font']], ['dark', 'inter'])

    listed, listing, _ = invoke('listing', base, ('--list-targets',))
    check('target listing', [t['id'] for t in listed['targets']], ['cube-1', 'molecule-2'])
    check('listing writes no bundle', listing.exists(), False)
    mismatch = copy.deepcopy(base)
    mismatch['environment']['browserVersion'] = '0.0.0.0'
    failed, dest, _ = invoke('mismatch', mismatch, success=False)
    check('mismatch attribution', failed['stage'], 'environment')
    check('mismatch publishes nothing', dest.exists(), False)
    unknown = copy.deepcopy(base)
    unknown['figure']['targets'] = ['not-a-layer']
    failed, dest, _ = invoke('unknown', unknown, success=False)
    check('unknown target attribution', failed['stage'], 'targets')
    check('unknown target inventory', [t['id'] for t in failed['detail']['available']], ['cube-1', 'molecule-2'])
    check('unknown target publishes nothing', dest.exists(), False)

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
    check('cancellation classified', result.returncode, 0)
    check('cancellation publishes nothing', (artifacts/'cancelled').exists(), False)
    check('cancellation report', json.loads(result.stdout)['stage'], 'cancelled')
    check('no output locks survive', [p.name for p in artifacts.glob('*.lock')], [])
    print('[figure-runner] native CLI PNG/SVG, exact replay, pinning, readiness, targets, cancellation and cleanup: passed', flush=True)


if __name__ == '__main__':
    import sys
    run(sys.argv[1], Path(sys.argv[2]).resolve())
