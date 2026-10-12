"""Negative controls for the Stage 3 characterization safety net."""
import pathlib
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'e2e'))
from characterize import (assert_element_cache_exercise, require_element_cache_result,
                          verify_element_caches)


class ElementCacheGateTests(unittest.TestCase):
    def test_missing_bridge_is_fatal_without_injection(self):
        browser = Mock()
        context = browser.new_context.return_value
        context.new_page.return_value.evaluate.return_value = False
        with self.assertRaisesRegex(AssertionError, 'element cache bridge missing on current source'):
            verify_element_caches(browser, 'http://example.invalid', inject=False)
        context.new_page.return_value.wait_for_function.assert_called_once_with(
            '() => window.VibeMolSession && window.VibeMolWorkbenchHost')
        context.close.assert_called_once()

    def test_missing_historical_bridge_requires_explicit_injection(self):
        browser = Mock()
        context = browser.new_context.return_value
        context.new_page.return_value.evaluate.return_value = False
        result = verify_element_caches(browser, 'http://example.invalid', inject=True)
        self.assertEqual(result, {'historicalSourceWithoutCacheBridge': True})
        require_element_cache_result(result, inject=True)
        with self.assertRaisesRegex(AssertionError, 'element cache bridge missing on current source'):
            require_element_cache_result(result, inject=False)
        context.close.assert_called_once()

    @staticmethod
    def report(modes, panels):
        return {'supported': True, 'nodeCount': 43, 'failures': [], 'checks': {
            'presented checkpoint': len(modes) + 2 * len(panels) + 1,
            'mode switch': len(modes) + 1,
            'panel transition: buildPanel': 1,
            'panel transition: coordsPanel': 1,
            'DOM replacement': 1, 'session restore': 1}}

    def test_present_bridge_and_explicit_checks_cannot_hide_dormant_observer(self):
        modes, panels = ['Display', 'Measure', 'Edit', 'Calculations'], ['buildPanel', 'coordsPanel']
        identity = self.report(modes, panels)
        identity['checks']['mode switch'] = len(modes)
        for reason in ('panel transition: buildPanel', 'panel transition: coordsPanel', 'DOM replacement'):
            del identity['checks'][reason]
        with self.assertRaisesRegex(AssertionError, 'mode switch: 4 < 5; panel transition: 0 < 2; DOM replacement: 0 < 1'):
            assert_element_cache_exercise(identity, modes, panels)

    def test_every_reason_category_is_required_in_every_context(self):
        for modes in (['Display', 'Measure', 'Edit'], ['Display', 'Measure', 'Edit', 'Calculations']):
            panels = ['coordsPanel', 'figurePanel']
            for reason in ('presented checkpoint', 'mode switch', 'panel transition', 'DOM replacement', 'session restore'):
                with self.subTest(modes=modes, missing_reason=reason):
                    identity = self.report(modes, panels)
                    if reason == 'panel transition':
                        identity['checks']['panel transition: buildPanel'] = 0
                    else:
                        identity['checks'][reason] -= 1
                    with self.assertRaisesRegex(AssertionError, reason + ': '):
                        assert_element_cache_exercise(identity, modes, panels)

    def test_healthy_counts_need_not_equal_a_timing_dependent_baseline(self):
        modes, panels = ['Display', 'Measure', 'Edit'], ['coordsPanel', 'figurePanel']
        identity = self.report(modes, panels)
        first = assert_element_cache_exercise(identity, modes, panels)
        for reason in identity['checks']:
            identity['checks'][reason] += 100
        later = assert_element_cache_exercise(identity, modes, panels)
        self.assertEqual(first['minimumChecksByReason'], later['minimumChecksByReason'])
        self.assertEqual(later['checksByReason']['panel transition'], 202)
        self.assertEqual(later['observedModeChecks'], 101)


if __name__ == '__main__':
    unittest.main()
