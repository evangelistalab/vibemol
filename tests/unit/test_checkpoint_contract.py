"""A clean process exit cannot substitute for declared checkpoint execution."""
import contextlib
import io
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tests/e2e'))
from checkpoint_contract import require_checkpoint_counts, require_counts


class CheckpointContractTests(unittest.TestCase):
    def check(self, count=115, extra='', required=True):
        log = '[edit-api] {"actual":true,"expected":true}\n' * count + extra
        with contextlib.redirect_stdout(io.StringIO()):
            return require_checkpoint_counts(log, 'api', {'api': {'edit-api': 115}}, required=required)

    def test_exact_count_passes(self):
        self.assertEqual(self.check()['actual'], {'edit-api': 115})

    def test_zero_short_and_extra_fail_even_with_clean_suite_output(self):
        for count in (0, 1, 114, 116, 230):
            with self.subTest(count=count), self.assertRaises(AssertionError):
                self.check(count, 'Suite passed\n')

    def test_malformed_and_non_object_records_fail(self):
        for data in ('{', 'null', '[]', 'true'):
            with self.subTest(data=data), self.assertRaises(AssertionError):
                self.check(extra='[edit-api] '+data+'\n')

    def test_worker_can_record_failure_and_continue_collecting(self):
        row = self.check(0, required=False)
        self.assertFalse(row['passed'])
        self.assertEqual(row['actual'], {'edit-api': 0})

    def test_bools_and_zero_expectations_cannot_mask_missing_execution(self):
        for actual, expected in [({'x':False},{'x':0}), ({'x':True},{'x':1}), ({'x':1},{'x':True}), ({},{'x':1})]:
            with contextlib.redirect_stdout(io.StringIO()), self.subTest(actual=actual), self.assertRaises(AssertionError):
                require_counts(actual, expected, suite='test')

    def test_current_manifest_declares_new_api_and_existing_exporter_coverage(self):
        manifest = json.loads((ROOT/'tests/baselines/browser-suite.json').read_text())
        self.assertEqual(manifest['checkpointCounts'], {
            'tests/e2e/premerge.py': {'edit-api':115, 'edit-api-rejection':26},
            'tests/e2e/smoke.py': {'video-activation':58, 'video-export-completion':2, 'smoke-spinor-launcher':8},
        })


if __name__ == '__main__':
    unittest.main()
