/**
 * Basit merkez-noktası (centroid) izleyici — DOM bağımsız, saf TypeScript.
 * Kareler arası kutuları IoU + mesafe ile eşleştirir; kaybolan izler N kare sonra kapanır
 * ve bir "ziyaret" (kalış süresi) olarak sayılır. Bölge testi ve 8×6 ısı haritası da burada.
 */
import type { CameraZone } from '../db/schema';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Track {
  id: number;
  box: Box;
  firstSeen: number;
  lastSeen: number;
  missed: number; // ardışık görülmeyen kare sayısı
  zoneTime: Record<string, number>; // zoneId → ms
}

export interface Visit {
  id: number;
  startedAt: number;
  endedAt: number;
  dwellMs: number;
  zoneTime: Record<string, number>;
}

export const HEAT_COLS = 8;
export const HEAT_ROWS = 6;
export const HEAT_CELLS = HEAT_COLS * HEAT_ROWS;

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function centroid(b: Box): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Ayak noktası: kutunun alt-orta noktası (yere bastığı yer) */
export function footPoint(b: Box): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h };
}

/** Normalize (0..1) bölge içinde mi? Nokta piksel ise frameW/frameH ile normalize edilir. */
export function pointInZone(px: number, py: number, zone: CameraZone, frameW = 1, frameH = 1): boolean {
  const nx = px / frameW;
  const ny = py / frameH;
  return nx >= zone.x && nx <= zone.x + zone.w && ny >= zone.y && ny <= zone.y + zone.h;
}

export function zoneOfBox(b: Box, zones: CameraZone[], frameW: number, frameH: number): CameraZone | undefined {
  const fp = footPoint(b);
  return zones.find((z) => pointInZone(fp.x, fp.y, z, frameW, frameH));
}

export interface TrackerOptions {
  maxMissed?: number; // kaç kare görülmezse iz kapanır
  minIou?: number;
  maxDistRatio?: number; // kare köşegeninin oranı
  minDwellMs?: number; // bundan kısa izler ziyaret sayılmaz (yanlış pozitif)
}

export class CentroidTracker {
  private tracks = new Map<number, Track>();
  private nextId = 1;
  private readonly opts: Required<TrackerOptions>;
  closedVisits: Visit[] = [];
  private lastAt?: number;

  constructor(opts: TrackerOptions = {}) {
    this.opts = {
      maxMissed: opts.maxMissed ?? 8,
      minIou: opts.minIou ?? 0.15,
      maxDistRatio: opts.maxDistRatio ?? 0.12,
      minDwellMs: opts.minDwellMs ?? 800,
    };
  }

  get active(): Track[] {
    return [...this.tracks.values()].filter((t) => t.missed === 0);
  }

  get activeCount(): number {
    return this.active.length;
  }

  /** Bugüne kadar açılan toplam iz sayısı (yeni giriş sayımı için fark alınır) */
  get createdCount(): number {
    return this.nextId - 1;
  }

  /**
   * Yeni kareyi işler. Döner: kapanan ziyaretler (bu karede).
   */
  update(boxes: Box[], now: number, zones: CameraZone[] = [], frameW = 1, frameH = 1): Visit[] {
    const dt = this.lastAt ? Math.max(0, now - this.lastAt) : 0;
    this.lastAt = now;
    const diag = Math.hypot(frameW, frameH) || 1;
    const maxDist = diag * this.opts.maxDistRatio;

    // Aday eşleşmeler: skor = IoU ağırlıklı + mesafe
    type Cand = { ti: number; bi: number; score: number };
    const trackList = [...this.tracks.values()];
    const cands: Cand[] = [];
    trackList.forEach((t, ti) => {
      const tc = centroid(t.box);
      boxes.forEach((b, bi) => {
        const ov = iou(t.box, b);
        const bc = centroid(b);
        const dist = Math.hypot(tc.x - bc.x, tc.y - bc.y);
        if (ov >= this.opts.minIou || dist <= maxDist) {
          cands.push({ ti, bi, score: ov + Math.max(0, 1 - dist / maxDist) });
        }
      });
    });
    cands.sort((a, b) => b.score - a.score);

    const usedT = new Set<number>();
    const usedB = new Set<number>();
    for (const c of cands) {
      if (usedT.has(c.ti) || usedB.has(c.bi)) continue;
      usedT.add(c.ti);
      usedB.add(c.bi);
      const t = trackList[c.ti];
      t.box = boxes[c.bi];
      t.lastSeen = now;
      t.missed = 0;
      this.accrueZone(t, zones, frameW, frameH, dt);
    }

    // Eşleşmeyen kutular → yeni iz
    boxes.forEach((b, bi) => {
      if (usedB.has(bi)) return;
      const t: Track = { id: this.nextId++, box: b, firstSeen: now, lastSeen: now, missed: 0, zoneTime: {} };
      this.tracks.set(t.id, t);
    });

    // Eşleşmeyen izler → missed++ ; sınırı aşanlar kapanır
    const closed: Visit[] = [];
    trackList.forEach((t, ti) => {
      if (usedT.has(ti)) return;
      t.missed += 1;
      if (t.missed > this.opts.maxMissed) {
        this.tracks.delete(t.id);
        const dwellMs = t.lastSeen - t.firstSeen;
        if (dwellMs >= this.opts.minDwellMs) {
          const v: Visit = { id: t.id, startedAt: t.firstSeen, endedAt: t.lastSeen, dwellMs, zoneTime: t.zoneTime };
          closed.push(v);
          this.closedVisits.push(v);
        }
      }
    });
    return closed;
  }

