import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'e2e'))
from characterize import first_difference
from browser_suite import failure_details, matches_known_defect


class CharacterizationComparisonTests(unittest.TestCase):
    def test_last_ulp_drift_is_portable(self):
        self.assertIsNone(first_difference(2.375228488400047e-06, 2.3752284884000466e-06))
        self.assertIsNone(first_difference(2.7065756611495235e-07, 2.7065756611495256e-07))
        self.assertIsNone(first_difference({'x': [1.0, 0.0]}, {'x': [1.0 + 5e-10, 5e-13]}))

    def test_changes_outside_each_tolerance_fail(self):
        self.assertIsNotNone(first_difference(1.0, 1.0 + 2e-9))
        self.assertIsNotNone(first_difference(0.0, 2e-12))
        self.assertIsNotNone(first_difference(2.375228488400047e-06, 2.375228488400047e-06 + 1e-6))
        self.assertIsNotNone(first_difference(float('nan'), float('nan')))

    def test_types_and_nonfloat_values_stay_exact(self):
        for expected, actual in [(1, 1.0), (False, 0), (True, 1.0), (1, 2),
                                 (False, True), ('1.0', '1.0000000001'), (None, False),
                                 ({'x': 1.0}, {'y': 1.0}), ([1.0], [1.0, 1.0]),
                                 ([1.0], {'0': 1.0})]:
            with self.subTest(expected=expected, actual=actual):
                self.assertIsNotNone(first_difference(expected, actual))

    def test_nested_failure_is_not_hidden_by_a_tolerable_float(self):
        self.assertEqual(first_difference({'x': 1.0, 'values': [7]}, {'x': 1.0 + 5e-10, 'values': [8]}),
                         "$.values[0]: '7' != '8'")


    def test_future_session_versions_are_not_exempted_after_release(self):
        import copy
        import gzip
        import json
        from characterize import expected_captures
        root = pathlib.Path(__file__).resolve().parents[2]
        golden = json.loads(gzip.decompress((root / 'tests/baselines/characterize.json.gz').read_bytes()))
        expected = expected_captures(golden, root)
        self.assertEqual(expected, golden['captures'])
        name = next(iter(expected))
        for path in [('session', 'appVersion'), ('session', 'preset', 'appVersion')]:
            with self.subTest(full_path=path):
                wrong = copy.deepcopy(expected)
                owner = wrong[name]
                for part in path[:-1]:
                    owner = owner[part]
                self.assertEqual(owner[path[-1]], '0.10.0')
                owner[path[-1]] = '0.11.0'
                actual = first_difference(expected, wrong)
                self.assertIsNotNone(actual)
                self.assertIn('.'.join(path), actual)


class BrowserFailureReportingTests(unittest.TestCase):
    def test_first_failure_uses_innermost_suite_site(self):
        log = ('  File "/repo/tests/e2e/axis_gizmo.py", line 179, in <module>\n'
               '  File "/repo/tests/e2e/axis_gizmo.py", line 130, in run\nAssertionError\n')
        details = failure_details(log)
        self.assertEqual(details['firstFailure'], {'suite': 'axis_gizmo.py', 'line': 130, 'function': 'run'})
        self.assertEqual(details['exceptionType'], 'AssertionError')

    def test_other_failures_cannot_be_absorbed_as_known_defects(self):
        # Issue #4's corrected gate identifies the workflow; traceback lines
        # and whole-file hashes change when the harness is edited.
        known = {'workflow': 'escape-canvas-focus', 'exceptionType': 'AssertionError'}
        result = {'failureWorkflow': {'id': known['workflow']},
                  'exceptionType': 'AssertionError', 'exitCode': 1}
        self.assertTrue(matches_known_defect(result, known))
        for key, value in [('exitCode', 0), ('failureWorkflow', None), ('exceptionType', 'TimeoutError'),
                           ('failureWorkflow', {'id': 'different-action'})]:
            with self.subTest(key=key):
                self.assertFalse(matches_known_defect({**result, key: value}, known))


if __name__ == '__main__':
    unittest.main()
