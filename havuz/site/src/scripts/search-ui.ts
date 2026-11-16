/**
 * Arama arayüzü: yazdıkça Pagefind dizininde arar ve sonuçları listeler. Pencere ilk açıldığında yüklenir.
 * Türkçe için sorgu iki biçimde aranır (dile göre küçültülmüş + ASCII'ye katlanmış) ve sonuçlar birleştirilir;
 * dizin tarafı aynı katlamayı uygular (src/integrations/search-index.ts). Böylece "IĞDIR", "ığdır", "igdir" aynı sonucu bulur.
 * Güvenlik: sonuç metinleri textContent ile yazılır (HTML olarak basılmaz).
 */
import { queryVariants } from '../lib/search-text.ts'

interface PagefindResult {
  id: string
  score: number
  data: () => Promise<{ url: string; meta: Record<string, string | undefined> }>
}

interface Pagefind {
  options?: (options: { baseUrl: string }) => Promise<void>
  init?: () => Promise<void>
  search: (query: string) => Promise<{ results: PagefindResult[] }>
}

interface Messages {
  hint: string
  loading: string
  noResults: string
  resultsOne: string
  resultsMany: string
  unavailable: string
}

const MAX_RESULTS = 8

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/gu, (whole, key: string) => String(values[key] ?? whole))

export function attachSearch(dialog: HTMLDialogElement): void {
  const input = dialog.querySelector<HTMLInputElement>('[data-search-input]')
  const status = dialog.querySelector<HTMLElement>('[data-search-status]')
  const list = dialog.querySelector<HTMLUListElement>('[data-search-results]')
  if (!input || !status || !list) return

  const messages = JSON.parse(dialog.dataset.messages ?? '{}') as Messages
  const lang = dialog.dataset.lang ?? 'tr'
  const base = dialog.dataset.base ?? '/'
  const pagefindUrl = `${base}pagefind/pagefind.js`
  let pagefind: Promise<Pagefind | null> | undefined
  let latest = 0
  let timer: number | undefined

  const loadPagefind = () =>
    (pagefind ??= import(/* @vite-ignore */ pagefindUrl).then(
      async (module: Pagefind) => {
        // Sonuç adresleri sitenin alt klasörüyle başlasın (/depo-adi/blog/…).
        await module.options?.({ baseUrl: base })
        await module.init?.()
        return module
      },
      () => null,
    ))

  const render = (items: { url: string; title: string; text: string; section: string }[]) => {
    list.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.className = 'search-result'
        a.href = item.url
        for (const [className, value] of [
          ['search-result-section', item.section],
          ['search-result-title', item.title],
          ['search-result-text', item.text],
        ] as const) {
          if (value === '') continue
          const span = document.createElement('span')
          span.className = className
          span.textContent = value
          a.append(span)
        }
        li.append(a)
        return li
      }),
    )
  }

  const search = async (query: string) => {
    const ticket = ++latest
    const variants = queryVariants(query, lang)
    if (query.trim().length < 2) {
      status.textContent = messages.hint
      render([])
      return
    }
    status.textContent = messages.loading
    const engine = await loadPagefind()
    if (ticket !== latest) return
    if (engine === null) {
      status.textContent = messages.unavailable
      render([])
      return
    }
    const responses = await Promise.all(variants.map((variant) => engine.search(variant)))
    const best = new Map<string, PagefindResult>()
    for (const result of responses.flatMap((response) => response.results)) {
      const existing = best.get(result.id)
      if (existing === undefined || result.score > existing.score) best.set(result.id, result)
    }
    const top = [...best.values()].sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS)
    const items = await Promise.all(
      top.map(async (result) => {
        const data = await result.data()
        return {
          url: data.url,
          title: data.meta.title ?? data.url,
          text: data.meta.description ?? '',
          section: data.meta.section ?? '',
        }
      }),
    )
    if (ticket !== latest) return
    render(items)
    status.textContent =
      items.length === 0
        ? fill(messages.noResults, { query: query.trim() })
        : items.length === 1
          ? messages.resultsOne
          : fill(messages.resultsMany, { count: items.length })
  }

  input.addEventListener('input', () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void search(input.value), 120)
  })

  // Pencere kapanıp yeniden açıldığında önceki aramayı göster; ilk açılışta dizini önceden ısıt.
  void loadPagefind()
  if (input.value.trim() !== '') void search(input.value)
}
