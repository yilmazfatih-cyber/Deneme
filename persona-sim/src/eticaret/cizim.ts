/**
 * Huni şeridi çizimi: soldan sağa 6 aşama sütunu; müşteriler segment renginde noktalar, terk edenler aşağı düşüp solar,
 * satın alanlar sağdaki "fiş" sayacına akar; altta aşama başına terk sütun grafiği. Rastgelelik yok (konumlar kimlikten hash).
 * ctx'nin DPR ile ölçeklendiği, w×h'nin CSS pikseli olduğu varsayılır.
 */

export interface GorselNokta {
  no: number;
  renk: string;
  asama: number;
  vx: number;
  vy: number;
  yukleniyor: boolean;
}

export interface DusenNokta {
  x: number;
  y: number;
  renk: string;
  kare: number;
}

export type FisNokta = DusenNokta;

export interface CizimVerisi {
  varyantAdi: string;
  zaman: number;
  etiketler: string[];
  huni: { asama: string; giren: number; cikan: number; terk: number; oran: number }[];
  anlik: number[];
  kpi: Record<string, number>;
  aktifler: readonly GorselNokta[];
  dusenler: DusenNokta[];
  fisler: FisNokta[];
  segmentler: { ad: string; renk: string }[];
}

const RENK = {
  zemin: '#f8fafc',
  kutu: '#ffffff',
  kenar: '#e2e8f0',
  yazi: '#0f172a',
  soluk: '#64748b',
  yesil: '#059669',
  yesilZemin: '#ecfdf5',
  yesilKenar: '#6ee7b7',
  terk: '#fb923c',
  terkEn: '#e11d48',
  izgara: '#e2e8f0',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DUSUS_KARE = 45;
const FIS_KARE = 30;

function hash01(n: number, tuz: number): number {
  let x = (Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(tuz + 7, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0;
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

const tamSayi = (n: number): string => Math.round(n).toLocaleString('tr-TR');
const yuzde = (x: number, basamak = 0): string => `%${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: basamak, minimumFractionDigits: basamak })}`;

function yuvarlakDikdortgen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fisIkonu(ctx: CanvasRenderingContext2D, cx: number, cy: number, b: number): void {
  const w = b * 0.7, h = b;
  const x = cx - w / 2, y = cy - h / 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  const dis = 5;
  for (let i = dis; i >= 0; i--) ctx.lineTo(x + (w * i) / dis, y + h - (i % 2 === 0 ? 0 : b * 0.08));
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = RENK.yesil;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = RENK.yesilKenar;
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const ly = y + (h * i) / 5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.18, ly);
    ctx.lineTo(x + w * (i === 3 ? 0.55 : 0.82), ly);
    ctx.stroke();
  }
}

export function huniSeridiCiz(ctx: CanvasRenderingContext2D, w: number, h: number, v: CizimVerisi): void {
  const pad = Math.max(10, Math.min(20, w * 0.02));
  const kucuk = w < 640;
  ctx.save();
  ctx.fillStyle = RENK.zemin;
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';

  // --- başlık ve KPI satırı
  const k = v.kpi;
  ctx.fillStyle = RENK.yazi;
  ctx.font = `600 ${kucuk ? 13 : 15}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`E-ticaret hunisi · ${v.varyantAdi}`, pad, pad + 12);
  ctx.font = `${kucuk ? 11 : 12}px ${FONT}`;
  ctx.fillStyle = RENK.soluk;
  const kpiParcalari = [
    `Ziyaret ${tamSayi(k['ziyaret'] ?? 0)}`,
    `Dönüşüm ${yuzde(k['donusum'] ?? 0, 1)}`,
    `Ciro ${tamSayi(k['ciroTL'] ?? 0)} TL`,
    `Ort. sepet ${tamSayi(k['ortSepetTL'] ?? 0)} TL`,
    `Ort. süre ${tamSayi(k['ortSureSn'] ?? 0)} sn`,
  ];
  const kpiMetin = (kucuk ? kpiParcalari.slice(0, 3) : kpiParcalari).join(kucuk ? '  ·  ' : '   ·   ');
  ctx.fillText(kpiMetin, pad, pad + 30);
  ctx.textAlign = 'right';
  ctx.fillText(`t = ${tamSayi(v.zaman)} sn`, w - pad, pad + 12);

  // --- sütun geometrisi
  const n = v.etiketler.length;
  const ust = pad + 44;
  const legendY = h - pad;
  const grafikYuk = Math.max(60, h * 0.17);
  const alt = Math.max(ust + 140, legendY - 22 - grafikYuk - 26);
  const bosluk = Math.max(6, w * 0.012);
  const sutunW = (w - 2 * pad - (n - 1) * bosluk) / n;
  const sutunX = (i: number): number => pad + i * (sutunW + bosluk);
  const baslikH = kucuk ? 46 : 54;
  const noktaUst = ust + baslikH + 6;
  const noktaAlt = alt - 22;
  const r = Math.max(2.2, Math.min(4.5, sutunW / 28));
  const dar = sutunW < 120;
  const ziyaret = Math.max(1, v.huni[0]?.giren ?? 0);

  let kumTerk = 0;
  for (let i = 0; i < n; i++) {
    const x = sutunX(i);
    const son = i === n - 1;
    const satir = v.huni[i];
    yuvarlakDikdortgen(ctx, x, ust, sutunW, alt - ust, 10);
    ctx.fillStyle = son ? RENK.yesilZemin : RENK.kutu;
    ctx.fill();
    ctx.strokeStyle = son ? RENK.yesilKenar : RENK.kenar;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = son ? RENK.yesil : RENK.soluk;
    ctx.font = `600 ${kucuk ? 10 : 11}px ${FONT}`;
    ctx.fillText(v.etiketler[i]!.toLocaleUpperCase('tr-TR'), x + 8, ust + 16);
    ctx.fillStyle = son ? RENK.yesil : RENK.yazi;
    ctx.font = `700 ${kucuk ? 16 : 20}px ${FONT}`;
    const sayi = son ? (satir?.giren ?? 0) : (v.anlik[i] ?? 0);
    ctx.fillText(tamSayi(sayi), x + 8, ust + (kucuk ? 36 : 40));
    ctx.font = `${kucuk ? 9 : 10}px ${FONT}`;
    ctx.fillStyle = RENK.soluk;
    if (!son) {
      kumTerk += satir?.terk ?? 0;
      ctx.fillText(dar ? `terk ${yuzde(kumTerk / ziyaret)}` : `anlık · kümülatif terk ${yuzde(kumTerk / ziyaret)}`, x + 8, ust + baslikH - 2);
      if (satir && satir.giren > 0) {
        ctx.fillStyle = RENK.soluk;
        ctx.fillText(dar ? `→ ${yuzde(satir.oran)}` : `→ ${yuzde(satir.oran)} geçti`, x + 8, alt - 8);
      }
    } else {
      ctx.fillText(dar ? 'fiş' : 'kesilen fiş', x + 8, ust + baslikH - 2);
    }
    // aşamalar arası ok
    if (!son) {
      const ax = x + sutunW + bosluk / 2;
      const ay = ust + 24;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax - 2, ay - 4);
      ctx.lineTo(ax + 2, ay);
      ctx.lineTo(ax - 2, ay + 4);
      ctx.stroke();
    }
  }

  // --- fiş sayacı (satın al sütunu)
  const fx = sutunX(n - 1) + sutunW / 2;
  const fy = (noktaUst + noktaAlt) / 2 - 10;
  const fisB = Math.min(sutunW * 0.45, (noktaAlt - noktaUst) * 0.45, 64);
  fisIkonu(ctx, fx, fy, fisB);
  ctx.textAlign = 'center';
  ctx.fillStyle = RENK.yesil;
  ctx.font = `700 ${kucuk ? 11 : 13}px ${FONT}`;
  ctx.fillText(`${tamSayi(k['ciroTL'] ?? 0)} TL`, fx, fy + fisB / 2 + 18);

  // --- aktif müşteriler (ara konum animasyonu)
  const dikH = Math.max(4, noktaAlt - noktaUst);
  for (const z of v.aktifler) {
    const sx = sutunX(Math.min(z.asama, n - 2));
    const tx = sx + 8 + hash01(z.no, 1) * (sutunW - 16);
    const ty = noktaUst + hash01(z.no, 2) * dikH;
    if (Number.isNaN(z.vx)) {
      z.vx = pad - 6;
      z.vy = ty;
    }
    z.vx += (tx - z.vx) * 0.16;
    z.vy += (ty - z.vy) * 0.16;
    ctx.beginPath();
    ctx.arc(z.vx, z.vy, r, 0, Math.PI * 2);
    if (z.yukleniyor) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = z.renk;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = z.renk;
      ctx.fill();
    }
  }

  // --- terk edenler: aşağı düşüp solar (sütun alanına kırpılı)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, ust, w, alt - ust);
  ctx.clip();
  for (const d of v.dusenler) {
    d.kare++;
    d.y += 0.6 + d.kare * 0.08;
    ctx.globalAlpha = Math.max(0, 1 - d.kare / DUSUS_KARE) * 0.8;
    ctx.fillStyle = d.renk;
    ctx.beginPath();
    ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // --- satın alanlar: fişe akar
  for (const f of v.fisler) {
    f.kare++;
    if (Number.isNaN(f.x)) continue;
    f.x += (fx - f.x) * 0.2;
    f.y += (fy - f.y) * 0.2;
    ctx.globalAlpha = Math.max(0, 1 - f.kare / FIS_KARE);
    ctx.fillStyle = f.renk;
    ctx.beginPath();
    ctx.arc(f.x, f.y, r * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // --- alt grafik: aşama başına terk
  const gUst = alt + 30;
  const gAlt = legendY - 22;
  ctx.textAlign = 'left';
  ctx.fillStyle = RENK.yazi;
  ctx.font = `600 ${kucuk ? 11 : 12}px ${FONT}`;
  ctx.fillText('Aşama başına terk', pad, alt + 18);
  let enCok = 0, enIndis = -1;
  for (let i = 0; i < n - 1; i++) {
    const t = v.huni[i]?.terk ?? 0;
    if (t > enCok) {
      enCok = t;
      enIndis = i;
    }
  }
  ctx.strokeStyle = RENK.izgara;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, gAlt + 0.5);
  ctx.lineTo(w - pad, gAlt + 0.5);
  ctx.stroke();
  const barW = Math.min(sutunW * 0.5, 48);
  const yukMax = Math.max(10, gAlt - gUst - 16);
  for (let i = 0; i < n - 1; i++) {
    const t = v.huni[i]?.terk ?? 0;
    const bh = enCok > 0 ? (t / enCok) * yukMax : 0;
    const bx = sutunX(i) + sutunW / 2 - barW / 2;
    yuvarlakDikdortgen(ctx, bx, gAlt - bh, barW, bh, Math.min(4, bh / 2));
    ctx.fillStyle = i === enIndis ? RENK.terkEn : RENK.terk;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = i === enIndis ? RENK.terkEn : RENK.soluk;
    ctx.font = `${i === enIndis ? '600 ' : ''}${kucuk ? 9 : 10}px ${FONT}`;
    ctx.fillText(`${tamSayi(t)} · ${yuzde(t / ziyaret)}`, bx + barW / 2, gAlt - bh - 4);
  }
  // dönüşüm (satın al sütunu altında)
  ctx.textAlign = 'center';
  ctx.fillStyle = RENK.yesil;
  ctx.font = `700 ${kucuk ? 15 : 20}px ${FONT}`;
  ctx.fillText(yuzde(k['donusum'] ?? 0, 1), fx, gAlt - 18);
  ctx.font = `${kucuk ? 9 : 10}px ${FONT}`;
  ctx.fillText('dönüşüm', fx, gAlt - 4);

  // --- segment açıklaması
  ctx.font = `${kucuk ? 9 : 10}px ${FONT}`;
  ctx.textAlign = 'left';
  let lx = pad;
  for (const s of v.segmentler) {
    const ad = s.ad.split(' (')[0] ?? s.ad;
    const gen = ctx.measureText(ad).width + 18;
    if (lx + gen > w - pad) break;
    ctx.fillStyle = s.renk;
    ctx.beginPath();
    ctx.arc(lx + 4, legendY - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RENK.soluk;
    ctx.fillText(ad, lx + 11, legendY);
    lx += gen + 6;
  }
  ctx.restore();
}
