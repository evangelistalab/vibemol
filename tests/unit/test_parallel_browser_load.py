from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import run_browser_shards_parallel as runner


class ParallelBrowserLoadTests(unittest.TestCase):
    def test_max_load_refuses_before_starting_any_shard(self):
        stderr = io.StringIO()
        with (patch.object(sys, 'argv', ['runner', '--max-load', '1.5']),
              patch.dict(runner.os.environ),
              patch.object(runner.os, 'getloadavg', return_value=(2, 0, 0)),
              patch.object(runner.tempfile, 'mkdtemp') as create_artifacts,
              redirect_stderr(stderr), self.assertRaises(SystemExit) as error):
            runner.os.environ.pop('CI', None)
            runner.main()

        self.assertEqual(error.exception.code, 2)
        self.assertIn('One-minute load 2.00 exceeds --max-load 1.5', stderr.getvalue())
        create_artifacts.assert_not_called()

    def test_load_crossing_invalidates_timing_even_on_worker_failure(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as directory:
            artifacts = Path(directory)
            with (patch.object(runner, 'Event') as event,
                  patch.object(runner.os, 'getloadavg', return_value=(11, 5, 6)),
                  redirect_stdout(stdout), redirect_stderr(stderr)):
                event.return_value.wait.side_effect = [False, True]
                with self.assertRaisesRegex(RuntimeError, 'worker failure'):
                    with runner.monitor_load(artifacts, initial_load=10, logical_cores=10, jobs=2):
                        raise RuntimeError('worker failure')

            samples = json.loads((artifacts / 'run-summary.json').read_text())

        event.return_value.wait.assert_called_with(30)
        self.assertEqual([sample['oneMinuteLoad'] for sample in samples['loadSamples']], [10, 11])
        self.assertTrue(samples['contended'])
        self.assertFalse(samples['timingEvidence'])
        self.assertIn('Warning: host load exceeds the logical core count.', stderr.getvalue())
        self.assertIn('Results are not timing evidence.', stdout.getvalue())
