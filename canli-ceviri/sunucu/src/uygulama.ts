// İstek akışı: POST /v1/oturum
//
//   1. İmzalı işlemi (JWS) doğrula            → imza_gecersiz
//   2. Yükü denetle (paket, ürün, süre, iptal) → abonelik_yok
//   3. Kullanım sınırını uygula               → cok_sik / sinir_doldu
//   4. Soniox'tan geçici anahtar al           → sunucu_hatasi (bütçe geri alınır)
//
// Bütçe abonelik DÖNEMİ başınadır (Production: işlemin `expiresDate` değerine dek; her yenileme yeni bütçe).
// Sandbox'ta abonelik birkaç dakikada bir yenilendiği için bütçe UTC gününe göredir.
//
// Yanıtlar ve kayıtlar doğrulamanın hangi adımda düştüğünü söylemez. Kayda yalnız sonuç kodu, ortam ve aboneliğin
// kısaltılmış tuzlu özeti yazılır; Soniox anahtarı, işlemin kendisi, abonelik kimliği ve IP hiçbir yere yazılmaz.

import { type Abonelik, type Ortam, yukuDenetle } from './abonelik'
import { type Ayarlar, type Env, ayarlariOku } from './ayarlar'
import { DogrulamaHatasi, type GuvenKoku, jwsDogrula } from './jws'
import { type GetirIslevi, geciciAnahtarAl } from './soniox'
import { jsonCoz, sonrakiUtcGeceYarisi, tuzluOzet } from './yardimci'

export const YOL = '/v1/oturum'
/** İstek gövdesinin en büyük boyutu (bayt). */
export const GOVDE_SINIRI = 16 * 1024
/** Kayıtlara ve Soniox'a (`client_reference_id`) giden özetin uzunluğu (onaltılık karakter). */
const KISA_OZET_UZUNLUGU = 24

export type HataKodu = 'gecersiz_istek' | 'imza_gecersiz' | 'abonelik_yok' | 'sinir_doldu' | 'cok_sik' | 'sunucu_hatasi'

const ILETILER: Record<HataKodu, string> = {
  gecersiz_istek: 'İstek geçersiz.',
  imza_gecersiz: 'İşlem doğrulanamadı.',
  abonelik_yok: 'Geçerli abonelik bulunamadı.',
  sinir_doldu: 'Kullanım kotası doldu.',
  cok_sik: 'Çok sık istek. Biraz sonra yeniden deneyin.',
  sunucu_hatasi: 'Sunucu hatası. Biraz sonra yeniden deneyin.',
}

export interface Bagimliliklar {
  /**
   * Güven kökü. Üretimde yalnız sabitlenmiş Apple kökü verilir (bkz. index.ts); başka kök ancak testte,
   * bu işlev doğrudan çağrılarak verilebilir. Ortam değişkeni ya da yapılandırma kökü değiştiremez.
   */
  kok: GuvenKoku
  simdi: () => number
  getir: GetirIslevi
}

export type Isleyici = (istek: Request, env: Env) => Promise<Response>

interface KayitAlanlari {
  sonuc: 'verildi' | HataKodu
  ortam?: Ortam
  ozet?: string
  /** Yalnız `sunucu_hatasi` için: sorunun kaynağı (yapılandırma, Soniox'un HTTP durumu ya da iç hata). */
  kaynak?: string
}

function kaydet(alanlar: KayitAlanlari): void {
  console.log(JSON.stringify({ olay: 'oturum', ...alanlar }))
}

function jsonYanit(durum: number, govde: unknown, basliklar: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(govde), {
    status: durum,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...basliklar },
  })
}

function hataYaniti(durum: number, kod: HataKodu, basliklar: Record<string, string> = {}, ileti?: string): Response {
  return jsonYanit(durum, { hata: kod, ileti: ileti ?? ILETILER[kod] }, basliklar)
}

