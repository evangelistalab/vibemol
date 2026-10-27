"""Capture identity must survive release-tag corrections without drifting."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import tempfile
import gzip
import json

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'e2e'))
import compare_ci_baselines as compare


class CapturePins(unittest.TestCase):
    def test_0100_uses_capture_sha_without_resolving_moved_tag(self):
        pinned = '3425e0231b71eeb8b8a11523806990f553265cba'
        def resolve(args, **kwargs):
            self.assertEqual(args, ['git', 'rev-parse', pinned + '^{commit}'])
            return pinned + '\n'
        with patch.object(compare.subprocess, 'check_output', side_effect=resolve):
            self.assertEqual(compare.resolve_baseline_commit(Path('.'), 'v0.10.0'), pinned)

    def test_historical_pin_cannot_be_overridden(self):
        with self.assertRaises(AssertionError):
            compare.resolve_baseline_commit(Path('.'), 'v0.10.0', '4' * 40)

    def test_original_pre_refactor_tag_must_still_match(self):
        with patch.object(compare.subprocess, 'check_output', side_effect=[compare.BASELINE_COMMITS['v0.9.5-pre-refactor'] + '\n', '4' * 40]), self.assertRaises(AssertionError):
            compare.resolve_baseline_commit(Path('.'), 'v0.9.5-pre-refactor')

    def test_candidate_requires_a_full_sha_and_cannot_resolve_a_tag(self):
        with patch.dict(compare.BASELINE_COMMITS, {'v0.10.1': None}):
            for value in [None, 'HEAD', 'v0.10.1', 'abcdef0']:
                with self.subTest(value=value), self.assertRaises(AssertionError):
                    compare.resolve_baseline_commit(Path('.'), 'v0.10.1', value)
            with patch.object(compare.subprocess, 'check_output', return_value='a' * 40 + '\n'):
                self.assertEqual(compare.resolve_baseline_commit(Path('.'), 'v0.10.1', 'a' * 40), 'a' * 40)


class FourCaptureVersions(unittest.TestCase):
    def prepare(self, root, wrong=False, differing=False):
        commit='a'*40
        captures={f'case-{i}':{'session':{'appVersion':'0.10.1','preset':{'appVersion':'0.10.1'}}}for i in range(102)}
        if wrong:captures['case-0']['session']['preset']['appVersion']='0.10.0'
        for worker in [1,2]:
            folder=root/f'characterization-baseline-{worker}';folder.mkdir()
            actual=json.loads(json.dumps(captures))
            if differing and worker==2:actual['case-0']['extra']='unexpected'
            golden={'baseline':{'commit':commit,'tag':'v0.10.1','captureProvenance':{'os':'Linux','ci':{'provider':'GitHub Actions'}}},'captures':actual}
            (folder/'characterize.json.gz').write_bytes(gzip.compress(json.dumps(golden).encode()))
            for run in [1,2]:(folder/f'characterize-run-{run}.json').write_text(json.dumps(actual))
            proof=dict(status='passed',commit=commit,tag='v0.10.1',recordingMode='candidate',allArchivedBlobsMatchCommit=True,
                correctedReleaseBase='44bcb5d534cecba27fd0ccfc60f74324a0920b73',mappingHelperAbsent=True,harnessInjection=False,fixturePreparation=False)
            (folder/'release-baseline-source.json').write_text(json.dumps(proof))
        return commit

    def test_four_exact_candidate_captures_are_accepted(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);commit=self.prepare(root)
            with patch.object(compare,'resolve_baseline_commit',return_value=commit):compare.main(root,'v0.10.1',commit)
            self.assertTrue(json.loads((root/'ci-comparison.json').read_text())['exactlyIdentical'])

    def test_one_wrong_version_leaf_is_rejected_even_when_all_four_repeat(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);commit=self.prepare(root,wrong=True)
            with patch.object(compare,'resolve_baseline_commit',return_value=commit),self.assertRaises(AssertionError):compare.main(root,'v0.10.1',commit)

    def test_two_runner_difference_is_not_promoted(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);commit=self.prepare(root,differing=True)
            with patch.object(compare,'resolve_baseline_commit',return_value=commit),self.assertRaises(AssertionError):compare.main(root,'v0.10.1',commit)
