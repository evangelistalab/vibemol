"""Validated product Edit API matrix; no existing native-click test is converted."""
import json
from collections import Counter
from math import dist
from pathlib import Path
import premerge as p
from surface_shadows import settle
from assertion_contract import deadline_diagnostics, wait_for_budget
from checkpoint_contract import require_phase_counts

COVERAGE = Counter()

def ready(page,predicate,*,arg=None,site='state',readback=None,expected=True):
 # Reuse the existing 30s readiness policy/180s ceiling and shared stall/wall
 # attribution; this is a functional guard, never a performance detector.
 actual=None
 try:
  with deadline_diagnostics(page,label='Edit API readiness: '+site,policy='resize-readiness',site='edit-api.'+site) as report:
   wait_for_budget(page,predicate,report,arg=arg)
 finally:
  try:actual=page.evaluate(readback or predicate,arg)
  except Exception as error:actual={'unavailable':str(error)}
  print('[edit-api-readiness] '+json.dumps(dict(site=site,predicate=predicate,actual=actual,expected=expected)),flush=True)

XYZ='3\nAPI\nC 0 0 0\nC 1.5 0 0\nH -1 0 0\n'
CARBON='1\nAPI\nC 0 0 0\n'
METHANE='5\nAPI\nC 0 0 0\nH 1 0 0\nH -1 0 0\nH 0 1 0\nH 0 0 1\n'

def compare(label,actual,expected,*,phase='edit-api'):
 print(f'[{phase}] '+json.dumps(dict(case=label,actual=actual,expected=expected)),flush=True)
 COVERAGE[phase] += 1
 assert actual==expected,dict(case=label,actual=actual,expected=expected)

def result(page,expression):
 row=page.evaluate('()=>'+expression)
 print('[edit-api-result] '+json.dumps(row),flush=True)
 compare('result-ok',row['ok'],True)
 return row

