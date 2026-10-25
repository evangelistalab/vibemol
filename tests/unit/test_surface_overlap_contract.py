import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/e2e'))
import surface_overlap_contract as contract


class SurfaceOverlapContract(unittest.TestCase):
    def setUp(self):
        self.authority=json.loads(contract.AUTHORITY.read_text())
        self.baseline=dict(acceptedCiFailures=[],growthRequiresHumanAuthorization=True,entries=copy.deepcopy(self.authority['initialEntries']))

    def cases(self,keys):
        return [dict(context='fixture',collisions=[dict(hitSurface=k[1],surface=k[2],targetSelector=k[3],selectorMatches=1)for k in keys])]

    def test_initial_authorization_is_nine_explicit_entries_and_84_directional_targets(self):
        keys=contract.validate_baseline(self.baseline)
        self.assertEqual(len(self.baseline['entries']),9)
        live=json.loads(contract.BASELINE.read_text())
        approved={tuple(row)for row in self.authority['approvedSignatures']}
        self.assertTrue(keys<approved)
        self.assertTrue(contract.validate_baseline(live)<=approved)
        self.assertEqual(len(approved),112)
        self.assertEqual(len({row[0]for row in approved}),12)
        self.assertEqual(len(approved-keys),28)
        self.assertFalse(live['surfaceCoverageComplete'])
        self.assertEqual(len(keys),84)
        self.assertEqual({e['classification']for e in self.baseline['entries']},{'suspected defect'})
        self.assertTrue(all(e['trackingIssue']for e in self.baseline['entries']))
        self.assertTrue(contract.evaluate(self.cases(keys),self.baseline)['passed'])

    def test_missing_pairs_or_targets_are_not_required_to_fire(self):
        keys=contract.signatures(self.baseline)
        self.assertTrue(contract.evaluate(self.cases([]),self.baseline)['passed'])
        self.assertTrue(contract.evaluate(self.cases(list(keys)[:3]),self.baseline)['passed'])

    def test_different_target_in_same_pair_fails(self):
        key=next(iter(contract.signatures(self.baseline)))
        changed=(*key[:3],'#anotherInteractiveControl')
        result=contract.evaluate(self.cases([changed]),self.baseline)
        self.assertFalse(result['passed']);self.assertEqual(len(result['unexpected']),1)

    def test_other_nine_cannot_replace_the_known_nine(self):
        keys=list(contract.signatures(self.baseline))[:9]
        altered=[(k[0],k[1],k[2],'#unapproved-'+str(i))for i,k in enumerate(keys)]
        self.assertFalse(contract.evaluate(self.cases(altered),self.baseline)['passed'])

    def test_direction_and_surface_are_part_of_identity(self):
        key=next(k for k in contract.signatures(self.baseline)if k[1]=='toolbar')
        for changed in [(key[0],key[2],key[1],key[3]),(key[0],'otherSurface',key[2],key[3])]:
            self.assertFalse(contract.evaluate(self.cases([changed]),self.baseline)['passed'])

    def test_ambiguous_control_never_matches(self):
        case=self.cases([next(iter(contract.signatures(self.baseline)))])
        case[0]['collisions'][0]['selectorMatches']=2
        self.assertFalse(contract.evaluate(case,self.baseline)['passed'])

    def test_baseline_shrinks_freely(self):
        smaller=copy.deepcopy(self.baseline);smaller['entries'].pop()
        self.assertLess(len(contract.validate_baseline(smaller,predecessor=self.baseline)),84)
        empty={**self.baseline,'entries':[]}
        self.assertEqual(contract.validate_baseline(empty,predecessor=smaller),set())

    def test_readding_after_shrink_is_growth_and_fails(self):
        smaller=copy.deepcopy(self.baseline);smaller['entries'].pop()
        with self.assertRaises(AssertionError):contract.validate_baseline(self.baseline,predecessor=smaller)

    def test_new_target_in_baseline_cannot_authorize_itself(self):
        doc=copy.deepcopy(self.baseline);doc['entries'][0]['directions'][0]['targets'].append('#newTarget')
        with self.assertRaises(AssertionError):contract.validate_baseline(doc)
        authority=copy.deepcopy(self.authority)
        authority['approvedSignatures']=sorted(map(list,contract.signatures(doc)))
        authority['signatureSha256']=hashlib.sha256(json.dumps(authority['approvedSignatures'],separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
        with self.assertRaises(AssertionError):contract.validate_baseline(doc,authority=authority)

    def test_wildcard_or_positional_controls_cannot_be_baselined(self):
        for selector in ['button','*',':nth-child(2)']:
            doc=copy.deepcopy(self.baseline);doc['entries'][0]['directions'][0]['targets'].append(selector)
            with self.assertRaises(AssertionError):contract.validate_baseline(doc)

    def test_latent_baseline_is_never_an_accepted_suite_failure(self):
        self.assertEqual(self.baseline['acceptedCiFailures'],[])
        self.assertTrue(all(e['acceptedCiFailure']is False for e in self.baseline['entries']))
        doc=copy.deepcopy(self.baseline);doc['acceptedCiFailures']=['floating_panels.py']
        with self.assertRaises(AssertionError):contract.validate_baseline(doc)


if __name__=='__main__':unittest.main()
