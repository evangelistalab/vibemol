"""Validate #47/#48 input measurements; never substitutes for the ordinary gate."""
import ast
import hashlib
import json
from pathlib import Path
import sys


def validate(folder, harness_root=None):
    harness_root=Path(harness_root) if harness_root else Path(__file__).resolve().parents[2]
    result = json.loads((folder / 'result.json').read_text())
    host = [json.loads(line) for line in (folder / 'host-events.jsonl').read_text().splitlines()]
    assert result['notMergeEvidence'] and result['sourceCleanAfter']
    assert result['fallbackLogicUnchanged'] and result['selectionFallbackHandlers'] == 0
    assert result['existingSelectionWaitMs'] == 600 and result['newAssertionDeadlines'] == []
    assert not result['repairs'] and not result['diagnosticNavigationBlocks']
    assert not result['pageErrors'] and not result['consoleErrors'] and result['droppedBrowserEvents'] == 0
    assert not result['unattemptedStatements'], 'Incomplete input coverage'
    if result['blocked']:
        source=(harness_root/'tests/e2e/smoke.py').read_text()
        assert hashlib.sha256(source.encode()).hexdigest()==result['smokeSha256']
        nodes={n.lineno:n for n in ast.walk(ast.parse(source)) if isinstance(n,ast.stmt)}
        assert all(b['line'] in nodes for b in result['blocked']), 'Unknown blocked source statement'
        actual=[dict(case=b['case'],sha256=hashlib.sha256(ast.dump(nodes[b['line']],include_attributes=False).encode()).hexdigest()) for b in result['blocked']]
        contract=json.loads((Path(__file__).resolve().parents[2]/'tests/baselines/smoke-native-input.json').read_text())
        assert actual==[entry for entry in contract['knownBlockedExporterRemainder'] if entry['case'] in {failure['case'] for failure in result['failures']}], 'Unknown blocked prerequisite; input coverage not established'
    cases = {row['case'] for row in host if row['kind'] == 'case'}
    assert 'fragment attach Smart on open-site ghost resolves to Append with open-site hint' in cases
    assert 'clicking a bond with a non-fusion fragment leaves fuse preview inactive' in cases
    # The full-prefix form must also exercise the earlier identity/toggle case.
    if not result['videoRegionOnly']:
        assert 'fragment cue Escape disarms Build, then clears selection' in cases
    shared=[a for a in result['assertions'] if a['kind']=='shared-assertion']
    source=(harness_root/'tests/e2e/smoke.py').read_text()
    assert hashlib.sha256(source.encode()).hexdigest()==result['smokeSha256']
    if 'state_after_input' in source:
        assert len(result['selectionAttempts'])==20

        native=[a for a in shared if a['values']['mode']=='native']
        clipboard=[a for a in shared if a['values']['mode']=='event-dom']
        assert len(native)==20 and len(clipboard)==1 and all(a['passed'] for a in shared)
        for entry in shared:
            value=entry['values']
            assert value['received'] and value['complete'] and value['trusted'] and value['targetMatches'] and not value['error']
            assert value['actual']==value['current']==value['expected']
            assert 0<=value['elapsedMs']<=value['budgetMs']==(600 if value['mode']=='native' else 5000)
        assert clipboard[0]['values']['expected']=={'atoms':4,'bonds':2,'bondsArray':True}
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
    assert not result['blocked'] or {b['case'] for b in result['blocked']}=={k['case'] for k in known}
    assert len(known) <= 2 and len({k['case'] for k in known}) == len(known)
    failures = [a for a in result['assertions'] if not a['passed']]
    assert len(failures) == len(known), 'A fourth input precondition or another assertion failed'
    summary = dict(inputRepairChecksPassed=True,ordinaryGate=False,diagnosticOnly=True,
                   source=result['sourceRef'],harness=result['harnessRef'],
                   selectionAttempts=len(result['selectionAttempts']),selectionRepairs=0,
                   nativeLauncherRecoveries=0,knownExporterFindingsNotPasses=known,
                   assertions=len(result['assertions']),bypasses=len(result['bypasses']),
                   globalCoverageComplete=not result['blocked'],knownBlockedExporterStatements=len(result['blocked']))
    (folder / 'input-validation.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2))


if __name__ == '__main__':
    validate(Path(sys.argv[1]),sys.argv[3] if len(sys.argv)>3 and sys.argv[2]=='--harness-root' else None)
