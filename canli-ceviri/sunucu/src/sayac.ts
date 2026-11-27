// Kullanım sayaçları (Durable Object).
//
// AbonelikSayaci: abonelik başına bir nesne. Dönem bütçesi ve istek hızı burada tutulur.
//   Nesne tek iş parçacıklıdır ve `ayir` hiç beklemeden (eşzamanlı depolama ile) çalışır; bu yüzden aynı aboneliğe
//   aynı anda gelen istekler sırayla işlenir ve bütçe yarışta fazladan harcanamaz.
//   Nesnede yalnız GEÇERLİ dönemin sayacı durur (tek kayıt): daha yeni bir dönem görülünce eskisinin üzerine yazılır.
// IpSayaci: IP başına bir nesne; geçersiz istekleri sayar. Yalnız bellekte tutulur (bkz. sınıf açıklaması).

import { DurableObject } from 'cloudflare:workers'
import { EN_KISA_OTURUM_SN } from './ayarlar'

/** İstek hızı: abonelik başına dakikada en çok bu kadar istek. */
export const DAKIKADA_ISTEK = 6
/** Geçersiz istek sınırı: IP başına dakikada en çok bu kadar. */
export const IP_GECERSIZ_SINIRI = 20
const DAKIKA_MS = 60_000

export interface AyirmaIstegi {
  /** Şimdiki an (ms). Worker'dan gelir ki istek boyunca tek bir saat kullanılsın. */
  simdi: number
  /**
   * İsteğin ait olduğu bütçe döneminin bittiği an (ms): Production'da işlemin `expiresDate` değeri, Sandbox'ta bir
   * sonraki UTC gece yarısı. Dönemin kimliği de budur.
   */
  donemBitisMs: number
  /** Bir dönemin bütçesi (sn). */
  butceSaniye: number
  /** Tek anahtarın (dilimin) en uzun süresi (sn). */
  oturumSaniye: number
}

export type AyirmaSonucu =
  | { tur: 'verildi'; sureSn: number; kalanSn: number; donemBitisMs: number; ayirmaNo: string }
  | { tur: 'sinir_doldu'; donemBitisMs: number }
  | { tur: 'cok_sik'; beklemeSn: number }

interface Ayirma {
  no: string
  sureSn: number
  /** Ayırmanın yapıldığı an (ms). */
  an: number
}

interface Durum {
  /** Geçerli dönemin bittiği an (ms): bu abonelik için şimdiye dek görülen en büyük dönem bitişi. */
  donemBitisMs: number
  /** Geçerli dönemde bütçeden düşülen toplam süre (sn). */
  kullanilanSn: number
  /** Son bir dakikadaki isteklerin anları (ms). */
  istekler: number[]
  /** Geçerli dönemin, geri alınabilecek son ayırmaları (Soniox anahtar vermezse). En çok bir dakikalık tutulur. */
  ayirmalar: Ayirma[]
}

const DURUM_ANAHTARI = 'durum'

export class AbonelikSayaci extends DurableObject {
  /**
   * Bir anahtar için bütçe ayırır. Sıra: dönem → istek hızı → dönem bütçesi.
   *
   * Dönem: istek daha YENİ bir dönem getirirse (daha büyük `donemBitisMs`) sayaç sıfırlanır ve eski dönemin kaydının
   * üzerine yazılır. Daha ESKİ bir dönemle gelen istek hiçbir şeyi sıfırlamaz; geçerli (en büyük) dönemin sayacından
   * düşer. Böylece süresi dolmamış iki işlemi olan biri bütçeyi ikisi arasında gidip gelerek yenileyemez.
   *
   * Verilen süre anında ve TAMAMIYLA bütçeden düşülür; istemci akışı erken bitirse de iade edilmez.
   */
  ayir(istek: AyirmaIstegi): AyirmaSonucu {
    const { simdi, donemBitisMs, butceSaniye, oturumSaniye } = istek
    const durum = this.durumuOku()

    if (donemBitisMs > durum.donemBitisMs) {
      durum.donemBitisMs = donemBitisMs
      durum.kullanilanSn = 0
      durum.ayirmalar = []
    }

    durum.istekler = durum.istekler.filter((an) => an > simdi - DAKIKA_MS && an <= simdi)
    if (durum.istekler.length >= DAKIKADA_ISTEK) {
      // Sınırı aşan istek sayılmaz ve depolamaya yazmaz; ısrarla deneyen istemci yazma kotasını tüketemez.
      const enEski = durum.istekler[0] ?? simdi
      return { tur: 'cok_sik', beklemeSn: saniyeyeYuvarla(enEski + DAKIKA_MS - simdi) }
    }
    durum.istekler.push(simdi)

    const kalanSn = butceSaniye - durum.kullanilanSn
    const sureSn = Math.min(oturumSaniye, kalanSn)
    if (sureSn < EN_KISA_OTURUM_SN) {
      this.durumuYaz(durum)
      return { tur: 'sinir_doldu', donemBitisMs: durum.donemBitisMs }
    }

    const ayirmaNo = crypto.randomUUID()
    durum.ayirmalar = durum.ayirmalar.filter((ayirma) => ayirma.an > simdi - DAKIKA_MS)
    durum.ayirmalar.push({ no: ayirmaNo, sureSn, an: simdi })
    durum.kullanilanSn += sureSn
    this.durumuYaz(durum)
    return {
      tur: 'verildi',
      sureSn,
      kalanSn: butceSaniye - durum.kullanilanSn,
      donemBitisMs: durum.donemBitisMs,
      ayirmaNo,
    }
  }

  /**
   * Bir ayırmayı geri alır (Soniox anahtar vermediyse). Yalnız geçerli dönemin, son bir dakikadaki ayırmaları geri
   * alınabilir ve her biri bir kez; numara bulunamazsa hiçbir şey değişmez (bütçe düşülmüş kalır: hata proje
   * sahibinin lehine).
   */
  geriAl(ayirmaNo: string): boolean {
    const durum = this.durumuOku()
    const sira = durum.ayirmalar.findIndex((ayirma) => ayirma.no === ayirmaNo)
    const ayirma = durum.ayirmalar[sira]
    if (ayirma === undefined) return false
    durum.kullanilanSn = Math.max(0, durum.kullanilanSn - ayirma.sureSn)
    durum.ayirmalar.splice(sira, 1)
    this.durumuYaz(durum)
    return true
  }

  private durumuOku(): Durum {
    const kayit = this.ctx.storage.kv.get<Partial<Durum>>(DURUM_ANAHTARI)
    // Alanlar tek tek okunur: eksik ya da başka biçimde (eski sürümden kalma) bir kayıt boş sayaç gibi ele alınır.
    return {
      donemBitisMs: typeof kayit?.donemBitisMs === 'number' ? kayit.donemBitisMs : 0,
      kullanilanSn: typeof kayit?.kullanilanSn === 'number' ? kayit.kullanilanSn : 0,
      istekler: Array.isArray(kayit?.istekler) ? kayit.istekler : [],
      ayirmalar: Array.isArray(kayit?.ayirmalar) ? kayit.ayirmalar : [],
    }
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
