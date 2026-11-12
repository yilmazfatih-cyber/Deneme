// Değerlendirme sırası: önce bağımlılıklar (sira_b), sonra bu modülün gövdesi.
import './sira_b.js'

globalThis.__modulSirasi ??= []
globalThis.__modulSirasi.push('a')
