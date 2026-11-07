"""Fail-closed controls for the exact180-method/108-DOM-ID recording."""
import contextlib
import copy
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tests/e2e'))
import cas_default_recording as contract


class CasDefaultRecording(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.previous = contract.read_previous(ROOT)

    def setUp(self):
        self.current, self.changes = contract.expected_captures(self.previous)
        self.method = self.changes['methodChanges'][0]
        self.dom = self.changes['domIdChanges'][0]

    def verify(self, value=None):
        with contextlib.redirect_stdout(io.StringIO()):
            return contract.verify(self.previous, self.current if value is None else value)

    def test_exact180_full_paths108_ids_and_immutable_input(self):
        r = self.verify()
        self.assertEqual(r['actualMethodLeaves'], 180)
        self.assertEqual(r['actualDomIdAdditions'], 108)
        self.assertIsNone(r['residualDifference'])
        self.assertEqual(contract._at(self.previous, [self.method['capture']] + self.method['path']), 'cumulative')
        for change in self.changes['methodChanges']:
            path = change['path']
            self.assertEqual(path[:2], ['session', 'sources'])
            self.assertIs(type(path[2]), int)
            self.assertEqual(path[3:], ['recordState', 'calculations', 'options', 'method'])

    def test_retained_sample_program_choices_remain_cumulative(self):
        for name in contract.RETAIN:
            self.assertEqual(self.current[name]['session'], self.previous[name]['session'])
            self.assertEqual(self.current[name]['forte2'], self.previous[name]['forte2'])

    def test179_or181_method_changes_fail(self):
        owner = self.current[self.method['capture']]
        for key in self.method['path'][:-1]:
            owner = owner[key]
        owner['method'] = 'cumulative'
        with self.assertRaises(AssertionError):
            self.verify()
        owner['method'] = 'cas'
        name = contract.RETAIN[0]
        self.current[name]['session']['sources'][0]['recordState']['calculations']['options']['method'] = 'cas'
        with self.assertRaises(AssertionError):
            self.verify()

    def test107_or109_dom_additions_fail(self):
        ids = self.current[self.dom['capture']]['dom']['ids']
        ids.remove(contract.IDS[0])
        with self.assertRaises(AssertionError):
            self.verify()
        ids.append(contract.IDS[0]); ids.append('unexpected-control'); ids.sort()
        with self.assertRaises(AssertionError):
            self.verify()

    def test_wrong_id_or_renamed_capture_fails(self):
        ids = self.current[self.dom['capture']]['dom']['ids']
        ids[ids.index(contract.IDS[0])] = 'avas-wrong-id'; ids.sort()
        with self.assertRaises(AssertionError):
            self.verify()
        self.current, _ = contract.expected_captures(self.previous)
        self.current['renamed'] = self.current.pop(self.method['capture'])
        with self.assertRaises(AssertionError):
            self.verify()

    def test_same_leaf_name_elsewhere_is_not_permitted(self):
        self.current[self.method['capture']]['method'] = 'cas'
        with self.assertRaises(AssertionError):
            self.verify()

    def test_version_api_type_and_last_ulp_are_not_exempt(self):
        name = self.method['capture']
        for mutation in ('version', 'api', 'type', 'float'):
            value = copy.deepcopy(self.current)
            if mutation == 'version':
                value[name]['session']['appVersion'] = '0.10.3'
            if mutation == 'api':
                api = value[name]['api']; key = next(iter(api)); del api[key]
            if mutation == 'type':
                value[name]['dom']['toolbarHeight'] = 56.0
            if mutation == 'float':
                def change(v):
                    if isinstance(v, dict):
                        for key, x in v.items():
                            if type(x) is float and math.isfinite(x):
                                v[key] = math.nextafter(x, math.inf); return True
                            if change(x): return True
                    elif isinstance(v, list):
                        for i, x in enumerate(v):
                            if type(x) is float and math.isfinite(x):
                                v[i] = math.nextafter(x, math.inf); return True
                            if change(x): return True
                    return False
                self.assertTrue(change(value[name]))
            with self.subTest(mutation=mutation), self.assertRaises(AssertionError):
                self.verify(value)

    def test_missing_or_malformed_path_fails_with_comparands(self):
        owner = self.current[self.method['capture']]
        for key in self.method['path'][:-1]:
            owner = owner[key]
        del owner['method']
        with self.assertRaises(AssertionError):
            self.verify()
        with self.assertRaises(AssertionError):
            self.verify([])

    def test101_or103_captures_fail(self):
        value = copy.deepcopy(self.current); value.pop(next(iter(value)))
        with self.assertRaises(AssertionError): self.verify(value)
        value = copy.deepcopy(self.current); value['extra'] = copy.deepcopy(next(iter(value.values())))
        with self.assertRaises(AssertionError): self.verify(value)

    def test_recording_ref_and_other_mode_cannot_bypass_source_guard(self):
        args = SimpleNamespace(record_source_commit='c'*40, record_cas_default=True,
            record_api_delta=None, record_release_tag=None, update_baseline=True,
            inject_harness=False, prepare_fixtures=False, runs=2, matrix_run_index=None)
        env = dict(GITHUB_ACTIONS='true', GITHUB_EVENT_NAME='workflow_dispatch',
            GITHUB_SHA='c'*40, GITHUB_REF='refs/heads/not-the-recording-branch')
        def git(command, **kwargs):
            if command == ['git', 'rev-parse', 'HEAD']: return 'c'*40+'\n'
            if command == ['git', 'rev-parse', '--is-shallow-repository']: return 'false\n'
            raise AssertionError(command)
        with patch.dict(contract.os.environ, env), patch.object(contract.subprocess, 'check_output', side_effect=git), \
                patch.object(contract.subprocess, 'run') as mutation, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(AssertionError, 'Dedicated authorized'):
                contract.require_source(ROOT, ROOT, args, Path('unused'))
            mutation.assert_not_called()
            args.record_release_tag = 'v0.10.2'
            with self.assertRaises(AssertionError):
                contract.require_source(ROOT, ROOT, args, Path('unused'))

    def fixture(self, folder):
        commit = 'c'*40
        for job in (1, 2):
            artifact = folder/f'characterization-baseline-{job}'; artifact.mkdir()
            proof = dict(status='passed', recordingMode=contract.MODE, commit=commit, baseCommit=contract.BASE,
                baselineGzipSha256=contract.BASE_DIGEST, allArchivedBlobsMatchCommit=True, harnessInjection=False,
                fixturePreparation=False, expectedMethodLeaves=180, expectedDomIdAdditions=108,
                sourceRefAtCapture=contract.REF, recordingWorker=str(job), ciRunAttempt='1', changes=self.changes)
            (artifact/'cas-default-source.json').write_text(json.dumps(proof))
            golden = dict(baseline=dict(commit=commit, tag=contract.MODE, captureProvenance=dict(os='Linux', ci=dict(provider='GitHub Actions'))), captures=self.current)
            raw = json.dumps(golden).encode(); (artifact/'characterize.json.gz').write_bytes(gzip.compress(raw))
            (artifact/'characterize-summary.json').write_text(json.dumps(dict(api=next(iter(self.current.values()))['api'], goldenSha256=hashlib.sha256(raw).hexdigest())))
            for run in (1, 2): (artifact/f'characterize-run-{run}.json').write_text(json.dumps(self.current))
        return commit

    def test_four_way_join_verifies_every_raw_and_promoted_capture(self):
        with tempfile.TemporaryDirectory() as name:
            folder = Path(name); commit = self.fixture(folder)
            with patch.object(contract, 'read_previous', return_value=self.previous), contextlib.redirect_stdout(io.StringIO()):
                report = contract.compare(folder, ROOT, commit)
            self.assertEqual(report['methodLeavesPerRun'], 180)
            self.assertEqual(report['domIdAdditionsPerRun'], 108)
            self.assertEqual(len(report['records']), 4)
            self.assertTrue(report['fourSerializationsExactlyIdentical'])

    def test_one_wrong_worker_cannot_hide(self):
        with tempfile.TemporaryDirectory() as name:
            folder = Path(name); commit = self.fixture(folder)
            path = folder/'characterization-baseline-2/characterize-run-2.json'
            changed = copy.deepcopy(self.current); changed[self.method['capture']]['session']['appVersion'] = 'wrong'
            path.write_text(json.dumps(changed))
            with patch.object(contract, 'read_previous', return_value=self.previous), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(AssertionError):
                contract.compare(folder, ROOT, commit)

    def test_serialization_or_worker_identity_mismatch_fails(self):
        with tempfile.TemporaryDirectory() as name:
            folder = Path(name); commit = self.fixture(folder)
            path = folder/'characterization-baseline-2/characterize-run-2.json'
            original = path.read_text(); path.write_text(original+'\n')
            with patch.object(contract, 'read_previous', return_value=self.previous), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(AssertionError):
                contract.compare(folder, ROOT, commit)
            path.write_text(original)
            proof = folder/'characterization-baseline-2/cas-default-source.json'
            value = json.loads(proof.read_text()); value['recordingWorker'] = '1'; proof.write_text(json.dumps(value))
            with patch.object(contract, 'read_previous', return_value=self.previous), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(AssertionError):
                contract.compare(folder, ROOT, commit)


if __name__ == '__main__': unittest.main()
