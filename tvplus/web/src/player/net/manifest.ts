/**
 * Lisanslı manifest (Netflix licensedManifest): MSL zarfıyla
 *   POST /msl/v1/playapi/licensedManifest?reqName=[prefetch/]licensedManifest&mainContentViewableId=…&clienttype=anka&browsername=…&browserversion=…
 * İstemci yeteneklerini (profiller, MSE, CDN sıralaması, arayüz dili) bildirir. Yanıt `expiration` anına kadar önbellekte tutulur;
 * vitrin ön hazırlığı (prefetch) aynı önbelleği ısıtır.
 */
import { CLIENT, ROUTES } from '../../../../shared/constants'
import type { LicensedManifest, ManifestError, ManifestRequest } from '../../../../shared/playback'
import { devbus } from '../../lib/devbus'
import { browserInfo, supportedProfiles, supportsMse } from './capabilities'
import { cdnRanking } from './ftl'
import { canReuseForPlay, ManifestCache, manifestKey, type ManifestKeyOptions } from './manifestCache'
import { MslError, msl } from './msl'

export interface ManifestOptions extends ManifestKeyOptions {
  /** Vitrin / komşu kanal ön hazırlığı */
  prefetch?: boolean
  /** Önbelleği atla (kaynak değişimi, program bitti) */
  fresh?: boolean
  signal?: AbortSignal
}

export type ManifestErrorCode = ManifestError['error']['code'] | 'NETWORK' | 'MSL'

export class ManifestRequestError extends Error {
  readonly code: ManifestErrorCode
  readonly access: ManifestError['error']['access'] | null
  constructor(code: ManifestErrorCode, message: string, access?: ManifestError['error']['access'] | null) {
    super(message)
    this.name = 'ManifestRequestError'
    this.code = code
    this.access = access ?? null
  }
}

const cache = new ManifestCache()

function isManifestError(v: unknown): v is ManifestError {
  return !!v && typeof v === 'object' && 'error' in v && !!(v as ManifestError).error?.code
}

function describe(m: LicensedManifest): Record<string, unknown> {
  const base = {
    kind: m.kind,
    prefetch: m.isPrefetch,
    manifestId: m.manifestId,
    expiration: m.expiration,
    live: m.live,
    alternatives: m.alternatives,
  }
  if (m.kind === 'STREAMS') {
    return {
      ...base,
      video: m.videoTracks.flatMap((t) =>
        t.streams.map((s) => ({
          streamId: s.streamId,
          bitrateKbps: s.bitrateKbps,
          width: s.width ?? null,
          height: s.height ?? null,
          profile: s.profile,
        })),
      ),
      audio: m.audioTracks.map((t) => ({ trackId: t.trackId, language: t.language, channels: t.channels })),
      text: m.timedTextTracks.map((t) => ({ trackId: t.trackId, language: t.language })),
      cdns: m.cdns.map((c) => ({ id: c.id, rank: c.rank })),
    }
  }
  if (m.kind === 'PROGRESSIVE')
    return {
      ...base,
      mimeType: m.mimeType,
      video: [],
      audio: [],
      text: m.timedTextTracks.map((t) => ({ trackId: t.trackId, language: t.language })),
      cdns: m.cdns.map((c) => ({ id: c.id, rank: c.rank })),
    }
  return {
    ...base,
    provider: m.provider,
    videoId: m.videoId,
    liveChannelId: m.liveChannelId,
    video: [],
    audio: [],
    text: [],
    cdns: [],
  }
}

