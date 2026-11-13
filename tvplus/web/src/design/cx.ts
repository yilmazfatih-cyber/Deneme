/** Sınıf adı birleştirici: boş/yanlış değerleri atlar. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
