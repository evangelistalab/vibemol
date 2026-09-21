const path = require('path');

const MAX_FILE_BYTES = 250 * 1024 * 1024;
const MAX_FOLDER_BYTES = 512 * 1024 * 1024;
const MOLECULAR_SUFFIX = /\.(?:xyz|cube|cub|2ccube|molden|hess|dat|out|output)$/i;
const VIBRATION_SUFFIX = /\.(?:vib|vmodes|modes)\.json$/i;

function parentFolder(uri) {
  return uri.with({ path: path.posix.dirname(uri.path), query: '', fragment: '' });
}

function isMolecularJson(text) {
  try {
    const value = JSON.parse(text);
    return value && !Array.isArray(value) && typeof value === 'object'
      && (value.kind === 'vibemol.structure' || value.kind === 'vibemol.vibrations'
        || (!value.kind && (Array.isArray(value.modes) || Array.isArray(value.vibrations))));
  } catch (_) { return false; }
}

// Use workspace.fs and URI paths so folder loading also works in remote VS Code.
// Reading one file at a time bounds temporary allocations; errors are per file.
async function readFolderFiles(vscode, folderUri, selectedDocument = null, selectedUri = null) {
  const selected = selectedUri || selectedDocument?.uri;
  const documents = new Map(vscode.workspace.textDocuments.map(doc => [doc.uri.toString(), doc]));
  if (selectedDocument) documents.set(selectedDocument.uri.toString(), selectedDocument);
  const entries = (await vscode.workspace.fs.readDirectory(folderUri))
    .filter(([name, type]) => (type & vscode.FileType.File) && !(type & vscode.FileType.SymbolicLink)
      && (MOLECULAR_SUFFIX.test(name) || /\.json$/i.test(name)))
    .map(([name]) => ({ name, uri: vscode.Uri.joinPath(folderUri, name) }));
  // An unsaved/new document need not exist on disk yet.
  if (selectedDocument && !entries.some(entry => entry.uri.toString() === selected.toString())) {
    entries.push({ name: path.posix.basename(selected.path), uri: selected });
  }
  entries.sort((a, b) => Number(b.uri.toString() === selected?.toString())
    - Number(a.uri.toString() === selected?.toString())
    || a.name.localeCompare(b.name, 'en', { numeric: true }) || a.name.localeCompare(b.name));
  const files = [], errors = [];
  let totalBytes = 0;
  for (const { name, uri } of entries) {
    try {
      const document = documents.get(uri.toString());
      if (!document && (await vscode.workspace.fs.stat(uri)).size > MAX_FILE_BYTES) {
        throw new Error('exceeds the 250 MiB file limit');
      }
      const contents = document ? document.getText() : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      // Generic JSON in calculation folders also includes settings and package
      // manifests. Only molecular documents belong in automatic folder loads.
      if (/\.json$/i.test(name) && !isMolecularJson(contents)) {
        if (VIBRATION_SUFFIX.test(name)) throw new Error('not a recognized vibration document');
        continue;
      }
      const size = Buffer.byteLength(contents, 'utf8');
      if (size > MAX_FILE_BYTES) throw new Error('exceeds the 250 MiB file limit');
      if (totalBytes + size > MAX_FOLDER_BYTES) throw new Error('exceeds the 512 MiB folder import limit');
      files.push({ fileName: name, contents });
      totalBytes += size;
    } catch (error) {
      errors.push(`${name}: ${error.message || error}`);
    }
  }
  return { files, errors };
}

module.exports = { parentFolder, readFolderFiles, isMolecularJson, MAX_FILE_BYTES, MAX_FOLDER_BYTES };