/** Gövdeyi en çok `sinir` bayta dek okur; aşılırsa `null` döner ve okumayı bırakır. */
async function govdeyiOku(istek: Request, sinir: number): Promise<Uint8Array | null> {
  const bildirilen = Number(istek.headers.get('Content-Length') ?? '0')
  if (Number.isFinite(bildirilen) && bildirilen > sinir) return null
  if (istek.body === null) return new Uint8Array(0)
  const okuyucu = istek.body.getReader()
  const parcalar: Uint8Array[] = []
  let toplam = 0
  for (;;) {
    const { done, value } = await okuyucu.read()
    if (done) break
    toplam += value.byteLength
    if (toplam > sinir) {
      await okuyucu.cancel()
      return null
    }
    parcalar.push(value)
  }
  const govde = new Uint8Array(toplam)
  let konum = 0
  for (const parca of parcalar) {
    govde.set(parca, konum)
    konum += parca.byteLength
  }
  return govde
}

/** Gövdeden `islem` alanını (imzalı işlem) çıkarır; gövde JSON nesnesi değilse ya da alan yoksa `null`. */
function islemiCikar(govde: Uint8Array): string | null {
  let deger: unknown
  try {
    deger = jsonCoz(govde)
  } catch {
    return null
  }
  if (typeof deger !== 'object' || deger === null || Array.isArray(deger)) return null
  const islem = (deger as { islem?: unknown }).islem
  return typeof islem === 'string' && islem !== '' ? islem : null
}

export function isleyiciOlustur(bagimliliklar: Bagimliliklar): Isleyici {
  return async (istek, env) => {
    const adres = new URL(istek.url)
    if (adres.pathname !== YOL) {
      return hataYaniti(404, 'gecersiz_istek', {}, 'Böyle bir yol yok.')
    }
    if (istek.method !== 'POST') {
      return hataYaniti(405, 'gecersiz_istek', { Allow: 'POST' }, 'Bu yöntem desteklenmiyor.')
    }
    try {
      const ayarlar = ayarlariOku(env)
      if (ayarlar === null) {
        kaydet({ sonuc: 'sunucu_hatasi', kaynak: 'yapilandirma' })
        return hataYaniti(500, 'sunucu_hatasi')
      }
      return await oturumAc(istek, env, ayarlar, bagimliliklar)
    } catch (hata) {
      // Hata iletisi kayda yazılmaz (içinde istekten gelen veri olabilir); yalnız hatanın türü yazılır.
      kaydet({ sonuc: 'sunucu_hatasi', kaynak: `ic:${hata instanceof Error ? hata.name : 'bilinmiyor'}` })
      return hataYaniti(500, 'sunucu_hatasi')
    }
  }
}

