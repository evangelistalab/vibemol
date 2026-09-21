import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { REPO_ROOT } from './load-global-module.mjs';

const extensionRoot = path.join(REPO_ROOT, 'src/vscode_ext/vibemol');
const requireExtension = createRequire(path.join(extensionRoot, 'package.json'));
const { readFolderFiles, parentFolder, MAX_FILE_BYTES } = requireExtension('./src/folderFiles');
const FileType = { File: 1, Directory: 2, SymbolicLink: 64 };

function uri(pathname, scheme = 'file', authority = '') {
  return {
    path: pathname, scheme, authority,
    with(change) { return uri(change.path ?? this.path, this.scheme, this.authority); },
    toString() { return `${this.scheme}://${this.authority}${this.path}`; },
  };
}
const Uri = {
  joinPath: (base, ...parts) => base.with({ path: path.posix.join(base.path, ...parts) }),
};
const folder = uri('/calculations/my folder');

function folderHost(entries, directory = folder) {
  const reads = [], warnings = [], infos = [], errors = [];
  const vscode = {
    Uri, FileType, ViewColumn: { Active: -1 },
    workspace: {
      textDocuments: [],
      fs: {
        readDirectory: async target => {
          assert.equal(target.toString(), directory.toString(), 'Only the selected folder is scanned');
          return Object.entries(entries).map(([name, entry]) => [name, entry.type ?? FileType.File]);
        },
        stat: async target => ({ size: entries[path.posix.basename(target.path)].size ?? 100 }),
        readFile: async target => {
          const name = path.posix.basename(target.path); reads.push(name);
          const entry = entries[name];
          if (entry.error) throw new Error(entry.error);
          return Buffer.from(entry.text ?? 'coordinates');
        },
      },
    },
    window: {
      showWarningMessage: message => warnings.push(message),
      showInformationMessage: message => infos.push(message),
      showErrorMessage: message => errors.push(message),
    },
    commands: { executeCommand() {} },
  };
  return { vscode, reads, warnings, infos, errors };
}

function loadModule(name, vscode, overrides = {}) {
  const filename = path.join(extensionRoot, 'src', name);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, __dirname: path.dirname(filename), Buffer, console, URL,
    setTimeout, clearTimeout,
    require: id => {
      if (id in overrides) return overrides[id];
      if (id === 'vscode') return vscode;
      // CI need not generate the bundle to exercise the actual HTML integration.
      if (id === 'fs') return { ...fs, readFileSync: (file, ...args) => fs.readFileSync(
        file === path.join(extensionRoot, 'app/index.html') ? path.join(REPO_ROOT, 'index.html') : file, ...args) };
      return createRequire(filename)(id);
    },
  }, { filename });
  return module.exports;
}

function makePanel() {
  const receivers = new Set(), disposals = [], posts = [];
  let html = '';
  const panel = {
    webview: {
      cspSource: 'https://webview.example',
      asWebviewUri: () => ({ toString: () => 'https://webview.example/app' }),
      onDidReceiveMessage: fn => { receivers.add(fn); return { dispose: () => receivers.delete(fn) }; },
      postMessage: async msg => { posts.push(msg); return true; },
      set html(value) { assert.ok(receivers.size, 'Host listener must precede HTML'); html = value; },
      get html() { return html; },
    },
    onDidChangeViewState: () => ({ dispose() {} }),
    onDidDispose: fn => disposals.push(fn),
    dispose: () => disposals.forEach(fn => fn()),
    receive: async msg => { for (const fn of receivers) await fn(msg); },
    posts,
  };
  return panel;
}

