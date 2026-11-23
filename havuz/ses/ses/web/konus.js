/**
 * konus.js — Türkçe seslendirme yedek hattı (bağımlılıksız ES modülü; PWA'nıza kopyalayın).
 *
 * Sıra: 1) cihazın Türkçe sesi (Web Speech API; "localService" olanlar çevrimdışı çalışır)
 *       2) ses sunucusu: POST {sunucu}/v1/audio/speech (havuz/ses; `python -m ses sun`)
 *       3) ikisi de yoksa "yok": arayüz metni ekranda bırakır (sessiz kalmak hata sayılmaz).
 * Kullanım: import { konus } from "./konus.js"; const nasil = await konus("Merhaba", { sunucu: "" });
 * Genişletme: başka bir yedek (ör. önceden kaydedilmiş dosya) → `konus` içinde 2. adımdan sonra ekleyin.
 */

export const TURKCE = /^tr([-_]|$)/i;

/** Cihazdaki Türkçe sesler. Bazı tarayıcılar listeyi geç doldurur: "voiceschanged" beklenir. */
export function turkceSesler(synth = globalThis.speechSynthesis, bekleMs = 1500) {
  return new Promise((coz) => {
    if (!synth || typeof synth.getVoices !== 'function') return coz([])
    const sec = () => synth.getVoices().filter((s) => TURKCE.test(s.lang))
    const ilk = sec()
    if (ilk.length) return coz(ilk)
    let bitti = false
    const tamam = () => {
      if (!bitti) {
        bitti = true
        coz(sec())
      }
    }
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', tamam, { once: true })
    setTimeout(tamam, bekleMs)
  })
}

/** Çevrimdışı çalışan (localService) ses önce, sonra varsayılan ses. */
export function enIyiSes(sesler) {
  return [...sesler].sort((a, b) => Number(b.localService) - Number(a.localService) || Number(b.default) - Number(a.default))[0] ?? null
}

/** Cihaz sesiyle okur; bitince true, hata ya da zaman aşımında false. */
export function cihazlaKonus(metin, ses, { synth = globalThis.speechSynthesis, hiz = 1 } = {}) {
  return new Promise((coz) => {
    if (!synth || !ses || typeof globalThis.SpeechSynthesisUtterance !== 'function') return coz(false)
    const soz = new globalThis.SpeechSynthesisUtterance(metin)
    soz.lang = ses.lang
    soz.voice = ses
    soz.rate = hiz
    const sure = setTimeout(() => coz(false), 3000 + metin.length * 150)
    soz.onend = () => {
      clearTimeout(sure)
      coz(true)
    }
    soz.onerror = () => {
      clearTimeout(sure)
      coz(false)
    }
    synth.cancel()
    synth.speak(soz)
  })
}

function sesiOynat(blob) {
  return new Promise((coz) => {
    const adres = URL.createObjectURL(blob)
    const oynatici = new Audio(adres)
    const bitir = (sonuc) => {
      URL.revokeObjectURL(adres)
      coz(sonuc)
    }
    oynatici.onended = () => bitir(true)
    oynatici.onerror = () => bitir(false)
    oynatici.play().catch(() => bitir(false))
  })
}

/** Ses sunucusundan WAV ister ve çalar; her hatada false (ağ yok, sunucu kapalı, 4xx/5xx). */
export async function sunucuylaKonus(metin, secenek = {}) {
  const { sunucu = '', anahtar = null, hiz = 1, zamanAsimiMs = 15000, getir = globalThis.fetch, oynat = sesiOynat } = secenek
  if (typeof getir !== 'function') return false
  const denetci = new AbortController()
  const zamanlayici = setTimeout(() => denetci.abort(), zamanAsimiMs)
  try {
    const basliklar = { 'Content-Type': 'application/json' }
    if (anahtar) basliklar.Authorization = `Bearer ${anahtar}`
    const yanit = await getir(`${sunucu}/v1/audio/speech`, {
      method: 'POST',
      headers: basliklar,
      body: JSON.stringify({ input: metin, response_format: 'wav', speed: hiz }),
      signal: denetci.signal,
    })
    if (!yanit.ok) return false
    return await oynat(await yanit.blob())
  } catch {
    return false
  } finally {
    clearTimeout(zamanlayici)
  }
}

/** Yedekli okuma: "cihaz", "sunucu" ya da "yok" döner. */
export async function konus(metin, secenek = {}) {
  const ses = enIyiSes(await turkceSesler(secenek.synth))
  if (ses && (await cihazlaKonus(metin, ses, secenek))) return 'cihaz'
  if (await sunucuylaKonus(metin, secenek)) return 'sunucu'
  return 'yok'
}
