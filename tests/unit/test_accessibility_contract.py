"""Reject unreviewed incomplete targets, including newly canvas-backed controls."""
import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests/e2e'))
from accessibility_contract import compare_findings, KNOWN_CANVAS_BACKED_INCOMPLETE


def hint_node():
    return dict(rule='color-contrast', target=['#hint'], any=[dict(id='color-contrast',
        data=dict(messageKey='imgNode'), relatedNodes=[dict(target=['#canvas'], html='<canvas id="canvas"></canvas>')])])


class ContrastInventory(unittest.TestCase):
    def setUp(self):
        self.baseline = json.loads((ROOT / 'tests/baselines/color-contrast.json').read_text())
        self.actual = copy.deepcopy(self.baseline)

    def compare_added(self, node, *, case='dark/Calculations', kind='incomplete'):
        self.actual['cases'][case][kind].append(node)
        return compare_findings(self.actual, self.baseline)

    def test_existing_baseline_is_preserved(self):
        self.assertEqual(compare_findings(self.actual, self.baseline)[0], [])
        self.assertEqual([c['incompleteCount'] for c in self.actual['cases'].values()], [4,4,6,7,4,4,6,7])

    def test_named_set_is_exact_and_case_specific(self):
        self.assertEqual(KNOWN_CANVAS_BACKED_INCOMPLETE, {case: {
            ('#hint',): dict(rule='color-contrast', messageKey='imgNode', relatedCanvas=('#canvas',))}
            for case in ['light/Calculations','dark/Calculations']})

    def test_reviewed_hint_remains_incomplete_never_converted_to_pass(self):
        node = hint_node()
        regressions, comparands = self.compare_added(node)
        self.assertEqual(regressions, [])
        self.assertIn(node, self.actual['cases']['dark/Calculations']['incomplete'])
        self.assertEqual(comparands[-1]['namedCanvasBackedIncompleteTargets'], ['["#hint"]'])
        self.assertEqual(self.actual['cases']['dark/Calculations']['passesCount'], 184)

    def test_new_canvas_backed_element_fails(self):
        node = hint_node(); node['target'] = ['#newControlOverCanvas']
        self.assertEqual(self.compare_added(node)[0], ['dark/Calculations incomplete: ["#newControlOverCanvas"]'])

    def test_known_id_with_new_reason_fails(self):
        node = hint_node(); node['any'][0]['data']['messageKey'] = 'elmPartiallyObscured'
        self.assertTrue(self.compare_added(node)[0])

    def test_hint_in_a_new_case_fails(self):
        self.assertEqual(self.compare_added(hint_node(), case='light/View')[0], ['light/View incomplete: ["#hint"]'])

    def test_actual_violation_always_fails_even_for_known_hint(self):
        self.assertEqual(self.compare_added(hint_node(), kind='violations')[0], ['dark/Calculations violations: ["#hint"]'])

    def test_different_canvas_or_non_canvas_element_fails(self):
        for change in ['selector', 'html']:
            with self.subTest(change=change):
                self.actual = copy.deepcopy(self.baseline);node = hint_node()
                node['any'][0]['relatedNodes'][0]['target' if change=='selector' else 'html'] = ['#otherCanvas'] if change=='selector' else '<div id="canvas"></div>'
                self.assertTrue(self.compare_added(node)[0])

    def test_empty_or_additional_unreviewed_check_fails(self):
        for checks in [[], hint_node()['any'] + [dict(id='color-contrast',data=dict(messageKey='other'))]]:
            with self.subTest(checks=checks):
                self.actual = copy.deepcopy(self.baseline);node = hint_node();node['any'] = checks
                self.assertTrue(self.compare_added(node)[0])

    def test_same_counts_with_swapped_target_still_fail_and_log_both_sets(self):
        case=self.actual['cases']['dark/Calculations'];case['incomplete'].pop();node=hint_node();node['target']=['#newControl']
        regressions,comparands=self.compare_added(node)
        self.assertTrue(regressions)
        self.assertEqual(len(case['incomplete']),self.baseline['cases']['dark/Calculations']['incompleteCount'])
        self.assertIn('["#newControl"]',comparands[-1]['actualTargets'])
        self.assertNotIn('["#newControl"]',comparands[-1]['baselineTargets'])


if __name__ == '__main__':
    unittest.main()
