"""Exercise the artifact boundary: no missing suites, accepted failures, or repeats can be hidden."""
import copy
import hashlib
import json
import os
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
import browser_suite
from workflow_fixtures import marked_log
import join_browser_shards
import join_characterize
from ci_evidence import artifact_identity, digest


class BrowserJoinTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.inputs = pathlib.Path(self.temp.name) / 'inputs'
        self.output = pathlib.Path(self.temp.name) / 'joined'
        self.identity = artifact_identity()
        self.manifest = json.loads(browser_suite.MANIFEST.read_text())
        self.plan = json.loads(browser_suite.SHARDS.read_text())
        self.paths = {}
        for shard in self.plan['shards']:
            folder = self.inputs / ('browser-suite-' + shard['name']) / 'browser-suite'
            folder.mkdir(parents=True)
            report = {'artifactIdentity': self.identity, 'shard': shard['name'],
                      'shardPlanSha256': digest(browser_suite.SHARDS), 'executionComplete': True,
                      'wallTimeSeconds': 100.0, 'suites': []}
            for test in shard['suites']:
                failed = test in self.manifest['knownDefects']
                log = marked_log(pathlib.Path(test).name) if failed else 'Suite passed\n'
                raw = folder / pathlib.Path(test).stem / 'run.log'
                raw.parent.mkdir()
                raw.write_text(log)
                report['suites'].append({'test': test, 'exitCode': 1 if failed else 0,
                    'testSha256': digest(ROOT / test), 'wallTimeSeconds': 1.0, 'knownDefect': failed,
                    **browser_suite.failure_details(log, test, (ROOT / test).read_text())})
            browser_suite.finish_report(report, self.manifest, aggregate=False)
            path = folder / 'browser-results.json'
            path.write_text(json.dumps(report))
            self.paths[shard['name']] = path

    def join(self):
        return join_browser_shards.join_reports(self.inputs, self.output, expected_identity=self.identity)

    def change_report(self, shard, mutate):
        path = self.paths[shard]
        report = json.loads(path.read_text())
        mutate(report)
        path.write_text(json.dumps(report))

    def test_full_gate_is_joined_once_and_workers_never_claim_it(self):
        for path in self.paths.values():
            self.assertIsNone(json.loads(path.read_text())['matchesAcceptedBaseline'])
        report = self.join()
        self.assertTrue(report['matchesAcceptedBaseline'])
        self.assertEqual((report['passed'], report['failed'], report['total']), (36, 1, 37))
        self.assertEqual(report['issue11Workflow'], {'status':'passed'})
        self.assertTrue(all(e['rawFailureIndependentlyVerified'] for e in report['suites']))

    def test_additional_failure_is_reported_and_rejects_gate(self):
        def fail(report):
            entry = next(e for e in report['suites'] if e['test'].endswith('/accessibility.py'))
            entry['exitCode'] = 1
        self.change_report('balanced-2', fail)
        report = self.join()
        self.assertEqual((report['passed'], report['failed'], report['total']), (35, 2, 37))
        self.assertFalse(report['matchesAcceptedBaseline'])
        self.assertEqual(report['unexpectedFailures'], ['tests/e2e/accessibility.py'])

    def test_raw_log_cannot_be_overruled_by_recorded_classification(self):
        raw=self.paths['balanced-2'].parent/'mode_consistency/run.log'
        raw.write_text(raw.read_text().replace('"command": "delete"', '"command": "copy"'))
        with self.assertRaisesRegex(AssertionError,'Raw failure details differ'):
            self.join()

    def test_other_smoke_workflow_rejects_additional_failing_suite(self):
        raw = self.paths['smoke'].parent / 'smoke/run.log'
        raw.write_text('Traceback (most recent call last):\n  File "/repo/tests/e2e/smoke.py", line 123, in main\n    assert False\nAssertionError\n')
        def update(report):
            entry = report['suites'][0]
            entry.update(browser_suite.failure_details(raw.read_text(), entry['test'], (ROOT / entry['test']).read_text()))
            entry['knownDefect'] = False
            entry['exitCode'] = 1
        self.change_report('smoke', update)
        report = self.join()
        self.assertEqual(report['failed'], 2)
        self.assertFalse(report['matchesAcceptedBaseline'])
        self.assertEqual(report['issue11Workflow']['status'], 'unexpected smoke failure')

    def test_missing_carried_failure_rejects_overperformance(self):
        raw = self.paths['balanced-2'].parent / 'mode_consistency/run.log'
        raw.write_text('Suite passed\n')
        def passed(report):
            entry = next(e for e in report['suites'] if e['test'] == 'tests/e2e/mode_consistency.py')
            entry.update(exitCode=0, knownDefect=False,
                **browser_suite.failure_details(raw.read_text(), entry['test'], (ROOT / entry['test']).read_text()))
        self.change_report('balanced-2', passed)
        report = self.join()
        self.assertEqual((report['passed'], report['failed'], report['total']), (37, 0, 37))
        self.assertFalse(report['matchesAcceptedBaseline'])

    def test_missing_duplicate_unfinished_or_changed_source_shard_rejects(self):
        original = self.paths['smoke'].read_text()
        self.paths['smoke'].unlink()
        with self.assertRaisesRegex(AssertionError, 'Missing or duplicate'):
            self.join()
        self.paths['smoke'].write_text(original)
        for mutation, message in (
            (lambda r: r.update(shard='looks'), 'Wrong shard identities'),
            (lambda r: r.update(executionComplete=False), 'Shard did not finish'),
            (lambda r: r['artifactIdentity'].update(ciRunAttempt='different'), 'source/run identity'),
            (lambda r: r['suites'][0].update(testSha256='different'), 'Different test source'),
            (lambda r: r.update(suites=r['suites'] * 2), 'coverage/order'),
        ):
            with self.subTest(message=message):
                self.change_report('smoke', mutation)
                with self.assertRaisesRegex(AssertionError, message):
                    self.join()
                self.paths['smoke'].write_text(original)

    def test_plan_requires_all_37_once_and_dedicated_smoke_and_looks(self):
        for mutation in (
            lambda p: p['shards'][0]['suites'].clear(),
            lambda p: p['shards'][2]['suites'].append(p['shards'][0]['suites'][0]),
            lambda p: p['shards'][0]['suites'].append(p['shards'][2]['suites'].pop()),
        ):
            plan = copy.deepcopy(self.plan)
            mutation(plan)
            with self.assertRaises(AssertionError):
                browser_suite.shard_assignments(plan, self.manifest)

    def test_worker_retains_unexpected_exit_and_defers_acceptance_to_join(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'out/test-artifacts') as folder:
            def execute(command, **kwargs):
                kwargs['stdout'].write('AssertionError: a new failure\n')
                return Mock(returncode=1)
            with patch.object(sys, 'argv', ['browser_suite.py', '--shard', 'smoke']), \
                    patch.dict(os.environ, {'VIBEMOL_TEST_ARTIFACT_DIR': folder}), \
                    patch.object(browser_suite, 'artifact_identity', return_value=self.identity), \
                    patch.object(browser_suite.subprocess, 'run', side_effect=execute) as run:
                self.assertEqual(browser_suite.main(), 0)
            run.assert_called_once()
            report = json.loads((pathlib.Path(folder) / 'browser-results.json').read_text())
            self.assertEqual(report['suites'][0]['exitCode'], 1)
            self.assertFalse(report['suites'][0]['knownDefect'])
            self.assertIsNone(report['matchesAcceptedBaseline'])
            self.assertTrue(report['executionComplete'])
            self.assertGreaterEqual(report['suites'][0]['wallTimeSeconds'], 0)


class CharacterizationJoinTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.inputs = pathlib.Path(self.temp.name) / 'inputs'
        self.output = pathlib.Path(self.temp.name) / 'joined'
        self.identity = artifact_identity()
        # Small transport fixtures; the production comparator and identity validator remain real.
        self.captures = {f'fixture/{i}': {'float': 1.25, 'integer': 2, 'flag': True} for i in range(102)}
        self.expected = patch.object(join_characterize.capture, 'expected_captures', return_value=self.captures)
        self.expected.start()
        self.addCleanup(self.expected.stop)
        self.paths = {}
        for index in (1, 2):
            folder = self.inputs / f'characterize-{index}/characterize'
            folder.mkdir(parents=True)
            contexts = self.contexts()
            identities = [{'run': index, 'elementCacheIdentity': contexts}]
            report = {'artifactIdentity': self.identity, 'matrixRunIndex': index, 'runs': 1,
                'requestedRuns': 2, 'repeatComparisonPending': True, 'exactlyIdentical': None, 'deterministic': None,
                'comparison': join_characterize.capture.COMPARISON_POLICY, 'capturesPerRun': 102,
                'baseline': {'appSha256': self.identity['appSha256'], 'captureProvenance': {
                    'os': 'Linux', 'architecture': 'x86_64', 'browserName': 'chromium', 'browserVersion': 'test', 'ci': {}}},
                'browserVersion': 'test', 'wallTimeSeconds': 123.0,
                'elementCacheIdentityRuns': identities, 'elementCacheIdentity': contexts,
                'sessionCameraPin': [{'resizeBeforePin': v, 'structuredIdentical': True, 'pixelsIdentical': True} for v in (True, False)],
                'console': {str(i): {'errors': [], 'console': []} for i in range(16)}}
            self.write_captures(folder, index, self.captures, report)
            (folder / f'characterize-pixels-{index}.json').write_text(json.dumps({key: 'pixel' for key in list(self.captures)[:64]}))
            (folder / 'characterize-cache-identity.json').write_text(json.dumps({
                'artifactIdentity': self.identity, 'sourceAppSha256': self.identity['appSha256'],
                'requestedRuns': 2, 'elementCacheIdentityRuns': identities}))
            path = folder / 'characterize-evidence.json'
            path.write_text(json.dumps(report))
            self.paths[index] = path

    @staticmethod
    def contexts():
        result = []
        absent = {
            'editAtomsMenuEl': {'id': 'editAtomsMenu', 'issue': 15, 'cached': 'null'},
            'editAtomsMenuBodyEl': {'id': 'editAtomsMenuBody', 'issue': 15, 'cached': 'null'},
            'editAtomsMenuCurrentEl': {'id': 'editAtomsMenuCurrent', 'issue': 15, 'cached': 'null'},
            'editSelectionFragmentCuePopoverEl': {'id': 'editSelectionFragmentCuePopover', 'issue': 15, 'cached': 'null'}}
        for launch in ('workbench', 'legacy'):
            modes = ['Display', 'Measure', 'Edit'] + (['Calculations'] if launch == 'workbench' else [])
            panels = [str(i) for i in range(17 if launch == 'workbench' else 14)]
            known = copy.deepcopy(absent)
            if launch == 'workbench':
                known['elementColorBtn'] = {'id': 'elementColorBtn', 'issue': 14, 'cached': 'detached'}
            for theme in ('light', 'dark'):
                identity = {'supported': True, 'nodeCount': 52, 'composition': {'live': 52-len(known), 'knownAbsent': len(known)},
                    'knownAbsent': known, 'failures': [], 'checks': {'presented checkpoint': 39 if launch == 'workbench' else 32,
                    'mode switch': len(modes)+1, 'DOM replacement': 1, 'session restore': 1, 'panel transition: panel': 2}}
                result.append({'launch': launch, 'theme': theme, 'modes': modes, 'panelOpenClosePairs': panels,
                    'identity': identity, 'exercise': join_characterize.capture.assert_element_cache_exercise(identity, modes, panels)})
        return result

    @staticmethod
    def write_captures(folder, index, captures, report):
        raw = json.dumps(captures, indent=2).encode()
        (folder / f'characterize-run-{index}.json').write_bytes(raw + b'\n')
        report['captureSha256PerRun'] = [hashlib.sha256(raw).hexdigest()]

    def join(self):
        return join_characterize.join_reports(self.inputs, self.output, expected_identity=self.identity)

    def test_two_workers_prove_exact_repeat_and_all_eight_contexts(self):
        result = self.join()
        self.assertEqual(result['runs'], 2)
        self.assertIs(result['exactlyIdentical'], True)
        self.assertEqual(len(result['elementCacheIdentityRuns']), 2)
        self.assertEqual(result['sameSessionPixelChanges'], [])

    def test_matrix_worker_runs_one_capture_and_cannot_claim_a_repeat(self):
        capture = join_characterize.capture
        folder = pathlib.Path(self.temp.name) / 'worker'
        folder.mkdir()
        with patch.object(sys, 'argv', ['characterize.py', '--matrix-run-index', '2']), \
                patch.object(capture, 'ARTIFACTS', folder), \
                patch.object(capture, 'sync_playwright') as playwright, \
                patch.object(capture, 'run_http_server'), \
                patch.object(capture, 'verify_element_caches', return_value=self.contexts()) as identities, \
                patch.object(capture, 'verify_session_camera_pin', return_value=[]), \
                patch.object(capture, 'run_once', return_value=(self.captures, {}, {})) as run:
            browser = playwright.return_value.__enter__.return_value.chromium.launch.return_value
            browser.version = 'test'
            browser.browser_type.name = 'chromium'
            self.assertEqual(capture.main(), 0)
        run.assert_called_once()
        identities.assert_called_once()
        report = json.loads((folder / 'characterize-evidence.json').read_text())
        self.assertEqual(report['matrixRunIndex'], 2)
        self.assertEqual(report['runs'], 1)
        self.assertIsNone(report['exactlyIdentical'])
        self.assertIsNone(report['deterministic'])
        self.assertTrue(report['repeatComparisonPending'])
        self.assertTrue((folder / 'characterize-run-2.json').exists())
        self.assertFalse((folder / 'characterize-run-1.json').exists())
        with patch.object(sys, 'argv', ['characterize.py', '--runs', '1']):
            with self.assertRaisesRegex(AssertionError, 'at least two runs'):
                capture.main()

    def test_missing_duplicate_or_mixed_run_cannot_certify_two_runs(self):
        path = self.paths[2]
        original = path.read_text()
        path.unlink()
        with self.assertRaisesRegex(AssertionError, 'Both matrix runs required'):
            self.join()
        for mutate, message in (
            (lambda r: r.update(matrixRunIndex=1), 'Both matrix runs required'),
            (lambda r: r['artifactIdentity'].update(tree='different'), 'source/run identity'),
            (lambda r: r.update(exactlyIdentical=True), 'One worker cannot certify'),
        ):
            path.write_text(original)
            report = json.loads(original)
            mutate(report)
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(AssertionError, message):
                self.join()

    def test_repeat_difference_inside_golden_float_tolerance_still_fails(self):
        changed = copy.deepcopy(self.captures)
        changed['fixture/0']['float'] += 1e-12
        path = self.paths[2]
        report = json.loads(path.read_text())
        self.write_captures(path.parent, 2, changed, report)
        path.write_text(json.dumps(report))
        self.assertIsNone(join_characterize.capture.first_difference(self.captures, changed))
        with self.assertRaisesRegex(AssertionError, 'Matrix runs must be exactly identical'):
            self.join()

    def test_integer_type_change_cannot_use_float_tolerance(self):
        changed = copy.deepcopy(self.captures)
        changed['fixture/0']['integer'] = 2.0
        for index, path in self.paths.items():
            report = json.loads(path.read_text())
            self.write_captures(path.parent, index, changed, report)
            path.write_text(json.dumps(report))
        with self.assertRaisesRegex(AssertionError, 'int != float'):
            self.join()

    def test_missing_observer_and_unknown_absence_reject_identity_sweep(self):
        for mutate, message in (
            (lambda c: c['identity']['checks'].update({'mode switch': len(c['modes'])}), 'mode switch:'),
            (lambda c: c['identity']['knownAbsent']['editAtomsMenuEl'].update(issue=999), 'issue/ID/disposition'),
        ):
            contexts = self.contexts()
            mutate(contexts[0])
            with self.assertRaisesRegex(AssertionError, message):
                join_characterize.validate_identity_contexts(contexts)


if __name__ == '__main__':
    unittest.main()
