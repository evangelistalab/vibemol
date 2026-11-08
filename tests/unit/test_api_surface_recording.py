"""A declared recording can remove only the one named API member, in all102 captures."""
import contextlib
import copy
import io
import gzip
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/e2e'))
from api_surface_recording import declaration, expected_removal, verify_captures, exact_difference, require_mode, compare


class DeclaredApiDelta(unittest.TestCase):
    def setUp(self):
        self.spec=dict(schemaVersion=1,baseCommit='a'*40,baselineGzipSha256='b'*64,captures=102,
            delta=dict(operation='remove-api-member',namespace='VibeMolExample',member='retired'),authority='Synthetic test')
        self.old={f'capture-{i}':dict(api={'VibeMolExample':['first','retired','last']},
            session=dict(appVersion='0.10.1'),floatValue=1.0,flag=True)for i in range(102)}
        self.new,_=expected_removal(self.old,self.spec)

    def verify(self,actual=None,spec=None):
        with contextlib.redirect_stdout(io.StringIO()):
            return verify_captures(self.old,self.new if actual is None else actual,self.spec if spec is None else spec)

    def test_exact_delta_and_input_immutability(self):
        before=copy.deepcopy(self.old)
        r=self.verify()
        self.assertEqual(r['actualRemovals'],102)
        self.assertTrue(r['zeroOtherChanges'])
        self.assertEqual(self.old,before)

    def test_declaration_cannot_request_an_addition_rename_or_arbitrary_path(self):
        for delta in [dict(operation='add-api-member',namespace='VibeMolExample',member='retired'),
                      dict(operation='rename-api-member',namespace='VibeMolExample',member='retired'),
                      dict(operation='remove-api-member',namespace='session',member='appVersion'),
                      dict(operation='remove-api-member',namespace='VibeMolExample',member='retired',otherPath='session')]:
            with self.subTest(delta=delta),self.assertRaises(AssertionError):declaration({**self.spec,'delta':delta})

    def test_extra_declaration_keys_cannot_define_another_exception(self):
        with self.assertRaises(AssertionError):declaration({**self.spec,'ignoreFloats':True})

    def test_wrong_capture_count_is_rejected(self):
        for count in [101,103,102.0]:
            with self.subTest(count=count),self.assertRaises(AssertionError):declaration({**self.spec,'captures':count})

    def test_member_must_exist_once_in_every_old_capture(self):
        for members in [['first','last'],['first','retired','retired','last']]:
            old=copy.deepcopy(self.old);old['capture-0']['api']['VibeMolExample']=members
            with self.subTest(members=members),self.assertRaises(AssertionError):expected_removal(old,self.spec)

    def test_101_or_103_changes_cannot_become_102_by_counting_only_matches(self):
        missing=copy.deepcopy(self.new);missing['capture-0']=copy.deepcopy(self.old['capture-0'])
        extra=copy.deepcopy(self.new);extra['capture-102']=copy.deepcopy(self.new['capture-0'])
        for actual in [missing,extra]:
            with self.subTest(),self.assertRaises(AssertionError):self.verify(actual)

    def test_different_member_removal_fails(self):
        actual=copy.deepcopy(self.new);actual['capture-0']['api']['VibeMolExample']=['retired','last']
        with self.assertRaises(AssertionError):self.verify(actual)

    def test_other_api_addition_removal_or_reorder_fails(self):
        for members in [['first','last','added'],['first'],['last','first']]:
            actual=copy.deepcopy(self.new);actual['capture-0']['api']['VibeMolExample']=members
            with self.subTest(members=members),self.assertRaises(AssertionError):self.verify(actual)

    def test_new_removed_or_altered_non_api_leaf_fails(self):
        for mutation in ['add','remove','version','float','type','boolean']:
            actual=copy.deepcopy(self.new);row=actual['capture-0']
            if mutation=='add':row['newLeaf']=0
            if mutation=='remove':del row['flag']
            if mutation=='version':row['session']['appVersion']='0.11.0'
            if mutation=='float':row['floatValue']=1.000000000001
            if mutation=='type':row['floatValue']=1
            if mutation=='boolean':row['flag']=1
            with self.subTest(mutation=mutation),self.assertRaises(AssertionError):self.verify(actual)

    def test_signed_zero_is_not_a_free_float_change(self):
        self.assertIsNotNone(exact_difference(0.0,-0.0))

    def test_capture_rename_is_not_a_removal(self):
        actual=copy.deepcopy(self.new);actual['renamed']=actual.pop('capture-0')
        with self.assertRaises(AssertionError):self.verify(actual)

    def test_mode_requires_exact_ci_branch_source_and_original_capture_conditions(self):
        commit='c'*40
        good=dict(ci='true',event='workflow_dispatch',head=commit,githubSha=commit,ref='refs/heads/ordinary-branch',
            updateBaseline=True,injectHarness=False,prepareFixtures=False,runs=2,matrixRunIndex=None,releaseTag=None,shallow='false')
        with contextlib.redirect_stdout(io.StringIO()):require_mode(good,commit)
        for key,value in dict(ci=None,event='push',head='d'*40,githubSha='d'*40,ref='refs/tags/v0.10.1',
                              updateBaseline=False,injectHarness=True,prepareFixtures=True,runs=3,matrixRunIndex=1,
                              releaseTag='v0.10.1',shallow='true').items():
            with self.subTest(key=key),contextlib.redirect_stdout(io.StringIO()),self.assertRaises(AssertionError):
                require_mode({**good,key:value},commit)

    def comparison_fixture(self,folder):
        commit='c'*40
        spec_path=folder/'declaration.json';spec_path.write_text(json.dumps(self.spec))
        for index in (1,2):
            artifact=folder/f'characterization-baseline-{index}';artifact.mkdir()
            proof=dict(status='passed',recordingMode='declared-api-removal',commit=commit,declaration=self.spec,allArchivedBlobsMatchCommit=True)
            (artifact/'api-baseline-source.json').write_text(json.dumps(proof))
            golden=dict(baseline=dict(commit=commit,tag='declared-api-removal',
                captureProvenance=dict(os='Linux',ci=dict(provider='GitHub Actions'))),captures=self.new)
            raw=json.dumps(golden).encode();(artifact/'characterize.json.gz').write_bytes(gzip.compress(raw))
            (artifact/'characterize-summary.json').write_text(json.dumps(dict(api=self.new['capture-0']['api'],goldenSha256=hashlib.sha256(raw).hexdigest())))
            for run in (1,2):(artifact/f'characterize-run-{run}.json').write_text(json.dumps(self.new))
        return spec_path,commit

    def test_four_independent_raw_captures_and_golden_are_all_verified(self):
        with tempfile.TemporaryDirectory() as name:
            folder=Path(name);spec,commit=self.comparison_fixture(folder)
            with patch('api_surface_recording.read_previous',return_value=self.old),contextlib.redirect_stdout(io.StringIO()):
                report=compare(folder,folder,spec,commit)
            self.assertEqual(len(report['records']),4)
            self.assertEqual(report['residualDifferences'],0)

    def test_one_wrong_worker_cannot_hide_behind_the_other_workers_golden(self):
        with tempfile.TemporaryDirectory() as name:
            folder=Path(name);spec,commit=self.comparison_fixture(folder)
            path=folder/'characterization-baseline-2/characterize-run-2.json'
            actual=copy.deepcopy(self.new);actual['capture-0']['flag']=False;path.write_text(json.dumps(actual))
            with patch('api_surface_recording.read_previous',return_value=self.old),contextlib.redirect_stdout(io.StringIO()),self.assertRaises(AssertionError):
                compare(folder,folder,spec,commit)

    def test_equal_values_with_different_raw_serialization_do_not_pass_exact_repeat(self):
        with tempfile.TemporaryDirectory() as name:
            folder=Path(name);spec,commit=self.comparison_fixture(folder)
            (folder/'characterization-baseline-2/characterize-run-2.json').write_text(json.dumps(self.new,indent=2))
            with patch('api_surface_recording.read_previous',return_value=self.old),contextlib.redirect_stdout(io.StringIO()),self.assertRaisesRegex(AssertionError,'serializations'):
                compare(folder,folder,spec,commit)