  private accrueZone(t: Track, zones: CameraZone[], frameW: number, frameH: number, dt: number): void {
    if (!dt || zones.length === 0) return;
    const z = zoneOfBox(t.box, zones, frameW, frameH);
    if (z) t.zoneTime[z.id] = (t.zoneTime[z.id] ?? 0) + dt;
  }

  /** Oturum bitişi: tüm açık izleri kapat */
  flush(now: number): Visit[] {
    const closed: Visit[] = [];
    for (const t of this.tracks.values()) {
      const dwellMs = Math.max(t.lastSeen, now) - t.firstSeen;
      if (dwellMs >= this.opts.minDwellMs) {
        const v: Visit = { id: t.id, startedAt: t.firstSeen, endedAt: t.lastSeen, dwellMs, zoneTime: t.zoneTime };
        closed.push(v);
        this.closedVisits.push(v);
      }
    }
    this.tracks.clear();
    return closed;
  }

  takeClosedVisits(): Visit[] {
    const v = this.closedVisits;
    this.closedVisits = [];
    return v;
  }
}

// ---------- Isı haritası ----------
export function emptyHeat(): number[] {
  return new Array<number>(HEAT_CELLS).fill(0);
}

/** Ayak noktalarını 8×6 ızgaraya ekler (yerinde değiştirir) */
export function accumulateHeat(heat: number[], boxes: Box[], frameW: number, frameH: number): void {
  for (const b of boxes) {
    const fp = footPoint(b);
    const cx = Math.min(HEAT_COLS - 1, Math.max(0, Math.floor((fp.x / frameW) * HEAT_COLS)));
    const cy = Math.min(HEAT_ROWS - 1, Math.max(0, Math.floor((fp.y / frameH) * HEAT_ROWS)));
    heat[cy * HEAT_COLS + cx] += 1;
  }
}

/** 0..1 arasına normalize eder (maksimuma göre) */
export function normalizeHeat(heat: number[]): number[] {
  const max = Math.max(0, ...heat);
  return max > 0 ? heat.map((v) => v / max) : heat.map(() => 0);
}

export function mergeHeat(list: number[][]): number[] {
  const out = emptyHeat();
  for (const h of list) for (let i = 0; i < HEAT_CELLS && i < h.length; i++) out[i] += h[i] ?? 0;
  return normalizeHeat(out);
}

// ---------- Dakikalık birikim ----------
export interface MinuteAccumulator {
  sumCount: number;
  frames: number;
  maxCount: number;
  entries: number;
  dwellSum: number;
  dwellN: number;
  zoneSum: Record<string, number>;
  heat: number[];
}

export function newMinuteAccumulator(): MinuteAccumulator {
  return { sumCount: 0, frames: 0, maxCount: 0, entries: 0, dwellSum: 0, dwellN: 0, zoneSum: {}, heat: emptyHeat() };
}

