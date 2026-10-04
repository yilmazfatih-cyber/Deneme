/**
 * Hazır ses dosyalarının anahtarı. Aynı fonksiyon hem üretim betiğinde (scripts/audio-texts.ts)
 * hem uygulamada kullanılır: büyük/küçük harf, noktalama ve "…" boşluğu fark etmez.
 */
export function audioKey(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/…|\.\.\./g, ' ')
    .replace(/[.,!?;:"“”'’()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Kısa, kararlı dosya adı (FNV-1a 32 bit, onaltılık). */
export function audioFile(key: string): string {
  let h = 0x811c9dc5
  for (const ch of key) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${h.toString(16).padStart(8, '0')}.mp3`
}

/** Cümleleri ayırır: "Karnım ağrıyor. Ağrım 8 üzerinden 10." → iki parça. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** TTS ve kayıt için "…" boşluğunu kısa bir duraksamaya çevirir. */
export function speakable(sentence: string): string {
  return sentence.replace('…', ', ...')
}
