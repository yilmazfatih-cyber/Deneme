// Belge araması: yönetim planı, iç yönetmelik, genel kurul kararları gibi metinleri parçalara böler ve
// BM25 ile sıralar. Gömme (embedding) servisi gerektirmez; veri sunucudan çıkmaz.
import { tokenize } from './text.ts'

export type Chunk = { id: number; documentId: number; title: string; heading: string | null; text: string }
export type Hit = { chunk: Chunk; score: number }

/** Metni başlık ve paragraflara göre en fazla ~maxChars uzunluğunda parçalara böler. */
export function chunkText(body: string, maxChars = 800): { heading: string | null; text: string }[] {
  const out: { heading: string | null; text: string }[] = []
  let heading: string | null = null
  let buf: string[] = []
  const flush = () => {
    const text = buf.join('\n').trim()
    if (text) out.push({ heading, text })
    buf = []
  }
  const paragraphs = body.replace(/\r\n/g, '\n').split(/\n\s*\n/)
  for (const para of paragraphs) {
    const p = para.trim()
    if (!p) continue
    const isHeading =
      /^(#{1,4}\s|madde\s+\d+|bölüm\s+\d+|\d+\.\s+[A-ZÇĞİÖŞÜ])/i.test(p) && p.length < 120 && !p.includes('\n')
    if (isHeading) {
      flush()
      heading = p.replace(/^#{1,4}\s*/, '')
      continue
    }
    if (buf.join('\n').length + p.length > maxChars) flush()
    if (p.length > maxChars) {
      // Çok uzun paragraf: cümle sınırlarından böl.
      const sentences = p.split(/(?<=[.!?])\s+/)
      let part = ''
      for (const s of sentences) {
        if ((part + ' ' + s).length > maxChars && part) {
          out.push({ heading, text: part.trim() })
          part = ''
        }
        part += ` ${s}`
      }
      if (part.trim()) buf.push(part.trim())
    } else {
      buf.push(p)
    }
  }
  flush()
  return out
}

/** BM25 (k1=1.4, b=0.75). Başlık ve belge adı da parçanın terimlerine eklenir. */
export function search(query: string, chunks: Chunk[], limit = 4): Hit[] {
  const q = [...new Set(tokenize(query))]
  if (q.length === 0 || chunks.length === 0) return []
  const docs = chunks.map((c) => tokenize(`${c.title} ${c.heading ?? ''} ${c.text}`))
  const N = docs.length
  const avgdl = docs.reduce((a, d) => a + d.length, 0) / N || 1
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const k1 = 1.4
  const b = 0.75
  const hits: Hit[] = []
  docs.forEach((d, i) => {
    const tf = new Map<string, number>()
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1)
    let score = 0
    for (const t of q) {
      const f = tf.get(t)
      if (!f) continue
      const n = df.get(t) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgdl)))
    }
    if (score > 0) hits.push({ chunk: chunks[i]!, score })
  })
  return hits.sort((a, b2) => b2.score - a.score).slice(0, limit)
}
