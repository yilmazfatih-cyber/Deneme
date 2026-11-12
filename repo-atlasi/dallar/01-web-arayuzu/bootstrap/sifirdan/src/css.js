// Küçük bir CSS "AST"i ve yazıcısı. Sass'ın yaptığı iş özünde budur: değişken + döngü + koşul → düz CSS metni.

/** @returns {{ tur: 'kural', secici: string, bildirimler: Array<[string, string]> }} */
export const kural = (secici, bildirimler) => ({ tur: 'kural', secici, bildirimler })

/** @media (sorgu) { ... } — sorgu null ise sarmalamadan içerik döner (en küçük kırılım noktası). */
export const medya = (sorgu, cocuklar) => (sorgu ? { tur: 'blok', bas: `@media ${sorgu}`, cocuklar } : cocuklar)

/** @layer ad { ... } — Bootstrap 6 katmanları: ... layout, ..., utilities (sonra gelen katman kazanır). */
export const katman = (ad, cocuklar) => ({ tur: 'blok', bas: `@layer ${ad}`, cocuklar })

/**
 * Sınıf adını CSS seçicisinde güvenle kullanılacak hâle getirir.
 * md:col-6 → md\:col-6 ; 2xl:col-6 → \32 xl\:col-6 (rakamla başlayan tanımlayıcı kaçışlanır)
 */
export function kacis(sinif) {
  let s = sinif.replace(/([:.%/])/g, '\\$1')
  if (/^\d/.test(s)) s = `\\3${s[0]} ${s.slice(1)}`
  return s
}

/** Düğüm listesini (iç içe diziler serbest) okunur CSS metnine çevirir. */
export function yazdir(dugumler, girinti = '') {
  const satirlar = []
  for (const d of [dugumler].flat(Infinity)) {
    if (d.tur === 'kural') {
      if (d.bildirimler.length === 0) continue
      satirlar.push(`${girinti}${d.secici} {`)
      for (const [ozellik, deger] of d.bildirimler) satirlar.push(`${girinti}  ${ozellik}: ${deger};`)
      satirlar.push(`${girinti}}`)
    } else {
      satirlar.push(`${girinti}${d.bas} {`)
      satirlar.push(yazdir(d.cocuklar, girinti + '  '))
      satirlar.push(`${girinti}}`)
    }
  }
  return satirlar.filter((s) => s !== '').join('\n')
}
