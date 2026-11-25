"""Keep the affected-suite map exhaustive and reject unregistered suites."""

from fnmatch import fnmatchcase
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from select_browser_suites import select_suites, suite_rules


class SuiteMapTests(unittest.TestCase):
    def test_every_suite_and_source_file_is_reachable(self):
        suites, rules = suite_rules()
        files = subprocess.check_output(['git', 'ls-files', '-z', '--',
                                         'assets/app/js', 'src', 'tests/e2e'], cwd=ROOT).decode().split('\0')
        self.assertEqual([file for file in files if file and
                          not any(fnmatchcase(file, glob) for glob in rules)], [])
        self.assertEqual(set(select_suites(files, suites, rules)), set(suites))
        self.assertEqual(set(suites), {suite for mapped in rules.values()
                                      for suite in (suites if mapped == ['*'] else mapped)})
        for suite in suites:
            self.assertIn(suite, select_suites([suite], suites, rules))

    def test_shared_infrastructure_and_ci_failures_are_included(self):
        suites, rules = suite_rules()
        for path in ('assets/app/js/app.js', 'index.html', 'assets/app/js/asset-urls.js',
                     'tests/e2e/helpers.py', '.github/workflows/ci.yml'):
            with self.subTest(path=path):
                self.assertEqual(list(select_suites([path], suites, rules)), suites)
        vector = select_suites(['assets/app/js/vectors-model.js'], suites, rules, ['tests/e2e/axis_gizmo.py'])
        self.assertEqual(set(vector), {'tests/e2e/premerge.py', 'tests/e2e/transform_selection.py',
                                       'tests/e2e/axis_gizmo.py'})
