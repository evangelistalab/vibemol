"""The additive API matrix must execute after the original browser retires."""
import contextlib
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tests/e2e'))
import premerge
import atomic_identity
import edit_api
import edit_testing_adapters
from checkpoint_contract import require_checkpoint_counts


class PremergeEntrypointTests(unittest.TestCase):
    def test_matrix_is_reached_once_after_original_browser_retirement(self):
        browser = MagicMock()
        playwright = MagicMock()
        playwright.chromium.launch.return_value = browser
        original_names = ('scene_creation', 'molecule_styles', 'orbital_reference_presets', 'imports',
                          'psi4_frequencies', 'cfour_frequencies', 'xyz_units', 'clipboard_roundtrip',
                          'clipboard_edit_selection',
                          'persistence', 'batch_export', 'orbital_group_appearance', 'molden_group_appearance',
                          'molden_browsing', 'molden_fractional_occupations', 'arithmetic', 'synchronized_trajectories')
        calls = []
        def commands(original_browser, url):
            self.assertIs(original_browser, browser)
            self.assertEqual(url, 'http://fixture')
            self.assertEqual(browser.new_context.call_count, 18)
            calls.append('commands')
        def embed_bridge(original_browser, url):
            self.assertIs(original_browser, browser)
            self.assertEqual(url, 'http://fixture')
            calls.append('embed bridge')
        def matrix(output):
            browser.close.assert_called_once_with()
            self.assertEqual(output, premerge.ARTIFACTS/'validated-edit-api')
            calls.append('matrix')
        def bridges(output):
            browser.close.assert_called_once_with()
            self.assertEqual(calls, ['commands', 'embed bridge', 'matrix'])
            self.assertEqual(output, premerge.ARTIFACTS/'edit-testing-adapters')
            calls.append('bridges')
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(premerge, 'run_http_server', return_value=contextlib.nullcontext('http://fixture')))
            stack.enter_context(patch.object(premerge, 'sync_playwright', return_value=contextlib.nullcontext(playwright)))
            for name in original_names:
                stub = lambda page, dialogs: None
                stub.__name__ = name
                stack.enter_context(patch.object(premerge, name, stub))
            stack.enter_context(patch.object(atomic_identity, 'run', lambda page, dialogs: None))
            stack.enter_context(patch.object(premerge, 'run_commands', commands))
            stack.enter_context(patch.object(premerge, 'run_embed_bridge', embed_bridge))
            stack.enter_context(patch.object(edit_api, 'run_matrix', matrix))
            stack.enter_context(patch.object(edit_testing_adapters, 'run_matrix', bridges))
            self.assertEqual(premerge.main(), 0)
        self.assertEqual(calls, ['commands', 'embed bridge', 'matrix', 'bridges'])
        self.assertEqual(browser.new_context.call_count, 18)

    def test_commands_completion_is_required_exactly_once(self):
        manifest = json.loads((ROOT/'tests/baselines/browser-suite.json').read_text())
        suite = 'tests/e2e/premerge.py'
        expected = manifest['checkpointCounts']
        marker = 'commands-completion'
        self.assertEqual(expected[suite][marker], 1)
        other_records = [f'[{name}] {{}}' for name, count in expected[suite].items()
                         if name != marker for _ in range(count)]
        receipt = dict(restoredSceneCount=1, restoredSourceCount=1, dialogCount=1)
        output = io.StringIO()
        with patch.object(premerge, 'commands', return_value=receipt), contextlib.redirect_stdout(output):
            premerge.run_commands(MagicMock(), 'http://fixture')
        records = [line for line in output.getvalue().splitlines() if line.startswith(f'[{marker}] ')]
        self.assertEqual(len(records), 1)
        self.assertEqual(json.loads(records[0].split(' ', 1)[1]), receipt)
        for count in (0, 1, 2):
            log = '\n'.join(other_records + records * count)
            with self.subTest(count=count), contextlib.redirect_stdout(io.StringIO()):
                if count == 1:
                    self.assertTrue(require_checkpoint_counts(log, suite, expected)['passed'])
                else:
                    with self.assertRaises(AssertionError):
                        require_checkpoint_counts(log, suite, expected)

        output = io.StringIO()
        with patch.object(premerge, 'commands', return_value=None), patch.object(premerge, 'write_failure_artifacts'):
            with contextlib.redirect_stdout(output), self.assertRaises(AssertionError):
                premerge.run_commands(MagicMock(), 'http://fixture')
        self.assertNotIn(f'[{marker}]', output.getvalue())


if __name__ == '__main__':
    unittest.main()
