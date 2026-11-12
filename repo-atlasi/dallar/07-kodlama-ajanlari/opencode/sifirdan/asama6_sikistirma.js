// Aşama 6 — Bağlam sıkıştırma (compaction)
//
// Konuşma, modelin bağlam penceresine yaklaşınca eski kısım bir özetle değiştirilir; son mesajlar
// olduğu gibi kalır. opencode'da (packages/core/src/session/compaction.ts) pencerenin %15'i (en az 16k
// token) boş tutulur, son ~15k token aynen korunur ve özet sabit bir şablonla (Objective, Work State,
// Next Move, Relevant Files...) ayrı bir "compaction" ajanına yazdırılır. Sağlayıcı "çok uzun" hatası
// verirse de sıkıştırıp yeniden dener. Buradaki sürüm aynı fikrin küçük hâli.

import { estimateTokens, messageText, textMessage } from './asama1_saglayici.js'

export const SUMMARY_SYSTEM =
  'Sen bir özetleyicisin. Konuşmayı, işi devralacak başka bir ajan için kısa ve kesin biçimde özetle.'

export const SUMMARY_TEMPLATE = `Yanıtını şu başlıklarla yaz (boş olanları atla):
## Amaç
## Kararlar
## Yapılanlar / Süren işler
## Sıradaki adım
## İlgili dosyalar
Kurallar: dosya yollarını, komutları ve hata metinlerini aynen koru; süreçten bahsetme.`

const CLIP = 2000 // araç çıktılarının özete giren en uzun kısmı

/** Bağlam sınırı aşılmak üzere mi? `reserve` yanıt ve özet için boş bırakılan paydır. */
export function needsCompaction(messages, { contextLimit, reserve }) {
  return estimateTokens(messages) > contextLimit - reserve
}

/**
 * Mesajları "özetlenecek baş" ve "aynen kalacak kuyruk" diye ikiye böler.
 * Kuyruk araç sonucuyla başlayamaz: o sonucu doğuran asistan mesajı da kuyruğa alınır,
 * yoksa sağlayıcı "tool mesajı tool_calls'tan sonra gelmeli" diye isteği reddeder.
 */
export function splitForCompaction(messages, keepTokens) {
  let index = messages.length
  let kept = 0
  while (index > 0) {
    const cost = estimateTokens([messages[index - 1]])
    if (kept + cost > keepTokens) break
    kept += cost
    index--
  }
  while (index > 0 && index < messages.length && messages[index].role === 'tool') index--
  return { head: messages.slice(0, index), tail: messages.slice(index) }
}

/** Baş kısmı modele okunacak düz bir döküme çevirir. */
export function renderTranscript(messages) {
  const clip = (text) => (text.length > CLIP ? `${text.slice(0, CLIP)}…` : text)
  return messages
    .map((message) => {
      if (message.summary) return `[önceki özet]\n${messageText(message)}`
      const lines = message.parts.map((part) => {
        if (part.type === 'text') return part.text
        if (part.type === 'tool-call') return `→ ${part.name} ${JSON.stringify(part.input)}`
        return `← ${part.name}${part.isError ? ' (hata)' : ''}: ${clip(part.output)}`
      })
      return `[${message.role}]\n${lines.join('\n')}`
    })
    .join('\n\n')
}

/**
 * Oturumu yerinde sıkıştırır. Döner: { status: 'skipped' | 'completed', removed }.
 * @param {{ messages: object[], compactions: number }} session
 * @param {{ provider: { complete: Function }, keepTokens: number }} options
 */
export async function compactSession(session, options) {
  const { head, tail } = splitForCompaction(session.messages, options.keepTokens)
  if (head.length === 0) return { status: 'skipped', removed: 0 }
  const response = await options.provider.complete({
    system: SUMMARY_SYSTEM,
    messages: [textMessage('user', `${renderTranscript(head)}\n\n${SUMMARY_TEMPLATE}`)],
    tools: [],
    toolChoice: 'none',
  })
  const summary = textMessage('user', `Önceki konuşmanın özeti (ayrıntılar kodda ve dosyalarda):\n${response.text}`)
  summary.summary = true
  session.messages = [summary, ...tail]
  session.compactions += 1
  return { status: 'completed', removed: head.length }
}