class DeclaredApiDeltaV2(unittest.TestCase):
    def setUp(self):
        self.old={str(i):dict(api={'VibeMolTesting':['keep','retireA','retireB']},session={'appVersion':'0.10.1'},number=1.0) for i in range(102)}
        self.spec=dict(schemaVersion=2,baseCommit='a'*40,baselineGzipSha256='b'*64,captures=102,authority='Reviewed synthetic surface',delta=[
            dict(operation='add-api-namespace',namespace='VibeMolEdit',members=['applyBuild','resolveSelection']),
            dict(operation='remove-api-member',namespace='VibeMolTesting',member='retireA'),
            dict(operation='remove-api-member',namespace='VibeMolTesting',member='retireB')])
        self.new,_=expected_removal(self.old,self.spec)

    def verify(self,value):
        with contextlib.redirect_stdout(io.StringIO()):return verify_captures(self.old,value,self.spec)

    def test_exact_enumeration_and_counts(self):
        r=self.verify(self.new)
        self.assertEqual((r['actualRemovals'],r['actualNamespaceAdditions']),(204,102))
        self.assertEqual(self.old['0']['api']['VibeMolTesting'],['keep','retireA','retireB'])

    def test_wrong_new_namespace_member_missing_capture_and_other_leaf_all_fail(self):
        for field in ('extra-member','missing-member','wrong-member','one-capture','old-retirement','other-leaf'):
            value=copy.deepcopy(self.new)
            if field=='extra-member':value['0']['api']['VibeMolEdit'].append('uncheckedSet')
            if field=='missing-member':value['0']['api']['VibeMolEdit'].pop()
            if field=='wrong-member':value['0']['api']['VibeMolEdit'][0]='other'
            if field=='one-capture':del value['0']['api']['VibeMolEdit']
            if field=='old-retirement':value['0']['api']['VibeMolTesting'].append('retireA')
            if field=='other-leaf':value['0']['number']=1.000000000001
            with self.subTest(field=field),self.assertRaises(AssertionError):self.verify(value)

    def test_scope_cannot_express_non_api_changes_or_ambiguous_members(self):
        cases=[{'operation':'set-leaf','path':['session','appVersion'],'value':'0.11'},
               {'operation':'add-api-namespace','namespace':'VibeMolEdit','members':['same','same']},
               {'operation':'add-api-namespace','namespace':'VibeMolEdit','members':['z','a']},
               {'operation':'remove-api-member','namespace':'VibeMolTesting','member':'retireA'},
               {'operation':'remove-api-member','namespace':'VibeMolEdit','member':'applyBuild'}]
        for delta in cases:
            spec=copy.deepcopy(self.spec);spec['delta'].append(delta)
            with self.subTest(delta=delta),self.assertRaises(AssertionError):declaration(spec)

    def test_v2_member_addition_is_enumerated_and_refuses_other_changes(self):
        spec=copy.deepcopy(self.spec);spec['delta']=[dict(operation='add-api-member',namespace='VibeMolTesting',member='zNew')]
        old=copy.deepcopy(self.old)
        for c in old.values():c['api']['VibeMolTesting'].sort()
        new,changes=expected_removal(old,spec)
        self.assertEqual(len(changes),102)
        with contextlib.redirect_stdout(io.StringIO()):r=verify_captures(old,new,spec)
        self.assertEqual(r['actualMemberAdditions'],102)
        new['0']['session']['appVersion']='other'
        with contextlib.redirect_stdout(io.StringIO()),self.assertRaises(AssertionError):verify_captures(old,new,spec)

    def test_namespace_must_be_absent_in_every_previous_capture(self):
        self.old['0']['api']['VibeMolEdit']=[]
        with self.assertRaises(AssertionError):expected_removal(self.old,self.spec)

