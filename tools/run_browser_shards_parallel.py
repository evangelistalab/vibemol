"""Run browser shards concurrently and join their diagnostic evidence."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from threading import Event, Thread
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
import browser_suite
from join_browser_shards import join_reports


def record_load(samples, load, start, logical_cores):
    elapsed = time.monotonic() - start
    print(f'One-minute load at {elapsed:.2f}s: {load:.2f} ({logical_cores} logical cores)', flush=True)
    if load > logical_cores and all(sample['oneMinuteLoad'] <= logical_cores for sample in samples):
        print('Warning: host load exceeds the logical core count. '
              'Run is contended and its results are not timing evidence.', file=sys.stderr, flush=True)
    samples.append({'elapsedSeconds': elapsed, 'oneMinuteLoad': load})


@contextmanager
def monitor_load(out, initial_load, logical_cores, jobs):
    start = time.monotonic()
    samples = []
    record_load(samples, initial_load, start, logical_cores)
    done = Event()

    def sample_until_done():
        while not done.wait(30):
            record_load(samples, os.getloadavg()[0], start, logical_cores)

    monitor = Thread(target=sample_until_done)
    monitor.start()
    try:
        yield
    finally:
        done.set()
        monitor.join()
        contended = any(sample['oneMinuteLoad'] > logical_cores for sample in samples)
        wall_time = time.monotonic() - start
        summary = {
            'jobs': jobs,
            'logicalCores': logical_cores,
            'loadSamples': samples,
            'contended': contended,
            'timingEvidence': not contended,
            'wallTimeSeconds': wall_time,
        }
        (out / 'run-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
        print(f'Local browser diagnostic wall time: {wall_time:.2f}s', flush=True)
        if contended:
            print('Contended run. Results are not timing evidence.', flush=True)


@contextmanager
def serve_shard():
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    handler = partial(Handler, directory=ROOT)
    with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_port}/'
        finally:
            server.shutdown()
            thread.join()


def run_shard(shard, suites, artifacts, hardware, partial):
    dest = artifacts / f'browser-suite-{shard}' / 'browser-suite'
    dest.mkdir(parents=True)
    with serve_shard() as url, (dest.parent / 'worker.log').open('w') as log:
        env = {**os.environ, 'VIBEMOL_TEST_ARTIFACT_DIR': str(dest), 'VIBEMOL_SHARD_SERVER': url}
        if hardware:
            env['VIBEMOL_LOCAL_GL'] = 'hardware'
        cmd = [sys.executable, str(ROOT/'tests/e2e/browser_suite.py'), '--shard', shard]
        if partial:
            cmd += ['--select', *suites]
        print(f'{shard}: {", ".join(suites)}', flush=True)
        subprocess.run(cmd, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('suites', nargs='*', help='Select suites by path; default is the full CI plan')
    parser.add_argument('--jobs', type=int, default=2, help='Parallel shards (default: 2)')
    parser.add_argument('--max-load', type=float,
                        help='Refuse to start above this one-minute load average')
    parser.add_argument('--hardware-gl', action='store_true')
    args = parser.parse_args()
    if 'CI' in os.environ:
        parser.error('The parallel runner is for local diagnostics only')
    if args.jobs < 1:
        parser.error('--jobs must be positive')
    if args.max_load is not None and (not math.isfinite(args.max_load) or args.max_load < 0):
        parser.error('--max-load must be a finite non-negative number')
    manifest = json.loads(browser_suite.MANIFEST.read_text())
    assignments = browser_suite.shard_assignments(json.loads(browser_suite.SHARDS.read_text()), manifest)
    selected = set(args.suites)
    if selected - set(manifest['suites']) or len(selected) != len(args.suites):
        parser.error('Select unique suites from the browser manifest')
    if selected:
        assignments = {shard: [test for test in tests if test in selected]
                       for shard, tests in assignments.items() if selected.intersection(tests)}
    initial_load = os.getloadavg()[0]
    if args.max_load is not None and initial_load > args.max_load:
        parser.error(f'One-minute load {initial_load:.2f} exceeds --max-load {args.max_load:g}')
    logical_cores = os.cpu_count()
    if logical_cores is None:
        parser.error('Cannot determine the logical core count for load monitoring')
    base = ROOT/'out/test-artifacts'
    base.mkdir(parents=True, exist_ok=True)
    out = Path(tempfile.mkdtemp(prefix='parallel-browser-', dir=base))
    print(f'Local diagnostic evidence: {out} (--jobs {args.jobs})', flush=True)
    with monitor_load(out, initial_load, logical_cores, args.jobs):
        with ThreadPoolExecutor(max_workers=args.jobs) as executor:
            futures = [executor.submit(run_shard, shard, suites, out, args.hardware_gl, bool(selected))
                       for shard, suites in assignments.items()]
            for future in futures:
                future.result()
        report = join_reports(out, out/'joined', selected=selected or None)
    return 0 if report['matchesAcceptedBaseline'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
