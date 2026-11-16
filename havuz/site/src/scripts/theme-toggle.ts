/**
 * Tema seçici davranışı. Seçim "tema" anahtarıyla localStorage'a yazılır ve <html> öğesine uygulanır:
 *   data-theme="light|dark"  (Sistem seçiliyse öznitelik kaldırılır; CSS işletim sistemini izler)
 *   data-theme-choice="light|dark|system"  (düğmedeki simgeyi seçer)
 * Kim kullanır: src/components/ThemeToggle.astro. İlk boyama: src/layouts/BaseLayout.astro içindeki satır içi betik.
 */
type Choice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'tema'
const root = document.documentElement
const button = document.querySelector<HTMLButtonElement>('[data-theme-button]')
const menu = document.querySelector<HTMLElement>('[data-theme-menu]')
const options = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-option]')]

const currentChoice = (): Choice => {
  const value = root.getAttribute('data-theme-choice')
  return value === 'light' || value === 'dark' ? value : 'system'
}

const apply = (choice: Choice) => {
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
  root.setAttribute('data-theme-choice', choice)
  for (const option of options) option.setAttribute('aria-pressed', String(option.dataset.themeOption === choice))
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Depolama kapalıysa seçim yalnız bu sayfada geçerli olur.
  }
}

if (button && menu) {
  const setOpen = (open: boolean, returnFocus = false) => {
    button.setAttribute('aria-expanded', String(open))
    menu.hidden = !open
    if (open) menu.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
    else if (returnFocus) button.focus()
  }

  button.hidden = false
  apply(currentChoice())
  button.addEventListener('click', () => setOpen(menu.hidden !== false))

  for (const option of options) {
    option.addEventListener('click', () => {
      const value = option.dataset.themeOption
      apply(value === 'light' || value === 'dark' ? value : 'system')
      setOpen(false, true)
    })
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) setOpen(false, true)
  })

  document.addEventListener('click', (event) => {
    const target = event.target as Node
    if (!menu.hidden && !menu.contains(target) && !button.contains(target)) setOpen(false)
  })
}

// Dosyayı modül yapar: üst düzey değişkenler başka betiklerle çakışmaz.
export {}
