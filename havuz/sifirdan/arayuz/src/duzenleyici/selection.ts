// Seçimler: her seçim bir çapa (anchor, seçimin başladığı yer) ve bir baş (head, imlecin olduğu yer) taşır;
// ikisi eşitse yalnız imleçtir. Çoklu imleçte seçimler sıralı ve çakışmasız tutulur: çakışan ya da aynı
// konumdaki imleçler birleştirilir. "Birincil" seçim, en son eklenen (kaydırma ve arama onu izler).
// Genişletme: dikdörtgen (sütun) seçim, her satıra bir seçim üreterek bu yapıyla kurulabilir.

export interface Range {
  anchor: number
  head: number
}

export interface Selection {
  ranges: Range[]
  primary: number
}

export const rangeFrom = (r: Range) => Math.min(r.anchor, r.head)
export const rangeTo = (r: Range) => Math.max(r.anchor, r.head)
export const isEmpty = (r: Range) => r.anchor === r.head

export function cursor(offset: number): Range {
  return { anchor: offset, head: offset }
}

export function single(anchor: number, head = anchor): Selection {
  return { ranges: [{ anchor, head }], primary: 0 }
}

/** Sıralar ve çakışanları birleştirir; birincil seçimin yeni sırasını korur. */
export function normalizeSelection(selection: Selection): Selection {
  const indexed = selection.ranges.map((range, i) => ({ range, primary: i === selection.primary }))
  indexed.sort((a, b) => rangeFrom(a.range) - rangeFrom(b.range) || rangeTo(a.range) - rangeTo(b.range))
  const out: { range: Range; primary: boolean }[] = []
  for (const item of indexed) {
    const last = out[out.length - 1]
    const overlaps =
      last &&
      (rangeFrom(item.range) < rangeTo(last.range) ||
        (rangeFrom(item.range) === rangeTo(last.range) && (isEmpty(item.range) || isEmpty(last.range))))
    if (!last || !overlaps) {
      out.push({ range: { ...item.range }, primary: item.primary })
      continue
    }
    const from = Math.min(rangeFrom(last.range), rangeFrom(item.range))
    const to = Math.max(rangeTo(last.range), rangeTo(item.range))
    const forward = last.range.head >= last.range.anchor
    last.range = forward ? { anchor: from, head: to } : { anchor: to, head: from }
    last.primary ||= item.primary
  }
  const primary = Math.max(
    0,
    out.findIndex((item) => item.primary),
  )
  return { ranges: out.map((item) => item.range), primary }
}

export function primaryRange(selection: Selection): Range {
  return selection.ranges[selection.primary] ?? selection.ranges[0] ?? cursor(0)
}
