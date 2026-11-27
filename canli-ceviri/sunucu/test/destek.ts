// Test desteği: Workers çalışma zamanında test sertifika zinciri üretir ve işlem (JWS) imzalar.
// Buradaki kök yalnız testlerde, `isleyiciOlustur` doğrudan çağrılarak verilir; üretim girişi onu kabul etmez.

import 'reflect-metadata'
import * as x509 from '@peculiar/x509'
import { ARA_OID, YAPRAK_OID } from '../src/jws'

const GUN_MS = 86_400_000
/** Uzantının değeri: ASN.1 NULL (Apple'ın sertifikalarındaki gibi). */
const BOS_DEGER = new Uint8Array([0x05, 0x00])

export interface Sertifika {
  der: Uint8Array
  anahtarlar: CryptoKeyPair
  ad: string
}

export interface SertifikaSecenekleri {
  /** Geçerlilik başlangıcı ve bitişi (ms). */
  baslangic: number
  bitis: number
  /** Apple'ın aradığı uzantı eklensin mi (varsayılan: evet). */
  oid?: boolean
  /** Yetkili (CA) olarak işaretlensin mi. */
  yetkili?: boolean
}

let seriNo = 1

async function anahtarUret(egri: 'P-256' | 'P-384'): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: egri }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
}

async function sertifikaUret(
  ad: string,
  egri: 'P-256' | 'P-384',
  yayimci: Sertifika | null,
  uzantilar: x509.Extension[],
  secenekler: SertifikaSecenekleri,
): Promise<Sertifika> {
  const anahtarlar = await anahtarUret(egri)
  const sertifika = await x509.X509CertificateGenerator.create(
    {
      serialNumber: (seriNo++).toString(16).padStart(4, '0'),
      subject: `CN=${ad}`,
      issuer: `CN=${yayimci?.ad ?? ad}`,
      notBefore: new Date(secenekler.baslangic),
      notAfter: new Date(secenekler.bitis),
      // Apple'ın zincirindeki gibi: sertifikalar ECDSA + SHA-384 ile imzalanır.
      signingAlgorithm: { name: 'ECDSA', hash: 'SHA-384' },
      publicKey: anahtarlar.publicKey,
      signingKey: (yayimci?.anahtarlar ?? anahtarlar).privateKey,
      extensions: uzantilar,
    },
    crypto,
  )
  return { der: new Uint8Array(sertifika.rawData), anahtarlar, ad }
}

export function kokUret(ad: string, secenekler: SertifikaSecenekleri): Promise<Sertifika> {
  return sertifikaUret(ad, 'P-384', null, [new x509.BasicConstraintsExtension(true, undefined, true)], secenekler)
}

export function araUret(kok: Sertifika, secenekler: SertifikaSecenekleri): Promise<Sertifika> {
  const uzantilar: x509.Extension[] = []
  if (secenekler.yetkili !== false) uzantilar.push(new x509.BasicConstraintsExtension(true, 0, true))
  if (secenekler.oid !== false) uzantilar.push(new x509.Extension(ARA_OID, false, BOS_DEGER))
  return sertifikaUret(`Test Ara ${seriNo}`, 'P-384', kok, uzantilar, secenekler)
}

/** `yayimci` verilmezse yaprak kendi kendini imzalar. */
export function yaprakUret(yayimci: Sertifika | null, secenekler: SertifikaSecenekleri): Promise<Sertifika> {
  const uzantilar: x509.Extension[] = [new x509.BasicConstraintsExtension(secenekler.yetkili === true, undefined, true)]
  if (secenekler.oid !== false) uzantilar.push(new x509.Extension(YAPRAK_OID, false, BOS_DEGER))
  return sertifikaUret(`Test Yaprak ${seriNo}`, 'P-256', yayimci, uzantilar, secenekler)
}

export interface Zincir {
  kok: Sertifika
  ara: Sertifika
  yaprak: Sertifika
}

/** Geçerli bir test zinciri: kök → ara → yaprak. */
export async function zincirUret(simdi: number, kokAdi = 'Test Kok'): Promise<Zincir> {
  const gecerlilik = { baslangic: simdi - GUN_MS, bitis: simdi + 365 * GUN_MS }
  const kok = await kokUret(kokAdi, gecerlilik)
  const ara = await araUret(kok, gecerlilik)
  const yaprak = await yaprakUret(ara, gecerlilik)
  return { kok, ara, yaprak }
}

export function base64(baytlar: Uint8Array): string {
  let ikili = ''
  for (const bayt of baytlar) ikili += String.fromCharCode(bayt)
  return btoa(ikili)
}

export function base64Url(veri: Uint8Array | string): string {
  const baytlar = typeof veri === 'string' ? new TextEncoder().encode(veri) : veri
  return base64(baytlar).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function x5c(...sertifikalar: Sertifika[]): string[] {
  return sertifikalar.map((sertifika) => base64(sertifika.der))
}

/** Başlık ve yükü ES256 ile imzalayıp JWS üretir. */
export async function jwsImzala(
  baslik: Record<string, unknown>,
  yuk: Record<string, unknown>,
  ozelAnahtar: CryptoKey,
): Promise<string> {
  const imzalanan = `${base64Url(JSON.stringify(baslik))}.${base64Url(JSON.stringify(yuk))}`
  const imza = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    ozelAnahtar,
    new TextEncoder().encode(imzalanan),
  )
  return `${imzalanan}.${base64Url(new Uint8Array(imza))}`
}

/** Aynı başlık ve yükü HS256 ile (verilen sır ile) imzalar: "algoritma karıştırma" saldırısı için. */
export async function hs256Imzala(
  baslik: Record<string, unknown>,
  yuk: Record<string, unknown>,
  sir: Uint8Array,
): Promise<string> {
  const imzalanan = `${base64Url(JSON.stringify(baslik))}.${base64Url(JSON.stringify(yuk))}`
  const anahtar = await crypto.subtle.importKey('raw', sir, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const imza = await crypto.subtle.sign('HMAC', anahtar, new TextEncoder().encode(imzalanan))
  return `${imzalanan}.${base64Url(new Uint8Array(imza))}`
}
