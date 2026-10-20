"""Compare observed fitting goldens, independently of the new derivation."""
import gzip,hashlib,json,math,sys
from pathlib import Path
before_path,after_path,output_path=map(Path,sys.argv[1:])
before_bytes=before_path.read_bytes();before_plain=gzip.decompress(before_bytes) if before_path.suffix=='.gz' else before_bytes
before=json.loads(before_plain);after=json.loads(after_path.read_text())
expected={(r['context'],r['fixture'],r['projection']):r for r in before['rows']}
differences=[];deltas=[];compared=[]
def compare(a,b,path):
    if type(a) is not type(b):differences.append(dict(path=path,expected=a,actual=b,reason='type'));return
    if isinstance(a,dict):
        if a.keys()!=b.keys():differences.append(dict(path=path,expectedKeys=list(a),actualKeys=list(b)));return
        for k in a:compare(a[k],b[k],path+'.'+k)
    elif isinstance(a,list):
        if len(a)!=len(b):differences.append(dict(path=path,expectedLength=len(a),actualLength=len(b)));return
        for i,(x,y) in enumerate(zip(a,b)):compare(x,y,path+f'[{i}]')
    elif isinstance(a,float):
        delta=abs(a-b);deltas.append(dict(path=path,absoluteDelta=delta,relativeDelta=delta/max(abs(a),abs(b),1e-300)))
        if not math.isclose(a,b,rel_tol=1e-9,abs_tol=1e-12):differences.append(dict(path=path,expected=a,actual=b,reason='float'))
    elif a!=b:differences.append(dict(path=path,expected=a,actual=b,reason='exact'))
assert before['fixtureHashes']==after['fixtureHashes']
assert before['fixtureCases']==after['cases']
for row in after['rows']:
    assert row['status']=='passed',row
    for projection,fit in row['fits'].items():
        key=(row['context'],row['fixture'],projection)
        assert key not in compared,key
        compared.append(key);old=expected[key]
        for phase in ['immediate','presented']:
            compare(old[phase],fit[phase]['state'] if phase=='immediate' else fit[phase],'/'.join(key)+'/'+phase)
complete=after['status']=='complete' and len(compared)==len(expected)
report=dict(status='failed' if differences else 'passed' if complete else 'partial',
  before=str(before_path),beforeSha256=hashlib.sha256(before_bytes).hexdigest(),beforeUncompressedSha256=hashlib.sha256(before_plain).hexdigest(),
  after=str(after_path),afterAppSha256=after['sourceHashes']['assets/app/js/app.js'],
  expectedFittedStates=len(expected),comparedFittedStates=len(compared),readbacks=len(compared)*2,
  independentEvidence='Compare actual pre-change extents, matrices, pose, viewport and projected/world bounds. Never infer expected framing from the new owner.',
  comparator='Unchanged standing float-only isclose(1e-9,1e-12); exact types, ints, structure and all other leaves.',
  differences=differences,maximumAbsoluteDelta=max(deltas,key=lambda x:x['absoluteDelta']) if deltas else None,
  maximumRelativeDelta=max(deltas,key=lambda x:x['relativeDelta']) if deltas else None)
output_path.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
raise SystemExit(1 if differences else 0 if complete else 2)
