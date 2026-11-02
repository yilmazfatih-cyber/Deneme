/** Türkçe metin yardımcıları — OCR çıktısı çoğu zaman aksansız gelir ("Sirket", "Odenecek"); karşılaştırmalar aksan katlamalı yapılır */
const MAP: Record<string, string> = {
  ş: 's', Ş: 'S', ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ü: 'u', Ü: 'U',
  â: 'a', Â: 'A', î: 'i', Î: 'I', û: 'u', Û: 'U',
};

/** Aksanları kaldırır, büyük/küçük harfi korur */
export function foldTr(s: string): string {
  return s.replace(/[şŞçÇğĞıİöÖüÜâÂîÎûÛ]/g, (ch) => MAP[ch] ?? ch);
}

/** Aksanları kaldırır ve küçük harfe çevirir (karşılaştırma için) */
export function foldLower(s: string): string {
  return foldTr(s).toLowerCase();
}

export function upperTr(s: string): string {
  return s.toLocaleUpperCase('tr-TR');
}
