import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'e2e'))
from assertion_contract import budget_ms,numbers_close


class AssertionContract(unittest.TestCase):
    def test_budgets_are_the_existing_values_not_a_new_round_timeout(self):
        self.assertEqual(budget_ms('native-selection'),600)
        self.assertEqual(budget_ms('native-clipboard'),5000)
        self.assertEqual(budget_ms('false-presented-control'),100)
        with self.assertRaises(KeyError):budget_ms('unreviewed-policy')

    def test_original_numeric_boundary_still_rejects_a_millionth(self):
        self.assertTrue(numbers_close(1.0+1e-11,1.0))
        self.assertFalse(numbers_close(1.0+1e-6,1.0))
        self.assertFalse(numbers_close(float('nan'),float('nan')))
