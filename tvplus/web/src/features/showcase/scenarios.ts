/**
 * Cihaz vitrini senaryoları: üç çerçeveyi (TV, web, telefon) ve API'yi kullanarak demoyu adım adım yürütür.
 * Saf mantık: ortam (`ShowcaseEnv`) dışarıdan verilir; birim testleri sahte ortamla çalışır (scenarios.test.ts).
 *
 *   1 · TV'de QR ile giriş     telefon girişi → TV giriş ekranı → kod okunur → telefonda /bagla?kod= → Onayla
 *                               (izleyici basar ya da "benim yerime onayla") → TV kendiliğinden açılır
 *   2 · Telefonu kumanda yap   TV hazır → telefon profil + /kumanda
 *   3 · TV'ye yansıt           TV hazır → web'de Sintel → oynatıcının "TV'de İzle" düğmesi → TV oynatır
 *   4 · Canlı yayını yansıt    TV hazır → telefon /kumanda?yansit=Channel:1 → TV kanalı açar
 *   Sıfırla                     üç sanal cihazın oturumu kapanır, çerçeveler baştan açılır
 */

export type FrameId = 'tv' | 'web' | 'telefon'

export interface FrameMedia {
  playing: boolean
  time: number
}

export interface ShowcaseEnv {
  /** Sanal cihazın oturumu (GET /api/boot, x-tvplus-vd) */
  session(vd: FrameId): Promise<{ member: boolean; profileGuid: string | null }>
  login(vd: FrameId): Promise<void>
  logout(vd: FrameId): Promise<void>
  /** Kilitsiz ilk profile geçer; profil guid'i döner */
  pickProfile(vd: FrameId): Promise<string>
  /** `by` cihazının oturumuyla TV kodunu onaylar */
  approveTv(by: FrameId, userCode: string, profileGuid: string | null): Promise<void>
  /** Çerçeveyi bu yolla baştan yükler (oturum değişince gerekir) */
  open(frame: FrameId, route: string): void
  /** Aynı belgede yol değiştirir (hash) */
  go(frame: FrameId, route: string): void
  /** Çerçevenin hash yolu ('/tv/giris'); okunamıyorsa null */
  route(frame: FrameId): string | null
  /** Seçicideki öğenin metni; yoksa null */
  text(frame: FrameId, selector: string): string | null
  /** Seçicideki öğeye tıklar; bulunduysa true */
  click(frame: FrameId, selector: string): boolean
  /** Çerçevedeki ilk <video> */
  media(frame: FrameId): FrameMedia | null
  sleep(ms: number): Promise<void>
  now(): number
}

export type StepStatus = 'pending' | 'running' | 'waiting' | 'done' | 'failed'

export interface StepView {
  id: string
  label: string
  status: StepStatus
  /** Kısa açıklama (bekleme talimatı, okunan kod, hata) */
  note: string | null
}

export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled'

export interface RunView {
  scenario: ScenarioId
  status: RunStatus
  steps: StepView[]
  /** Bittiğinde izleyiciye ne yapacağı */
  message: string | null
}

export type ScenarioId = 'qr' | 'remote' | 'cast' | 'live' | 'reset'

export interface RunOptions {
  /** 1. senaryoda Onayla'ya izleyici yerine bas */
  autoApprove: boolean
}

export class ScenarioError extends Error {}
export class Cancelled extends Error {}

/* ───────────── yürütücü ───────────── */

interface Ctx {
  env: ShowcaseEnv
  opts: RunOptions
  /** Adım notu (bekleme talimatı vb.) */
  note: (text: string | null) => void
  /** Kullanıcıdan eylem bekleniyor (sarı) */
  waiting: (text: string) => void
  /** Koşul gerçekleşene kadar yoklar; süre dolarsa `failText` ile hata */
  waitFor: <T>(probe: () => T | null | false | undefined, timeoutMs: number, failText: string) => Promise<T>
  code: string | null
}

interface StepDef {
  id: string
  label: string
  run: (ctx: Ctx) => Promise<void>
}

interface ScenarioDef {
  id: ScenarioId
  steps: StepDef[]
  /** Bittiğinde gösterilen yönerge */
  done: string
}

export const POLL_MS = 250
export const TV_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/
export const SINTEL = 'Video:80010001'
export const LIVE_CHANNEL = 'Channel:1'
export const APPROVE_SELECTOR = '[data-pair="approve"]'
export const CAST_SELECTOR = 'button[aria-label="TV\'de İzle"]'

