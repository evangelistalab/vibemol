"""Pure checks for the runtime census; never trust a stored `passed` flag."""
import json


def exact(left, right):
    # Keep the PR36 canonical-JSON rule, including true != 1.
    return json.dumps(left,sort_keys=True,separators=(',',':')) == json.dumps(right,sort_keys=True,separators=(',',':'))


def at(value, path):
    for key in path:
        value = value[int(key) if isinstance(value,list) else key]
    return value


def check(name, actual, expected):
    return dict(check=name,actual=actual,expected=expected,passed=exact(actual,expected))


def composition(report):
    """Exact identities prevent a disappeared pair from looking like zero bugs."""
    return {
        'appearanceDom':[{key:row.get(key) for key in ['key','type','hidden','disabled']} for row in report['inventory']['appearanceDom']],
        'editorDom':[{key:row.get(key) for key in ['key','type','hidden','disabled']} for row in report['inventory']['editorDom']],
        'original':[{key:row.get(key) for key in ['key','owner','connected','hidden','disabled']} for row in report['inventory']['original']],
        'editor':[{key:row.get(key) for key in ['id','owner','connected','hidden','disabled','reads']} for row in report['inventory']['editor']],
        'pairs':sorted([dict(ids=row['ids'],path=row['path'],phase=row['phase']) for row in report['pairs']],key=lambda row:(row['ids'],row['phase'])),
        'scopeAsymmetries':sorted([dict(ids=row['ids'],path=row['path'],phase=row['phase']) for row in report['scopeAsymmetries']],key=lambda row:(row['ids'],row['phase'])),
    }


def pair_checks(row):
    left,right = row['writes']
    ids = row['ids']
    checks = [check('same writer and typed request',left['trace'],right['trace']),
              check('writer observed',bool(left['trace']),True),
              check('complete resulting settings',left['settings'],right['settings'])]
    for id_,write in zip(ids,row['writes']):
        checks.append(check(id_+' peer readback',write['controls'][ids[0]],write['controls'][ids[1]]))
        value=at(write['settings'],row['path'])
        # Named preset controls display the reference id, not the full object.
        if row['path']==['appearance.references','styleRef']:
            value=value['id']
        checks.append(check(id_+' requested/applied',value,row['requested']))
    return checks


def scope_checks(row):
    checks=[]
    for id_,write,normalized,defaults in zip(row['ids'],row['writes'],row['normalizedRequests'],[False,True]):
        first=write['trace'][0] if write['trace'] else {'owner':None,'args':[{},None,None]}
        checks.extend([
            check(id_+' scope owner',first['owner'],'editSurfaceStyle'),
            check(id_+' requested key',sorted(first['args'][0]),row['path']),
            check(id_+' scope and phase',first['args'][1:],[row['phase'],defaults]),
            # The native opacity field sends text; the shared normalizer is the
            # explicit text->Number boundary, not a tolerance in exact().
            check(id_+' normalized request',at(normalized,row['path']),row['requested']),
        ])
    return checks


def evaluate(report, expected):
    checks=[check('runtime composition',composition(report),expected),check('page errors',report['pageerrors'],[])]
    for row in report['pairs']:
        checks.extend(pair_checks(row))
    for row in report['scopeAsymmetries']:
        checks.extend(scope_checks(row))
    return dict(passed=all(row['passed'] for row in checks),checks=checks)
