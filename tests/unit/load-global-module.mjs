import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '..', '..');

function createBaseContext(extraGlobals = {}) {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance: { now: () => 0 },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ getContext: () => null }),
      body: {},
    },
    navigator: { userAgent: 'node-test' },
  };
  Object.assign(context, extraGlobals || {});
  context.window = context;
  context.self = context;
  context.globalThis = context;
  context.global = context;
  return vm.createContext(context);
}

export function createModuleContext(extraGlobals = {}) {
  return createBaseContext(extraGlobals);
}

export function loadGlobalModule(relativePath, options = {}) {
  const context = options.context || createModuleContext(options.globals || {});
  if (options.globals) Object.assign(context, options.globals);
  const absPath = path.resolve(REPO_ROOT, relativePath);
  const source = fs.readFileSync(absPath, 'utf8');
  vm.runInContext(source, context, { filename: absPath });
  return context;
}

export function loadGlobalModules(relativePaths, options = {}) {
  const context = options.context || createModuleContext(options.globals || {});
  for (const relativePath of relativePaths) loadGlobalModule(relativePath, { context });
  return context;
}

export function materializeInContext(context, value) {
  return vm.runInContext(`(${JSON.stringify(value)})`, context);
}

export function evaluateInContext(context, source) {
  return vm.runInContext(source, context);
}

export { REPO_ROOT };