class ConnectorDomDelta(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads((ROOT/'tests/baselines/connector-shell-delta.json').read_text())
        self.old = {str(i): {'dom': {'ids': ['a', 'z']}, 'value': 1.0} for i in range(102)}
        self.new = {str(i): {'dom': {'ids': ['a', 'connectorPilotButton', 'z']}, 'value': 1.0} for i in range(102)}

    def test_only_the_authorized_id_and_base_can_be_declared(self):
        for change in ({'captures': 101}, {'baseCommit': 'a'*40}, {'baselineGzipSha256': 'b'*64},
                       {'delta': [{'operation': 'add-dom-id', 'id': 'other'}]},
                       {'delta': self.spec['delta'] * 2}):
            with self.subTest(change=change), self.assertRaises(AssertionError):
                declaration({**self.spec, **change})

    def test_exact_one_per_capture(self):
        with contextlib.redirect_stdout(io.StringIO()):
            report = verify_captures(self.old, self.new, self.spec)
        self.assertEqual(report['actualDomIdAdditions'], 102)
        self.assertTrue(report['zeroOtherChanges'])
        self.assertEqual(self.old['0']['dom']['ids'], ['a', 'z'])
        self.assertEqual(report['changes'][0]['path'], ['dom', 'ids', 1])

    def test_missing_extra_renamed_reordered_and_other_leaves_fail(self):
        for ids in (['a', 'z'], ['a', 'connectorPilotButton', 'connectorPilotButton', 'z'],
                    ['a', 'connectorPilotButton', 'extra', 'z'], ['a', 'other', 'z'],
                    ['a', 'connectorPilotButton'], ['connectorPilotButton', 'a', 'z']):
            actual = copy.deepcopy(self.new)
            actual['0']['dom']['ids'] = ids
            with self.subTest(ids=ids), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(AssertionError):
                verify_captures(self.old, actual, self.spec)
        self.new['0']['value'] = 1.000000000001
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(AssertionError):
            verify_captures(self.old, self.new, self.spec)


if __name__=='__main__':unittest.main()
