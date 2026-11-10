"""Exact authorized CI release recording; never an ordinary version waiver."""
import copy
import gzip
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
    archived_files = require_exact_archive(root, source_root, commit)
    require_version(source_root, '0.10.0')
    report = {'status': 'passed', 'tag': expected_tag, 'commit': commit, 'tree': tree,
              'archivedFiles': archived_files, 'allArchivedBlobsMatchTag': True,
              'publishedRelease': published, 'ciRunId': os.environ.get('GITHUB_RUN_ID'),
              'ciRunAttempt': os.environ.get('GITHUB_RUN_ATTEMPT'), 'runnerName': os.environ.get('RUNNER_NAME'),
              'harnessInjection': False, 'fixturePreparation': False}
    Path(report_path).write_text(json.dumps(report, indent=2) + '\n')
    return {'commit': commit, 'tag': expected_tag}



def require_exact_archive(root, source_root, commit):
    """Verify every archived blob, including unexpected/missing paths."""
    listing = subprocess.check_output(['git', 'ls-tree', '-rz', '--full-tree', commit + '^{tree}'], cwd=root)
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
    return len(expected_paths)


def require_version(source_root, expected_version):
    version_source = (source_root / 'assets/app/js/asset-urls.js').read_text()
    found = re.search(r"const APP_VERSION = '([^']+)';", version_source)
    version = {'actual': found.group(1) if found else None, 'expected': expected_version}
    print('[release-baseline-version] ' + json.dumps(version), flush=True)
    assert version['actual'] == version['expected'], version
    return version['actual']


SHIPPED_0100_COMMIT = '44bcb5d534cecba27fd0ccfc60f74324a0920b73'
VERSION_DELTA_BASE_COMMIT = '4709f1d676f793222ebc7f758692a69824c5541a'
VERSION_DELTA_BASE_SHA256 = '2b22cd7dd75cf2d64f54cfd7e57370af43ed1327efb1428b27da2e74b721e427'
VERSION_DELTA_PATHS = (('session', 'appVersion'), ('session', 'preset', 'appVersion'))
VERSION_DELTA_TAGS = ('v0.10.2', 'v0.10.3')


def version_delta_declaration(tag):
    specs = {
        'v0.10.2': (VERSION_DELTA_BASE_COMMIT, VERSION_DELTA_BASE_SHA256, '0.10.1', '0.10.2'),
        'v0.10.3': ('bd1186959f7b451edcdf6b9d8d6a0b26b7bf2008',
                    'fd5d9011685d44e1f7225afe05b9fbfed865e53f150f20d6e0be6743d15e43de', '0.10.2', '0.10.3'),
    }
    base, digest, before, after = specs[tag]
    return dict(baseCommit=base, baselineGzipSha256=digest, paths=[list(path) for path in VERSION_DELTA_PATHS],
                before=before, after=after, changedLeaves=204)


def read_version_delta_base(root, tag='v0.10.2'):
    """Pin and declare the complete authorized204-leaf change before capture."""
    declared = version_delta_declaration(tag)
    raw = subprocess.check_output(['git', 'show', declared['baseCommit'] +
        ':tests/baselines/characterize.json.gz'], cwd=root)
    digest = hashlib.sha256(raw).hexdigest()
    print('[version-recording-base] ' + json.dumps(dict(actual=digest, expected=declared['baselineGzipSha256'])), flush=True)
    assert digest == declared['baselineGzipSha256'], (digest, declared['baselineGzipSha256'])
    previous = json.loads(gzip.decompress(raw))['captures']
    expected_version_captures(previous, tag)
    print('[release-version-declaration] ' + json.dumps(dict(declared, captures=102)), flush=True)
    return previous


def expected_version_captures(previous, tag='v0.10.2'):
    """Recording-only expectation; ordinary comparisons never call this."""
    assert type(previous) is dict and len(previous) == 102, ('Capture count', len(previous), 102)
    expected = copy.deepcopy(previous)
    declared = version_delta_declaration(tag)
    changes = 0
    for name, capture in expected.items():
        for path in VERSION_DELTA_PATHS:
            value = capture
            for key in path[:-1]:
                value = value[key]
            actual = value[path[-1]]
            assert type(actual) is str and actual == declared['before'], (name, path, actual, declared['before'])
            value[path[-1]] = declared['after']
            changes += 1
    assert changes == 204, (changes, 204)
    return expected


