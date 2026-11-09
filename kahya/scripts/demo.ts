// Derlenmiş arayüzle demo sunucusu: npm run demo → http://localhost:8787
// Bellek içi veritabanı ve örnek veriyle açılır; kapatınca her şey silinir.
process.env.KAHYA_DEMO ??= '1'
process.env.KAHYA_SEED_DEMO ??= '1'
process.env.KAHYA_DB ??= ':memory:'
await import('../server/index.ts')
