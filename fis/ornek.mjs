// Fiş — örnek fiş (gerçek fiş; testlerde ve "Örnek fişi dene" bağlantısında kullanılır).
// Saray Muhallebicisi (Hilltown), 18.11.2026 11:44, Masa L1, 10 kişi, Çek #39.
// Ara toplam 11.495,00 ₺; AVM personeli indirimi %15 (−1.724,25 ₺); ödenecek 9.770,75 ₺.

/** @type {import('./fis.mjs').Bill} */
export const ORNEK_FIS = {
  id: 'saray39',
  title: 'Saray Muhallebicisi (Hilltown)',
  meta: '18.11.2026 11:44 · Masa L1 · Çek #39',
  people: 10,
  total: 977075,
  note: '',
  items: [
    { name: 'Küçük Pasta Çilekli (Vişne Çiko)', qty: 1, unit: 140000 },
    { name: 'Ayran Paket', qty: 3, unit: 12000 },
    { name: 'Döner Porsiyon', qty: 1, unit: 70000 },
    { name: 'Döner Humus Salata 100 gr', qty: 2, unit: 78500 },
    { name: 'Az Mercimek Çorba', qty: 3, unit: 16500 },
    { name: 'Şişe Coca-Cola', qty: 1, unit: 11000 },
    { name: 'Köfte Humus Salata', qty: 1, unit: 60000 },
    { name: 'Tavuk Şiş Humus Salata', qty: 4, unit: 60000 },
    { name: 'Mercimek Çorba', qty: 1, unit: 20000 },
    { name: 'Çıtır Tavuk Sezar Salata', qty: 2, unit: 60000 },
    { name: '1.5 Döner Porsiyon', qty: 1, unit: 92000 },
    { name: 'Tavuklu Dürüm', qty: 1, unit: 46500 },
    { name: 'Izgara Tavuk Salatası', qty: 1, unit: 60000 },
    { name: 'Şişe Cola Zero', qty: 1, unit: 11000 },
    { name: 'Az Çorba', qty: 1, unit: 16500 },
    { name: 'Çorba', qty: 1, unit: 20000 },
  ],
}
