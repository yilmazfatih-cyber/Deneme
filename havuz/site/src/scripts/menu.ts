/**
 * Mobil menü (açılır-kapanır bölüm deseni): düğme `aria-expanded` taşır, panel `data-open` ile görünür.
 * Esc ve panel dışına tıklama menüyü kapatır; Esc'te odak düğmeye döner. Geniş ekrana geçince kendiliğinden kapanır.
 * Kim kullanır: src/components/Header.astro. Uçtan uca testi: tests/e2e/menu.spec.ts.
 */
const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]')
const panel = document.querySelector<HTMLElement>('[data-menu-panel]')

if (toggle && panel) {
  const desktop = window.matchMedia('(min-width: 48rem)')

  const setOpen = (open: boolean, returnFocus = false) => {
    toggle.setAttribute('aria-expanded', String(open))
    panel.toggleAttribute('data-open', open)
    if (!open && returnFocus) toggle.focus()
  }

  toggle.hidden = false
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'))

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setOpen(false, true)
  })

  document.addEventListener('click', (event) => {
    const target = event.target as Node
    if (toggle.getAttribute('aria-expanded') === 'true' && !panel.contains(target) && !toggle.contains(target)) {
      setOpen(false)
    }
  })

  // Aynı sayfadaki bölüm bağlantısına (#fiyatlar) tıklanınca menü kapansın.
  panel.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false)
  })

  desktop.addEventListener('change', () => setOpen(false))
}

// Dosyayı modül yapar: üst düzey değişkenler başka betiklerle çakışmaz.
export {}
