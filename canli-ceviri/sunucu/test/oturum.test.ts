// POST /v1/oturum uçtan uca testleri. Workers çalışma zamanında koşar; Durable Object'ler gerçektir, Soniox sahtedir.
// Güven kökü olarak burada üretilen test kökü verilir (yalnız testte mümkündür).

import { runInDurableObject } from 'cloudflare:test'
import { env as calismaOrtami } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Env } from '../src/ayarlar'
import worker from '../src/index'
import { kokuHazirla } from '../src/jws'
import { DAKIKADA_ISTEK, IP_GECERSIZ_SINIRI } from '../src/sayac'
import type { GetirIslevi } from '../src/soniox'
import { GOVDE_SINIRI, type Isleyici, isleyiciOlustur } from '../src/uygulama'
import { tuzluOzet } from '../src/yardimci'
import {
  type Sertifika,
  type Zincir,
  araUret,
  base64Url,
  hs256Imzala,
  jwsImzala,
  kokUret,
  x5c,
  yaprakUret,
  zincirUret,
} from './destek'

const env = calismaOrtami as unknown as Env
const SONIOX_ANAHTARI = env.SONIOX_API_KEY ?? ''
const PAKET = 'com.yilmazfatih.canliceviri'
const URUN = 'canliceviri.haftalik'
const GUN_MS = 86_400_000
/** wrangler.toml'daki değerler: dönem bütçesi, Sandbox günlük bütçesi ve tek anahtarın (dilimin) süresi (sn). */
const DONEM_SN = 9600
const SANDBOX_GUNLUK_SN = 1800
const DILIM_SN = 120
/** Testlerin başlangıç anı: 2026-11-27 12:00:00 UTC. */
const T0 = Date.UTC(2026, 10, 27, 12, 0, 0)
const GECERLILIK = { baslangic: T0 - GUN_MS, bitis: T0 + 365 * GUN_MS }

// --- Sahte saat ve sahte Soniox -------------------------------------------------------------------------------

let saat = T0

interface SonioxCagrisi {
  adres: string
  yontem: string | undefined
  yetki: string | null
  icerikTuru: string | null
  govde: Record<string, unknown>
}

const sonioxCagrilari: SonioxCagrisi[] = []
let geciciSayaci = 0
const verilenGeciciAnahtarlar: string[] = []

function sonioxBasarili(): Response {
  const anahtar = `temp:test-gecici-anahtar-${++geciciSayaci}`
  verilenGeciciAnahtarlar.push(anahtar)
  return Response.json({ api_key: anahtar, expires_at: new Date(saat + 60_000).toISOString() }, { status: 201 })
}

let sonioxYaniti: () => Response | Promise<Response> = sonioxBasarili

const sahteGetir: GetirIslevi = async (adres, secenekler) => {
  const basliklar = new Headers(secenekler.headers)
  sonioxCagrilari.push({
    adres,
    yontem: secenekler.method,
    yetki: basliklar.get('Authorization'),
    icerikTuru: basliklar.get('Content-Type'),
    govde: JSON.parse(String(secenekler.body)) as Record<string, unknown>,
  })
  return sonioxYaniti()
}

// --- Sızıntı denetimi için toplanan çıktılar ------------------------------------------------------------------

/** Hiçbir yanıtta ve kayıtta geçmemesi gereken değerler: Soniox anahtarı, işlemler (JWS), abonelik kimlikleri, IP'ler. */
const gizliler = new Set<string>([SONIOX_ANAHTARI])
const yanitMetinleri: string[] = []
const kayitlar: string[] = []

function gizliEkle(jws: string): void {
  gizliler.add(jws)
  // Parçaları da ayrı ayrı aranır (bir kayıt yalnız yükü ya da imzayı yazmış olabilir).
  for (const parca of jws.split('.')) if (parca.length >= 16) gizliler.add(parca)
}

// --- Zincir, işlem ve istek yardımcıları ----------------------------------------------------------------------

let zincir: Zincir
let isleyici: Isleyici

let kimlikSayaci = 0
function yeniKimlik(): string {
  const kimlik = String(2_000_000_900_000_000 + ++kimlikSayaci)
  gizliler.add(kimlik)
  return kimlik
}

let ipSayaci = 0
function yeniIp(): string {
  const ip = `2001:db8:c0de::${(++ipSayaci).toString(16)}`
  gizliler.add(ip)
  return ip
}

function yuk(degisiklik: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transactionId: String(2_000_000_950_000_000 + kimlikSayaci),
    originalTransactionId: yeniKimlik(),
    bundleId: PAKET,
    productId: URUN,
    type: 'Auto-Renewable Subscription',
    environment: 'Production',
    purchaseDate: saat - GUN_MS,
    expiresDate: saat + 6 * GUN_MS,
    signedDate: saat - 1000,
    inAppOwnershipType: 'PURCHASED',
    ...degisiklik,
  }
}

function baslik(sertifikalar: Sertifika[] = [zincir.yaprak, zincir.ara, zincir.kok]): Record<string, unknown> {
  return { alg: 'ES256', x5c: x5c(...sertifikalar) }
}

/** Test zinciriyle imzalanmış, geçerli bir abonelik işlemi. */
async function gecerliIslem(degisiklik: Record<string, unknown> = {}): Promise<string> {
  const jws = await jwsImzala(baslik(), yuk(degisiklik), zincir.yaprak.anahtarlar.privateKey)
  gizliEkle(jws)
  return jws
}

interface Yanit {
  durum: number
  govde: Record<string, unknown>
  basliklar: Headers
}

interface IstekSecenekleri {
  ip?: string
  env?: Env
  isleyici?: Isleyici
  yontem?: string
  yol?: string
  basliklar?: Record<string, string>
}

async function gonderHam(govde: string | null, secenekler: IstekSecenekleri = {}): Promise<Yanit> {
  const istek = new Request(`https://sunucu.test${secenekler.yol ?? '/v1/oturum'}`, {
    method: secenekler.yontem ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': secenekler.ip ?? yeniIp(),
      ...secenekler.basliklar,
    },
    body: govde,
  })
  const yanit = await (secenekler.isleyici ?? isleyici)(istek, secenekler.env ?? env)
  const metin = await yanit.text()
  yanitMetinleri.push(`${yanit.status} ${JSON.stringify([...yanit.headers])} ${metin}`)
  expect(yanit.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
  expect(yanit.headers.get('Access-Control-Allow-Origin')).toBeNull()
  return { durum: yanit.status, govde: JSON.parse(metin) as Record<string, unknown>, basliklar: yanit.headers }
}

function gonder(jws: string, secenekler: IstekSecenekleri = {}): Promise<Yanit> {
  return gonderHam(JSON.stringify({ islem: jws }), secenekler)
}

function ayarli(degisiklik: Partial<Env>): Env {
  return { ...env, ...degisiklik }
}

function hataBekle(yanit: Yanit, durum: number, kod: string): void {
  expect(yanit.durum).toBe(durum)
  expect(yanit.govde.hata).toBe(kod)
  expect(typeof yanit.govde.ileti).toBe('string')
  // Ek alan taşıyan tek hata `sinir_doldu` (`donem_bitis_ms`); başka hiçbir hata yanıtında ek bilgi yoktur.
  if (kod === 'sinir_doldu') {
    expect(Object.keys(yanit.govde).sort()).toEqual(['donem_bitis_ms', 'hata', 'ileti'])
    expect(Number.isSafeInteger(yanit.govde.donem_bitis_ms)).toBe(true)
  } else {
    expect(Object.keys(yanit.govde).sort()).toEqual(['hata', 'ileti'])
  }
}

