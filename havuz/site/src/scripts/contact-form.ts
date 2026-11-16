/**
 * İletişim formu davranışı: alan doğrulama, hata özeti, bal küpü + süre tuzağı, gönderim (JSON ya da mailto:).
 * Uç nokta derlemede form öğesine yazılır (data-endpoint); boşsa e-posta uygulaması açılır.
 * Kim kullanır: src/components/ContactForm.astro. Saf yardımcılar: src/lib/form-validation.ts (testli).
 */
import { buildMailto, isTooFast, mailBody, validateField, type FieldRule } from '../lib/form-validation.ts'

interface Messages {
  required: string
  invalidEmail: string
  tooShort: string
  tooLong: string
  summary: string
  success: string
  failure: string
  mailto: string
  tooFast: string
  subject: string
}

const REQUEST_TIMEOUT_MS = 15_000

for (const form of document.querySelectorAll<HTMLFormElement>('[data-contact-form]')) {
  const messages = JSON.parse(form.dataset.messages ?? '{}') as Messages
  const fields = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-rule]')]
  const honeypot = form.querySelector<HTMLInputElement>('[data-honeypot]')
  const summary = form.querySelector<HTMLElement>('[data-form-summary]')
  const status = form.querySelector<HTMLElement>('[data-form-status]')
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  const startedAt = Date.now()
  let attempted = false

  form.noValidate = true

  const errorElement = (field: HTMLElement) => form.querySelector<HTMLElement>(`[data-error-for="${field.id}"]`)

  const check = (field: HTMLInputElement | HTMLTextAreaElement): boolean => {
    const rule = JSON.parse(field.dataset.rule ?? '{}') as FieldRule
    const error = validateField(field.value, rule, messages)
    field.setAttribute('aria-invalid', String(error !== null))
    const target = errorElement(field)
    if (target) target.textContent = error ?? ''
    return error === null
  }

  const showStatus = (kind: 'success' | 'error' | 'info', text: string, href?: string) => {
    if (!status) return
    status.className = `notice ${kind === 'success' ? 'notice-success' : kind === 'error' ? 'notice-error' : ''}`
    status.textContent = text
    if (href) {
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.className = 'link ml-1 font-semibold'
      anchor.textContent = form.dataset.email ?? href
      status.append(' ', anchor)
    }
  }

  const setBusy = (busy: boolean) => {
    if (!submit) return
    submit.disabled = busy
    submit.textContent = (busy ? submit.dataset.sendingLabel : submit.dataset.submitLabel) ?? submit.textContent
  }

  for (const field of fields) {
    field.addEventListener('blur', () => {
      if (attempted || field.value.trim() !== '') check(field)
    })
    field.addEventListener('input', () => {
      if (field.getAttribute('aria-invalid') === 'true') check(field)
    })
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    attempted = true
    const invalid = fields.filter((field) => !check(field))
    if (summary) {
      summary.hidden = invalid.length === 0
      summary.textContent = invalid.length === 0 ? '' : messages.summary
    }
    if (invalid.length > 0) {
      invalid[0]?.focus()
      return
    }

    // Bal küpü doluysa bot: başarılı gibi davran ama gönderme.
    if (honeypot && honeypot.value !== '') {
      showStatus('success', messages.success)
      form.reset()
      return
    }

    const minimumMs = Number(form.dataset.minSeconds ?? '3') * 1000
    if (isTooFast(startedAt, Date.now(), minimumMs)) {
      showStatus('info', messages.tooFast)
      return
    }

    const values = Object.fromEntries(fields.map((field) => [field.name, field.value.trim()]))
    const endpoint = form.dataset.endpoint

    if (!endpoint) {
      const subject = messages.subject.replace('{name}', values.name ?? '')
      const body = mailBody(fields.map((field) => ({ label: field.dataset.label ?? field.name, value: field.value })))
      const url = buildMailto(form.dataset.email ?? '', subject, body)
      showStatus('info', messages.mailto, url)
      window.location.href = url
      return
    }

    setBusy(true)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...values, page: window.location.href, lang: form.dataset.lang }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        showStatus('success', messages.success)
        form.reset()
        attempted = false
      })
      .catch(() => showStatus('error', messages.failure, `mailto:${form.dataset.email ?? ''}`))
      .finally(() => {
        window.clearTimeout(timeout)
        setBusy(false)
      })
  })
}
