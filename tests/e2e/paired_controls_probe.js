/* Served-response probe only. No production API, event replacement or setters. */
(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const bindings = [], originals = [], trace = [], choices = [];
  const fields = root => [...(root?.querySelectorAll('input[id],select[id],[role="radio"][data-value]') || [])];
  const read = el => el.type === 'checkbox' ? el.checked : el.getAttribute('role') === 'radio'
    ? el.getAttribute('aria-checked') === 'true' : el.value;
  const at = (value, path) => path.reduce((v, key) => v?.[key], value);
  const record = (owner, args) => {
    if (window.__pairedControls.tracing) trace.push({owner, args: clone([...args])});
  };
  function captureOriginals() {
    for (const el of fields(document.getElementById('displayInspector'))) {
      originals.push(el);
    }
  }
  function register(id, type, getter, extra = {}) {
    bindings.push({id, type, getter, ...extra});
  }
  function paths(binding) {
    const reads = [], state = window.__pairedControls.state();
    const visit = (value, path = []) => value && typeof value === 'object' ? new Proxy(value, {
      get(target, key) {
        if (typeof key === 'symbol') return target[key];
        const next = [...path, key], result = target[key];
        if (result === null || typeof result !== 'object') reads.push(next);
        return visit(result, next);
      },
    }) : value;
    const resolved = binding.getter(visit(state));
    const canonical = reads.filter(path => ['settings','surface','rendering'].includes(path[0]))
      .map(path => path[0] !== 'rendering' ? path.slice(1) : ['appearance.rendering', ...path.slice(1)]);
    return {resolved, reads, paths: [...new Map(canonical.map(path => [JSON.stringify(path), path])).values()]};
  }
  function describe(el) {
    if (!el) return {connected:false, owner:null};
    return {id: el.id, key:el.id || (el.closest('[role="radiogroup"]')?.id + ':' + el.dataset.value),
      type: el.type || el.getAttribute('role'), value: read(el),
      inputBound: typeof el.oninput === 'function',
      connected: el.isConnected, owner: el.closest('#looksPanel,#displayInspector,#inspectorObject,#viewControls')?.id || null,
      hidden: !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden', disabled: !!el.disabled};
  }
  window.__pairedControls = {
    bindings, originals, choices, captureOriginals, register, record, trace, tracing: false, read, at,
    choice: (left,right) => { if(left && right) choices.push([left,right]); },
    inventory: () => ({original: originals.map(describe), editor: bindings.map(binding => {
      const el = document.getElementById(binding.id);
      return {id:binding.id,type:binding.type,...describe(el), ...paths(binding), min: binding.min, max: binding.max, precision:binding.precision,
        choices: el?.tagName === 'SELECT' ? [...el.options].filter(o => !o.disabled).map(o => o.value) : null};
    }), choices: choices.map(pair=>pair.map(describe)),
      appearanceDom:fields(document.getElementById('displayInspector')).map(describe),
      editorDom:fields(document.getElementById('looksPanel')).map(describe)}),
    values: () => Object.fromEntries([...new Set([...originals, ...fields(document.getElementById('displayInspector'))])]
      .filter(el => el.isConnected && !el.closest('#looksPanel')).map(el => [el.id, read(el)])),
    eligible: () => [...new Set([...originals,...fields(document.getElementById('displayInspector'))])]
      .filter(el=>el.isConnected && el.id && !el.closest('#looksPanel') && !describe(el).hidden && !el.disabled && el.type!=='range').map(el=>el.id),
    readback: () => ({settings: clone(window.__pairedControls.envelope().settings),
      controls: Object.fromEntries([...originals, ...fields(document.getElementById('displayInspector')), ...fields(document.getElementById('looksPanel'))]
        .filter(el => el.isConnected).map(el => [el.id, read(el)])), trace: clone(trace)}),
    // This dispatches the existing binding, as the registry symmetry test does.
    // It tests typed value/write-path symmetry, not pointer hit eligibility.
    change(id, value, phase = 'change') {
      const el = document.getElementById(id);
      if (!el?.isConnected) throw new Error('Missing live control: ' + id);
      trace.length = 0; this.tracing = true;
      try {
        if (el.type === 'checkbox') el.checked = value;
        else el.value = value;
        el.dispatchEvent(new Event(phase, {bubbles: true}));
      } finally { this.tracing = false; }
    },
  };
})();