/** Bütçe dolunca dönen yanıt: `sinir_doldu` + bütçenin sıfırlanacağı an + o ana kalan saniye (`Retry-After`). */
function sinirDolduBekle(yanit: Yanit, donemBitisMs: number): void {
  hataBekle(yanit, 429, 'sinir_doldu')
  expect(yanit.govde.donem_bitis_ms).toBe(donemBitisMs)
  expect(yanit.basliklar.get('Retry-After')).toBe(String(Math.max(1, Math.ceil((donemBitisMs - saat) / 1000))))
}

/** Başarı yanıtı: tam olarak dört alan. */
function verildiBekle(yanit: Yanit, sureSn: number, kalanSn: number, donemBitisMs: number): void {
  expect(yanit.durum).toBe(200)
  expect(yanit.govde).toEqual({
    anahtar: verilenGeciciAnahtarlar.at(-1),
    sure_sn: sureSn,
    kalan_sn: kalanSn,
    donem_bitis_ms: donemBitisMs,
  })
  expect(yanit.basliklar.get('Retry-After')).toBeNull()
}

/** Bir aboneliğin sayaç nesnesinin depolamasındaki bütün kayıtlar (ad, sunucudaki gibi tuzlu özetten türetilir). */
async function sayacKayitlari(ortam: 'Production' | 'Sandbox', kimlik: string): Promise<[string, unknown][]> {
  const tamOzet = await tuzluOzet(env.OZET_TUZU ?? '', `abone:${ortam}:${kimlik}`)
  const sayac = env.SAYAC.get(env.SAYAC.idFromName(`abone:${ortam}:${tamOzet}`))
  return runInDurableObject(sayac, (_nesne, durum) => [...durum.storage.kv.list()])
}

beforeAll(async () => {
  for (const ad of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, ad).mockImplementation((...parcalar: unknown[]) => {
      kayitlar.push(parcalar.map((parca) => (typeof parca === 'string' ? parca : JSON.stringify(parca))).join(' '))
    })
  }
  zincir = await zincirUret(T0)
  isleyici = isleyiciOlustur({ kok: kokuHazirla(zincir.kok.der), simdi: () => saat, getir: sahteGetir })
})

let taranmisYanit = 0
let taranmisKayit = 0

afterEach(() => {
  saat = T0
  sonioxYaniti = sonioxBasarili
  sonioxCagrilari.length = 0
  // Her testten sonra: o testin ürettiği hiçbir yanıtta ve kayıtta gizli değer yok.
  // (Tüm çıktıların tüm gizli değerlere karşı taranması en sondaki "sızıntı" testindedir.)
  const yeniCiktilar = [...yanitMetinleri.slice(taranmisYanit), ...kayitlar.slice(taranmisKayit)]
  taranmisYanit = yanitMetinleri.length
  taranmisKayit = kayitlar.length
  for (const cikti of yeniCiktilar) {
    for (const gizli of gizliler) {
      expect(cikti.includes(gizli), 'yanıt ya da kayıt gizli bir değer içeriyor').toBe(false)
    }
  }
})

// --- Testler --------------------------------------------------------------------------------------------------

describe('geçerli işlem', () => {
  it('200 döner ve Soniox isteği doğrudur', async () => {
    const bitis = saat + 6 * GUN_MS
    const yanit = await gonder(await gecerliIslem({ expiresDate: bitis }))
    // `donem_bitis_ms`: Production'da işlemin `expiresDate` değeri.
    verildiBekle(yanit, DILIM_SN, DONEM_SN - DILIM_SN, bitis)
    expect(yanit.basliklar.get('Cache-Control')).toBe('no-store')

    expect(sonioxCagrilari).toHaveLength(1)
    const cagri = sonioxCagrilari[0]!
    expect(cagri.adres).toBe('https://api.soniox.com/v1/auth/temporary-api-key')
    expect(cagri.yontem).toBe('POST')
    expect(cagri.yetki).toBe(`Bearer ${SONIOX_ANAHTARI}`)
    expect(cagri.icerikTuru).toBe('application/json')
    expect(Object.keys(cagri.govde).sort()).toEqual([
      'client_reference_id',
      'expires_in_seconds',
      'max_session_duration_seconds',
      'single_use',
      'usage_type',
    ])
    expect(cagri.govde).toMatchObject({
      usage_type: 'transcribe_websocket',
      expires_in_seconds: 60,
      single_use: true,
      max_session_duration_seconds: DILIM_SN,
    })
    // Abonelik kimliğinin kendisi değil, kısaltılmış tuzlu özeti gider.
    expect(cagri.govde.client_reference_id).toMatch(/^[0-9a-f]{24}$/)
  })

  it('aynı abonelik hep aynı özetle, farklı abonelik farklı özetle gider', async () => {
    const kimlik = yeniKimlik()
    await gonder(await gecerliIslem({ originalTransactionId: kimlik }))
    // Yenilenen dönemin işlemi de aynı aboneliktir: özet dönemden bağımsızdır.
    await gonder(await gecerliIslem({ originalTransactionId: kimlik, expiresDate: saat + 13 * GUN_MS }))
    await gonder(await gecerliIslem())
    const ozetler = sonioxCagrilari.map((cagri) => cagri.govde.client_reference_id)
    expect(ozetler).toHaveLength(3)
    expect(ozetler[0]).toBe(ozetler[1])
    expect(ozetler[2]).not.toBe(ozetler[0])
  })

  it('sandbox işlemi (izinliyken) ayrı ve düşük bütçe kullanır', async () => {
    const yanit = await gonder(await gecerliIslem({ environment: 'Sandbox' }))
    // `donem_bitis_ms`: Sandbox'ta işlemin bitişi değil, bir sonraki UTC gece yarısı.
    verildiBekle(yanit, DILIM_SN, SANDBOX_GUNLUK_SN - DILIM_SN, Date.UTC(2026, 10, 28))
  })

  it('aynı abonelik kimliği Production ve Sandbox için ayrı sayılır', async () => {
    const kimlik = yeniKimlik()
    const bitis = saat + 6 * GUN_MS
    const uretim = await gonder(await gecerliIslem({ originalTransactionId: kimlik, expiresDate: bitis }))
    verildiBekle(uretim, DILIM_SN, DONEM_SN - DILIM_SN, bitis)
    const sandbox = await gonder(
      await gecerliIslem({ originalTransactionId: kimlik, expiresDate: bitis, environment: 'Sandbox' }),
    )
    verildiBekle(sandbox, DILIM_SN, SANDBOX_GUNLUK_SN - DILIM_SN, Date.UTC(2026, 10, 28))
  })
})

