// DOM köprüsü: bir <form> öğesini form yöneticisine bağlar. `name` özniteliği alan yoludur
// ("adres.il", "telefonlar.0.numara"). Bağlama şunları yapar:
// - input/change → setValue, focusout → blur, submit → gönderim (geçersizse ilk hatalı alana odaklanır).
// - Erişilebilir hata bağlama: alanın `aria-invalid`'i ayarlanır; hata metni `[data-error-for="ad"]` öğesine
//   (yoksa alanın hemen arkasına açılan bir öğeye) yazılır ve öğenin kimliği alanın `aria-describedby`
//   listesine eklenir (alandaki diğer açıklama kimlikleri korunur).
// Genişletme: özel bir girdi (ör. tarih seçici) için `readValue`'ya bir dal ekleyin.
import type { Form } from './form.ts'

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

export function readValue(element: Field): unknown {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox') return element.checked
    if (element.type === 'radio') return element.checked ? element.value : undefined
  }
  if (element instanceof HTMLSelectElement && element.multiple) return [...element.selectedOptions].map((o) => o.value)
  return element.value
}

function writeValue(element: Field, value: unknown): void {
  if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = value === true
  else if (element instanceof HTMLInputElement && element.type === 'radio') element.checked = element.value === value
  else {
    const text = value === undefined || value === null ? '' : String(value as string | number)
    if (element.value !== text) element.value = text
  }
}

function fieldsOf(root: HTMLFormElement): Field[] {
  return [...root.querySelectorAll<Field>('input[name], select[name], textarea[name]')]
}

function safeId(text: string): string {
  return text.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** Hata metninin yazılacağı öğeyi bulur ya da alanın arkasına açar. */
function errorElement(root: HTMLFormElement, field: Field, name: string): HTMLElement {
  const existing = [...root.querySelectorAll<HTMLElement>('[data-error-for]')].find(
    (el) => el.dataset.errorFor === name,
  )
  if (existing) return existing
  const created = document.createElement('p')
  created.dataset.errorFor = name
  created.className = 'alan-hatasi'
  field.insertAdjacentElement('afterend', created)
  return created
}

function link(field: Field, id: string, on: boolean): void {
  const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((x) => x && x !== id)
  if (on) ids.push(id)
  if (ids.length > 0) field.setAttribute('aria-describedby', ids.join(' '))
  else field.removeAttribute('aria-describedby')
}

/** Formun durumunu DOM'a yansıtır: değerler, aria-invalid, hata metinleri, aria-describedby. */
export function renderForm<T>(form: Form<T>, root: HTMLFormElement): void {
  const prefix = root.id || 'form'
  for (const field of fieldsOf(root)) {
    const name = field.name
    const state = form.field(name)
    if (document.activeElement !== field || field.type === 'checkbox' || field.type === 'radio')
      writeValue(field, state.value)
    const box = errorElement(root, field, name)
    box.id ||= `${prefix}-${safeId(name)}-hata`
    box.textContent = state.error ?? ''
    box.hidden = !state.error
    if (state.error) field.setAttribute('aria-invalid', 'true')
    else field.removeAttribute('aria-invalid')
    link(field, box.id, Boolean(state.error))
    field.toggleAttribute('data-dogrulaniyor', state.validating)
  }
}

/** Geçersiz gönderimden sonra DOM sırasındaki ilk hatalı alana odaklanır. */
export function focusFirstError<T>(form: Form<T>, root: HTMLFormElement): Field | undefined {
  const target = fieldsOf(root).find((field) => form.field(field.name).error !== undefined)
  target?.focus()
  return target
}

export interface BindOptions<T> {
  onSubmitted?: (result: Awaited<ReturnType<Form<T>['submit']>>) => void
}

/** Formu DOM'a bağlar; dönen işlev tüm dinleyicileri kaldırır. */
export function bindForm<T>(form: Form<T>, root: HTMLFormElement, options: BindOptions<T> = {}): () => void {
  root.noValidate = true
  const onInput = (event: Event) => {
    const target = event.target as Field
    if (!target.name) return
    const value = readValue(target)
    if (value !== undefined) form.setValue(target.name, value)
  }
  const onBlur = (event: Event) => {
    const target = event.target as Field
    if (target.name) form.blur(target.name)
  }
  const onSubmit = (event: Event) => {
    event.preventDefault()
    void form.submit().then((result) => {
      if (!result.ok) focusFirstError(form, root)
      options.onSubmitted?.(result)
    })
  }
  const unsubscribe = form.subscribe(() => renderForm(form, root))
  root.addEventListener('input', onInput)
  root.addEventListener('change', onInput)
  root.addEventListener('focusout', onBlur)
  root.addEventListener('submit', onSubmit)
  renderForm(form, root)
  return () => {
    unsubscribe()
    root.removeEventListener('input', onInput)
    root.removeEventListener('change', onInput)
    root.removeEventListener('focusout', onBlur)
    root.removeEventListener('submit', onSubmit)
  }
}
