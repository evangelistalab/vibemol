"""Additional human-required Stage 5 acceptance; never replaces either join."""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--policy', required=True, type=Path)
    parser.add_argument('--browser-result', required=True, type=Path)
    args = parser.parse_args()
    policy = json.loads(args.policy.read_text())
    result = json.loads(args.browser_result.read_text())
    actual_counts = {key: result[key] for key in ('passed', 'failed', 'total')}
    repaired = policy.get('requireVideoExportCompletion', False)
    phases = {
        'issue11': (35, 2, [['tests/e2e/axis_gizmo.py', 'escape-canvas-focus'],
                            ['tests/e2e/mode_consistency.py', 'coordinates-delete-selection-card']]),
        'issue52': (36, 1, [['tests/e2e/mode_consistency.py', 'coordinates-delete-selection-card']]),
        'issue53': (37, 0, []),  # Intentionally empty; the matcher/join stays.
    }
    phase = policy.get('acceptancePhase', 'issue11')
    assert phase in phases, ('Unknown pre-authorized acceptance phase', phase)
    passed, failed, expected_failures = phases[phase]
    expected_counts = dict(passed=passed, failed=failed, total=37) if repaired else {'passed': 34, 'failed': 3, 'total': 37}
    print(json.dumps(dict(check='pre-authorized gate arithmetic', phase=phase,
        actual=policy['ordinaryExpected'], expected=expected_counts), sort_keys=True), flush=True)
    assert policy['ordinaryExpected'] == expected_counts, (policy, expected_counts)
    actual_workflow = result.get('issue11Workflow')
    preserve_signature = policy.get('preserveExporterSignature', True)
    assert isinstance(preserve_signature, bool), policy
    expected_workflow = {'status': 'passed'} if repaired else policy.get('issue11Workflow')
    allowed_workflows = [expected_workflow] if repaired or preserve_signature else [
        {'id': 'issue-11-stop-after-second-download', 'site': site}
        for site in ('trajectory', 'vibration')
    ]
    comparands = {
        'policy': policy['group'],
        'baselineRun': policy['baselineRun'],
        'actualCounts': actual_counts, 'expectedCounts': expected_counts,
        'actualIssue11Workflow': actual_workflow,
        'expectedIssue11Workflow': expected_workflow,
        'preserveExporterSignature': preserve_signature,
        'allowedIssue11Workflows': allowed_workflows,
        'actualAllExecutedOnce': result.get('allExecutedOnce'),
        'expectedAllExecutedOnce': True,
        'actualMatchesAcceptedBaseline': result.get('matchesAcceptedBaseline'),
        'expectedMatchesAcceptedBaseline': True,
    }
    # Log all comparands before any assertion, on success and failure.
    print(json.dumps(comparands, sort_keys=True), flush=True)
    assert actual_counts == expected_counts, comparands
    assert result.get('allExecutedOnce') is True, comparands
    assert result.get('matchesAcceptedBaseline') is True, comparands
    if repaired:
        expected = [dict(prefix=prefix, downloads=6, naturalCompletion=True, earlyStop=True,
                    pointerCompletion=True, spaceCompletion=True, enterActivation=True,
                    clickOnlyActivation=True, freshSaveAssertions=4)
                    for prefix in ('trajectory', 'vibration')]
        actual = result.get('videoExportCompletion')
        print(json.dumps(dict(check='both repaired exporter workflows', actual=actual, expected=expected)), flush=True)
        assert actual_workflow == {'status': 'passed'}, comparands
        assert actual == expected, (actual, expected)
        print(json.dumps(dict(check='pre-authorized failure composition',
            actual=result.get('actualFailingWorkflows'), expected=expected_failures,
            intentionallyEmpty=phase=='issue53'), sort_keys=True), flush=True)
        assert result.get('actualFailingWorkflows') == expected_failures, result.get('actualFailingWorkflows')
    else:
        assert actual_workflow in allowed_workflows, (
            'STOP: #11 differs from the applicable historical group policy or ceased to fire; '
            'do not adjust the accepted set or retry', comparands)
    print('Additional exporter behavior gate: passed', flush=True)


if __name__ == '__main__':
    main()
