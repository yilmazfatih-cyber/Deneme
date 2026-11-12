// İçgüdüler: oturumlardan çıkarılmış küçük, güven puanlı davranış kuralları ve oturum başında seçimi.
//
// ECC'de (d2ef268) continuous-learning-v2 becerisi kancalarla oturumları gözlemler ve "instinct"
// dosyaları üretir: id, trigger, confidence (0-1), domain, kapsam (proje ya da genel). Oturum başında
// en fazla N tanesi bağlama enjekte edilir. README'deki varsayılanlar: ECC_MAX_INJECTED_INSTINCTS=6,
// ECC_INSTINCT_CONFIDENCE_THRESHOLD=0.7, ECC_SESSION_START_MAX_CHARS=8000; proje kapsamlı ve yığınla
// eşleşen içgüdüler "küçük bir sıralama artışı" alır. Artışın tam miktarı belgede yok; buradaki
// değerler (proje +0.10, yığın +0.05) bizim seçimimizdir.
//
// ECC içgüdüleri YAML ön bilgili Markdown dosyalarında tutar; biz kolaylık için JSON kullanıyoruz.

export const VARSAYILAN = Object.freeze({
  esik: 0.7,
  enFazla: 6,
  karakterSiniri: 8000,
  projeArtisi: 0.1,
  yiginArtisi: 0.05,
})

/**
 * @param {Array<{id:string,tetik:string,eylem:string,guven:number,alan:string,kapsam:string,proje?:string}>} icguduler
 * @param {{proje?:string, yigin?:string[], esik?:number, enFazla?:number, karakterSiniri?:number}} secenek
 */
export function sec(icguduler, secenek = {}) {
  const ayar = { ...VARSAYILAN, ...secenek }
  const yigin = new Set((ayar.yigin ?? []).map((s) => s.toLowerCase()))
  const adaylar = icguduler
    .filter((i) => i.guven >= ayar.esik)
    .filter((i) => i.kapsam !== 'proje' || i.proje === ayar.proje) // başka projenin kuralı sızmasın
    .map((i) => {
      let puan = i.guven
      if (i.kapsam === 'proje') puan += ayar.projeArtisi
      if (yigin.has(i.alan.toLowerCase()) || [...yigin].some((y) => i.tetik.toLowerCase().includes(y))) {
        puan += ayar.yiginArtisi
      }
      return { ...i, puan: Math.round(puan * 1000) / 1000 }
    })
    .sort((a, b) => b.puan - a.puan || a.id.localeCompare(b.id))
    .slice(0, ayar.enFazla)
  return adaylar
}

/** Seçilen içgüdüleri oturum başı metnine çevirir; karakter sınırını aşan kısım kesilir. */
export function baglamMetni(secilen, karakterSiniri = VARSAYILAN.karakterSiniri) {
  const satirlar = ['## Öğrenilmiş içgüdüler', '', ...secilen.map((i) => `- (${i.guven}) ${i.tetik}: ${i.eylem}`)]
  const metin = satirlar.join('\n') + '\n'
  if (metin.length <= karakterSiniri) return metin
  const not = '\n[kesildi]\n'
  return metin.slice(0, karakterSiniri - not.length) + not
}
