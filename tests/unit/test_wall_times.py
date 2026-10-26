import io,json,sys,tempfile,unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'e2e'))
from wall_times import record_wait_wall,summarize

class WallTimeRecords(unittest.TestCase):
    def test_passed_cpu_work_keeps_raw_wall_instead_of_discounted_time(self):
        with tempfile.TemporaryDirectory()as tmp,patch.dict('os.environ',{'VIBEMOL_TEST_ARTIFACT_DIR':tmp}),redirect_stdout(io.StringIO()):
            row=record_wait_wall(site='control',label='CPU work',kind='native',outcome='passed',host_elapsed_ms=782,
                browser=dict(wallElapsedMs=780.4,responsiveElapsedMs=.2,discountedMs=780.2))
            saved=json.loads((Path(tmp)/'assertion-wall-times.jsonl').read_text())
        self.assertEqual(saved,row)
        self.assertEqual(row['browserWallMs'],780.4)
        self.assertEqual(row['responsiveMs'],.2)
        summary=summarize([row])['bySite'][0]
        self.assertEqual(summary['browserWallMs']['maximum'],780.4)
        self.assertIsNone(summarize([row])['performanceAcceptanceThreshold'])
    def test_failed_missing_browser_readback_still_records_host_duration(self):
        with tempfile.TemporaryDirectory()as tmp,patch.dict('os.environ',{'VIBEMOL_TEST_ARTIFACT_DIR':tmp}),redirect_stdout(io.StringIO()):
            row=record_wait_wall(site='figure.preview',label='failed readback',kind='image',outcome='failed',
                                 host_elapsed_ms=30005,error_type='TimeoutError')
        self.assertIsNone(row['browserWallMs'])
        self.assertEqual(row['hostAttemptWallMs'],30005)
        self.assertEqual(row['errorType'],'TimeoutError')
        self.assertEqual(row['outcome'],'failed')
    def test_recording_failure_does_not_throw_or_erase_stdout_copy(self):
        output=io.StringIO()
        with patch.object(Path,'open',side_effect=OSError('read-only artifact path')),redirect_stdout(output):
            row=record_wait_wall(site='control',label='write failure',kind='test',outcome='failed',host_elapsed_ms=4)
        self.assertEqual(row['recordingError'],'read-only artifact path')
        self.assertEqual(json.loads(output.getvalue().split('] ',1)[1]),row)
    def test_distribution_separates_clocks_outcomes_and_missing_samples(self):
        rows=[dict(site='same',kind='test',label='case',outcome='passed',browserWallMs=v,hostAttemptWallMs=v+1)for v in [10,20,30]]
        rows.append(dict(site='same',kind='test',label='failure',outcome='failed',browserWallMs=None,hostAttemptWallMs=900))
        summary=summarize(rows);self.assertEqual(summary['recordCount'],4)
        passed=next(x for x in summary['bySite']if x['outcome']=='passed')
        failed=next(x for x in summary['bySite']if x['outcome']=='failed')
        self.assertEqual(passed['browserWallMs'],dict(count=3,minimum=10,median=20,p95=30,maximum=30))
        self.assertEqual(failed['browserWallMs'],dict(count=0))
        self.assertEqual(failed['hostAttemptWallMs']['maximum'],900)
        self.assertEqual(failed['missingBrowserReadbacks'],1)
