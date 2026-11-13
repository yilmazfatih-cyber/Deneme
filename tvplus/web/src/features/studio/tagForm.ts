/**
 * Etiket fişi formunun durumu ve sözlüğe göre doğrulaması (saf). Sunucu aynı kuralları yeniden denetler
 * (server/src/services/tagging: checkSheetAgainstVocabulary, "gönderilen fiş izlenmiş olmalı").
 */
import type { TagSheetInput } from '../../../../shared/intelligence'
import { SCALE_MAX, type TagFacet, type TagSheet, type TagVocabulary } from '../../../../shared/tagging-schema'

export const TAGGER_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/
export const NOTES_MAX = 2000

export interface TagFormState {
  watched: boolean
  /** Ölçek anahtarı → 0–5; null = değerlendirilmedi */
  scales: Record<string, number | null>
  /** Yüz anahtarı → seçili değer anahtarları (seçim sırasıyla) */
  facets: Record<string, string[]>
  notes: string
}

/** Boş form ya da var olan bir fişten (kendi taslağı / gönderilmiş fişi) başlangıç. */
export function initialForm(vocab: TagVocabulary, from?: Pick<TagSheet, 'watched' | 'scales' | 'facets' | 'notes'> | null): TagFormState {
  const scales: Record<string, number | null> = {}
  for (const s of vocab.scales) {
    const v = from?.scales[s.key]
    scales[s.key] = typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= SCALE_MAX ? v : null
  }
  const facets: Record<string, string[]> = {}
  for (const f of vocab.facets) {
    const known = new Set(f.values.map((v) => v.key))
    facets[f.key] = (from?.facets[f.key] ?? []).filter((k) => known.has(k)).slice(0, f.max)
  }
  return { watched: from?.watched ?? false, scales, facets, notes: from?.notes ?? '' }
}

/** Ölçek değeri seçer; aynı değere yeniden basmak seçimi kaldırır (değerlendirilmedi). */
export function setScale(state: TagFormState, key: string, value: number): TagFormState {
  const cur = state.scales[key]
  return { ...state, scales: { ...state.scales, [key]: cur === value ? null : value } }
}

export type FacetToggle = { state: TagFormState; blocked: boolean }

/**
 * Yüz değerini açar/kapar. Tek seçimli yüzde yeni değer eskisinin yerini alır; çok seçimlide `max` doluysa
 * yeni değer eklenmez (`blocked: true`).
 */
export function toggleFacet(state: TagFormState, facet: Pick<TagFacet, 'key' | 'multi' | 'max'>, value: string): FacetToggle {
  const cur = state.facets[facet.key] ?? []
  let next: string[]
  if (cur.includes(value)) next = cur.filter((v) => v !== value)
  else if (!facet.multi) next = [value]
  else if (cur.length >= facet.max) return { state, blocked: true }
  else next = [...cur, value]
  return { state: { ...state, facets: { ...state.facets, [facet.key]: next } }, blocked: false }
}

export interface FormIssue {
  /** 'tagger' · 'watched' · 'notes' · 'scales.<anahtar>' · 'facets.<anahtar>' */
  path: string
  message: string
}

/** Formu sözlüğe ve gönderim kurallarına göre denetler. Boş liste → geçerli. */
export function validateForm(
  vocab: TagVocabulary,
  state: TagFormState,
  tagger: string,
  status: 'DRAFT' | 'SUBMITTED',
): FormIssue[] {
  const out: FormIssue[] = []
  if (!TAGGER_RE.test(tagger))
    out.push({
      path: 'tagger',
      message: 'Etiketleyici kimliği 2–32 karakter: küçük harf, rakam, nokta, tire (ör. etiket-01).',
    })
  const scaleKeys = new Set(vocab.scales.map((s) => s.key))
  for (const [k, v] of Object.entries(state.scales)) {
    if (!scaleKeys.has(k)) out.push({ path: `scales.${k}`, message: `Sözlükte "${k}" ölçeği yok.` })
    else if (v !== null && (!Number.isInteger(v) || v < 0 || v > SCALE_MAX))
      out.push({ path: `scales.${k}`, message: `Değer 0–${SCALE_MAX} arasında tam sayı olmalı.` })
  }
  const facetByKey = new Map(vocab.facets.map((f) => [f.key, f]))
  for (const [k, values] of Object.entries(state.facets)) {
    const f = facetByKey.get(k)
    if (!f) {
      out.push({ path: `facets.${k}`, message: `Sözlükte "${k}" yüzü yok.` })
      continue
    }
    const known = new Set(f.values.map((v) => v.key))
    const unknown = values.filter((v) => !known.has(v))
    if (unknown.length) out.push({ path: `facets.${k}`, message: `Bilinmeyen değer: ${unknown.join(', ')}.` })
    if (new Set(values).size !== values.length) out.push({ path: `facets.${k}`, message: 'Aynı değer iki kez seçilmiş.' })
    if (values.length > f.max) out.push({ path: `facets.${k}`, message: `En çok ${f.max} değer seçilebilir.` })
    if (!f.multi && values.length > 1) out.push({ path: `facets.${k}`, message: 'Bu yüzde tek değer seçilir.' })
  }
  if (state.notes.length > NOTES_MAX)
    out.push({ path: 'notes', message: `Not en çok ${NOTES_MAX} karakter olabilir.` })
  if (status === 'SUBMITTED') {
    if (!state.watched)
      out.push({ path: 'watched', message: 'Göndermek için yapımı baştan sona izlemiş olmalısınız. Yoksa taslak kaydedin.' })
    if (ratedCount(state) === 0) out.push({ path: 'scales', message: 'Göndermeden önce en az bir ölçeği değerlendirin.' })
  }
  return out
}

export function ratedCount(state: TagFormState): number {
  return Object.values(state.scales).filter((v) => v !== null).length
}

/** Tel gövdesi: boş yüzler atlanır, notlar kırpılır. */
export function toInput(state: TagFormState, status: 'DRAFT' | 'SUBMITTED'): TagSheetInput {
  const facets: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(state.facets)) if (v.length) facets[k] = [...v]
  const notes = state.notes.trim()
  return { watched: state.watched, scales: { ...state.scales }, facets, ...(notes ? { notes } : {}), status }
}

/** Formun bir fişten farkı var mı (kaydedilmemiş değişiklik uyarısı için). */
export function sameForm(a: TagFormState, b: TagFormState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
