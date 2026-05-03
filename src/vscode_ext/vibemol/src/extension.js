const vscode = require('vscode');
const vmWebview = require('./vmWebview');

function activate(context) {
    const extensionUri = context.extensionUri;
    let vmWebviewDisposable = vscode.commands.registerCommand('vibemol.vmWebview', function () {
        vmWebview(extensionUri);
    });

    context.subscriptions.push(vmWebviewDisposable);
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
}