async function fetchManifest(viewableId: string, o: ManifestOptions): Promise<LicensedManifest> {
  const prefetch = !!o.prefetch
  const req: ManifestRequest = {
    viewableId,
    prefetch,
    profiles: supportedProfiles(),
    supportsMse: supportsMse(),
    cdnHints: cdnRanking(),
    uiLanguage: 'tr',
  }
  if (o.promo) req.promo = true
  if (o.startOver) req.startOver = true
  if (o.preferredSource) req.preferredSource = o.preferredSource
  const b = browserInfo()
  const reqName = prefetch ? 'prefetch/licensedManifest' : 'licensedManifest'
  const t0 = performance.now()
  let payload: LicensedManifest | ManifestError
  try {
    payload = await msl.send<LicensedManifest | ManifestError>(
      ROUTES.MSL_MANIFEST,
      {
        reqName,
        mainContentViewableId: viewableId,
        clienttype: CLIENT.TYPE,
        browsername: b.name,
        browserversion: b.version,
      },
      req,
      reqName,
      o.signal,
    )
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    let mapped: ManifestRequestError
    if (err instanceof MslError && isManifestError(err.body)) {
      mapped = new ManifestRequestError(err.body.error.code, err.body.error.message, err.body.error.access)
    } else if (err instanceof MslError) {
      mapped = new ManifestRequestError('MSL', err.message)
    } else {
      mapped = new ManifestRequestError('NETWORK', 'Bağlantı kurulamadı')
    }
    devbus.emit(
      'manifest',
      viewableId,
      { prefetch, error: mapped.code, message: mapped.message },
      { ms: performance.now() - t0, ok: false },
    )
    throw mapped
  }
  if (isManifestError(payload)) {
    devbus.emit(
      'manifest',
      viewableId,
      { prefetch, error: payload.error.code, message: payload.error.message },
      { ms: performance.now() - t0, ok: false },
    )
    throw new ManifestRequestError(payload.error.code, payload.error.message, payload.error.access)
  }
  devbus.emit(
    'manifest',
    viewableId,
    { ...describe(payload), request: { profiles: req.profiles, cdnHints: req.cdnHints, promo: !!req.promo } },
    { ms: performance.now() - t0 },
  )
  return payload
}

/**
 * Manifest ister. Önbellekte taze bir kayıt varsa onu döndürür (gerçek oynatma, ön hazırlıkla alınmış
 * manifesti yer imi gerekmedikçe yeniden kullanır).
 */
export async function requestManifest(viewableId: string, opts: ManifestOptions = {}): Promise<LicensedManifest> {
  const key = manifestKey(viewableId, opts)
  const now = Date.now()
  if (!opts.fresh) {
    const hit = cache.get(key, now)
    if (hit && canReuseForPlay(hit.manifest, now)) {
      const label = !opts.prefetch && hit.manifest.isPrefetch ? 'manifest: ön hazırlıktan' : 'manifest: isabet'
      devbus.emit('cache', label, {
        key,
        expires: hit.manifest.expiration,
        ageMs: hit.ageMs,
        prefetched: hit.manifest.isPrefetch,
      })
      return hit.manifest
    }
    const pending = cache.pending(key)
    if (pending) {
      if (opts.prefetch) return pending
      // Uçuştaki isteği (ön hazırlık ya da eşzamanlı oynatma isteği) bekle; uygunsa onu kullan
      const m = await pending.catch(() => null)
      if (m && canReuseForPlay(m, Date.now())) {
        devbus.emit('cache', m.isPrefetch ? 'manifest: ön hazırlıktan' : 'manifest: uçuştaki istek paylaşıldı', {
          key,
          expires: m.expiration,
          prefetched: m.isPrefetch,
          inflight: true,
        })
        return m
      }
    }
    devbus.emit('cache', 'manifest: ıska', { key })
  }
  const p = fetchManifest(viewableId, opts).then((m) => {
    cache.set(key, m, Date.now())
    return m
  })
  return cache.track(key, p)
}

/** Ön hazırlık: önbelleği ısıtır, asla fırlatmaz. */
export async function prefetchManifest(viewableId: string, opts: ManifestKeyOptions = {}): Promise<void> {
  try {
    const key = manifestKey(viewableId, opts)
    if (cache.get(key, Date.now()) || cache.pending(key)) return
    devbus.emit('prefetch', 'manifest', { viewableId, promo: !!opts.promo })
    await requestManifest(viewableId, { ...opts, prefetch: true })
  } catch {
    /* ön hazırlık hatası sessizce yutulur; gerçek oynatma yeniden ister */
  }
}

/** Bir manifesti önbellekten düşürür (imzalı adres reddedildiğinde). */
export function forgetManifest(viewableId: string, opts: ManifestKeyOptions = {}): void {
  cache.delete(manifestKey(viewableId, opts))
}