def catalog_molecule_sites(page):
 def check(label, actual, expected):
  compare(label, actual, expected, phase='edit-api-catalog-site')

 def call(method, request):
  return page.evaluate('([method, request]) => VibeMolEdit[method](request)', [method, request])

 def volume():
  return page.evaluate('()=>VibeMolStructure.exportActive().volume')

 ready(page, '''()=>VibeMolEdit.listBuildCatalog().value.some(entry =>
  entry.entryId === 'carbon-monoxide' && entry.attachModes.includes('coordinate'))''', site='co-catalog')
 assert p.load(page, [{'name':'iron.xyz', 'text':'1\nIron\nFe 0 0 0\n'}])['ok']
 assert call('enter', {'tool':'build'})['ok']
 context = page.evaluate('()=>VibeMolEdit.context().value')
 iron_id = context['atoms'][0]['id']
 catalog = page.evaluate('''()=>VibeMolEdit.listBuildCatalog().value
  .find(({entryId}) => entryId === 'carbon-monoxide')''')
 entry = {key:catalog[key] for key in ('entryId','entryKind')}
 target = dict(system={key:context[key] for key in ('systemId','fingerprint')},
               anchor=dict(kind='ids', ids=[iron_id]), bondOrder=1)
 initial = volume()
 query = call('listBuildSites', {**target, **entry})
 value = query.get('value', {})
 sites = value.get('sites', [])
 check('CO lists six octahedral Fe sites', dict(ok=query['ok'], kind=entry['entryKind'],
       geometry=value.get('geometryId'), anchor=value.get('anchorId'), indices=[site['index'] for site in sites],
       uniqueSiteIds=len({site['siteId'] for site in sites})),
       dict(ok=True, kind='molecule', geometry='octahedral', anchor=iron_id, indices=list(range(6)), uniqueSiteIds=6))

 fragment = {**target, 'entryId':'methyl'}
 implicit = call('listBuildSites', fragment)
 explicit = call('listBuildSites', {**fragment, 'entryKind':'fragment'})
 check('Fragments keep their default catalog kind', dict(ok=implicit['ok'], equal=implicit==explicit),
       dict(ok=True, equal=True))
 invalid = [
  ({**target, 'entryId':entry['entryId']}, 'CATALOG_NOT_FOUND'),
  ({**target, **entry, 'entryKind':'unknown'}, 'CATALOG_KIND'),
  ({**target, **entry, 'entryId':'benzene'}, 'ATTACH_POLICY_UNSUPPORTED'),
  ({**target, 'element':'C', 'entryKind':'molecule'}, 'INVALID_REQUEST'),
 ]
 rejected = [call('listBuildSites', request) for request, _ in invalid]
 check('Catalog site query rejects invalid payloads without mutations',
       dict(errors=[(result.get('error', {}).get('code'), result.get('mutation', {}).get('state')) for result in rejected],
            unchanged=volume()==initial),
       dict(errors=[(code, 'none') for _, code in invalid], unchanged=True))

 chosen = sites[4]
 request = {**target, **entry, 'direction':chosen['direction'], 'operation':'attachFragment',
            'attachPolicy':'append', 'hydrogens':'preserve', 'warnings':'reject'}
 preview = call('validateBuild', request)
 check('CO validation prepares two atoms and changes nothing', dict(ok=preview['ok'],
       mutation=preview['mutation']['state'], created=len(preview.get('value', {}).get('created', [])),
       removed=preview.get('value', {}).get('removed'), unchanged=volume()==initial),
       dict(ok=True, mutation='none', created=2, removed=[], unchanged=True))
 applied = call('applyBuild', request)
 after = volume()
 elements = {atom['id']:atom['Z'] for atom in after['atoms']}
 donor = next((atom for atom in after['atoms'] if atom['Z']==6), None)
 bonds = sorted((sorted([elements[bond['a']], elements[bond['b']]]), bond['order'], bond['style'])
                for bond in after['bonds'])
 operation = after['fragmentOps'][-1] if after['fragmentOps'] else {}
 check('CO attaches through carbon at the chosen site', dict(ok=applied['ok'],
       mutation=applied['mutation']['state'], matched=applied.get('requested')==applied.get('applied'),
       elements=sorted(elements.values()), bonds=bonds,
       donorAtSite=bool(donor and dist([donor[axis] for axis in 'xyz'], chosen['position']) < 1e-8),
       catalog={key:operation.get(key) for key in entry}, ironUnchanged=after['atoms'][0]==initial['atoms'][0]),
       dict(ok=True, mutation='applied', matched=True, elements=[6,8,26],
            bonds=[([6,8],3,'covalent'),([6,26],1,'metal-dative')], donorAtSite=True,
            catalog=entry, ironUnchanged=True))
 fresh = {key:applied['context'][key] for key in ('systemId','fingerprint')}
 updated = call('listBuildSites', {**target, **entry, 'system':fresh})
 open_sites = updated.get('value', {}).get('sites', [])
 check('CO occupies exactly the chosen site', dict(ok=updated['ok'], open=len(open_sites),
       chosenOpen=any(dist(site['position'], chosen['position']) < 1e-8 for site in open_sites)),
       dict(ok=True, open=5, chosenOpen=False))
 page.locator('#canvas').focus()
 page.keyboard.press('ControlOrMeta+z')
 check('Undo restores the pre-attachment structure', volume(), initial)


