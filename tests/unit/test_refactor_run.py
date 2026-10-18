"""The Stage 5 policy is stricter than the older trajectory-or-vibration join."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class RefactorRunPolicy(unittest.TestCase):
    def invoke(self, **changes):
        report = dict(passed=33, failed=4, total=37, allExecutedOnce=True,
                      matchesAcceptedBaseline=True,
                      issue11Workflow=dict(id='issue-11-stop-after-second-download', site='trajectory'))
        report.update(changes)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'result.json'
            path.write_text(json.dumps(report))
            return subprocess.run([
                sys.executable, str(ROOT/'tools/check-refactor-run.py'),
                '--policy', str(ROOT/'tests/baselines/stage5/run-policy.json'),
                '--browser-result', str(path)], text=True, capture_output=True)

    def test_unchanged_baseline_is_accepted(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertIn('"actualIssue11Workflow"', result.stdout)
        self.assertIn('"expectedIssue11Workflow"', result.stdout)

    def test_other_previously_accepted_exporter_site_is_a_stop(self):
        result = self.invoke(issue11Workflow=dict(id='issue-11-stop-after-second-download', site='vibration'))
        self.assertNotEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertIn('"site": "vibration"', result.stdout)
        self.assertIn('"site": "trajectory"', result.stdout)

    def test_defect_ceasing_to_fire_is_a_stop(self):
        result = self.invoke(issue11Workflow=None)
        self.assertNotEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertIn('"actualIssue11Workflow": null', result.stdout)

    def test_a_different_failure_shape_is_a_stop(self):
        result = self.invoke(issue11Workflow=dict(id='new-export-failure', site='trajectory'))
        self.assertNotEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertIn('new-export-failure', result.stdout)

    def test_counts_once_and_original_join_stay_required(self):
        for changes in [dict(passed=34, failed=3), dict(passed=35, failed=2), dict(allExecutedOnce=False),
                        dict(matchesAcceptedBaseline=False)]:
            with self.subTest(changes=changes):
                result = self.invoke(**changes)
                self.assertNotEqual(result.returncode, 0, result.stdout+result.stderr)
                self.assertIn('actualCounts', result.stdout)


if __name__ == '__main__':
    unittest.main()
