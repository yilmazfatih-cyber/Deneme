/** Küçük DOM yardımcıları; çerçeve yok. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...cocuklar: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of cocuklar) e.append(c);
  return e;
}

export interface KaydirmaSecenekleri {
  min: number; max: number; adim: number; deger: number; birim?: string; bicim?: (v: number) => string;
}

export function kaydirma(etiket: string, s: KaydirmaSecenekleri, onChange: (v: number) => void): HTMLLabelElement {
  const bicim = s.bicim ?? ((v: number) => `${Number.isInteger(s.adim) ? v.toFixed(0) : v.toFixed(2)}${s.birim ?? ''}`);
  const deger = el('span', { class: 'deger', text: bicim(s.deger) });
  const input = el('input', { type: 'range', min: String(s.min), max: String(s.max), step: String(s.adim), value: String(s.deger) });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    deger.textContent = bicim(v);
    onChange(v);
  });
  return el('label', { class: 'alan' }, el('span', { text: etiket }), deger, input);
}

export function secim(etiket: string, secenekler: { deger: string; ad: string }[], deger: string, onChange: (v: string) => void): HTMLLabelElement {
  const sel = el('select');
  for (const o of secenekler) {
    const opt = el('option', { value: o.deger, text: o.ad });
    if (o.deger === deger) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return el('label', { class: 'alan' }, el('span', { text: etiket }), el('span'), sel);
}

export function kutu(etiket: string, deger: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
  const input = el('input', { type: 'checkbox' });
  input.checked = deger;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'kutu' }, input, el('span', { text: etiket }));
}

export function sayiAlani(etiket: string, deger: number, onChange: (v: number) => void, attrs: Record<string, string> = {}): HTMLLabelElement {
  const input = el('input', { type: 'number', value: String(deger), ...attrs });
  input.addEventListener('change', () => onChange(Number(input.value)));
  return el('label', { class: 'alan' }, el('span', { text: etiket }), el('span'), input);
}

export function dugme(etiket: string, tur: 'birincil' | 'ikincil', onClick: () => void): HTMLButtonElement {
  const b = el('button', { class: tur, text: etiket });
  b.addEventListener('click', onClick);
  return b;
}

export function tablo(basliklar: string[], satirlar: (string | number | Node)[][], sayisalSutunlar: number[] = []): HTMLTableElement {
  const t = el('table', { class: 'tablo' });
  const thead = el('thead');
  const tr = el('tr');
  for (const b of basliklar) tr.append(el('th', { text: b }));
  thead.append(tr);
  t.append(thead);
  const tbody = el('tbody');
  for (const s of satirlar) {
    const r = el('tr');
    s.forEach((h, i) => {
      const td = el('td', sayisalSutunlar.includes(i) ? { class: 'sayi' } : {});
      if (h instanceof Node) td.append(h);
      else td.textContent = typeof h === 'number' ? bicimle(h) : h;
      r.append(td);
    });
    tbody.append(r);
  }
  t.append(tbody);
  return t;
}

export function bicimle(v: number, basamak = 1): string {
  if (!Number.isFinite(v)) return '–';
  return v.toLocaleString('tr-TR', { maximumFractionDigits: basamak, minimumFractionDigits: 0 });
}

export function tl(v: number): string {
  return `${bicimle(v, 0)} ₺`;
}

export function yuzde(v: number, basamak = 1): string {
  return `%${bicimle(v * 100, basamak)}`;
}

export function kpiKarti(ad: string, deger: string): HTMLDivElement {
  return el('div', {}, el('b', { text: deger }), el('small', { text: ad }));
}

/** Canvas'ı CSS boyutuna ve DPR'ye göre ayarlar; ctx'i CSS piksel ölçeğine getirir. */
export function canvasHazirla(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width));
  const h = Math.max(1, Math.floor(r.height));
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d bağlamı yok');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
