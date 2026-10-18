const fs=require('node:fs'),assert=require('node:assert/strict');
const parser=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/parser');
const traverse=require('/usr/local/lib/node_modules/gatsby-cli/node_modules/@babel/traverse').default;
const factories=[['periodic-table.js','createPeriodicTableController',11],['pubchem.js','createPubChemController',13],['trajectory-playback.js','createTrajectoryPlaybackController',8],['vibration.js','createVibrationController',13],['symmetry-panel.js','createSymmetryPanelController',11]];
const report=factories.map(([file,name,count])=>{
 let result;
 traverse(parser.parse(fs.readFileSync('assets/app/js/'+file,'utf8')),{FunctionDeclaration(p){if(p.node.id.name!==name)return;
  const declarator=p.scope.bindings.deps.referencePaths[0].parentPath;
  const inputs=declarator.node.id.properties.map(prop=>({name:prop.value.name,references:p.scope.bindings[prop.value.name].referencePaths.length}));
  result={file,name,dependencyCount:inputs.length,allUsed:inputs.every(i=>i.references>0),inputs};
 }});
 assert(result);assert.equal(result.dependencyCount,count);assert(result.allUsed);return result;
});
fs.writeFileSync('/Users/fevange/Source/vibemol/out/test-artifacts/stage5/symmetry/factory-recount.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.map(({name,dependencyCount,allUsed})=>({name,dependencyCount,allUsed}))));
