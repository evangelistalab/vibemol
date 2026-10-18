"""Explicit CI-only recording of the published v0.10.0 tree, never a version waiver."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def require_published_release_source(root, source_root, args, report_path):
    """The one authorized refresh records an exact archive of the published tag."""
    expected_tag = 'v0.10.0'
    root, source_root = Path(root).resolve(), Path(source_root).resolve()
    git = lambda *a: subprocess.check_output(['git', *a], cwd=root).decode().strip()
    actual = {
        'recordReleaseTag': args.record_release_tag,
        'ci': os.environ.get('GITHUB_ACTIONS'),
        'ref': os.environ.get('GITHUB_REF'),
        'updateBaseline': args.update_baseline,
        'injectHarness': args.inject_harness,
        'prepareFixtures': args.prepare_fixtures,
        'runs': args.runs,
        'matrixRunIndex': args.matrix_run_index,
        'shallow': git('rev-parse', '--is-shallow-repository'),
    }
    expected = {
        'recordReleaseTag': expected_tag, 'ci': 'true',
        'ref': 'refs/tags/' + expected_tag, 'updateBaseline': True,
        'injectHarness': False, 'prepareFixtures': False, 'runs': 2,
        'matrixRunIndex': None, 'shallow': 'false',
    }
    print('[release-baseline-mode] ' + json.dumps({'actual': actual, 'expected': expected}, sort_keys=True), flush=True)
    assert actual == expected, (actual, expected)
    commit = git('rev-parse', expected_tag + '^{commit}')
    tree = git('rev-parse', expected_tag + '^{tree}')
    source_identity = {'head': git('rev-parse', 'HEAD'), 'githubSha': os.environ.get('GITHUB_SHA')}
    expected_identity = {'head': commit, 'githubSha': commit}
    print('[release-baseline-tag] ' + json.dumps({'actual': source_identity, 'expected': expected_identity}), flush=True)
    assert source_identity == expected_identity, (source_identity, expected_identity)
    published_path = os.environ.get('VIBEMOL_PUBLISHED_RELEASE_JSON')
    assert published_path, 'The workflow must preserve gh release view output before recording.'
    published = json.loads(Path(published_path).read_text())
    publication = {k: published.get(k) for k in ('tagName', 'isDraft', 'isPrerelease')}
    expected_publication = {'tagName': expected_tag, 'isDraft': False, 'isPrerelease': False}
    print('[release-baseline-publication] ' + json.dumps({'actual': publication, 'expected': expected_publication,
          'publishedAt': published.get('publishedAt'), 'url': published.get('url')}, sort_keys=True), flush=True)
    assert publication == expected_publication and published.get('publishedAt'), (publication, expected_publication)
    assert published.get('url') == 'https://github.com/evangelistalab/vibemol/releases/tag/v0.10.0', published
    # Verify every archived blob, not merely app.js or the version constant.
    listing = subprocess.check_output(['git', 'ls-tree', '-rz', '--full-tree', expected_tag + '^{tree}'], cwd=root)
    expected_paths, mismatches = set(), []
    for entry in listing.split(b'\0'):
        if not entry:
            continue
        header, raw_path = entry.split(b'\t', 1)
        mode, kind, oid = header.decode().split(' ')
        name = raw_path.decode()
        assert mode in ('100644', '100755') and kind == 'blob', (name, mode, kind)
        expected_paths.add(name)
        path = source_root / name
        if not path.is_file() or path.is_symlink():
            mismatches.append({'path': name, 'actual': 'missing or symlink', 'expectedBlob': oid})
            continue
        raw = path.read_bytes()
        actual_oid = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if actual_oid != oid:
            mismatches.append({'path': name, 'actualBlob': actual_oid, 'expectedBlob': oid})
    actual_paths = {str(p.relative_to(source_root)) for p in source_root.rglob('*') if p.is_file() or p.is_symlink()}
    extras, missing = sorted(actual_paths - expected_paths), sorted(expected_paths - actual_paths)
    archive = {'actualFiles': len(actual_paths), 'expectedFiles': len(expected_paths),
               'actualMismatches': mismatches, 'expectedMismatches': [],
               'actualExtraPaths': extras, 'expectedExtraPaths': [],
               'actualMissingPaths': missing, 'expectedMissingPaths': []}
    print('[release-baseline-archive] ' + json.dumps(archive, sort_keys=True), flush=True)
    assert not (mismatches or extras or missing), archive
    version_source = (source_root / 'assets/app/js/asset-urls.js').read_text()
    found = re.search(r"const APP_VERSION = '([^']+)';", version_source)
    version = {'actual': found.group(1) if found else None, 'expected': '0.10.0'}
    print('[release-baseline-version] ' + json.dumps(version), flush=True)
    assert version['actual'] == version['expected'], version
    report = {'status': 'passed', 'tag': expected_tag, 'commit': commit, 'tree': tree,
              'archivedFiles': len(expected_paths), 'allArchivedBlobsMatchTag': True,
              'publishedRelease': published, 'ciRunId': os.environ.get('GITHUB_RUN_ID'),
              'ciRunAttempt': os.environ.get('GITHUB_RUN_ATTEMPT'), 'runnerName': os.environ.get('RUNNER_NAME'),
              'harnessInjection': False, 'fixturePreparation': False}
    Path(report_path).write_text(json.dumps(report, indent=2) + '\n')
    return {'commit': commit, 'tag': expected_tag}