test('VS Code folder imports select molecular files, exclude presets/sessions, and do not recurse', async () => {
  const host = folderHost({
    'MO10.cube': {}, 'MO2.CUBE': {}, 'structure.xyz': {}, 'molecule.molden': {},
    'modes.hess': {}, 'output.dat': {}, 'nested': { type: FileType.Directory },
    'linked.xyz': { type: FileType.File | FileType.SymbolicLink },
    'notes.txt': {}, 'state.vibemol-session': {},
    'package.json': { text: '{"name":"test"}' },
    'look.json': { text: '{"kind":"vibemol.preset"}' },
    'state.json': { text: '{"kind":"vibemol.session"}' },
    'edited.json': { text: '{"kind":"vibemol.structure"}' },
    'vibration.json': { text: '{"modes":[]}' },
    'molecule.vib.json': { text: '{"kind":"vibemol.vibrations","modes":[]}' },
  });
  const result = await readFolderFiles(host.vscode, folder, null, Uri.joinPath(folder, 'structure.xyz'));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.files.map(file => file.fileName), [
    'structure.xyz', 'edited.json', 'MO2.CUBE', 'MO10.cube', 'modes.hess',
    'molecule.molden', 'molecule.vib.json', 'output.dat', 'vibration.json',
  ]);
  for (const excluded of ['notes.txt', 'nested', 'linked.xyz', 'state.vibemol-session']) {
    assert.ok(!host.reads.includes(excluded));
  }
});

test('VS Code folder imports use unsaved documents and preserve remote URI authorities', async () => {
  const remote = uri('/work/calculation', 'vscode-remote', 'ssh-remote+cluster');
  const host = folderHost({ 'first.xyz': {}, 'second.xyz': {} }, remote);
  const selected = { uri: Uri.joinPath(remote, 'first.xyz'), getText: () => 'unsaved first' };
  host.vscode.workspace.textDocuments.push({ uri: Uri.joinPath(remote, 'second.xyz'), getText: () => 'unsaved second' });
  const result = await readFolderFiles(host.vscode, parentFolder(selected.uri), selected);
  assert.deepEqual(result.files.map(file => file.contents), ['unsaved first', 'unsaved second']);
  assert.deepEqual(host.reads, []);
  const newDocument = { uri: Uri.joinPath(remote, 'new.xyz'), getText: () => 'not on disk' };
  assert.equal((await readFolderFiles(host.vscode, remote, newDocument)).files[0].contents, 'not on disk');
});

test('VS Code folders have no fifty-file cutoff and report unreadable/oversized/invalid sidecars', async () => {
  const entries = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`MO${i}.cube`, {}]));
  Object.assign(entries, {
    'large.cube': { size: MAX_FILE_BYTES + 1 }, 'bad.xyz': { error: 'permission denied' },
    'bad.vib.json': { text: 'broken' },
    'preset.modes.json': { text: '{"kind":"vibemol.preset","modes":[]}' },
  });
  const host = folderHost(entries);
  const result = await readFolderFiles(host.vscode, folder);
  assert.equal(result.files.length, 60);
  assert.equal(result.errors.length, 4);
  assert.ok(result.errors.some(error => error.includes('permission denied')));
  assert.ok(!host.reads.includes('large.cube'));
});

test('VS Code custom editors and folder launchers send one batch after readiness', async () => {
  for (const customEditor of [true, false]) {
    const host = folderHost({ 'a.xyz': {}, 'a.vib.json': { text: '{"modes":[]}' } });
    const panel = makePanel(); host.vscode.window.createWebviewPanel = () => panel;
    const { VibeMolEditorProvider, vmWebview } = loadModule('vmWebview.js', host.vscode);
    const provider = new VibeMolEditorProvider(uri(extensionRoot));
    if (customEditor) await provider.resolveCustomTextEditor({ uri: Uri.joinPath(folder, 'a.xyz'), getText: () => 'current edit' }, panel);
    else vmWebview(uri(extensionRoot), null, provider, { folderUri: folder });
    assert.equal(panel.posts.length, 0);
    assert.equal(host.reads.length, 0);
    await panel.receive({ command: 'ready' });
    await panel.receive({ command: 'ready' });
    assert.equal(panel.posts.length, 1);
    assert.equal(panel.posts[0].files.length, 2);
    if (customEditor) assert.equal(panel.posts[0].files[0].contents, 'current edit');
    assert.equal(provider._activePanel, panel);
    panel.dispose(); assert.equal(provider._activePanel, null);
  }
});

