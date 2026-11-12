// Örnek eklenti — gerçek VS Code eklentileri gibi CommonJS ve require('vscode') kullanır.
// Bu klasördeki package.json'da "type" alanı olmadığı için Node bu dosyayı CommonJS sayar.
const vscode = require('vscode')

exports.activate = function activate(context) {
  const kayit = vscode.commands.registerCommand('metin.buyukHarf', async () => {
    // Eklenti belgeye doğrudan erişemez; ana taraftaki komutları RPC ile çağırır.
    const metin = await vscode.commands.executeCommand('editor.getText')
    const yerel = await vscode.commands.executeCommand('workbench.getConfiguration', 'buyukHarf.yerel')
    const buyuk = metin.toLocaleUpperCase(yerel)
    await vscode.commands.executeCommand('editor.setText', buyuk)
    await vscode.window.showInformationMessage(`${metin.length} karakter büyük harfe çevrildi`)
    return buyuk
  })
  context.subscriptions.push(kayit)
}

exports.deactivate = function deactivate() {}
