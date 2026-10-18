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
    expected_counts = {'passed': 33, 'failed': 4, 'total': 37}
    actual_workflow = result.get('issue11Workflow')
    preserve_signature = policy.get('preserveExporterSignature', True)
    assert isinstance(preserve_signature, bool), policy
    expected_workflow = policy['issue11Workflow']
    allowed_workflows = [expected_workflow] if preserve_signature else [
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
    assert actual_workflow in allowed_workflows, (
        'STOP: #11 differs from the applicable group policy or ceased to fire; '
        'do not adjust the accepted set or retry', comparands)
    print('Additional Stage 5 #11 behavior gate: passed', flush=True)


if __name__ == '__main__':
    main()