def run(page,url):
 page.add_init_script(Path(__file__).with_name('edit_api_probe.js').read_text())
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:print('[console] '+m.text,flush=True) if m.type in ('warning','error') else None)
 page.goto(url+'?appearanceStudy=1&qa=1');ready(page,'()=>!!(window.VibeMolEdit&&window.VibeMolEmbed)')
 def load(text=XYZ,files=None):
  compare('load',p.load(page,files or [{'name':'api.xyz','text':text}])['ok'],True)
  result(page,'VibeMolEdit.enter()');settle(page)
 def build(operation,**fields):
  row=page.evaluate('''request=>{const c=VibeMolEdit.context().value;return VibeMolEdit.applyBuild({system:{systemId:c.systemId,fingerprint:c.fingerprint},hydrogens:'preserve',warnings:'allow',...request})}''',dict(operation=operation,**fields))
  print('[edit-api-build] '+json.dumps(row),flush=True);compare('result-ok',row['ok'],True)
  compare('requested-applied-'+operation,row['requested'],row['applied']);return row
 ready(page,'()=>VibeMolEdit.listBuildCatalog().value.some(e=>e.entryId==="fusionphenyl")')
 load()
 negative=page.evaluate('''()=>{
  const context=VibeMolEdit.context().value,system={systemId:context.systemId,fingerprint:context.fingerprint},base={system,hydrogens:'preserve',warnings:'allow'};
  const anchor={kind:'labels',labels:['C1']},carbon={kind:'labels',labels:['C2']},hydrogen={kind:'labels',labels:['H1']};
  const atom={operation:'placeAtom',element:'O',position:[3,0,0]};
  const grow={operation:'growAtom',element:'C',anchor,direction:[1,0,0],bondOrder:1,attachPolicy:'append'};
  const cases=[
   [{...atom,element:'Qq'},'ELEMENT_UNKNOWN'],[{...atom,element:1.9},'ELEMENT_UNKNOWN'],[{...atom,position:[NaN,0,0]},'INVALID_COORDINATES'],
   [{...atom,position:[0,0]},'INVALID_COORDINATES'],[{...atom,extra:true},'INVALID_REQUEST'],[{...atom,system:'new',element:'Qq'},'ELEMENT_UNKNOWN'],
   [{...atom,operation:'unknown'},'INVALID_REQUEST'],[{...grow,direction:[0,0,0]},'INVALID_ORIENTATION'],[{...grow,direction:[Infinity,0,0]},'INVALID_COORDINATES'],
   ...[0,5,1.5,'1'].map(bondOrder=>[{...grow,bondOrder},'INVALID_BOND_ORDER']),
   [{...grow,anchor:{kind:'element',element:'C'}},'ANCHOR_INVALID'],[{...grow,attachPolicy:'guess'},'ATTACH_POLICY_UNSUPPORTED'],
   [{operation:'replaceHydrogen',element:'O',anchor,hydrogen:carbon,bondOrder:1},'NOT_TERMINAL_H'],
   [{operation:'attachFragment',entryId:'not-an-entry',anchor,direction:[1,0,0],bondOrder:1,attachPolicy:'append',spinAngle:0},'CATALOG_NOT_FOUND'],
   [{operation:'placeCatalog',entryId:'benzene',entryKind:'wrong',position:[0,0,0],quaternion:[0,0,0,1]},'CATALOG_KIND'],
   [{operation:'placeCatalog',entryId:'benzene',entryKind:'molecule',position:[0,0,0],quaternion:[0,0,0,2]},'INVALID_ORIENTATION'],
   [{operation:'fuseFragment',entryId:'fusionphenyl',host:{kind:'ids',ids:[context.atoms[1].id,context.atoms[2].id]},bondOrder:1,spinAngle:0},'HOST_BOND_INVALID'],
   [{...atom,position:[0,0,0],warnings:'reject'},'WARNINGS_NOT_ACKNOWLEDGED'],
   [{operation:'insertSelection',envelope:{},position:[0,0,0],quaternion:[0,0,0,1]},'INVALID_REQUEST'],
   ...['builderMeta','coordinationMeta','metalBondingMeta'].map(key=>[{operation:'insertSelection',envelope:{kind:'vibemol.edit-selection',version:1,units:'angstrom',atoms:[{atom:{Z:6,x:0,y:0,z:0,formalCharge:0}},{atom:{Z:1,x:1,y:0,z:0,formalCharge:0},[key]:0}],bonds:[]},position:[0,0,0],quaternion:[0,0,0,1]},'INVALID_REQUEST'])
  ];
  const rows=[];
  for(const [request,expected]of cases){
   const before={volume:VibeMolStructure.exportActive().volume,selection:VibeMolEdit.getSelection(),effects:__editApiEffects(),ui:VibeMolTesting.getEditBuildState()};
   const actual=VibeMolEdit.applyBuild({...base,...request});
   const after={volume:VibeMolStructure.exportActive().volume,selection:VibeMolEdit.getSelection(),effects:__editApiEffects(),ui:VibeMolTesting.getEditBuildState()};
   rows.push({operation:request.operation,actual,expected,unchanged:JSON.stringify(before)===JSON.stringify(after),beforeEffects:before.effects,afterEffects:after.effects});
  }
  const abort=new AbortController();abort.abort();const before=__editApiEffects();const actual=VibeMolEdit.applyBuild({...base,...atom},{signal:abort.signal});rows.push({operation:'aborted',actual,expected:'ABORTED',unchanged:JSON.stringify(before)===JSON.stringify(__editApiEffects())});
  return rows;
 }''')
 for row in negative:
  print('[edit-api-rejection] '+json.dumps(row),flush=True)
  COVERAGE['edit-api-rejection'] += 1
  compare('atomic-'+row['operation'],dict(code=row['actual']['error']['code'],mutation=row['actual']['mutation']['state'],unchanged=row['unchanged']),dict(code=row['expected'],mutation='none',unchanged=True))
 compare('public-methods',sorted(page.evaluate('()=>Object.keys(VibeMolEdit)')),sorted(['enter','context','resolveSelection','getSelection','setSelection','clearSelection','copySelection','listBuildCatalog','listBuildSites','validateBuild','applyBuild','translate']))
 for selector,code in [({'kind':'labels','labels':['C3']},'ELEMENT_INDEX_OUT_OF_RANGE'),({'kind':'element','element':'O'},'ELEMENT_ABSENT'),({'kind':'ids','ids':['missing']},'ATOM_NOT_FOUND')]:
  row=page.evaluate('q=>VibeMolEdit.resolveSelection(q)',selector);compare(code,dict(ok=row['ok'],code=row['error']['code'],mutation=row['mutation']['state']),dict(ok=False,code=code,mutation='none'))
 row=page.evaluate('()=>{const q=VibeMolEdit.resolveSelection({kind:"labels",labels:["C2"]});const original=VibeMolEdit.setSelection(q.value);const copy=VibeMolEdit.setSelection(JSON.parse(JSON.stringify(q.value)));return {original,copy}}')
 compare('provenance',dict(original=row['original']['value']['indices'],copied=row['copy']['error']['code']),dict(original=[1],copied='RESOLUTION_REQUIRED'))
 row=page.evaluate('()=>{const q=VibeMolEdit.resolveSelection({kind:"all"});const c=VibeMolEdit.copySelection(q.value);const move=VibeMolEdit.translate(q.value,[0.25,-0.5,1]);return {copy:c,move,stale:VibeMolEdit.setSelection(q.value)}}')
 compare('copy-and-move-ok',{k:row[k]['ok'] for k in ('copy','move')},{'copy':True,'move':True});compare('stale-after-translate',row['stale']['error']['code'],'STALE_CONTEXT')
 compare('translation-arithmetic',[[a[k] for k in ('x','y','z')] for a in row['move']['applied']['atoms']],[[.25,-.5,1],[1.75,-.5,1],[-.75,-.5,1]])
 page.evaluate('envelope=>window.__editApiEnvelope=envelope',row['copy']['value'])
 build('insertSelection',envelope=row['copy']['value'],position=[0,2,0],quaternion=[0,0,0,1])
 load(CARBON)
 reserved=page.evaluate('''()=>{const envelope=VibeMolStructure.exportActive();envelope.volume.atoms[0].id='@edit-api-atom:1';envelope.volume.annotations.builder.byAtomId={'@edit-api-atom:1':{groupId:'@edit-api-group:1',entryId:'methyl',entryKind:'fragment'}};envelope.volume.fragmentOps=[{opId:'@edit-api-op:1',timestamp:'@commit',entryId:'methyl',entryKind:'fragment',attachPolicy:'append',builderGroupId:'@edit-api-group:1',addedAtomIds:['@edit-api-atom:1'],transform:{note:'@edit-api-atom:2'},resultingBondOrder:1}];const imported=VibeMolStructure.importFromText(JSON.stringify(envelope),'reserved-id-fixture');return {imported:{name:imported.name,atoms:imported.vol.atoms.length},before:VibeMolStructure.exportActive().volume};}''')
 compare('reserved-source-import',reserved['imported']['atoms'],1)
 result(page,'VibeMolEdit.enter()')
 identity=build('placeAtom',element='O',position=[3,0,0]);compare('existing-reserved-atom-id',identity['applied']['atoms'][0],reserved['before']['atoms'][0]);compare('existing-opaque-operation',identity['applied']['fragmentOps'][0],reserved['before']['fragmentOps'][0]);compare('only-new-identity',dict(created=len(identity['value']['created']),removed=identity['value']['removed']),dict(created=1,removed=[]))
 load(CARBON);build('placeAtom',element='O',position=[3,0,0])
 load(CARBON);build('growAtom',element='N',anchor={'kind':'labels','labels':['C1']},direction=[1,0,0],bondOrder=1,attachPolicy='append')
 load(CARBON);build('attachFragment',entryId='methyl',anchor={'kind':'labels','labels':['C1']},direction=[1,0,0],bondOrder=1,attachPolicy='append',spinAngle=.3)
 load(METHANE);build('replaceHydrogen',element='O',anchor={'kind':'labels','labels':['C1']},hydrogen={'kind':'labels','labels':['H1']},bondOrder=1)
 ready(page,'()=>VibeMolEdit.listBuildCatalog().value.some(e=>e.entryId==="fusionphenyl")');load(XYZ);fused=build('fuseFragment',entryId='fusionphenyl',host={'kind':'labels','labels':['C1','C2']},bondOrder=1,spinAngle=.2)
 # Real fused provenance must distinguish owned atoms from the shared host,
 # and survive copying/insertion with a new instance identity.
 fragment=page.evaluate('''()=>{const c=VibeMolEdit.context().value,g=c.fragments[0],owned=VibeMolEdit.resolveSelection({kind:'fragment',instanceId:g.instanceId,role:'owned'}),footprint=VibeMolEdit.resolveSelection({kind:'fragment',instanceId:g.instanceId,role:'footprint'}),copy=VibeMolEdit.copySelection(owned.value);return {g,owned,footprint,copy};}''')
 compare('fragment-resolution-ok',{k:fragment[k]['ok'] for k in ('owned','footprint','copy')},{'owned':True,'footprint':True,'copy':True})
 compare('fused-owned-members',sorted(fragment['owned']['value']['atomIds']),sorted(fused['value']['created']))
 host=fused['applied']['fragmentOps'][-1]['hostBondAtomIds']
 compare('fused-footprint-members',sorted(fragment['footprint']['value']['atomIds']),sorted(set(fused['value']['created']+host)))
 inserted=build('insertSelection',envelope=fragment['copy']['value'],position=[0,5,0],quaternion=[0,0,0,1])
 inserted_group=inserted['context']['fragments'][-1]
 compare('inserted-fragment-members',sorted(inserted_group['owned']),sorted(inserted['value']['created']))
 compare('inserted-fragment-new-instance',inserted_group['instanceId']!=fragment['g']['instanceId'],True)
 load(CARBON);build('placeCatalog',entryKind='molecule',entryId='benzene',position=[4,0,0],quaternion=[0,0,0,1])
 row=page.evaluate('()=>{const before=VibeMolStructure.exportActive();const c=VibeMolEdit.context().value;const request={operation:"placeAtom",system:{systemId:c.systemId,fingerprint:c.fingerprint},element:"H",position:[20,0,0],hydrogens:"preserve",warnings:"allow"};const beforeEffects=__editApiEffects();const validated=VibeMolEdit.validateBuild(request);return {before,after:VibeMolStructure.exportActive(),validated,beforeEffects,afterEffects:__editApiEffects()}}')
 compare('validation-ok',row['validated']['ok'],True);compare('validation-no-write',row['after']['volume'],row['before']['volume']);compare('validation-no-effects',row['afterEffects'],row['beforeEffects'])
 row=page.evaluate('()=>{const c=VibeMolEdit.context().value;return VibeMolEdit.listBuildSites({system:{systemId:c.systemId,fingerprint:c.fingerprint},anchor:{kind:"labels",labels:["C1"]},element:"H",bondOrder:1})}');print('[edit-api-sites] '+json.dumps(row),flush=True);compare('result-ok',row['ok'],True)
 # Validate explicit H adjustment without consuming permanent IDs, then apply
 # the same request and read the complete predicted/applied structure back.
 load(CARBON)
 adjusted=page.evaluate('''()=>{const c=VibeMolEdit.context().value,request={operation:'placeAtom',system:{systemId:c.systemId,fingerprint:c.fingerprint},element:'C',position:[3,0,0],hydrogens:'adjust',warnings:'allow'},before=__editApiEffects(),validated=VibeMolEdit.validateBuild(request),afterValidation=__editApiEffects(),applied=VibeMolEdit.applyBuild(request);return {validated,applied,before,afterValidation};}''')
 compare('adjustment-results-ok',{k:adjusted[k]['ok'] for k in ('validated','applied')},{'validated':True,'applied':True})
 compare('hydrogen-validation-no-effects',adjusted['afterValidation'],adjusted['before'])
 compare('explicit-hydrogen-adjustment',dict(created=len(adjusted['applied']['value']['created']),hydrogens=sum(a['Z']==1 for a in adjusted['applied']['applied']['atoms'])),dict(created=5,hydrogens=4))
 compare('hydrogen-requested-applied',adjusted['applied']['requested'],adjusted['applied']['applied'])
 new=page.evaluate('''()=>{const before=__editApiEffects(),request={operation:'placeAtom',system:'new',element:'O',position:[0,0,0],hydrogens:'preserve',warnings:'allow'},validated=VibeMolEdit.validateBuild(request),afterValidation=__editApiEffects(),applied=VibeMolEdit.applyBuild(request);return {validated,applied,before,afterValidation,after:__editApiEffects()};}''')
 compare('new-system-results-ok',{k:new[k]['ok'] for k in ('validated','applied')},{'validated':True,'applied':True})
 compare('new-validation-no-effects',new['afterValidation'],new['before'])
 compare('explicit-new-system',dict(records=new['after']['create']-new['before']['create'],atoms=len(new['applied']['applied']['atoms']),Z=new['applied']['applied']['atoms'][0]['Z']),dict(records=1,atoms=1,Z=8))
 compare('new-requested-applied',new['applied']['requested'],new['applied']['applied'])
 # Source resolution remains available; structural writes fail before even an
 # invalid operation can partially apply. Compare the complete exported source.
 trajectory='2\nframe0\nC 0 0 0\nH 1 0 0\n2\nframe1\nC .1 0 0\nH 1.1 0 0\n'
 for name,files in [('trajectory',[{'name':'motion.xyz','text':trajectory}]),('vibration',[{'name':'vib.xyz','text':'2\nvib\nC 0 0 0\nH 1 0 0\n'},{'name':'vib.vib.json','text':json.dumps({'kind':'vibemol.vibrations','version':1,'units':'angstrom','atomCount':2,'atomSymbols':['C','H'],'modes':[{'frequencyCm1':245,'irIntensityKmMol':1,'displacements':[-.18,0,0,.18,0,0]}]})}]),('cube',[{'name':'api.cube','text':p.cube(0)}]),('molden',[{'name':'api.molden','text':p.MOLDEN}])]:
  load(files=files)
  row=page.evaluate('()=>{const before=VibeMolStructure.exportActive(),c=VibeMolEdit.context().value;const resolved=VibeMolEdit.resolveSelection({kind:"all"});const rejected=VibeMolEdit.applyBuild({system:{systemId:c.systemId,fingerprint:c.fingerprint},operation:"placeAtom",element:"C",position:[2,0,0],hydrogens:"preserve",warnings:"allow"});return {before,after:VibeMolStructure.exportActive(),resolved,rejected}}')
  compare(name+'-resolution',row['resolved']['ok'],True);compare(name+'-write',dict(code=row['rejected']['error']['code'],mutation=row['rejected']['mutation']['state']),dict(code='SOURCE_NOT_EDITABLE',mutation='none'));compare(name+'-unchanged',row['after']['volume'],row['before']['volume'])
 compare('write-counter-controls',all(v>0 for k,v in page.evaluate('()=>__editApiEffects()').items() if k in ('atom','group','operation','history','apply')),True)
 catalog_molecule_sites(page)
 compare('page-errors',errors,[])


def run_matrix(output):
 COVERAGE.clear()
 output=Path(output);output.mkdir(parents=True,exist_ok=False)
 with p.run_http_server(p.ROOT) as url,p.sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True)
  try:
   for name,phase in [('product',run)]:
    context=browser.new_context(viewport={'width':1280,'height':900},device_scale_factor=1)
    try:phase(context.new_page(),url)
    except Exception:
     if context.pages:p.write_failure_artifacts(context.pages[0],output,'edit-api-'+name,[],[])
     raise
    finally:context.close()
    compare('residual-contexts-'+name,len(browser.contexts),0)
  finally:browser.close()
 require_phase_counts(dict(COVERAGE),'tests/e2e/premerge.py','edit-api','edit-api-rejection','edit-api-catalog-site')
 (output/'summary.json').write_text(json.dumps(dict(passed=True,residualContexts=0,checkpointCounts=dict(COVERAGE))))

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();run_matrix(args.output)
