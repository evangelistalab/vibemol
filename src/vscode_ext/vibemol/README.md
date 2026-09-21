# VibeMol for VSCode

A VSCode extension that brings [VibeMol](https://github.com/evangelistalab/vibemol) — the molecular visualization and editing tool — directly into the editor. View and interact with `.xyz`, `.cube`, `.2ccube`, `.molden`, `.hess`, vibrational sidecar JSON, and Psi4 output files without leaving VSCode.

## Installation

### From the VS Code Marketplace
Search for **VibeMol** in the Extensions panel (`Cmd+Shift+X`) and click **Install**.

### From source (local build)
Prerequisite: [Node.js](https://nodejs.org) 20 or newer

```bash
# From the vibemol repo root
cd src/vscode_ext/vibemol
npm install
npm run package
```

Then install the generated `.vsix`:

**Option A — Terminal:**
```bash
code --install-extension vibemol-*.vsix
```

**Option B — VSCode UI:**
1. Open the Extensions panel (`Cmd+Shift+X`)
2. Click the `...` menu → **Install from VSIX...**
3. Select the `vibemol-*.vsix` file

**Option C — Command Palette:**
1. Press `Cmd+Shift+P`
2. Type **Install from VSIX**
3. Select the `vibemol-*.vsix` file

## Usage

### Opening files
Opening a supported molecular file in VSCode loads it **and the other molecular files directly in the same folder** into that VibeMol viewer. Subfolders are not scanned. The opened file comes first, followed by its neighbors in filename order. You can also:

- **Right-click** a file in the Explorer → **Open in VibeMol**
- For `.dat` / `.out` files: right-click → **Open With...** → **VibeMol**

### Opening a folder
Right-click a folder in the Explorer → **Open Folder in VibeMol**, or run that command from the Command Palette to choose a folder.

XYZ, Cube, Molden, Psi4 output, ORCA Hessian, and vibration/structure JSON files are loaded together. Matching geometries group their orbital layers, and vibration sidecars can attach to structures from the same batch. Open text documents use their current contents, including unsaved edits. Unrelated files, symbolic links, saved sessions, and appearance presets are excluded from automatic folder loading. Open saved sessions and presets explicitly from the viewer.

Unreadable or oversized files are reported while the remaining files load. Imports are limited to 250 MiB per file and 512 MiB of text per folder. Folder loading is a snapshot when the viewer opens; it does not overwrite subsequent VibeMol edits when files change on disk.

### Drag and drop
Hold **Shift** while dragging files into the VibeMol panel to load them. Multiple files can be dropped at once and will be added to the current session.

### Launch a blank viewer
Open the Command Palette (`Cmd+Shift+P`) and run **Launch VibeMol Webview**, or click the VibeMol icon in the editor toolbar (top right).

## Supported File Types

| Format | Extensions | Priority |
|--------|-----------|---------|
| XYZ coordinates | `.xyz` | Default |
| CUBE / electron density | `.cube`, `.cub`, `.2ccube` | Default |
| Molden | `.molden` | Default |
| ORCA Hessian | `.hess` | Default |
| Vibrational sidecar | `.vib.json`, `.vmodes.json`, `.modes.json` | Default |
| Psi4 frequency output | `.dat`, `.out`, `.output` | Open With |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Z` | Undo (within VibeMol panel) |
| `Cmd+Shift+Z` | Redo (within VibeMol panel) |
| `S` | Save PNG |
| `V` | Open view / coordinates panel |
| `M` | Measurement mode |
| `E` | Edit mode |

## Requirements

- VSCode `^1.118.0`
- No other dependencies — the extension is fully self-contained
