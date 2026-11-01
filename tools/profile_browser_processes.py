"""Linux descendant CPU/RSS samples alongside one browser diagnostic.

Tick deltas omit time before the first/after the last observation. RSS sums
double-count shared pages and are not unique physical-memory consumption.
No stall time is subtracted and no performance threshold supplies acceptance.
"""
import argparse
from collections import defaultdict
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def parse_stat(text):
    head, fields = text.rsplit(') ', 1); values = fields.split()
    return dict(pid=int(head.split(' ',1)[0]), ppid=int(values[1]),
                ticks=int(values[11])+int(values[12]), startTicks=int(values[19]), rssPages=int(values[21]))


def role(command):
    if b'--type=gpu-process' in command: return 'gpu-process'
    if b'--type=renderer' in command: return 'renderer'
    if b'--type=utility' in command: return 'utility'
    if b'run-driver' in command: return 'playwright-driver'
    if b'chrome' in command.split(b'\0',1)[0]: return 'browser-main'
    return 'host-or-other'


def snapshot(root):
    rows = {}
    for path in Path('/proc').glob('[0-9]*/stat'):
        try:
            row=parse_stat(path.read_text()); rows[row['pid']]=row
        except (OSError, ValueError, IndexError): continue
    live={root}
    while True:
        more={pid for pid,r in rows.items() if r['ppid'] in live}-live
        if not more: break
        live.update(more)
    result=[]
    for pid in live:
        if pid not in rows: continue
        try: command=Path(f'/proc/{pid}/cmdline').read_bytes()
        except OSError: command=b''
        result.append(dict(**rows[pid],role=role(command)))
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite',choices=('looks','look_references'),required=True)
    parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    if not Path('/proc/self/stat').exists(): raise SystemExit('Linux /proc required; no invented process measurements')
    args.out.mkdir(parents=True,exist_ok=False)
    tick=os.sysconf('SC_CLK_TCK');page_size=os.sysconf('SC_PAGE_SIZE')
    command=[sys.executable,str(Path(__file__).with_name('profile_browser_tests.py')),'--suite',args.suite,'--out',str(args.out/'browser')]
    start=time.perf_counter();child=subprocess.Popen(command);previous={};last=None;totals=defaultdict(float);peak=defaultdict(float);peak_rss=defaultdict(int);samples=0;observer=0.0
    with (args.out/'process-samples.jsonl').open('w')as stream:
        while True:
            before=time.perf_counter();rows=snapshot(child.pid);now=time.perf_counter();elapsed=now-start
            cpu=defaultdict(float);rss=defaultdict(int)
            for row in rows:
                old=previous.get(row['pid'])
                if old and old['startTicks']==row['startTicks']:
                    delta=(row['ticks']-old['ticks'])/tick;cpu[row['role']]+=delta;totals[row['role']]+=delta
                row['rssBytes']=row['rssPages']*page_size;rss[row['role']]+=row['rssBytes']
            if last is not None:
                for name,seconds in cpu.items():peak[name]=max(peak[name],seconds/(now-last))
            for name,size in rss.items():peak_rss[name]=max(peak_rss[name],size)
            stream.write(json.dumps(dict(elapsedSeconds=elapsed,processes=rows,observedCpuSeconds=dict(cpu)))+'\n');stream.flush();samples+=1
            observer+=time.perf_counter()-before;previous={r['pid']:r for r in rows};last=now
            if child.poll()is not None:break
            try:child.wait(timeout=1)
            except subprocess.TimeoutExpired:pass
    wall=time.perf_counter()-start
    report=dict(suite=args.suite,childExitCode=child.returncode,ordinaryAcceptance=False,
        wallSeconds=wall,samples=samples,samplerWorkSeconds=observer,cpuCount=os.cpu_count(),
        roles={name:dict(observedCpuSeconds=totals[name],meanObservedCores=totals[name]/wall,
                        maximumIntervalCores=peak[name],peakSummedRssBytesNotUnique=peak_rss[name])for name in set(totals)|set(peak_rss)},
        definitions=__doc__)
    (args.out/'process-summary.json').write_text(json.dumps(report,indent=2)+'\n')
    print('[browser-process-profile] '+json.dumps(report),flush=True)
    return child.returncode


if __name__=='__main__':raise SystemExit(main())