describe('güvenlik: imza ve zincir', () => {
  async function reddedilmeli(jws: string): Promise<void> {
    gizliEkle(jws)
    hataBekle(await gonder(jws), 401, 'imza_gecersiz')
    expect(sonioxCagrilari).toHaveLength(0)
  }

  it('alg: none reddedilir (imzasız ve geçerli imzalı)', async () => {
    const imzasiz = `${base64Url(JSON.stringify({ ...baslik(), alg: 'none' }))}.${base64Url(JSON.stringify(yuk()))}.`
    await reddedilmeli(imzasiz)
    await reddedilmeli(await jwsImzala({ ...baslik(), alg: 'none' }, yuk(), zincir.yaprak.anahtarlar.privateKey))
  })

  it('HS256 reddedilir (açık anahtar sır olarak kullanılsa da)', async () => {
    const acikAnahtar = new Uint8Array(
      (await crypto.subtle.exportKey('spki', zincir.yaprak.anahtarlar.publicKey)) as ArrayBuffer,
    )
    await reddedilmeli(await hs256Imzala({ ...baslik(), alg: 'HS256' }, yuk(), acikAnahtar))
    await reddedilmeli(await hs256Imzala({ ...baslik(), alg: 'HS256' }, yuk(), zincir.yaprak.der))
  })

  it('ES256 dışındaki diğer alg değerleri reddedilir', async () => {
    for (const alg of ['ES384', 'RS256', 'es256', 'ES256 ', '', null, ['ES256']]) {
      await reddedilmeli(await jwsImzala({ ...baslik(), alg }, yuk(), zincir.yaprak.anahtarlar.privateKey))
    }
    await reddedilmeli(await jwsImzala({ x5c: baslik().x5c }, yuk(), zincir.yaprak.anahtarlar.privateKey))
  })

  it('imzası bozuk işlem reddedilir', async () => {
    const jws = await gecerliIslem()
    const [b, y, imza] = jws.split('.') as [string, string, string]
    const ilk = imza[0] === 'A' ? 'B' : 'A'
    await reddedilmeli(`${b}.${y}.${ilk}${imza.slice(1)}`)
    await reddedilmeli(`${b}.${y}.${imza.slice(0, -4)}`)
    await reddedilmeli(`${b}.${y}.`)
    await reddedilmeli(`${b}.${y}`)
    await reddedilmeli(`${b}.${y}.${imza}.${imza}`)
  })

  it('yükü değiştirilmiş işlem reddedilir', async () => {
    const asil = yuk({ expiresDate: saat - GUN_MS })
    const jws = await jwsImzala(baslik(), asil, zincir.yaprak.anahtarlar.privateKey)
    const [b, , imza] = jws.split('.') as [string, string, string]
    const degismis = base64Url(JSON.stringify({ ...asil, expiresDate: saat + 6 * GUN_MS }))
    await reddedilmeli(`${b}.${degismis}.${imza}`)
  })

  it('başka bir yaprağın anahtarıyla imzalanmış işlem reddedilir', async () => {
    const baskaYaprak = await yaprakUret(zincir.ara, GECERLILIK)
    await reddedilmeli(await jwsImzala(baslik(), yuk(), baskaYaprak.anahtarlar.privateKey))
  })

  it('ara sertifikanın adını taşıyan ama onun imzalamadığı (sahte) yaprak reddedilir', async () => {
    // Saldırı: gerçek ara ve kök sertifika zincire konur; yaprağı ise saldırgan kendi anahtarıyla imzalar ve
    // yayımcı adına gerçek aranın adını yazar.
    const saldirganAnahtari = (await kokUret('Saldirgan', GECERLILIK)).anahtarlar
    const sahteYayimci: Sertifika = { ...zincir.ara, anahtarlar: saldirganAnahtari }
    const yaprak = await yaprakUret(sahteYayimci, GECERLILIK)
    await reddedilmeli(await jwsImzala(baslik([yaprak, zincir.ara, zincir.kok]), yuk(), yaprak.anahtarlar.privateKey))
  })

  it('başka köke bağlı zincir reddedilir', async () => {
    const baska = await zincirUret(T0, 'Baska Kok')
    // Zincirin tamamı başka kökten.
    await reddedilmeli(
      await jwsImzala(baslik([baska.yaprak, baska.ara, baska.kok]), yuk(), baska.yaprak.anahtarlar.privateKey),
    )
    // Kök yerine güvenilen kök konmuş, ama ara sertifikayı o imzalamamış.
    await reddedilmeli(
      await jwsImzala(baslik([baska.yaprak, baska.ara, zincir.kok]), yuk(), baska.yaprak.anahtarlar.privateKey),
    )
    // Aynı adı taşıyan sahte kök: adlar tutar, baytlar ve imza tutmaz.
    const sahte = await zincirUret(T0, 'Test Kok')
    await reddedilmeli(
      await jwsImzala(baslik([sahte.yaprak, sahte.ara, sahte.kok]), yuk(), sahte.yaprak.anahtarlar.privateKey),
    )
    await reddedilmeli(
      await jwsImzala(baslik([sahte.yaprak, sahte.ara, zincir.kok]), yuk(), sahte.yaprak.anahtarlar.privateKey),
    )
  })

  it('üretim girişi (sabit Apple kökü) test köküyle imzalanmış işlemi reddeder', async () => {
    const jws = await gecerliIslem()
    const istek = new Request('https://sunucu.test/v1/oturum', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': yeniIp() },
      body: JSON.stringify({ islem: jws }),
    })
    const yanit = await worker.fetch(istek, env)
    const metin = await yanit.text()
    yanitMetinleri.push(metin)
    expect(yanit.status).toBe(401)
    expect(JSON.parse(metin)).toMatchObject({ hata: 'imza_gecersiz' })
  })

  it('kendi kendini imzalamış yaprak reddedilir', async () => {
    const yaprak = await yaprakUret(null, GECERLILIK)
    for (const sertifikalar of [
      [yaprak, zincir.ara, zincir.kok],
      [yaprak, yaprak, zincir.kok],
      [yaprak, yaprak, yaprak],
    ]) {
      await reddedilmeli(await jwsImzala(baslik(sertifikalar), yuk(), yaprak.anahtarlar.privateKey))
    }
  })

  it('süresi geçmiş ya da henüz başlamamış sertifika reddedilir', async () => {
    const gecmis = { baslangic: T0 - 30 * GUN_MS, bitis: T0 - GUN_MS }
    const gelecek = { baslangic: T0 + GUN_MS, bitis: T0 + 30 * GUN_MS }

    for (const gecerlilik of [gecmis, gelecek]) {
      const yaprak = await yaprakUret(zincir.ara, gecerlilik)
      await reddedilmeli(await jwsImzala(baslik([yaprak, zincir.ara, zincir.kok]), yuk(), yaprak.anahtarlar.privateKey))

      const ara = await araUret(zincir.kok, gecerlilik)
      const altYaprak = await yaprakUret(ara, GECERLILIK)
      await reddedilmeli(await jwsImzala(baslik([altYaprak, ara, zincir.kok]), yuk(), altYaprak.anahtarlar.privateKey))
    }
  })

  it('süresi geçmiş kök reddedilir (kök isteğe sabitlenmiş olsa da)', async () => {
    const kok = await kokUret('Eski Kok', { baslangic: T0 - 30 * GUN_MS, bitis: T0 - GUN_MS })
    const ara = await araUret(kok, GECERLILIK)
    const yaprak = await yaprakUret(ara, GECERLILIK)
    const eskiKokluIsleyici = isleyiciOlustur({ kok: kokuHazirla(kok.der), simdi: () => saat, getir: sahteGetir })
    const jws = await jwsImzala(baslik([yaprak, ara, kok]), yuk(), yaprak.anahtarlar.privateKey)
    gizliEkle(jws)
    hataBekle(await gonder(jws, { isleyici: eskiKokluIsleyici }), 401, 'imza_gecersiz')
  })

  it('geçerli zincir, sertifikanın süresi dolunca reddedilir (önbellek tarihleri atlamaz)', async () => {
    const yaprak = await yaprakUret(zincir.ara, { baslangic: T0 - GUN_MS, bitis: T0 + 3_600_000 })
    const imzala = (): Promise<string> =>
      jwsImzala(baslik([yaprak, zincir.ara, zincir.kok]), yuk(), yaprak.anahtarlar.privateKey)

    const once = await imzala()
    gizliEkle(once)
    expect((await gonder(once)).durum).toBe(200)
    sonioxCagrilari.length = 0
    saat = T0 + 2 * 3_600_000
    await reddedilmeli(await imzala())
  })

  it('x5c eksik, boş, tek ya da iki öğeli ise reddedilir', async () => {
    const anahtar = zincir.yaprak.anahtarlar.privateKey
    await reddedilmeli(await jwsImzala({ alg: 'ES256' }, yuk(), anahtar))
    await reddedilmeli(await jwsImzala({ alg: 'ES256', x5c: [] }, yuk(), anahtar))
    await reddedilmeli(await jwsImzala(baslik([zincir.yaprak]), yuk(), anahtar))
    await reddedilmeli(await jwsImzala(baslik([zincir.yaprak, zincir.ara]), yuk(), anahtar))
    await reddedilmeli(await jwsImzala(baslik([zincir.yaprak, zincir.ara, zincir.kok, zincir.kok]), yuk(), anahtar))
    await reddedilmeli(await jwsImzala({ alg: 'ES256', x5c: 'yok' }, yuk(), anahtar))
    await reddedilmeli(await jwsImzala({ alg: 'ES256', x5c: ['a', 'b', 'c'] }, yuk(), anahtar))
    await reddedilmeli(await jwsImzala({ alg: 'ES256', x5c: [1, 2, 3] }, yuk(), anahtar))
  })

  it('gerekli OID uzantısı olmayan yaprak ya da ara sertifika reddedilir', async () => {
    const oidsizYaprak = await yaprakUret(zincir.ara, { ...GECERLILIK, oid: false })
    await reddedilmeli(
      await jwsImzala(baslik([oidsizYaprak, zincir.ara, zincir.kok]), yuk(), oidsizYaprak.anahtarlar.privateKey),
    )

    const oidsizAra = await araUret(zincir.kok, { ...GECERLILIK, oid: false })
    const yaprak = await yaprakUret(oidsizAra, GECERLILIK)
    await reddedilmeli(await jwsImzala(baslik([yaprak, oidsizAra, zincir.kok]), yuk(), yaprak.anahtarlar.privateKey))
  })

  it('yetkili olmayan ara sertifika ve yetkili işaretli yaprak reddedilir', async () => {
    const yetkisizAra = await araUret(zincir.kok, { ...GECERLILIK, yetkili: false })
    const yaprak = await yaprakUret(yetkisizAra, GECERLILIK)
    await reddedilmeli(await jwsImzala(baslik([yaprak, yetkisizAra, zincir.kok]), yuk(), yaprak.anahtarlar.privateKey))

    const yetkiliYaprak = await yaprakUret(zincir.ara, { ...GECERLILIK, yetkili: true })
    await reddedilmeli(
      await jwsImzala(baslik([yetkiliYaprak, zincir.ara, zincir.kok]), yuk(), yetkiliYaprak.anahtarlar.privateKey),
    )
  })

  it('JWS biçiminde olmayan metin reddedilir', async () => {
    for (const metin of ['a', 'a.b.c', '...', 'e30.e30.e30', '{"alg":"ES256"}.e30.AAAA']) {
      hataBekle(await gonder(metin), 401, 'imza_gecersiz')
    }
  })
})

