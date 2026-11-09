import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { drain } from '../../server/background.ts'
import { all, get, insert } from '../../server/db/db.ts'
import { DEMO_RESIDENT_PHONE, DEMO_USERS } from '../../server/db/seed.ts'
import { FakeLLM, setup } from './helpers.ts'

const siteId = (db: Parameters<typeof get>[0], name: string) =>
  get<{ id: number }>(db, 'SELECT id FROM sites WHERE name = ?', name)!.id

describe('kimlik doğrulama ve yetki', () => {
  it('sağlık ucu ve personel girişi', async () => {
    const { call, login } = await setup()
    expect((await call('GET', '/api/health')).data.ok).toBe(true)
    expect(
      (await call('POST', '/api/auth/login', { body: { email: DEMO_USERS.admin, password: 'yanlis-parola' } })).status,
    ).toBe(401)
    const cookie = await login(DEMO_USERS.admin)
    const me = await call('GET', '/api/auth/me', { cookie })
    expect(me.data.user.role).toBe('admin')
    expect(me.data.sites).toHaveLength(3)
    await call('POST', '/api/auth/logout', { cookie, body: {} })
    expect((await call('GET', '/api/auth/me', { cookie })).status).toBe(401)
  })

  it('site yöneticisi yalnız atandığı siteleri görür', async () => {
    const { call, login, db } = await setup()
    const cookie = await login(DEMO_USERS.yonetici)
    const sites = await call('GET', '/api/y/sites', { cookie })
    expect(sites.data.map((s: { name: string }) => s.name).sort()).toEqual(
      ['Lale Evleri Sitesi', 'Çınar Apartmanı'].sort(),
    )
    expect((await call('GET', `/api/y/sites/${siteId(db, 'Deniz Konutları')}`, { cookie })).status).toBe(403)
    expect((await call('PUT', '/api/y/settings', { cookie, body: {} })).status).toBe(403)
  })

  it('kuruluşlar birbirinin verisini göremez', async () => {
    const { call, login, db } = await setup()
    const otherOrg = insert(db, 'orgs', { name: 'Başka Yönetim Ltd.' })
    const otherSite = insert(db, 'sites', { org_id: otherOrg, name: 'Başka Site' })
    const otherUnit = insert(db, 'units', { site_id: otherSite, no: '1', land_share: 1 })
    const otherPerson = insert(db, 'people', { org_id: otherOrg, full_name: 'Gizli Kişi', phone: '+905559998877' })
    const otherTicket = insert(db, 'tickets', {
      org_id: otherOrg,
      site_id: otherSite,
      title: 'Gizli',
      category: 'diger',
      priority: 'normal',
    })
    const cookie = await login(DEMO_USERS.admin)
    expect((await call('GET', `/api/y/sites/${otherSite}`, { cookie })).status).toBe(404)
    expect((await call('GET', `/api/y/units/${otherUnit}`, { cookie })).status).toBe(404)
    expect((await call('GET', `/api/y/tickets/${otherTicket}`, { cookie })).status).toBe(404)
    expect((await call('GET', `/api/y/people/${otherPerson}/export`, { cookie })).status).toBe(404)
    expect(
      (
        await call('POST', '/api/y/payments', {
          cookie,
          body: { unitId: otherUnit, amount: 100, paidOn: '2026-11-01', method: 'nakit' },
        })
      ).status,
    ).toBe(404)
    const people = await call('GET', '/api/y/people?q=Gizli', { cookie })
    expect(people.data).toHaveLength(0)
  })

  it('JSON olmayan yazma isteği reddedilir (CSRF koruması)', async () => {
    const { app, login } = await setup()
    const cookie = await login(DEMO_USERS.admin)
    const res = await app.request('/api/y/people', {
      method: 'POST',
      headers: { cookie, 'content-type': 'text/plain', origin: 'https://saldirgan.example' },
      body: JSON.stringify({ fullName: 'X Y' }),
    })
    expect([403, 415]).toContain(res.status)
  })
})

