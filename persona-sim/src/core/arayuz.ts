/** Modül sözleşmeleri. Ortamlar (mağaza, e-ticaret) bu arayüzü uygular; UI yalnızca bunu bilir. */
import type { Musteri } from './nufus';
import type { OlayGunlugu } from './olay';
import type { Rng } from './rng';

export interface SimYapilandirmasi {
  seed: number;
  /** simülasyon süresi (saniye) */
  sureSaniye: number;
  /** gerçek zaman çarpanı: 1 saniye gerçek = hiz saniye simülasyon */
  hiz: number;
}

export interface Ortam {
  readonly ad: string;
  /** Müşteriler reklam modülünden geçmiş olabilir: `niyet` alanı giriş olasılığını ve ilgiyi yükseltir. */
  baslat(musteriler: MusteriGirdisi[], cfg: SimYapilandirmasi, gunluk: OlayGunlugu, rng: Rng): void;
  adim(dtSaniye: number): void;
  bittiMi(): boolean;
  simdikiZaman(): number;
  /** 2D çizim; ctx boyutu w×h CSS pikseli */
  ciz(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  /** anlık göstergeler (ziyaret, dönüşüm, ortalama sepet, ciro, terk) */
  kpi(): Record<string, number>;
}

export interface MusteriGirdisi {
  musteri: Musteri;
  /** 0–1: reklam/önceki temas sonrası niyet; 0 = organik taban */
  niyet: number;
  /** reklamdan geldi mi (atıf için) */
  reklamKaynagi?: string;
}