describe('güvenlik: yük denetimi', () => {
  async function abonelikYok(degisiklik: Record<string, unknown>, ozelEnv?: Env): Promise<void> {
    const yanit = await gonder(await gecerliIslem(degisiklik), ozelEnv === undefined ? {} : { env: ozelEnv })
    hataBekle(yanit, 403, 'abonelik_yok')
    expect(sonioxCagrilari).toHaveLength(0)
  }

  it('yanlış bundleId', async () => {
    await abonelikYok({ bundleId: 'com.baskasi.uygulama' })
    await abonelikYok({ bundleId: undefined })
  })

  it('yanlış productId', async () => {
    await abonelikYok({ productId: 'canliceviri.aylik' })
    await abonelikYok({ productId: `${URUN}.eski` })
    await abonelikYok({ productId: undefined })
  })

  it('otomatik yenilenen abonelik olmayan tür', async () => {
    await abonelikYok({ type: 'Non-Consumable' })
    await abonelikYok({ type: 'Non-Renewing Subscription' })
  })

  it('süresi dolmuş abonelik (küçük saat kayması payıyla)', async () => {
    await abonelikYok({ expiresDate: saat - 5 * 60_000 })
    await abonelikYok({ expiresDate: undefined })
    await abonelikYok({ expiresDate: String(saat + GUN_MS) })
    // Bitişi birkaç saniye önce olan işlem, saat kayması payı içinde kabul edilir.
    expect((await gonder(await gecerliIslem({ expiresDate: saat - 5000 }))).durum).toBe(200)
  })

  it('revocationDate var', async () => {
    await abonelikYok({ revocationDate: saat - 1000, revocationReason: 0 })
  })

  it('sandbox kapalıyken sandbox işlemi', async () => {
    await abonelikYok({ environment: 'Sandbox' }, ayarli({ SANDBOX_IZINLI: 'false' }))
    await abonelikYok({ environment: 'Sandbox' }, ayarli({ SANDBOX_IZINLI: undefined }))
  })

  it('bilinmeyen ortam (Xcode, LocalTesting) ve eksik abonelik kimliği', async () => {
    await abonelikYok({ environment: 'Xcode' })
    await abonelikYok({ environment: 'LocalTesting' })
    await abonelikYok({ originalTransactionId: undefined })
    await abonelikYok({ originalTransactionId: '' })
  })
})

