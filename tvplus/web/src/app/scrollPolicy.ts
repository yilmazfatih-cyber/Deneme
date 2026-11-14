/**
 * Kaydırma politikası: yol değişiminde RouteEffects sayfayı en üste alır (geri dönüşte eski konuma). Kendi
 * kaydırmasını yöneten sayfa (ör. rehber "şimdi"ye kayar) `useShellOptions({ keepScroll: true })` ile bundan çıkar.
 * Kayıt ÇİZİM sırasında yapılır: sayfa çizildiği aynı işlemede RouteEffects'in yerleşim etkisi kaydı görür
 * (etki sırası sayfanın kendi etkisinden önce ya da sonra olsa da sayfanın kaydırmasını ezmez).
 */
const keepers = new Map<string, number>()

export function markKeepScroll(pathname: string): void {
  keepers.set(pathname, (keepers.get(pathname) ?? 0) + 1)
}
export function unmarkKeepScroll(pathname: string): void {
  const n = (keepers.get(pathname) ?? 0) - 1
  if (n > 0) keepers.set(pathname, n)
  else keepers.delete(pathname)
}
export function shouldKeepScroll(pathname: string): boolean {
  return keepers.has(pathname)
}
