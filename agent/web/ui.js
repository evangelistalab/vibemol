(function (global) {
  'use strict';

  /*
   * Generic UI reflection for agents. Instead of one hand-written tool per
   * feature, agents discover VibeMol's real controls (buttons, checkboxes,
   * sliders, selects, tabs) from the DOM, read their labels/state, and operate
   * them exactly as a user would. New features become available to Claude
   * automatically as long as their controls have a readable label
   * (aria-label, data-tooltip, <label>, or visible text).
   */
  const CONTROL_SELECTOR = [
    'button', 'input:not([type=hidden]):not([type=file])', 'select', 'textarea',
    '[role=button]', '[role=switch]', '[role=tab]', '[role=menuitem]', '[role=menuitemradio]',
    '[role=menuitemcheckbox]', '[role=checkbox]', '[role=radio]', '[role=option]', 'summary',
  ].join(',');
  const EXCLUDE_SELECTOR = '.vm-agent-link, [data-agent-ignore]';
  const REF_ATTR = 'data-agent-ref';
  let refCounter = 0;

  const clean = (text, max = 120) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);

  function refFor(el) {
    if (el.id) return el.id;
    if (!el.getAttribute(REF_ATTR)) el.setAttribute(REF_ATTR, `ref${++refCounter}`);
    return el.getAttribute(REF_ATTR);
  }

  function findByRef(doc, ref) {
    const id = String(ref || '');
    if (!id) return null;
    return doc.getElementById(id) || doc.querySelector(`[${REF_ATTR}="${id.replace(/"/g, '')}"]`);
  }

  function labelFor(el, doc) {
    const aria = el.getAttribute('aria-label');
    const tip = el.getAttribute('data-tooltip') || el.getAttribute('title');
    let forLabel = '';
    if (el.id) {
      const lab = doc.querySelector(`label[for="${el.id.replace(/"/g, '')}"]`);
      if (lab) forLabel = lab.textContent;
    }
    const wrapLabel = el.closest && el.closest('label') ? el.closest('label').textContent : '';
    const labelledBy = el.getAttribute('aria-labelledby');
    const byText = labelledBy ? labelledBy.split(/\s+/).map(id => (doc.getElementById(id) || {}).textContent || '').join(' ') : '';
    const text = ['BUTTON', 'SUMMARY'].includes(el.tagName) || /^(button|tab|menuitem|option)/.test(el.getAttribute('role') || '') ? el.textContent : '';
    // Icon buttons use ligature text like "file_download"; prefer descriptive labels.
    const parts = [aria, byText, forLabel, wrapLabel, tip, text, el.getAttribute('placeholder'), el.name].map(v => clean(v)).filter(Boolean);
    return parts.length ? parts[0] + (tip && clean(tip) !== parts[0] ? ` — ${clean(tip)}` : '') : '';
  }

  function sectionFor(el) {
    let node = el.parentElement;
    while (node && node.tagName !== 'BODY') {
      const name = node.getAttribute('aria-label') || (node.id && !/^(app|root|main)$/i.test(node.id) ? node.id : '');
      if (name) return clean(name, 60);
      node = node.parentElement;
    }
    return '';
  }

  function isVisible(el) {
    if (el.hidden || el.closest('[hidden], [aria-hidden="true"]')) return false;
    return typeof el.getClientRects === 'function' ? el.getClientRects().length > 0 : true;
  }

  function kindOf(el) {
    const role = el.getAttribute('role');
    if (el.tagName === 'SELECT') return 'select';
    if (el.tagName === 'TEXTAREA') return 'text';
    if (el.tagName === 'INPUT') return (el.type || 'text').toLowerCase();
    if (role) return role;
    return el.tagName.toLowerCase();
  }

  function describe(el, doc) {
    const kind = kindOf(el);
    const out = { ref: refFor(el), kind, label: labelFor(el, doc), section: sectionFor(el) };
    if (kind === 'checkbox' || kind === 'radio' || kind === 'switch' || kind === 'menuitemcheckbox') {
      out.checked = el.tagName === 'INPUT' ? !!el.checked : el.getAttribute('aria-checked') === 'true';
    } else if (kind === 'select') {
      out.value = el.value;
      out.options = Array.from(el.options).slice(0, 40).map(o => ({ value: o.value, label: clean(o.textContent, 60) }));
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      out.value = clean(el.value, 200);
      for (const attr of ['min', 'max', 'step']) if (el.getAttribute(attr) != null) out[attr] = el.getAttribute(attr);
    } else {
      const pressed = el.getAttribute('aria-pressed') || el.getAttribute('aria-selected') || el.getAttribute('aria-expanded');
      if (pressed != null) out.state = pressed;
    }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') out.disabled = true;
    if (!isVisible(el)) out.hidden = true;
    return out;
  }

  function listControls(options = {}, doc = global.document) {
    const terms = clean(options.query, 200).toLowerCase().split(' ').filter(Boolean);
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 60));
    const all = Array.from(doc.querySelectorAll(CONTROL_SELECTOR)).filter(el => !el.closest(EXCLUDE_SELECTOR));
    const rows = [];
    for (const el of all) {
      const row = describe(el, doc);
      if (!row.label && !row.section) continue;
      if (row.hidden && !options.includeHidden) continue;
      const hay = `${row.label} ${row.section} ${row.ref}`.toLowerCase();
      const score = terms.length ? terms.reduce((sum, t) => sum + (hay.includes(t) ? 1 : 0), 0) : 1;
      if (score > 0) rows.push({ row, score });
    }
    rows.sort((a, b) => b.score - a.score);
    return { total: rows.length, controls: rows.slice(0, limit).map(r => r.row) };
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'SELECT' ? global.HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? global.HTMLTextAreaElement.prototype : global.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, String(value));
    el.dispatchEvent(new global.Event('input', { bubbles: true }));
    el.dispatchEvent(new global.Event('change', { bubbles: true }));
  }

  function operateControl({ ref, action = 'click', value } = {}, doc = global.document) {
    const el = findByRef(doc, ref);
    if (!el || el.closest(EXCLUDE_SELECTOR)) throw new Error(`No control with ref "${ref}". Call vibemol_list_controls again; refs can change when panels re-render.`);
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') throw new Error(`Control "${labelFor(el, doc) || ref}" is disabled right now.`);
    const kind = kindOf(el);
    if (action === 'click') {
      el.click();
    } else if (action === 'set') {
      if (kind === 'checkbox' || kind === 'radio' || kind === 'switch' || kind === 'menuitemcheckbox') {
        const want = value === true || value === 'true' || value === 1 || value === 'on';
        const now = el.tagName === 'INPUT' ? el.checked : el.getAttribute('aria-checked') === 'true';
        if (now !== want) el.click();
      } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
        if (kind === 'select' && !Array.from(el.options).some(o => o.value === String(value))) {
          throw new Error(`"${value}" is not an option. Options: ${Array.from(el.options).map(o => o.value).join(', ')}`);
        }
        el.focus && el.focus();
        setNativeValue(el, value);
        el.blur && el.blur();
      } else {
        throw new Error(`Control kind "${kind}" has no value; use action "click".`);
      }
    } else {
      throw new Error('action must be "click" or "set".');
    }
    return { after: describe(el, doc) };
  }

  function pressKey({ key, ctrl = false, shift = false, alt = false, meta = false } = {}, doc = global.document) {
    if (!key || typeof key !== 'string') throw new Error('key is required, e.g. "e", "Escape", "Delete".');
    const active = doc.activeElement;
    if (active && active !== doc.body && typeof active.blur === 'function') active.blur(); // shortcuts ignore focused inputs
    const init = { key, bubbles: true, cancelable: true, ctrlKey: !!ctrl, shiftKey: !!shift, altKey: !!alt, metaKey: !!meta };
    if (key.length === 1) init.code = /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : (/\d/.test(key) ? `Digit${key}` : undefined);
    const target = doc.body;
    target.dispatchEvent(new global.KeyboardEvent('keydown', init));
    target.dispatchEvent(new global.KeyboardEvent('keyup', init));
    return { pressed: [meta && 'Meta', ctrl && 'Ctrl', alt && 'Alt', shift && 'Shift', key].filter(Boolean).join('+') };
  }

  function readText({ ref, maxChars = 6000 } = {}, doc = global.document) {
    const el = ref ? findByRef(doc, ref) : doc.body;
    if (!el) throw new Error(`No element with ref "${ref}".`);
    const text = String(el.innerText != null ? el.innerText : el.textContent || '');
    const limit = Math.max(200, Math.min(20000, Number(maxChars) || 6000));
    return { ref: ref || 'body', text: text.replace(/[ \t]+/g, ' ').replace(/ *\n[\s]*/g, '\n').trim().slice(0, limit), truncated: text.length > limit };
  }

  // Opt-in escape hatch for anything the tools above can't reach. Off unless the
  // user ticks "Allow scripts" in the page, and every script needs confirmation.
  async function runScript({ code, purpose = '' } = {}, doc = global.document) {
    const allow = doc.getElementById('agentAllowScripts');
    if (!allow || !allow.checked) throw new Error('Running scripts is disabled. Ask the user to tick "Allow scripts" next to Connect Claude if they want this.');
    if (typeof code !== 'string' || !code.trim()) throw new Error('code is required.');
    const ok = global.confirm(`Claude wants to run a script in this VibeMol tab.\n\nPurpose: ${clean(purpose, 300) || '(not given)'}\n\n${code.slice(0, 1500)}${code.length > 1500 ? '\n…' : ''}\n\nRun it?`);
    if (!ok) throw new Error('The user declined to run the script.');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const value = await new AsyncFunction('VibeMol', code)(global);
    let json;
    try { json = JSON.stringify(value === undefined ? null : value); } catch { json = JSON.stringify(String(value)); }
    return { result: JSON.parse(json.length > 20000 ? JSON.stringify(json.slice(0, 20000)) : json) };
  }

  global.VibeMolAgentUI = Object.freeze({ listControls, operateControl, pressKey, readText, runScript, _labelFor: labelFor });
})(typeof window !== 'undefined' ? window : globalThis);