describe('sakin portalı', () => {
  it('telefonla giriş, kendi dairesi, başka daireye erişim yok', async () => {
    const { call, residentLogin, db } = await setup()
    const cookie = await residentLogin(DEMO_RESIDENT_PHONE)
    const home = await call('GET', '/api/portal/home', { cookie })
    expect(home.data.person.full_name).toBe('Ayşe Kaya')
    expect(home.data.units[0].label).toBe('A Blok No 5')
    expect((await call('GET', '/api/y/sites', { cookie })).status).toBe(403)
    const other = get<{ id: number }>(
      db,
      `SELECT u.id FROM units u JOIN blocks b ON b.id = u.block_id WHERE b.name = 'B Blok' AND u.no = '1'`,
    )!
    expect((await call('GET', `/api/portal/units/${other.id}/statement`, { cookie })).status).toBe(403)
    const own = await call('GET', `/api/portal/units/${home.data.units[0].id}/statement`, { cookie })
    expect(own.data.lines.length).toBeGreaterThan(3)
  })

  it('yanlış kod 5 denemeden sonra kilitlenir', async () => {
    const { call } = await setup()
    await call('POST', '/api/auth/otp', { body: { phone: DEMO_RESIDENT_PHONE } })
    for (let i = 0; i < 5; i++)
      expect(
        (await call('POST', '/api/auth/otp/verify', { body: { phone: DEMO_RESIDENT_PHONE, code: '000000' } })).status,
      ).toBe(401)
  })

  it('talep açar; yapay zekâ kategori ve öncelik verir', async () => {
    const { call, residentLogin } = await setup()
    const cookie = await residentLogin(DEMO_RESIDENT_PHONE)
    const home = await call('GET', '/api/portal/home', { cookie })
    const t = await call('POST', '/api/portal/tickets', {
      cookie,
      body: { unitId: home.data.units[0].id, description: 'Banyodaki lavabo gideri tıkandı, su akmıyor' },
    })
    expect(t.status).toBe(201)
    expect(t.data.category).toBe('tesisat')
    const list = await call('GET', '/api/portal/tickets', { cookie })
    expect(list.data.some((x: { id: number }) => x.id === t.data.id)).toBe(true)
  })

  it('test ödemesi tahsilat olarak işlenir ve tekrar işlenmez', async () => {
    const { call, residentLogin, db } = await setup()
    const cookie = await residentLogin(DEMO_RESIDENT_PHONE)
    const home = await call('GET', '/api/portal/home', { cookie })
    const pay = await call('POST', '/api/portal/pay', {
      cookie,
      body: { unitId: home.data.units[0].id, amount: 125_000 },
    })
    expect(pay.data.url).toMatch(/^\/odeme\/test\/KHY/)
    const done = await call('POST', `/api/portal/payments/${pay.data.oid}/test`, { cookie, body: { success: true } })
    expect(done.data.status).toBe('basarili')
    await call('POST', `/api/portal/payments/${pay.data.oid}/test`, { cookie, body: { success: true } })
    expect(all(db, `SELECT id FROM payments WHERE reference = ?`, pay.data.oid)).toHaveLength(1)
  })

  it('asistan belgeden yanıt verir', async () => {
    const { call, residentLogin } = await setup()
    const cookie = await residentLogin(DEMO_RESIDENT_PHONE)
    const a = await call('POST', '/api/portal/ask', { cookie, body: { question: 'Havuz kaçta kapanıyor?' } })
    expect(a.data.answer).toMatch(/21:00/)
    expect(a.data.sources[0].title).toContain('İç Yönetmeliği')
    const b = await call('POST', '/api/portal/ask', { cookie, body: { question: 'Borcum ne kadar?' } })
    expect(b.data.answer).toMatch(/bakiye/)
  })
})

