import importlib.util
import json
import pathlib
import re
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
SPEC = importlib.util.spec_from_file_location('browser_suite', ROOT / 'tests/e2e/browser_suite.py')
GATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GATE)
MANIFEST = json.loads((ROOT / 'tests/baselines/browser-suite.json').read_text())
EVIDENCE = ROOT / 'tests/baselines/evidence/browser-ci-gate'


class WorkflowGateTests(unittest.TestCase):
    def result(self, suite, log, source=None):
        return {'exitCode': 1, 'test': f'tests/e2e/{suite}',
                **GATE.failure_details(log, suite, source or (ROOT / 'tests/e2e' / suite).read_text())}

    def accepted(self, suite, log, source=None):
        return GATE.matches_known_defect(self.result(suite, log, source),
                                        MANIFEST['knownDefects'][f'tests/e2e/{suite}'])

    def test_completed_ci_workflows_and_both_issue11_sites(self):
        for suite in ('axis_gizmo.py', 'mode_consistency.py', 'smoke.py'):
            log = (EVIDENCE / 'ci-38141289409' / suite.replace('.py', '.log')).read_text()
            with self.subTest(suite=suite):
                self.assertTrue(self.accepted(suite, log))
        for path, site in [('ci-38141289409/smoke.log', 'trajectory'), ('smoke.log', 'vibration')]:
            log = (EVIDENCE / path).read_text()
            self.assertTrue(self.accepted('smoke.py', log))
            self.assertEqual(self.result('smoke.py', log)['failureWorkflow']['site'], site)

    def test_line_shifts_are_diagnostic_only(self):
        for suite in ('axis_gizmo.py', 'mode_consistency.py', 'smoke.py'):
            log = (EVIDENCE / 'ci-38141289409' / suite.replace('.py', '.log')).read_text()
            shifted = re.sub(r'line (\d+)', lambda m: 'line ' + str(int(m[1]) + 123), log)
            source = '\n' * 123 + (ROOT / 'tests/e2e' / suite).read_text()
            self.assertTrue(self.accepted(suite, shifted, source))

    def test_edit_layout_failure_is_only_the_320px_width_workflow(self):
        old = (EVIDENCE / 'ci-39086927339/edit_tool.log').read_text()
        self.assertTrue(self.accepted('edit_tool.py', old))
        self.assertTrue(self.accepted('edit_tool.py', re.sub(r'line \d+', 'line 9999', old)))
        self.assertFalse(self.accepted('edit_tool.py', old.replace('AssertionError: 320', 'AssertionError: 390')))
        measurement = dict(viewportWidth=320, actual=dict(scrollWidth=442, clientWidth=12),
                           expected=dict(maximumScrollWidth=13), passed=False)
        trace = ('Traceback (most recent call last):\n'
                 '  File "/repo/tests/e2e/edit_tool.py", line 9999, in run\n'
                 "    assert tool_widths['scrollWidth'] <= tool_widths['clientWidth'] + 1, width\n"
                 'AssertionError: 320\n')
        def log(value):
            return '[edit-tool-layout] '+json.dumps(value)+'\n'+trace
        self.assertTrue(self.accepted('edit_tool.py', log(measurement)))
        self.assertFalse(self.accepted('edit_tool.py', trace))
        for changes in [dict(viewportWidth=390), dict(passed=True),
                        dict(expected=dict(maximumScrollWidth=14)),
                        dict(actual=dict(scrollWidth=442, clientWidth=442))]:
            with self.subTest(changes=changes):
                self.assertFalse(self.accepted('edit_tool.py', log({**measurement, **changes})))
        self.assertFalse(self.accepted('edit_tool.py', log(measurement).replace(
            "assert tool_widths['scrollWidth'] <= tool_widths['clientWidth'] + 1, width",
            "assert page.locator('#editToolStrip').is_visible(), width")))

    def test_smoke_other_workflow_or_download_count_is_rejected(self):
        log = (EVIDENCE / 'ci-38141289409/smoke.log').read_text()
        self.assertFalse(self.accepted('smoke.py', log.replace("wait_for_video_idle(page, 'trajectory')", "page.locator('#trajectorySaveVideoBtn').click()")))
        source = (ROOT / 'tests/e2e/smoke.py').read_text()
        self.assertFalse(self.accepted('smoke.py', log, source.replace('downloads?.length || 0) === 2', 'downloads?.length || 0) === 1')))

    def test_escape_and_delete_other_failures_are_rejected(self):
        axis = (EVIDENCE / 'ci-38141289409/axis_gizmo.log').read_text()
        self.assertFalse(self.accepted('axis_gizmo.py', axis.replace("press('Escape')", "press('Home')")))
        mode = (EVIDENCE / 'ci-38141289409/mode_consistency.log').read_text()
        self.assertFalse(self.accepted('mode_consistency.py', mode.replace('intercepts pointer events', 'is invisible')))
        self.assertFalse(self.accepted('mode_consistency.py', mode.replace('data-coords-action="delete"', 'data-coords-action="copy"')))

    def test_exception_and_passing_status_are_not_absorbed(self):
        log = (EVIDENCE / 'ci-38141289409/smoke.log').read_text()
        result = self.result('smoke.py', log)
        known = MANIFEST['knownDefects']['tests/e2e/smoke.py']
        self.assertFalse(GATE.matches_known_defect({**result, 'exceptionType': 'AssertionError'}, known))
        self.assertFalse(GATE.matches_known_defect({**result, 'exitCode': 0}, known))


if __name__ == '__main__':
    unittest.main()
