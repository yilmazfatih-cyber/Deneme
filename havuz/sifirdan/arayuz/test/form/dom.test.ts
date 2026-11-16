// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindForm, createForm, s } from '../../src/form/index.ts'

beforeEach(() => {
  document.body.innerHTML = `
    <form id="kayit">
      <label for="ad">Ad</label>
      <input id="ad" name="ad" aria-describedby="ad-ipucu" />
      <p id="ad-ipucu">En az 2 harf.</p>
      <label for="eposta">E-posta</label>
      <input id="eposta" name="eposta" />
      <label><input type="checkbox" name="onay" /> Kabul ediyorum</label>
      <button type="submit">Gönder</button>
    </form>`
})

const schema = s.object({
  ad: s.string().min(2),
  eposta: s.string().email(),
  onay: s.boolean().refine((v) => v, 'Devam etmek için onaylayın.'),
})

describe('DOM köprüsü', () => {
  it('yazılanı alır, odaktan çıkınca hatayı erişilebilir biçimde bağlar', () => {
    const root = document.querySelector('form')!
    const form = createForm({ schema, initialValues: { ad: '', eposta: '', onay: false } })
    bindForm(form, root)
    const ad = root.querySelector<HTMLInputElement>('#ad')!
    ad.value = 'A'
    ad.dispatchEvent(new Event('input', { bubbles: true }))
    ad.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    const error = root.querySelector<HTMLElement>('[data-error-for="ad"]')!
    expect(form.values().ad).toBe('A')
    expect(error.textContent).toBe('En az 2 karakter olmalı.')
    expect(ad.getAttribute('aria-invalid')).toBe('true')
    expect(ad.getAttribute('aria-describedby')).toBe(`ad-ipucu ${error.id}`)
    ad.value = 'Ay'
    ad.dispatchEvent(new Event('input', { bubbles: true }))
    expect(ad.hasAttribute('aria-invalid')).toBe(false)
    expect(ad.getAttribute('aria-describedby')).toBe('ad-ipucu')
    expect(error.hidden).toBe(true)
  })

  it('geçersiz gönderimde ilk hatalı alana odaklanır; onay kutusu mantıksal değer verir', async () => {
    const root = document.querySelector('form')!
    const form = createForm({ schema, initialValues: { ad: 'Ayşe', eposta: '', onay: false } })
    const results: boolean[] = []
    bindForm(form, root, { onSubmitted: (r) => results.push(r.ok) })
    root.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(results).toEqual([false]))
    expect(document.activeElement?.id).toBe('eposta')
    expect(root.querySelector('[data-error-for="onay"]')!.textContent).toBe('Devam etmek için onaylayın.')
    const onay = root.querySelector<HTMLInputElement>('[name="onay"]')!
    onay.checked = true
    onay.dispatchEvent(new Event('change', { bubbles: true }))
    expect(form.values().onay).toBe(true)
  })
})
