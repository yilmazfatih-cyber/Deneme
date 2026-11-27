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

import 'reflect-metadata'
import * as x509 from '@peculiar/x509'
import { base64Coz, base64UrlCoz, baytlarEsit, jsonCoz } from './yardimci'

/** Yaprakta aranan uzantı: App Store alındı imzalama. */
export const YAPRAK_OID = '1.2.840.113635.100.6.11.1'
/** Ara sertifikada aranan uzantı: Apple Worldwide Developer Relations ara yetkilisi. */
export const ARA_OID = '1.2.840.113635.100.6.2.1'

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

interface DogrulanmisZincir {
  anahtar: CryptoKey
  /** Zincirdeki en geç başlangıç ve en erken bitiş (ms). */
  baslangic: number
  bitis: number
}

// Apple aynı yaprak ve ara sertifikayı uzun süre kullanır. Doğrulanan zincir bu çalışma örneğinde saklanır ki her
// istekte üç sertifika yeniden ayrıştırılıp imzaları yeniden denetlenmesin (ücretsiz planda işlemci süresi kısıtlı).
// Anahtar kökü de içerir; yalnız doğrulaması başarılı zincirler saklanır ve tarihleri her kullanımda yeniden bakılır.
const zincirOnbellegi = new Map<string, DogrulanmisZincir>()

function reddet(): never {
  throw new DogrulamaHatasi()
}

function adlarEsit(a: x509.Name, b: x509.Name): boolean {
  return baytlarEsit(new Uint8Array(a.toArrayBuffer()), new Uint8Array(b.toArrayBuffer()))
}

function yetkiliMi(sertifika: x509.X509Certificate): boolean {
  return sertifika.getExtension(x509.BasicConstraintsExtension)?.ca === true
}

function tarihiGecerli(baslangic: number, bitis: number, simdi: number): boolean {
  return baslangic <= simdi + SAAT_KAYMASI_MS && bitis >= simdi - SAAT_KAYMASI_MS
}

/**
 * Sertifika zincirini (DER; yaprak, ara, kök) sabit köke göre doğrular ve yaprağın açık anahtarını döndürür.
 * Herhangi bir kural tutmazsa `DogrulamaHatasi` fırlatır.
 */
export async function zinciriDogrula(zincir: Uint8Array[], kokDer: Uint8Array, simdi: number): Promise<CryptoKey> {
  if (zincir.length !== 3) reddet()
  const [yaprakDer, araDer, zincirKokDer] = zincir as [Uint8Array, Uint8Array, Uint8Array]
  if (!baytlarEsit(zincirKokDer, kokDer)) reddet()

  const onbellekAnahtari = [kokDer, araDer, yaprakDer].map((der) => btoa(String.fromCharCode(...der))).join('.')
  const sakli = zincirOnbellegi.get(onbellekAnahtari)
  if (sakli !== undefined) {
    if (!tarihiGecerli(sakli.baslangic, sakli.bitis, simdi)) reddet()
    return sakli.anahtar
  }

  let anahtar: CryptoKey
  let baslangic: number
  let bitis: number
  try {
    const kok = new x509.X509Certificate(kokDer)
    const ara = new x509.X509Certificate(araDer)
    const yaprak = new x509.X509Certificate(yaprakDer)

    baslangic = Math.max(kok.notBefore.getTime(), ara.notBefore.getTime(), yaprak.notBefore.getTime())
    bitis = Math.min(kok.notAfter.getTime(), ara.notAfter.getTime(), yaprak.notAfter.getTime())
    if (!tarihiGecerli(baslangic, bitis, simdi)) reddet()

    // Kök: kendi kendini imzalamış bir yetkili.
    if (!adlarEsit(kok.issuerName, kok.subjectName) || !yetkiliMi(kok)) reddet()
    if (!(await kok.verify({ publicKey: kok.publicKey, signatureOnly: true }, crypto))) reddet()

    // Ara: kökün imzaladığı, Apple'ın işaretlediği bir yetkili.
    if (!adlarEsit(ara.issuerName, kok.subjectName) ) reddet()
    if (ara.getExtension(ARA_OID) === null) reddet()
    if (!(await ara.verify({ publicKey: kok.publicKey, signatureOnly: true }, crypto))) reddet()

    // Yaprak: aranın imzaladığı, App Store imzalama için işaretlenmiş, yetkili olmayan sertifika.
    if (!adlarEsit(yaprak.issuerName, ara.subjectName) || yetkiliMi(yaprak)) reddet()
    if (yaprak.getExtension(YAPRAK_OID) === null) reddet()
    if (!(await yaprak.verify({ publicKey: ara.publicKey, signatureOnly: true }, crypto))) reddet()

    // ES256 yalnız P-256 anahtarla doğrulanır; yaprağın anahtarı başka türdeyse içe aktarma hata verir.
    anahtar = await crypto.subtle.importKey(
      'spki',
      yaprak.publicKey.rawData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
  } catch {
    reddet()
  }

  if (zincirOnbellegi.size >= ZINCIR_ONBELLEK_SINIRI) zincirOnbellegi.clear()
  zincirOnbellegi.set(onbellekAnahtari, { anahtar, baslangic, bitis })
  return anahtar
}

/**
 * İmzalı işlemi doğrular ve yükünü (JSON nesnesi) döndürür. Yükün içeriği burada denetlenmez (bkz. abonelik.ts).
 * Herhangi bir kural tutmazsa `DogrulamaHatasi` fırlatır.
 */
export async function jwsDogrula(jws: string, kokDer: Uint8Array, simdi: number): Promise<Record<string, unknown>> {
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

  const anahtar = await zinciriDogrula(zincir, kokDer, simdi)

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
