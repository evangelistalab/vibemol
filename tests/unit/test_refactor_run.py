"""Strict exporter stops apply to5a/5b; harness-only work and5c keep the ordinary two-site key."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class RefactorRunPolicy(unittest.TestCase):
    def invoke(self, preserve_signature=True, repaired=False, acceptance_phase="issue11", **changes):
        report = dict(passed=34, failed=3, total=37, allExecutedOnce=True,
                      matchesAcceptedBaseline=True,
                      issue11Workflow=dict(id='issue-11-stop-after-second-download', site='trajectory'))
        if repaired:
            report.update(passed=35, failed=2, issue11Workflow={'status':'passed'},
                actualFailingWorkflows=[['tests/e2e/axis_gizmo.py','escape-canvas-focus'],
                                       ['tests/e2e/mode_consistency.py','coordinates-delete-selection-card']],
                videoExportCompletion=[dict(prefix=p, downloads=6, naturalCompletion=True, earlyStop=True,
                    pointerCompletion=True, spaceCompletion=True, enterActivation=True,
                    clickOnlyActivation=True, freshSaveAssertions=4) for p in ['trajectory','vibration']])
        if repaired and acceptance_phase=='issue52':
            report.update(passed=36,failed=1,actualFailingWorkflows=[['tests/e2e/mode_consistency.py','coordinates-delete-selection-card']])
        if repaired and acceptance_phase=='issue53':
            report.update(passed=37,failed=0,actualFailingWorkflows=[])
        report.update(changes)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'result.json'
            path.write_text(json.dumps(report))
            policy = json.loads((ROOT/'tests/baselines/stage5/run-policy.json').read_text())
            # These strict-policy fixtures deliberately use a trajectory baseline.
            # Keep the synthetic policy paired with it, independent of the latest run's site.
            policy['issue11Workflow'] = dict(id='issue-11-stop-after-second-download', site='trajectory')
            policy['preserveExporterSignature'] = preserve_signature
            policy['requireVideoExportCompletion'] = repaired
            policy['acceptancePhase']=acceptance_phase
            policy['ordinaryExpected'] = dict(passed={'issue11':35,'issue52':36,'issue53':37}[acceptance_phase],failed={'issue11':2,'issue52':1,'issue53':0}[acceptance_phase],total=37) if repaired else dict(passed=34,failed=3,total=37)
            policy_path = Path(folder)/'policy.json'
            policy_path.write_text(json.dumps(policy))
            return subprocess.run([
                sys.executable, str(ROOT/'tools/check-refactor-run.py'),
                '--policy', str(policy_path),
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
        for changes in [dict(passed=33, failed=4), dict(passed=35, failed=2), dict(allExecutedOnce=False),
                        dict(matchesAcceptedBaseline=False)]:
            with self.subTest(changes=changes):
                result = self.invoke(**changes)
                self.assertNotEqual(result.returncode, 0, result.stdout+result.stderr)
                self.assertIn('actualCounts', result.stdout)


    def test_symmetry_uses_both_ordinary_accepted_exporter_sites(self):
        for site in ('trajectory', 'vibration'):
            result = self.invoke(preserve_signature=False,
                issue11Workflow=dict(id='issue-11-stop-after-second-download', site=site))
            self.assertEqual(result.returncode, 0, result.stdout+result.stderr)

    def test_symmetry_still_rejects_disappearance_new_shape_and_overperformance(self):
        for changes in [dict(issue11Workflow=None),
                        dict(issue11Workflow=dict(id='new-export-failure',site='trajectory')),
                        dict(issue11Workflow=dict(id='issue-11-stop-after-second-download',site='new-mode')),
                        dict(passed=35,failed=2)]:
            result = self.invoke(preserve_signature=False, **changes)
            self.assertNotEqual(result.returncode, 0, result.stdout+result.stderr)

    def test_current_group_uses_ordinary_site_policy(self):
        policy = json.loads((ROOT/'tests/baselines/stage5/run-policy.json').read_text())
        self.assertEqual(policy['group'], 'Issue53 local Coordinates click clearance; intentionally empty accepted set')
        self.assertEqual(policy['acceptancePhase'],'issue53')
        self.assertIs(policy['preserveExporterSignature'], False)
        self.assertIs(policy['requireVideoExportCompletion'], True)
        self.assertEqual(policy['ordinaryExpected'], dict(passed=37, failed=0, total=37))

    def test_repair_requires_both_complete_exporter_records(self):
        self.assertEqual(self.invoke(repaired=True).returncode, 0)
        valid=[dict(prefix=p, downloads=6, naturalCompletion=True, earlyStop=True,
                    pointerCompletion=True, spaceCompletion=True, enterActivation=True,
                    clickOnlyActivation=True, freshSaveAssertions=4) for p in ['trajectory','vibration']]
        for records in [[],valid[:1],valid[::-1],valid+[valid[0]],
                        [valid[0],{**valid[1],'spaceCompletion':False}],
                        [valid[0],{**valid[1],'freshSaveAssertions':3}]]:
            result=self.invoke(repaired=True,videoExportCompletion=records)
            self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)

    def test_repaired_gate_rejects_old_failure_and_overperformance(self):
        for changes in [dict(passed=34,failed=3),dict(passed=36,failed=1),
                        dict(issue11Workflow={'id':'issue-11-stop-after-second-download','site':'trajectory'}),
                        dict(actualFailingWorkflows=[]),dict(allExecutedOnce=False),dict(matchesAcceptedBaseline=False)]:
            result=self.invoke(repaired=True,**changes)
            self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)

    def test_issue52_exact_authorized_composition(self):
        self.assertEqual(self.invoke(repaired=True,acceptance_phase='issue52').returncode,0)
        for change in [dict(passed=35,failed=2),dict(passed=37,failed=0),dict(total=38),
                       dict(actualFailingWorkflows=[['tests/e2e/axis_gizmo.py','escape-canvas-focus']]),
                       dict(actualFailingWorkflows=[]),dict(allExecutedOnce=False)]:
            result=self.invoke(repaired=True,acceptance_phase='issue52',**change)
            self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)

    def test_issue53_intentionally_empty_composition_keeps_gate_machinery(self):
        self.assertEqual(self.invoke(repaired=True,acceptance_phase='issue53').returncode,0)
        for change in [dict(passed=36,failed=1),dict(passed=35,failed=2),
                       dict(actualFailingWorkflows=[['tests/e2e/mode_consistency.py','coordinates-delete-selection-card']]),
                       dict(videoExportCompletion=[]),dict(matchesAcceptedBaseline=False)]:
            result=self.invoke(repaired=True,acceptance_phase='issue53',**change)
            self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)


if __name__ == '__main__':
    unittest.main()
