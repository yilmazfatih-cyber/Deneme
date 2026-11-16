/**
 * Testlerde `virtual:pwa-register` yerine geçer (vite-plugin-pwa yalnız derlemede çalışır).
 * Kayıt yapmaz; güncelleme işlevi boştur.
 */
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => {}
}
