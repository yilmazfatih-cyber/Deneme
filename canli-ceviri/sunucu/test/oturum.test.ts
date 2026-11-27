// POST /v1/oturum uçtan uca testleri. Workers çalışma zamanında koşar; Durable Object'ler gerçektir, Soniox sahtedir.
// Güven kökü olarak burada üretilen test kökü verilir (yalnız testte mümkündür).

import { env as calismaOrtami } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Env } from '../src/ayarlar'
import worker from '../src/index'
import { kokuHazirla } from '../src/jws'
import { DEVIR_PAYI_MS, IP_GECERSIZ_SINIRI } from '../src/sayac'
import type { GetirIslevi } from '../src/soniox'
import { GOVDE_SINIRI, type Isleyici, isleyiciOlustur } from '../src/uygulama'
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
const URUN = 'canliceviri.sinirsiz.haftalik'
const GUN_MS = 86_400_000
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
  expect(Object.keys(yanit.govde).sort()).toEqual(['hata', 'ileti'])
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
    const yanit = await gonder(await gecerliIslem())
    expect(yanit.durum).toBe(200)
    expect(yanit.govde).toEqual({ anahtar: verilenGeciciAnahtarlar.at(-1), sure_sn: 600, kalan_sn: 6600 })
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
      max_session_duration_seconds: 600,
    })
    // Abonelik kimliğinin kendisi değil, kısaltılmış tuzlu özeti gider.
    expect(cagri.govde.client_reference_id).toMatch(/^[0-9a-f]{24}$/)
  })

  it('aynı abonelik hep aynı özetle, farklı abonelik farklı özetle gider', async () => {
    const kimlik = yeniKimlik()
    await gonder(await gecerliIslem({ originalTransactionId: kimlik }))
    saat += 600_000
    await gonder(await gecerliIslem({ originalTransactionId: kimlik }))
    await gonder(await gecerliIslem())
    const ozetler = sonioxCagrilari.map((cagri) => cagri.govde.client_reference_id)
    expect(ozetler).toHaveLength(3)
    expect(ozetler[0]).toBe(ozetler[1])
    expect(ozetler[2]).not.toBe(ozetler[0])
  })

  it('sandbox işlemi (izinliyken) ayrı ve düşük bütçe kullanır', async () => {
    const yanit = await gonder(await gecerliIslem({ environment: 'Sandbox' }))
    expect(yanit.durum).toBe(200)
    expect(yanit.govde).toMatchObject({ sure_sn: 600, kalan_sn: 1200 })
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
    await abonelikYok({ productId: 'canliceviri.sinirsiz.aylik' })
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

describe('kullanım sınırları', () => {
  it('pencere bitmeden ikinci istek 429 alır; son 30 saniyede devir izinlidir', async () => {
    const kimlik = yeniKimlik()
    const islem = (): Promise<string> => gecerliIslem({ originalTransactionId: kimlik })

    expect((await gonder(await islem())).durum).toBe(200)

    saat = T0 + 100_000
    const erken = await gonder(await islem())
    hataBekle(erken, 429, 'cok_sik')
    expect(erken.basliklar.get('Retry-After')).toBe('470')

    saat = T0 + 600_000 - DEVIR_PAYI_MS - 1000
    const birSaniyeKala = await gonder(await islem())
    hataBekle(birSaniyeKala, 429, 'cok_sik')
    expect(birSaniyeKala.basliklar.get('Retry-After')).toBe('1')

    saat = T0 + 600_000 - DEVIR_PAYI_MS
    const devir = await gonder(await islem())
    expect(devir.durum).toBe(200)
    // Süre verildiği anda tam düşülür: iki oturum = 1200 sn.
    expect(devir.govde).toMatchObject({ sure_sn: 600, kalan_sn: 6000 })
    expect(sonioxCagrilari).toHaveLength(2)
  })

  it('bütçe tükenince sinir_doldu; son oturum kalan bütçe kadar olur', async () => {
    const kimlik = yeniKimlik()
    const kucuk = ayarli({ GUNLUK_SANIYE: '100', OTURUM_SANIYE: '60' })
    const istek = async (): Promise<Yanit> =>
      gonder(await gecerliIslem({ originalTransactionId: kimlik }), { env: kucuk })

    expect((await istek()).govde).toMatchObject({ sure_sn: 60, kalan_sn: 40 })
    saat += 60_000
    expect((await istek()).govde).toMatchObject({ sure_sn: 40, kalan_sn: 0 })
    expect(sonioxCagrilari.at(-1)!.govde.max_session_duration_seconds).toBe(40)

    saat += 60_000
    const dolu = await istek()
    hataBekle(dolu, 429, 'sinir_doldu')
    // Gece yarısına (UTC) kalan süre: 12:02:00 → 11 saat 58 dakika.
    expect(dolu.basliklar.get('Retry-After')).toBe(String(12 * 3600 - 120))
    expect(sonioxCagrilari).toHaveLength(2)
  })

  it('kalan bütçe 30 saniyeden azsa anahtar verilmez', async () => {
    const kimlik = yeniKimlik()
    const kucuk = ayarli({ GUNLUK_SANIYE: '80', OTURUM_SANIYE: '60' })
    const istek = async (): Promise<Yanit> =>
      gonder(await gecerliIslem({ originalTransactionId: kimlik }), { env: kucuk })

    expect((await istek()).govde).toMatchObject({ sure_sn: 60, kalan_sn: 20 })
    saat += 60_000
    hataBekle(await istek(), 429, 'sinir_doldu')
    expect(sonioxCagrilari).toHaveLength(1)
  })

  it('gün dönünce (UTC) bütçe sıfırlanır', async () => {
    const kimlik = yeniKimlik()
    const kucuk = ayarli({ GUNLUK_SANIYE: '60', OTURUM_SANIYE: '60' })
    const istek = async (): Promise<Yanit> =>
      gonder(await gecerliIslem({ originalTransactionId: kimlik }), { env: kucuk })

    saat = Date.UTC(2026, 10, 27, 23, 50, 0)
    expect((await istek()).govde).toMatchObject({ sure_sn: 60, kalan_sn: 0 })

    saat = Date.UTC(2026, 10, 27, 23, 59, 30)
    const dolu = await istek()
    hataBekle(dolu, 429, 'sinir_doldu')
    expect(dolu.basliklar.get('Retry-After')).toBe('30')

    saat = Date.UTC(2026, 10, 28, 0, 0, 5)
    expect((await istek()).govde).toMatchObject({ sure_sn: 60, kalan_sn: 0 })
  })

  it('abonelik başına dakikada 6 istekten fazlası 429 alır', async () => {
    const kimlik = yeniKimlik()
    const istek = async (): Promise<Yanit> => gonder(await gecerliIslem({ originalTransactionId: kimlik }))

    expect((await istek()).durum).toBe(200)
    for (let i = 1; i <= 5; i++) {
      saat = T0 + i * 1000
      // 2.–6. istekler hız sınırına değil, oturum penceresine takılır (bekleme süresi pencereye göre).
      const yanit = await istek()
      hataBekle(yanit, 429, 'cok_sik')
      expect(yanit.basliklar.get('Retry-After')).toBe(String(570 - i))
    }

    saat = T0 + 6000
    const yedinci = await istek()
    hataBekle(yedinci, 429, 'cok_sik')
    // Hız sınırı: ilk isteğin üzerinden bir dakika geçene dek.
    expect(yedinci.basliklar.get('Retry-After')).toBe('54')

    // Hız sınırı, devir anı gelmiş olsa bile uygulanır: dakikada 6 istek dolmuşken anahtar verilmez.
    const kisa = ayarli({ OTURUM_SANIYE: '30' })
    const kimlik2 = yeniKimlik()
    const hizli = async (): Promise<Yanit> =>
      gonder(await gecerliIslem({ originalTransactionId: kimlik2 }), { env: kisa })
    saat = T0
    for (let i = 0; i < 6; i++) {
      saat = T0 + i * 1000
      expect((await hizli()).durum).toBe(200)
    }
    saat = T0 + 7000
    hataBekle(await hizli(), 429, 'cok_sik')
    saat = T0 + 61_000
    expect((await hizli()).durum).toBe(200)
  })

  it('iki eşzamanlı istekten yalnız biri anahtar alır', async () => {
    const kimlik = yeniKimlik()
    const [a, b] = await Promise.all([
      gecerliIslem({ originalTransactionId: kimlik }),
      gecerliIslem({ originalTransactionId: kimlik }),
    ])
    // Soniox yavaş yanıt verir ki iki istek gerçekten üst üste binsin.
    sonioxYaniti = async () => {
      await new Promise((coz) => setTimeout(coz, 50))
      return sonioxBasarili()
    }
    const yanitlar = await Promise.all([gonder(a), gonder(b)])
    expect(yanitlar.map((yanit) => yanit.durum).sort()).toEqual([200, 429])
    const reddedilen = yanitlar.find((yanit) => yanit.durum === 429)!
    hataBekle(reddedilen, 429, 'cok_sik')
    expect(sonioxCagrilari).toHaveLength(1)
  })

  it('on eşzamanlı istekten yalnız biri anahtar alır', async () => {
    const kimlik = yeniKimlik()
    const islemler = await Promise.all(
      Array.from({ length: 10 }, () => gecerliIslem({ originalTransactionId: kimlik })),
    )
    const yanitlar = await Promise.all(islemler.map((islem) => gonder(islem)))
    expect(yanitlar.filter((yanit) => yanit.durum === 200)).toHaveLength(1)
    expect(yanitlar.filter((yanit) => yanit.durum === 429)).toHaveLength(9)
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

    // Bütçe düşmedi ve pencere açılmadı: hemen ardından gelen istek tam bütçeyle anahtar alır.
    sonioxYaniti = sonioxBasarili
    saat += 1000
    const yanit = await istek()
    expect(yanit.durum).toBe(200)
    expect(yanit.govde).toMatchObject({ sure_sn: 600, kalan_sn: 6600 })
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
      { GUNLUK_SANIYE: 'çok' },
      { OTURUM_SANIYE: '5' },
      { SANDBOX_GUNLUK_SANIYE: '-1' },
    ] satisfies Partial<Env>[]) {
      hataBekle(await gonder(await gecerliIslem(), { env: ayarli(bozuk) }), 500, 'sunucu_hatasi')
    }
    expect(sonioxCagrilari).toHaveLength(0)
  })

  it('sayısal değerler verilmezse varsayılanlar kullanılır', async () => {
    const varsayilan = ayarli({ GUNLUK_SANIYE: undefined, SANDBOX_GUNLUK_SANIYE: undefined, OTURUM_SANIYE: undefined })
    expect((await gonder(await gecerliIslem(), { env: varsayilan })).govde).toMatchObject({
      sure_sn: 600,
      kalan_sn: 6600,
    })
    expect((await gonder(await gecerliIslem({ environment: 'Sandbox' }), { env: varsayilan })).govde).toMatchObject({
      sure_sn: 600,
      kalan_sn: 1200,
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
