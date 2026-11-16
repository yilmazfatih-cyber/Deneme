// Form durum yöneticisi (çatıdan bağımsız): değerler, alan durumu (dokunuldu / kirli / hata / doğrulanıyor),
// eşzamanlı şema doğrulama, yarışa dayanıklı eşzamansız doğrulama, alan dizileri ve gönderim.
// Hata gösterme kuralı: alan dokunulduktan (odaktan çıkınca) ya da form bir kez gönderildikten sonra görünür;
// sonra her değişiklikte canlı güncellenir ("geç uyar, erken ödüllendir").
// Eşzamansız doğrulamada her istek bir sıra numarası (token) taşır; eski istek sonradan dönerse sonucu atılır,
// yenisi başlayınca eskisinin AbortSignal'i iptal edilir.
// Genişletme: yeni bir alan durumu (ör. "uyarı") için `FieldState`'e alan ekleyip `field()`'da doldurun.
import { matchesPattern, moveMapping, remapKeys, removeMapping, type IndexMapping } from './field_array.ts'
import { deepEqual, getPath, joinPath, leafPaths, parsePath, setPath } from './path.ts'
import type { Schema } from './schema.ts'

export interface FieldState {
  value: unknown
  touched: boolean
  dirty: boolean
  /** Kullanıcıya gösterilecek hata (dokunulmamışsa ve gönderilmemişse undefined). */
  error: string | undefined
  validating: boolean
}

export type AsyncValidator = (
  value: unknown,
  ctx: { values: unknown; signal: AbortSignal },
) => Promise<string | undefined>

export interface FormOptions<T> {
  schema: Schema<T>
  initialValues: Record<string, unknown>
  /** Yol deseni → doğrulayıcı. `*` dizi indisine uyar: 'telefonlar.*.numara'. */
  asyncValidators?: Record<string, AsyncValidator>
  asyncDelayMs?: number
  schedule?: (fn: () => void, ms: number) => () => void
  onSubmit?: (values: T) => void | Promise<void>
}

export type SubmitResult<T> =
  { ok: true; value: T } | { ok: false; errors: Record<string, string>; firstError: string | undefined }

export interface Form<T> {
  values(): Record<string, unknown>
  field(path: string): FieldState
  setValue(path: string, value: unknown): void
  /** Alan odaktan çıktı: dokunuldu işaretlenir, eşzamansız doğrulama başlar. */
  blur(path: string): void
  /** Tüm güncel hatalar (görünür olsun olmasın), yol → ileti. */
  errors(): Record<string, string>
  isDirty(): boolean
  readonly status: { submitting: boolean; submitCount: number; submitError: unknown }
  submit(): Promise<SubmitResult<T>>
  /** Yalnız verilen yolları (ör. bir adımın alanları) dokunulmuş sayar ve doğrular. */
  validatePaths(paths: readonly string[]): Promise<boolean>
  reset(values?: Record<string, unknown>): void
  subscribe(listener: () => void): () => void
  arrayKeys(path: string): string[]
  arrayAppend(path: string, item: unknown): void
  arrayRemove(path: string, index: number): void
  arrayMove(path: string, from: number, to: number): void
}

type Pending = {
  token: number
  controller: AbortController
  cancelTimer: (() => void) | undefined
  done: Promise<void>
}

