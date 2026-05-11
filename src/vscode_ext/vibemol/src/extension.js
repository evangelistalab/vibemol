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
        })
    );
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
}