def verify_version_delta(previous, captured, tag='v0.10.2'):
    """Refuse any additional leaf, type, value, inventory or numeric change."""
    from api_surface_recording import exact_difference
    declared = version_delta_declaration(tag)
    expected = expected_version_captures(previous, tag)
    diff = exact_difference(expected, captured)
    changes = [dict(capture=name, path=list(path), before=declared['before'], after=declared['after'])
               for name in expected for path in VERSION_DELTA_PATHS]
    actual_changes = []
    if type(captured) is dict:
        for name in previous:
            for path in VERSION_DELTA_PATHS:
                try:
                    value = captured[name]
                    for key in path:
                        value = value[key]
                except (KeyError, TypeError):
                    continue
                if type(value) is not str or value != declared['before']:
                    actual_changes.append(dict(capture=name, path=list(path), value=value))
    report = dict(previousCommit=declared['baseCommit'], previousGzipSha256=declared['baselineGzipSha256'],
        expectedCaptures=102, actualCaptures=len(captured), expectedChangedLeaves=204,
        actualChangedLeaves=len(actual_changes), changes=changes,
        residualDifference=diff, zeroOtherChanges=diff is None)
    print('[release-version-delta] ' + json.dumps(report, sort_keys=True), flush=True)
    assert len(actual_changes) == 204, ('Version leaf count', len(actual_changes), 204, diff)
    assert diff is None, ('Undeclared capture change; refuse release recording', diff)
    return report


def require_release_candidate_source(root, source_root, args, report_path):
    """Explicitly authorized candidate; no publication or version waiver."""
    root, source_root = Path(root).resolve(), Path(source_root).resolve()
    git = lambda *a: subprocess.check_output(['git', *a], cwd=root).decode().strip()
    commit = args.record_source_commit
    assert commit and re.fullmatch(r'[0-9a-f]{40}', commit), 'Full immutable candidate SHA required.'
    specs = {'v0.10.1': ('0.10.1', 'refs/heads/codex/release-0-10-1-ci'),
             'v0.10.2': ('0.10.2', 'refs/heads/codex/pr90-0.10.2-recording'),
             'v0.10.3': ('0.10.3', 'refs/heads/codex/0.10.3')}
    assert args.record_release_tag in specs, args.record_release_tag
    version, ref = specs[args.record_release_tag]
    actual = dict(recordReleaseTag=args.record_release_tag, ci=os.environ.get('GITHUB_ACTIONS'),
        ref=os.environ.get('GITHUB_REF'), event=os.environ.get('GITHUB_EVENT_NAME'),
        updateBaseline=args.update_baseline, injectHarness=args.inject_harness,
        prepareFixtures=args.prepare_fixtures, runs=args.runs, matrixRunIndex=args.matrix_run_index,
        shallow=git('rev-parse', '--is-shallow-repository'), head=git('rev-parse', 'HEAD'),
        githubSha=os.environ.get('GITHUB_SHA'))
    expected = dict(recordReleaseTag=args.record_release_tag, ci='true',
        ref=ref, event='workflow_dispatch',
        updateBaseline=True, injectHarness=False, prepareFixtures=False, runs=2,
        matrixRunIndex=None, shallow='false', head=commit, githubSha=commit)
    print('[release-candidate-mode] '+json.dumps(dict(actual=actual, expected=expected),sort_keys=True),flush=True)
    assert actual == expected, (actual, expected)
    corrected = git('rev-parse', 'v0.10.0^{commit}')
    print('[release-base-tag] '+json.dumps(dict(actual=corrected,expected=SHIPPED_0100_COMMIT)),flush=True)
    assert corrected == SHIPPED_0100_COMMIT, (corrected, SHIPPED_0100_COMMIT)
    subprocess.run(['git','merge-base','--is-ancestor',SHIPPED_0100_COMMIT,commit],cwd=root,check=True)
    files = require_exact_archive(root, source_root, commit)
    require_version(source_root, version)
    version_delta = version_delta_declaration(args.record_release_tag) if args.record_release_tag in VERSION_DELTA_TAGS else None
    if version_delta:
        subprocess.run(['git', 'merge-base', '--is-ancestor', version_delta['baseCommit'], commit], cwd=root, check=True)
        read_version_delta_base(root, args.record_release_tag)
    absent = not (source_root / 'tests/e2e/release_version_mapping.py').exists()
    assert absent, 'Expired version-mapping helper must remain absent.'
    report = dict(status='passed', recordingMode='candidate', tag=args.record_release_tag, commit=commit,
        tree=git('rev-parse',commit+'^{tree}'), sourceRefAtCapture=actual['ref'],
        archivedFiles=files, allArchivedBlobsMatchCommit=True, correctedReleaseBase=corrected,
        mappingHelperAbsent=absent, publicationPending=True, ciRunId=os.environ.get('GITHUB_RUN_ID'),
        ciRunAttempt=os.environ.get('GITHUB_RUN_ATTEMPT'), runnerName=os.environ.get('RUNNER_NAME'),
        harnessInjection=False, fixturePreparation=False)
    if version_delta:
        report['versionDelta'] = version_delta
    Path(report_path).write_text(json.dumps(report,indent=2)+'\n')
    return dict(commit=commit,tag=args.record_release_tag,recordingMode='candidate',sourceRefAtCapture=actual['ref'])