describe('dönem bütçesi (Production)', () => {
  /** Aynı aboneliğin, verilen dönem bitişini (`expiresDate`) taşıyan işlemiyle istek. */
  function istekci(kimlik: string, ozelEnv: Env = env): (bitis: number) => Promise<Yanit> {
    return async (bitis) =>
      gonder(await gecerliIslem({ originalTransactionId: kimlik, expiresDate: bitis }), { env: ozelEnv })
  }

  it('art arda istekler pencere beklemeden anahtar alır; her biri bir dilim düşer', async () => {
    const bitis = saat + 6 * GUN_MS
    const istek = istekci(yeniKimlik())

    // Saat hiç ilerlemez: önceki anahtarın süresi dolmadan (aynı anda bile) yenisi verilir.
    for (let i = 1; i <= 4; i++) {
      verildiBekle(await istek(bitis), DILIM_SN, DONEM_SN - i * DILIM_SN, bitis)
      expect(sonioxCagrilari.at(-1)!.govde.max_session_duration_seconds).toBe(DILIM_SN)
    }
    expect(sonioxCagrilari).toHaveLength(4)
  })

  it('bütçe güne değil döneme bağlıdır: gün dönse de yenilenmez', async () => {
    const bitis = T0 + 6 * GUN_MS
    const istek = istekci(yeniKimlik(), ayarli({ DONEM_SANIYE: '240', OTURUM_SANIYE: '120' }))

    verildiBekle(await istek(bitis), 120, 120, bitis)
    saat = T0 + GUN_MS + 3_600_000
    verildiBekle(await istek(bitis), 120, 0, bitis)

    saat = T0 + 3 * GUN_MS
    const dolu = await istek(bitis)
    sinirDolduBekle(dolu, bitis)
    // Dönemin bitişine üç gün var.
    expect(dolu.basliklar.get('Retry-After')).toBe(String(3 * 86_400))
    expect(sonioxCagrilari).toHaveLength(2)
  })

  it('aynı abonelik yeni expiresDate ile (yenileme) yeni bütçe alır', async () => {
    const ilk = T0 + GUN_MS
    const sonraki = ilk + 7 * GUN_MS
    const istek = istekci(yeniKimlik(), ayarli({ DONEM_SANIYE: '240', OTURUM_SANIYE: '120' }))

    verildiBekle(await istek(ilk), 120, 120, ilk)
    verildiBekle(await istek(ilk), 120, 0, ilk)
    sinirDolduBekle(await istek(ilk), ilk)

    // Yenilenen dönemin işlemi gelir gelmez bütçe yenilenir.
    verildiBekle(await istek(sonraki), 120, 120, sonraki)

    // Yeni dönemin bütçesi de dönem boyunca tektir.
    saat = ilk + 3_600_000
    verildiBekle(await istek(sonraki), 120, 0, sonraki)
    sinirDolduBekle(await istek(sonraki), sonraki)
    expect(sonioxCagrilari).toHaveLength(4)
  })

  it('eski (daha küçük ama süresi dolmamış) expiresDate bütçeyi sıfırlayamaz; geçerli dönemden düşer', async () => {
    const eski = T0 + GUN_MS
    const yeni = eski + 7 * GUN_MS
    const istek = istekci(yeniKimlik(), ayarli({ DONEM_SANIYE: '360', OTURUM_SANIYE: '120' }))

    verildiBekle(await istek(eski), 120, 240, eski)
    // Daha yeni dönem görüldü: sayaç bir kez sıfırlanır.
    verildiBekle(await istek(yeni), 120, 240, yeni)
    // Eski işlem hâlâ geçerli (süresi dolmadı) ama bütçeyi geri getiremez: en büyük dönemin sayacından düşer ve
    // yanıt o dönemin bitişini bildirir.
    verildiBekle(await istek(eski), 120, 120, yeni)
    verildiBekle(await istek(yeni), 120, 0, yeni)
    sinirDolduBekle(await istek(eski), yeni)
    sinirDolduBekle(await istek(yeni), yeni)

    // İkisi arasında gidip gelmek de (hız sınırı penceresi geçtikten sonra) bütçeyi yenilemez.
    saat = T0 + 61_000
    sinirDolduBekle(await istek(eski), yeni)
    sinirDolduBekle(await istek(yeni), yeni)
    sinirDolduBekle(await istek(eski), yeni)
    expect(sonioxCagrilari).toHaveLength(4)
  })

  it('bütçe bitince sinir_doldu + donem_bitis_ms; son dilim kalan bütçe kadar olur', async () => {
    const bitis = T0 + 6 * GUN_MS
    const istek = istekci(yeniKimlik(), ayarli({ DONEM_SANIYE: '200', OTURUM_SANIYE: '120' }))

    verildiBekle(await istek(bitis), 120, 80, bitis)
    verildiBekle(await istek(bitis), 80, 0, bitis)
    expect(sonioxCagrilari.at(-1)!.govde.max_session_duration_seconds).toBe(80)

    saat += 120_000
    const dolu = await istek(bitis)
    sinirDolduBekle(dolu, bitis)
    expect(dolu.basliklar.get('Retry-After')).toBe(String(6 * 86_400 - 120))
    expect(sonioxCagrilari).toHaveLength(2)
  })

  it('kalan bütçe 30 saniyeden azsa anahtar verilmez; tam 30 saniyeyse verilir', async () => {
    const bitis = T0 + 6 * GUN_MS
    const azKalan = istekci(yeniKimlik(), ayarli({ DONEM_SANIYE: '149', OTURUM_SANIYE: '120' }))
    verildiBekle(await azKalan(bitis), 120, 29, bitis)
    sinirDolduBekle(await azKalan(bitis), bitis)
    expect(sonioxCagrilari).toHaveLength(1)

    const tamKalan = istekci(yeniKimlik(), ayarli({ DONEM_SANIYE: '150', OTURUM_SANIYE: '120' }))
    verildiBekle(await tamKalan(bitis), 120, 30, bitis)
    verildiBekle(await tamKalan(bitis), 30, 0, bitis)
    sinirDolduBekle(await tamKalan(bitis), bitis)
    expect(sonioxCagrilari).toHaveLength(3)
  })

  it('bitişi saat kayması payı içinde geçmiş dönemde Retry-After en az 1 saniyedir', async () => {
    const bitis = T0 - 5000
    const istek = istekci(yeniKimlik(), ayarli({ DONEM_SANIYE: '120', OTURUM_SANIYE: '120' }))
    verildiBekle(await istek(bitis), 120, 0, bitis)
    const dolu = await istek(bitis)
    sinirDolduBekle(dolu, bitis)
    expect(dolu.basliklar.get('Retry-After')).toBe('1')
  })

  it('depolamada abonelik başına tek kayıt durur; yeni dönem eskisinin üzerine yazar', async () => {
    const kimlik = yeniKimlik()
    const ilk = T0 + GUN_MS
    const sonraki = ilk + 7 * GUN_MS
    const istek = istekci(kimlik)

    await istek(ilk)
    await istek(ilk)
    let depo = await sayacKayitlari('Production', kimlik)
    expect(depo).toHaveLength(1)
    expect(depo[0]![1]).toMatchObject({ donemBitisMs: ilk, kullanilanSn: 2 * DILIM_SN })

    // Yeni dönem: eski dönemin sayacı silinir (üzerine yazılır), ayrı bir kayıt açılmaz.
    await istek(sonraki)
    depo = await sayacKayitlari('Production', kimlik)
    expect(depo).toHaveLength(1)
    expect(depo[0]![1]).toMatchObject({ donemBitisMs: sonraki, kullanilanSn: DILIM_SN })
    expect(JSON.stringify(depo)).not.toContain(String(ilk))

    // Eski dönemle gelen istek de kayıt açmaz; geçerli dönemin sayacını artırır.
    await istek(ilk)
    depo = await sayacKayitlari('Production', kimlik)
    expect(depo).toHaveLength(1)
    expect(depo[0]![1]).toMatchObject({ donemBitisMs: sonraki, kullanilanSn: 2 * DILIM_SN })
    // Kayıtta abonelik kimliği bulunmaz.
    expect(JSON.stringify(depo)).not.toContain(kimlik)
  })
})

