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


class PremergeEntrypointTests(unittest.TestCase):
    def test_matrix_is_reached_once_after_original_browser_retirement(self):
        browser = MagicMock()
        playwright = MagicMock()
        playwright.chromium.launch.return_value = browser
        original_names = ('scene_creation', 'molecule_styles', 'orbital_reference_presets', 'imports',
                          'psi4_frequencies', 'xyz_units', 'clipboard_roundtrip', 'clipboard_edit_selection',
                          'persistence', 'batch_export', 'orbital_group_appearance', 'molden_group_appearance',
                          'molden_browsing', 'arithmetic', 'synchronized_trajectories')
        calls = []
        def matrix(output):
            browser.close.assert_called_once_with()
            self.assertEqual(output, premerge.ARTIFACTS/'validated-edit-api')
            calls.append('matrix')
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(premerge, 'run_http_server', return_value=contextlib.nullcontext('http://fixture')))
            stack.enter_context(patch.object(premerge, 'sync_playwright', return_value=contextlib.nullcontext(playwright)))
            for name in original_names:
                stub = lambda page, dialogs: None
                stub.__name__ = name
                stack.enter_context(patch.object(premerge, name, stub))
            stack.enter_context(patch.object(atomic_identity, 'run', lambda page, dialogs: None))
            stack.enter_context(patch.object(edit_api, 'run_matrix', matrix))
            self.assertEqual(premerge.main(), 0)
        self.assertEqual(calls, ['matrix'])
        self.assertEqual(browser.new_context.call_count, 16)


if __name__ == '__main__':
    unittest.main()
