/* global browser */
// Sayfadaki form alanlarını bulur, etiketlerini profil alanlarıyla eşleştirir ve doldurur.
// Her doldurma geri alınabilir; dolu alanların üzerine varsayılan olarak yazılmaz.

;(() => {
  const SKIP_TYPES = new Set(['hidden', 'password', 'file', 'checkbox', 'radio', 'submit', 'button', 'reset', 'image'])
  let undoStack = []

  /** "Adınız Soyadınız *:" → "adiniz soyadiniz" (Swift tarafındaki FieldMatcher.normalize ile aynı kural). */
  const normalize = (text) =>
    (text || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const tokens = (text) => normalize(text).split(' ').filter(Boolean)

  const containsSequence = (hay, needle) => {
    for (let i = 0; i + needle.length <= hay.length; i++) {
      if (needle.every((t, j) => hay[i + j] === t)) return true
    }
    return false
  }

  /** Bir alanı tarif eden tüm metinler: etiket, aria, yer tutucu, ad, kimlik. */
  function descriptors(el) {
    const texts = []
    if (el.labels) for (const label of el.labels) texts.push(label.textContent)
    texts.push(el.getAttribute('aria-label'))
    const labelledBy = el.getAttribute('aria-labelledby')
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) texts.push(document.getElementById(id)?.textContent)
    }
    texts.push(el.placeholder, el.name, el.id, el.title)
    return texts.filter((t) => t && t.trim().length > 0 && t.length <= 60)
  }

  function score(el, field) {
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/)
    if (field.autocomplete.some((a) => autocomplete.includes(a))) return 1
    let best = 0
    for (const text of descriptors(el)) {
      // name="first_name" gibi değerleri de parçala.
      const labelTokens = tokens(text.replace(/([a-z])([A-Z])/g, '$1 $2'))
      for (const synonym of field.synonyms) {
        const syn = tokens(synonym)
        if (!syn.length || labelTokens.length > 6) continue
        if (labelTokens.join(' ') === syn.join(' ')) best = Math.max(best, 0.95)
        else if (containsSequence(labelTokens, syn)) best = Math.max(best, 0.8)
      }
    }
    return best
  }

  function isFillable(el) {
    if (el.disabled || el.readOnly) return false
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  /** React/Vue gibi çatıların değişikliği görmesi için yerel setter + olaylar. */
  function setValue(el, value) {
    const proto = Object.getPrototypeOf(el)
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (setter) setter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function fillSelect(el, value) {
    const target = normalize(value)
    const option = [...el.options].find((o) => normalize(o.textContent) === target || normalize(o.value) === target)
    if (!option) return false
    setValue(el, option.value)
    return true
  }

  function fill(profile, overwrite) {
    undoStack = []
    const filled = []
    const elements = document.querySelectorAll('input, textarea, select')
    for (const el of elements) {
      if (!isFillable(el)) continue
      if (!overwrite && el.value) continue
      let best = null
      let bestScore = 0
      for (const field of profile.fields) {
        const s = score(el, field)
        if (s > bestScore) {
          bestScore = s
          best = field
        }
      }
      if (!best || bestScore < 0.8) continue
      const previous = el.value
      const ok = el instanceof HTMLSelectElement ? fillSelect(el, best.value) : (setValue(el, best.value), true)
      if (!ok) continue
      undoStack.push({ el, previous, outline: el.style.outline })
      el.style.outline = '3px solid #2f6fed'
      filled.push(best.label)
    }
    return { count: filled.length, fields: filled }
  }

  function undo() {
    for (const { el, previous, outline } of undoStack) {
      setValue(el, previous)
      el.style.outline = outline
    }
    const count = undoStack.length
    undoStack = []
    return { count }
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'fill') return Promise.resolve(fill(message.profile, message.overwrite))
    if (message?.type === 'undo') return Promise.resolve(undo())
    return undefined
  })
})()
