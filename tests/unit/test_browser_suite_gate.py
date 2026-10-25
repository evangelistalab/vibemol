import copy
import importlib.util
import json
import pathlib
import re
import sys
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/e2e'))
from workflow_fixtures import marked_log
import browser_suite as GATE
MANIFEST=json.loads(GATE.MANIFEST.read_text())
EVIDENCE=ROOT/'tests/baselines/evidence/browser-ci-gate'


class WorkflowGateTests(unittest.TestCase):
    def result(self,suite,log,source=''):
        return dict(exitCode=1,test='tests/e2e/'+suite,**GATE.failure_details(log,suite,source))
    def recognized(self,suite,log,source=''):
        # Exercise semantic identity independently of current acceptance. A closed
        # workflow must not turn all its negative tests into vacuous rejections.
        known={'workflow':{'axis_gizmo.py':'escape-canvas-focus','mode_consistency.py':'coordinates-delete-selection-card'}[suite],
               'exceptionType':'AssertionError' if suite=='axis_gizmo.py' else 'TimeoutError'}
        return GATE.matches_known_defect(self.result(suite,log,source),known)
    def accepted(self,suite,log,source=''):
        known=MANIFEST['knownDefects'].get('tests/e2e/'+suite)
        return bool(known) and GATE.matches_known_defect(self.result(suite,log,source),known)
    def edit(self,log,change):
        lines=log.splitlines();row=json.loads(lines[0].split(' ',1)[1]);change(row)
        lines[0]='[workflow-step] '+json.dumps(row);return '\n'.join(lines)+'\n'
    def test_both_named_workflows(self):
        for suite in ['axis_gizmo.py','mode_consistency.py']:
            self.assertTrue(self.recognized(suite,marked_log(suite)))
    def test_statement_and_source_format_are_not_identity(self):
        for suite in ['axis_gizmo.py','mode_consistency.py']:
            for statement in ["page.keyboard.press('Escape'); assert focused",'assert (\n        focused\n    )',
                              'target.click(\n        **options\n    )','# traceback source unavailable']:
                with self.subTest(suite=suite,statement=statement):
                    log=marked_log(suite,statement=statement)
                    self.assertTrue(self.recognized(suite,log,'unrelated formatting and renamed local variables'))
                    self.assertTrue(self.recognized(suite,re.sub(r'line \d+','line 123456',log),'\n'*1000))
            unrendered='\n'.join(line for line in marked_log(suite).splitlines()
                                 if not line.startswith(('  File ','    assert ')))+'\n'
            self.assertTrue(self.recognized(suite,unrendered))
            self.assertIsNotNone(GATE.failure_details(marked_log(suite),suite)['failureWorkflow'])
    def test_unrelated_focus_assertion_is_not_axis_escape(self):
        log=marked_log('axis_gizmo.py')
        for change in [lambda r:r.update(step='axis.home.focus'),
                       lambda r:r['facts']['trigger'].update(key='Home'),
                       lambda r:r['facts']['trigger'].update(completed=False),
                       lambda r:r['facts']['before'].update(focus='coordsPanelClose'),
                       lambda r:r['facts'].update(expected='other'),
                       lambda r:r['facts'].update(actual='canvas',after=dict(focus='canvas'))]:
            self.assertFalse(self.recognized('axis_gizmo.py',self.edit(log,change)))
    def test_delete_requires_this_native_target_and_actual_interceptor(self):
        log=marked_log('mode_consistency.py')
        for change in [lambda r:r.update(step='coordinates.row1.copy'),
                       lambda r:r['facts']['action'].update(command='copy'),
                       lambda r:r['facts']['action'].update(rowAtomIndex=2),
                       lambda r:r['facts']['action'].update(kind='programmatic-click'),
                       lambda r:r['facts']['hit'].update(targetVisible=False),
                       lambda r:r['facts']['hit'].update(targetEnabled=False),
                       lambda r:r['facts']['hit'].update(targetOwnsHit=True),
                       lambda r:r['facts']['hit'].update(cardOwnsHit=False),
                       lambda r:r['facts']['hit'].update(interceptorId='otherPanel')]:
            self.assertFalse(self.recognized('mode_consistency.py',self.edit(log,change)))
    def test_error_html_format_does_not_identify_interceptor(self):
        log=marked_log('mode_consistency.py')
        for text in ['rendered HTML omitted',"<div id='editSelectionPosition' class='x'>",'<div class="x" id="editSelectionPosition">']:
            self.assertTrue(self.recognized('mode_consistency.py',log.replace('original error unchanged',text)))
    def test_terminal_exception_must_bind_exact_step(self):
        log=marked_log('axis_gizmo.py')
        self.assertFalse(self.recognized('axis_gizmo.py',log.rsplit('[workflow-exception]',1)[0]))
        self.assertFalse(self.recognized('axis_gizmo.py',log.replace('"token": "'+'a'*32+'"','"token": "'+'b'*32+'"',1)))
        self.assertFalse(self.recognized('axis_gizmo.py',log+'AssertionError: unrelated later error\n'))
        self.assertFalse(self.recognized('axis_gizmo.py',self.edit(log,lambda r:r.update(exceptionType='TimeoutError'))))
        self.assertFalse(self.recognized('axis_gizmo.py',self.edit(log,lambda r:r.update(outcome='passed'))))
    def test_other_suite_cannot_borrow_step(self):
        self.assertIsNone(self.result('smoke.py',marked_log('axis_gizmo.py'))['failureWorkflow'])
        self.assertFalse(self.recognized('axis_gizmo.py',self.edit(marked_log('axis_gizmo.py'),lambda r:r.update(suite='smoke.py'))))
    def test_trailing_information_is_not_exception_identity(self):
        log=marked_log('axis_gizmo.py')
        self.assertTrue(self.recognized('axis_gizmo.py',log+'cleanup complete\n\nordinary diagnostic output\n'))
        unbound='[workflow-exception] '+json.dumps(dict(token=None,suite=None,exceptionType='AssertionError'))+'\n'
        self.assertFalse(self.recognized('axis_gizmo.py',log+'AssertionError: unrelated\n'+unbound))
        self.assertFalse(self.recognized('axis_gizmo.py',log+'AssertionError: unrelated\n'))
    def test_missing_ambiguous_or_bad_evidence_fails_closed(self):
        log=marked_log('axis_gizmo.py')
        for change in [lambda r:r.update(factsError='unavailable'),lambda r:r.update(facts=None),
                       lambda r:r.update(schema=2),lambda r:r['facts'].update(before=None),
                       lambda r:r['facts']['before'].update(focus=[])]:
            self.assertFalse(self.recognized('axis_gizmo.py',self.edit(log,change)))
        self.assertFalse(self.recognized('axis_gizmo.py',log.splitlines()[0]+'\n'+log))
        for value in ['null','[]','"bad"','{}']:
            self.assertFalse(self.recognized('axis_gizmo.py',log.rsplit('[workflow-exception]',1)[0]+'[workflow-exception] '+value))
    def test_unmarked_historical_logs_are_not_reinterpreted(self):
        for suite in ['axis_gizmo.py','mode_consistency.py','smoke.py']:
            log=(EVIDENCE/'ci-38141289409'/suite.replace('.py','.log')).read_text()
            self.assertIsNone(self.result(suite,log)['failureWorkflow'])
        old=(EVIDENCE/'ci-39086927339/edit_tool.log').read_text()
        self.assertIsNone(self.result('edit_tool.py',old)['failureWorkflow'])
    def test_current_manifest_is_intentionally_empty(self):
        self.assertEqual(MANIFEST['expected'],dict(passed=37,failed=0,total=37))
        self.assertEqual(MANIFEST['knownDefects'],{})
        self.assertIs(MANIFEST['acceptedSetIntentionallyEmpty'],True)
        self.assertFalse(self.accepted('axis_gizmo.py',marked_log('axis_gizmo.py')))
        self.assertFalse(self.accepted('mode_consistency.py',marked_log('mode_consistency.py')))

    def test_all_active_gate_records_agree_with_authorized_empty_composition(self):
        expected=dict(passed=37,failed=0,total=37)
        risk=json.loads((ROOT/'tests/baselines/refactor-stage-risk.json').read_text())
        ledger=json.loads((ROOT/'tests/baselines/carried-defects.json').read_text())
        policy=json.loads((ROOT/'tests/baselines/stage5/run-policy.json').read_text())
        for label,actual in [
            ('manifest',MANIFEST['expected']),('risk ordinary',risk['ordinaryExpected']),
            ('risk acceptance',risk['gateAcceptancePolicy']['expected']),
            ('risk conversion',risk['conversionBlockingRule']['currentBrowserGate']),
            ('risk baseline',{k:risk['currentBrowserBaseline'][k]for k in expected}),
            ('risk baseline gate',{k:risk['currentBrowserBaseline']['gate'][k]for k in expected}),
            ('ledger',ledger['acceptedCiGate']),('run policy',policy['ordinaryExpected'])]:
            with self.subTest(record=label):self.assertEqual(actual,expected)
        self.assertEqual(risk['gateAcceptancePolicy']['acceptedWorkflows'],[])
        self.assertIs(risk['gateAcceptancePolicy']['acceptedSetIntentionallyEmpty'],True)
        self.assertIs(ledger['acceptedSetIntentionallyEmpty'],True)
        self.assertEqual(policy['acceptancePhase'],'issue53')
        instructions=(ROOT/'AGENTS.md').read_text()
        self.assertIn('The current post-release gate is37/0/37 with an intentionally empty accepted set',instructions)
        self.assertIn('The shipped join requires **CI37/0/37**',instructions)

    def test_closed_workflows_have_no_live_recognition(self):
        for suite in ['smoke.py','edit_tool.py']:
            self.assertNotIn('tests/e2e/'+suite,MANIFEST['knownDefects'])
            self.assertIsNone(self.result(suite,marked_log(suite,workflow='issue-11-stop-after-second-download'))['failureWorkflow'])
    def test_exception_and_passing_status_still_reject(self):
        result=self.result('axis_gizmo.py',marked_log('axis_gizmo.py'))
        known={'workflow':'escape-canvas-focus','exceptionType':'AssertionError'}
        self.assertFalse(GATE.matches_known_defect({**result,'exceptionType':'TimeoutError'},known))
        self.assertFalse(GATE.matches_known_defect({**result,'exitCode':0},known))


if __name__=='__main__':unittest.main()
