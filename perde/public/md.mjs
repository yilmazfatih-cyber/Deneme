// Perde — analiz ve çekim listesi çıktıları için küçük, güvenli Markdown çizici (innerHTML kullanmaz).

/**
 * @param {HTMLElement} parent
 * @param {string} text
 */
function inline(parent, text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const b = document.createElement('strong')
      b.textContent = part.slice(2, -2)
      parent.append(b)
    } else {
      parent.append(part.replace(/`/g, ''))
    }
  }
}

/** @param {string} line */
const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

/**
 * @param {HTMLElement} root  İçeriği değiştirilecek kap
 * @param {string} md
 */
export function renderMarkdown(root, md) {
  root.replaceChildren()
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  /** @type {HTMLElement | null} */
  let list = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    if (!t) {
      list = null
      continue
    }
    let m
    if ((m = /^(#{1,4})\s+(.*)$/.exec(t))) {
      list = null
      const h = document.createElement(m[1].length <= 2 ? 'h3' : 'h4')
      inline(h, m[2])
      root.append(h)
    } else if (t.startsWith('|')) {
      list = null
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim())
      i--
      const table = document.createElement('table')
      const body = rows.filter((r) => !/^\|?[\s:|-]+\|?$/.test(r))
      body.forEach((r, ri) => {
        const tr = document.createElement('tr')
        for (const c of cells(r)) {
          const cell = document.createElement(ri === 0 ? 'th' : 'td')
          inline(cell, c)
          tr.append(cell)
        }
        table.append(tr)
      })
      const wrap = document.createElement('div')
      wrap.className = 'tablo-kap'
      wrap.append(table)
      root.append(wrap)
    } else if ((m = /^(?:[-*]|\d+[.)])\s+(.*)$/.exec(t))) {
      if (!list) {
        list = document.createElement(/^\d/.test(t) ? 'ol' : 'ul')
        root.append(list)
      }
      const li = document.createElement('li')
      inline(li, m[1])
      list.append(li)
    } else {
      list = null
      const p = document.createElement('p')
      inline(p, t)
      root.append(p)
    }
  }
}
