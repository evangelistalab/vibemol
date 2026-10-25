import ast
import copy
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock

ROOT=Path(__file__).resolve().parents[2]
FILE=ROOT/'tests/e2e/coordinates_region_diagnostic.py'


def classes():
    tree=ast.parse(FILE.read_text())
    selected=ast.Module(body=[n for n in tree.body if isinstance(n,ast.ClassDef) and n.name in ['Assertions','Locator']],type_ignores=[])
    env=dict(ast=ast,inspect=__import__('inspect'),HERE=ROOT/'tests/e2e',p=types.SimpleNamespace(write_failure_artifacts=Mock()),OUT=Path('/tmp'))
    exec(compile(selected,str(FILE),'exec'),env);return env


class CoordinatesContinuationTests(unittest.TestCase):
    def test_assert_observers_strip_to_exact_original_ast(self):
        env=classes();source=(ROOT/'tests/e2e/mode_consistency.py').read_text()
        original=ast.parse(source);instrumented=env['Assertions'](source).visit(copy.deepcopy(original))
        class Strip(ast.NodeTransformer):
            def visit_Assert(self,node):node.test=node.test.args[0];return node
        self.assertEqual(ast.dump(Strip().visit(instrumented),include_attributes=False),ast.dump(original,include_attributes=False))
    def proxy(self,state,selector='#coordsContent row',error=None):
        env=classes();env['hit_state']=lambda _:state
        raw=Mock();error=error or TimeoutError('original native failure');raw.click.side_effect=error
        probe=types.SimpleNamespace(failures=[],bypasses=[],checks=[],case='workbench',page=Mock(),emit=Mock())
        return env['Locator'](raw,selector,probe),raw,probe,error
    def test_known_card_collision_is_failed_then_explicitly_bypassed(self):
        state=dict(targetVisible=True,targetEnabled=True,targetOwnsHit=False,cardOwnsHit=True,interceptorId='editSelectionPosition')
        proxy,raw,probe,error=self.proxy(state);proxy.click()
        self.assertEqual(len(probe.failures),1);self.assertEqual(len(probe.bypasses),1)
        self.assertFalse(probe.bypasses[0]['nativeCoverage'])
        raw.click.assert_called_once_with();raw.evaluate.assert_called_once_with('el=>el.click()')
    def test_other_interceptor_is_not_repaired(self):
        proxy,raw,probe,error=self.proxy(dict(targetVisible=True,targetEnabled=True,targetOwnsHit=False,cardOwnsHit=False,interceptorId='other'))
        with self.assertRaises(TimeoutError) as raised:proxy.click()
        self.assertIs(raised.exception,error);raw.evaluate.assert_not_called();self.assertEqual(probe.bypasses,[])
    def test_unrelated_selector_failure_is_not_repaired(self):
        proxy,raw,probe,error=self.proxy({},selector='#unrelated')
        with self.assertRaises(TimeoutError):proxy.click()
        raw.evaluate.assert_not_called();self.assertEqual(probe.bypasses,[])


if __name__=='__main__':unittest.main()
