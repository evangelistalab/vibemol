"""Replay an unchanged current UI suite against a specified static source tree.

This is direct UI event verification, not a claim of human interaction. Only
the server root and evidence destination change; assertions and waits do not.
"""
import argparse
import hashlib
import importlib
import json
import pathlib
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('suite', choices=['edit_tool','build_panel','symmetry_panel','workbench_bar','floating_panels'])
parser.add_argument('--source-root',type=pathlib.Path,required=True)
parser.add_argument('--artifacts',type=pathlib.Path,required=True)
args=parser.parse_args()
root=pathlib.Path.cwd()
sys.path.insert(0,str(root/'tests/e2e'))
module=importlib.import_module(args.suite)
args.artifacts.mkdir(parents=True,exist_ok=True)
for dependency in list(sys.modules.values()):
    file=getattr(dependency,'__file__',None)
    if file and pathlib.Path(file).resolve().parent==root/'tests/e2e':
        if hasattr(dependency,'ROOT'):
            dependency.ROOT=args.source_root.resolve()
        if hasattr(dependency,'ARTIFACTS'):
            dependency.ARTIFACTS=args.artifacts.resolve()
app=args.source_root/'assets/app/js/app.js'
sha=hashlib.sha256(app.read_bytes()).hexdigest()
started=time.monotonic()
result={'suite':args.suite+'.py','sourceRoot':str(args.source_root),
        'sourceAppSha256':sha,'testSha256':hashlib.sha256((root/'tests/e2e'/f'{args.suite}.py').read_bytes()).hexdigest(),
        'method':'Unchanged suite main() and real UI events; only static server root and artifact destination redirected.',
        'assertionsChanged':False,'waitsChanged':False,'retries':0,'serialBrowserExecution':True}
try:
    module.main()
    result['status']='passed'
except BaseException as error:
    result['status']='failed'
    result['exception']=type(error).__name__
    raise
finally:
    assert hashlib.sha256(app.read_bytes()).hexdigest()==sha
    result['seconds']=round(time.monotonic()-started,2)
    (args.artifacts/'result.json').write_text(json.dumps(result,indent=2)+'\n')
