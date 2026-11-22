"""The additive API matrix must execute after the original browser retires."""
import contextlib
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


class PremergeEntrypointTests(unittest.TestCase):
    def test_matrix_is_reached_once_after_original_browser_retirement(self):
        browser = MagicMock()
        playwright = MagicMock()
        playwright.chromium.launch.return_value = browser
        original_names = ('scene_creation', 'molecule_styles', 'orbital_reference_presets', 'imports',
                          'psi4_frequencies', 'cfour_frequencies', 'xyz_units', 'clipboard_roundtrip',
                          'clipboard_edit_selection',
                          'persistence', 'batch_export', 'orbital_group_appearance', 'molden_group_appearance',
                          'molden_browsing', 'arithmetic', 'synchronized_trajectories')
        calls = []
        def commands(original_browser, url):
            self.assertIs(original_browser, browser)
            self.assertEqual(url, 'http://fixture')
            self.assertEqual(browser.new_context.call_count, 17)
            calls.append('commands')
        def matrix(output):
            browser.close.assert_called_once_with()
            self.assertEqual(output, premerge.ARTIFACTS/'validated-edit-api')
            calls.append('matrix')
        def bridges(output):
            browser.close.assert_called_once_with()
            self.assertEqual(calls, ['commands', 'matrix'])
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
            stack.enter_context(patch.object(edit_api, 'run_matrix', matrix))
            stack.enter_context(patch.object(edit_testing_adapters, 'run_matrix', bridges))
            self.assertEqual(premerge.main(), 0)
        self.assertEqual(calls, ['commands', 'matrix', 'bridges'])
        self.assertEqual(browser.new_context.call_count, 17)


if __name__ == '__main__':
    unittest.main()
