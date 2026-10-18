import json,pathlib,subprocess,sys,time,os
root=pathlib.Path.cwd();out=root/'out/test-artifacts/stage3/selection/manual';out.mkdir(parents=True,exist_ok=True)
runner=root/'tests/baselines/evidence/stage3/selection/replay-ui-suite.py';env={**os.environ,'PYTHONPATH':str(root/'out/test-artifacts/browser-repair/runtime-site'),'PYTHONPYCACHEPREFIX':str(root/'out/test-artifacts/stage3/selection/pycache')}
results=[]
for label,source in [('tagged-base',root/'out/test-artifacts/stage3/tagged-base'),('proposed',root)]:
 for suite in ['edit_picking','transform_selection','build_orbit','floating_panels']:
  d=out/label/suite;d.mkdir(parents=True,exist_ok=True);started=time.monotonic()
  with (d/'run.log').open('w') as log:process=subprocess.run([sys.executable,str(runner),suite,'--source-root',str(source),'--artifacts',str(d)],stdout=log,stderr=subprocess.STDOUT,env=env,cwd=root)
  results.append({'source':label,'suite':suite,'exitCode':process.returncode,'seconds':round(time.monotonic()-started,2),'result':str(d.relative_to(root)/'result.json')})
  (out/'matrix-results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results[-1]),flush=True)
  if process.returncode:print((d/'run.log').read_text()[-3000:],flush=True);raise SystemExit(process.returncode)
 d=out/label/'selection_menus';d.mkdir(parents=True,exist_ok=True);started=time.monotonic()
 with (d/'run.log').open('w') as log:process=subprocess.run([sys.executable,str(root/'out/test-artifacts/stage3/selection/selection-menu-matrix.py'),'--source-root',str(source),'--artifacts',str(d)],stdout=log,stderr=subprocess.STDOUT,env=env,cwd=root)
 results.append({'source':label,'suite':'selection_menus','exitCode':process.returncode,'seconds':round(time.monotonic()-started,2),'result':str(d.relative_to(root)/'result.json')});(out/'matrix-results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results[-1]),flush=True)
 if process.returncode:print((d/'run.log').read_text()[-3000:],flush=True);raise SystemExit(process.returncode)
