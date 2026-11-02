"""Risk-first Testing bridges; existing native suites remain unchanged."""
import json
from pathlib import Path
import premerge as p
from edit_api import METHANE, ready
from surface_shadows import settle
from checkpoint_contract import require_phase_counts


def run_matrix(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    rows = []

    def check(case, actual, expected):
        row = dict(case=case, actual=actual, expected=expected)
        print('[edit-testing-case] ' + json.dumps(row), flush=True)
        assert actual == expected, row
        rows.append(row)

    with p.run_http_server(p.ROOT) as url, p.sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
        try:
            for legacy in (False, True):
                for dark in (False, True):
                    name = ('legacy' if legacy else 'workbench') + ('-dark' if dark else '-light')
                    context = browser.new_context(viewport={'width': 1512, 'height': 1000}, color_scheme='dark' if dark else 'light')
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('console', lambda message: print('[edit-testing-console] ' + message.text, flush=True) if message.text.startswith('[edit-testing-') else None)
                    try:
                        page.goto(url + '?appearanceStudy=1&qa=1' + ('&workspaceLab=0' if legacy else ''))
                        ready(page, '()=>!!window.VibeMolEdit', site='testing-adapters-startup')
                        assert p.load(page, [dict(name='bridge.xyz', text=METHANE)])['ok']
                        assert page.evaluate('()=>VibeMolEdit.enter()')['ok']
                        settle(page)
                        actual = page.evaluate('''()=>{const result=VibeMolTesting.setEditSelectionIndices([0,1]);return {count:result.count,selection:VibeMolEdit.getSelection().value.indices};}''')
                        check(name + ' valid selection', actual, dict(count=2, selection=[0, 1]))
                        rejected = page.evaluate('''()=>{
                          const snapshot=()=>JSON.stringify({volume:VibeMolStructure.exportActive().volume,selection:VibeMolEdit.getSelection(),ui:VibeMolTesting.getEditBuildState(),context:VibeMolEdit.context()});
                          const rows=[];
                          for(const [request,expected]of [[null,'INVALID_REQUEST'],[[0,999],'ATOM_NOT_FOUND'],[[-1],'INVALID_REQUEST'],[[.5],'INVALID_REQUEST'],[['0'],'INVALID_REQUEST'],[[0,0],'DUPLICATE_REFERENCE'],[{},'INVALID_REQUEST'],[[true],'INVALID_REQUEST'],[[NaN],'INVALID_REQUEST']]){
                            const before=snapshot();let code=null;
                            try{VibeMolTesting.setEditSelectionIndices(request);}catch(error){code=error.editApi?.code||error.message;}
                            rows.push({request,expected,code,unchanged:before===snapshot()});
                          }
                          return rows;
                        }''')
                        for i, row in enumerate(rejected):
                            check(name + ' invalid selection ' + str(i), dict(code=row['code'], unchanged=row['unchanged']), dict(code=row['expected'], unchanged=True))
                        rejected = page.evaluate('''()=>{
                          const snapshot=()=>JSON.stringify({volume:VibeMolStructure.exportActive().volume,selection:VibeMolEdit.getSelection(),context:VibeMolEdit.context()});
                          return [[[0,1,{selectionAfter:[999]}],'INVALID_REQUEST'],[[0,.5,{}],'INVALID_REQUEST'],[[1,0,{}],'NOT_TERMINAL_H']].map(([args,expected])=>{
                            const before=snapshot();let code=null;try{VibeMolTesting.replaceGestureTerminalHydrogen(...args);}catch(error){code=error.editApi?.code||error.message;}
                            return {code,expected,unchanged:before===snapshot()};
                          });
                        }''')
                        for i, row in enumerate(rejected):
                            check(name + ' invalid replacement ' + str(i), dict(code=row['code'], unchanged=row['unchanged']), dict(code=row['expected'], unchanged=True))
                        actual = page.evaluate('''()=>{
                          const oldId=VibeMolEdit.context().value.atoms[1].id;
                          const result=VibeMolTesting.replaceGestureTerminalHydrogen(0,1,{elementZ:6});
                          const c=VibeMolEdit.context().value;
                          return {attached:result.attached,removed:!c.atoms.some(a=>a.id===oldId),carbons:c.atoms.filter(a=>a.element==='C').length,selection:VibeMolEdit.getSelection().value.indices,pending:c.interactions.pendingBuildOperator};
                        }''')
                        check(name + ' native replacement lifecycle', actual, dict(attached=True, removed=True, carbons=2, selection=[], pending=True))
                        actual = page.evaluate('''()=>{
                          const snapshot=()=>JSON.stringify({volume:VibeMolStructure.exportActive().volume,selection:VibeMolEdit.getSelection(),context:VibeMolEdit.context()});
                          const before=snapshot();let code=null;try{VibeMolTesting.setEditSelectionIndices([0,999]);}catch(error){code=error.editApi?.code||error.message;}
                          return {code,unchanged:before===snapshot(),pending:VibeMolEdit.context().value.interactions.pendingBuildOperator};
                        }''')
                        check(name + ' reject before pending cleanup', actual, dict(code='ATOM_NOT_FOUND', unchanged=True, pending=True))
                        actual = page.evaluate('''()=>{const result=VibeMolTesting.setEditSelectionIndices([0]);return {count:result.count,selection:VibeMolEdit.getSelection().value.indices,pending:VibeMolEdit.context().value.interactions.pendingBuildOperator};}''')
                        check(name + ' finalize then re-resolve identities', actual, dict(count=1, selection=[0], pending=False))
                        page.locator('#modeDisplayBtn').click()
                        settle(page)
                        actual = page.evaluate('''()=>{let code=null;try{VibeMolTesting.setEditSelectionIndices([0]);}catch(error){code=error.editApi?.code||error.message;}return code;}''')
                        check(name + ' mode validation', actual, 'MODE_REQUIRED')
                        actual = page.evaluate('''()=>{const result=VibeMolTesting.setEditSelectionIndices([]);return {count:result.count,selection:VibeMolEdit.getSelection().value.indices};}''')
                        check(name + ' cross-mode empty cleanup', actual, dict(count=0, selection=[]))
                        assert p.load(page, [dict(name='trajectory.xyz', text=METHANE + METHANE)])['ok']
                        assert page.evaluate('()=>VibeMolEdit.enter()')['ok']
                        actual = page.evaluate('''()=>{
                          const snapshot=()=>JSON.stringify({volume:VibeMolStructure.exportActive().volume,selection:VibeMolEdit.getSelection(),context:VibeMolEdit.context()});
                          const before=snapshot();let code=null;
                          try{VibeMolTesting.replaceGestureTerminalHydrogen(0,1,{elementZ:6});}catch(error){code=error.editApi?.code||error.message;}
                          return {source:VibeMolEdit.context().value.source,code,unchanged:before===snapshot()};
                        }''')
                        check(name + ' scientific source cannot enter native replacement', actual, dict(source=dict(kind='xyz', hasGrid=False, trajectory=True, vibration=False, molden=False, twoComponent=False, staticStructure=False), code='SOURCE_NOT_EDITABLE', unchanged=True))
                        check(name + ' page errors', errors, [])
                    except Exception:
                        p.write_failure_artifacts(page, output, name, errors, [])
                        raise
                    finally:
                        context.close()
                    check(name + ' retired contexts', len(browser.contexts), 0)
        finally:
            browser.close()
    counts = {'edit-testing-case': len(rows)}
    require_phase_counts(counts, 'tests/e2e/premerge.py', 'edit-testing-case')
    (output / 'summary.json').write_text(json.dumps(dict(passed=True, checkpointCounts=counts, cases=rows), indent=2) + '\n')


if __name__ == '__main__':
    run_matrix(p.ARTIFACTS / 'edit-testing-adapters')
