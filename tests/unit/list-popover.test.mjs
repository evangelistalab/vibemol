import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalModule } from './load-global-module.mjs';

function loadHelpers() {
  const context = loadGlobalModule('src/components/VmListPopover.js');
  return context.VibeMolListPopover;
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.tabIndex = -1;
    this._textContent = '';
    this._classes = new Set();
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    if (index < 0) return null;
    return this.parentNode.children[index + 1] || null;
  }

  get className() {
    return Array.from(this._classes).join(' ');
  }

  set className(value) {
    this._classes = new Set(String(value || '').split(/\s+/u).filter(Boolean));
  }

  get classList() {
    return {
      add: (...names) => {
        for (const name of names) {
          if (name) this._classes.add(String(name));
        }
      },
      remove: (...names) => {
        for (const name of names) this._classes.delete(String(name));
      },
      toggle: (name, force = undefined) => {
        const key = String(name);
        if (force === true) {
          this._classes.add(key);
          return true;
        }
        if (force === false) {
          this._classes.delete(key);
          return false;
        }
        if (this._classes.has(key)) {
          this._classes.delete(key);
          return false;
        }
        this._classes.add(key);
        return true;
      },
      contains: (name) => this._classes.has(String(name)),
    };
  }

  get textContent() {
    if (this.children.length) return this.children.map((child) => child.textContent).join('');
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value == null ? '' : value);
    this.children = [];
  }

  set innerHTML(value) {
    this.children = [];
    this._textContent = String(value == null ? '' : value);
  }

  get innerHTML() {
    return this._textContent;
  }

  appendChild(child) {
    if (!child) return child;
    if (child.parentNode) child.parentNode.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  insertBefore(child, referenceNode) {
    if (!referenceNode) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = this.children.indexOf(referenceNode);
    if (index < 0) return this.appendChild(child);
    this.children.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }

  setAttribute(name, value) {
    const key = String(name);
    const text = String(value);
    this.attributes[key] = text;
    if (key === 'class') this.className = text;
    if (key.startsWith('data-')) {
      const dataKey = key
        .slice(5)
        .replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
      this.dataset[dataKey] = text;
    }
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  focus() {}

  querySelectorAll(selector) {
    const matcher = createSelectorMatcher(selector);
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (matcher(child)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function createSelectorMatcher(selector) {
  const raw = String(selector || '').trim();
  const attrMatch = raw.match(/\[([^=\]]+)(?:="([^"]*)")?\]/u);
  const attrName = attrMatch ? attrMatch[1] : '';
  const attrValue = attrMatch ? attrMatch[2] : null;
  const withoutAttr = raw.replace(/\[[^\]]+\]/gu, '');
  const [tagPart, classPart] = withoutAttr.split('.');
  const tagName = tagPart ? tagPart.trim().toUpperCase() : '';
  const className = classPart ? classPart.trim() : '';
  return (node) => {
    if (!(node instanceof FakeElement)) return false;
    if (tagName && node.tagName !== tagName) return false;
    if (className && !node.classList.contains(className)) return false;
    if (attrName) {
      const value = attrName.startsWith('data-')
        ? node.dataset[attrName.slice(5).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase())]
        : node.getAttribute(attrName);
      if (attrValue == null) return value != null;
      return String(value) === attrValue;
    }
    return true;
  };
}

function createFakeDomContext() {
  const createElement = (tagName) => new FakeElement(tagName);
  const body = createElement('body');
  return {
    Node: FakeElement,
    document: {
      body,
      createElement,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
  };
}

test('findNextEditableCellPosition walks row-major editable cells', () => {
  const helpers = loadHelpers();
  const schema = [
    { key: 'order', editable: true },
    { key: 'sym', editable: true },
    { key: 'energy', editable: false },
    { key: 'x', editable: true },
  ];
  assert.deepEqual(
    normalize(helpers.findNextEditableCellPosition(schema, 2, 0, 'sym', 1)),
    { rowIndex: 0, columnKey: 'x' },
  );
  assert.deepEqual(
    normalize(helpers.findNextEditableCellPosition(schema, 2, 1, 'order', -1)),
    { rowIndex: 0, columnKey: 'x' },
  );
  assert.equal(
    helpers.findNextEditableCellPosition(schema, 1, 0, 'x', 1),
    null,
  );
});

test('formatOrbitalSpinGlyph normalizes alpha beta and restricted labels', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.formatOrbitalSpinGlyph('Alpha'), 'α');
  assert.equal(helpers.formatOrbitalSpinGlyph('beta'), 'β');
  assert.equal(helpers.formatOrbitalSpinGlyph(''), '·');
  assert.equal(helpers.formatOrbitalSpinGlyph(null), '·');
});

test('getOrbitalBoundary and formatOrbitalRelativeLabel derive HOMO/LUMO positions', () => {
  const helpers = loadHelpers();
  const items = [
    { occ: 2.0 },
    { occ: 2.0 },
    { occ: 0.0 },
    { occ: 0.0 },
  ];
  assert.deepEqual(normalize(helpers.getOrbitalBoundary(items)), { lastOccupiedIndex: 1, firstVirtualIndex: 2 });
  assert.equal(helpers.formatOrbitalRelativeLabel(items, 1), 'HOMO');
  assert.equal(helpers.formatOrbitalRelativeLabel(items, 2), 'LUMO');
  assert.equal(helpers.formatOrbitalRelativeLabel(items, 0), 'HOMO-1');
  assert.equal(helpers.formatOrbitalRelativeLabel(items, 3), 'LUMO+1');
});

test('passesOrbitalEnergyThreshold filters on absolute energy magnitude', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.passesOrbitalEnergyThreshold(-0.6, 0.5), true);
  assert.equal(helpers.passesOrbitalEnergyThreshold(0.4, 0.5), false);
  assert.equal(helpers.passesOrbitalEnergyThreshold(0.1, 0), true);
});

test('VmListPopover renders exactly one divider between occupied and virtual orbital rows', () => {
  const context = loadGlobalModule('src/components/VmListPopover.js', {
    globals: createFakeDomContext(),
  });
  const helpers = context.VibeMolListPopover;
  const bodyEl = new FakeElement('div');
  const controller = helpers.createListPopoverController({
    bodyEl,
    columnSchema: [{ key: 'occ', label: 'Occ' }],
    getItems: () => [{ occ: 2 }, { occ: 2 }, { occ: 2 }, { occ: 0 }, { occ: 0 }],
    getDividerBeforeIndex: (rowIndex, items) => {
      const boundary = helpers.getOrbitalBoundary(items);
      return rowIndex === boundary.firstVirtualIndex ? 'HOMO / LUMO' : '';
    },
  });
  controller.render();
  const tableEl = bodyEl.children[0];
  const tbodyEl = tableEl.children[1];
  const dividerRows = tbodyEl.children.filter((child) => child.classList.contains('vm-list-popover__divider'));
  assert.equal(dividerRows.length, 1);
  assert.equal(dividerRows[0].textContent, 'HOMO / LUMO');
  const rowSequence = tbodyEl.children.map((child) => (
    child.classList.contains('vm-list-popover__divider')
      ? 'divider'
      : `row:${child.dataset.rowIndex}`
  ));
  assert.deepEqual(rowSequence, ['row:0', 'row:1', 'row:2', 'divider', 'row:3', 'row:4']);
});
