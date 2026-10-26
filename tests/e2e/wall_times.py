"""Raw wait durations, independent of discounting or assertion acceptance."""
from __future__ import annotations
import argparse
import json
import math
import os
from pathlib import Path
import statistics

PREFIX = '[wait-wall] '


def _number(value):
    return value if type(value) in (int,float) and math.isfinite(value) else None


def record_wait_wall(*, site, label, kind, outcome, host_elapsed_ms,
                     browser=None, policy=None, error_type=None):
    browser = browser or {}
    row = dict(schemaVersion=1,site=site,label=label,kind=kind,outcome=outcome,
               browserWallMs=_number(browser.get('wallElapsedMs')),
               hostAttemptWallMs=_number(host_elapsed_ms),
               responsiveMs=_number(browser.get('responsiveElapsedMs')),
               discountedMs=_number(browser.get('discountedMs')),
               browserStartedAtMs=(browser.get('wait') or {}).get('startedAtMs'),
               browserEndedAtMs=browser.get('observedWaitEndAtMs'),
               policy=policy,errorType=error_type,
               ciRunId=os.environ.get('GITHUB_RUN_ID'),ciAttempt=os.environ.get('GITHUB_RUN_ATTEMPT'),
               sourceCommit=os.environ.get('GITHUB_SHA'),
               discountCause='Not inferred: page CPU work and descheduling are indistinguishable here',
               clockScopes='Browser: original event/wait window. Host: invocation through result/readback, before logging/cleanup. Missing browser readback stays null; clocks are summarized separately.')
    root = Path(os.environ.get('VIBEMOL_TEST_ARTIFACT_DIR',
                str(Path(__file__).resolve().parents[2]/'out/test-artifacts')))
    try:
        root.mkdir(parents=True,exist_ok=True)
        with (root/'assertion-wall-times.jsonl').open('a') as stream:
            stream.write(json.dumps(row)+'\n')
    except OSError as error:
        # A recording failure cannot replace the original assertion/timeout.
        # Stdout is an independent copy, including the recording failure.
        row['recordingError']=str(error)
    print(PREFIX+json.dumps(row),flush=True)
    return row


def summarize(rows):
    groups={}
    for row in rows:
        key=(row['site'],row['kind'],row['outcome'])
        groups.setdefault(key,[]).append(row)
    def distribution(values):
        values=sorted(v for v in values if _number(v) is not None)
        return dict(count=len(values),minimum=min(values),median=statistics.median(values),
                    p95=values[math.ceil(.95*len(values))-1],maximum=max(values)) if values else dict(count=0)
    return dict(schemaVersion=1,recordCount=len(rows),performanceAcceptanceThreshold=None,
        purpose='Raw wall-time distributions for drift review; never subtract stall credit from these values. No new performance acceptance threshold.',
        bySite=[dict(site=site,kind=kind,outcome=outcome,count=len(group),
            labels=sorted({r['label']for r in group}),
            browserWallMs=distribution(r['browserWallMs']for r in group),
            hostAttemptWallMs=distribution(r['hostAttemptWallMs']for r in group),
            missingBrowserReadbacks=sum(r['browserWallMs']is None for r in group))
            for (site,kind,outcome),group in sorted(groups.items())])


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    files=sorted(args.root.rglob('assertion-wall-times.jsonl'))
    rows=[json.loads(line)for path in files for line in path.read_text().splitlines()if line.strip()]
    report=summarize(rows);report['rawFiles']=[str(p.relative_to(args.root))for p in files]
    args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n')
    print('[wait-wall-distribution] '+json.dumps(report),flush=True)
