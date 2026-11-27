// App Store imzalı işlem (StoreKit 2, JWS) doğrulaması.
//
// Kurallar (Apple'ın kendi sunucu kitaplığındaki denetimlerle aynı, kök eşleşmesi daha sıkı):
//   - Başlıkta `alg` yalnız ES256 olabilir; `none`, HS256 ve diğer her şey reddedilir.
//   - `x5c` tam üç sertifika taşır: yaprak → ara → kök.
//   - Kök, sabitlenmiş "Apple Root CA - G3" ile bayt bayt aynıdır.
//   - Ara sertifikayı kök, yaprağı ara sertifika imzalamıştır; yayımcı adı bir üsttekinin konu adına eşittir.
//   - Üç sertifika da şu an geçerlidir (küçük saat kayması payıyla).
//   - Ara sertifika bir sertifika yetkilisidir ve 1.2.840.113635.100.6.2.1 uzantısını taşır.
//   - Yaprak 1.2.840.113635.100.6.11.1 uzantısını taşır (App Store alındı imzalama) ve yetkili değildir.
//   - JWS imzası yaprağın P-256 açık anahtarıyla doğrulanır.
// Sertifika iptal sorgusu (OCSP) yapılmaz; bkz. README "Bilinen sınırlar".
//
// İşlemci süresi: ücretsiz planda istek başına 10 ms vardır ve sertifika ayrıştırma pahalıdır. Bu yüzden kök bir kez,
// modül yüklenirken ayrıştırılır; doğrulanan zincir çalışma örneğinde saklanır; uzantılara ham haliyle bakılır.

import 'reflect-metadata'
import * as x509 from '@peculiar/x509'
import { base64Coz, base64UrlCoz, baytlarEsit, jsonCoz } from './yardimci'

/** Yaprakta aranan uzantı: App Store alındı imzalama. */
export const YAPRAK_OID = '1.2.840.113635.100.6.11.1'
/** Ara sertifikada aranan uzantı: Apple Worldwide Developer Relations ara yetkilisi. */
export const ARA_OID = '1.2.840.113635.100.6.2.1'
const TEMEL_KISITLAR_OID = '2.5.29.19'

/** Sertifika geçerlilik tarihlerinde hoş görülen saat kayması. */
const SAAT_KAYMASI_MS = 60_000
const ZINCIR_ONBELLEK_SINIRI = 8

/**
 * Doğrulama düştüğünde fırlatılır. Bilerek ayrıntı taşımaz: hangi adımın düştüğü yanıta da kayda da yazılmaz.
 */
export class DogrulamaHatasi extends Error {
  constructor() {
    super('İşlem doğrulanamadı.')
    this.name = 'DogrulamaHatasi'
  }
}

function reddet(): never {
  throw new DogrulamaHatasi()
}

/**
 * Kitaplığın sertifika sınıfı + uzantılara ham erişim. Kitaplığın `getExtension` yolu sertifikadaki bütün uzantıları
 * tek tek yeniden kodlayıp ayrıştırır; burada yalnız aranan uzantının varlığına ve ham değerine bakılır.
 */
class Sertifika extends x509.X509Certificate {
  /** Uzantının ham değeri; uzantı yoksa `null`. */
  uzantiDegeri(oid: string): Uint8Array | null {
    const uzanti = this.asn.tbsCertificate.extensions?.find((oge) => oge.extnID === oid)
    return uzanti === undefined ? null : new Uint8Array(uzanti.extnValue.buffer)
  }

  /**
   * Sertifika yetkilisi mi? BasicConstraints ::= SEQUENCE { cA BOOLEAN DEFAULT FALSE, pathLen INTEGER OPTIONAL };
   * DER'de cA = TRUE tam olarak `01 01 FF` baytlarıdır ve dizinin ilk öğesidir.
   */
  get yetkili(): boolean {
    const deger = this.uzantiDegeri(TEMEL_KISITLAR_OID)
    return (
      deger !== null &&
      deger.length >= 5 &&
      deger[0] === 0x30 &&
      deger[2] === 0x01 &&
      deger[3] === 0x01 &&
      deger[4] === 0xff
    )
  }
}

