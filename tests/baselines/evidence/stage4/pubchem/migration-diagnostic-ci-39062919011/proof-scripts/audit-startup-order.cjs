const fs = require('fs');
const cp = require('child_process');
const parser = require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse = require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const crypto = require('crypto');
const path = require('path');
const root = '/Users/fevange/Source/vibemol';
const out = path.join(root, 'out/test-artifacts/stage4/pubchem/migration-diagnostic');
const sources = JSON.parse(fs.readFileSync(path.join(out,'sources.json')));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const records = {};
const wanted = ['restoreAppearancePresetAutosave','importAppearancePresetEnvelope','updateSidePanel','updatePubChemMetadataPanel'];
for (const [label, config] of Object.entries(sources)) {
  const s = cp.execFileSync('git',['show',config.commit+':assets/app/js/app.js'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
  const ast = parser.parse(s,{sourceType:'script'});
  const r = {commit:config.commit, appSha256:sha(s), functions:{}, events:{}, presetCallbacks:{}};
  traverse(ast,{
    FunctionDeclaration(p) {
      if(wanted.includes(p.node.id?.name))r.functions[p.node.id.name]={line:p.node.loc.start.line,endLine:p.node.loc.end.line,source:s.slice(p.node.start,p.node.end),sha256:sha(s.slice(p.node.start,p.node.end))};
    },
    CallExpression(p) {
      const n=p.node,callee=s.slice(n.callee.start,n.callee.end);
      if(callee==='restoreAppearancePresetAutosave')r.events.restoreAutosave=n.loc.start.line;
      if(callee==='createPubChemController')r.events.createPubChemController=n.loc.start.line;
      if(callee==='window.VibeMolLooksUi.createController')r.events.createLooksUi=n.loc.start.line;
      if(callee==='registerPresetSetting' && n.arguments[0]?.value==='appearance.look')r.events.registerAppearanceLook=n.loc.start.line;
      if(callee==='createPresetController')for(const prop of n.arguments[0].properties||[]) {
        const name=prop.key?.name||prop.key?.value;
        if(['afterApplySettings','afterImportSettings'].includes(name))r.presetCallbacks[name]={line:prop.loc.start.line,source:s.slice(prop.start,prop.end),sha256:sha(s.slice(prop.start,prop.end))};
      }
    },
    AssignmentExpression(p) {
      const n=p.node;
      if(s.slice(n.left.start,n.left.end)==='window.VibeMolAppearanceLooks')r.events.publishAppearanceLooks=n.loc.start.line;
    },
    VariableDeclarator(p) {
      if(p.node.id.name==='pubchemBusy')r.events.originalPubChemStateDeclaration=p.node.loc.start.line;
    }
  });
  records[label]=r;
}
const base=records.integration,proposed=records.pubchem;
for(const name of ['restoreAppearancePresetAutosave','importAppearancePresetEnvelope','updateSidePanel']) {
  if(base.functions[name].source!==proposed.functions[name].source)throw Error('Startup function changed: '+name);
}
for(const name of ['afterApplySettings','afterImportSettings']) {
  if(base.presetCallbacks[name].source!==proposed.presetCallbacks[name].source)throw Error('Preset callback changed: '+name);
}
if(!(proposed.events.restoreAutosave<proposed.events.createPubChemController && proposed.events.createPubChemController<proposed.events.createLooksUi && proposed.events.createLooksUi<proposed.events.publishAppearanceLooks))throw Error('Unexpected order');
const result={records, sourceOnlyAudit:true, productionEdits:false,
  findings:{
    appearanceRegistrationStillAfterAutosaveAndLooksConstruction:true,
    originalEarlyMetadataFunctionWasHoistedAndIndependentOfPubChemState:true,
    newEarlyMetadataWrapperReadsPubChemControllerConstBeforeInitialization:true,
    unchangedSynchronousPath:['restoreAppearancePresetAutosave','importAppearancePresetEnvelope','preset importEnvelope/applyPresetSettings','afterApplySettings','updateSidePanel','updatePubChemMetadataPanel'],
    candidateNewRead:'return pubchemController.updatePubChemMetadataPanel(record);',
    javascriptConsequence:'If the startup import reaches this unchanged path, the controller const is still in its temporal dead zone. The restore function catches the exception; preset afterImportSettings/migration bookkeeping is skipped.',
    classificationBoundary:'Read-only static mechanism. Report measured three-source comparands separately; no browser exception trace was added and no production fix is authorized.'
  }};
fs.writeFileSync(path.join(out,'startup-order-audit.json'),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({events:Object.fromEntries(Object.entries(records).map(([k,v])=>[k,v.events])),findings:result.findings},null,2)+'\n');
