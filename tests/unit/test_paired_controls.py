import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'e2e'))
from paired_controls_contract import composition, evaluate, exact


class PairedControls(unittest.TestCase):
    def setUp(self):
        write=dict(settings={'flag':False},controls={'left':False,'right':False},
                   trace=[dict(owner='edit',args=[{'flag':False}])])
        self.report=dict(pageerrors=[],inventory=dict(original=[],editor=[],appearanceDom=[],editorDom=[]),
            scopeAsymmetries=[],pairs=[dict(ids=['left','right'],path=['flag'],phase='change',requested=False,
                                           writes=[copy.deepcopy(write),copy.deepcopy(write)],passed=True)])
        self.baseline=composition(self.report)

    def test_exact_typed_value_and_writer_pass(self):
        self.assertTrue(evaluate(self.report,self.baseline)['passed'])

    def test_boolean_integer_drift_is_rejected(self):
        self.assertFalse(exact(True,1))
        self.report['pairs'][0]['writes'][1]['settings']['flag']=0
        self.assertFalse(evaluate(self.report,self.baseline)['passed'])

    def test_equal_results_do_not_excuse_a_different_writer(self):
        self.report['pairs'][0]['writes'][1]['trace'][0]['owner']='parallelSetter'
        self.assertFalse(evaluate(self.report,self.baseline)['passed'])

    def test_two_identical_silent_noops_fail_requested_applied(self):
        for write in self.report['pairs'][0]['writes']:
            write['settings']['flag']=True
        self.assertFalse(evaluate(self.report,self.baseline)['passed'])

    def test_disappeared_or_replaced_pair_is_not_zero_divergences(self):
        self.report['pairs']=[]
        self.assertFalse(evaluate(self.report,self.baseline)['passed'])
        self.report['pairs']=[dict(ids=['other','right'],path=['flag'],phase='change',requested=False,
                                   writes=[dict(settings={'flag':False},controls={'other':False,'right':False},trace=[])]*2)]
        self.assertFalse(evaluate(self.report,self.baseline)['passed'])

    def test_raw_control_outside_binding_factory_fails_inventory(self):
        self.report['inventory']['editorDom'].append(dict(key='unregisteredControl',type='checkbox'))
        self.assertFalse(evaluate(self.report,self.baseline)['passed'])

    def test_unclassified_scope_pair_cannot_hide_a_divergence(self):
        row=self.report['pairs'].pop()
        row['normalizedRequests']=[dict(flag=False),dict(flag=False)]
        row['path']=['flag']
        self.report['scopeAsymmetries'].append(row)
        self.assertFalse(evaluate(self.report,self.baseline)['passed'])

    def test_forged_pass_flag_does_not_change_raw_comparison(self):
        self.report['pairs'][0]['writes'][0]['controls']['left']=True
        self.assertFalse(evaluate(self.report,self.baseline)['passed'])


if __name__=='__main__':
    unittest.main()