export function createForm<T>(options: FormOptions<T>): Form<T> {
  const schedule =
    options.schedule ??
    ((fn: () => void, ms: number) => {
      const handle = setTimeout(fn, ms)
      return () => clearTimeout(handle)
    })
  let initial = structuredClone(options.initialValues)
  let values = structuredClone(options.initialValues)
  let touched = new Map<string, true>()
  let syncErrors = new Map<string, string>()
  let asyncErrors = new Map<string, string>()
  let pending = new Map<string, Pending>()
  let keys = new Map<string, string[]>()
  let keyCounter = 0
  let tokenCounter = 0
  const listeners = new Set<() => void>()
  const status = { submitting: false, submitCount: 0, submitError: undefined as unknown }

  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  const recomputeSync = () => {
    const result = options.schema.parse(values)
    syncErrors = new Map()
    if (!result.ok)
      for (const issue of result.issues)
        if (!syncErrors.has(joinPath(issue.path))) syncErrors.set(joinPath(issue.path), issue.message)
  }
  const validatorFor = (path: string) =>
    Object.entries(options.asyncValidators ?? {}).find(([pattern]) => matchesPattern(pattern, path))?.[1]

  /** Eşzamansız doğrulamayı başlatır; `delay` 0 ise hemen. Önceki isteği iptal eder. */
  const startAsync = (path: string, delay: number): Promise<void> => {
    const validator = validatorFor(path)
    const previous = pending.get(path)
    previous?.controller.abort()
    previous?.cancelTimer?.()
    pending.delete(path)
    if (!validator || syncErrors.has(path)) {
      asyncErrors.delete(path)
      return Promise.resolve()
    }
    const token = ++tokenCounter
    const controller = new AbortController()
    let release!: () => void
    const entry: Pending = { token, controller, cancelTimer: undefined, done: new Promise<void>((r) => (release = r)) }
    const run = async () => {
      try {
        const message = await validator(getPath(values, path), { values, signal: controller.signal })
        if (pending.get(path)?.token !== token) return
        if (message) asyncErrors.set(path, message)
        else asyncErrors.delete(path)
      } catch {
        if (pending.get(path)?.token === token && !controller.signal.aborted) {
          asyncErrors.set(path, 'Bu alan şu an denetlenemedi. Lütfen yeniden deneyin.')
        }
      } finally {
        if (pending.get(path)?.token === token) {
          pending.delete(path)
          notify()
        }
        release()
      }
    }
    pending.set(path, entry)
    controller.signal.addEventListener('abort', () => release())
    if (delay > 0) entry.cancelTimer = schedule(() => void run(), delay)
    else void run()
    return entry.done
  }

  const visible = (path: string) => touched.has(path) || status.submitCount > 0
  const errorOf = (path: string) => syncErrors.get(path) ?? asyncErrors.get(path)
  const allErrors = () => {
    const out: Record<string, string> = {}
    for (const [path, message] of [...syncErrors, ...asyncErrors]) out[path] ??= message
    return out
  }
  const asyncPaths = () => leafPaths(values).filter((path) => validatorFor(path))

  const remapArray = (path: string, mapping: IndexMapping) => {
    touched = remapKeys(touched, path, mapping)
    asyncErrors = remapKeys(asyncErrors, path, mapping)
    pending = remapKeys(pending, path, mapping, (p) => p.controller.abort())
    keys = remapKeys(keys, path, mapping)
  }
  const arrayAt = (path: string): unknown[] => {
    const value = getPath(values, path)
    return Array.isArray(value) ? value : []
  }
  const arrayKeys = (path: string) => {
    const length = arrayAt(path).length
    let list = keys.get(path)
    if (!list || list.length !== length) {
      list = Array.from({ length }, () => `k${++keyCounter}`)
      keys.set(path, list)
    }
    return list
  }

  recomputeSync()
  return {
    values: () => values,
    field: (path) => ({
      value: getPath(values, path),
      touched: touched.has(path),
      dirty: !deepEqual(getPath(values, path), getPath(initial, path)),
      error: visible(path) ? errorOf(path) : undefined,
      validating: pending.has(path),
    }),
    setValue(path, value) {
      values = setPath(values, path, value)
      recomputeSync()
      if (touched.has(path)) void startAsync(path, options.asyncDelayMs ?? 300)
      notify()
    },
    blur(path) {
      touched.set(path, true)
      void startAsync(path, 0)
      notify()
    },
    errors: allErrors,
    isDirty: () => !deepEqual(values, initial),
    status,
    async validatePaths(paths) {
      const leaves = paths.flatMap((path) => [path, ...leafPaths(getPath(values, path), parsePath(path))])
      for (const leaf of leaves) touched.set(leaf, true)
      recomputeSync()
      notify()
      await Promise.all(leaves.filter((leaf) => validatorFor(leaf)).map((leaf) => startAsync(leaf, 0)))
      notify()
      return leaves.every((leaf) => errorOf(leaf) === undefined)
    },
    async submit() {
      if (status.submitting) return { ok: false, errors: allErrors(), firstError: undefined }
      status.submitCount++
      for (const path of leafPaths(values)) touched.set(path, true)
      recomputeSync()
      notify()
      await Promise.all(asyncPaths().map((path) => startAsync(path, 0)))
      const result = options.schema.parse(values)
      const errors = allErrors()
      if (!result.ok || Object.keys(errors).length > 0) {
        notify()
        return { ok: false, errors, firstError: Object.keys(errors)[0] }
      }
      status.submitting = true
      status.submitError = undefined
      notify()
      try {
        await options.onSubmit?.(result.value)
      } catch (error) {
        status.submitError = error
      } finally {
        status.submitting = false
        notify()
      }
      return status.submitError === undefined
        ? { ok: true, value: result.value }
        : { ok: false, errors: {}, firstError: undefined }
    },
    reset(next) {
      for (const p of pending.values()) p.controller.abort()
      initial = structuredClone(next ?? options.initialValues)
      values = structuredClone(initial)
      touched = new Map()
      asyncErrors = new Map()
      pending = new Map()
      keys = new Map()
      status.submitCount = 0
      status.submitError = undefined
      recomputeSync()
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    arrayKeys,
    arrayAppend(path, item) {
      const list = arrayKeys(path)
      values = setPath(values, path, [...arrayAt(path), item])
      keys.set(path, [...list, `k${++keyCounter}`])
      recomputeSync()
      notify()
    },
    arrayRemove(path, index) {
      const list = arrayKeys(path).filter((_, i) => i !== index)
      values = setPath(
        values,
        path,
        arrayAt(path).filter((_, i) => i !== index),
      )
      remapArray(path, removeMapping(index))
      keys.set(path, list)
      recomputeSync()
      notify()
    },
    arrayMove(path, from, to) {
      const items = arrayAt(path).slice()
      const list = arrayKeys(path).slice()
      const [item] = items.splice(from, 1)
      items.splice(to, 0, item)
      const [key] = list.splice(from, 1)
      list.splice(to, 0, key as string)
      values = setPath(values, path, items)
      remapArray(path, moveMapping(from, to, items.length))
      keys.set(path, list)
      recomputeSync()
      notify()
    },
  }
}
