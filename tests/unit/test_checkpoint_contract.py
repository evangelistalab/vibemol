"""A clean process exit cannot substitute for declared checkpoint execution."""
import contextlib
import io
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tests/e2e'))
from checkpoint_contract import require_checkpoint_counts, require_counts, require_phase_counts


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
            'tests/e2e/premerge.py': {'edit-api':115, 'edit-api-rejection':26, 'atomic-identity-rejection':24, 'edit-testing-case':84},
            'tests/e2e/smoke.py': {'video-activation':58, 'video-export-completion':2, 'smoke-spinor-launcher':8},
            'tests/e2e/look_references.py': {'registry-readback':500},
            'tests/e2e/axis_gizmo.py': {'escape-native-case':62},
            'tests/e2e/edit_tool.py': {'metal-native-case':28,'edit-tool-state':59},
            'tests/e2e/build_panel.py': {'retired-cache-case':4},
            'tests/e2e/figure.py': {'figure-runner':40, 'scientific-buffer-synchronous':17, 'scientific-buffer-worker':17, 'scientific-buffer-coordinate-owners':8, 'published-ownership':13},
            'tests/e2e/calculations.py': {'forte2-case':68, 'calculations-default':1},
            'tests/e2e/ux_review.py': {'avas-hitbox-method':5},
            'tests/e2e/measurements.py': {'measurement-connection-width':20, 'measurement-connection-fog':4},
            'tests/e2e/workbench_release.py': {'water-tutorial':2},
        })

    def test_phase_guards_reject_zero_short_and_extra_counts(self):
        for suite,marker,count in [('look_references','registry-readback',500),('axis_gizmo','escape-native-case',62),
                                   ('edit_tool','metal-native-case',28),('edit_tool','edit-tool-state',59),
                                   ('premerge','atomic-identity-rejection',24),
                                   ('build_panel','retired-cache-case',4), ('ux_review','avas-hitbox-method',5)]:
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertTrue(require_phase_counts({marker:count},'tests/e2e/'+suite+'.py',marker)['passed'])
            for actual in (0,count-1,count+1):
                with self.subTest(marker=marker,actual=actual), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(AssertionError):
                    require_phase_counts({marker:actual},'tests/e2e/'+suite+'.py',marker)

    def test_figure_runner_cannot_stand_in_for_missing_buffer_phases(self):
        manifest = json.loads((ROOT/'tests/baselines/browser-suite.json').read_text())
        expected = manifest['checkpointCounts']['tests/e2e/figure.py']
        complete = ''.join(('['+marker+'] {}\n')*count for marker,count in expected.items())
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertTrue(require_checkpoint_counts(complete,'tests/e2e/figure.py',manifest['checkpointCounts'])['passed'])
        for missing in expected:
            partial = ''.join(('['+marker+'] {}\n')*count for marker,count in expected.items() if marker != missing)
            with self.subTest(missing=missing),contextlib.redirect_stdout(io.StringIO()),self.assertRaises(AssertionError):
                require_checkpoint_counts(partial,'tests/e2e/figure.py',manifest['checkpointCounts'])

    def test_phase_cannot_hide_missing_marker_or_use_another_phases_records(self):
        for actual in ({'edit-api':115},{'edit-api':115,'atomic-identity-rejection':24},{}):
            with self.subTest(actual=actual), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(AssertionError):
                require_phase_counts(actual,'tests/e2e/premerge.py','edit-api','edit-api-rejection')


if __name__ == '__main__':
    unittest.main()
