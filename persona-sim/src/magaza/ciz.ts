/** Mağazanın üstten görünümü (canvas 2D). ctx zaten DPR ile ölçekli; w×h CSS pikseli. */
import type { MagazaDuzeni } from './duzen';
import { KATEGORI_ADLARI, KATEGORI_RENKLERI } from './duzen';

export interface CizimVerisi {
  duzen: MagazaDuzeni;
  kasalar: { x: number; y: number; kuyruk: number }[];
  /** 0–1, bölge sırasıyla */
  bolgeYogunluk: number[];
  kampanya: { kategoriler: string[]; indirimOrani: number } | undefined;
  ajanlar: { x: number; y: number; renk: string; sepet: number; durum: string }[];
  kpi: Record<string, number>;
  t: number;
}

const RENK = {
  zemin: '#0b1220',
  magaza: '#111a2e',
  izgara: 'rgba(148,163,184,0.06)',
  duvar: '#334155',
  yazi: '#e2e8f0',
  soluk: '#94a3b8',
  kasa: '#f8fafc',
  promo: '#f97316',
};
const FONT = '12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_KALIN = '600 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function isiRengi(v: number): string {
  // düşük: mavi-yeşil, yüksek: turuncu-kırmızı (yarı saydam)
  const h = 190 - 180 * v;
  return `hsla(${h.toFixed(0)}, 85%, 55%, ${(0.08 + 0.32 * v).toFixed(3)})`;
}

const tl = (x: number) => `${Math.round(x).toLocaleString('tr-TR')} TL`;

