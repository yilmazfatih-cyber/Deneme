// Kullanım sayaçları (Durable Object).
//
// AbonelikSayaci: abonelik başına bir nesne. Günlük bütçe, eşzamanlılık penceresi ve istek hızı burada tutulur.
//   Nesne tek iş parçacıklıdır ve `ayir` hiç beklemeden (eşzamanlı depolama ile) çalışır; bu yüzden aynı aboneliğe
//   aynı anda gelen iki istekten yalnız biri anahtar alabilir.
// IpSayaci: IP başına bir nesne; geçersiz istekleri sayar. Yalnız bellekte tutulur (bkz. sınıf açıklaması).

import { DurableObject } from 'cloudflare:workers'
import { EN_KISA_OTURUM_SN } from './ayarlar'
import { geceYarisinaSaniye, utcGun } from './yardimci'

/** İstek hızı: abonelik başına dakikada en çok bu kadar istek. */
export const DAKIKADA_ISTEK = 6
/** Önceki oturumun penceresi bitmeden yeni anahtar yalnız bu son dilimde (devir için) verilir. */
export const DEVIR_PAYI_MS = 30_000
/** Geçersiz istek sınırı: IP başına dakikada en çok bu kadar. */
export const IP_GECERSIZ_SINIRI = 20
const DAKIKA_MS = 60_000

export interface AyirmaIstegi {
  /** Şimdiki an (ms). Worker'dan gelir ki istek boyunca tek bir saat kullanılsın. */
  simdi: number
  /** Bu abonelik için günlük bütçe (sn). */
  gunlukSaniye: number
  /** Tek oturumun en uzun süresi (sn). */
  oturumSaniye: number
}

export type AyirmaSonucu =
  | { tur: 'verildi'; sureSn: number; kalanSn: number; ayirmaNo: string }
  | { tur: 'sinir_doldu'; beklemeSn: number }
  | { tur: 'cok_sik'; beklemeSn: number }

interface SonAyirma {
  no: string
  sureSn: number
  gun: string
  oncekiPencereBitis: number
}

interface Durum {
  /** Sayaçların ait olduğu UTC günü. */
  gun: string
  /** O gün bütçeden düşülen toplam süre (sn). */
  kullanilanSn: number
  /** Son verilen oturumun penceresinin bittiği an (ms): verilme anı + süre. */
  pencereBitis: number
  /** Son bir dakikadaki isteklerin anları (ms). */
  istekler: number[]
  /** Geri alınabilecek son ayırma (Soniox anahtar vermezse). */
  son?: SonAyirma
}

const DURUM_ANAHTARI = 'durum'

export class AbonelikSayaci extends DurableObject {
  /**
   * Bir oturum için bütçe ayırır. Sıra: istek hızı → günlük bütçe → eşzamanlılık penceresi.
   * Verilen süre anında ve TAMAMIYLA bütçeden düşülür; istemci oturumu erken bitirse de iade edilmez.
   */
  ayir(istek: AyirmaIstegi): AyirmaSonucu {
    const { simdi, gunlukSaniye, oturumSaniye } = istek
    const durum = this.durumuOku()

    const gun = utcGun(simdi)
    if (durum.gun !== gun) {
      durum.gun = gun
      durum.kullanilanSn = 0
    }

    durum.istekler = durum.istekler.filter((an) => an > simdi - DAKIKA_MS && an <= simdi)
    if (durum.istekler.length >= DAKIKADA_ISTEK) {
      // Sınırı aşan istek sayılmaz ve depolamaya yazmaz; ısrarla deneyen istemci yazma kotasını tüketemez.
      const enEski = durum.istekler[0] ?? simdi
      return { tur: 'cok_sik', beklemeSn: saniyeyeYuvarla(enEski + DAKIKA_MS - simdi) }
    }
    durum.istekler.push(simdi)

    const kalanSn = gunlukSaniye - durum.kullanilanSn
    const sureSn = Math.min(oturumSaniye, kalanSn)
    if (sureSn < EN_KISA_OTURUM_SN) {
      this.durumuYaz(durum)
      return { tur: 'sinir_doldu', beklemeSn: geceYarisinaSaniye(simdi) }
    }

    const devirBaslangici = durum.pencereBitis - DEVIR_PAYI_MS
    if (simdi < devirBaslangici) {
      this.durumuYaz(durum)
      return { tur: 'cok_sik', beklemeSn: saniyeyeYuvarla(devirBaslangici - simdi) }
    }

    const ayirmaNo = crypto.randomUUID()
    durum.son = { no: ayirmaNo, sureSn, gun, oncekiPencereBitis: durum.pencereBitis }
    durum.kullanilanSn += sureSn
    durum.pencereBitis = simdi + sureSn * 1000
    this.durumuYaz(durum)
    return { tur: 'verildi', sureSn, kalanSn: gunlukSaniye - durum.kullanilanSn, ayirmaNo }
  }

  /**
   * Son ayırmayı geri alır (Soniox anahtar vermediyse). Yalnız en son ayırma geri alınabilir; numara tutmuyorsa
   * hiçbir şey değişmez (bütçe düşülmüş kalır: hata proje sahibinin lehine).
   */
  geriAl(ayirmaNo: string): boolean {
    const durum = this.durumuOku()
    const son = durum.son
    if (son === undefined || son.no !== ayirmaNo) return false
    if (durum.gun === son.gun) {
      durum.kullanilanSn = Math.max(0, durum.kullanilanSn - son.sureSn)
    }
    durum.pencereBitis = son.oncekiPencereBitis
    delete durum.son
    this.durumuYaz(durum)
    return true
  }

  private durumuOku(): Durum {
    return this.ctx.storage.kv.get<Durum>(DURUM_ANAHTARI) ?? { gun: '', kullanilanSn: 0, pencereBitis: 0, istekler: [] }
  }

  private durumuYaz(durum: Durum): void {
    this.ctx.storage.kv.put(DURUM_ANAHTARI, durum)
  }
}

/**
 * IP başına geçersiz istek sayacı. Bilerek yalnız bellekte tutulur: geçersiz istek yağdıran biri depolama yazma
 * kotasını tüketemesin. Nesne bellekten atılırsa sayaç sıfırlanır; bu "basit sınır" için kabul edilmiştir.
 */
export class IpSayaci extends DurableObject {
  private anlar: number[] = []

  /** Bu IP şu an engelliyse beklenecek süreyi (sn), değilse 0 döndürür. */
  denetle(simdi: number): number {
    this.buda(simdi)
    if (this.anlar.length < IP_GECERSIZ_SINIRI) return 0
    const enEski = this.anlar[0] ?? simdi
    return saniyeyeYuvarla(enEski + DAKIKA_MS - simdi)
  }

  /** Bir geçersiz isteği sayar. */
  say(simdi: number): void {
    this.buda(simdi)
    if (this.anlar.length < IP_GECERSIZ_SINIRI) this.anlar.push(simdi)
  }

  private buda(simdi: number): void {
    this.anlar = this.anlar.filter((an) => an > simdi - DAKIKA_MS && an <= simdi)
  }
}

function saniyeyeYuvarla(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000))
}
