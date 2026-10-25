"""Synthetic named-step logs; no historical evidence is edited or relabeled."""
import json


def marked_log(suite, *, facts=None, workflow=None, step=None, exception=None,
               statement="assert target_is_correct", token="a"*32):
    axis=suite.rsplit('/',1)[-1]=='axis_gizmo.py'
    row=dict(schema=1,token=token,suite=suite.rsplit('/',1)[-1],outcome='failed',
        workflow=workflow or ('escape-canvas-focus' if axis else 'coordinates-delete-selection-card'),
        step=step or ('axis-endpoint.escape.canvas-focus' if axis else 'coordinates.row1.native-delete'),
        exceptionType=exception or ('AssertionError' if axis else 'TimeoutError'),
        facts=facts if facts is not None else (dict(trigger=dict(kind='native-keydown',key='Escape',completed=True),
            before=dict(focus='viewAxisNegZBtn'),after=dict(focus='viewAxisNegZBtn'),actual='viewAxisNegZBtn',expected='canvas')
        if axis else dict(action=dict(kind='native-click',rowAtomIndex=1,command='delete'),
            hit=dict(targetVisible=True,targetEnabled=True,targetOwnsHit=False,cardOwnsHit=True,interceptorId='editSelectionPosition'))))
    return ('[workflow-step] '+json.dumps(row)+'\nTraceback (most recent call last):\n'
        +'  File "/repo/tests/e2e/'+row['suite']+'", line 999, in run\n    '+statement+'\n'
        +row['exceptionType']+': original error unchanged\n'
        +'[workflow-exception] '+json.dumps({k:row[k] for k in ['token','suite','exceptionType']})+'\n')