describe('günlük bütçe (Sandbox)', () => {
  it('bütçe UTC gününe göredir: expiresDate değişse de yenilenmez, gün dönünce yenilenir', async () => {
    const kimlik = yeniKimlik()
    const kucuk = ayarli({ SANDBOX_GUNLUK_SANIYE: '240', OTURUM_SANIYE: '120' })
    const istek = async (bitis: number): Promise<Yanit> =>
      gonder(await gecerliIslem({ originalTransactionId: kimlik, environment: 'Sandbox', expiresDate: bitis }), {
        env: kucuk,
      })
    const geceYarisi = Date.UTC(2026, 10, 28)

    saat = Date.UTC(2026, 10, 27, 23, 50, 0)
    verildiBekle(await istek(saat + 3 * 60_000), 120, 120, geceYarisi)

    // Sandbox'ta haftalık abonelik birkaç dakikada bir yenilenir: yeni expiresDate bütçeyi yenilemez.
    saat = Date.UTC(2026, 10, 27, 23, 54, 0)
    verildiBekle(await istek(saat + 3 * 60_000), 120, 0, geceYarisi)

    saat = Date.UTC(2026, 10, 27, 23, 58, 0)
    const dolu = await istek(saat + 3 * 60_000)
    sinirDolduBekle(dolu, geceYarisi)
    expect(dolu.basliklar.get('Retry-After')).toBe('120')
    // Bitişi çok ileride olan bir işlem de dönemi belirlemez.
    sinirDolduBekle(await istek(saat + 30 * GUN_MS), geceYarisi)
    expect(sonioxCagrilari).toHaveLength(2)

    // Gün döndü (tam gece yarısı yeni güne aittir): bütçe yenilenir, sıfırlanma anı bir sonraki gece yarısıdır.
    saat = geceYarisi
    verildiBekle(await istek(saat + 3 * 60_000), 120, 120, geceYarisi + GUN_MS)
    verildiBekle(await istek(saat + 3 * 60_000), 120, 0, geceYarisi + GUN_MS)
    sinirDolduBekle(await istek(saat + 3 * 60_000), geceYarisi + GUN_MS)
  })

  it('art arda istekler pencere beklemeden anahtar alır', async () => {
    const kimlik = yeniKimlik()
    const istek = async (): Promise<Yanit> =>
      gonder(await gecerliIslem({ originalTransactionId: kimlik, environment: 'Sandbox' }))
    for (let i = 1; i <= 3; i++) {
      verildiBekle(await istek(), DILIM_SN, SANDBOX_GUNLUK_SN - i * DILIM_SN, Date.UTC(2026, 10, 28))
    }
  })
})

describe('istek hızı ve IP sınırı', () => {
  it('abonelik başına dakikada 6 istekten fazlası 429 alır; reddedilen istek bütçeden düşmez', async () => {
    const kimlik = yeniKimlik()
    const bitis = T0 + 6 * GUN_MS
    const istek = async (donemBitis = bitis): Promise<Yanit> =>
      gonder(await gecerliIslem({ originalTransactionId: kimlik, expiresDate: donemBitis }))

    for (let i = 0; i < DAKIKADA_ISTEK; i++) {
      saat = T0 + i * 1000
      verildiBekle(await istek(), DILIM_SN, DONEM_SN - (i + 1) * DILIM_SN, bitis)
    }

    saat = T0 + 6000
    const yedinci = await istek()
    hataBekle(yedinci, 429, 'cok_sik')
    // Hız sınırı: ilk isteğin üzerinden bir dakika geçene dek.
    expect(yedinci.basliklar.get('Retry-After')).toBe('54')
    // Yenilenen dönemin işlemi de hız sınırını aşamaz.
    hataBekle(await istek(bitis + 7 * GUN_MS), 429, 'cok_sik')
    expect(sonioxCagrilari).toHaveLength(DAKIKADA_ISTEK)

    // Bir dakika dolunca yeniden verilir; reddedilen istekler bütçeden düşmedi ve dönemi değiştirmedi.
    saat = T0 + 60_001
    verildiBekle(await istek(), DILIM_SN, DONEM_SN - 7 * DILIM_SN, bitis)
  })

  it('bütçesi dolmuş abonelik de hız sınırına takılır', async () => {
    const kimlik = yeniKimlik()
    const bitis = T0 + 6 * GUN_MS
    const kucuk = ayarli({ DONEM_SANIYE: '120', OTURUM_SANIYE: '120' })
    const istek = async (): Promise<Yanit> =>
      gonder(await gecerliIslem({ originalTransactionId: kimlik, expiresDate: bitis }), { env: kucuk })

    verildiBekle(await istek(), 120, 0, bitis)
    for (let i = 1; i < DAKIKADA_ISTEK; i++) sinirDolduBekle(await istek(), bitis)
    const fazla = await istek()
    hataBekle(fazla, 429, 'cok_sik')
    expect(fazla.basliklar.get('Retry-After')).toBe('60')
    expect(sonioxCagrilari).toHaveLength(1)
  })

  it('geçersiz isteklerde IP başına sınır: aşılınca geçerli istek de 429 alır', async () => {
    const ip = yeniIp()
    for (let i = 0; i < IP_GECERSIZ_SINIRI; i++) {
      hataBekle(await gonderHam('{"islem":"a.b.c"}', { ip }), 401, 'imza_gecersiz')
    }
    const engelli = await gonder(await gecerliIslem(), { ip })
    hataBekle(engelli, 429, 'cok_sik')
    expect(engelli.basliklar.get('Retry-After')).toBe('60')
    expect(sonioxCagrilari).toHaveLength(0)

    // Başka IP etkilenmez.
    expect((await gonder(await gecerliIslem())).durum).toBe(200)

    // Bir dakika sonra aynı IP yeniden kabul edilir.
    saat = T0 + 60_000
    expect((await gonder(await gecerliIslem(), { ip })).durum).toBe(200)
  })

  it('geçerli istekler IP sınırına sayılmaz', async () => {
    const ip = yeniIp()
    for (let i = 0; i < IP_GECERSIZ_SINIRI + 5; i++) {
      expect((await gonder(await gecerliIslem(), { ip })).durum).toBe(200)
    }
  })
})

