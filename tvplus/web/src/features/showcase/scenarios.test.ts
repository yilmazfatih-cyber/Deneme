import { describe, expect, it } from 'vitest'
import {
  APPROVE_SELECTOR,
  CAST_SELECTOR,
  LIVE_CHANNEL,
  runScenario,
  SINTEL,
  type FrameId,
  type RunView,
  type ShowcaseEnv,
} from './scenarios'

/**
 * Sahte dünya: üç sanal cihazın oturumu ve çerçevelerin yolu. TV oturumsuzken giriş ekranında kod gösterir;
 * kod onaylanınca bir sonraki saat adımında ana sayfaya geçer. Telefon /bagla açınca Onayla düğmesi belirir.
 */
function world(opts: { tvShowsCode?: boolean; tvMember?: boolean } = {}) {
  let now = 0
  const sessions: Record<FrameId, { member: boolean; profileGuid: string | null }> = {
    tv: { member: !!opts.tvMember, profileGuid: opts.tvMember ? 'p1' : null },
    web: { member: false, profileGuid: null },
    telefon: { member: false, profileGuid: null },
  }
  const routes: Record<FrameId, string | null> = { tv: '/tv/giris', web: '/karsilama', telefon: '/karsilama' }
  const log: string[] = []
  let approved = false
  let playing: Partial<Record<FrameId, number>> = {}
  const code = 'KLMN-4825'

  const tick = () => {
    if (approved && !sessions.tv.member) {
      sessions.tv = { member: true, profileGuid: 'p1' }
      routes.tv = '/tv'
    }
    for (const f of ['tv', 'web'] as const) {
      const r = routes[f] ?? ''
      if (r.includes('/izle/')) playing[f] = (playing[f] ?? 60) + 0.25
    }
  }

  const env: ShowcaseEnv = {
    session: async (vd) => ({ ...sessions[vd] }),
    login: async (vd) => {
      log.push(`login ${vd}`)
      sessions[vd] = { member: true, profileGuid: null }
    },
    logout: async (vd) => {
      log.push(`logout ${vd}`)
      sessions[vd] = { member: false, profileGuid: null }
    },
    pickProfile: async (vd) => {
      log.push(`profile ${vd}`)
      sessions[vd] = { ...sessions[vd], profileGuid: 'p1' }
      return 'p1'
    },
    approveTv: async (by, c, guid) => {
      log.push(`approve ${by} ${c} ${guid}`)
      if (c === code) approved = true
    },
    open: (f, route) => {
      log.push(`open ${f} ${route}`)
      if (f === 'tv') routes.tv = sessions.tv.member ? (sessions.tv.profileGuid ? '/tv' : '/tv/profiller') : '/tv/giris'
      else routes[f] = route
      playing = { ...playing, [f]: undefined }
    },
    go: (f, route) => {
      log.push(`go ${f} ${route}`)
      routes[f] = route
    },
    route: (f) => routes[f],
    text: (f, sel) => {
      if (f === 'tv' && sel === '.tv-login__code')
        return routes.tv === '/tv/giris' && opts.tvShowsCode !== false ? code : null
      if (f === 'telefon' && sel === APPROVE_SELECTOR) return routes.telefon?.startsWith('/bagla') ? 'Onayla' : null
      if (f === 'telefon' && sel === '.rm-target') return routes.telefon?.startsWith('/kumanda') ? 'Salon' : null
      if (f === 'web' && sel === '.app-header') return sessions.web.profileGuid ? '' : null
      if (f === 'web' && sel === CAST_SELECTOR) return routes.web?.startsWith('/izle') ? '' : null
      return null
    },
    click: (f, sel) => {
      log.push(`click ${f} ${sel}`)
      if (f === 'telefon' && sel === APPROVE_SELECTOR && routes.telefon?.startsWith('/bagla')) {
        approved = true
        routes.telefon = '/bagla'
        return true
      }
      if (f === 'web' && sel === CAST_SELECTOR) {
        routes.tv = `/tv/izle/${SINTEL}?konum=63`
        routes.web = '/goz-at'
        return true
      }
      return false
    },
    media: (f) => (playing[f] !== undefined ? { playing: true, time: playing[f]! } : null),
    sleep: async (ms) => {
      now += ms
      tick()
    },
    now: () => now,
  }
  // canlı kanal: telefon /kumanda?yansit= açınca TV kanala geçer
  const open = env.open
  env.open = (f, route) => {
    open(f, route)
    if (f === 'telefon' && route.includes(`yansit=${LIVE_CHANNEL}`)) routes.tv = `/tv/izle/${LIVE_CHANNEL}`
  }
  return { env, log, sessions, routes, approve: () => (approved = true) }
}

