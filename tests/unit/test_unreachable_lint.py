"""Real linter controls, including the exact rejected premerge source."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class UnreachableLintTests(unittest.TestCase):
    def test_javascript_unreachable_is_error_and_hoisted_declaration_is_valid(self):
        eslint = os.environ.get('ESLINT', str(ROOT/'node_modules/.bin/eslint'))
        for source, failed in [('function f(){ return; console.log(1); }', True),
                               ('function f(){ throw Error(); console.log(1); }', True),
                               ('while(true){ break; console.log(1); }', True),
                               ('while(true){ continue; console.log(1); }', True),
                               ('function f(){ return nested(); function nested(){ return 1; } }', False)]:
            result = subprocess.run([eslint, '--no-inline-config', '--stdin', '--stdin-filename', 'tests/e2e/lint-control.js', '--format=json'],
                                    input=source, text=True, capture_output=True, cwd=ROOT)
            with self.subTest(source=source):
                self.assertEqual(result.returncode != 0, failed, result.stdout+result.stderr)
                if failed:
                    self.assertEqual(json.loads(result.stdout)[0]['messages'][0]['ruleId'], 'no-unreachable')

    def python_lint(self, source):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'lint_control.py'
            path.write_text(source)
            return subprocess.run([os.environ.get('PYLINT_PYTHON', sys.executable), '-m', 'pylint', '--disable=all',
                                   '--enable=unreachable', '--reports=no', '--score=no', '--persistent=no', '--output-format=json', str(path)],
                                  text=True, capture_output=True, cwd=ROOT)

    def test_python_terminal_statements_are_detected_and_live_tail_is_valid(self):
        for source, failed in [('def f():\n return\n print(1)\n', True),
                               ('def f():\n raise ValueError()\n print(1)\n', True),
                               ('while True:\n break\n print(1)\n', True),
                               ('while True:\n continue\n print(1)\n', True),
                               ('def f():\n print(1)\n return\n', False)]:
            result = self.python_lint(source)
            with self.subTest(source=source):
                self.assertEqual(result.returncode != 0, failed, result.stdout+result.stderr)
                if failed:
                    self.assertEqual(json.loads(result.stdout)[0]['symbol'], 'unreachable')

    def test_exact_original_coverage_omission_is_rejected(self):
        source = subprocess.check_output(['git', 'show', '2e85651447b2328e3a880cebe8c84c8d838d2bef:tests/e2e/premerge.py'], cwd=ROOT, text=True)
        result = self.python_lint(source)
        self.assertNotEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertEqual([(x['symbol'], x['line']) for x in json.loads(result.stdout)], [('unreachable', 1012)])


if __name__ == '__main__':
    unittest.main()
