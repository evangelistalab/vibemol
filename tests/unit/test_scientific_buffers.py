"""A missing case or failed write trap must not become a passing ownership check."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'e2e'))
from scientific_buffers import validate_results, validate_controls

class ScientificBufferContractTests(unittest.TestCase):
    def results(self):
        row=dict(stage='final',guardedCalls=1,arrays=[dict(kinds=['source'])],sourceChanges=[],
                 violations=[],bufferAccesses=[],derivedChanges=[dict(labels=['vibration.frameBuffer'])],workerMessages=[])
        rows=[copy.deepcopy(row) for _ in range(3)]
        rows[1]['workerMessages']=[dict(kind=k,transferredSourceIds=[]) for k in ('autoiso','arithmetic')]
        return rows

    def test_missing_coverage_and_source_mutations_fail(self):
        validate_results(self.results())
        for key,value in [('stage','partial'),('guardedCalls',0),('arrays',[]),('sourceChanges',[1]),
                          ('violations',[1]),('bufferAccesses',[1]),('derivedChanges',[])]:
            with self.subTest(key=key),self.assertRaises(AssertionError):
                rows=self.results();rows[0][key]=value;validate_results(rows)
        with self.assertRaises(AssertionError):validate_results(self.results()[:2])
        for messages in ([],[dict(kind='autoiso',transferredSourceIds=[1]),dict(kind='arithmetic',transferredSourceIds=[])]):
            with self.assertRaises(AssertionError):
                rows=self.results();rows[1]['workerMessages']=messages;validate_results(rows)

    def test_missing_or_ineffective_positive_control_fails(self):
        controls=dict(guards=[dict(name=n,blocked=True,sourceUnchanged=True) for n in ('index','set','subarray','callback-array')],
                      detach=dict(readThrows=True,methodWriteThrows=True,transferredOwnerUnchanged=True))
        validate_controls(controls)
        for key in ('blocked','sourceUnchanged'):
            with self.assertRaises(AssertionError):
                broken=copy.deepcopy(controls);broken['guards'][0][key]=False;validate_controls(broken)
        with self.assertRaises(AssertionError):validate_controls(dict(guards=[],detach=controls['detach']))