const collect = () => {
  const views: RunView[] = []
  return { views, on: (v: RunView) => views.push(v) }
}

describe('vitrin senaryoları', () => {
  it('1 · QR ile giriş, benim yerime onayla: tüm adımlar biter, TV açılır', async () => {
    const w = world()
    const c = collect()
    const v = await runScenario('qr', w.env, { autoApprove: true }, c.on)
    expect(v.status).toBe('done')
    expect(v.steps.every((s) => s.status === 'done')).toBe(true)
    expect(w.log).toContain('login telefon')
    expect(w.log).toContain('open telefon /bagla?kod=KLMN-4825')
    expect(w.log).toContain(`click telefon ${APPROVE_SELECTOR}`)
    expect(w.routes.tv).toBe('/tv')
    expect(v.steps.find((s) => s.id === 'tvlogin')?.note).toContain('KLMN-4825')
  })

  it('1 · izleyici onaylayana kadar adım "bekliyor" durumunda kalır', async () => {
    const w = world()
    const c = collect()
    let sleeps = 0
    const sleep = w.env.sleep
    w.env.sleep = async (ms) => {
      if (++sleeps === 40) w.approve()
      await sleep(ms)
    }
    const v = await runScenario('qr', w.env, { autoApprove: false }, c.on)
    expect(c.views.some((x) => x.steps.some((s) => s.id === 'approve' && s.status === 'waiting'))).toBe(true)
    expect(v.status).toBe('done')
    expect(w.log.some((l) => l.startsWith('click'))).toBe(false)
  })

  it('1 · TV zaten girişliyse önce oturumu kapatılır', async () => {
    const w = world({ tvMember: true })
    w.routes.tv = '/tv'
    const v = await runScenario('qr', w.env, { autoApprove: true }, () => {})
    expect(w.log.indexOf('logout tv')).toBeGreaterThan(-1)
    expect(v.status).toBe('done')
  })

  it('kod okunamazsa sakin hata ile biter', async () => {
    const w = world({ tvShowsCode: false })
    const v = await runScenario('qr', w.env, { autoApprove: true }, () => {})
    expect(v.status).toBe('failed')
    expect(v.message).toBe('TV kodu okunamadı.')
    expect(v.steps.find((s) => s.id === 'tvlogin')?.status).toBe('failed')
  })

  it('2 · kumanda: TV telefonun onayıyla açılır, telefon profil seçip /kumanda açar', async () => {
    const w = world()
    const v = await runScenario('remote', w.env, { autoApprove: false }, () => {})
    expect(v.status).toBe('done')
    expect(w.log).toContain('approve telefon KLMN-4825 p1')
    expect(w.log).toContain('profile telefon')
    expect(w.log).toContain('open telefon /kumanda')
  })

  it('3 · yansıtma: web Sintel oynatır, düğmeye basılır, TV oynatır', async () => {
    const w = world({ tvMember: true })
    w.routes.tv = '/tv'
    const v = await runScenario('cast', w.env, { autoApprove: false }, () => {})
    expect(v.status).toBe('done')
    expect(w.log).toContain(`go web /izle/${SINTEL}?konum=60`)
    expect(w.log).toContain(`click web ${CAST_SELECTOR}`)
    expect(w.routes.tv).toContain(`/tv/izle/${SINTEL}`)
  })

  it('4 · canlı: telefon yansit bağlantısını açar, TV kanala geçer', async () => {
    const w = world({ tvMember: true })
    w.routes.tv = '/tv'
    const v = await runScenario('live', w.env, { autoApprove: false }, () => {})
    expect(v.status).toBe('done')
    expect(w.log).toContain(`open telefon /kumanda?yansit=${LIVE_CHANNEL}`)
  })

  it('sıfırla: üç oturum kapanır, TV giriş ekranına döner', async () => {
    const w = world({ tvMember: true })
    w.routes.tv = '/tv'
    const v = await runScenario('reset', w.env, { autoApprove: false }, () => {})
    expect(v.status).toBe('done')
    expect(w.log.filter((l) => l.startsWith('logout'))).toEqual(['logout tv', 'logout web', 'logout telefon'])
  })

  it('iptal edilince "cancelled" ile biter ve sonraki adımlara geçmez', async () => {
    const w = world()
    const signal = { cancelled: false }
    let sleeps = 0
    const sleep = w.env.sleep
    w.env.sleep = async (ms) => {
      if (++sleeps === 3) signal.cancelled = true
      await sleep(ms)
    }
    const v = await runScenario('qr', w.env, { autoApprove: false }, () => {}, signal)
    expect(v.status).toBe('cancelled')
    expect(w.log.some((l) => l.startsWith('click'))).toBe(false)
  })
})