const isLogin = (r: string | null) => !!r && r.startsWith('/tv/giris')
const isTvReady = (r: string | null) => !!r && r.startsWith('/tv') && !isLogin(r) && !r.startsWith('/tv/profiller')

/** Telefon / web: oturum + profil (gerekirse giriş ve profil seçimi). Değişiklik olduysa true. */
async function ensureMemberWithProfile(env: ShowcaseEnv, vd: FrameId): Promise<boolean> {
  let s = await env.session(vd)
  let changed = false
  if (!s.member) {
    await env.login(vd)
    changed = true
    s = await env.session(vd)
  }
  if (!s.profileGuid) {
    await env.pickProfile(vd)
    changed = true
  }
  return changed
}

/** TV giriş ekranında görünen kodu okur (gerekirse giriş ekranını açar). */
async function readTvCode(ctx: Ctx): Promise<string> {
  const { env } = ctx
  if (!isLogin(env.route('tv'))) env.open('tv', '/tv')
  await ctx.waitFor(() => isLogin(env.route('tv')), 20_000, 'TV giriş ekranı açılmadı.')
  return ctx.waitFor(
    () => {
      const t = env.text('tv', '.tv-login__code')?.trim() ?? ''
      return TV_CODE_RE.test(t) ? t : null
    },
    20_000,
    'TV kodu okunamadı.',
  )
}

/** TV oturum açmış, profil seçili ve ana ekranlarda değilse hazırlar (telefonun onayıyla). */
const tvReadyStep: StepDef = {
  id: 'tv',
  label: 'TV hazırlanıyor',
  async run(ctx) {
    const { env } = ctx
    const s = await env.session('tv')
    if (s.member && s.profileGuid) {
      if (!isTvReady(env.route('tv'))) env.open('tv', '/tv')
      await ctx.waitFor(() => isTvReady(env.route('tv')), 20_000, 'TV ana ekranı açılmadı.')
      ctx.note('TV oturumu açık')
      return
    }
    if (s.member) {
      await env.pickProfile('tv')
      env.open('tv', '/tv')
      await ctx.waitFor(() => isTvReady(env.route('tv')), 20_000, 'TV ana ekranı açılmadı.')
      ctx.note('TV profili seçildi')
      return
    }
    ctx.note("TV'nin kodu okunuyor")
    const code = await readTvCode(ctx)
    await ensureMemberWithProfile(env, 'telefon')
    const phone = await env.session('telefon')
    await env.approveTv('telefon', code, phone.profileGuid)
    ctx.note(`${code} telefondan onaylandı`)
    await ctx.waitFor(() => isTvReady(env.route('tv')), 25_000, 'TV oturumu açılmadı.')
  },
}

