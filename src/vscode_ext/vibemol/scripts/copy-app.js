/**
 * copy-app.js
 *
 * Pre-package script: copies the VibeMol web app files needed by the VSCode
 * extension into the extension's local `app/` folder so the .vsix is fully
 * self-contained. Run automatically via the `prepackage` npm script.
 *
 * Source layout (project root):
 *   index.html
 *   assets/                    ← entire assets folder
 *   src/components/VmListPopover.js
 *   src/components/VmTooltip.js
 *   src/prefs.js
 *   src/styles/*.css
 *
 * Destination: <extension>/app/  (mirrors the same relative paths)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// extension root is one level up from scripts/
const extRoot = path.join(__dirname, '..');
const projectRoot = path.join(extRoot, '..', '..', '..');  // vibemol repo root
const destRoot = path.join(extRoot, 'app');

// ── Helpers ──────────────────────────────────────────────────────────────────

function copyFile(relPath) {
    const src = path.join(projectRoot, relPath);
    const dst = path.join(destRoot, relPath);
    if (!fs.existsSync(src)) {
        console.warn(`  WARN: missing ${relPath}`);
        return;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    console.log(`  copied ${relPath}`);
}

// Recursively copies a directory, preserving subdirectory structure
function copyDirRecursive(relDir) {
    const src = path.join(projectRoot, relDir);
    if (!fs.existsSync(src)) {
        console.warn(`  WARN: missing directory ${relDir}`);
        return;
    }
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const relChild = path.join(relDir, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(relChild);
        } else {
            copyFile(relChild);
        }
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('Cleaning app/ ...');
console.log('projectRoot:', projectRoot);
console.log('destRoot:', destRoot);
fs.rmSync(destRoot, { recursive: true, force: true });
fs.mkdirSync(destRoot, { recursive: true });

console.log('Copying VibeMol web app files...');

// index.html
copyFile('index.html');

// LICENSE — copied to extension root so vsce picks it up automatically
const licenseSrc = path.join(projectRoot, 'LICENSE');
const licenseDst = path.join(extRoot, 'LICENSE');
if (fs.existsSync(licenseSrc)) {
    fs.copyFileSync(licenseSrc, licenseDst);
    console.log('  copied LICENSE to extension root');
} else {
    console.warn('  WARN: missing LICENSE');
}

// entire assets folder — js, css, img, fonts, vendor, fragments, data, etc.
copyDirRecursive('assets');

// src/components (only the two files index.html references)
copyFile('src/components/VmListPopover.js');
copyFile('src/components/VmTooltip.js');

// src/prefs.js
copyFile('src/prefs.js');

// src/styles
copyDirRecursive('src/styles');

console.log('Done. app/ is ready for packaging.');