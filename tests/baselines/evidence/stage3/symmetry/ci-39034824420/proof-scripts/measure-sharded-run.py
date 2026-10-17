"""Measure completed candidate CI evidence; output stays outside the tested tree."""
import datetime
import hashlib
import json
import pathlib
import re
import sys

folder = pathlib.Path(sys.argv[1])
run = json.loads((folder / 'run.json').read_text())
assert run['status'] == 'completed'
stamp = lambda value: datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
elapsed = lambda start, end: (stamp(end) - stamp(start)).total_seconds()
jobs = {job['name']: job for job in run['jobs']}
assert len(jobs) == len(run['jobs']) == 11
assert all(job['status'] == 'completed' for job in jobs.values())
job_times = {name: elapsed(job['startedAt'], job['completedAt']) for name, job in jobs.items()}
finished = max(job['completedAt'] for job in jobs.values())
seconds = elapsed(run['createdAt'], finished)
baseline = 132.93 * 60
shards = []
for path in sorted((folder / 'artifacts').glob('browser-suite-*/browser-suite/browser-results.json')):
    report = json.loads(path.read_text())
    assert report['artifactIdentity']['ciRunUrl'] == run['url']
    assert report['artifactIdentity']['ciRunAttempt'] == str(run['attempt'])
    name = report['shard']
    shards.append({'shard': name, 'suites': len(report['suites']),
                   'subprocessSeconds': round(sum(s['wallTimeSeconds'] for s in report['suites']), 2),
                   'batchSeconds': report['wallTimeSeconds'],
                   'jobSeconds': job_times['Browser suites (' + name + ')']})
assert len(shards) == 5
log = (folder / 'run.log').read_text()
cache = [line for line in log.splitlines()
         if 'Cache not found for input keys:' in line or 'Cache restored from key:' in line]
miss_jobs = sorted({line.split('\t', 1)[0] for line in cache if 'Cache not found' in line})
hit_jobs = sorted({line.split('\t', 1)[0] for line in cache if 'Cache restored from key:' in line})
assert not set(miss_jobs) & set(hit_jobs)
assert len(miss_jobs) + len(hit_jobs) == 8
versions = sorted(set(re.findall(r'playwright-([0-9.]+)-(?:chromium|webkit)', '\n'.join(cache))))
char = json.loads((folder / 'artifacts/characterization-results/characterize-evidence.json').read_text())
assert char['artifactIdentity']['ciRunUrl'] == run['url'] if 'artifactIdentity' in char else True
worker_names = [name for name in jobs if name.startswith('Browser suites (') or name.startswith('Characterization (')]
last_worker = max(worker_names, key=lambda name: jobs[name]['completedAt'])
summary = {'runUrl': run['url'], 'head': run['headSha'], 'attempt': run['attempt'],
           'conclusion': run['conclusion'], 'createdAt': run['createdAt'], 'lastJobCompletedAt': finished,
           'workflowSeconds': seconds, 'workflowMinutes': seconds / 60,
           'baselineMinutes': 132.93, 'savedMinutes': (baseline - seconds) / 60,
           'reductionPercent': (baseline - seconds) / baseline * 100, 'speedup': baseline / seconds,
           'jobSeconds': job_times, 'shards': shards, 'lastWorker': last_worker,
           'lastJob': max(jobs, key=lambda name: jobs[name]['completedAt']),
           'characterizationWorkerSeconds': char['workerWallTimeSeconds'],
           'characterizationJoinSeconds': job_times['Exact characterization repeat and goldens'],
           'browserJoinSeconds': job_times['Aggregate browser gate (34/3/37)'],
           'cache': {'restoreHits': len(hit_jobs), 'restoreMisses': len(miss_jobs),
                     'hitJobs': hit_jobs, 'missJobs': miss_jobs, 'playwrightVersions': versions},
           'measurementLimit': 'One observed workflow run; runner variation, setup, queues, artifacts and joins included.'}
(folder / 'timing-vs-132.93.json').write_text(json.dumps(summary, indent=2) + '\n')
hashes = {str(p.relative_to(folder)): hashlib.sha256(p.read_bytes()).hexdigest()
          for p in sorted((folder / 'artifacts').rglob('*')) if p.is_file()}
(folder / 'downloaded-sha256.json').write_text(json.dumps(hashes, indent=2) + '\n')
print(json.dumps(summary, indent=2))