export function accumulateFrame(
  acc: MinuteAccumulator,
  boxes: Box[],
  zones: CameraZone[],
  frameW: number,
  frameH: number,
  newTracks: number,
  closed: Visit[],
): void {
  acc.frames += 1;
  acc.sumCount += boxes.length;
  acc.maxCount = Math.max(acc.maxCount, boxes.length);
  acc.entries += newTracks;
  for (const v of closed) {
    acc.dwellSum += v.dwellMs;
    acc.dwellN += 1;
  }
  for (const z of zones) {
    const n = boxes.filter((b) => zoneOfBox(b, [z], frameW, frameH)).length;
    acc.zoneSum[z.id] = (acc.zoneSum[z.id] ?? 0) + n;
  }
  accumulateHeat(acc.heat, boxes, frameW, frameH);
}

export function finalizeMinute(acc: MinuteAccumulator): {
  avgCount: number;
  maxCount: number;
  entries: number;
  avgDwellSec: number;
  zoneCounts: Record<string, number>;
  heat: number[];
} {
  const f = acc.frames || 1;
  const zoneCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(acc.zoneSum)) zoneCounts[k] = Math.round((v / f) * 100) / 100;
  return {
    avgCount: Math.round((acc.sumCount / f) * 100) / 100,
    maxCount: acc.maxCount,
    entries: acc.entries,
    avgDwellSec: acc.dwellN ? Math.round(acc.dwellSum / acc.dwellN / 1000) : 0,
    zoneCounts,
    heat: normalizeHeat(acc.heat),
  };
}

// ---------- İçgörüler (kural tabanlı) ----------
export interface SampleLike {
  at: number;
  avgCount: number;
  entries: number;
  avgDwellSec: number;
  zoneCounts: Record<string, number>;
}

export function hourlyEntries(samples: SampleLike[]): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const s of samples) hours[new Date(s.at).getHours()] += s.entries;
  return hours;
}

export function insights(samples: SampleLike[], zones: CameraZone[]): string[] {
  const out: string[] = [];
  if (samples.length === 0) return ['Henüz veri yok. Bir oturum başlatın; dakikalık özetler biriktikçe içgörüler burada görünür.'];
  const totalEntries = samples.reduce((s, x) => s + x.entries, 0);
  const hours = hourlyEntries(samples);
  const peakHour = hours.indexOf(Math.max(...hours));
  if (hours[peakHour] > 0) {
    out.push(`En yoğun saat ${String(peakHour).padStart(2, '0')}:00–${String((peakHour + 1) % 24).padStart(2, '0')}:00 (${hours[peakHour]} giriş).`);
  }
  const dwellSamples = samples.filter((s) => s.avgDwellSec > 0);
  if (dwellSamples.length) {
    const avg = dwellSamples.reduce((s, x) => s + x.avgDwellSec, 0) / dwellSamples.length;
    out.push(`Ortalama kalış süresi ${avg >= 60 ? `${(avg / 60).toFixed(1)} dk` : `${Math.round(avg)} sn`}.`);
  }
  const zoneTotals = zones.map((z) => ({ z, v: samples.reduce((s, x) => s + (x.zoneCounts[z.id] ?? 0), 0) }));
  const busiest = zoneTotals.sort((a, b) => b.v - a.v)[0];
  if (busiest && busiest.v > 0) out.push(`En yoğun bölge: ${busiest.z.name}.`);
  const kasa = zoneTotals.find((t) => /kasa/i.test(t.z.name));
  const giris = zoneTotals.find((t) => /giri[şs]/i.test(t.z.name));
  const reyon = zoneTotals.find((t) => /reyon|raf|ürün/i.test(t.z.name));
  if (kasa && samples.length) {
    const kasaAvg = kasa.v / samples.length;
    if (kasaAvg >= 2) out.push(`Kasa bölgesinde ortalama ${kasaAvg.toFixed(1)} kişi bekliyor — kuyruk oluşuyor olabilir; ek kasa açmayı değerlendirin.`);
  }
  if (giris && reyon && giris.v > 0) {
    const conv = Math.min(100, Math.round((reyon.v / giris.v) * 100));
    out.push(`Giriş→Reyon dönüşüm oranı yaklaşık %${conv}.${conv < 50 ? ' Vitrin ve giriş yerleşimini gözden geçirin.' : ''}`);
  }
  const avgOccupancy = samples.reduce((s, x) => s + x.avgCount, 0) / samples.length;
  out.push(`Ortalama anlık doluluk ${avgOccupancy.toFixed(1)} kişi; toplam ${totalEntries} ziyaretçi girişi sayıldı.`);
  return out;
}