/* ───────────── senaryolar ───────────── */

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  qr: {
    id: 'qr',
    done: 'TV açıldı. Şimdi 2. adımla telefonu kumanda yapabilirsin.',
    steps: [
      {
        id: 'phone',
        label: 'Telefon hesaba giriyor',
        async run(ctx) {
          const s = await ctx.env.session('telefon')
          if (!s.member) await ctx.env.login('telefon')
          ctx.note(s.member ? 'Telefon zaten girişli' : 'Demo hesabıyla giriş yapıldı')
        },
      },
      {
        id: 'tvlogin',
        label: 'TV giriş ekranı',
        async run(ctx) {
          const { env } = ctx
          const s = await env.session('tv')
          if (s.member) {
            await env.logout('tv')
            env.open('tv', '/tv')
          }
          ctx.code = await readTvCode(ctx)
          ctx.note(`TV'deki kod: ${ctx.code}`)
        },
      },
      {
        id: 'open',
        label: 'Telefon QR adresini açıyor',
        async run(ctx) {
          const { env } = ctx
          env.open('telefon', `/bagla?kod=${ctx.code ?? ''}`)
          await ctx.waitFor(() => env.text('telefon', APPROVE_SELECTOR) !== null, 20_000, 'Onay ekranı açılmadı.')
          ctx.note('/bagla?kod=… açıldı')
        },
      },
      {
        id: 'approve',
        label: 'Telefonda onay',
        async run(ctx) {
          const { env } = ctx
          if (ctx.opts.autoApprove) {
            await env.sleep(900)
            if (!env.click('telefon', APPROVE_SELECTOR)) throw new ScenarioError('Onayla düğmesi bulunamadı.')
            ctx.note("Senin yerine Onayla'ya basıldı")
            return
          }
          ctx.waiting("Telefon çerçevesinde Onayla'ya bas.")
          await ctx.waitFor(
            () => !isLogin(env.route('tv')) || env.text('telefon', APPROVE_SELECTOR) === null,
            5 * 60_000,
            'Onay gelmedi. Senaryoyu yeniden başlatabilirsin.',
          )
          ctx.note('Onaylandı')
        },
      },
      {
        id: 'tvopen',
        label: 'TV kendiliğinden açılıyor',
        async run(ctx) {
          const { env } = ctx
          const r = await ctx.waitFor(
            () => {
              const route = env.route('tv')
              return route && !isLogin(route) ? route : null
            },
            25_000,
            'TV açılmadı. Reddedildiyse senaryoyu yeniden başlat.',
          )
          ctx.note(r.startsWith('/tv/profiller') ? 'TV profil seçiminde' : 'TV ana sayfada')
        },
      },
    ],
  },

  remote: {
    id: 'remote',
    done: "Telefondaki pede dokun ya da kaydır: TV'de odak hareket eder. Kaydırıp tutunca hızlı geçer.",
    steps: [
      tvReadyStep,
      {
        id: 'phone',
        label: 'Telefon kumandaya geçiyor',
        async run(ctx) {
          const { env } = ctx
          await ensureMemberWithProfile(env, 'telefon')
          env.open('telefon', '/kumanda')
          await ctx.waitFor(() => env.text('telefon', '.rm-target') !== null, 20_000, 'Kumanda açılmadı.')
          ctx.note('Kumanda hazır')
        },
      },
    ],
  },

  cast: {
    id: 'cast',
    done: "TV oynatıyor. Web'deki 'Şu an TV'de' kartıyla ya da telefondaki kumandayla duraklat, sar; 'Bu Cihazda Devam Et' ile geri al.",
    steps: [
      tvReadyStep,
      {
        id: 'web',
        label: 'Web oturumu',
        async run(ctx) {
          const { env } = ctx
          const changed = await ensureMemberWithProfile(env, 'web')
          const r = env.route('web')
          // Yansıtma işleyicisi kabukla yüklenir: önce bir kabuk sayfası açılır.
          if (changed || !r || r.startsWith('/izle') || r.startsWith('/karsilama') || r.startsWith('/profiller'))
            env.open('web', '/goz-at')
          await ctx.waitFor(() => env.text('web', '.app-header') !== null, 20_000, 'Web açılmadı.')
          ctx.note('Web hazır')
        },
      },
      {
        id: 'play',
        label: "Web'de Sintel başlıyor",
        async run(ctx) {
          const { env } = ctx
          env.go('web', `/izle/${SINTEL}?konum=60`)
          await ctx.waitFor(
            () => {
              const m = env.media('web')
              return m && m.playing && m.time > 60.5 ? m : null
            },
            30_000,
            'Sintel web çerçevesinde başlamadı.',
          )
          await env.sleep(2500)
          ctx.note(`Web'de ${Math.floor(env.media('web')?.time ?? 0)}. saniyede`)
        },
      },
      {
        id: 'cast',
        label: "TV'de İzle",
        async run(ctx) {
          const { env } = ctx
          await ctx.waitFor(() => env.text('web', CAST_SELECTOR) !== null, 15_000, "TV'de İzle düğmesi görünmedi.")
          env.click('web', CAST_SELECTOR)
          // Birden çok TV varsa seçici açılır: ilk çevrimiçi TV
          await env.sleep(400)
          env.click('web', '.dv-choice:not(:disabled)')
          await ctx.waitFor(
            () => (env.route('tv') ?? '').startsWith(`/tv/izle/${SINTEL}`),
            15_000,
            'TV yansıtmayı açmadı.',
          )
          ctx.note("Komut TV'ye ulaştı")
        },
      },
      {
        id: 'tvplay',
        label: 'TV kaldığı yerden oynatıyor',
        async run(ctx) {
          const { env } = ctx
          const m = await ctx.waitFor(
            () => {
              const v = env.media('tv')
              return v && v.playing ? v : null
            },
            30_000,
            'TV oynatmaya başlamadı.',
          )
          ctx.note(`TV ${Math.floor(m.time)}. saniyede`)
        },
      },
    ],
  },

  live: {
    id: 'live',
    done: "Kanal TV'de açık. Telefonda Kanal + ile kanal değiştir, Rakamlar ile numara gir.",
    steps: [
      tvReadyStep,
      {
        id: 'phonecast',
        label: 'Telefon kanalı yansıtıyor',
        async run(ctx) {
          const { env } = ctx
          await ensureMemberWithProfile(env, 'telefon')
          env.open('telefon', `/kumanda?yansit=${LIVE_CHANNEL}`)
          await ctx.waitFor(
            () => (env.route('tv') ?? '').startsWith(`/tv/izle/${LIVE_CHANNEL}`),
            20_000,
            'TV kanalı açmadı.',
          )
          ctx.note("Kanal 1 TV'de açılıyor")
        },
      },
      {
        id: 'tvplay',
        label: 'TV canlı yayında',
        async run(ctx) {
          const { env } = ctx
          await ctx.waitFor(
            () => {
              const v = env.media('tv')
              return v && v.playing ? v : null
            },
            30_000,
            'Canlı yayın başlamadı.',
          )
          ctx.note('Canlı yayın oynuyor')
        },
      },
    ],
  },

  reset: {
    id: 'reset',
    done: 'Üç cihazın oturumu kapandı. 1. adımla baştan başlayabilirsin.',
    steps: [
      {
        id: 'logout',
        label: 'Oturumlar kapanıyor',
        async run(ctx) {
          const { env } = ctx
          for (const vd of ['tv', 'web', 'telefon'] as const) await env.logout(vd)
          env.open('tv', '/tv')
          env.open('web', '/')
          env.open('telefon', '/')
          await ctx.waitFor(() => isLogin(env.route('tv')), 20_000, 'TV giriş ekranına dönmedi.')
          ctx.note('TV giriş ekranında')
        },
      },
    ],
  },
}

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  qr: "1 · TV'de QR ile giriş",
  remote: '2 · Telefonu kumanda yap',
  cast: "3 · TV'ye yansıt",
  live: '4 · Canlı yayını yansıt',
  reset: 'Sıfırla',
}