export function cizMagaza(ctx: CanvasRenderingContext2D, w: number, h: number, v: CizimVerisi): void {
  const d = v.duzen;
  ctx.save();
  ctx.fillStyle = RENK.zemin;
  ctx.fillRect(0, 0, w, h);

  const kenar = 12;
  const pw = 172;
  // geniş ekranda sayaç paneli sağda, dar ekranda üstte şerit; mağaza kalan alana sığdırılır
  const genis = w - pw - kenar >= h * 1.15;
  const alanW = genis ? w - pw - 3 * kenar : w - 2 * kenar;
  const alanH = genis ? h - 2 * kenar : h - 2 * kenar - 48;
  const s = Math.max(1, Math.min(alanW / d.genislik, alanH / d.yukseklik));
  const ox = kenar + (alanW - s * d.genislik) / 2;
  const oy = (genis ? kenar : kenar + 48) + (alanH - s * d.yukseklik) / 2;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + y * s;

  // zemin ve ızgara
  ctx.fillStyle = RENK.magaza;
  ctx.fillRect(X(0), Y(0), s * d.genislik, s * d.yukseklik);
  ctx.strokeStyle = RENK.izgara;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < d.genislik; x++) {
    ctx.moveTo(X(x), Y(0));
    ctx.lineTo(X(x), Y(d.yukseklik));
  }
  for (let y = 1; y < d.yukseklik; y++) {
    ctx.moveTo(X(0), Y(y));
    ctx.lineTo(X(d.genislik), Y(y));
  }
  ctx.stroke();

  // bölge ısı haritası
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  d.bolgeler.forEach((b, i) => {
    const yog = v.bolgeYogunluk[i] ?? 0;
    ctx.fillStyle = isiRengi(yog);
    ctx.fillRect(X(b.x), Y(b.y), b.w * s, b.h * s);
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(X(b.x) + 0.5, Y(b.y) + 0.5, b.w * s - 1, b.h * s - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = RENK.soluk;
    ctx.fillText(b.ad, X(b.x) + 4, Y(b.y) + 3);
  });

  // dış duvar
  ctx.strokeStyle = RENK.duvar;
  ctx.lineWidth = 3;
  ctx.strokeRect(X(0), Y(0), s * d.genislik, s * d.yukseklik);

  // raflar
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of d.raflar) {
    const kampanyali = v.kampanya?.kategoriler.includes(r.kategori) ?? false;
    ctx.fillStyle = KATEGORI_RENKLERI[r.kategori] ?? '#e2e8f0';
    ctx.fillRect(X(r.x) + 1, Y(r.y) + 1, r.w * s - 2, r.h * s - 2);
    ctx.strokeStyle = kampanyali ? RENK.promo : 'rgba(15,23,42,0.5)';
    ctx.lineWidth = kampanyali ? 3 : 1;
    ctx.strokeRect(X(r.x) + 1, Y(r.y) + 1, r.w * s - 2, r.h * s - 2);
    // ürün ayraçları
    ctx.strokeStyle = 'rgba(15,23,42,0.18)';
    ctx.lineWidth = 1;
    for (let k = 1; k < r.urunler.length; k++) {
      const yy = Y(r.y) + (k * r.h * s) / r.urunler.length;
      ctx.beginPath();
      ctx.moveTo(X(r.x) + 3, yy);
      ctx.lineTo(X(r.x + r.w) - 3, yy);
      ctx.stroke();
    }
    // dikey etiket
    ctx.save();
    ctx.translate(X(r.x + r.w / 2), Y(r.y + r.h / 2));
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#0f172a';
    ctx.font = FONT_KALIN;
    ctx.fillText(`${KATEGORI_ADLARI[r.kategori] ?? r.kategori}`, 0, 0);
    ctx.restore();
  }

  // promosyon adası
  for (const p of d.promosyonAlanlari) {
    ctx.fillStyle = v.kampanya ? 'rgba(249,115,22,0.85)' : 'rgba(249,115,22,0.45)';
    ctx.fillRect(X(p.x) + 1, Y(p.y) + 1, p.w * s - 2, p.h * s - 2);
    ctx.strokeStyle = RENK.promo;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(X(p.x) - 2, Y(p.y) - 2, p.w * s + 4, p.h * s + 4);
    ctx.setLineDash([]);
    ctx.fillStyle = '#0f172a';
    ctx.font = FONT_KALIN;
    const baslik = v.kampanya ? `%${Math.round(v.kampanya.indirimOrani * 100)} indirim` : 'Promosyon';
    ctx.fillText(baslik, X(p.x + p.w / 2), Y(p.y + p.h / 2) - 8);
    ctx.font = FONT;
    if (v.kampanya) ctx.fillText(v.kampanya.kategoriler.map((k) => KATEGORI_ADLARI[k] ?? k).join(', '), X(p.x + p.w / 2), Y(p.y + p.h / 2) + 9);
  }

  // kasalar
  v.kasalar.forEach((k, i) => {
    ctx.fillStyle = RENK.kasa;
    ctx.fillRect(X(k.x) + 2, Y(k.y - 1) + 2, s - 4, 2 * s - 4);
    ctx.fillStyle = '#0f172a';
    ctx.font = FONT_KALIN;
    ctx.save();
    ctx.translate(X(k.x + 0.5), Y(k.y));
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`Kasa ${i + 1}`, 0, 0);
    ctx.restore();
    if (k.kuyruk > 0) {
      ctx.fillStyle = k.kuyruk >= 5 ? '#fca5a5' : RENK.soluk;
      ctx.font = FONT;
      ctx.fillText(`${k.kuyruk}`, X(k.x + 0.5), Y(k.y + 1.4));
    }
  });

  // kapılar
  const kapi = (p: { x: number; y: number }, ad: string, renk: string) => {
    ctx.fillStyle = renk;
    ctx.fillRect(X(p.x - 1), Y(d.yukseklik) - 4, 3 * s, 5);
    ctx.fillStyle = RENK.yazi;
    ctx.font = FONT;
    ctx.fillText(ad, X(p.x + 0.5), Y(d.yukseklik) - 12);
  };
  kapi(d.giris, '▲ Giriş', '#22c55e');
  if (d.cikis) kapi(d.cikis, 'Çıkış ▼', '#ef4444');

  // müşteriler
  for (const a of v.ajanlar) {
    const cx = X(a.x + 0.5);
    const cy = Y(a.y + 0.5);
    const dolu = a.sepet > 0;
    const r = s * (dolu ? 0.32 + Math.min(0.12, a.sepet * 0.015) : 0.24);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2.5, r), 0, Math.PI * 2);
    if (dolu) {
      ctx.fillStyle = a.renk;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(15,23,42,0.6)';
      ctx.fill();
      ctx.strokeStyle = a.renk;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // sayaçlar
  const k = v.kpi;
  const satirlar: [string, string][] = [
    ['Saat', `${String(Math.floor(v.t / 3600)).padStart(2, '0')}:${String(Math.floor((v.t % 3600) / 60)).padStart(2, '0')}`],
    ['Ziyaret', `${k['ziyaret'] ?? 0}`],
    ['İçeride', `${k['iceride'] ?? 0}`],
    ['Dönüşüm', `%${Math.round((k['donusum'] ?? 0) * 100)}`],
    ['Ort. sepet', tl(k['ortSepetTL'] ?? 0)],
    ['Ciro', tl(k['ciroTL'] ?? 0)],
    ['Kuyruk terki', `%${Math.round((k['terkOrani'] ?? 0) * 100)}`],
    ['Kuyruk (ort.)', (k['kuyrukOrt'] ?? 0).toFixed(1)],
  ];
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 1;
  ctx.textBaseline = 'top';
  if (genis) {
    const ph = 14 + satirlar.length * 18;
    const px = w - pw - kenar;
    const py = kenar;
    ctx.fillStyle = 'rgba(2,6,23,0.85)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    satirlar.forEach(([ad, deger], i) => {
      ctx.font = FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = RENK.soluk;
      ctx.fillText(ad, px + 10, py + 8 + i * 18);
      ctx.textAlign = 'right';
      ctx.fillStyle = RENK.yazi;
      ctx.font = FONT_KALIN;
      ctx.fillText(deger, px + pw - 10, py + 7 + i * 18);
    });
  } else {
    const kol = 4;
    const hw = (w - 2 * kenar) / kol;
    ctx.fillStyle = 'rgba(2,6,23,0.85)';
    ctx.fillRect(kenar, kenar - 4, w - 2 * kenar, 44);
    satirlar.forEach(([ad, deger], i) => {
      const cx = kenar + (i % kol) * hw + 8;
      const cy = kenar + Math.floor(i / kol) * 20;
      ctx.textAlign = 'left';
      ctx.font = FONT;
      ctx.fillStyle = RENK.soluk;
      ctx.fillText(ad, cx, cy);
      ctx.font = FONT_KALIN;
      ctx.fillStyle = RENK.yazi;
      ctx.textAlign = 'right';
      ctx.fillText(deger, cx + hw - 16, cy - 1);
    });
  }
  ctx.restore();
}
