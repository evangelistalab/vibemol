"""Release metadata exception: exact paths/count/value pair, immutable scope and expiry."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/e2e'))
import release_version_mapping as mapping
from characterize import first_difference


def small_captures():
    return {str(i):dict(session=dict(appVersion='0.9.5',preset=dict(appVersion='0.9.5')))
            for i in range(102)}


class ReleaseVersionProjection(unittest.TestCase):
    def test_real_golden_maps_exactly204_full_path_leaves_without_mutating_it(self):
        golden=json.loads(gzip.decompress((ROOT/'tests/baselines/characterize.json.gz').read_bytes()))['captures']
        original=json.dumps(golden,sort_keys=True)
        projected=mapping.map_metadata(golden)
        self.assertEqual(json.dumps(golden,sort_keys=True),original)
        self.assertEqual(sum(c['session']['appVersion']=='0.10.0' for c in projected.values()),102)
        self.assertEqual(sum(c['session']['preset']['appVersion']=='0.10.0' for c in projected.values()),102)
        for c in projected.values():
            c['session']['appVersion']='0.9.5';c['session']['preset']['appVersion']='0.9.5'
        self.assertEqual(json.dumps(projected,sort_keys=True),original)

    def test_similar_field_names_and_different_paths_are_never_mapped(self):
        captures=small_captures()
        for c in captures.values():
            c['appVersion']='0.9.5';c['version']='0.9.5'
            c['session']['other']={'appVersion':'0.9.5'}
            c['session']['preset']['meta']={'appVersion':'0.9.5','version':'0.9.5'}
        result=mapping.map_metadata(captures)
        for c in result.values():
            self.assertEqual(c['appVersion'],'0.9.5');self.assertEqual(c['version'],'0.9.5')
            self.assertEqual(c['session']['other']['appVersion'],'0.9.5')
            self.assertEqual(c['session']['preset']['meta'],{'appVersion':'0.9.5','version':'0.9.5'})

    def test203_is_a_stop(self):
        captures=small_captures();del captures['0']['session']['appVersion']
        with self.assertRaises(AssertionError):mapping.map_metadata(captures)

    def test205_is_a_stop(self):
        captures=small_captures();captures['extra']={'session':{'appVersion':'0.9.5','preset':{}}}
        with self.assertRaises(AssertionError):mapping.map_metadata(captures)

    def test_wrong_source_value_or_type_is_a_stop(self):
        for value in ['0.9.4','0.10.0',True,1,None]:
            captures=small_captures();captures['0']['session']['preset']['appVersion']=value
            with self.subTest(value=value),self.assertRaises(AssertionError):mapping.map_metadata(captures)

    def test_actual_future_version_wrong_type_or_other_residual_still_fails(self):
        expected=mapping.map_metadata(small_captures())
        for path,value in [('appVersion','0.10.1'),('appVersion',10),('unapproved','new')]:
            actual=copy.deepcopy(expected)
            if path=='unapproved':actual['0']['session']['unapproved']=value
            else:actual['0']['session'][path]=value
            self.assertIsNotNone(first_difference(expected,actual))

    def test_new0_10_goldens_cannot_keep_using_this_exception(self):
        captures=mapping.map_metadata(small_captures())
        with self.assertRaises(AssertionError):mapping.map_metadata(captures)


class ReleaseVersionScope(unittest.TestCase):
    def invoke(self,*,future_tree=False,shallow=False,second_creation=False,bad_contract=False,
               declared='0.10.0',bad_golden=False,changed_consumer=False,behavioral_read=False,
               absent=False,foreign_root=False):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();module_path=root/'tests/e2e/release_version_mapping.py';module_path.parent.mkdir(parents=True)
            shutil.copy2(mapping.__file__,module_path)
            contract=root/mapping.CONTRACT_PATH;contract.parent.mkdir(parents=True,exist_ok=True)
            value=copy.deepcopy(mapping.FIXED_CONTRACT)
            if bad_contract:value['paths']=[['appVersion']]
            if not absent:contract.write_text(json.dumps(value))
            version=root/mapping.APP_VERSION_PATH;version.parent.mkdir(parents=True,exist_ok=True)
            version.write_text("const APP_VERSION = '"+declared+"';")
            golden=root/'tests/baselines/characterize.json.gz'
            golden.write_bytes((ROOT/'tests/baselines/characterize.json.gz').read_bytes())
            if bad_golden:golden.write_bytes(b'changed'+golden.read_bytes())
            audit=json.loads((ROOT/mapping.AUDIT_PATH).read_text())
            for item in audit['inventory']:
                target=root/item['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/item['path'],target)
            if behavioral_read:audit['readsOfSavedAppVersionAffectBehavior']=True
            target=root/mapping.AUDIT_PATH;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(audit))
            if changed_consumer:
                p=root/'assets/app/js/preset.js';p.write_text(p.read_text()+'\n// changed after audit\n')
            add='a'*40;tree='b'*40
            def git(args,**kwargs):
                self.assertEqual(kwargs['cwd'],root)
                if args[1:]==['rev-parse','--is-shallow-repository']:return 'true\n' if shallow else 'false\n'
                if args[1:]==['log','--diff-filter=A','--format=%H','--',mapping.CONTRACT_PATH]:
                    return add+'\n'+('d'*40+'\n' if second_creation else '')
                if args[1:]==['rev-parse','HEAD^{tree}']:return ('c'*40 if future_tree else tree)+'\n'
                if args[1:]==['rev-parse',add+'^{tree}']:return tree+'\n'
                self.fail(args)
            captures=small_captures()
            with patch.object(mapping,'__file__',str(module_path)),patch.object(mapping.subprocess,'check_output',side_effect=git):
                return mapping.release_expectations(captures,root/'foreign-source' if foreign_root else root,golden)

    def test_same_immutable_release_tree_is_accepted_including_pure_merge(self):
        projected=self.invoke()
        self.assertEqual(projected['0']['session']['appVersion'],'0.10.0')

    def test_later_feature_tree_cannot_reuse_the_exception(self):
        with self.assertRaises(AssertionError) as error:self.invoke(future_tree=True)
        self.assertIn('actualTree',str(error.exception));self.assertIn('c'*40,str(error.exception))

    def test_shallow_history_and_readding_the_file_are_rejected(self):
        for option in ['shallow','second_creation']:
            with self.subTest(option=option),self.assertRaises(AssertionError) as error:self.invoke(**{option:True})
            self.assertIn('actualShallowRepository' if option=='shallow' else 'actualCreationCommitCount',str(error.exception))

    def test_changed_contract_or_golden_are_rejected(self):
        for option in ['bad_contract','bad_golden']:
            with self.subTest(option=option),self.assertRaises(AssertionError) as error:self.invoke(**{option:True})
            self.assertIn('paths' if option=='bad_contract' else 'actualGoldenSha256',str(error.exception))

    def test_future_declared_release_is_rejected(self):
        with self.assertRaises(AssertionError) as error:self.invoke(declared='0.10.1')
        self.assertIn("'actualDeclaredVersion': '0.10.1'",str(error.exception))

    def test_new_behavioral_consumer_or_changed_audited_source_is_rejected(self):
        for option in ['behavioral_read','changed_consumer']:
            with self.subTest(option=option),self.assertRaises(AssertionError) as error:self.invoke(**{option:True})
            self.assertIn('actualBehavioralReads' if option=='behavioral_read' else 'actualAuditedSourceHashes',str(error.exception))

    def test_removing_the_contract_expires_the_exception(self):
        self.assertEqual(self.invoke(absent=True)['0']['session']['appVersion'],'0.9.5')

    def test_other_source_roots_receive_no_exception(self):
        self.assertEqual(self.invoke(foreign_root=True)['0']['session']['appVersion'],'0.9.5')


class AccessibilityReleaseScope(unittest.TestCase):
    def invoke(self, *, changed=None, future=False, readded=False, bad_scope=False):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);path=root/mapping.HARNESS_SCOPE_PATH;path.parent.mkdir(parents=True)
            scope=copy.deepcopy(mapping.HARNESS_SCOPE)
            if bad_scope:scope['diagnosticRun']=0
            path.write_text(json.dumps(scope))
            creation='e'*40;tree='f'*40
            def git(*args):
                if args==('log','--diff-filter=A','--format=%H','--',mapping.HARNESS_SCOPE_PATH):
                    return creation+'\n'+('a'*40 if readded else '')
                if args==('rev-parse',creation+'^{tree}'):return tree
                if args==('diff','--name-only',mapping.HARNESS_SCOPE['releaseHead'],'HEAD'):
                    return '\n'.join(changed or ['tests/e2e/accessibility.py',mapping.HARNESS_SCOPE_PATH])
                self.fail(args)
            mapping.authorized_release_tree(root,git,'b'*40 if future else tree,mapping.HARNESS_SCOPE['releaseTree'])

    def test_one_immutable_authorized_harness_tree_and_pure_merge(self):
        self.invoke()

    def test_later_harness_or_feature_commit_cannot_reuse_it(self):
        with self.assertRaises(AssertionError):self.invoke(future=True)

    def test_production_or_golden_change_is_rejected(self):
        for path in ['assets/app/js/app.js','src/styles/tokens.css','index.html','tests/baselines/characterize.json.gz']:
            with self.subTest(path=path),self.assertRaises(AssertionError):self.invoke(changed=[path])

    def test_readding_or_editing_scope_cannot_authorize_another_tree(self):
        for option in ['readded','bad_scope']:
            with self.subTest(option=option),self.assertRaises(AssertionError):self.invoke(**{option:True})


if __name__=='__main__':unittest.main()