async function oturumAc(istek: Request, env: Env, ayarlar: Ayarlar, bagimliliklar: Bagimliliklar): Promise<Response> {
  const simdi = bagimliliklar.simdi()

  // IP yalnız geçersiz istekleri saymak için kullanılır; kendisi saklanmaz, tuzlu özeti nesne adı olur.
  const ip = istek.headers.get('CF-Connecting-IP') ?? 'bilinmiyor'
  const ipSayaci = env.IP_SAYAC.get(env.IP_SAYAC.idFromName(await tuzluOzet(ayarlar.ozetTuzu, `ip:${ip}`)))
  const ipBekleme = await ipSayaci.denetle(simdi)
  if (ipBekleme > 0) {
    kaydet({ sonuc: 'cok_sik' })
    return hataYaniti(429, 'cok_sik', { 'Retry-After': String(ipBekleme) })
  }
  const gecersiz = async (durum: number, kod: HataKodu, ortam?: Ortam): Promise<Response> => {
    await ipSayaci.say(simdi)
    kaydet(ortam === undefined ? { sonuc: kod } : { sonuc: kod, ortam })
    return hataYaniti(durum, kod, {}, durum === 413 ? 'İstek çok büyük.' : undefined)
  }

  const govde = await govdeyiOku(istek, GOVDE_SINIRI)
  if (govde === null) return gecersiz(413, 'gecersiz_istek')
  const islem = islemiCikar(govde)
  if (islem === null) return gecersiz(400, 'gecersiz_istek')

  let yuk: Record<string, unknown>
  try {
    yuk = await jwsDogrula(islem, bagimliliklar.kok, simdi)
  } catch (hata) {
    if (hata instanceof DogrulamaHatasi) return gecersiz(401, 'imza_gecersiz')
    throw hata
  }

  const abonelik: Abonelik | null = yukuDenetle(yuk, ayarlar, simdi)
  if (abonelik === null) {
    const ortam = yuk.environment
    return gecersiz(403, 'abonelik_yok', ortam === 'Production' || ortam === 'Sandbox' ? ortam : undefined)
  }

  // Abonelik kimliğinin kendisi buradan öteye geçmez: sayaç nesnesinin adı da, kayıt da, Soniox'a giden
  // `client_reference_id` de tuzlu özettir.
  const { ortam } = abonelik
  const tamOzet = await tuzluOzet(ayarlar.ozetTuzu, `abone:${ortam}:${abonelik.asilIslemKimligi}`)
  const ozet = tamOzet.slice(0, KISA_OZET_UZUNLUGU)
  const sayac = env.SAYAC.get(env.SAYAC.idFromName(`abone:${ortam}:${tamOzet}`))

  // Bütçe dönemi: Production'da işlemin kapsadığı abonelik dönemi (her yenileme yeni bütçe). Sandbox'ta haftalık
  // abonelik birkaç dakikada bir yenilenir; dönem anahtarı bütçeyi fiilen sınırsız yapardı, bu yüzden UTC günü.
  const sandbox = ortam === 'Sandbox'
  const ayirma = await sayac.ayir({
    simdi,
    donemBitisMs: sandbox ? sonrakiUtcGeceYarisi(simdi) : abonelik.bitisMs,
    butceSaniye: sandbox ? ayarlar.sandboxGunlukSaniye : ayarlar.donemSaniye,
    oturumSaniye: ayarlar.oturumSaniye,
  })
  if (ayirma.tur === 'cok_sik') {
    kaydet({ sonuc: 'cok_sik', ortam, ozet })
    return hataYaniti(429, 'cok_sik', { 'Retry-After': String(ayirma.beklemeSn) })
  }
  if (ayirma.tur === 'sinir_doldu') {
    kaydet({ sonuc: 'sinir_doldu', ortam, ozet })
    // Ek alan taşıyan tek hata yanıtı: bütçenin sıfırlanacağı an (uygulama "kotanız şu tarihte yenilenir" diyebilsin).
    const beklemeSn = Math.max(1, Math.ceil((ayirma.donemBitisMs - simdi) / 1000))
    return jsonYanit(
      429,
      { hata: 'sinir_doldu', ileti: ILETILER.sinir_doldu, donem_bitis_ms: ayirma.donemBitisMs },
      { 'Retry-After': String(beklemeSn) },
    )
  }

  const anahtar = await geciciAnahtarAl(bagimliliklar.getir, ayarlar.sonioxAnahtari, ayirma.sureSn, ozet)
  if (!anahtar.tamam) {
    // Anahtar verilemedi: ayrılan süre bütçeye geri konur.
    await sayac.geriAl(ayirma.ayirmaNo)
    kaydet({ sonuc: 'sunucu_hatasi', ortam, ozet, kaynak: `soniox:${anahtar.durum}` })
    return hataYaniti(502, 'sunucu_hatasi')
  }

  kaydet({ sonuc: 'verildi', ortam, ozet })
  return jsonYanit(200, {
    anahtar: anahtar.anahtar,
    sure_sn: ayirma.sureSn,
    kalan_sn: ayirma.kalanSn,
    donem_bitis_ms: ayirma.donemBitisMs,
  })
}
