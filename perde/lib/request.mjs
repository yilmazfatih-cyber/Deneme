// @ts-check
import { isAction } from './prompts.mjs'

/** İstek gövdesi üst sınırı: 2 MB. Aşılırsa hata döner; senaryo asla sessizce kırpılmaz. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024
export const MAX_SELECTION_CHARS = 200_000
export const MAX_INSTRUCTION_CHARS = 2000

/**
 * @typedef {object} AiRequest
 * @property {import('./prompts.mjs').Action} action
 * @property {string} script
 * @property {number | undefined} sceneIndex
 * @property {string | undefined} selection
 * @property {string | undefined} instruction
 */

/**
 * @param {unknown} body  JSON'dan çıkmış değer
 * @returns {{ ok: true, value: AiRequest } | { ok: false, error: string }}
 */
export function validateAiRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { ok: false, error: 'İstek gövdesi bir nesne olmalı.' }
  const b = /** @type {Record<string, unknown>} */ (body)
  if (!isAction(b.action)) return { ok: false, error: 'Geçersiz eylem. Beklenen: continue, rewrite, analyze, shots.' }
  const action = b.action
  if (typeof b.script !== 'string' || b.script.trim() === '') return { ok: false, error: 'Senaryo boş.' }
  /** @type {number | undefined} */
  let sceneIndex
  if (b.sceneIndex !== undefined && b.sceneIndex !== null) {
    if (typeof b.sceneIndex !== 'number' || !Number.isInteger(b.sceneIndex) || b.sceneIndex < 0) {
      return { ok: false, error: 'sceneIndex negatif olmayan bir tam sayı olmalı.' }
    }
    sceneIndex = b.sceneIndex
  }
  /** @type {string | undefined} */
  let selection
  if (b.selection !== undefined && b.selection !== null) {
    if (typeof b.selection !== 'string') return { ok: false, error: 'selection metin olmalı.' }
    if (b.selection.length > MAX_SELECTION_CHARS) return { ok: false, error: 'Seçim çok uzun.' }
    selection = b.selection
  }
  /** @type {string | undefined} */
  let instruction
  if (b.instruction !== undefined && b.instruction !== null) {
    if (typeof b.instruction !== 'string') return { ok: false, error: 'instruction metin olmalı.' }
    if (b.instruction.length > MAX_INSTRUCTION_CHARS) {
      return { ok: false, error: `Talimat en fazla ${MAX_INSTRUCTION_CHARS} karakter olabilir.` }
    }
    instruction = b.instruction
  }
  if (action === 'rewrite' && (!selection || selection.trim() === '')) {
    return { ok: false, error: 'Yeniden yazmak için bir seçim gerekli.' }
  }
  return { ok: true, value: { action, script: b.script, sceneIndex, selection, instruction } }
}
