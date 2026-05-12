# VibeMol for VSCode

A VSCode extension that brings [VibeMol](https://github.com/evangelistalab/vibemol) — the molecular visualization and editing tool — directly into the editor. View and interact with `.xyz`, `.cube`, `.molden`, `.hess`, `.vib.json`, and Psi4 output files without leaving VSCode.

## Installation

### From the VS Code Marketplace
Search for **VibeMol** in the Extensions panel (`Cmd+Shift+X`) and click **Install**.

### From source (local build)
Prerequisites: [Node.js](https://nodejs.org) and `vsce` (`npm install -g @vscode/vsce`)

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
Any supported file opened in VSCode will automatically use VibeMol as the default viewer. You can also:

- **Right-click** a file in the Explorer → **Open in VibeMol**
- For `.dat` / `.out` files: right-click → **Open With...** → **VibeMol**

### Drag and drop
Hold **Shift** while dragging files into the VibeMol panel to load them. Multiple files can be dropped at once and will be added to the current session.

### Launch a blank viewer
Open the Command Palette (`Cmd+Shift+P`) and run **Launch VibeMol Webview**, or click the VibeMol icon in the editor toolbar (top right).

## Supported File Types

| Format | Extensions | Priority |
|--------|-----------|---------|
| XYZ coordinates | `.xyz` | Default |
| CUBE / electron density | `.cube`, `.cub` | Default |
| Molden | `.molden` | Default |
| ORCA Hessian | `.hess` | Default |
| Vibrational sidecar | `.vib.json` | Default |
| Psi4 frequency output | `.dat`, `.out` | Open With |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Z` | Undo (within VibeMol panel) |
| `Cmd+Shift+Z` | Redo (within VibeMol panel) |
| `1` / `2` / `3` / `4` | Switch molecule style |
| `S` | Save PNG |
| `V` | Open view / coordinates panel |
| `M` | Measurement mode |
| `E` | Edit mode |

## Requirements

- VSCode `^1.118.0`
- No other dependencies — the extension is fully self-contained