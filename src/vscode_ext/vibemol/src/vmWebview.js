const vscode = require('vscode');

// ─── Shared download handler ─────────────────────────────────────────────────
// Called from any panel's onDidReceiveMessage when the webview intercepts a
// blob download and posts the file bytes here instead.

async function handleDownload(msg) {
  try {
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(msg.fileName),
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

  async resolveCustomTextEditor(document, webviewPanel, _token) {
    const projectRoot = vscode.Uri.joinPath(this._extensionUri, '..', '..', '..');
    webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [projectRoot] };
    webviewPanel.iconPath = vscode.Uri.joinPath(projectRoot, 'assets', 'app', 'img', 'favicon-tetra.svg');

    const scriptUri = webviewPanel.webview.asWebviewUri(projectRoot);
    const assetUri = webviewPanel.webview.asWebviewUri(projectRoot);
    webviewPanel.webview.html = getWebviewContent(scriptUri, assetUri);

    // Track which panel is active so the global undo/redo commands know where to send
    this._activePanel = webviewPanel;
    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) this._activePanel = webviewPanel;
    });

    webviewPanel.onDidDispose(() => {
      if (this._activePanel === webviewPanel) this._activePanel = null;
      vscode.commands.executeCommand('setContext', 'vibemolWebviewFocused', false);
    });

    const fileName = document.uri.path.split('/').pop();
    const loadInitialFile = async () => {
      const contents = document.getText();
      webviewPanel.webview.postMessage({
        command: 'droppedFileContents',
        files: [{ fileName, contents }]
      });
    };

    let initialLoaded = false;
    webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === 'ready' && !initialLoaded) {
        initialLoaded = true;
        await loadInitialFile();
      }

      if (msg.command === 'readDroppedFiles') {
        try {
          const files = await Promise.all(msg.uris.map(async (uriStr) => {
            const uri = vscode.Uri.parse(uriStr);
            const bytes = await vscode.workspace.fs.readFile(uri);
            const contents = Buffer.from(bytes).toString('utf8');
            const fileName = uri.path.split('/').pop();
            return { fileName, contents };
          }));
          webviewPanel.webview.postMessage({ command: 'droppedFileContents', files });
        } catch (err) {
          console.error('[vmWebview] failed to read dropped file:', err);
        }
      }

      if (msg.command === 'downloadFile') {
        await handleDownload(msg);
      }
    });

    // Fallback: load after 2s if no ready signal received
    setTimeout(() => { if (!initialLoaded) { initialLoaded = true; loadInitialFile(); } }, 2000);
  }
}

// ─── Plain webview launcher (no file association) ────────────────────────────
// Used by the "Launch VibeMol" command that opens a blank viewer.

function vmWebview(extensionUri, fileUri, provider) {
  const projectRoot = vscode.Uri.joinPath(extensionUri, '..', '..', '..');

  const panel = vscode.window.createWebviewPanel(
    'vibemol_viewer', 'VibeMol',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [projectRoot] }
  );

  panel.iconPath = vscode.Uri.joinPath(projectRoot, 'assets', 'app', 'img', 'favicon-tetra.svg');
  const scriptUri = panel.webview.asWebviewUri(projectRoot);
  const assetUri = panel.webview.asWebviewUri(projectRoot);

  // Reuse the globally registered undo/redo commands by registering this
  // panel as the active target on the provider
  if (provider) {
    provider._activePanel = panel;
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) provider._activePanel = panel;
    });
  }

  panel.onDidDispose(() => {
    if (provider && provider._activePanel === panel) provider._activePanel = null;
    vscode.commands.executeCommand('setContext', 'vibemolWebviewFocused', false);
  });

  panel.webview.onDidReceiveMessage(async (msg) => {
    console.log('[vmWebview] received message:', msg.command);

    if (msg.command === 'readDroppedFiles') {
      try {
        const files = await Promise.all(msg.uris.map(async (uriStr) => {
          const uri = vscode.Uri.parse(uriStr);
          const bytes = await vscode.workspace.fs.readFile(uri);
          const contents = Buffer.from(bytes).toString('utf8');
          const fileName = uri.path.split('/').pop();
          return { fileName, contents };
        }));
        panel.webview.postMessage({ command: 'droppedFileContents', files });
      } catch (err) {
        console.error('[vmWebview] failed to read dropped file:', err);
      }
    }

    if (msg.command === 'downloadFile') {
      await handleDownload(msg);
    }
  });

  if (fileUri) {
    const loadFile = async () => {
      try {
        const bytes = await vscode.workspace.fs.readFile(fileUri);
        const contents = Buffer.from(bytes).toString('utf8');
        const fileName = fileUri.path.split('/').pop();
        panel.webview.postMessage({ command: 'droppedFileContents', files: [{ fileName, contents }] });
      } catch (err) {
        console.error('[vmWebview] failed to load file on open:', err);
      }
    };
    const readyListener = panel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'ready') { readyListener.dispose(); loadFile(); }
    });
    setTimeout(() => { readyListener.dispose(); loadFile(); }, 2000);
  }

  panel.webview.html = getWebviewContent(scriptUri, assetUri);
}

