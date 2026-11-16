/**
 * Bülten kaydı: e-postayı denetler, uç noktaya JSON gönderir, sonucu bildirir.
 * Kim kullanır: src/components/Newsletter.astro. Uçtan uca testi: tests/e2e/alt-klasor.spec.ts (bülten yalnız uç nokta tanımlı derlemede görünür).
 */
import { EMAIL_PATTERN } from '../lib/form-validation.ts'

interface Messages {
  submit: string
  sending: string
  success: string
  failure: string
  invalidEmail: string
}

for (const form of document.querySelectorAll<HTMLFormElement>('[data-newsletter-form]')) {
  const messages = JSON.parse(form.dataset.messages ?? '{}') as Messages
  const input = form.querySelector<HTMLInputElement>('input[type="email"]')
  const error = form.querySelector<HTMLElement>('[data-newsletter-error]')
  const status = form.querySelector<HTMLElement>('[data-newsletter-status]')
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  form.noValidate = true

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!input || !error || !status || !button) return
    const email = input.value.trim()
    const valid = EMAIL_PATTERN.test(email)
    input.setAttribute('aria-invalid', String(!valid))
    error.textContent = valid ? '' : messages.invalidEmail
    if (!valid) {
      input.focus()
      return
    }
    button.disabled = true
    button.textContent = messages.sending
    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, lang: form.dataset.lang }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        status.className = 'notice notice-success'
        status.textContent = messages.success
        form.reset()
      })
      .catch(() => {
        status.className = 'notice notice-error'
        status.textContent = messages.failure
      })
      .finally(() => {
        button.disabled = false
        button.textContent = messages.submit
      })
  })
}