describe('eşzamanlı istekler', () => {
  /** Soniox yavaş yanıt verir ki istekler gerçekten üst üste binsin. */
  async function yavasca<T>(deger: () => T): Promise<T> {
    await new Promise((coz) => setTimeout(coz, 50))
    return deger()
  }

  it('eşzamanlı iki istek de anahtar alır; bütçe toplamda tam iki dilim düşer', async () => {
    const kimlik = yeniKimlik()
    const bitis = T0 + 6 * GUN_MS
    const islem = (): Promise<string> => gecerliIslem({ originalTransactionId: kimlik, expiresDate: bitis })
    const [a, b] = await Promise.all([islem(), islem()])

    sonioxYaniti = () => yavasca(sonioxBasarili)
    const yanitlar = await Promise.all([gonder(a), gonder(b)])
    expect(yanitlar.map((yanit) => yanit.durum)).toEqual([200, 200])
    expect(yanitlar.map((yanit) => yanit.govde.sure_sn)).toEqual([DILIM_SN, DILIM_SN])
    // Sayaç istekleri sırayla işler: biri bir dilim, öteki iki dilim düşülmüş kalanı görür.
    expect(yanitlar.map((yanit) => Number(yanit.govde.kalan_sn)).sort((x, y) => x - y)).toEqual([
      DONEM_SN - 2 * DILIM_SN,
      DONEM_SN - DILIM_SN,
    ])
    expect(new Set(yanitlar.map((yanit) => yanit.govde.anahtar)).size).toBe(2)
    expect(sonioxCagrilari).toHaveLength(2)

    sonioxYaniti = sonioxBasarili
    verildiBekle(await gonder(await islem()), DILIM_SN, DONEM_SN - 3 * DILIM_SN, bitis)
  })

  it('yarışta fazla harcama yok: bütçe iki dilimlikse eşzamanlı on istekten yalnız ikisi anahtar alır', async () => {
    const kimlik = yeniKimlik()
    const kucuk = ayarli({ DONEM_SANIYE: '240', OTURUM_SANIYE: '120' })
    const islemler = await Promise.all(
      Array.from({ length: 10 }, () => gecerliIslem({ originalTransactionId: kimlik })),
    )

    sonioxYaniti = () => yavasca(sonioxBasarili)
    const yanitlar = await Promise.all(islemler.map((islem) => gonder(islem, { env: kucuk })))
    const verilenler = yanitlar.filter((yanit) => yanit.durum === 200)
    expect(verilenler).toHaveLength(2)
    expect(verilenler.reduce((toplam, yanit) => toplam + Number(yanit.govde.sure_sn), 0)).toBe(240)
    expect(verilenler.map((yanit) => Number(yanit.govde.kalan_sn)).sort((x, y) => x - y)).toEqual([0, 120])
    // Kalan sekiz istek 429 alır: dakikadaki ilk altının dördü bütçeye, sonraki dördü hız sınırına takılır.
    expect(yanitlar.filter((yanit) => yanit.durum === 429)).toHaveLength(8)
    expect(yanitlar.filter((yanit) => yanit.govde.hata === 'sinir_doldu')).toHaveLength(4)
    expect(yanitlar.filter((yanit) => yanit.govde.hata === 'cok_sik')).toHaveLength(4)
    expect(sonioxCagrilari).toHaveLength(2)
  })

  it('eşzamanlı iki istekten birinde Soniox hata verirse yalnız onun dilimi geri alınır', async () => {
    const kimlik = yeniKimlik()
    const bitis = T0 + 6 * GUN_MS
    const islem = (): Promise<string> => gecerliIslem({ originalTransactionId: kimlik, expiresDate: bitis })
    const [a, b] = await Promise.all([islem(), islem()])

    let cagri = 0
    sonioxYaniti = () => {
      const ilk = ++cagri === 1
      return yavasca(() => (ilk ? new Response('ic hata', { status: 500 }) : sonioxBasarili()))
    }
    const yanitlar = await Promise.all([gonder(a), gonder(b)])
    expect(yanitlar.map((yanit) => yanit.durum).sort()).toEqual([200, 502])
    hataBekle(
      yanitlar.find((yanit) => yanit.durum === 502)!,
      502,
      'sunucu_hatasi',
    )

    // Bütçeden yalnız anahtarı verilen dilim düşmüş: sıradaki istek ikinci dilimi alır.
    sonioxYaniti = sonioxBasarili
    verildiBekle(await gonder(await islem()), DILIM_SN, DONEM_SN - 2 * DILIM_SN, bitis)
  })

  it('eşzamanlı iki istekte de Soniox hata verirse bütçe hiç düşmez', async () => {
    const kimlik = yeniKimlik()
    const bitis = T0 + 6 * GUN_MS
    const islem = (): Promise<string> => gecerliIslem({ originalTransactionId: kimlik, expiresDate: bitis })
    const [a, b] = await Promise.all([islem(), islem()])

    sonioxYaniti = () => yavasca(() => new Response('ic hata', { status: 500 }))
    const yanitlar = await Promise.all([gonder(a), gonder(b)])
    expect(yanitlar.map((yanit) => yanit.durum)).toEqual([502, 502])

    sonioxYaniti = sonioxBasarili
    verildiBekle(await gonder(await islem()), DILIM_SN, DONEM_SN - DILIM_SN, bitis)
  })
})

describe('girdi', () => {
  it('JSON olmayan gövde', async () => {
    hataBekle(await gonderHam('islem=abc'), 400, 'gecersiz_istek')
    hataBekle(await gonderHam(''), 400, 'gecersiz_istek')
    hataBekle(await gonderHam('{"islem":'), 400, 'gecersiz_istek')
  })

  it('alan yok ya da türü yanlış', async () => {
    for (const govde of ['{}', '{"islem":""}', '{"islem":123}', '{"islem":null}', '["islem"]', '"islem"', 'null']) {
      hataBekle(await gonderHam(govde), 400, 'gecersiz_istek')
    }
    hataBekle(await gonderHam(JSON.stringify({ baska: await gecerliIslem() })), 400, 'gecersiz_istek')
  })

  it("16 KB'ı aşan gövde 413 alır", async () => {
    const buyuk = JSON.stringify({ islem: 'a'.repeat(GOVDE_SINIRI) })
    hataBekle(await gonderHam(buyuk), 413, 'gecersiz_istek')
    hataBekle(
      await gonderHam('{}', { basliklar: { 'Content-Length': String(GOVDE_SINIRI + 1) } }),
      413,
      'gecersiz_istek',
    )
    // Sınırın hemen altı boyut yüzünden reddedilmez (içerik yüzünden 401 alır).
    const sinirda = JSON.stringify({ islem: 'a'.repeat(GOVDE_SINIRI - 12) })
    expect(new TextEncoder().encode(sinirda).length).toBe(GOVDE_SINIRI)
    hataBekle(await gonderHam(sinirda), 401, 'imza_gecersiz')
  })

  it('GET ve diğer yöntemler 405 alır', async () => {
    for (const yontem of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
      const yanit = await gonderHam(null, { yontem })
      hataBekle(yanit, 405, 'gecersiz_istek')
      expect(yanit.basliklar.get('Allow')).toBe('POST')
    }
  })

  it('başka yol 404 alır', async () => {
    for (const yol of ['/', '/v1', '/v1/oturum/', '/v1/oturum/x', '/v2/oturum', '/V1/OTURUM']) {
      hataBekle(await gonderHam('{}', { yol }), 404, 'gecersiz_istek')
    }
    hataBekle(await gonderHam(null, { yol: '/', yontem: 'GET' }), 404, 'gecersiz_istek')
  })
})

describe('Soniox hataları', () => {
  async function basarisizSonraBasarili(basarisiz: () => Response | Promise<Response>): Promise<void> {
    const kimlik = yeniKimlik()
    const istek = async (): Promise<Yanit> => gonder(await gecerliIslem({ originalTransactionId: kimlik }))

    sonioxYaniti = basarisiz
    const hata = await istek()
    hataBekle(hata, 502, 'sunucu_hatasi')

    // Bütçe düşmedi: hemen ardından gelen istek tam bütçeyle anahtar alır.
    sonioxYaniti = sonioxBasarili
    saat += 1000
    const yanit = await istek()
    expect(yanit.durum).toBe(200)
    expect(yanit.govde).toMatchObject({ sure_sn: DILIM_SN, kalan_sn: DONEM_SN - DILIM_SN })
  }

  it('401 dönünce 502 ve bütçe düşmez', async () => {
    await basarisizSonraBasarili(() =>
      Response.json(
        { status_code: 401, error_type: 'unauthenticated', message: 'gizli-soniox-hata-ayrintisi', request_id: 'r1' },
        { status: 401 },
      ),
    )
    for (const cikti of [...yanitMetinleri, ...kayitlar]) expect(cikti).not.toContain('gizli-soniox-hata-ayrintisi')
  })

  it('500 dönünce 502 ve bütçe düşmez', async () => {
    await basarisizSonraBasarili(() => new Response('ic hata', { status: 500 }))
  })

  it('ağ hatasında 502 ve bütçe düşmez', async () => {
    await basarisizSonraBasarili(() => {
      throw new TypeError('ağ hatası')
    })
  })

  it('yanıtta api_key yoksa 502 ve bütçe düşmez', async () => {
    await basarisizSonraBasarili(() => Response.json({ expires_at: 'x' }, { status: 201 }))
    await basarisizSonraBasarili(() => new Response('json değil', { status: 200 }))
  })
})

