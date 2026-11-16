/**
 * Arama penceresini açar (küçük betik; her sayfada). Arama arayüzünün geri kalanı ve Pagefind dizini ancak
 * pencere ilk kez açıldığında yüklenir (sayfa açılışını yavaşlatmaz).
 * Kısayollar: "/" (bir yazı alanında değilken) ve Ctrl+K / Cmd+K.
 * Kim kullanır: src/components/Header.astro. Uçtan uca testi: tests/e2e/search.spec.ts.
 */
const dialog = document.querySelector<HTMLDialogElement>('[data-search-dialog]')
const input = dialog?.querySelector<HTMLInputElement>('[data-search-input]')
const openers = document.querySelectorAll<HTMLButtonElement>('[data-search-open]')

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/u.test(target.tagName))

if (dialog && input) {
  let loaded: Promise<unknown> | undefined

  const open = () => {
    if (dialog.open) return
    dialog.showModal()
    input.focus()
    loaded ??= import('./search-ui.ts').then((module) => module.attachSearch(dialog))
  }

  for (const opener of openers) {
    opener.hidden = false
    opener.addEventListener('click', open)
  }

  document.addEventListener('keydown', (event) => {
    const shortcut = event.key === '/' && !isTypingTarget(event.target)
    const command = (event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')
    if (shortcut || command) {
      event.preventDefault()
      open()
    }
  })

  dialog.querySelector('[data-search-close]')?.addEventListener('click', () => dialog.close())
  // Pencerenin dışına (arka plana) tıklanınca kapat.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
}

// Dosyayı modül yapar: üst düzey değişkenler başka betiklerle çakışmaz.
export {}