function adlarEsit(a: x509.Name, b: x509.Name): boolean {
  return baytlarEsit(new Uint8Array(a.toArrayBuffer()), new Uint8Array(b.toArrayBuffer()))
}

function tarihiGecerli(baslangic: number, bitis: number, simdi: number): boolean {
  return baslangic <= simdi + SAAT_KAYMASI_MS && bitis >= simdi - SAAT_KAYMASI_MS
}

interface DogrulanmisZincir {
  anahtar: CryptoKey
  /** Zincirdeki (kök dahil) en geç başlangıç ve en erken bitiş (ms). */
  baslangic: number
  bitis: number
}

/** Ayrıştırılmış güven kökü ve ona göre doğrulanmış zincirlerin önbelleği. `kokuHazirla` ile üretilir. */
export interface GuvenKoku {
  readonly der: Uint8Array
  readonly sertifika: Sertifika
  // Apple aynı yaprak ve ara sertifikayı uzun süre kullanır. Doğrulanan zincir saklanır ki her istekte sertifikalar
  // yeniden ayrıştırılıp imzaları yeniden denetlenmesin. Yalnız doğrulaması başarılı zincirler saklanır ve tarihlerine
  // her kullanımda yeniden bakılır.
  readonly onbellek: Map<string, DogrulanmisZincir>
}

/**
 * Güven kökünü (DER) ayrıştırır. Kök, kendi adına düzenlenmiş bir yetkili değilse hata fırlatır.
 * Kökün kendi imzası burada denetlenmez: kök bayt bayt sabitlenmiştir, güveni imzasından değil sabitlenmesinden gelir
 * (sabit Apple kökünün imzası testte ayrıca doğrulanır).
 */
export function kokuHazirla(der: Uint8Array): GuvenKoku {
  const sertifika = new Sertifika(der)
  if (!adlarEsit(sertifika.issuerName, sertifika.subjectName) || !sertifika.yetkili) {
    throw new Error('Güven kökü kendi adına düzenlenmiş bir sertifika yetkilisi değil.')
  }
  return { der, sertifika, onbellek: new Map() }
}

function base64Yap(baytlar: Uint8Array): string {
  let ikili = ''
  for (const bayt of baytlar) ikili += String.fromCharCode(bayt)
  return btoa(ikili)
}

/**
 * Sertifika zincirini (DER; yaprak, ara, kök) güven köküne göre doğrular ve yaprağın açık anahtarını döndürür.
 * Herhangi bir kural tutmazsa `DogrulamaHatasi` fırlatır.
 */