test('VS Code panel disposal cancels delivery and directory failures are visible', async () => {
  const host = folderHost({ 'a.xyz': {} }), panel = makePanel();
  const { VibeMolEditorProvider } = loadModule('vmWebview.js', host.vscode);
  const provider = new VibeMolEditorProvider(uri(extensionRoot));
  await provider.resolveCustomTextEditor({ uri: Uri.joinPath(folder, 'a.xyz'), getText: () => 'data' }, panel);
  let finish;
  host.vscode.workspace.fs.readDirectory = () => new Promise(resolve => { finish = resolve; });
  const pending = panel.receive({ command: 'ready' });
  panel.dispose(); finish([['a.xyz', FileType.File]]); await pending;
  assert.equal(panel.posts.length, 0);
  const other = makePanel();
  await provider.resolveCustomTextEditor({ uri: Uri.joinPath(folder, 'a.xyz'), getText: () => 'data' }, other);
  host.vscode.workspace.fs.readDirectory = async () => { throw new Error('unreadable directory'); };
  await other.receive({ command: 'ready' });
  assert.match(host.errors[0], /unreadable directory/);
});

test('VS Code browser bridge waits for the app and retains messages received during startup', async () => {
  const host = folderHost({}), panel = makePanel();
  host.vscode.window.createWebviewPanel = () => panel;
  loadModule('vmWebview.js', host.vscode).vmWebview(uri(extensionRoot), null, null);
  const scripts = [...panel.webview.html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const listeners = new Map(), announced = [], loads = [];
  const window = {
    addEventListener(name, fn, options = {}) {
      const list = listeners.get(name) || []; list.push({ fn, once: options.once }); listeners.set(name, list);
    },
  };
  const dispatch = (name, event = {}) => {
    const list = listeners.get(name) || []; listeners.set(name, list.filter(item => !item.once));
    list.forEach(({ fn }) => fn(event));
  };
  const context = vm.createContext({
    window, document: { readyState: 'loading', createElement: () => ({ click() {} }) },
    acquireVsCodeApi: () => ({ postMessage: msg => announced.push(msg) }),
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Response,
  });
  for (const source of scripts.filter(text => text.includes('const pendingFileLoads') || text.includes('const vscodeApi'))) {
    vm.runInContext(source, context);
  }
  assert.equal(announced.length, 0, 'The old head-script ready message lost initial files');
  dispatch('message', { data: { command: 'droppedFileContents', files: [{ fileName: 'early.xyz', contents: 'coordinates' }] } });
  assert.equal(loads.length, 0);
  window.VibeMolEmbed = { loadFiles: async (...args) => { loads.push(args); return { ok: true }; } };
  dispatch('DOMContentLoaded');
  assert.equal(announced.length, 1); assert.equal(announced[0].command, 'ready');
  assert.equal(loads.length, 1); assert.equal(loads[0][0][0].name, 'early.xyz');
  assert.equal(loads[0][1].clearFirst, false);
  dispatch('DOMContentLoaded'); assert.equal(announced.length, 1);
});

test('VS Code folder command supports Explorer folders, picker cancellation, and one selected folder', async () => {
  const commands = new Map(), opened = [];
  const host = folderHost({});
  host.vscode.commands.registerCommand = (name, fn) => { commands.set(name, fn); return { dispose() {} }; };
  let picked;
  host.vscode.window.showOpenDialog = async options => {
    assert.equal(options.canSelectFolders, true); assert.equal(options.canSelectFiles, false);
    return picked;
  };
  loadModule('extension.js', host.vscode, { './vmWebview': {
    VibeMolEditorProvider: { register: () => ({}) }, vmWebview: (...args) => opened.push(args),
  } }).activate({ extensionUri: uri(extensionRoot), subscriptions: [] });
  await commands.get('vibemol.openFolder')(folder);
  assert.equal(opened.length, 1); assert.equal(opened[0][3].folderUri, folder);
  await commands.get('vibemol.openFolder')(); assert.equal(opened.length, 1);
  picked = [folder]; await commands.get('vibemol.openFolder')(); assert.equal(opened.length, 2);
});
