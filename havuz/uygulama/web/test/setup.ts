/**
 * Test ortamı: jsdom'da olmayan tarayıcı yeteneklerini (IndexedDB, <dialog>, popover, matchMedia…) tamamlar.
 * Her testten sonra ekran temizlenir ve açık veritabanı bağlantıları kapatılır.
 */
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { closeAllDbs } from '../src/lib/store/db.ts'

afterEach(() => {
  cleanup()
  closeAllDbs()
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

// Aşağıdakiler yalnız tarayıcı (jsdom) ortamında gerekir; saf mantık testleri `node` ortamında koşar.
if (typeof document !== 'undefined') installDomPolyfills()

function installDomPolyfills(): void {
  // <dialog>: jsdom yalnız `open` özniteliğini tanır; showModal/close davranışını taklit ediyoruz.
  const dialogProto = HTMLDialogElement.prototype as HTMLDialogElement & { __polyfilled?: boolean }
  if (!dialogProto.__polyfilled) {
    dialogProto.__polyfilled = true
    dialogProto.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true
    }
    dialogProto.show = function show(this: HTMLDialogElement) {
      this.open = true
    }
    dialogProto.close = function close(this: HTMLDialogElement, returnValue?: string) {
      if (!this.open) return
      if (returnValue !== undefined) this.returnValue = returnValue
      this.open = false
      this.dispatchEvent(new Event('close'))
    }
  }

  // popover: jsdom `[popover]` öğelerini hep gizler ve showPopover'ı bilmez. Açılınca bir işaret koyup görünür yapıyoruz.
  const htmlProto = HTMLElement.prototype as HTMLElement & Record<string, unknown>
  if (typeof htmlProto.showPopover !== 'function') {
    htmlProto.showPopover = function showPopover(this: HTMLElement) {
      this.setAttribute('data-test-popover-open', '')
    }
    htmlProto.hidePopover = function hidePopover(this: HTMLElement) {
      this.removeAttribute('data-test-popover-open')
    }
    htmlProto.togglePopover = function togglePopover(this: HTMLElement) {
      return this.toggleAttribute('data-test-popover-open')
    }
    const style = document.createElement('style')
    style.textContent = '[popover][data-test-popover-open] { display: block !important; }'
    document.head.append(style)
  }

  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList
  }

  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  // jsdom scrollTo'yu desteklemez ("Not implemented" uyarısı basar); sayfa kaydırma testte önemsiz.
  window.scrollTo = () => {}
}
