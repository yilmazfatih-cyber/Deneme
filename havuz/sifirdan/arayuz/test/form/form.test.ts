import { describe, expect, it, vi } from 'vitest'
import { createForm, remapPath, removeMapping, s } from '../../src/form/index.ts'

const schema = s.object({
  kullaniciAdi: s.string().min(3),
  eposta: s.string().email(),
  telefonlar: s.array(s.object({ numara: s.string().min(10) })).min(1),
})
const initialValues = { kullaniciAdi: '', eposta: '', telefonlar: [{ numara: '' }] }

function deferred() {
  let resolve!: (value: string | undefined) => void
  const promise = new Promise<string | undefined>((r) => (resolve = r))
  return { promise, resolve }
}

describe('form durumu', () => {
  it('hata dokunulunca görünür; kirli bilgisi değerden hesaplanır', () => {
    const form = createForm({ schema, initialValues })
    form.setValue('kullaniciAdi', 'ab')
    expect(form.field('kullaniciAdi')).toMatchObject({ value: 'ab', dirty: true, touched: false, error: undefined })
    form.blur('kullaniciAdi')
    expect(form.field('kullaniciAdi').error).toBe('En az 3 karakter olmalı.')
    form.setValue('kullaniciAdi', 'abc')
    expect(form.field('kullaniciAdi').error).toBeUndefined()
    form.setValue('kullaniciAdi', '')
    expect(form.field('kullaniciAdi')).toMatchObject({ dirty: false, error: 'Bu alan zorunlu.' })
  })

  it('gönderim tüm alanları dokunulmuş sayar, ilk hatayı bildirir; geçerliyse çözümlenmiş değeri yollar', async () => {
    const sent: unknown[] = []
    const form = createForm({ schema, initialValues, onSubmit: (v) => void sent.push(v) })
    const bad = await form.submit()
    expect(bad).toMatchObject({ ok: false, firstError: 'kullaniciAdi' })
    expect(form.field('telefonlar.0.numara').error).toBe('Bu alan zorunlu.')
    form.setValue('kullaniciAdi', ' ayse ')
    form.setValue('eposta', 'ayse@ornek.com')
    form.setValue('telefonlar.0.numara', '5321234567')
    expect(await form.submit()).toEqual({
      ok: true,
      value: { kullaniciAdi: 'ayse', eposta: 'ayse@ornek.com', telefonlar: [{ numara: '5321234567' }] },
    })
    expect(sent).toHaveLength(1)
    expect(form.status.submitCount).toBe(2)
  })

  it('eşzamansız doğrulama yarışa dayanıklı: geç dönen eski yanıt atılır, eski istek iptal edilir', async () => {
    const calls: { value: unknown; signal: AbortSignal; d: ReturnType<typeof deferred> }[] = []
    const form = createForm({
      schema,
      initialValues,
      asyncValidators: {
        kullaniciAdi: (value, { signal }) => {
          const d = deferred()
          calls.push({ value, signal, d })
          return d.promise
        },
      },
      schedule: (fn) => (fn(), () => undefined),
    })
    form.setValue('kullaniciAdi', 'ali')
    form.blur('kullaniciAdi')
    form.setValue('kullaniciAdi', 'ali2')
    expect(calls.map((c) => c.value)).toEqual(['ali', 'ali2'])
    expect(calls[0]!.signal.aborted).toBe(true)
    expect(form.field('kullaniciAdi').validating).toBe(true)
    calls[1]!.d.resolve(undefined)
    calls[0]!.d.resolve('Bu kullanıcı adı alınmış.')
    await vi.waitFor(() => expect(form.field('kullaniciAdi').validating).toBe(false))
    expect(form.field('kullaniciAdi').error).toBeUndefined()
  })

  it('eşzamanlı hata varken sunucuya sormaz; doğrulayıcı çökerse yol gösteren ileti verir', async () => {
    let calls = 0
    const form = createForm({
      schema,
      initialValues,
      asyncValidators: {
        kullaniciAdi: async () => {
          calls++
          throw new Error('ağ yok')
        },
      },
    })
    form.setValue('kullaniciAdi', 'ab')
    form.blur('kullaniciAdi')
    expect(calls).toBe(0)
    form.setValue('kullaniciAdi', 'abc')
    form.blur('kullaniciAdi')
    await vi.waitFor(() =>
      expect(form.field('kullaniciAdi').error).toBe('Bu alan şu an denetlenemedi. Lütfen yeniden deneyin.'),
    )
    expect(calls).toBe(1)
  })

  it('alan dizisinde silme ve taşıma dokunuldu bilgisini ve anahtarları birlikte kaydırır', () => {
    const form = createForm({
      schema,
      initialValues: { ...initialValues, telefonlar: [{ numara: 'a' }, { numara: 'b' }, { numara: 'c' }] },
    })
    const [k0, , k2] = form.arrayKeys('telefonlar')
    form.blur('telefonlar.2.numara')
    form.arrayRemove('telefonlar', 1)
    expect(form.arrayKeys('telefonlar')).toEqual([k0, k2])
    expect(form.field('telefonlar.1.numara')).toMatchObject({ value: 'c', touched: true })
    form.arrayMove('telefonlar', 1, 0)
    expect(form.arrayKeys('telefonlar')).toEqual([k2, k0])
    expect(form.field('telefonlar.0.numara')).toMatchObject({ value: 'c', touched: true })
    expect(form.field('telefonlar.1.numara').touched).toBe(false)
    form.arrayAppend('telefonlar', { numara: '' })
    expect(form.arrayKeys('telefonlar')).toHaveLength(3)
    expect(remapPath('telefonlar.2.numara', 'telefonlar', removeMapping(1))).toBe('telefonlar.1.numara')
    expect(remapPath('baska.2', 'telefonlar', removeMapping(1))).toBeNull()
  })

  it('adım doğrulaması yalnız verilen yolları denetler', async () => {
    const form = createForm({ schema, initialValues })
    form.setValue('kullaniciAdi', 'ayşe')
    expect(await form.validatePaths(['kullaniciAdi'])).toBe(true)
    expect(await form.validatePaths(['telefonlar'])).toBe(false)
    expect(form.field('telefonlar.0.numara').error).toBe('Bu alan zorunlu.')
    expect(form.field('eposta').error).toBeUndefined()
  })
})
