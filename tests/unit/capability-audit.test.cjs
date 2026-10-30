'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {analyze, unit, checkBaseline} = require('../../tools/audit-capabilities.cjs');
const policy = {harnessNamespaces: [], consoleNamespaces: [], consoleReasons: {}, limits: []};
const definition = `window.VibeMolExample = Object.freeze({used(){},dep(){},test(){},dead(){},data:3});`;
function audit(code, tests = '') {
  return analyze([unit('assets/app/js/example.js', definition), unit('assets/app/js/consumer.js', code),
    unit('tests/example.mjs', tests, 1, 'test')], policy);
}

test('direct aliases, static brackets, data reads, shadowing and test-only calls stay distinct', () => {
  const r = audit(`const {used: renamed} = window.VibeMolExample; renamed();
    const module=window.VibeMolExample; console.log(module['data']);
    function shadow(renamed){ renamed(); }`, `const {VibeMolExample: api}=context; api.test();`);
  const entries = Object.fromEntries(r.entries.map(x => [x.member || x.id.split('.').pop(), x]));
  assert.equal(entries.used.bucket, 'live');
  assert.equal(entries.used.invocations.length, 1);
  assert.equal(entries.data.bucket, 'live');
  assert.equal(entries.test.bucket, 'built-but-unwired');
  assert.equal(entries.dead.bucket, 'unreached');
});

test('deps-passed requires the invocation in the specific receiving factory', () => {
  const r = audit(`function create(options){ const action=options.action; return ()=>action(); }
    const {dep}=window.VibeMolExample; create({action:dep});`);
  const e = r.entries.find(x => x.id.endsWith('.dep'));
  assert.equal(e.bucket, 'deps-passed');
  assert.equal(e.dependencyInvocations.length, 1);
  const inert = audit(`function create(options){return options;}
    const {dep}=window.VibeMolExample; create({action:dep});`);
  assert.equal(inert.entries.find(x => x.id.endsWith('.dep')).dependencyInvocations.length, 0);
});

test('namespace-valued dependencies are resolved to actual called members', () => {
  const r = audit(`function create(deps){const {clock}=deps; return ()=>clock.dep();}
    create({clock:window.VibeMolExample});`);
  assert.equal(r.entries.find(x => x.id.endsWith('.dep')).bucket, 'deps-passed');
  assert.equal(r.entries.find(x => x.id.endsWith('.dead')).bucket, 'unreached');
});

test('test factory returns preserve namespace provenance', () => {
  const r = audit('', `function loadApi(){return context.VibeMolExample;} const api=loadApi(); api.test();`);
  assert.equal(r.entries.find(x => x.id.endsWith('.test')).bucket, 'built-but-unwired');
});

test('baseline cannot exchange one dead identity for another or grow alongside the report', () => {
  const report = {counts:{}, entries:[{id:'VibeMolExample.dead',bucket:'unreached'}]};
  const baseline = {unreached:['VibeMolExample.dead'],calibration:{id:'VibeMolExample.dead',expectedBucket:'unreached'}};
  checkBaseline(report, baseline, baseline);
  assert.throws(()=>checkBaseline(report, {...baseline,unreached:['VibeMolExample.other']}, baseline), /New unreached/);
  assert.throws(()=>checkBaseline(report, baseline, {...baseline,unreached:[]}), /baseline may shrink/);
  checkBaseline({...report,entries:[{id:'VibeMolExample.dead',bucket:'live'}]},
    {...baseline,calibration:{id:'VibeMolExample.dead',expectedBucket:'live'}},baseline);
});

test('an unresolved exported spread fails closed', () => {
  assert.throws(()=>analyze([unit('assets/app/js/example.js', `window.VibeMolExample={...unknown};`)],policy), /Unresolved export spread/);
});

test('the revised home-object taxonomy protects harness surfaces and identifies unwired product helpers', () => {
  const r = analyze([unit('assets/app/js/example.js', definition),
    unit('tests/example.mjs', 'context.VibeMolExample.test();', 1, 'test')],
    {...policy,harnessNamespaces:['VibeMolExample']});
  assert(r.entries.every(e => e.bucket === 'harness surface'));
  const named = audit('const {used}=window.VibeMolExample; if(typeof used!=="function")throw Error();');
  assert.equal(named.entries.find(e => e.id.endsWith('.used')).bucket, 'built-but-unwired');
});

test('defaulted factory parameters still need and retain a real dependency invocation', () => {
  const r = audit(`function create(options={}){const fn=options.action; return ()=>fn();}
    create({action:window.VibeMolExample.dep});`);
  assert.equal(r.entries.find(e => e.id.endsWith('.dep')).bucket, 'deps-passed');
});

test('finite computed member loops expand by identity; unknown dynamic reads stay visible', () => {
  const r = audit('', `const api=context.VibeMolExample;
    for(const name of ['used','test'])api[name](); api[unknown]();`);
  assert.equal(r.entries.find(e => e.id.endsWith('.used')).bucket, 'built-but-unwired');
  assert.equal(r.entries.find(e => e.id.endsWith('.dead')).bucket, 'unreached');
  assert.equal(r.unresolved.length, 1);
});

test('built-but-unwired allowance cannot grow alongside a newly unused capability', () => {
  const r = audit('', 'context.VibeMolExample.test();');
  const baseline = {unreached:r.entries.filter(e=>e.bucket==='unreached').map(e=>e.id),
    builtButUnwired:['VibeMolExample.test'],calibration:{id:'VibeMolExample.test',expectedBucket:'built-but-unwired'}};
  assert.throws(()=>checkBaseline(r, baseline, {...baseline,builtButUnwired:[]}), /Built-but-unwired baseline may shrink/);
});

test('optional dependency calls are invocation proof, not a guard', () => {
  const r = audit(`function create(options={}){ const fn=options.action; return ()=>fn?.(); }
    create({action:window.VibeMolExample.dep});`);
  assert.equal(r.entries.find(e => e.id.endsWith('.dep')).bucket, 'deps-passed');
});

test('destructured, renamed and defaulted dependency parameters retain their invocation site', () => {
  const r = audit(`function create({action:run=()=>{}}={}){return ()=>run();}
    create({action:window.VibeMolExample.dep});`);
  assert.equal(r.entries.find(e => e.id.endsWith('.dep')).bucket, 'deps-passed');
});