export async function zinciriDogrula(zincir: Uint8Array[], guvenKoku: GuvenKoku, simdi: number): Promise<CryptoKey> {
  if (zincir.length !== 3) reddet()
  const [yaprakDer, araDer, zincirKokDer] = zincir as [Uint8Array, Uint8Array, Uint8Array]
  // Zincirdeki kök, güvenilen kökle bayt bayt aynı olmalı. Bundan sonra yalnız güvenilen kökün kendisi kullanılır.
  if (!baytlarEsit(zincirKokDer, guvenKoku.der)) reddet()

  const onbellekAnahtari = `${base64Yap(araDer)}.${base64Yap(yaprakDer)}`
  const sakli = guvenKoku.onbellek.get(onbellekAnahtari)
  if (sakli !== undefined) {
    if (!tarihiGecerli(sakli.baslangic, sakli.bitis, simdi)) reddet()
    return sakli.anahtar
  }

  let dogrulanmis: DogrulanmisZincir
  try {
    const kok = guvenKoku.sertifika
    const ara = new Sertifika(araDer)
    const yaprak = new Sertifika(yaprakDer)

    const baslangic = Math.max(kok.notBefore.getTime(), ara.notBefore.getTime(), yaprak.notBefore.getTime())
    const bitis = Math.min(kok.notAfter.getTime(), ara.notAfter.getTime(), yaprak.notAfter.getTime())
    if (!tarihiGecerli(baslangic, bitis, simdi)) reddet()

    // Ara: kökün imzaladığı, Apple'ın işaretlediği bir yetkili.
    if (!adlarEsit(ara.issuerName, kok.subjectName) || !ara.yetkili) reddet()
    if (ara.uzantiDegeri(ARA_OID) === null) reddet()
    if (!(await ara.verify({ publicKey: kok.publicKey, signatureOnly: true }, crypto))) reddet()

    // Yaprak: aranın imzaladığı, App Store imzalama için işaretlenmiş, yetkili olmayan sertifika.
    if (!adlarEsit(yaprak.issuerName, ara.subjectName) || yaprak.yetkili) reddet()
    if (yaprak.uzantiDegeri(YAPRAK_OID) === null) reddet()
    if (!(await yaprak.verify({ publicKey: ara.publicKey, signatureOnly: true }, crypto))) reddet()

    // ES256 yalnız P-256 anahtarla doğrulanır; yaprağın anahtarı başka türdeyse içe aktarma hata verir.
    const anahtar = await crypto.subtle.importKey(
      'spki',
      yaprak.publicKey.rawData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    dogrulanmis = { anahtar, baslangic, bitis }
  } catch {
    reddet()
  }

  if (guvenKoku.onbellek.size >= ZINCIR_ONBELLEK_SINIRI) guvenKoku.onbellek.clear()
  guvenKoku.onbellek.set(onbellekAnahtari, dogrulanmis)
  return dogrulanmis.anahtar
}

/**
 * İmzalı işlemi doğrular ve yükünü (JSON nesnesi) döndürür. Yükün içeriği burada denetlenmez (bkz. abonelik.ts).
 * Herhangi bir kural tutmazsa `DogrulamaHatasi` fırlatır.
 */
export async function jwsDogrula(jws: string, guvenKoku: GuvenKoku, simdi: number): Promise<Record<string, unknown>> {
  const parcalar = jws.split('.')
  if (parcalar.length !== 3) reddet()
  const [baslikMetni, yukMetni, imzaMetni] = parcalar as [string, string, string]

  const baslik = jsonNesnesiCoz(baslikMetni)
  // `alg` tam olarak "ES256" olmalı: "none", "HS256", "es256" ve diğer her değer reddedilir.
  if (baslik.alg !== 'ES256') reddet()

  const x5c = baslik.x5c
  if (!Array.isArray(x5c) || x5c.length !== 3) reddet()
  const zincir: Uint8Array[] = []
  for (const oge of x5c) {
    const der = typeof oge === 'string' ? base64Coz(oge) : null
    if (der === null || der.length === 0) reddet()
    zincir.push(der)
  }

  const anahtar = await zinciriDogrula(zincir, guvenKoku, simdi)

  // JOSE imzası r||s biçimindedir; P-256 için tam 64 bayt.
  const imza = base64UrlCoz(imzaMetni)
  if (imza === null || imza.length !== 64) reddet()
  const imzalanan = new TextEncoder().encode(`${baslikMetni}.${yukMetni}`)
  let gecerli = false
  try {
    gecerli = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, anahtar, imza, imzalanan)
  } catch {
    reddet()
  }
  if (!gecerli) reddet()

  return jsonNesnesiCoz(yukMetni)
}

function jsonNesnesiCoz(base64Url: string): Record<string, unknown> {
  const baytlar = base64UrlCoz(base64Url)
  if (baytlar === null) reddet()
  let deger: unknown
  try {
    deger = jsonCoz(baytlar)
  } catch {
    reddet()
  }
  if (typeof deger !== 'object' || deger === null || Array.isArray(deger)) reddet()
  return deger as Record<string, unknown>
}
