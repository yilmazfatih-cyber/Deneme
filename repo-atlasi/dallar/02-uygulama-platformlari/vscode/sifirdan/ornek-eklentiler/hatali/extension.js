// Bilerek bozuk eklenti: activate hata fırlatır. Ana taraf ve diğer eklentiler etkilenmemeli.
const vscode = require('vscode')

exports.activate = function activate() {
  void vscode
  throw new Error('Bilerek bozuldum')
}
