import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[2] / 'tools/diagnostics/validate_smoke_input.py'
spec = importlib.util.spec_from_file_location('validate_smoke_input', MODULE)
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)


class InputDiagnosticContract(unittest.TestCase):
    def evidence(self, folder):
        result = dict(notMergeEvidence=True, sourceCleanAfter=True, fallbackLogicUnchanged=True,
                      selectionFallbackHandlers=0, existingSelectionWaitMs=600, newAssertionDeadlines=[],
                      repairs=[], diagnosticNavigationBlocks=[], pageErrors=[], consoleErrors=[],
                      droppedBrowserEvents=0, unattemptedStatements=[], blocked=[], videoRegionOnly=False,
                      failures=[], assertions=[], sourceRef='source', harnessRef='harness',
                      selectionAttempts=[dict(id=1)], bypasses=[dict(prefix='trajectory'),dict(prefix='vibration')])
        cases = ['fragment attach Smart on open-site ghost resolves to Append with open-site hint',
                 'clicking a bond with a non-fusion fragment leaves fuse preview inactive',
                 'fragment cue Escape disarms Build, then clears selection']
        (folder / 'host-events.jsonl').write_text(''.join(json.dumps(dict(kind='case',case=case))+'\n' for case in cases))
        return result

    def write(self, folder, result):
        (folder / 'result.json').write_text(json.dumps(result))

    def test_known_exporter_finding_stays_failed_and_not_an_ordinary_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);result=self.evidence(folder)
            result['failures']=[dict(mainLine=10,case='trajectory smoke',source='Trajectory close-during-record unexpectedly downloaded a file')]
            result['assertions']=[dict(mainLine=10,passed=False,kind='python-assertion',
                                      expression="len(export_state['downloads']) != 2",
                                      values=dict(export_state=repr(dict(downloads=[1,2,3]))))]
            self.write(folder,result);validation.validate(folder)
            summary=json.loads((folder/'input-validation.json').read_text())
            self.assertFalse(summary['ordinaryGate'])
            self.assertEqual(summary['knownExporterFindingsNotPasses'],[dict(case='trajectory smoke',line=10,actualDownloads=3,expectedDownloads=2)])

    def test_fourth_precondition_fails_instead_of_being_classified_away(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);result=self.evidence(folder)
            result['failures']=[dict(source='Native selection point covered by a different overlay')]
            self.write(folder,result)
            with self.assertRaises(AssertionError):validation.validate(folder)

    def test_missing_coverage_and_selection_repair_each_fail(self):
        for key, value in [('unattemptedStatements',[42]), ('repairs',[dict(id=1)]),
                           ('diagnosticNavigationBlocks',[dict(id=1)])]:
            with self.subTest(key=key),tempfile.TemporaryDirectory() as tmp:
                folder=Path(tmp);result=self.evidence(folder);result[key]=value;self.write(folder,result)
                with self.assertRaises(AssertionError):validation.validate(folder)

    def test_changed_exporter_signature_is_not_tolerated(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);result=self.evidence(folder)
            result['failures']=[dict(mainLine=10,case='trajectory smoke',source='Trajectory close-during-record unexpectedly downloaded a file')]
            result['assertions']=[dict(mainLine=10,passed=False,kind='python-assertion',
                                      expression="len(export_state['downloads']) != 2",
                                      values=dict(export_state=repr(dict(downloads=[1,2,3,4]))))]
            self.write(folder,result)
            with self.assertRaises(AssertionError):validation.validate(folder)


if __name__ == '__main__':
    unittest.main()