function getWebviewContent(scriptUri, assetUri) {
  const fs = require('fs');
  const path = require('path');

  // Read index.html from the project root (3 levels up from the extension src dir)
  const indexPath = path.join(__dirname, '..', '..', '..', '..', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  // ── 1. Rewrite local src= and href= to use the VSCode webview URI ────────
  // Matches src="..." and href="..." that don't start with http/https,
  // vscode-webview, data:, blob:, or # (anchors)
  const base = scriptUri.toString();
  html = html.replace(
    /(src|href)="(?!https?:|vscode-webview:|data:|blob:|#)([^"]*)"/g,
    (match, attr, url) => `${attr}="${base}/${url.replace(/^\.\/|^\//, '')}"`
  );

  // ── 2. Build the VSCode integration scripts to inject ────────────────────
  const vscodeScripts = `
        <meta id="vscode-uris"
            data-script-uri="${scriptUri}"
            data-asset-uri="${assetUri}"
        />
<script>
    const _meta = document.getElementById('vscode-uris');
    window.VSCODE_BASE_URI = _meta.getAttribute('data-script-uri');

    function rewriteUrl(url) {
        if (typeof url === 'string'
            && !url.startsWith('http')
            && !url.startsWith('vscode-webview')
            && !url.startsWith('data:')
            && !url.startsWith('blob:')) {
            return window.VSCODE_BASE_URI + '/' + url.replace(/^\\.\\/|^\\/\\//, '');
        }
        return url;
    }

    // Patch fetch
    const _originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = function patchedFetch(url, options) {
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
<script>
    window.addEventListener('message', (event) => {
        const msg = event.data;
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
        if (msg.command === 'droppedFileContents') {
            if (window.VibeMolEmbed && typeof window.VibeMolEmbed.loadFiles === 'function') {
                window.VibeMolEmbed.loadFiles(
                    msg.files.map(f => ({ name: f.fileName, text: f.contents })),
                    { clearFirst: false }
                )
                    .then(r => console.log('[vscode-drop] loadFiles result:', r))
                    .catch(e => console.error('[vscode-drop] loadFiles error:', e));
            }
        }
    });
<\/script>
<script>
    const _vscodeApi = (typeof acquireVsCodeApi === 'function')
        ? (() => { try { return acquireVsCodeApi(); } catch(e) { return window._vscodeApiInstance; } })()
        : null;
    window._vscodeApiInstance = _vscodeApi;

    if (_vscodeApi) _vscodeApi.postMessage({ command: 'ready' });

    // Intercept <a download> blob clicks — VSCode webviews silently swallow them
    const _origCreateElement = document.createElement.bind(document);
    document.createElement = function(tag, ...args) {
        const el = _origCreateElement(tag, ...args);
        if (tag.toLowerCase() !== 'a') return el;
        const _origClick = el.click.bind(el);
        el.click = function() {
            if (el.download && el.href && el.href.startsWith('blob:')) {
                fetch(el.href)
                    .then(r => r.arrayBuffer())
                    .then(buf => {
                        const bytes = Array.from(new Uint8Array(buf));
                        _vscodeApi.postMessage({ command: 'downloadFile', fileName: el.download, bytes });
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
        e.preventDefault();
        e.stopImmediatePropagation();
        const uriList = e.dataTransfer.getData('application/vnd.code.uri-list')
                     || e.dataTransfer.getData('text/uri-list');
        if (!uriList) return;
        const uris = uriList.split(/\\r?\\n/).filter(l => l && !l.startsWith('#'));
        if (uris.length === 0) return;
        _vscodeApi.postMessage({ command: 'readDroppedFiles', uris });
    }, true);
<\/script>`;

  // ── 3. Inject after the first </script> in <head> (after the font-pair script) ──
  html = html.replace('</script>', '</script>' + vscodeScripts);

  return html;
}

module.exports = { vmWebview, VibeMolEditorProvider };