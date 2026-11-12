// Koan yardımcısı. Her beklenen değer __(...) içine yazılır.
// `npm run bosalt` bu dosyaların kopyasını calisma/ klasörüne çıkarır ve her __(...) içini siler: __()
// Boş __() bir işaretçi döndürür; test, sen doğru değeri yazana kadar kırmızı kalır.

export const BOS = Symbol('BURAYI_DOLDUR')

/** @template T @param {...T} deger @returns {T | typeof BOS} */
export function __(...deger) {
  return deger.length === 0 ? BOS : deger[0]
}