describe('yapılandırma', () => {
  it('OZET_TUZU yoksa ya da kısaysa sunucu_hatasi (başka değerden türetilmez)', async () => {
    for (const tuz of [undefined, '', 'kisa']) {
      hataBekle(await gonder(await gecerliIslem(), { env: ayarli({ OZET_TUZU: tuz }) }), 500, 'sunucu_hatasi')
    }
    expect(sonioxCagrilari).toHaveLength(0)
  })

  it('SONIOX_API_KEY yoksa ya da değerler bozuksa sunucu_hatasi', async () => {
    for (const bozuk of [
      { SONIOX_API_KEY: undefined },
      { PAKET_KIMLIGI: '' },
      { URUN_KIMLIGI: undefined },
      { DONEM_SANIYE: 'çok' },
      { DONEM_SANIYE: '604801' },
      { OTURUM_SANIYE: '5' },
      { SANDBOX_GUNLUK_SANIYE: '-1' },
    ] satisfies Partial<Env>[]) {
      hataBekle(await gonder(await gecerliIslem(), { env: ayarli(bozuk) }), 500, 'sunucu_hatasi')
    }
    expect(sonioxCagrilari).toHaveLength(0)
  })

  it('sayısal değerler verilmezse varsayılanlar kullanılır', async () => {
    const varsayilan = ayarli({ DONEM_SANIYE: undefined, SANDBOX_GUNLUK_SANIYE: undefined, OTURUM_SANIYE: undefined })
    // Varsayılanlar: dönem 9600 sn (160 dakika), Sandbox günlük 1800 sn, dilim 120 sn.
    expect((await gonder(await gecerliIslem(), { env: varsayilan })).govde).toMatchObject({
      sure_sn: 120,
      kalan_sn: 9480,
    })
    expect((await gonder(await gecerliIslem({ environment: 'Sandbox' }), { env: varsayilan })).govde).toMatchObject({
      sure_sn: 120,
      kalan_sn: 1680,
    })
  })

  it('kaldırılan GUNLUK_SANIYE değişkeni okunmaz; Production bütçesini yalnız DONEM_SANIYE belirler', async () => {
    const eskiDegiskenli = { ...env, GUNLUK_SANIYE: '60' } as Env
    expect((await gonder(await gecerliIslem(), { env: eskiDegiskenli })).govde).toMatchObject({
      sure_sn: DILIM_SN,
      kalan_sn: DONEM_SN - DILIM_SN,
    })
    // Sandbox bütçesi DONEM_SANIYE'den, Production bütçesi SANDBOX_GUNLUK_SANIYE'den etkilenmez.
    const ayrik = ayarli({ DONEM_SANIYE: '300', SANDBOX_GUNLUK_SANIYE: '500' })
    expect((await gonder(await gecerliIslem(), { env: ayrik })).govde).toMatchObject({ kalan_sn: 180 })
    expect((await gonder(await gecerliIslem({ environment: 'Sandbox' }), { env: ayrik })).govde).toMatchObject({
      kalan_sn: 380,
    })
  })
})

describe('sızıntı', () => {
  it('hiçbir yanıtta ve kayıtta Soniox anahtarı, işlem, abonelik kimliği ya da IP geçmez', async () => {
    // Bu dosyadaki her testin çıktısı toplanır; burada birkaç yol daha çalıştırılıp tümü birlikte taranır.
    const kimlik = yeniKimlik()
    const ip = yeniIp()
    await gonder(await gecerliIslem({ originalTransactionId: kimlik }), { ip })
    await gonder(await gecerliIslem({ originalTransactionId: kimlik }), { ip })
    await gonder(await gecerliIslem({ originalTransactionId: kimlik, productId: 'baska' }), { ip })
    sonioxYaniti = () => new Response('hata', { status: 500 })
    await gonder(await gecerliIslem(), { ip })

    expect(SONIOX_ANAHTARI.length).toBeGreaterThan(20)
    expect(gizliler.size).toBeGreaterThan(100)
    expect(yanitMetinleri.length).toBeGreaterThan(100)
    expect(kayitlar.length).toBeGreaterThan(100)
    for (const cikti of [...yanitMetinleri, ...kayitlar]) {
      for (const gizli of gizliler) expect(cikti.includes(gizli)).toBe(false)
    }
    // Geçici anahtar yalnız başarı yanıtında bulunur; kayıtlara yazılmaz.
    expect(verilenGeciciAnahtarlar.length).toBeGreaterThan(10)
    for (const kayit of kayitlar) {
      for (const gecici of verilenGeciciAnahtarlar) expect(kayit.includes(gecici)).toBe(false)
    }
  })

  it('kayıtlar yalnız sonuç kodu, ortam, kısa özet ve (sunucu hatasında) kaynak taşır', () => {
    const sonuclar = new Set<string>()
    for (const kayit of kayitlar) {
      const alanlar = JSON.parse(kayit) as Record<string, unknown>
      expect(alanlar.olay).toBe('oturum')
      for (const ad of Object.keys(alanlar)) expect(['olay', 'sonuc', 'ortam', 'ozet', 'kaynak']).toContain(ad)
      if (alanlar.ortam !== undefined) expect(['Production', 'Sandbox']).toContain(alanlar.ortam)
      if (alanlar.ozet !== undefined) expect(alanlar.ozet).toMatch(/^[0-9a-f]{24}$/)
      if (alanlar.kaynak !== undefined) {
        expect(alanlar.sonuc).toBe('sunucu_hatasi')
        expect(alanlar.kaynak).toMatch(/^(yapilandirma|soniox:\d{1,3})$/)
      }
      sonuclar.add(String(alanlar.sonuc))
    }
    expect([...sonuclar].sort()).toEqual([
      'abonelik_yok',
      'cok_sik',
      'gecersiz_istek',
      'imza_gecersiz',
      'sinir_doldu',
      'sunucu_hatasi',
      'verildi',
    ])
  })

  it('imza ve yük hatalarının yanıtı, hangi denetimin düştüğünü ayırt ettirmez', async () => {
    const imzaYanitlari = new Set<string>()
    const baska = await zincirUret(T0, 'Baska Kok 2')
    const oidsiz = await yaprakUret(zincir.ara, { ...GECERLILIK, oid: false })
    for (const jws of [
      'a.b.c',
      await jwsImzala({ ...baslik(), alg: 'none' }, yuk(), zincir.yaprak.anahtarlar.privateKey),
      await jwsImzala(baslik([baska.yaprak, baska.ara, baska.kok]), yuk(), baska.yaprak.anahtarlar.privateKey),
      await jwsImzala(baslik([oidsiz, zincir.ara, zincir.kok]), yuk(), oidsiz.anahtarlar.privateKey),
      (await gecerliIslem()).slice(0, -6) + 'AAAAAA',
    ]) {
      gizliEkle(jws)
      const yanit = await gonder(jws)
      imzaYanitlari.add(`${yanit.durum} ${JSON.stringify(yanit.govde)}`)
    }
    expect(imzaYanitlari.size).toBe(1)

    const yukYanitlari = new Set<string>()
    for (const degisiklik of [
      { bundleId: 'x' },
      { productId: 'x' },
      { expiresDate: 1 },
      { revocationDate: 1 },
      { type: 'Consumable' },
    ]) {
      const yanit = await gonder(await gecerliIslem(degisiklik))
      yukYanitlari.add(`${yanit.durum} ${JSON.stringify(yanit.govde)}`)
    }
    expect(yukYanitlari.size).toBe(1)
  })
})
