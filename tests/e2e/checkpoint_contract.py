"""Count declared evidence records independently of suite exit status."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'tests/baselines/browser-suite.json'


def checkpoint_counts(log, expected):
    counts = dict.fromkeys(expected, 0)
    errors = []
    for line in log.splitlines():
        for marker in expected:
            prefix = '[' + marker + '] '
            if line.startswith(prefix):
                try:
                    record = json.loads(line[len(prefix):])
                    if not isinstance(record, dict):
                        raise ValueError('expected JSON object')
                    counts[marker] += 1
                except ValueError as error:
                    errors.append(dict(marker=marker, record=line, error=str(error)))
    return counts, errors


def require_counts(actual, expected, *, suite, errors=None, required=True):
    passed = (set(actual) == set(expected) and not errors
              and all(type(value) is int and value > 0 for value in expected.values())
              and all(type(actual[key]) is int and actual[key] == value for key, value in expected.items()))
    row = dict(suite=suite, actual=actual, expected=expected, invalidRecords=errors or [], passed=bool(passed))
    print('[checkpoint-counts] ' + json.dumps(row, sort_keys=True), flush=True)
    if required:
        assert passed, row
    return row


def require_checkpoint_counts(log, suite, expectations, *, required=True):
    expected = expectations.get(suite, {})
    counts, errors = checkpoint_counts(log, expected)
    return require_counts(counts, expected, suite=suite, errors=errors, required=required)


def require_phase_counts(actual, suite, *markers):
    """A supplemental matrix checks only its own declared markers."""
    assert markers and len(markers)==len(set(markers)), {'actual': markers, 'expected': 'nonempty distinct phase checkpoint inventory'}
    declared = json.loads(MANIFEST.read_text())['checkpointCounts'][suite]
    expected = {marker: declared[marker] for marker in markers}
    return require_counts(actual, expected, suite=suite)
