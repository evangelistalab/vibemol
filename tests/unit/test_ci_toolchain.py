import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]


class SharedCiToolchain(unittest.TestCase):
    def test_exact_lock_includes_the_complete_resolved_ordinary_set(self):
        text=(ROOT/'api/requirements-ci.lock').read_text()
        pins=dict(re.findall(r'^([\w-]+)==([\w.]+)$',text,re.M))
        self.assertEqual(pins,{'playwright':'1.64.1','pyee':'14.0.0','greenlet':'3.5.6','typing-extensions':'4.16.0'})
        self.assertIn('-r requirements.txt',text)

    def test_every_active_comparison_workflow_uses_that_lock_without_override(self):
        # Published-tag recorder is frozen historical provenance, not an active
        # diagnostic/control comparison. Its tag has no new lockfile.
        for name in ['ci.yml','browser-ci-probes.yml','characterization-baseline.yml',
                     'playwright-cache.yml','smoke-input-diagnostic.yml','selection-arrival-diagnostic.yml']:
            with self.subTest(workflow=name):
                text=(ROOT/'.github/workflows'/name).read_text()
                commands=[line for line in text.splitlines() if 'pip install' in line and 'api/requirements' in line]
                self.assertTrue(commands)
                self.assertTrue(all('api/requirements-ci.lock' in line and 'playwright==' not in line for line in commands))
                self.assertIn("python-version: '3.12.15'",text)


if __name__=='__main__':
    unittest.main()