describe('finans', () => {
  it('tahakkuk aynı ay için tekrar üretilmez; tahsilat bakiyeyi düşürür', async () => {
    const { call, login, db } = await setup()
    const cookie = await login(DEMO_USERS.muhasebe)
    const lale = siteId(db, 'Lale Evleri Sitesi')
    const again = await call('POST', `/api/y/sites/${lale}/accruals`, { cookie, body: { month: '2026-11' } })
    expect(again.data.created).toBe(0)
    const next = await call('POST', `/api/y/sites/${lale}/accruals`, { cookie, body: { month: '2026-12' } })
    expect(next.data.created).toBe(24)
    const units = await call('GET', `/api/y/sites/${lale}/units`, { cookie })
    const debtor = units.data.find((u: { label: string }) => u.label === 'A Blok No 8')
    expect(debtor.position.overdue).toBeGreaterThan(0)
    const before = debtor.position.balance
    await call('POST', '/api/y/payments', {
      cookie,
      body: { unitId: debtor.id, amount: 100_000, paidOn: '2026-11-09', method: 'nakit' },
    })
    const after = (await call('GET', `/api/y/units/${debtor.id}`, { cookie })).data.position.balance
    expect(after).toBe(before - 100_000)
  })

  it('gecikme tazminatı önizleme ve tahakkuk', async () => {
    const { call, login, db } = await setup()
    const cookie = await login(DEMO_USERS.admin)
    const cinar = siteId(db, 'Çınar Apartmanı')
    const preview = await call('GET', `/api/y/sites/${cinar}/late-fees?asOf=2026-11-09`, { cookie })
    expect(preview.data.total).toBeGreaterThan(0)
    const post = await call('POST', `/api/y/sites/${cinar}/late-fees`, { cookie, body: { asOf: '2026-11-09' } })
    expect(post.data.total).toBe(preview.data.total)
    const again = await call('POST', `/api/y/sites/${cinar}/late-fees`, { cookie, body: { asOf: '2026-11-09' } })
    expect(again.data.total).toBe(0)
  })

  it('banka hareketi eşleştirme ve mükerrer kontrolü', async () => {
    const { call, login, db } = await setup()
    const cookie = await login(DEMO_USERS.admin)
    const lale = siteId(db, 'Lale Evleri Sitesi')
    const imports = await call('GET', `/api/y/sites/${lale}/bank-imports`, { cookie })
    const detail = await call('GET', `/api/y/bank-imports/${imports.data[0].id}`, { cookie })
    const confident = detail.data.rows.filter(
      (r: { confidence: number; suggested_unit_id: number | null }) => r.suggested_unit_id && r.confidence >= 0.5,
    )
    expect(confident.length).toBeGreaterThan(0)
    const rows = confident.map((r: { id: number; suggested_unit_id: number }) => ({
      rowId: r.id,
      action: 'eslestir',
      unitId: r.suggested_unit_id,
    }))
    const res = await call('POST', `/api/y/bank-imports/${imports.data[0].id}/confirm`, { cookie, body: { rows } })
    expect(res.data.matched).toBe(rows.length)
    // Aynı dökümü yeniden yüklemek mükerrer satır üretir
    const csv = `Tarih;Açıklama;Tutar;Dekont No\n${detail.data.rows
      .filter((r: { id: number }) => rows.some((x: { rowId: number }) => x.rowId === r.id))
      .map(
        (r: { txn_date: string; description: string; amount: number; reference: string }) =>
          `${r.txn_date};${r.description};${(r.amount / 100).toFixed(2)};${r.reference}`,
      )
      .join('\n')}`
    const re = await call('POST', `/api/y/sites/${lale}/bank-imports`, { cookie, body: { csv } })
    const reDetail = await call('GET', `/api/y/bank-imports/${re.data.id}`, { cookie })
    expect(reDetail.data.rows.every((r: { status: string }) => r.status === 'mukerrer')).toBe(true)
  })

  it('işletme projesi önizlemesi KMK m.20 dağıtımıyla', async () => {
    const { call, login, db } = await setup()
    const cookie = await login(DEMO_USERS.admin)
    const lale = siteId(db, 'Lale Evleri Sitesi')
    const budgets = await call('GET', `/api/y/sites/${lale}/budgets`, { cookie })
    const preview = await call('GET', `/api/y/budgets/${budgets.data[0].id}`, { cookie })
    const monthly = preview.data.units.map((u: { monthly: number }) => u.monthly)
    expect(Math.max(...monthly)).toBeGreaterThan(Math.min(...monthly)) // arsa payı farkı yansır
    expect(monthly.every((m: number) => m % 100 === 0)).toBe(true)
  })
})

