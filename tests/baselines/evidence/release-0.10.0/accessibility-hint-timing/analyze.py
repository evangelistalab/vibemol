import collections,gzip,hashlib,json,shutil,subprocess
from pathlib import Path
out=Path(__file__).parent;rows=[];all_incomplete=[];verified_frames=0
expected_harness='d08584aea8afad874e511b5a1db544868924b2b6e53511e2aa08ef8ef91c6cf4'
expected_baseline='12f13279dbec2731822c122da64502408480bb9e84105a3ccc74d8e85084b825'
for d in sorted((out/'artifacts').iterdir()):
 collection=json.loads((d/'diagnostic-collection.json').read_text());source=collection['sourceCommit'];assert len(collection['runs'])==3
 expected_app=hashlib.sha256(subprocess.check_output(['git','show',source+':assets/app/js/app.js'])).hexdigest()
 for repeat in (1,2,3):
  run=d/f'run-{repeat}';file=run/'hint-measurements.json';x=json.loads(file.read_text());assert x['sourceCommit']==source and x['sourceAppSha256']==expected_app
  assert x['harnessAccessibilitySha256']==expected_harness and x['baselineSha256']==expected_baseline and x['originalHarnessStillUnchanged'] and x['baselineStillUnchanged'] and x['originalAssertionsAndWaitsUnchanged']
  assert x['originalSuiteExitCode']==collection['runs'][repeat-1]['originalSuiteExitCode']
  assert len(x['measurements'])==12 and len({(m['theme'],m['mode']) for m in x['measurements']})==8
  scans=[]
  for r in x['measurements']:
   raw=json.loads((run/('contrast-'+r['theme']+'-'+r['mode'].lower().replace('display','view')+'.json')).read_text())[r['scan']-1]['result']
   independently=[{'kind':kind,'rule':rule['id'],'node':node} for kind in ['passes','incomplete','violations','inapplicable'] for rule in raw[kind] for node in rule['nodes'] if node['target']==['#hint']]
   assert independently==r['axeHintResults']
   be,af=r['before'],r['after'];kinds=[a['kind'] for a in independently]
   checks=[dict(kind=a['kind'],rule=a['rule'],target=a['node']['target'],check=c['id'],data=c.get('data'),relatedNodes=c.get('relatedNodes',[])) for a in independently for c in a['node']['any']]
   transitions=r['timeline']['themeEvents'];theme_end=max((e['at'] for e in transitions if e.get('target')=='hint' and e['kind']=='transitionend' and e['property']=='background-color'),default=None)
   row=dict(theme=r['theme'],mode=r['mode'],scan=r['scan'],axeStartMs=be['at'],axeEndMs=af['at'],fontsReadyMs=be.get('fontsReadyAt'),firstPaint=be.get('paints'),rAFsBeforeAxe=be.get('frameCount'),hintBefore={k:be.get(k) for k in ['className','ariaHidden','opacity','foreground','background']},hintAfter={k:af.get(k) for k in ['className','ariaHidden','opacity']},activeTransitionsBefore=be.get('activeTransitions'),activeTransitionsAfter=af.get('activeTransitions'),hintThemeBackgroundTransitionEndedMs=theme_end,msSinceHintThemeBackgroundSettled=be['at']-theme_end if theme_end is not None else None,axeHintChecks=checks)
   if 'incomplete' in kinds:
    assert r['mode']=='Calculations' and be['ariaHidden']=='true'
    assert any(a['target']=='hint' and a['property']=='opacity' for a in be['activeTransitions'])
    assert all(c['kind']=='incomplete' and c['data']['messageKey']=='imgNode' for c in checks)
    all_incomplete.append(dict(source=source,repeat=repeat,**row))
   if r['mode']=='Calculations':scans.append(row)
  for frame in x['compositorFrames']:
   assert hashlib.sha256((run/frame['path']).read_bytes()).hexdigest()==frame['sha256'];verified_frames+=1
  top=next(r for r in x['measurements'] if r['theme']=='dark' and r['mode']=='Calculations')
  prior=[f for f in x['compositorFrames'] if 0<f['metadata']['timestamp']*1000-top['before']['timeOrigin']<top['before']['at']]
  assert prior;f=prior[-1];t=f['metadata']['timestamp']*1000-top['before']['timeOrigin']
  frame=dict(path=str((run/f['path']).relative_to(out)),sha256=f['sha256'],atSinceNavigationMs=t,msBeforeAxe=top['before']['at']-t)
  rows.append(dict(source=source,tree=collection['sourceTree'],repeat=repeat,originalSuiteExitCode=x['originalSuiteExitCode'],error=x.get('error'),scans=12,cases=8,started=x['started'],completed=x['completed'],calculationHintScans=scans,priorDarkCalculationCompositorFrame=frame))
