'use strict';
// Çekirdek: veri, DOM yardımcıları, sayı biçimleri, ipucu, yeniden boyutlanan çizimler ve grafik türleri.
const V = JSON.parse(document.getElementById('veri').textContent);
const AD = V.ad || {};
const NS = 'http://www.w3.org/2000/svg';

function ekle(e, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    e.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return e;
}
function nitelik(e, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.setAttribute('class', v);
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  return e;
}
// Metinler her zaman textContent ile girer; dışarıdan gelen hiçbir dize HTML olarak yorumlanmaz.
const h = (tag, attrs, ...kids) => ekle(nitelik(document.createElement(tag), attrs), kids);
const sv = (tag, attrs, ...kids) => ekle(nitelik(document.createElementNS(NS, tag), attrs), kids);
// "**kalın**" işaretli düz metni düğümlere çevirir.
const metin = s => String(s).split('**').map((x, i) => (i % 2 ? h('b', { text: x }) : x));
const p = (s, cls) => h('p', { class: cls }, metin(s));

// --- Sayı biçimleri (Türkçe: ondalık virgül, yüzde işareti başta) ---
const EKSI = '−';
const sifirMi = s => Number(s.replace(',', '.')) === 0;
function sy(x, n = 2) {
  if (x == null || !isFinite(x)) return '–';
  const s = Math.abs(x).toFixed(n).replace('.', ',');
  return (x < 0 && !sifirMi(s) ? EKSI : '') + s;
}
function yz(x, n = 1) {
  if (x == null || !isFinite(x)) return '–';
  const s = Math.abs(x * 100).toFixed(n).replace('.', ',');
  return (sifirMi(s) ? '' : x < 0 ? EKSI : '+') + '%' + s;
}
function yzp(x, n = 0) {
  if (x == null || !isFinite(x)) return '–';
  return '%' + (x * 100).toFixed(n).replace('.', ',');
}
function bpz(x) {
  if (x == null || !isFinite(x)) return '–';
  const v = x * 1e4;
  const s = Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0).replace('.', ',');
  return (sifirMi(s) ? '' : v < 0 ? EKSI : '+') + s + ' bp';
}
const tam = n => (n == null ? '–' : Math.round(n).toLocaleString('tr-TR'));
const katsayi = x => '×' + sy(x, x >= 10 ? 0 : 1);
const kisalt = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)).trimEnd() + '…' : s);
const buyukIlk = s => (s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1) : s);
// Tamamı büyük harf gelen şirket adlarını okunur hale getirir ("BURSA ÇİMENTO FABRİKASI A.Ş." → "Bursa Çimento Fabrikası A.Ş.").
function adDuzelt(s) {
  s = String(s || '').trim();
  if (!s || s !== s.toLocaleUpperCase('tr-TR')) return s;
  return s.split(/\s+/).map(k => (/^(A\.Ş\.?|A\.S\.?|AŞ|T\.A\.Ş\.?|VE)$/.test(k) ? (k === 'VE' ? 've' : k) : k.charAt(0) + k.slice(1).toLocaleLowerCase('tr-TR'))).join(' ');
}
const sekAd = k => buyukIlk((AD.sektor || {})[k] || String(k).replace(/_/g, ' '));
const grupAd = k => (AD.grup || {})[k] || k;
const ozAd = k => (AD.ozellik || {})[k] || k;
const seriAd = k => (AD.seri || {})[k] || k;
const SERI_KISA = { 'ES=F': 'S&P', 'NQ=F': 'Nasdaq', 'GC=F': 'Altın', 'SI=F': 'Gümüş', 'HG=F': 'Bakır', 'PL=F': 'Platin', 'BZ=F': 'Brent', 'NG=F': 'D. gaz',
  'USDTRY=X': 'Dolar/TL', 'EURUSD=X': 'Euro/$', TUR: 'TUR' };