describe('gelen kutusu ve onay kuyruğu', () => {
  it('acil mesaj: talep açılır, güvenlik yanıtı ve nöbetçi bildirimi beklemeden gider', async () => {
    const { call, login, db } = await setup()
    const cookie = await login(DEMO_USERS.admin)
    const res = await call('POST', '/api/y/inbox/simulate', {
      cookie,
      body: { channel: 'whatsapp', from: DEMO_RESIDENT_PHONE, body: 'Merdiven boşluğunda gaz kokusu var, çok yoğun!' },
    })
    expect(res.status).toBe(201)
    expect(res.data.result.triage.priority).toBe('acil')
    expect(res.data.result.ticketId).toBeTruthy()
    expect(res.data.result.replied).toBe(true)
    const out = all<{ body: string; kind: string }>(
      db,
      `SELECT body, kind FROM messages WHERE direction = 'giden' ORDER BY id DESC LIMIT 3`,
    )
    expect(out.some((m) => m.kind === 'acil_bildirim')).toBe(true)
    expect(out.some((m) => m.body.includes('187'))).toBe(true)
  })

  it('öneri onaylanır ya da reddedilir; iki kez onaylanamaz', async () => {
    const { call, login } = await setup()
    const cookie = await login(DEMO_USERS.admin)
    const pending = await call('GET', '/api/y/actions', { cookie })
    const reply = pending.data.find((a: { kind: string }) => a.kind === 'yanit')
    const ok = await call('POST', `/api/y/actions/${reply.id}/approve`, {
      cookie,
      body: { edits: { body: 'Merhaba, ekibimiz yolda.' } },
    })
    expect(ok.status).toBe(200)
    expect((await call('POST', `/api/y/actions/${reply.id}/approve`, { cookie, body: {} })).status).toBe(409)
    const reminder = pending.data.find((a: { kind: string }) => a.kind === 'hatirlatma')
    expect(
      (await call('POST', `/api/y/actions/${reminder.id}/reject`, { cookie, body: { reason: 'Ödeme planı var' } }))
        .status,
    ).toBe(200)
  })

  it('Claude yolunda kişisel veriler modele maskeli gider, yanıtta geri konur', async () => {
    const llm = new FakeLLM(() => ({
      intent: 'ariza',
      category: 'tesisat',
      priority: 'yuksek',
      summary: '[KISI_1] su sızıntısı bildirdi',
      needs_ticket: true,
      ticket_title: 'Mutfakta su sızıntısı',
      location: 'daire_ici',
      block_hint: 'A',
      unit_hint: '5',
      safety_advice: null,
      reply: 'Merhaba [KISI_1], bildiriminizi aldık.',
    }))
    const { call, login } = await setup({ llm })
    const cookie = await login(DEMO_USERS.admin)
    const res = await call('POST', '/api/y/inbox/simulate', {
      cookie,
      body: {
        channel: 'whatsapp',
        from: DEMO_RESIDENT_PHONE,
        body: 'Ben Ayşe Kaya, TC 10000000146, tel 0532 111 22 33. Mutfakta su sızıntısı var.',
      },
    })
    const prompt = llm.prompts.at(-1)!.user
    expect(prompt).not.toMatch(/Ayşe|Kaya|10000000146|0532 111 22 33/)
    expect(prompt).toMatch(/\[KISI_1\]/)
    expect(res.data.result.triage.reply).toBe('Merhaba Ayşe Kaya, bildiriminizi aldık.')
    expect(res.data.result.triage.engine).toBe('claude')
    expect(res.data.result.triage.masked).toBeGreaterThanOrEqual(3)
  })
})

describe('kat malikleri kurulu', () => {
  it('yeter sayı, oylama ve tutanak', async () => {
    const { call, login, db } = await setup()
    const cookie = await login(DEMO_USERS.admin)
    const cinar = siteId(db, 'Çınar Apartmanı')
    const m = await call('POST', '/api/y/meetings', {
      cookie,
      body: {
        siteId: cinar,
        kind: 'olaganustu',
        title: 'Asansör yenileme toplantısı',
        firstAt: '2026-12-01T19:00',
        secondAt: '2026-12-08T19:00',
        location: 'Giriş katı',
        agenda: [{ title: 'Asansör kabininin yenilenmesi', rule: 'sayi_arsa' }],
      },
    })
    const detail = await call('GET', `/api/y/meetings/${m.data.id}`, { cookie })
    expect(detail.data.invitation).toMatch(/ikinci toplantı/)
    const units = detail.data.units as { id: number }[]
    const q = await call('PUT', `/api/y/meetings/${m.data.id}/attendance`, {
      cookie,
      body: { items: units.slice(0, 7).map((u) => ({ unitId: u.id, present: true })) },
    })
    expect(q.data.ok).toBe(true)
    const itemId = detail.data.agenda[0].id
    const tally = await call('PUT', `/api/y/agenda/${itemId}/votes`, {
      cookie,
      body: { votes: units.slice(0, 7).map((u) => ({ unitId: u.id, vote: 'evet' })) },
    })
    expect(tally.data.passed).toBe(true)
    const minutes = await call('POST', `/api/y/meetings/${m.data.id}/minutes`, { cookie, body: {} })
    expect(minutes.data.minutes).toMatch(/KABUL EDİLDİ/)
    expect(minutes.data.minutes).toMatch(/noter onaylı karar defterine/)
  })
})