assert len(rows)==9
counts={source:dict(passed=sum(r['originalSuiteExitCode']==0 for r in rows if r['source']==source),failed=sum(r['originalSuiteExitCode']!=0 for r in rows if r['source']==source)) for source in {r['source'] for r in rows}}
report=dict(role='instrumented diagnostic, never merge acceptance',runId=39154813750,attempt=1,harnessHead='629f9bd5f8e50414a23e5bc5358905337dc6dc64',originalSuiteSha256=expected_harness,originalBaselineSha256=expected_baseline,executions=9,scans=108,cases=72,originalSuiteOutcomes=counts,rows=rows,allRawHintIncompleteScans=all_incomplete,verifiedCompositorFrames=verified_frames,allIncompleteDuringHintOpacityTransition=True,noContrastViolationFound=True,mechanism='Axe scans race the transient hint auto-hide opacity/transform fade. The three aggregate failures start during that fade after the hint theme background transition is complete. Earlier definite passing scans can resolve later incomplete scans, explaining the tagged passing aggregate despite raw incomplete measurements.',hypotheses=dict(beforeCanvasPaint='refuted for the three aggregate failures: the actual prior compositor frames were visually inspected and show the rendered molecule',duringThemeColorTransition='not supported for these failures: hint background transition ended before each failing scan',duringHintAutoHideFade='observed in all eight raw incomplete scans across both Calculation themes'),measurementLimit='Observers/CDP can perturb timing. No diagnostic frequency is a population flake rate; rAF alone is not proof of canvas presentation. Actual compositor images and original raw scans are retained.',looksMaterialFamilies='not covered this run')
assert len(all_incomplete)==8
(out/'diagnostic-analysis.json').write_text(json.dumps(report,indent=2)+'\n')
w=out.parent/'accessibility-settled-scan/worktree';dest=w/'tests/baselines/evidence/release-0.10.0/accessibility-hint-timing';dest.mkdir(exist_ok=False)
for name in ['diagnostic-analysis.json','collection-complete.json','checkpoint.json','analyze.py','collect.py']:
 shutil.copyfile(out/name,dest/name)
for d in sorted((out/'artifacts').iterdir()):
 for f in sorted(d.glob('run-*/hint-measurements.json')):
  name=d.name.removeprefix('hint-diagnostic-')[:7]+'-'+f.parent.name+'-measurements.json.gz'
  (dest/name).write_bytes(gzip.compress(f.read_bytes(),mtime=0))
print(json.dumps(dict(outcomes=counts,rawIncompleteScans=len(all_incomplete),verifiedCompositorFrames=verified_frames,aggregateFailingRows=[dict(source=r['source'][:7],repeat=r['repeat'],opacity=r['calculationHintScans'][3]['hintBefore']['opacity'],themeEndedMsEarlier=r['calculationHintScans'][3]['msSinceHintThemeBackgroundSettled'],priorFrameMs=r['priorDarkCalculationCompositorFrame']['msBeforeAxe']) for r in rows if r['originalSuiteExitCode']]),indent=2))
