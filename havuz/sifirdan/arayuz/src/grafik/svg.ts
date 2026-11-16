// SVG dizgisi üretimi: öğe kurucusu ve KAÇIŞ. Kullanıcı verisi (başlık, kategori, seri adı) SVG'ye her zaman
// `escapeXml` ile girer; "<script>" yazan bir kategori adı metin olarak görünür, çalışmaz.
// Koordinatlar 2 ondalığa yuvarlanır (dosya küçük, okunur kalır).
// Genişletme: SVG yerine Canvas çizimi gerekirse aynı veri düzeni bir "çizici" arayüzüyle soyutlanabilir.

export function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

export const num = (n: number) => String(Math.round(n * 100) / 100)

type Attrs = Record<string, string | number | boolean | undefined>

/** `el('rect', { x: 1, class: 'a' })` → `<rect x="1" class="a"/>`. Öznitelik değerleri kaçışlanır. */
export function el(tag: string, attrs: Attrs = {}, ...children: string[]): string {
  const attrText = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeXml(typeof v === 'number' ? num(v) : String(v))}"`))
    .join('')
  return children.length === 0 ? `<${tag}${attrText}/>` : `<${tag}${attrText}>${children.join('')}</${tag}>`
}

/** Metin düğümü (kaçışlanmış). */
export const text = (value: string) => escapeXml(value)