/**
 * Senaryoyu yürütür; her durum değişikliğinde `onUpdate` yeni bir RunView alır. `signal` iptal eder.
 * Hata fırlatmaz: sonuç RunView.status'tadır.
 */
export async function runScenario(
  id: ScenarioId,
  env: ShowcaseEnv,
  opts: RunOptions,
  onUpdate: (v: RunView) => void,
  signal?: { cancelled: boolean },
): Promise<RunView> {
  const def = SCENARIOS[id]
  let view: RunView = {
    scenario: id,
    status: 'running',
    steps: def.steps.map((s) => ({ id: s.id, label: s.label, status: 'pending', note: null })),
    message: null,
  }
  const emit = (patch: Partial<RunView>) => {
    view = { ...view, ...patch }
    onUpdate(view)
  }
  const patchStep = (i: number, p: Partial<StepView>) => {
    emit({ steps: view.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  }
  const check = () => {
    if (signal?.cancelled) throw new Cancelled()
  }
  emit({})

  let current = 0
  const ctx: Ctx = {
    env,
    opts,
    code: null,
    note: (text) => patchStep(current, { note: text }),
    waiting: (text) => patchStep(current, { status: 'waiting', note: text }),
    async waitFor(probe, timeoutMs, failText) {
      const start = env.now()
      for (;;) {
        check()
        let v: ReturnType<typeof probe>
        try {
          v = probe()
        } catch {
          v = null
        }
        if (v !== null && v !== undefined && v !== false) return v as NonNullable<typeof v>
        if (env.now() - start >= timeoutMs) throw new ScenarioError(failText)
        await env.sleep(POLL_MS)
      }
    },
  }

  try {
    for (let i = 0; i < def.steps.length; i++) {
      check()
      current = i
      patchStep(i, { status: 'running' })
      await def.steps[i]!.run(ctx)
      check()
      patchStep(i, { status: 'done' })
    }
    emit({ status: 'done', message: def.done })
  } catch (err) {
    if (err instanceof Cancelled) {
      patchStep(current, { status: 'pending' })
      emit({ status: 'cancelled', message: null })
    } else {
      const text = err instanceof ScenarioError ? err.message : 'Beklenmedik bir sorun oldu. Tekrar dene.'
      patchStep(current, { status: 'failed', note: text })
      emit({ status: 'failed', message: text })
    }
  }
  return view
}
