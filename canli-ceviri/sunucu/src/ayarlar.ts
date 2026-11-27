// Worker bağlamaları ve yapılandırmanın okunması.

import type { AbonelikSayaci, IpSayaci } from './sayac'

export interface Env {
  SAYAC: DurableObjectNamespace<AbonelikSayaci>
  IP_SAYAC: DurableObjectNamespace<IpSayaci>
  // Gizli değerler (yalnız `wrangler secret put`; depoya yazılmaz).
  SONIOX_API_KEY?: string
  OZET_TUZU?: string
  // wrangler.toml [vars]
  PAKET_KIMLIGI?: string
  URUN_KIMLIGI?: string
  DONEM_SANIYE?: string
  SANDBOX_GUNLUK_SANIYE?: string
  OTURUM_SANIYE?: string
  SANDBOX_IZINLI?: string
}

export interface Ayarlar {
  sonioxAnahtari: string
  ozetTuzu: string
  paketKimligi: string
  urunKimligi: string
  /** Production: abonelik dönemi (bir yenilemeden ötekine) başına bütçe (sn). */
  donemSaniye: number
  /** Sandbox: UTC günü başına bütçe (sn). */
  sandboxGunlukSaniye: number
  /** Tek anahtarın (dilimin) en uzun süresi (sn). */
  oturumSaniye: number
  sandboxIzinli: boolean
}

/** Bir anahtar için verilebilecek en kısa süre; kalan bütçe bundan azsa anahtar verilmez. */
export const EN_KISA_OTURUM_SN = 30
/** Soniox'un `max_session_duration_seconds` üst sınırı. */
const EN_UZUN_OTURUM_SN = 18_000
/** Dönem bütçesinin üst sınırı: bir haftanın saniye sayısı (ürün haftalık üyeliktir). */
const EN_BUYUK_DONEM_SN = 604_800
const EN_KISA_TUZ = 16

function metin(deger: string | undefined): string | null {
  const kirpilmis = typeof deger === 'string' ? deger.trim() : ''
  return kirpilmis === '' ? null : kirpilmis
}

function saniye(deger: string | undefined, varsayilan: number, enAz: number, enCok: number): number | null {
  const ham = metin(deger)
  if (ham === null) return varsayilan
  if (!/^\d{1,6}$/.test(ham)) return null
  const sayi = Number(ham)
  return sayi >= enAz && sayi <= enCok ? sayi : null
}

/**
 * Yapılandırmayı okur. Zorunlu bir değer eksik ya da bozuksa `null` döner; çağıran `sunucu_hatasi` verir.
 * `OZET_TUZU` yoksa başka bir değerden türetilmez.
 */
export function ayarlariOku(env: Env): Ayarlar | null {
  const sonioxAnahtari = metin(env.SONIOX_API_KEY)
  const ozetTuzu = metin(env.OZET_TUZU)
  const paketKimligi = metin(env.PAKET_KIMLIGI)
  const urunKimligi = metin(env.URUN_KIMLIGI)
  // Varsayılan dönem bütçesi 160 dakika: haftalık fiyat / 10 / saatlik Soniox maliyeti (bkz. README, "Sınırlar").
  const donemSaniye = saniye(env.DONEM_SANIYE, 9600, 0, EN_BUYUK_DONEM_SN)
  const sandboxGunlukSaniye = saniye(env.SANDBOX_GUNLUK_SANIYE, 1800, 0, 86_400)
  const oturumSaniye = saniye(env.OTURUM_SANIYE, 120, EN_KISA_OTURUM_SN, EN_UZUN_OTURUM_SN)
  if (
    sonioxAnahtari === null ||
    ozetTuzu === null ||
    ozetTuzu.length < EN_KISA_TUZ ||
    paketKimligi === null ||
    urunKimligi === null ||
    donemSaniye === null ||
    sandboxGunlukSaniye === null ||
    oturumSaniye === null
  ) {
    return null
  }
  return {
    sonioxAnahtari,
    ozetTuzu,
    paketKimligi,
    urunKimligi,
    donemSaniye,
    sandboxGunlukSaniye,
    oturumSaniye,
    sandboxIzinli: metin(env.SANDBOX_IZINLI) === 'true',
  }
}
