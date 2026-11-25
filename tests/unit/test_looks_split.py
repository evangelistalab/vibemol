"""Keep each original Looks case and its evidence source in exactly one part."""

import ast
from collections import Counter
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = '928be9df7a5197659a48445ddd6a1f9e79c0d907'


class LooksSplitTests(unittest.TestCase):
    def test_case_and_checkpoint_union_is_exact(self):
        def old(path):
            return subprocess.check_output(['git', 'show', ORIGINAL + ':' + path], cwd=ROOT, text=True)

        shared = 'tests/e2e/looks.py'
        original = ast.parse(old(shared))
        original_main = next(node for node in original.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
        original_cases = next(node.iter for node in ast.walk(original_main)
                              if isinstance(node, ast.For) and isinstance(node.iter, ast.List))
        manifest_path = 'tests/baselines/browser-suite.json'
        manifest = json.loads((ROOT / manifest_path).read_text())
        part_names = [suite for suite in manifest['suites'] if suite.startswith('tests/e2e/looks_')]
        self.assertEqual(len(part_names), 3)
        cases = []
        markers = Counter()
        for part in part_names:
            tree = ast.parse((ROOT / part).read_text())
            inventory = next(node.value for node in tree.body if isinstance(node, ast.Assign)
                             and node.targets[0].id == 'CASES')
            cases.extend(node.id for node in inventory.elts)
            markers.update(manifest['checkpointCounts'].get(part, {}))
        self.assertEqual(Counter(cases), Counter(node.id for node in original_cases.elts))
        self.assertEqual(len(cases), len(set(cases)))
        self.assertEqual(markers, Counter(json.loads(old(manifest_path))['checkpointCounts'].get(shared, {})))

        # Looks has legacy non-JSON comparand logs as well; pin the original bodies.
        def cases_in(module):
            return {node.name: ast.dump(node) for node in module.body
                    if isinstance(node, ast.FunctionDef) and node.name not in ('main', 'run_cases')}

        self.assertEqual(cases_in(ast.parse((ROOT / shared).read_text())), cases_in(original))
