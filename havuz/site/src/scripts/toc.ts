/**
 * İçindekilerde okunan bölümü vurgular (kaydırırken). Yalnız görsel ipucudur: bağlantılar JS olmadan da çalışır.
 * Kim kullanır: src/components/TableOfContents.astro.
 */
const toc = document.querySelector<HTMLElement>('[data-toc]')

if (toc && 'IntersectionObserver' in window) {
  const links = [...toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
  const targets = links
    .map((anchor) => document.getElementById(decodeURIComponent(anchor.hash.slice(1))))
    .filter((element): element is HTMLElement => element !== null)
  const visible = new Set<Element>()

  const highlight = () => {
    const first = targets.find((target) => visible.has(target))
    if (!first) return
    for (const anchor of links) {
      anchor.setAttribute(
        'aria-current',
        String(anchor.hash === `#${encodeURIComponent(first.id)}` || anchor.hash === `#${first.id}`),
      )
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target)
        else visible.delete(entry.target)
      }
      highlight()
    },
    { rootMargin: '-80px 0px -60% 0px' },
  )
  for (const target of targets) observer.observe(target)
}

// Dosyayı modül yapar: üst düzey değişkenler başka betiklerle çakışmaz.
export {}
