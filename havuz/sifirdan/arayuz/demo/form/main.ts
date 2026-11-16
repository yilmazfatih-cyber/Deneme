// Form gösterimi: üç adımlı kayıt. Her adım kendi alanlarını `validatePaths` ile doğrular; geçersizse o
// adımdaki ilk hatalı alana odaklanılır. Kullanıcı adı eşzamansız denetlenir (yapay gecikme + iptal).
// Telefonlar bir alan dizisidir: satırlar `arrayKeys` anahtarlarıyla çizilir.
// Genişletme: yeni alan = şemaya bir satır + HTML'de `name`'li bir girdi (+ gerekiyorsa `STEPS`'e yolu).
import { bindForm, createForm, focusFirstError, s, type Infer } from '../../src/form/index.ts'
import { metin } from '../metin.ts'

const schema = s
  .object({
    kullaniciAdi: s
      .string()
      .min(3)
      .max(20)
      .pattern(/^[\p{L}\d_]+$/u, 'Yalnız harf, rakam ve alt çizgi kullanın.'),
    eposta: s.string().email(),
    sifre: s.string().min(8),
    sifreTekrar: s.string(),
    adSoyad: s.string().min(2),
    yas: s.number().int().min(18).max(120).optional(),
    sehir: s.enumOf(['İstanbul', 'İzmir', 'Ankara', 'Iğdır', 'Şanlıurfa']),
    telefonlar: s
      .array(s.object({ numara: s.string().pattern(/^0?5\d{9}$/, '05XXXXXXXXX biçiminde yazın.') }))
      .min(1)
      .max(3),
    kosullar: s.boolean().refine((v) => v, 'Devam etmek için koşulları onaylayın.'),
  })
  .refine((v) => v.sifre === v.sifreTekrar, 'Şifreler aynı değil.', ['sifreTekrar'])

const STEPS: { ad: string; paths: string[] }[] = [
  { ad: 'Hesap', paths: ['kullaniciAdi', 'eposta', 'sifre', 'sifreTekrar'] },
  { ad: 'Kişisel', paths: ['adSoyad', 'yas', 'sehir', 'telefonlar'] },
  { ad: 'Onay', paths: ['kosullar'] },
]
const TAKEN = new Set(['admin', 'ayse', 'yonetici'])

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const root = $<HTMLFormElement>('kayit')
const usernameStatus = root.querySelector<HTMLElement>('[data-durum-for="kullaniciAdi"]') as HTMLElement

const form = createForm<Infer<typeof schema>>({
  schema,
  initialValues: {
    kullaniciAdi: '',
    eposta: '',
    sifre: '',
    sifreTekrar: '',
    adSoyad: '',
    yas: '',
    sehir: '',
    telefonlar: [{ numara: '' }],
    kosullar: false,
  },
  asyncDelayMs: 400,
  asyncValidators: {
    kullaniciAdi: (value, { signal }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(TAKEN.has(String(value).toLocaleLowerCase('tr-TR')) ? metin.form.alinmis : undefined),
          600,
        )
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DOMException('iptal', 'AbortError'))
        })
      }),
  },
  onSubmit: () => new Promise((resolve) => setTimeout(resolve, 300)),
})

let step = 0
let phoneSignature = ''

function renderPhones(): void {
  const keys = form.arrayKeys('telefonlar')
  if (keys.join() === phoneSignature) return
  phoneSignature = keys.join()
  const box = $('telefonlar')
  box.replaceChildren(
    ...keys.map((key, i) => {
      const row = document.createElement('div')
      row.className = 'telefon'
      row.dataset.key = key
      const id = `telefon-${key}`
      const label = document.createElement('label')
      label.htmlFor = id
      label.className = 'gizli'
      label.textContent = metin.form.telefon(i + 1)
      const input = document.createElement('input')
      input.id = id
      input.name = `telefonlar.${i}.numara`
      input.inputMode = 'tel'
      input.autocomplete = 'tel'
      input.placeholder = '05XXXXXXXXX'
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = 'Sil'
      remove.setAttribute('aria-label', metin.form.telefonSil(i + 1))
      remove.disabled = keys.length === 1
      remove.addEventListener('click', () => form.arrayRemove('telefonlar', i))
      const error = document.createElement('p')
      error.className = 'alan-hatasi'
      error.dataset.errorFor = input.name
      error.hidden = true
      row.append(label, input, remove, error)
      return row
    }),
  )
  $<HTMLButtonElement>('telefon-ekle').disabled = keys.length >= 3
}

function renderStep(): void {
  root.querySelectorAll<HTMLFieldSetElement>('fieldset').forEach((fs) => (fs.hidden = Number(fs.dataset.adim) !== step))
  $('adimlar')
    .querySelectorAll('li')
    .forEach((li, i) => (i === step ? li.setAttribute('aria-current', 'step') : li.removeAttribute('aria-current')))
  $<HTMLButtonElement>('geri').disabled = step === 0
  $('ileri').hidden = step === STEPS.length - 1
  $('gonder').hidden = step !== STEPS.length - 1
  $('adim-duyuru').textContent = metin.form.adim(step + 1, STEPS.length, (STEPS[step] as (typeof STEPS)[number]).ad)
  if (step === 2) renderSummary()
}

function renderSummary(): void {
  const v = form.values() as Record<string, string> & { telefonlar: { numara: string }[] }
  const rows: [string, string][] = [
    ['Kullanıcı adı', v.kullaniciAdi ?? ''],
    ['E-posta', v.eposta ?? ''],
    ['Ad soyad', v.adSoyad ?? ''],
    ['Yaş', v.yas || '—'],
    ['Şehir', v.sehir ?? ''],
    ['Telefonlar', v.telefonlar.map((t) => t.numara).join(', ')],
  ]
  $('ozet').replaceChildren(
    ...rows.flatMap(([k, val]) => {
      const dt = document.createElement('dt')
      dt.textContent = k
      const dd = document.createElement('dd')
      dd.textContent = val
      return [dt, dd]
    }),
  )
}

form.subscribe(() => {
  renderPhones()
  usernameStatus.textContent = form.field('kullaniciAdi').validating ? metin.form.denetleniyor : ''
})
renderPhones()
bindForm(form, root, {
  onSubmitted: (result) => {
    $('sonuc').textContent = result.ok ? metin.form.gonderildi : metin.form.hataOzeti(Object.keys(result.errors).length)
  },
})
renderStep()

$('telefon-ekle').addEventListener('click', () => {
  form.arrayAppend('telefonlar', { numara: '' })
  root.querySelector<HTMLInputElement>('.telefon:last-child input')?.focus()
})
$('geri').addEventListener('click', () => {
  step = Math.max(0, step - 1)
  renderStep()
})
$('ileri').addEventListener('click', () => {
  const current = STEPS[step] as (typeof STEPS)[number]
  void form.validatePaths(current.paths).then((ok) => {
    if (!ok) {
      focusFirstError(form, root)
      return
    }
    step++
    renderStep()
    root
      .querySelector<HTMLElement>(`fieldset[data-adim="${step}"] input, fieldset[data-adim="${step}"] select`)
      ?.focus()
  })
})
