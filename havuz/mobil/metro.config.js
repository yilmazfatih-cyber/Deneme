/**
 * Metro (Expo'nun paketleyicisi) ayarı. Tek ek: expo-sqlite'ın web sürümü bir `.wasm` dosyası ister; Metro'ya bu
 * uzantıyı varlık (asset) olarak tanıtır. Web'de ayrıca sunucu COOP/COEP başlıklarını vermelidir
 * (scripts/serve-web.ts; geliştirme sunucusu için Expo belgesi: docs/KARARLAR.md → "Yerel depo").
 */
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm')

module.exports = config
