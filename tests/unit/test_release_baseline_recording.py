"""The explicit release recorder rejects unpublished, different and modified sources."""
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
import release_baseline_recording as recording


class PublishedReleaseRecording(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name).resolve()
        self.root, self.source = self.folder / 'repo', self.folder / 'archive'
        self.root.mkdir(); self.source.mkdir()
        self.git('init', '-q')
        version = self.root / 'assets/app/js/asset-urls.js'
        version.parent.mkdir(parents=True)
        version.write_text("const APP_VERSION = '0.10.0';\n")
        (self.root / 'binary.dat').write_bytes(b'\0archive bytes\xff')
        self.git('add', '.')
        self.git('-c', 'user.name=Recording Test', '-c', 'user.email=recording-test@example.invalid',
                 'commit', '-qm', 'Synthetic published release')
        self.git('tag', 'v0.10.0')
        self.commit = self.git('rev-parse', 'HEAD')
        with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git', 'archive', 'v0.10.0'], cwd=self.root))) as archive:
            archive.extractall(self.source)
        self.publication = self.folder / 'published.json'
        self.publication.write_text(json.dumps({'tagName': 'v0.10.0', 'isDraft': False, 'isPrerelease': False,
            'publishedAt': '2026-10-18T00:00:00Z',
            'url': 'https://github.com/evangelistalab/vibemol/releases/tag/v0.10.0'}))
        self.env = {'GITHUB_ACTIONS': 'true', 'GITHUB_REF': 'refs/tags/v0.10.0', 'GITHUB_SHA': self.commit,
            'VIBEMOL_PUBLISHED_RELEASE_JSON': str(self.publication), 'GITHUB_RUN_ID': 'example',
            'GITHUB_RUN_ATTEMPT': '1', 'RUNNER_NAME': 'synthetic-test'}
        self.args = SimpleNamespace(record_release_tag='v0.10.0', update_baseline=True,
            inject_harness=False, prepare_fixtures=False, runs=2, matrix_run_index=None)

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.DEVNULL).decode().strip()

    def invoke(self):
        with patch.dict(os.environ, self.env, clear=True):
            return recording.require_published_release_source(self.root, self.source, self.args, self.folder / 'proof.json')

    def test_exact_published_archive_is_accepted_and_provenance_is_saved(self):
        self.assertEqual(self.invoke(), {'tag': 'v0.10.0', 'commit': self.commit})
        report = json.loads((self.folder / 'proof.json').read_text())
        self.assertEqual(report['archivedFiles'], 2)
        self.assertTrue(report['allArchivedBlobsMatchTag'])
        self.assertFalse(report['harnessInjection'])

    def test_mutating_any_archived_blob_is_rejected(self):
        (self.source / 'binary.dat').write_bytes(b'changed')
        with self.assertRaises(AssertionError) as error:
            self.invoke()
        self.assertIn('binary.dat', str(error.exception))

    def test_missing_archived_file_is_rejected(self):
        (self.source / 'binary.dat').unlink()
        with self.assertRaises(AssertionError) as error:
            self.invoke()
        self.assertIn('actualMissingPaths', str(error.exception))

    def test_extra_archived_file_is_rejected(self):
        (self.source / 'injected.js').write_text('unexpected source')
        with self.assertRaises(AssertionError) as error:
            self.invoke()
        self.assertIn('injected.js', str(error.exception))

    def test_recording_options_cannot_inject_prepare_or_change_the_required_two_runs(self):
        for name, value in [('inject_harness', True), ('prepare_fixtures', True), ('runs', 3),
                            ('matrix_run_index', 1), ('update_baseline', False), ('record_release_tag', 'v0.11.0')]:
            original = getattr(self.args, name)
            with self.subTest(name=name):
                setattr(self.args, name, value)
                with self.assertRaises(AssertionError):
                    self.invoke()
                setattr(self.args, name, original)

    def test_ci_tag_ref_and_exact_checkout_are_required(self):
        for name, value in [('GITHUB_ACTIONS', 'false'), ('GITHUB_REF', 'refs/heads/main'), ('GITHUB_SHA', 'a' * 40)]:
            original = self.env[name]
            with self.subTest(name=name):
                self.env[name] = value
                with self.assertRaises(AssertionError):
                    self.invoke()
                self.env[name] = original
        (self.root / 'later.txt').write_text('later commit')
        self.git('add', '.')
        self.git('-c', 'user.name=Recording Test', '-c', 'user.email=recording-test@example.invalid',
                 'commit', '-qm', 'Later work must not become a baseline')
        with self.assertRaises(AssertionError):
            self.invoke()

    def test_draft_prerelease_unpublished_or_different_release_is_rejected(self):
        original = json.loads(self.publication.read_text())
        for name, value in [('isDraft', True), ('isPrerelease', True), ('publishedAt', None),
                            ('tagName', 'v0.11.0'), ('url', 'https://example.invalid/other')]:
            with self.subTest(name=name):
                self.publication.write_text(json.dumps({**original, name: value}))
                with self.assertRaises(AssertionError):
                    self.invoke()
        self.publication.write_text(json.dumps(original))

    def test_shallow_history_is_rejected(self):
        actual_check_output = subprocess.check_output
        def shallow(args, **kwargs):
            return b'true\n' if args == ['git', 'rev-parse', '--is-shallow-repository'] else actual_check_output(args, **kwargs)
        with patch.object(recording.subprocess, 'check_output', side_effect=shallow), self.assertRaises(AssertionError):
            self.invoke()

    def test_publication_evidence_is_required(self):
        del self.env['VIBEMOL_PUBLISHED_RELEASE_JSON']
        with self.assertRaises(AssertionError) as error:
            self.invoke()
        self.assertIn('preserve gh release view output', str(error.exception))

    def test_a_misversioned_published_tag_cannot_become_a_baseline(self):
        version = self.root / 'assets/app/js/asset-urls.js'
        version.write_text("const APP_VERSION = '0.9.5';\n")
        self.git('add', '.')
        self.git('-c', 'user.name=Recording Test', '-c', 'user.email=recording-test@example.invalid',
                 'commit', '-qm', 'Synthetic wrong version under the release tag')
        self.git('tag', '-f', 'v0.10.0')
        self.env['GITHUB_SHA'] = self.git('rev-parse', 'HEAD')
        (self.source / 'assets/app/js/asset-urls.js').write_bytes(version.read_bytes())
        with self.assertRaises(AssertionError) as error:
            self.invoke()
        self.assertIn("'actual': '0.9.5'", str(error.exception))


if __name__ == '__main__':
    unittest.main()
