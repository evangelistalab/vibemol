"""Negative controls for the human-approved 1,214-value layout recording."""
import contextlib
import copy
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tests/e2e'))
import layout_default_recording as contract


class LayoutDefaultRecordingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.previous = contract.read_previous(ROOT)

    def setUp(self):
        self.expected = contract.expected_captures(self.previous)

    def verify(self, value):
        with contextlib.redirect_stdout(io.StringIO()):
            return contract.verify(self.previous, value)

    def test_exact_manifest_and_immutable_previous(self):
        before = copy.deepcopy(self.previous)
        result = self.verify(self.expected)
        self.assertEqual(result['expectedChangedValues'], 1214)
        self.assertEqual(result['categories'], {'dom/controls': 844, 'render/viewport': 268, 'render/projection': 102})
        self.assertTrue(result['zeroOtherChanges'])
        self.assertEqual(self.previous, before)

    def test_missing_change_is_rejected(self):
        first = contract.read_changes()[0]
        value = self.expected
        for part in first['path'][:-1]:
            value = value[part]
        value[first['path'][-1]] = first['before']
        with self.assertRaises(AssertionError):
            self.verify(self.expected)

    def test_unlisted_geometry_session_or_dom_changes_are_rejected(self):
        name = next(iter(self.expected))
        for category in ('session', 'geometry', 'dom'):
            with self.subTest(category=category):
                current = copy.deepcopy(self.expected)
                if category == 'dom':
                    current[name]['dom']['ids'].append('unexpected-id')
                else:
                    current[name][category] = {'unapproved': True}
                with self.assertRaises(AssertionError):
                    self.verify(current)

    def test_extra_layout_change_and_changed_type_are_rejected(self):
        name = next(iter(self.expected))
        for value in (self.expected[name]['render']['viewport']['cssWidth'] + 1, True):
            current = copy.deepcopy(self.expected)
            current[name]['render']['viewport']['cssWidth'] = value
            with self.assertRaises(AssertionError):
                self.verify(current)

    def test_modified_manifest_fails_its_pinned_digest(self):
        changes = contract.read_changes()
        changes.pop()
        with patch.object(Path, 'read_bytes', return_value=json.dumps(changes).encode()):
            with self.assertRaises(AssertionError):
                contract.read_changes()


if __name__ == '__main__':
    unittest.main()
