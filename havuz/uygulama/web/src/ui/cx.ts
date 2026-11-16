/**
 * Sınıf adlarını birleştirir; boş/yanlış değerleri atlar: cx('a', koşul && 'b') → "a b".
 * Genişletme: gerekmez; Tailwind sınıf çakışmalarını çözmez, sınıfları bilinçli yazın.
 */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
