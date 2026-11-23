/**
 * Belgelere sor (/sor), sahte API ile: soru → yanıt + kaynak + uyarı; belgelerde yok; alan hatası kutunun altında;
 * sunucu hatası role=alert; çevrimdışıyken gönderme kapalı ve nedeni yazılı. Gerçek yz ile uçtan uca deneme:
 * e2e/sor/ (havuz/tarifler/belgeye-soru-uygulamasi/dogrula.py çalıştırır).
 */
import { API_PATHS, type AskResponse } from '@uygulama/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../../src/lib/api.ts'
import { FakeBackend } from '../helpers/fakeApi.ts'
import { renderApp, resetBrowserData } from '../helpers/render.tsx'

const PASSWORD = 'mavi-deniz-kenari-42'

const ANSWER: AskResponse = {
  answer: 'Ürünü teslimden sonraki 14 gün içinde iade edebilirsiniz. [1]',
  notInDocuments: false,
  citations: [1],
  sources: [{ number: 1, title: 'iade.md › İade politikası', excerpt: 'Ürünü teslimden sonraki 14 gün içinde…' }],
  warnings: ['Kaynaklarda geçmeyen ifadeler var, doğruluğunu denetleyin: 2025'],
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Sahte arka uç + /api/sor'u yanıtlayan sarmalayıcı (öteki istekler FakeBackend'e gider). */
function setup(reply: () => Response) {
  const backend = new FakeBackend()
  backend.createAccount('ayse@ornek.com', PASSWORD, 'Ayşe')
  const device = backend.device()
  const questions: string[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://x')
    if (url.pathname !== API_PATHS.ask) return device.fetch(input, init)
    questions.push((JSON.parse(init?.body as string) as { question: string }).question)
    return reply()
  }
  return { api: new ApiClient({ baseUrl: '', authMode: 'cookie', fetch: fetchFn }), questions }
}

async function openSor(api: ApiClient) {
  const user = userEvent.setup()
  renderApp({ path: '/giris?next=%2Fsor', api })
  await user.type(await screen.findByRole('textbox', { name: 'E-posta' }), 'ayse@ornek.com')
  await user.type(screen.getByLabelText('Şifre'), PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Giriş yap' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Belgelere sor' })).toBeInTheDocument()
  return user
}

beforeEach(async () => {
  await resetBrowserData()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Belgelere sor', () => {
  it('soru gönderilir; yanıt, kaynak ve uyarı görünür', async () => {
    const { api, questions } = setup(() => json(ANSWER))
    const user = await openSor(api)
    expect(screen.getByRole('heading', { name: 'Belgelerinize bir soru sorun' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Sorunuz' }), 'İade süresi kaç gün?')
    await user.click(screen.getByRole('button', { name: 'Sor' }))
    const card = (await screen.findByRole('heading', { name: 'Yanıt' })).closest('section') as HTMLElement
    expect(within(card).getByText(ANSWER.answer)).toBeInTheDocument()
    expect(within(card).getByText('Sorduğunuz: İade süresi kaç gün?')).toBeInTheDocument()
    expect(within(card).getByText('[1] iade.md › İade politikası')).toBeInTheDocument()
    expect(within(card).getByText(ANSWER.warnings[0] ?? '')).toBeInTheDocument()
    expect(questions).toEqual(['İade süresi kaç gün?'])
  })

  it('yanıt belgelerde yoksa bunu açıkça söyler', async () => {
    const { api } = setup(() => json({ ...ANSWER, notInDocuments: true, sources: [], warnings: [] }))
    const user = await openSor(api)
    await user.type(screen.getByRole('textbox', { name: 'Sorunuz' }), 'Genel müdür kim?')
    await user.click(screen.getByRole('button', { name: 'Sor' }))
    expect(await screen.findByText('Bu sorunun yanıtı belgelerde bulunamadı.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kaynaklar' })).not.toBeInTheDocument()
  })

  it('alan hatası kutunun altında, sunucu hatası uyarı olarak görünür', async () => {
    let reply = json(
      {
        error: {
          code: 'validation',
          message: 'x',
          details: [{ path: 'question', message: 'Soru en az 3 karakter olmalı.' }],
        },
      },
      400,
    )
    const { api } = setup(() => reply)
    const user = await openSor(api)
    const box = screen.getByRole('textbox', { name: 'Sorunuz' })
    await user.type(box, 'a')
    await user.click(screen.getByRole('button', { name: 'Sor' }))
    expect(await screen.findByText('Soru en az 3 karakter olmalı.')).toBeInTheDocument()
    expect(box).toHaveAttribute('aria-invalid', 'true')
    reply = json({ error: { code: 'internal', message: 'Yapay zekâ hizmetine şu an ulaşılamıyor.' } }, 500)
    await user.type(box, 'bc')
    await user.click(screen.getByRole('button', { name: 'Sor' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Yapay zekâ hizmetine şu an ulaşılamıyor.')
  })

  it('çevrimdışıyken gönderme kapalıdır ve nedeni yazılıdır', async () => {
    const { api, questions } = setup(() => json(ANSWER))
    const user = await openSor(api)
    await user.type(screen.getByRole('textbox', { name: 'Sorunuz' }), 'İade süresi?')
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    expect(await screen.findByText(/Çevrimdışısınız/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sor' })).toBeDisabled()
    expect(questions).toEqual([])
  })
})