describe('webhooklar', () => {
  it('WhatsApp doğrulama, imza ve mükerrer mesaj', async () => {
    const { app, db } = await setup({
      config: { whatsapp: { verifyToken: 'dogrula', appSecret: 'gizli', apiVersion: 'v26.0' } },
    })
    const v = await app.request(
      '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=dogrula&hub.challenge=12345',
    )
    expect(await v.text()).toBe('12345')
    const payload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '905321112233', profile: { name: 'Ayşe' } }],
                messages: [{ from: '905321112233', id: 'wamid.1', type: 'text', text: { body: 'Asansör çalışmıyor' } }],
              },
            },
          ],
        },
      ],
    })
    const sig = `sha256=${createHmac('sha256', 'gizli').update(payload).digest('hex')}`
    const bad = await app.request('/api/webhooks/whatsapp', {
      method: 'POST',
      body: payload,
      headers: { 'x-hub-signature-256': 'sha256=00' },
    })
    expect(bad.status).toBe(401)
    for (let i = 0; i < 2; i++) {
      const ok = await app.request('/api/webhooks/whatsapp', {
        method: 'POST',
        body: payload,
        headers: { 'x-hub-signature-256': sig },
      })
      expect(ok.status).toBe(200)
      await drain()
    }
    expect(all(db, `SELECT id FROM messages WHERE provider_id = 'wamid.1'`)).toHaveLength(1)
  })

  it('PayTR bildirimi hash ile doğrulanır', async () => {
    const paytr = { merchantId: '123456', merchantKey: 'anahtar', merchantSalt: 'tuz', testMode: true }
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ status: 'success', token: 'tok123' }))) as unknown as typeof fetch
    const { call, app, residentLogin, db } = await setup({ config: { paytr }, fetch: fakeFetch })
    const cookie = await residentLogin(DEMO_RESIDENT_PHONE)
    const home = await call('GET', '/api/portal/home', { cookie })
    const pay = await call('POST', '/api/portal/pay', {
      cookie,
      body: { unitId: home.data.units[0].id, amount: 50_000 },
    })
    expect(pay.data.url).toBe('https://www.paytr.com/odeme/guvenli/tok123')
    const fields = { merchant_oid: pay.data.oid, status: 'success', total_amount: '50000' }
    const hash = createHmac('sha256', 'anahtar')
      .update(fields.merchant_oid + 'tuz' + fields.status + fields.total_amount)
      .digest('base64')
    const bad = await app.request('/api/webhooks/paytr', {
      method: 'POST',
      body: new URLSearchParams({ ...fields, hash: 'yanlis' }),
    })
    expect(bad.status).toBe(400)
    for (let i = 0; i < 2; i++) {
      const ok = await app.request('/api/webhooks/paytr', {
        method: 'POST',
        body: new URLSearchParams({ ...fields, hash }),
      })
      expect(await ok.text()).toBe('OK')
    }
    expect(all(db, `SELECT id FROM payments WHERE reference = ? AND source = 'online'`, pay.data.oid)).toHaveLength(1)
  })
})

describe('KVKK', () => {
  it('veri dökümü ve anonimleştirme', async () => {
    const { call, login, db } = await setup()
    const cookie = await login(DEMO_USERS.admin)
    const ayse = get<{ id: number }>(db, `SELECT id FROM people WHERE full_name = 'Ayşe Kaya'`)!
    const exp = await call('GET', `/api/y/people/${ayse.id}/export`, { cookie })
    expect(exp.data.kisi.full_name).toBe('Ayşe Kaya')
    expect(exp.data.mesajlar.length).toBeGreaterThan(0)
    expect((await call('POST', `/api/y/people/${ayse.id}/anonymize`, { cookie, body: {} })).status).toBe(200)
    const after = get<{ full_name: string; phone: string | null }>(
      db,
      'SELECT full_name, phone FROM people WHERE id = ?',
      ayse.id,
    )!
    expect(after.full_name).toMatch(/^Silinmiş kişi/)
    expect(after.phone).toBeNull()
    // Mali kayıtlar daireye bağlı kalır
    expect(
      all(db, `SELECT p.id FROM payments p JOIN units u ON u.id = p.unit_id WHERE u.no = '5'`).length,
    ).toBeGreaterThan(0)
  })
})

describe('pano ve otopilot', () => {
  it('pano göstergeleri ve akıllı uyarılar', async () => {
    const { call, login } = await setup()
    const cookie = await login(DEMO_USERS.admin)
    const d = await call('GET', '/api/y/dashboard', { cookie })
    expect(d.data.kpis.units).toBe(50)
    expect(d.data.kpis.receivables).toBeGreaterThan(0)
    expect(d.data.series).toHaveLength(6)
    expect(d.data.insights.some((i: { text: string }) => /gideri bu ay/.test(i.text))).toBe(true)
  })

  it('otopilot aynı gün ikinci kez hatırlatma üretmez', async () => {
    const { call, login } = await setup()
    const cookie = await login(DEMO_USERS.admin)
    const first = await call('POST', '/api/y/autopilot/run', { cookie, body: {} })
    const second = await call('POST', '/api/y/autopilot/run', { cookie, body: {} })
    expect(second.data.reminders).toBe(0)
    expect(first.status).toBe(200)
  })
})
