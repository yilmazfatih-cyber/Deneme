// Code düğümünün işçi iş parçacığı — n8n'deki "task runner" fikrinin küçük karşılığı.
//
// Neden ayrı iş parçacığı? Kullanıcı kodu 'await null; while (true) {}' yazarsa ana olay
// döngüsü kilitlenir; vm'in 'timeout' seçeneği yalnızca eşzamanlı kısmı durdurur. İşçiyi
// ise ana iş parçacığı her an sonlandırabilir (worker.terminate()).
// İşçi de bir güvenlik sınırı değildir (aynı süreçtedir); n8n kodu AYRI SÜREÇTE çalıştırır
// (packages/@n8n/task-runner). Ek savunma: veri sandbox'a yalnızca JSON METNİ olarak girer
// ve sonuç JSON metni olarak çıkar; eval/new Function kapalıdır.

import vm from 'node:vm'
import { parentPort, workerData } from 'node:worker_threads'

const SARMALAYICI = (/** @type {string} */ kod) => `
const __gunluk = [];
const __ogeler = JSON.parse(__veri);
const items = __ogeler;
const $input = { all: () => __ogeler, first: () => __ogeler[0], last: () => __ogeler[__ogeler.length - 1],
  item: __ogeler[__indeks] };
const $json = __ogeler[__indeks] ? __ogeler[__indeks].json : undefined;
const console = { log: (...a) => __gunluk.push(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')) };
(async () => {
${kod}
})().then(
  (s) => JSON.stringify({ sonuc: s === undefined ? null : s, gunluk: __gunluk }),
  (e) => JSON.stringify({ hata: String(e && e.message ? e.message : e), gunluk: __gunluk }),
);`

const { kod, veri, kip } = workerData

/** @param {vm.Script} betik @param {number} indeks */
async function birKez(betik, indeks) {
  const kum = Object.assign(Object.create(null), { __veri: veri, __indeks: indeks })
  const baglam = vm.createContext(kum, { codeGeneration: { strings: false, wasm: false } })
  return JSON.parse(await betik.runInContext(baglam))
}

try {
  const betik = new vm.Script(SARMALAYICI(kod), { filename: 'Code.js' }) // sözdizimi hatası burada yakalanır
  const adet = kip === 'runOnceForEachItem' ? JSON.parse(veri).length : 1
  const sonuclar = []
  for (let i = 0; i < adet; i++) sonuclar.push(await birKez(betik, i))
  parentPort?.postMessage({ tamam: true, sonuclar })
} catch (hata) {
  parentPort?.postMessage({ tamam: false, mesaj: hata instanceof Error ? hata.message : String(hata) })
}
