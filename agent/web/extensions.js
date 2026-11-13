(function (global) {
  'use strict';

  /*
   * Claude-written JavaScript extensions for VibeMol.
   *
   * Every script Claude runs gets an `ext` helper (see agent/EXTENDING.md):
   * 3D objects, DOM elements, listeners, frame callbacks and file formats it
   * adds through `ext` are removed automatically when the extension is
   * disabled or deleted. Saved extensions live in this browser's localStorage
   * and re-run on page load while enabled. `?noExtensions` skips them once.
   */
  const STORE_KEY = 'vibemol.agent.extensions.v1';
  const ALLOW_KEY = 'vibemol.agent.allowScripts';
  const NAME_RE = /^[\w .()+-]{1,60}$/;
  const running = new Map();   // name -> { dispose, error }
  const formats = new Map();   // ".ext" -> { owner, convert, label }
  let adhocCount = 0;

  // ---- storage ---------------------------------------------------------------
  function readStore(storage = global.localStorage) {
    try {
      const list = JSON.parse(storage.getItem(STORE_KEY) || '[]');
      return Array.isArray(list) ? list.filter(e => e && typeof e.name === 'string' && typeof e.code === 'string') : [];
    } catch { return []; }
  }

  function writeStore(list, storage = global.localStorage) {
    storage.setItem(STORE_KEY, JSON.stringify(list));
    notify();
  }

  const listeners = new Set();
  const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });

  // ---- permission --------------------------------------------------------------
  function scriptsAllowed() {
    const box = global.document && global.document.getElementById('agentAllowScripts');
    return !!(box && box.checked);
  }

  function requireApproval(title, code, purpose) {
    if (!scriptsAllowed()) throw new Error('Scripts are turned off. Ask the user to tick "Allow scripts" in the Claude menu (top right of VibeMol).');
    const ok = global.confirm(`${title}\n\nPurpose: ${String(purpose || '(not given)').slice(0, 300)}\n\n${code.slice(0, 1500)}${code.length > 1500 ? '\n…' : ''}\n\nAllow?`);
    if (!ok) throw new Error('The user declined.');
  }

  // ---- ext API -----------------------------------------------------------------
  function createContext(name) {
    const disposers = [];
    const seam = () => global.VibeMolAgentSeam || null;
    const track = fn => { disposers.push(fn); return fn; };
    const storageKey = `vibemol.agent.ext.${name}`;

    const ext = {
      name,
      THREE: global.THREE,
      app: {
        embed: global.VibeMolEmbed, preset: global.VibeMolPreset, structure: global.VibeMolStructure,
        session: global.VibeMolSession, host: global.VibeMolAgentHost, seam: seam(),
      },
      scene: () => seam() && seam().getScene(),
      contentGroup: () => seam() && seam().getContentGroup(),
      camera: () => seam() && seam().getCamera(),
      canvas: () => seam() && seam().getCanvas(),
      activeRecord: () => seam() && seam().getActiveRecord(),
      /** Add a THREE object (to the molecule's content group by default); removed on dispose. */
      add3D(object, { parent = 'content' } = {}) {
        const group = parent === 'scene' ? ext.scene() : ext.contentGroup();
        if (!group) throw new Error('VibeMol scene is not ready.');
        group.add(object);
        track(() => {
          if (object.parent) object.parent.remove(object);
          object.traverse && object.traverse(o => { o.geometry && o.geometry.dispose && o.geometry.dispose(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x && x.dispose && x.dispose()); });
        });
        return object;
      },
      /** Insert a DOM element (default: body); removed on dispose. */
      mount(element, parent = global.document.body) {
        const host = typeof parent === 'string' ? global.document.querySelector(parent) : parent;
        if (!host) throw new Error(`No element matches ${parent}`);
        host.appendChild(element);
        track(() => element.remove());
        return element;
      },
      listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        track(() => target.removeEventListener(type, handler, options));
      },
      onFrame(callback) {
        let id = 0, alive = true;
        const loop = t => { if (!alive) return; try { callback(t); } catch (e) { console.error(`[${name}]`, e); } id = global.requestAnimationFrame(loop); };
        id = global.requestAnimationFrame(loop);
        track(() => { alive = false; global.cancelAnimationFrame(id); });
      },
      /**
       * Teach VibeMol a new file type. convert(text, file) returns one or more
       * { name, text } files VibeMol already reads (e.g. .xyz, .vib.json, .cube).
       */
      registerFileFormat({ extensions, convert, label = '' }) {
        const exts = (Array.isArray(extensions) ? extensions : [extensions]).map(e => String(e).toLowerCase()).map(e => (e.startsWith('.') ? e : `.${e}`));
        if (!exts.length || typeof convert !== 'function') throw new Error('registerFileFormat needs extensions and convert(text, file).');
        for (const e of exts) formats.set(e, { owner: name, convert, label });
        refreshAcceptList();
        track(() => { for (const e of exts) if (formats.get(e) && formats.get(e).owner === name) formats.delete(e); refreshAcceptList(); });
      },
      onDispose(fn) { track(fn); },
      storage: {
        get(key, fallback = null) { try { const all = JSON.parse(global.localStorage.getItem(storageKey) || '{}'); return key in all ? all[key] : fallback; } catch { return fallback; } },
        set(key, value) { let all = {}; try { all = JSON.parse(global.localStorage.getItem(storageKey) || '{}'); } catch { /* reset */ } all[key] = value; global.localStorage.setItem(storageKey, JSON.stringify(all)); },
      },
      hint(message) { try { global.VibeMolAgentHost.setHint(message); } catch { /* ignore */ } },
    };
    const dispose = () => { while (disposers.length) { try { disposers.pop()(); } catch (e) { console.error(`[${name}] cleanup`, e); } } };
    return { ext, dispose };
  }

  async function execute(name, code) {
    const { ext, dispose } = createContext(name);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    try {
      const value = await new AsyncFunction('VibeMol', 'ext', code)(global, ext);
      return { value, dispose };
    } catch (error) {
      dispose();
      throw error;
    }
  }

  function jsonSafe(value) {
    let json;
    try { json = JSON.stringify(value === undefined ? null : value); } catch { json = JSON.stringify(String(value)); }
    return JSON.parse(json.length > 20000 ? JSON.stringify(json.slice(0, 20000)) : json);
  }

  // ---- file-format interception -------------------------------------------------
  const extOf = fileName => {
    const lower = String(fileName || '').toLowerCase();
    let best = '';
    for (const e of formats.keys()) if (lower.endsWith(e) && e.length > best.length) best = e;
    return best;
  };

  async function routeFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.some(f => extOf(f.name))) return false;
    const out = [];
    for (const file of files) {
      const text = await file.text();
      const fmt = formats.get(extOf(file.name));
      if (!fmt) { out.push({ name: file.name, text }); continue; }
      try {
        const converted = await fmt.convert(text, file);
        for (const item of (Array.isArray(converted) ? converted : [converted])) {
          if (item && item.name && typeof item.text === 'string') out.push({ name: item.name, text: item.text });
        }
      } catch (error) {
        console.error(`[${fmt.owner}] could not convert ${file.name}`, error);
        try { global.VibeMolAgentHost.setHint(`Could not read ${file.name}: ${error.message}`); } catch { /* ignore */ }
      }
    }
    if (out.length) await global.VibeMolEmbed.loadFiles(out, { clearFirst: false });
    return true;
  }

  let baseAccept = null;
  function refreshAcceptList() {
    const input = global.document && global.document.getElementById('fileInput');
    if (!input) return;
    if (baseAccept === null) baseAccept = input.getAttribute('accept') || '';
    const extra = [...formats.keys()].filter(e => !baseAccept.split(',').includes(e));
    input.setAttribute('accept', [baseAccept, ...extra].filter(Boolean).join(','));
  }

  function installInterceptors() {
    const doc = global.document;
    global.addEventListener('drop', event => {
      const files = event.dataTransfer && event.dataTransfer.files;
      if (!files || !Array.from(files).some(f => extOf(f.name))) return;
      event.preventDefault();
      event.stopPropagation();
      void routeFiles(files);
    }, true);
    doc.addEventListener('change', event => {
      const input = event.target;
      if (!input || input.id !== 'fileInput' || !input.files || !Array.from(input.files).some(f => extOf(f.name))) return;
      event.stopImmediatePropagation();
      void routeFiles(input.files).finally(() => { input.value = ''; });
    }, true);
  }

  // ---- saved extensions ------------------------------------------------------------
  function list({ includeCode = false } = {}) {
    return readStore().map(e => ({
      name: e.name, description: e.description || '', enabled: e.enabled !== false, updatedAt: e.updatedAt || null,
      running: running.has(e.name) && !running.get(e.name).error, error: running.get(e.name) && running.get(e.name).error || null,
      ...(includeCode ? { code: e.code } : { codeLength: e.code.length }),
    }));
  }

  async function start(entry) {
    stop(entry.name);
    try {
      const { dispose } = await execute(entry.name, entry.code);
      running.set(entry.name, { dispose, error: null });
    } catch (error) {
      running.set(entry.name, { dispose: () => {}, error: error.message || String(error) });
      console.error(`[extension ${entry.name}]`, error);
    }
    notify();
  }

  function stop(name) {
    const r = running.get(name);
    if (r) { try { r.dispose(); } catch { /* ignore */ } running.delete(name); }
    notify();
  }

  async function save({ name, description = '', code, enabled = true }) {
    if (!NAME_RE.test(String(name || ''))) throw new Error('name must be 1-60 letters, digits, spaces or . ( ) + - _');
    if (typeof code !== 'string' || !code.trim()) throw new Error('code is required.');
    requireApproval(`Claude wants to save the extension "${name}" in this browser${enabled ? ' and run it' : ''}.`, code, description);
    const all = readStore();
    const now = new Date().toISOString();
    const existing = all.find(e => e.name === name);
    const entry = Object.assign(existing || { name, createdAt: now }, { description: String(description).slice(0, 500), code, enabled: !!enabled, updatedAt: now });
    if (!existing) all.push(entry);
    writeStore(all);
    if (entry.enabled) await start(entry); else stop(name);
    const status = list().find(e => e.name === name);
    if (status.error) throw new Error(`Saved, but it failed when run: ${status.error}`);
    return { saved: name, enabled: entry.enabled, running: status.running };
  }

  async function setEnabled(name, enabled, { fromUser = false } = {}) {
    const all = readStore();
    const entry = all.find(e => e.name === name);
    if (!entry) throw new Error(`No extension named "${name}".`);
    if (enabled && !fromUser) requireApproval(`Claude wants to turn on the extension "${name}".`, entry.code, entry.description);
    entry.enabled = !!enabled;
    writeStore(all);
    if (enabled) await start(entry); else stop(name);
    return list().find(e => e.name === name);
  }

  function remove(name) {
    const all = readStore();
    if (!all.some(e => e.name === name)) throw new Error(`No extension named "${name}".`);
    stop(name);
    writeStore(all.filter(e => e.name !== name));
    try { global.localStorage.removeItem(`vibemol.agent.ext.${name}`); } catch { /* ignore */ }
    return { removed: name };
  }

  async function manage({ name, action }) {
    if (action === 'enable') return setEnabled(name, true);
    if (action === 'disable') return setEnabled(name, false);
    if (action === 'remove') return remove(name);
    throw new Error('action must be enable, disable, or remove.');
  }

  function exportFile(name) {
    const entry = readStore().find(e => e.name === name);
    if (!entry) return;
    const header = `// VibeMol extension: ${entry.name}\n// ${entry.description || ''}\n// Runs as: async function (VibeMol, ext) { ... } — see agent/EXTENDING.md\n\n`;
    const blob = new Blob([header + entry.code], { type: 'text/javascript' });
    const a = global.document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${entry.name.replace(/[^\w.-]+/g, '-')}.vibemol-ext.js`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- one-off scripts (vibemol_run_script) ------------------------------------------
  async function runScript({ code, purpose = '' } = {}) {
    if (typeof code !== 'string' || !code.trim()) throw new Error('code is required.');
    requireApproval('Claude wants to run a script in this VibeMol tab.', code, purpose);
    const { value } = await execute(`script-${++adhocCount}`, code);
    return { result: jsonSafe(value), note: 'Runs until the page reloads. Save it with vibemol_save_extension to keep it.' };
  }

  // ---- menu UI ---------------------------------------------------------------------
  function renderMenu() {
    const box = global.document.getElementById('agentExtensionsList');
    if (!box) return;
    const items = list();
    box.innerHTML = '';
    if (!items.length) {
      const empty = global.document.createElement('div');
      empty.className = 'vm-agent-note';
      empty.textContent = 'None yet. Ask Claude to add a feature.';
      box.appendChild(empty);
      return;
    }
    for (const item of items) {
      const row = global.document.createElement('div');
      row.className = 'vm-agent-ext';
      row.innerHTML = `
        <label class="vm-agent-check vm-agent-ext-name"><input type="checkbox" ${item.enabled ? 'checked' : ''} /><span></span></label>
        <span class="vm-agent-ext-state" aria-hidden="true"></span>
        <button class="vm-agent-icon-btn material-symbols-rounded" type="button" data-act="export" aria-label="Download code" data-tooltip="Download code">download</button>
        <button class="vm-agent-icon-btn material-symbols-rounded" type="button" data-act="remove" aria-label="Delete extension" data-tooltip="Delete">delete</button>`;
      row.querySelector('span').textContent = item.name;
      row.title = item.error ? `Error: ${item.error}` : (item.description || item.name);
      row.dataset.state = item.error ? 'error' : (item.running ? 'on' : 'off');
      row.querySelector('input').addEventListener('change', e => { void setEnabled(item.name, e.target.checked, { fromUser: true }); });
      row.querySelector('[data-act="export"]').addEventListener('click', () => exportFile(item.name));
      row.querySelector('[data-act="remove"]').addEventListener('click', () => {
        if (global.confirm(`Delete the extension "${item.name}"?`)) remove(item.name);
      });
      box.appendChild(row);
    }
  }

  function install() {
    const doc = global.document;
    installInterceptors();
    // Remember "Allow scripts" between visits.
    const allow = doc.getElementById('agentAllowScripts');
    if (allow) {
      try { allow.checked = global.localStorage.getItem(ALLOW_KEY) === '1'; } catch { /* ignore */ }
      allow.addEventListener('change', () => { try { global.localStorage.setItem(ALLOW_KEY, allow.checked ? '1' : '0'); } catch { /* ignore */ } });
    }
    listeners.add(renderMenu);
    renderMenu();
    const skip = new URLSearchParams(global.location.search).has('noExtensions');
    const boot = () => {
      if (skip) { console.info('VibeMol extensions skipped (?noExtensions).'); return; }
      for (const entry of readStore()) if (entry.enabled !== false) void start(entry);
    };
    if (doc.readyState === 'complete') setTimeout(boot, 0);
    else global.addEventListener('load', () => setTimeout(boot, 0), { once: true });
  }

  global.VibeMolAgentExtensions = Object.freeze({
    list, save, manage, runScript, exportFile, formats: () => [...formats.keys()],
    _internals: { readStore, writeStore, createContext, extOf, STORE_KEY },
  });
  if (typeof document !== 'undefined' && global.document && global.document.readyState !== undefined) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', install);
    else install();
  }
})(typeof window !== 'undefined' ? window : globalThis);
