/** Olay günlüğü — 04 §7 zarfının sadeleştirilmiş hâli. Tüm ortamlar buraya yazar; KPI, ısı haritası ve rapor buradan türer. */
export type OrtamAdi = 'magaza' | 'eticaret' | 'reklam';

export type OlayTuru =
  | 'giris' | 'cikis' | 'terk'
  | 'bolge' // mağaza bölgesine girdi (kamera benzeri toplu sayım bundan türer)
  | 'bak' // ürüne/rafa/sayfaya baktı
  | 'sepete_ekle' | 'sepetten_cikar'
  | 'kasa' | 'satin_al'
  | 'sayfa' | 'tikla'
  | 'reklam_goster' | 'reklam_fark' | 'reklam_tikla' | 'reklam_rahatsiz'
  | 'surtunme'; // bekleme, hata, ek ücret sürprizi

export interface Olay {
  t: number; // simülasyon saniyesi
  ortam: OrtamAdi;
  musteriId: string;
  segmentId: string;
  tur: OlayTuru;
  veri?: Record<string, number | string | boolean>;
}

export class OlayGunlugu {
  private olaylar: Olay[] = [];

  ekle(o: Olay): void {
    this.olaylar.push(o);
  }

  liste(): readonly Olay[] {
    return this.olaylar;
  }

  filtrele(f: (o: Olay) => boolean): Olay[] {
    return this.olaylar.filter(f);
  }

  say(tur: OlayTuru, ortam?: OrtamAdi): number {
    let n = 0;
    for (const o of this.olaylar) if (o.tur === tur && (ortam === undefined || o.ortam === ortam)) n++;
    return n;
  }

  /** segment → tür → sayı */
  segmentOzeti(ortam?: OrtamAdi): Record<string, Partial<Record<OlayTuru, number>>> {
    const r: Record<string, Partial<Record<OlayTuru, number>>> = {};
    for (const o of this.olaylar) {
      if (ortam !== undefined && o.ortam !== ortam) continue;
      const s = (r[o.segmentId] ??= {});
      s[o.tur] = (s[o.tur] ?? 0) + 1;
    }
    return r;
  }

  temizle(): void {
    this.olaylar = [];
  }
}
