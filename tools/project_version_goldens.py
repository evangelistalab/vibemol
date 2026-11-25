"""Project a VibeMol version change in existing goldens."""

import argparse
import copy
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
from api_surface_recording import exact_difference
from release_baseline_recording import VERSION_DELTA_PATHS, require_version

SOURCE_VERSION = '0.10.15'
TARGET_VERSION = '0.10.16'
CAPTURE_COUNT = 102
VERSION_LEAF_COUNT = 204


def rewrite_version_leaves(captures, before, after):
    if len(captures) != CAPTURE_COUNT:
        raise ValueError(f'Expected {CAPTURE_COUNT} captures, got {len(captures)}')
    changed = 0
    for name, capture in captures.items():
        for path in VERSION_DELTA_PATHS:
            owner = capture
            for key in path[:-1]:
                owner = owner[key]
            leaf = path[-1]
            actual = owner[leaf]
            if actual != before:
                raise ValueError(f'{name} {".".join(path)}: expected {before}, got {actual!r}')
            owner[leaf] = after
            changed += 1
    if changed != VERSION_LEAF_COUNT:
        raise ValueError(f'Expected {VERSION_LEAF_COUNT} version changes, got {changed}')
    return changed


def verify_projection(before, after, source_version=SOURCE_VERSION, target_version=TARGET_VERSION):
    restored = copy.deepcopy(after)
    changed = rewrite_version_leaves(restored, target_version, source_version)
    difference = exact_difference(before, restored)
    if difference is not None:
        raise ValueError(f'Unexpected non-version capture change: {difference}')
    return changed


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def project(source_golden, source_summary, commit, source_version=SOURCE_VERSION, target_version=TARGET_VERSION):
    if source_version == target_version or not all(re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version)
                                                   for version in (source_version, target_version)):
        raise ValueError('Expected two different release versions')
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Expected a full source commit SHA')
    source_raw = gzip.decompress(source_golden)
    document = json.loads(source_raw)
    summary = json.loads(source_summary)
    if (summary['goldenSha256'] != sha256(source_raw)
            or exact_difference(document['baseline'], summary['baseline']) is not None):
        raise ValueError('The source summary does not identify the source golden')

    previous = document['captures']
    projected = copy.deepcopy(previous)
    rewrite_version_leaves(projected, source_version, target_version)
    document['captures'] = projected
    document['baseline'].update(tag=f'v{target_version}', commit=commit, recordingMode='version-projection')
    raw = (json.dumps(document, indent=2) + '\n').encode()
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode='wb', mtime=0) as stream:
        stream.write(raw)
    golden = compressed.getvalue()
    readback = json.loads(gzip.decompress(golden))
    changed = verify_projection(previous, readback['captures'], source_version, target_version)
    summary.update(baseline=document['baseline'], goldenSha256=sha256(raw))
    receipt = {
        'sourceGoldenSha256': sha256(source_golden),
        'resultGoldenSha256': sha256(golden),
        'changedVersionLeaves': changed,
        'toolSha256': sha256(Path(__file__).read_bytes()),
    }
    return golden, summary, receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', required=True, help='Commit containing the target runtime stamp')
    parser.add_argument('--from-version', default=SOURCE_VERSION)
    parser.add_argument('--to-version', default=TARGET_VERSION)
    args = parser.parse_args()
    require_version(ROOT, args.to_version)
    baselines = ROOT / 'tests/baselines'
    golden_path = baselines / 'characterize.json.gz'
    summary_path = baselines / 'characterize-summary.json'
    golden, summary, receipt = project(golden_path.read_bytes(), summary_path.read_bytes(), args.commit,
                                      args.from_version, args.to_version)
    golden_path.write_bytes(golden)
    summary_path.write_text(json.dumps(summary, indent=2) + '\n')
    (baselines / f'version-projection-{args.to_version}.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
