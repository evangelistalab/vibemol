const vscode = require('vscode');
const crypto = require('crypto');
const https = require('https');
const path = require('path');
const { parentFolder, readFolderFiles, MAX_FILE_BYTES } = require('./folderFiles');

const MAX_DROPPED_FILES = 50;
const MAX_DROPPED_FILE_BYTES = MAX_FILE_BYTES;
const MAX_PUBCHEM_RESPONSE_BYTES = 25 * 1024 * 1024;
const PUBCHEM_REQUEST_TIMEOUT_MS = 30000;
const PUBCHEM_HOST = 'pubchem.ncbi.nlm.nih.gov';
const PUBCHEM_ALLOWED_PATH_PREFIXES = [
  '/rest/autocomplete/compound/',
  '/rest/pug/compound/'
];
const VIBEMOL_FILE_SUFFIXES = [
  '.vmodes.json',
  '.modes.json',
  '.vib.json',
  '.2ccube',
  '.output',
  '.molden',
  '.cube',
  '.cub',
  '.xyz',
  '.hess',
  '.dat',
  '.out',
  '.json'
];

function getNonce() {
  return crypto.randomBytes(16).toString('base64').replace(/[+/=]/g, '');
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function stripRemoteScriptTags(html) {
  return html.replace(/<script\b(?=[^>]*\bsrc=["']https?:\/\/)[^>]*>\s*<\/script>/gi, '');
}

function addNonceToScriptTags(html, nonce) {
  const escapedNonce = escapeHtmlAttribute(nonce);
  return html.replace(/<script\b(?![^>]*\bnonce=)/gi, `<script nonce="${escapedNonce}"`);
}

function buildContentSecurityPolicy(cspSource, nonce) {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data: blob:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `font-src ${cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
    `connect-src ${cspSource} blob:`,
    `worker-src ${cspSource} blob:`,
    `media-src ${cspSource} blob:`,
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');
}

function hasSupportedVibeMolSuffix(fileName) {
  const lower = String(fileName || '').toLowerCase();
  return VIBEMOL_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function validateJsonFileContents(fileName, contents) {
  if (!String(fileName || '').toLowerCase().endsWith('.json')) return;
  let parsed = null;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error(`${fileName}: invalid JSON`);
  }
  const kind = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? String(parsed.kind || '')
    : '';
  const looksLikeVibrationPayload = parsed
    && typeof parsed === 'object'
    && !Array.isArray(parsed)
    && (Array.isArray(parsed.modes) || Array.isArray(parsed.vibrations));
  if (
    kind !== 'vibemol.preset'
    && kind !== 'vibemol.structure'
    && kind !== 'vibemol.vibrations'
    && !looksLikeVibrationPayload
  ) {
    throw new Error(`${fileName}: JSON payload is not a recognized VibeMol document`);
  }
}

function isUriInsideWorkspace(uri) {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) return true;
  const filePath = path.resolve(uri.fsPath);
  const normalizedFilePath = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
  return folders.some((folder) => {
    if (folder.uri.scheme !== 'file') return false;
    const rootPath = path.resolve(folder.uri.fsPath);
    const normalizedRootPath = process.platform === 'win32' ? rootPath.toLowerCase() : rootPath;
    const relative = path.relative(normalizedRootPath, normalizedFilePath);
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

async function validateDroppedFileUri(uri) {
  if (uri.scheme !== 'file') {
    throw new Error('only local file:// drops are supported');
  }
  const fileName = path.basename(uri.fsPath);
  if (!hasSupportedVibeMolSuffix(fileName)) {
    throw new Error(`${fileName}: unsupported file type`);
  }
  if (!isUriInsideWorkspace(uri)) {
    throw new Error(`${fileName}: file is outside the current workspace`);
  }
  const stat = await vscode.workspace.fs.stat(uri);
  if (stat.type & vscode.FileType.Directory) {
    throw new Error(`${fileName}: directories are not supported`);
  }
  if (!(stat.type & vscode.FileType.File)) {
    throw new Error(`${fileName}: not a regular file`);
  }
  if (typeof stat.size === 'number' && stat.size > MAX_DROPPED_FILE_BYTES) {
    throw new Error(`${fileName}: file is larger than ${Math.round(MAX_DROPPED_FILE_BYTES / 1024 / 1024)} MB`);
  }
  return fileName;
}

async function readDroppedFiles(msg) {
  const uriStrings = Array.isArray(msg && msg.uris) ? msg.uris : [];
  const files = [];
  const errors = [];
  if (uriStrings.length > MAX_DROPPED_FILES) {
    errors.push(`Only the first ${MAX_DROPPED_FILES} dropped files were read.`);
  }
  for (const uriStr of uriStrings.slice(0, MAX_DROPPED_FILES)) {
    try {
      if (typeof uriStr !== 'string') throw new Error('invalid dropped URI');
      const uri = vscode.Uri.parse(uriStr);
      const fileName = await validateDroppedFileUri(uri);
      const bytes = await vscode.workspace.fs.readFile(uri);
      const contents = Buffer.from(bytes).toString('utf8');
      validateJsonFileContents(fileName, contents);
      files.push({ fileName, contents });
    } catch (err) {
      errors.push(err && err.message ? err.message : String(err));
    }
  }
  return { files, errors };
}

async function handleDroppedFileRead(msg, webview) {
  const { files, errors } = await readDroppedFiles(msg);
  if (errors.length > 0) {
    const sample = errors.slice(0, 3).join('; ');
    vscode.window.showWarningMessage(`VibeMol skipped ${errors.length} dropped file(s): ${sample}`);
    await webview.postMessage({ command: 'fileReadErrors', errors });
  }
  if (files.length > 0) {
    await webview.postMessage({ command: 'droppedFileContents', files });
  }
}

function validatePubChemUrl(rawUrl) {
  let parsed = null;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch {
    throw new Error('invalid PubChem URL');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== PUBCHEM_HOST) {
    throw new Error('only PubChem HTTPS requests are supported');
  }
  if (!PUBCHEM_ALLOWED_PATH_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))) {
    throw new Error('unsupported PubChem endpoint');
  }
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  return parsed;
}

function fetchPubChemUrl(rawUrl, redirectCount = 0) {
  const url = validatePubChemUrl(rawUrl);
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'Accept': 'application/json,text/plain,*/*',
        'User-Agent': 'VibeMol VSCode Extension'
      },
      timeout: PUBCHEM_REQUEST_TIMEOUT_MS
    }, (res) => {
      const status = res.statusCode || 0;
      const location = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        res.resume();
        if (redirectCount >= 3) {
          reject(new Error('PubChem redirect limit exceeded'));
          return;
        }
        const nextUrl = new URL(location, url).toString();
        fetchPubChemUrl(nextUrl, redirectCount + 1).then(resolve, reject);
        return;
      }

      const contentLength = Number(res.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > MAX_PUBCHEM_RESPONSE_BYTES) {
        res.resume();
        reject(new Error('PubChem response is too large'));
        return;
      }

      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_PUBCHEM_RESPONSE_BYTES) {
          req.destroy(new Error('PubChem response is too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({
          status,
          statusText: res.statusMessage || '',
          headers: {
            'content-type': String(res.headers['content-type'] || 'text/plain')
          },
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('PubChem request timed out'));
    });
    req.on('error', reject);
  });
}

async function handlePubChemFetch(msg, webview) {
  const requestId = String(msg && msg.requestId || '').slice(0, 120);
  try {
    if (!requestId) throw new Error('missing PubChem request id');
    const result = await fetchPubChemUrl(msg.url);
    await webview.postMessage(Object.assign({
      command: 'pubchemFetchResult',
      requestId,
      ok: true
    }, result));
  } catch (err) {
    await webview.postMessage({
      command: 'pubchemFetchResult',
      requestId,
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

// ─── Shared download handler ─────────────────────────────────────────────────
// Called from any panel's onDidReceiveMessage when the webview intercepts a
// blob download and posts the file bytes here instead.

async function handleDownload(msg) {
  try {
    const safeFileName = path.basename(String(msg.fileName || 'vibemol-download')).trim() || 'vibemol-download';
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(safeFileName),
      filters: { 'All Files': ['*'] }
    });
    if (!saveUri) return; // user cancelled
    await vscode.workspace.fs.writeFile(saveUri, Uint8Array.from(msg.bytes));
    console.log('[vmWebview] downloaded:', saveUri.path);
  } catch (err) {
    console.error('[vmWebview] download failed:', err);
    vscode.window.showErrorMessage(`VibeMol: failed to save ${msg.fileName}: ${err.message}`);
  }
}

// ─── Custom Editor Provider ───────────────────────────────────────────────────

class VibeMolEditorProvider {
  static viewType = 'vibemol.xyzEditor';

  static register(context) {
    const provider = new VibeMolEditorProvider(context.extensionUri);

    // Register undo/redo once globally — they forward to whichever panel is active
    context.subscriptions.push(
      vscode.commands.registerCommand('vibemol.undo', () => {
        provider._activePanel?.webview.postMessage({ command: 'keydown', key: 'z', metaKey: true });
      }),
      vscode.commands.registerCommand('vibemol.redo', () => {
        provider._activePanel?.webview.postMessage({ command: 'keydown', key: 'z', metaKey: true, shiftKey: true });
      })
    );

    const disposable = vscode.window.registerCustomEditorProvider(
      VibeMolEditorProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: false }
    );
    context.subscriptions.push(disposable);
    return provider; // return provider so callers can pass it to vmWebview
  }

  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._activePanel = null;
  }

  async resolveCustomTextEditor(document, webviewPanel) {
    initializePanel(this._extensionUri, webviewPanel, this, {
      folderUri: parentFolder(document.uri), selectedDocument: document,
    });
  }
}

// Both custom editors and explicit folder launches use the same batch loader
// and readiness handshake. No timer may send data before the app can receive it.
function initializePanel(extensionUri, panel, provider, options = {}) {
  const projectRoot = vscode.Uri.joinPath(extensionUri, 'app');
  panel.webview.options = { enableScripts: true, localResourceRoots: [projectRoot] };
  panel.iconPath = vscode.Uri.joinPath(projectRoot, 'assets', 'app', 'img', 'favicon-tetra.svg');
  let disposed = false, initialLoaded = false;
  if (provider) provider._activePanel = panel;
  const viewListener = panel.onDidChangeViewState(e => {
    if (provider && e.webviewPanel.active) provider._activePanel = panel;
  });
  const messageListener = panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || disposed) return;
    if (msg.command === 'ready' && !initialLoaded) {
      initialLoaded = true;
      if (!options.folderUri) return;
      try {
        const { files, errors } = await readFolderFiles(vscode, options.folderUri,
          options.selectedDocument, options.selectedUri);
        if (disposed) return;
        if (errors.length) vscode.window.showWarningMessage(
          'VibeMol skipped ' + errors.length + ' file(s): ' + errors.slice(0, 3).join('; '));
        if (files.length) await panel.webview.postMessage({ command: 'droppedFileContents', files });
        else if (!errors.length) vscode.window.showInformationMessage('VibeMol: no supported molecular files in this folder.');
      } catch (error) {
        if (!disposed) vscode.window.showErrorMessage('VibeMol: could not read folder: ' + (error.message || error));
      }
    } else if (msg.command === 'initializationError') {
      vscode.window.showErrorMessage('VibeMol could not start its file loader. Reload the window to try again.');
    } else if (msg.command === 'readDroppedFiles') {
      await handleDroppedFileRead(msg, panel.webview);
    } else if (msg.command === 'downloadFile') {
      await handleDownload(msg);
    } else if (msg.command === 'pubchemFetch') {
      await handlePubChemFetch(msg, panel.webview);
    }
  });
  panel.onDidDispose(() => {
    disposed = true;
    messageListener.dispose(); viewListener.dispose();
    if (provider && provider._activePanel === panel) provider._activePanel = null;
    vscode.commands.executeCommand('setContext', 'vibemolWebviewFocused', false);
  });
  const resourceUri = panel.webview.asWebviewUri(projectRoot);
  // Register the listener before assigning HTML: even a cached app may start
  // immediately, and the initial folder must never be lost in that interval.
  panel.webview.html = getWebviewContent(panel.webview, resourceUri, resourceUri);
}

function vmWebview(extensionUri, fileUri, provider, options = {}) {
  const folderUri = options.folderUri || (fileUri ? parentFolder(fileUri) : null);
  const title = folderUri ? 'VibeMol — ' + path.posix.basename(folderUri.path) : 'VibeMol';
  const panel = vscode.window.createWebviewPanel(
    'vibemol_viewer', title, vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  initializePanel(extensionUri, panel, provider, { folderUri, selectedUri: fileUri });
  return panel;
}

function getWebviewContent(webview, scriptUri, assetUri) {
  const fs = require('fs');
  const path = require('path');

  // Read index.html from the project root (3 levels up from the extension src dir)
  const indexPath = path.join(__dirname, '..', 'app', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const nonce = getNonce();
  const escapedNonce = escapeHtmlAttribute(nonce);
  const csp = escapeHtmlAttribute(buildContentSecurityPolicy(webview.cspSource, nonce));

  // ── 1. Rewrite local src= and href= to use the VSCode webview URI ────────
  // Matches src="..." and href="..." that don't start with http/https,
  // vscode-webview, data:, blob:, or # (anchors)
  const base = scriptUri.toString();
  html = stripRemoteScriptTags(html).replace(
    /(src|href)="(?!https?:|vscode-webview:|data:|blob:|#)([^"]*)"/g,
    (match, attr, url) => `${attr}="${base}/${url.replace(/^\.\/|^\//, '')}"`
  );
  html = addNonceToScriptTags(html, nonce);
  html = html.replace(
    /<head(\s[^>]*)?>/i,
    (match) => `${match}\n  <meta http-equiv="Content-Security-Policy" content="${csp}" />`
  );

  // ── 2. Build the VSCode integration scripts to inject ────────────────────
  const vscodeScripts = `
        <meta id="vscode-uris"
            data-script-uri="${escapeHtmlAttribute(scriptUri)}"
            data-asset-uri="${escapeHtmlAttribute(assetUri)}"
        />
<script nonce="${escapedNonce}">
    const _meta = document.getElementById('vscode-uris');
    window.VSCODE_BASE_URI = _meta.getAttribute('data-script-uri');

    function rewriteUrl(url) {
        if (typeof url === 'string'
            && !/^(?:https?:|vscode-webview:|data:|blob:)/.test(url)) {
            return window.VSCODE_BASE_URI + '/' + url.replace(/^\\.\\/|^\\//, '');
        }
        return url;
    }

    function isPubChemUrl(url) {
        try {
            const parsed = new URL(String(url), location.href);
            return parsed.protocol === 'https:'
                && parsed.hostname === 'pubchem.ncbi.nlm.nih.gov'
                && (parsed.pathname.startsWith('/rest/autocomplete/compound/')
                    || parsed.pathname.startsWith('/rest/pug/compound/'));
        } catch (_) {
            return false;
        }
    }

    // Patch fetch
    const _originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = function patchedFetch(url, options) {
        const method = String((options && options.method) || 'GET').toUpperCase();
        if (method === 'GET' && isPubChemUrl(url)) {
            if (typeof window.VibeMolVsCodePubChemFetch === 'function') {
                return window.VibeMolVsCodePubChemFetch(String(url));
            }
            return Promise.reject(new TypeError('VibeMol VS Code PubChem bridge is unavailable.'));
        }
        url = rewriteUrl(url);
        return _originalFetch(url, options);
    };

    // Patch HTMLImageElement.prototype.src — catches ALL image src assignments
    const _srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
        set(url) {
            const rewritten = rewriteUrl(url);
            _srcDescriptor.set.call(this, rewritten);
        },
        get() { return _srcDescriptor.get.call(this); },
        configurable: true
    });
<\/script>
<script nonce="${escapedNonce}">
    const pendingFileLoads = [];
    function loadVsCodeFiles(msg) {
        if (!window.VibeMolEmbed || typeof window.VibeMolEmbed.loadFiles !== 'function') {
            pendingFileLoads.push(msg);
            return;
        }
        window.VibeMolEmbed.loadFiles(
            msg.files.map(f => ({ name: f.fileName, text: f.contents })),
            { clearFirst: false }
        ).then(r => console.log('[vscode-drop] loadFiles result:', r))
            .catch(e => console.error('[vscode-drop] loadFiles error:', e));
    }
    window.addEventListener('DOMContentLoaded', () => {
        for (const msg of pendingFileLoads.splice(0)) loadVsCodeFiles(msg);
    }, { once: true });
    window.addEventListener('message', (event) => {
        const msg = event.data || {};
        if (msg.command === 'keydown') {
            const ke = new KeyboardEvent('keydown', {
                key: msg.key,
                metaKey: !!msg.metaKey,
                shiftKey: !!msg.shiftKey,
                ctrlKey: !!msg.ctrlKey,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(ke);
        }
        if (msg.command === 'droppedFileContents' && Array.isArray(msg.files)) loadVsCodeFiles(msg);
        if (msg.command === 'fileReadErrors') {
            console.warn('[vscode-drop] skipped files:', msg.errors);
        }
    });
<\/script>
<script nonce="${escapedNonce}">
    (() => {
    const vscodeApi = (typeof acquireVsCodeApi === 'function')
        ? (() => { try { return acquireVsCodeApi(); } catch(e) { return null; } })()
        : null;
    const pubchemRequests = new Map();
    let pubchemRequestSeq = 0;

    window.VibeMolVsCodePubChemFetch = function(url) {
        if (!vscodeApi) return Promise.reject(new TypeError('VibeMol VS Code API is unavailable.'));
        const requestId = 'pubchem-' + Date.now() + '-' + (++pubchemRequestSeq);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pubchemRequests.delete(requestId);
                reject(new TypeError('PubChem request timed out.'));
            }, 35000);
            pubchemRequests.set(requestId, { resolve, reject, timeout });
            vscodeApi.postMessage({ command: 'pubchemFetch', requestId, url: String(url) });
        });
    };

    window.addEventListener('message', (event) => {
        const msg = event.data || {};
        if (msg.command !== 'pubchemFetchResult') return;
        const pending = pubchemRequests.get(msg.requestId);
        if (!pending) return;
        pubchemRequests.delete(msg.requestId);
        clearTimeout(pending.timeout);
        if (!msg.ok) {
            pending.reject(new TypeError(msg.error || 'PubChem request failed.'));
            return;
        }
        pending.resolve(new Response(msg.body || '', {
            status: Number(msg.status) || 200,
            statusText: String(msg.statusText || ''),
            headers: msg.headers || {}
        }));
    });

    const announceReady = () => {
        if (vscodeApi) vscodeApi.postMessage({
            command: window.VibeMolEmbed && typeof window.VibeMolEmbed.loadFiles === 'function'
                ? 'ready' : 'initializationError'
        });
    };
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', announceReady, { once: true });
    } else announceReady();

    // Intercept <a download> blob clicks — VSCode webviews silently swallow them
    const _origCreateElement = document.createElement.bind(document);
    document.createElement = function(tag, ...args) {
        const el = _origCreateElement(tag, ...args);
        if (tag.toLowerCase() !== 'a') return el;
        const _origClick = el.click.bind(el);
        el.click = function() {
            if (vscodeApi && el.download && el.href && el.href.startsWith('blob:')) {
                fetch(el.href)
                    .then(r => r.arrayBuffer())
                    .then(buf => {
                        const bytes = Array.from(new Uint8Array(buf));
                        vscodeApi.postMessage({ command: 'downloadFile', fileName: el.download, bytes });
                    })
                    .catch(e => console.error('[vscode-download] failed to read blob:', e));
                return;
            }
            _origClick();
        };
        return el;
    };

    // Allow Shift+drop by satisfying VSCode's capture-phase dragover requirement
    window.addEventListener('dragover', (e) => { e.preventDefault(); }, true);
    window.addEventListener('drop', (e) => {
        if (!e.isTrusted || !vscodeApi || !e.dataTransfer) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const uriList = e.dataTransfer.getData('application/vnd.code.uri-list')
                     || e.dataTransfer.getData('text/uri-list');
        if (!uriList) return;
        const uris = uriList.split(/\\r?\\n/).filter(l => l && !l.startsWith('#'));
        if (uris.length === 0) return;
        vscodeApi.postMessage({ command: 'readDroppedFiles', uris });
    }, true);
    })();
<\/script>`;

  // ── 3. Inject after the first </script> in <head> (after the font-pair script) ──
  html = html.replace('</script>', '</script>' + vscodeScripts);

  return html;
}

module.exports = { vmWebview, VibeMolEditorProvider };
