/**
 * Tür sayfası kimliği (#/tur/:id): sayısal → tür (`Query.genre`), `mg_` ile başlayan → mikro tür (`Query.microgenre`).
 * Saf; birim testi browse.test.ts.
 */
export type GridId = { kind: 'genre'; id: number } | { kind: 'microgenre'; id: string } | { kind: 'invalid' }

export function gridIdOf(raw: string | undefined): GridId {
  const v = (raw ?? '').trim()
  if (/^mg_[A-Za-z0-9_-]+$/.test(v)) return { kind: 'microgenre', id: v }
  const n = Number(v)
  if (/^\d+$/.test(v) && Number.isSafeInteger(n) && n > 0) return { kind: 'genre', id: n }
  return { kind: 'invalid' }
}
