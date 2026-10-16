"""Source/run identity shared by CI workers and their evidence joins."""
import hashlib
import os
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def artifact_identity(root=ROOT):
    git = lambda *args: subprocess.check_output(['git', *args], cwd=root, text=True).strip()
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        assert not git('status', '--porcelain', '--untracked-files=no'), 'CI source was modified'
    return {
        'commit': git('rev-parse', 'HEAD'), 'tree': git('rev-parse', 'HEAD^{tree}'),
        'appSha256': digest(root / 'assets/app/js/app.js'),
        'qaSha256': digest(root / 'assets/app/js/qa-characterize.js'),
        'goldenSha256': digest(root / 'tests/baselines/characterize.json.gz'),
        'manifestSha256': digest(root / 'tests/baselines/browser-suite.json'),
        'ciRunUrl': (f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
                     if os.environ.get('GITHUB_ACTIONS') == 'true' else None),
        'ciRunAttempt': os.environ.get('GITHUB_RUN_ATTEMPT') if os.environ.get('GITHUB_ACTIONS') == 'true' else None,
    }


def require_same_artifact(reports, expected):
    assert reports, 'No worker evidence'
    for report in reports:
        assert report.get('artifactIdentity') == expected, 'Worker source/run identity differs from the join checkout'
