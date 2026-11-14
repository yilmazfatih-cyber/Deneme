/** Sınıf adı birleştirici: boş / yanlış değerleri atlar. `cx('a', on && 'b')` → "a b". */
export function cx(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(' ')
}
