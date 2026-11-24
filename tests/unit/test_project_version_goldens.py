import copy
import gzip
import hashlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from project_version_goldens import project, verify_projection


class VersionGoldenProjectionTests(unittest.TestCase):
    def setUp(self):
        self.capture = {
            'session': {
                'appVersion': '0.10.15',
                'preset': {'appVersion': '0.10.15', 'zoom': 1.0},
                'unchanged': '0.10.15',
            }
        }
        self.captures = {str(i): copy.deepcopy(self.capture) for i in range(102)}
        self.baseline = {
            'tag': 'declared-api-delta',
            'commit': 'a' * 40,
            'captureProvenance': {'ci': {'runUrl': 'https://example.test/recorded-source'}},
        }
        raw = json.dumps({'baseline': self.baseline, 'captures': self.captures}).encode()
        self.golden = gzip.compress(raw, mtime=0)
        self.summary = json.dumps({
            'baseline': self.baseline, 'goldenSha256': hashlib.sha256(raw).hexdigest()
        }).encode()
        self.commit = 'b' * 40

    def test_projects_exactly_204_leaves_and_preserves_capture_provenance(self):
        golden, summary, receipt = project(self.golden, self.summary, self.commit)
        raw = gzip.decompress(golden)
        result = json.loads(raw)
        self.assertEqual(verify_projection(self.captures, result['captures']), 204)
        self.assertEqual(result['captures']['0']['session']['unchanged'], '0.10.15')
        self.assertEqual(result['baseline']['captureProvenance'], self.baseline['captureProvenance'])
        self.assertEqual(summary['baseline'], result['baseline'])
        self.assertEqual(summary['baseline']['tag'], 'v0.10.16')
        self.assertEqual(summary['baseline']['commit'], self.commit)
        self.assertEqual(summary['goldenSha256'], hashlib.sha256(raw).hexdigest())
        self.assertEqual(receipt['changedVersionLeaves'], 204)
        self.assertEqual(receipt['sourceGoldenSha256'], hashlib.sha256(self.golden).hexdigest())
        self.assertEqual(receipt['resultGoldenSha256'], hashlib.sha256(golden).hexdigest())

    def test_rejects_an_extra_capture_change_even_within_float_tolerance(self):
        golden, _, _ = project(self.golden, self.summary, self.commit)
        projected = json.loads(gzip.decompress(golden))['captures']
        projected['0']['session']['preset']['zoom'] += 1e-13
        with self.assertRaisesRegex(ValueError, 'Unexpected non-version capture change.*zoom'):
            verify_projection(self.captures, projected)
