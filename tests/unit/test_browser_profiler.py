"""Profiler accounting controls; these do not supply application acceptance."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile
import json

spec = importlib.util.spec_from_file_location('browser_profiler', Path(__file__).resolve().parents[2]/'tools/profile_browser_tests.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
spec2 = importlib.util.spec_from_file_location('process_profiler', Path(__file__).resolve().parents[2]/'tools/profile_browser_processes.py')
process = importlib.util.module_from_spec(spec2); spec2.loader.exec_module(process)


class ProfilerControls(unittest.TestCase):
    def test_api_journal_survives_and_wrapper_preserves_original_result(self):
        from playwright._impl._sync_base import SyncBase
        async def echo(): return 17
        def original(obj,coro): coro.close(); return 17
        with tempfile.TemporaryDirectory() as folder, patch.object(SyncBase,'_sync',original):
            profiler=p.BrowserProfiler(Path(folder)/'profile');profiler.install()
            self.assertEqual(SyncBase._sync(object(),echo()),17)
            report=profiler.finish('self-test')
            events=[json.loads(line)for line in (Path(folder)/'profile/operation-events.jsonl').read_text().splitlines()]
            self.assertEqual([e['phase']for e in events],['start','end'])
            self.assertEqual(events[0]['id'],events[1]['id'])
            self.assertEqual(report['apiOperations'],1)
            self.assertEqual(report['profileErrors'],[])

    def test_linux_ticks_rss_and_process_roles_are_mechanical(self):
        fields=['S']+['0']*22;fields[1]='12';fields[11]='123';fields[12]='45';fields[19]='987';fields[21]='64'
        self.assertEqual(process.parse_stat('34 (name with ) spaces) '+' '.join(fields)),dict(pid=34,ppid=12,ticks=168,startTicks=987,rssPages=64))
        self.assertEqual(process.role(b'chrome\0--type=gpu-process\0'),'gpu-process')
        self.assertEqual(process.role(b'chrome\0--type=renderer\0'),'renderer')

    def test_operation_buckets_do_not_call_every_evaluation_a_file_load(self):
        self.assertEqual(p.category('Page.evaluate','async()=>VibeMolEmbed.loadFiles(files)'), 'fixture-import')
        self.assertEqual(p.category('Page.evaluate','()=>VibeMolSession.import(saved)'), 'session-import')
        self.assertEqual(p.category('Page.evaluate','()=>VibeMolSession.export()'), 'session-export')
        self.assertEqual(p.category('Page.evaluate','()=>42'), 'javascript-evaluation')
        self.assertEqual(p.category('Locator.set_input_files'), 'file-input')
        self.assertEqual(p.category('Locator.click'), 'input')
        self.assertEqual(p.category('Page.wait_for_function'), 'explicit-wait')

    def test_statistics_and_exclusive_time_preserve_nested_accounting(self):
        rows=[dict(method='outer',category='a',seconds=5,exclusiveSeconds=3,error=None),
              dict(method='inner',category='a',seconds=2,exclusiveSeconds=2,error='ExpectedError')]
        report=p.operation_summary(rows,'category')[0]
        self.assertEqual(report['totalSeconds'],5)
        self.assertEqual(report['inclusiveSeconds'],7)
        self.assertEqual(report['count'],2)
        self.assertEqual(report['errors'],1)
        self.assertEqual(report['meanSeconds'],2.5)
        self.assertEqual(report['p95Seconds'],3)

    def test_samples_distinguish_self_from_inclusive_and_idle(self):
        frames=lambda i,n,children=[]:dict(id=i,callFrame=dict(functionName=n,url='app.js',lineNumber=0),children=children)
        result=p.sample_summary(dict(nodes=[frames(1,'root',[2,3]),frames(2,'work'),frames(3,'(idle)')],samples=[2,3],timeDeltas=[5000,10000]))
        rows={r['function']:r for r in result['functions']}
        self.assertEqual(result['samples'],2)
        self.assertEqual(rows['work']['sampledSelfSeconds'],.005)
        self.assertEqual(rows['(idle)']['sampledSelfSeconds'],.01)
        self.assertEqual(rows['root']['sampledSelfSeconds'],0)
        self.assertEqual(rows['root']['sampledInclusiveSeconds'],.015)
        with self.assertRaises(ValueError):p.sample_summary(dict(nodes=[],samples=[1],timeDeltas=[]))


if __name__ == '__main__': unittest.main()
