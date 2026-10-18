"""Explicit unresolved contrast inventory; incomplete findings remain incomplete."""
import json


# Reviewed canvas-backed target, not a blanket incomplete exception. Other
# baseline targets (pseudo-elements/select backgrounds/clipping) stay unchanged.
KNOWN_CANVAS_BACKED_INCOMPLETE = {
    'light/Calculations': {
        ('#hint',): {'rule': 'color-contrast', 'messageKey': 'imgNode',
                     'relatedCanvas': ('#canvas',)},
    },
    'dark/Calculations': {
        ('#hint',): {'rule': 'color-contrast', 'messageKey': 'imgNode',
                     'relatedCanvas': ('#canvas',)},
    },
}


def known_canvas_incomplete(case, node):
    expected = KNOWN_CANVAS_BACKED_INCOMPLETE.get(case, {}).get(tuple(node['target']))
    if expected is None or node['rule'] != expected['rule']:
        return False
    checks = node.get('any', []) + node.get('all', []) + node.get('none', [])
    return bool(checks) and all(
        check['id'] == 'color-contrast'
        and check.get('data', {}).get('messageKey') == expected['messageKey']
        and any(tuple(related['target']) == expected['relatedCanvas']
                and related['html'].lstrip().startswith('<canvas ')
                for related in check.get('relatedNodes', []))
        for check in checks)


def compare_findings(report, baseline):
    """Keep the baseline and reject every unreviewed violation/incomplete target."""
    regressions = []
    comparands = []
    for case, actual in report['cases'].items():
        expected = baseline['cases'][case]
        for kind in ['violations', 'incomplete']:
            targets = lambda nodes: {json.dumps(n['target'], sort_keys=True) for n in nodes}
            actual_targets, baseline_targets = targets(actual[kind]), targets(expected[kind])
            reviewed = {json.dumps(n['target'], sort_keys=True) for n in actual[kind]
                        if kind == 'incomplete' and known_canvas_incomplete(case, n)}
            unexpected = sorted(actual_targets - baseline_targets - reviewed)
            comparands.append(dict(case=case, kind=kind, actualTargets=sorted(actual_targets),
                baselineTargets=sorted(baseline_targets),
                namedCanvasBackedIncompleteTargets=sorted(reviewed),
                actualUnexpectedTargets=unexpected, expectedUnexpectedTargets=[]))
            regressions.extend(f'{case} {kind}: {target}' for target in unexpected)
    return regressions, comparands
