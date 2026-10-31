"""The Figure probe must fail closed instead of rendering with another browser."""
import contextlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'e2e'))
from pinned_figure_browser import resolve_pinned_headless_browser


class PinnedFigureBrowserTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.metadata = self.root/'installed-package/browsers.json'
        self.metadata.parent.mkdir()
        self.manifest = dict(browsers=[dict(name=name, revision='1248', browserVersion='156.0.8078.4')
                                      for name in ('chromium', 'chromium-headless-shell')])
        self.write_manifest()
        self.full = self.root/'custom-cache/chromium-1248/chrome-linux64/chrome'
        self.shell = self.root/'custom-cache/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'
        self.shell.parent.mkdir(parents=True)
        self.shell.write_text('pinned executable fixture')
        self.shell.chmod(0o755)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch('pinned_figure_browser.sys.platform', 'linux'))
        self.stack.enter_context(patch('pinned_figure_browser.platform.machine', return_value='x86_64'))
        self.probe = self.stack.enter_context(patch('pinned_figure_browser.subprocess.run',
            return_value=subprocess.CompletedProcess([], 0, 'Chrome Headless Shell 156.0.8078.4\n', '')))

    def write_manifest(self):
        self.metadata.write_text(json.dumps(self.manifest))

    def resolve(self):
        with contextlib.redirect_stdout(io.StringIO()):
            return resolve_pinned_headless_browser(str(self.full), '156.0.8078.4', self.metadata)

    def fails(self, *messages):
        with self.assertRaises(RuntimeError) as caught:
            self.resolve()
        for text in (*messages, str(self.metadata), 'no browser fallback'):
            self.assertIn(text, str(caught.exception))

    def test_custom_cache_shell_only_install_resolves_and_probes_exact_binary(self):
        self.assertFalse(self.full.exists())
        self.assertEqual(self.resolve(), str(self.shell))
        self.probe.assert_called_once_with([str(self.shell), '--version'], check=True,
                                          capture_output=True, text=True, timeout=10)

    def test_missing_and_unreadable_manifest_name_metadata(self):
        self.metadata.unlink()
        self.fails('metadata unavailable/invalid')
        self.metadata.mkdir()
        self.fails('metadata unavailable/invalid')
        self.probe.assert_not_called()

    def test_malformed_missing_and_ambiguous_entries_fail_before_launch(self):
        for text in ('{bad', '{}', '{"browsers":null}', '{"browsers":[null]}',
                     json.dumps(dict(browsers=self.manifest['browsers']*2))):
            with self.subTest(text=text):
                self.metadata.write_text(text)
                self.fails('metadata unavailable/invalid')
        self.probe.assert_not_called()

    def test_manifest_revision_overrides_and_version_mismatch_fail(self):
        for changes in (dict(revision='bad'), dict(revisionOverrides={'linux':'1'}),
                        dict(browserVersion='156.0.8078.5')):
            with self.subTest(changes=changes):
                original = self.manifest['browsers'][1].copy()
                self.manifest['browsers'][1].update(changes)
                self.write_manifest()
                self.fails('metadata unavailable/invalid')
                self.manifest['browsers'][1] = original
        self.probe.assert_not_called()

    def test_mismatched_public_cache_revision_is_not_guessed(self):
        self.full = self.root/'chromium-1247/chrome-linux64/chrome'
        self.fails('expected chromium-1248', str(self.full))
        self.probe.assert_not_called()

    def test_missing_or_nonexecutable_shell_never_selects_other_cached_revision(self):
        other = Path(str(self.shell).replace('1248', '1247'))
        other.parent.mkdir(parents=True)
        other.write_text('other version')
        other.chmod(0o755)
        self.shell.chmod(0o644)
        self.fails(str(self.shell), 'missing/not executable')
        self.shell.unlink()
        self.fails(str(self.shell), 'missing/not executable')
        self.probe.assert_not_called()

    def test_wrong_binary_version_and_failed_probe_are_loud(self):
        for value in ('Chromium 156.0.8078.5', 'no version'):
            self.probe.return_value.stdout = value
            self.fails(str(self.shell), 'version mismatch')
        self.probe.side_effect = subprocess.TimeoutExpired('fixture', 10)
        self.fails(str(self.shell), 'version probe failed')

    def test_unsupported_platform_has_no_system_browser_fallback(self):
        with patch('pinned_figure_browser.sys.platform', 'win32'):
            self.fails('distribution unsupported')
        self.probe.assert_not_called()

    def test_mac_arm64_install_path_uses_manifest_revision(self):
        self.full = self.root/'custom-cache/chromium-1248/chrome-mac-arm64/Google Chrome for Testing'
        shell = self.root/'custom-cache/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell'
        shell.parent.mkdir(parents=True)
        shell.write_text('fixture')
        shell.chmod(0o755)
        with patch('pinned_figure_browser.sys.platform', 'darwin'), patch('pinned_figure_browser.platform.machine', return_value='arm64'):
            self.assertEqual(self.resolve(), str(shell))


if __name__ == '__main__':
    unittest.main()
