/**
 * Ekran görüntüleri (`npm run shots`): docs/ekran/ altına 390×844 ve 1280×800, açık ve koyu tema, 2x çözünürlük.
 * Veri API üzerinden hazırlanır (görevler, listeler, paylaşımlı alan + ikinci üye); görüntüler insan gözü içindir.
 */
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { PASSWORD, expectSynced, expectTasksPage, register, uniqueEmail } from './support/helpers.ts'

const OUT = join(import.meta.dirname, '..', 'docs', 'ekran')
const SIZES = { telefon: { width: 390, height: 844 }, masaustu: { width: 1280, height: 800 } } as const
const THEMES = { acik: 'light', koyu: 'dark' } as const

function day(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Kişisel alana örnek veri: listeler ve görevler (eşitleme ucuyla, tek istekte). */
async function seed(request: APIRequestContext): Promise<void> {
  const { workspaces } = (await (await request.get('./api/workspaces')).json()) as { workspaces: { id: string }[] }
  const ws = workspaces[0]?.id ?? ''
  const at = new Date().toISOString()
  const id = () => crypto.randomUUID()
  const lists = { ev: id(), is: id(), market: id() }
  const items: { collection: string; data: Record<string, unknown> }[] = [
    { collection: 'lists', data: { name: 'Ev', color: 'green', order: 1 } },
    { collection: 'lists', data: { name: 'İş', color: 'blue', order: 2 } },
    { collection: 'lists', data: { name: 'Market', color: 'amber', order: 3 } },
    {
      collection: 'tasks',
      data: { title: 'Elektrik faturasını öde', listId: lists.ev, dueDate: day(-1), priority: 'high', order: 1 },
    },
    { collection: 'tasks', data: { title: 'İlaçları eczaneden al', listId: lists.ev, dueDate: day(0), order: 2 } },
    {
      collection: 'tasks',
      data: { title: 'Sunum taslağını bitir', listId: lists.is, dueDate: day(1), priority: 'high', order: 3 },
    },
    { collection: 'tasks', data: { title: 'Haftalık raporu gönder', listId: lists.is, dueDate: day(4), order: 4 } },
    {
      collection: 'tasks',
      data: { title: 'Ekmek, süt, yumurta', listId: lists.market, note: 'Tam buğday ekmek', order: 5 },
    },
    { collection: 'tasks', data: { title: 'Diş hekimi randevusu', dueDate: day(9), priority: 'low', order: 6 } },
    { collection: 'tasks', data: { title: 'Kitapları kütüphaneye iade et', done: true, order: 7 } },
  ]
  const ids = [lists.ev, lists.is, lists.market]
  const mutations = items.map((item, index) => ({
    mid: index + 1,
    workspaceId: ws,
    collection: item.collection,
    recordId: ids[index] ?? id(),
    at,
    op: 'put',
    data: item.data,
  }))
  const response = await request.post('./api/sync', {
    data: { protocolVersion: 1, clientId: id(), cursors: {}, mutations },
  })
  expect(response.ok()).toBe(true)
}

async function shoot(page: Page, name: string, size: keyof typeof SIZES, theme: keyof typeof THEMES): Promise<void> {
  await page.setViewportSize(SIZES[size])
  await page.mouse.move(0, 0) // fare bir düğmenin üstünde kalıp "üzerinde" görünümü vermesin
  await page.emulateMedia({ colorScheme: THEMES[theme], reducedMotion: 'reduce' })
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(OUT, `${name}-${size}-${theme}.png`) })
}

async function shootAll(page: Page, name: string, sizes: readonly (keyof typeof SIZES)[]): Promise<void> {
  for (const size of sizes) for (const theme of ['acik', 'koyu'] as const) await shoot(page, name, size, theme)
}

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: `http://localhost:${process.env.E2E_WEB_PORT}/`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
  })
  return context.newPage()
}

test('ekran görüntüleri', async ({ browser }) => {
  test.setTimeout(240_000)
  mkdirSync(OUT, { recursive: true })

  const visitor = await freshPage(browser)
  await visitor.goto('./')
  await expect(visitor.getByRole('heading', { level: 1 })).toBeVisible()
  await shootAll(visitor, 'karsilama', ['telefon'])
  await visitor.goto('./#/giris')
  await expect(visitor.getByRole('heading', { name: 'Giriş yap' })).toBeVisible()
  await shootAll(visitor, 'giris', ['telefon'])
  await visitor.context().close()

  const page = await freshPage(browser)
  await page.setViewportSize(SIZES.telefon)
  await register(page, { name: 'Ayşe Yılmaz', email: uniqueEmail('ekran') })
  await expectTasksPage(page)
  await seed(page.request)

  // Paylaşımlı alan + ikinci üye (Burak) + davet bağlantısı.
  const created = await page.request.post('./api/workspaces', { data: { name: 'Aile' } })
  const { workspace } = (await created.json()) as { workspace: { id: string } }
  const invite = await page.request.post(`./api/workspaces/${workspace.id}/invites`, { data: { role: 'editor' } })
  const { invite: inviteBody } = (await invite.json()) as { invite: { token: string } }
  const burak = await freshPage(browser)
  await burak.request.post('./api/auth/register', {
    data: { name: 'Burak Demir', email: uniqueEmail('burak'), password: PASSWORD },
  })
  await burak.request.post('./api/invites/accept', { data: { token: inviteBody.token } })
  await burak.context().close()

  await page.reload()
  await expectTasksPage(page)
  await expect(page.getByRole('link', { name: 'Sunum taslağını bitir' })).toBeVisible()
  await expectSynced(page)
  await shootAll(page, 'gorevler', ['telefon', 'masaustu'])

  await page.getByRole('link', { name: 'Sunum taslağını bitir' }).click()
  await expect(page.getByRole('textbox', { name: 'Başlık' })).toBeVisible()
  await shootAll(page, 'gorev', ['telefon', 'masaustu'])

  await page.goto('./#/listeler')
  await expect(page.getByRole('link', { name: /Market/ })).toBeVisible()
  await shootAll(page, 'listeler', ['telefon'])

  await page.goto(`./#/alanlar/${workspace.id}`)
  await expect(page.getByText('Burak Demir', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Bağlantı oluştur' }).click()
  await expect(page.getByRole('textbox', { name: 'Bağlantı' })).toBeVisible()
  await shootAll(page, 'alan', ['telefon', 'masaustu'])

  await page.goto('./#/hesap')
  await expect(page.getByRole('heading', { name: 'Hesap', level: 1 })).toBeVisible()
  await shootAll(page, 'hesap', ['telefon'])

  await page.goto('./#/ayarlar')
  await expect(page.getByRole('heading', { name: 'Ayarlar', level: 1 })).toBeVisible()
  await shootAll(page, 'ayarlar', ['telefon', 'masaustu'])
  await page.context().close()
})
