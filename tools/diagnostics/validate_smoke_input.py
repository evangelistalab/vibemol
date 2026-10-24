"""Validate #47/#48 input measurements; never substitutes for the ordinary gate."""
import ast
import json
from pathlib import Path
import sys


def validate(folder):
    result = json.loads((folder / 'result.json').read_text())
    host = [json.loads(line) for line in (folder / 'host-events.jsonl').read_text().splitlines()]
    assert result['notMergeEvidence'] and result['sourceCleanAfter']
    assert result['fallbackLogicUnchanged'] and result['selectionFallbackHandlers'] == 0
    assert result['existingSelectionWaitMs'] == 600 and result['newAssertionDeadlines'] == []
    assert not result['repairs'] and not result['diagnosticNavigationBlocks']
    assert not result['pageErrors'] and not result['consoleErrors'] and result['droppedBrowserEvents'] == 0
    assert not result['unattemptedStatements'] and not result['blocked'], 'Incomplete input coverage'
    cases = {row['case'] for row in host if row['kind'] == 'case'}
    assert 'fragment attach Smart on open-site ghost resolves to Append with open-site hint' in cases
    assert 'clicking a bond with a non-fusion fragment leaves fuse preview inactive' in cases
    # The full-prefix form must also exercise the earlier identity/toggle case.
    if not result['videoRegionOnly']:
        assert 'fragment cue Escape disarms Build, then clears selection' in cases
    known = []
    for failure in result['failures']:
        # These two separate assertions already failed on unchanged main in
        #40130635514. Preserve them as findings, never as passing Smoke checks.
        assert 'close-during-record unexpectedly downloaded a file' in failure['source'], failure
        assert failure['case'] in ['trajectory smoke', 'vibration video export smoke'], failure
        checks = [a for a in result['assertions'] if a['mainLine'] == failure['mainLine'] and not a['passed']]
        check = next(a for a in checks if a['kind'] == 'python-assertion')
        assert check['expression'] == "len(export_state['downloads']) != 2", check
        state = ast.literal_eval(check['values']['export_state'])
        assert len(state['downloads']) == 3, state
        known.append(dict(case=failure['case'],line=failure['mainLine'],actualDownloads=3,expectedDownloads=2))
    assert len(known) <= 2 and len({k['case'] for k in known}) == len(known)
    failures = [a for a in result['assertions'] if not a['passed']]
    assert len(failures) == len(known), 'A fourth input precondition or another assertion failed'
    summary = dict(inputRepairChecksPassed=True,ordinaryGate=False,diagnosticOnly=True,
                   source=result['sourceRef'],harness=result['harnessRef'],
                   selectionAttempts=len(result['selectionAttempts']),selectionRepairs=0,
                   nativeLauncherRecoveries=0,knownExporterFindingsNotPasses=known,
                   assertions=len(result['assertions']),bypasses=len(result['bypasses']))
    (folder / 'input-validation.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2))


if __name__ == '__main__':
    validate(Path(sys.argv[1]))
