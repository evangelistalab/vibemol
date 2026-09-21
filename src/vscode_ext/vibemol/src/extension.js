const vscode = require('vscode');
const { vmWebview, VibeMolEditorProvider } = require('./vmWebview');

function activate(context) {
    const provider = VibeMolEditorProvider.register(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('vibemol.vmWebview', () => {
            vmWebview(context.extensionUri, null, provider);
        }),
        vscode.commands.registerCommand('vibemol.openFile', (uri) => {
            const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
            vmWebview(context.extensionUri, fileUri, provider);
        }),
        vscode.commands.registerCommand('vibemol.openFolder', async (uri) => {
            const folderUri = uri || (await vscode.window.showOpenDialog({
                canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
                openLabel: 'Open in VibeMol', title: 'Open molecular folder',
                defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
            }))?.[0];
            if (folderUri) vmWebview(context.extensionUri, null, provider, { folderUri });
        })
    );
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
}
