import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGlobalModule} from './load-global-module.mjs';

function setup(innerWidth, clientWidth, width, offsetWidth = 0) {
  const context = loadGlobalModule('assets/app/js/edit-ui.js', {globals: {
    innerWidth, document: {documentElement: {clientWidth}},
  }});
  const menuEl = {style: {top: '56px', right: 'auto'}, offsetWidth,
    getBoundingClientRect: () => ({width})};
  return {position: context.VibeMolEditUi.positionAdaptiveMenu, menuEl};
}
test('the shared horizontal clamp preserves sidebar, narrow and fractional placements', () => {
  for (const [viewport, menu, collapsed, rect, expected] of [
    [1280, 200, false, {right: 300.4, width: 300}, '312px'],
    [320, 200, false, {right: 300, width: 300}, '108px'],
    [320, 400, false, {right: 300, width: 300}, '12px'],
    [320, 200, true, {right: 300, width: 300}, '12px'],
    [320.4, 200.6, false, {right: 300, width: 300}, '107px'],
    [320, 200, false, {right: NaN, width: 300}, '12px'],
    [320, 200, false, {right: 300, width: 0}, '12px'],
  ]) {
    const {position, menuEl} = setup(viewport, viewport, menu);
    position({menuEl, toolbarEl: {getBoundingClientRect: () => rect}, sidebarCollapsed: collapsed, gap: 12});
    assert.deepEqual(menuEl.style, {left: expected, top: '56px', right: 'auto'}, JSON.stringify([viewport, menu, collapsed, rect]));
  }
});
test('a caller snapshot avoids a second toolbar read and retains its viewport policy', () => {
  const {position, menuEl} = setup(320, 1000, 0, 201);
  const toolbarEl = {getBoundingClientRect: () => { throw Error('unexpected second layout read'); }};
  position({menuEl, toolbarEl, sidebarCollapsed: false, gap: 12,
    toolbarRect: {right: 300, width: 300}, viewportWidth: 320});
  assert.equal(menuEl.style.left, '107px');
  position({menuEl, toolbarEl, sidebarCollapsed: false, gap: 12, toolbarRect: null, viewportWidth: 320});
  assert.equal(menuEl.style.left, '12px');
  // Original callers retain the historical document-width fallback and 16px gap.
  position({menuEl, toolbarEl: {getBoundingClientRect: () => ({right: 300, width: 300})}});
  assert.equal(menuEl.style.left, '316px');
});
