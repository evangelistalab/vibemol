"""Reject latent-baseline growth; initial allowances are independently pinned."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests/e2e'))
from surface_overlap_contract import BASELINE,AUTHORITY,signatures,validate_baseline


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--base');args=parser.parse_args()
    base=args.base
    if not base and os.environ.get('GITHUB_EVENT_PATH'):
        event=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
        base=event.get('pull_request',{}).get('base',{}).get('sha') or event.get('before')
    if not base:base=subprocess.check_output(['git','merge-base','HEAD','origin/main'],cwd=ROOT,text=True).strip()
    assert base and set(base)!={'0'},('Missing comparison base',base)
    subprocess.run(['git','cat-file','-e',base],cwd=ROOT,check=True)
    old=subprocess.run(['git','show',base+':tests/baselines/surface-overlap-baseline.json'],cwd=ROOT,capture_output=True,text=True)
    predecessor=json.loads(old.stdout) if old.returncode==0 else None
    current=json.loads(BASELINE.read_text());authority=json.loads(AUTHORITY.read_text())
    actual=signatures(current)
    expected=signatures(predecessor) if predecessor is not None else {tuple(r)for r in authority['approvedSignatures']}
    print(json.dumps(dict(base=base,actual=sorted(actual),maximumAllowed=sorted(expected),
        category='latent surface pairs, never accepted CI failures',growthAllowed=False),ensure_ascii=False),flush=True)
    validate_baseline(current,authority=authority,predecessor=predecessor)
    if predecessor is None:assert actual==expected,'Initial baseline must enumerate exactly the nine authorized entries/84 signatures'


if __name__=='__main__':main()
