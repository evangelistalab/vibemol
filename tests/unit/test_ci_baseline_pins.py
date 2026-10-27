"""Capture identity must survive release-tag corrections without drifting."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

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