const GRUP_KISA = { bist30: 'BIST 30', bist100_30: 'BIST 100', yildiz_diger: 'Yıldız', ana_pazar: 'Ana Pazar', alt_pazar: 'Alt Pazar' };
const ORDINAL = ['var(--o1)', 'var(--o2)', 'var(--o3)', 'var(--o4)', 'var(--o5)'];
const al = (o, ...yol) => yol.reduce((a, k) => (a == null ? a : a[k]), o);

// --- İpucu ---
const tipEl = document.getElementById('tip');
function tipGoster(olay, icerik) {
  tipEl.replaceChildren(...[icerik].flat(Infinity).filter(Boolean));
  tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  let x = olay.clientX + 14;
  let y = olay.clientY + 14;
  if (x + r.width > innerWidth - 8) x = Math.max(8, olay.clientX - r.width - 14);
  if (y + r.height > innerHeight - 8) y = Math.max(8, olay.clientY - r.height - 14);
  tipEl.style.left = x + 'px';
  tipEl.style.top = y + 'px';
}
const tipGizle = () => { tipEl.hidden = true; };
function tipOdak(el, icerik) {
  const r = el.getBoundingClientRect();
  tipGoster({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, icerik);
}
const tipSatir = (ad, deger, renk) =>
  h('div', { class: 'tr' }, h('span', { class: 'ts' }, renk ? h('i', { class: 'tk', style: `background:${renk}` }) : null, ad), h('b', { text: deger }));
const tipBaslik = (a, b) => [h('div', { class: 'tb', text: a }), b ? h('div', { class: 'ts', text: b }) : null];
function tipBaglan(el, uret) {
  el.addEventListener('pointermove', e => tipGoster(e, uret()));
  el.addEventListener('pointerdown', e => tipGoster(e, uret()));
  el.addEventListener('pointerleave', tipGizle);
  el.addEventListener('focus', () => tipOdak(el, uret()));
  el.addEventListener('blur', tipGizle);
}
addEventListener('scroll', tipGizle, { passive: true });

// --- Tema ---
const temaDinleyici = [];
const temaDegisti = () => temaDinleyici.forEach(f => f());
new MutationObserver(temaDegisti).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', temaDegisti);
const css = ad => getComputedStyle(document.documentElement).getPropertyValue(ad).trim();

// --- Genişliğe göre yeniden çizilen şekiller ---
// Her çizim kutusu izlenir: sayfaya eklendiğinde, sekmesi açıldığında ya da genişliği değiştiğinde yeniden çizilir.
const cizKayit = new WeakMap();
const cizGozcu = new ResizeObserver(girdiler => {
  for (const g of girdiler) {
    const k = cizKayit.get(g.target);
    if (k && Math.floor(g.contentRect.width) !== k.w) k.calis();
  }
});
function ciz(el, fn) {
  const kayit = { w: 0 };
  kayit.calis = () => {
    const w = Math.floor(el.clientWidth);
    if (w < 60) return;
    kayit.w = w;
    el.replaceChildren();
    fn(w);
  };
  cizKayit.set(el, kayit);
  cizGozcu.observe(el);
  kayit.calis();
  return kayit.calis;
}

// --- Ölçek ---
function adimBul(aralik, hedef) {
  const ham = aralik / hedef;
  const us = Math.pow(10, Math.floor(Math.log10(ham)));
  const f = ham / us;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * us;
}
function isaretler(mn, mx, hedef = 4) {
  const a = adimBul(mx - mn || 1, hedef);
  const out = [];
  for (let v = Math.ceil(mn / a - 1e-9) * a; v <= mx + a * 1e-6; v += a) out.push(Math.abs(v) < a * 1e-6 ? 0 : v);
  return out;
}
// Verinin ucu 4 px yuvarlak, taban düz.
function cubukYol(x, y, w, g, r, yon) {
  const yatay = yon === 'sag' || yon === 'sol';
  r = Math.max(0, Math.min(r, yatay ? w : g, (yatay ? g : w) / 2));
  if (yon === 'sag') return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${g - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
  if (yon === 'sol') return `M${x + w},${y}h${-(w - r)}a${r},${r} 0 0 0 ${-r},${r}v${g - 2 * r}a${r},${r} 0 0 0 ${r},${r}h${w - r}z`;
  if (yon === 'ust') return `M${x},${y + g}v${-(g - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${g - r}z`;
  return `M${x},${y}v${g - r}a${r},${r} 0 0 0 ${r},${r}h${w - 2 * r}a${r},${r} 0 0 0 ${r},${-r}v${-(g - r)}z`;
}

// --- Yatay çubuk: satır başına 1-2 seri, sıfırdan iki yana ---
function cubukYatay(el, o) {
  return ciz(el, w => {
    const S = typeof o.satir === 'function' ? o.satir() : o.satir;
    const n = o.seri.length;
    const dar = w < 540;
    const etW = dar ? 0 : Math.min(o.etiketGen || 200, Math.round(w * 0.4));
    const bh = n > 1 ? 10 : 12;
    const ara = n > 1 ? 3 : 2;
    const blok = n * bh + (n - 1) * ara;
    const ust = dar ? 18 : 0;
    const satirH = blok + ust + 12;
    const tum = S.flatMap(r => r.v).filter(x => x != null && isFinite(x));
    const mx = o.enBuyuk || Math.max(...tum.map(Math.abs), 1e-12);
    const neg = tum.some(x => x < 0);
    const poz = tum.some(x => x > 0) || !neg;
    const dW = o.degerGen || 58;
    const x0 = etW + (neg ? dW : 2);
    const x1 = w - (poz ? dW : 2);
    const sifir = neg && poz ? (x0 + x1) / 2 : neg ? x1 : x0;
    const yari = neg && poz ? (x1 - x0) / 2 : x1 - x0;
    const H = S.length * satirH + 4;
    const svg = sv('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H, role: 'img', 'aria-label': o.baslik || 'Çubuk grafik' });
    if (!dar) svg.append(sv('line', { x1: sifir, x2: sifir, y1: 0, y2: H - 4, stroke: 'var(--axis)', 'stroke-width': 1 }));
    if (o.cizgi != null) {
      const cx = sifir + (o.cizgi / mx) * yari;
      svg.append(sv('line', { x1: cx, x2: cx, y1: 0, y2: H - 4, stroke: 'var(--muted)', 'stroke-width': 1 }));
    }
    S.forEach((r, i) => {
      const y = i * satirH;
      const g = sv('g', { class: 'satir', tabindex: 0 });
      g.append(sv('rect', { class: 'vurgu-satir', x: 0, y, width: w, height: satirH, rx: 3 }));
      g.append(sv('text', { x: dar ? 0 : etW - 10, y: dar ? y + 11 : y + 6 + blok / 2, 'text-anchor': dar ? 'start' : 'end', 'dominant-baseline': 'middle',
        text: kisalt(r.ad, dar ? Math.floor(w / 6.4) : Math.floor(etW / 6.3)) }));
      if (dar) g.append(sv('line', { x1: sifir, x2: sifir, y1: y + ust + 3, y2: y + ust + 9 + blok, stroke: 'var(--axis)', 'stroke-width': 1 }));
      r.v.forEach((v, k) => {
        if (v == null || !isFinite(v)) return;
        const by = y + ust + 6 + k * (bh + ara);
        const len = Math.max(1, (Math.abs(v) / mx) * yari);
        const renk = o.isaretRenk ? (v < 0 ? 'var(--neg)' : 'var(--pos)') : o.seri[k].renk;
        g.append(sv('path', { d: v < 0 ? cubukYol(sifir - len, by, len, bh, 4, 'sol') : cubukYol(sifir, by, len, bh, 4, 'sag'), fill: renk }));
        g.append(sv('text', { class: 'deger', x: v < 0 ? sifir - len - 5 : sifir + len + 5, y: by + bh / 2 + 0.5, 'text-anchor': v < 0 ? 'end' : 'start',
          'dominant-baseline': 'middle', text: o.bicim(v) + (r.isaret && r.isaret[k] ? ' •' : '') }));
      });
      tipBaglan(g, () => [tipBaslik(r.ad, r.alt), ...(r.ipucu ? r.ipucu() : r.v.map((v, k) => tipSatir(o.seri[k].ad, o.bicim(v), o.isaretRenk ? null : o.seri[k].renk)))]);
      svg.append(g);
    });
    el.append(svg);
  });
}

// --- Dikey sütun: kategori başına 1-3 seri, sıfır çizgisi ---
function cubukDikey(el, o) {
  return ciz(el, w => {
    const kat = typeof o.kat === 'function' ? o.kat() : o.kat;
    const seri = typeof o.seri === 'function' ? o.seri() : o.seri;
    const H = o.yukseklik || 230;
    const mT = 12, mB = 30, mL = 50, mR = 6;
    const n = seri.length;
    const K = kat.length;
    const tum = seri.flatMap(s => s.v).filter(x => x != null && isFinite(x));
    let mn = Math.min(0, ...tum);
    let mx = Math.max(0, ...tum);
    if (mn === mx) mx = mn + 1;
    const pay = (mx - mn) * 0.08;
    if (mn < 0) mn -= pay;
    if (mx > 0) mx += pay;
    const iw = w - mL - mR;
    const ih = H - mT - mB;
    const Y = v => mT + ((mx - v) / (mx - mn)) * ih;
    const band = iw / K;
    const bw = Math.max(3, Math.min(24, (band * 0.72 - (n - 1) * 2) / n));
    const svg = sv('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H, role: 'img', 'aria-label': o.baslik || 'Sütun grafik' });
    const eb = o.eksenBicim || o.bicim;
    for (const t of isaretler(mn, mx, 4)) {
      svg.append(sv('line', { x1: mL, x2: w - mR, y1: Y(t), y2: Y(t), stroke: t === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }));
      svg.append(sv('text', { class: 'eksen', x: mL - 6, y: Y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle', text: eb(t) }));
    }
    const seyrek = band < 34 ? Math.ceil(34 / band) : 1;
    kat.forEach((k, i) => {
      const cx = mL + band * (i + 0.5);
      const g = sv('g', { class: 'satir', tabindex: 0 });
      g.append(sv('rect', { class: 'vurgu-satir', x: mL + band * i, y: mT, width: band, height: ih }));
      seri.forEach((s, j) => {
        const v = s.v[i];
        if (v == null || !isFinite(v)) return;
        const x = cx - (n * bw + (n - 1) * 2) / 2 + j * (bw + 2);
        const hh = Math.max(1, Math.abs(Y(v) - Y(0)));
        const renk = o.isaretRenk ? (v < 0 ? 'var(--neg)' : 'var(--pos)') : s.renk;
        g.append(sv('path', { d: v >= 0 ? cubukYol(x, Y(0) - hh, bw, hh, 4, 'ust') : cubukYol(x, Y(0), bw, hh, 4, 'alt'), fill: renk }));
        if (s.isaret && s.isaret[i]) g.append(sv('circle', { cx: x + bw / 2, cy: v >= 0 ? Y(0) - hh - 6 : Y(0) + hh + 6, r: 2, fill: 'var(--ink)' }));
      });
      if (i % seyrek === 0) g.append(sv('text', { class: 'eksen', x: cx, y: H - mB + 16, 'text-anchor': 'middle', text: k }));
      tipBaglan(g, () => (o.ipucu ? o.ipucu(i) : [tipBaslik(k), ...seri.map(s => tipSatir(s.ad, o.bicim(s.v[i]), o.isaretRenk ? null : s.renk))]));
      svg.append(g);
    });
    el.append(svg);
  });
}

// --- Çizgi: ortak x, 1-4 seri, artı imleci ---
function cizgi(el, o) {
  return ciz(el, w => {
    const H = o.yukseklik || 220;
    const mT = 14, mB = 28, mL = 50, mR = o.sonEtiket ? 64 : 14;
    const tum = o.seri.flatMap(s => s.v).filter(x => x != null && isFinite(x));
    let mn = Math.min(...tum);
    let mx = Math.max(...tum);
    if (o.sifirdan) mn = Math.min(0, mn);
    const pay = (mx - mn || 1) * 0.08;
    if (!(o.sifirdan && mn === 0)) mn -= pay;
    mx += pay;
    const N = o.x.length;
    const iw = w - mL - mR;
    const ih = H - mT - mB;
    const X = i => mL + (N === 1 ? iw / 2 : (iw * i) / (N - 1));
    const Y = v => mT + ((mx - v) / (mx - mn)) * ih;
    const svg = sv('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H, role: 'img', 'aria-label': o.baslik || 'Çizgi grafik' });
    const eb = o.eksenBicim || o.bicim;
    for (const t of isaretler(mn, mx, 4)) {
      svg.append(sv('line', { x1: mL, x2: w - mR, y1: Y(t), y2: Y(t), stroke: t === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }));
      svg.append(sv('text', { class: 'eksen', x: mL - 6, y: Y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle', text: eb(t) }));
    }
    const kac = Math.max(2, Math.min(N, Math.floor(iw / 90)));
    for (let j = 0; j < kac; j++) {
      const i = Math.round((j * (N - 1)) / (kac - 1));
      svg.append(sv('text', { class: 'eksen', x: X(i), y: H - mB + 16, 'text-anchor': j === 0 ? 'start' : j === kac - 1 ? 'end' : 'middle', text: o.x[i] }));
    }
    o.seri.forEach(s => {
      let d = '';
      let acik = false;
      s.v.forEach((v, i) => {
        if (v == null || !isFinite(v)) { acik = false; return; }
        d += `${acik ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
        acik = true;
      });
      svg.append(sv('path', { d, fill: 'none', stroke: s.renk, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      let son = s.v.length - 1;
      while (son > 0 && (s.v[son] == null || !isFinite(s.v[son]))) son--;
      svg.append(sv('circle', { cx: X(son), cy: Y(s.v[son]), r: 4, fill: s.renk, stroke: 'var(--surface)', 'stroke-width': 2 }));
      if (o.sonEtiket) svg.append(sv('text', { class: 'deger', x: X(son) + 8, y: Y(s.v[son]), 'dominant-baseline': 'middle', text: o.bicim(s.v[son]) }));
    });
    const imlec = sv('line', { y1: mT, y2: mT + ih, stroke: 'var(--muted)', 'stroke-width': 1, visibility: 'hidden' });
    svg.append(imlec);
    const alan = sv('rect', { x: mL, y: mT, width: iw, height: ih, fill: 'transparent', tabindex: 0 });
    const goster = e => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(N - 1, Math.round((((e.clientX - r.left) * (w / r.width) - mL) / iw) * (N - 1))));
      imlec.setAttribute('x1', X(i));
      imlec.setAttribute('x2', X(i));
      imlec.setAttribute('visibility', 'visible');
      tipGoster(e, [tipBaslik(o.x[i]), ...o.seri.map(s => tipSatir(s.ad, o.bicim(s.v[i]), s.renk))]);
    };
    alan.addEventListener('pointermove', goster);
    alan.addEventListener('pointerdown', goster);
    alan.addEventListener('pointerleave', () => { imlec.setAttribute('visibility', 'hidden'); tipGizle(); });
    svg.append(alan);
    el.append(svg);
  });
}

// --- Isı haritası: iki kutuplu, ortası nötr ---
function isi(el, o) {
  el.replaceChildren();
  const g = h('div', { class: 'isi', style: `grid-template-columns:minmax(${o.rbGen || '7.5em'},max-content) repeat(${o.sutun.length},minmax(${o.hucreMin || 26}px,1fr))` });
  g.append(h('div'));
  o.sutun.forEach(s => g.append(h('div', { class: 'sb', title: s, text: s })));
  o.satir.forEach((r, i) => {
    g.append(h('div', { class: 'rb', title: r, text: r }));
    o.sutun.forEach((s, j) => {
      const d = o.hucre(i, j);
      const c = h('div', { class: 'hc' });
      if (d && d.v != null && isFinite(d.v)) {
        const oran = Math.min(1, Math.abs(d.v) / o.vmax);
        if (!d.soluk) {
          c.style.background = `color-mix(in oklab, var(${d.v < 0 ? '--neg' : '--pos'}) ${Math.round(oran * 100)}%, var(--div-mid))`;
          if (oran > 0.6) c.classList.add('koyu');
        }
        if (d.yazi) c.textContent = d.yazi;
        else if (d.isaret) c.classList.add('isaret');
        if (d.kalin) c.style.fontWeight = '600';
        if (o.odak) c.tabIndex = 0;
        tipBaglan(c, () => d.ipucu || [tipBaslik(`${r} · ${s}`), tipSatir('Değer', sy(d.v, 2))]);
      }
      g.append(c);
    });
  });
  el.append(h('div', { class: 'kaydir' }, g));
}

// --- Ortak parçalar ---
function tablo(basliklar, satirlar, o = {}) {
  const t = h('table', { class: 't' + (o.genis ? ' genis' : '') });
  t.append(h('thead', null, h('tr', null, basliklar.map(b => h('th', { class: b.n ? 'n' : null, text: b.ad })))));
  const tb = h('tbody');
  satirlar.forEach(r => tb.append(h('tr', null, r.map((c, i) => h('td', { class: basliklar[i] && basliklar[i].n ? 'n num' : null }, c)))));
  t.append(tb);
  return h('div', { class: 'kaydir' + (o.sinirli ? ' sinirli' : '') }, t);
}
function tabloAc(basliklar, satirlar, ozet) {
  const d = h('details', { class: 'tablo' }, h('summary', { text: ozet || 'Tablo olarak göster' }));
  let kuruldu = false;
  d.addEventListener('toggle', () => {
    if (!d.open || kuruldu) return;
    kuruldu = true;
    d.append(tablo(basliklar, typeof satirlar === 'function' ? satirlar() : satirlar, { sinirli: true }));
  });
  return d;
}
function sekil(o, ...icerik) {
  return h('figure', { class: 'fig ' + (o.cls || '') },
    h('header', null, h('h3', { text: o.baslik }), o.alt ? h('p', { class: 'alt' }, metin(o.alt)) : null), icerik);
}
const gosterge = ogeler => h('div', { class: 'gosterge' }, ogeler.map(g => h('span', null, h('i', { class: g.tur || '', style: `background:${g.renk}` }), g.ad)));
function seg(secenekler, secili, degisti, etiket) {
  const kap = h('div', { class: 'seg', role: 'group', 'aria-label': etiket || 'Seçim' });
  secenekler.forEach(s =>
    kap.append(h('button', { type: 'button', 'aria-pressed': String(s.k === secili), text: s.ad, onclick: e => {
      kap.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false'));
      e.currentTarget.setAttribute('aria-pressed', 'true');
      degisti(s.k);
    } })));
  return kap;
}
const sayi = (deger, ad) => h('div', { class: 'sayi' }, h('b', { text: deger }), h('span', { text: ad }));
const giris = (baslik, ...paragraflar) => h('div', { class: 'giris' }, h('h2', { text: baslik }), paragraflar.map(x => p(x)));
const hap = (tur, ad) => h('span', { class: 'hap ' + tur }, h('i'), ad);
const cizimKutusu = () => h('div', { class: 'cizim' });
