/**
 * FTL ağ yoklaması (Netflix /api/ftl/probe). Yanıttaki her darbe anında tüm hedefler paralel yarışır;
 * ilk bayta kadar geçen süre, toplam süre, bayt ve kbps ölçülür, darbe sonucu `report` adresine yollanır.
 * Sıralama (en hızlı CDN başta) manifest isteğinde `cdnHints` olarak gider.
 */
import { ROUTES } from '../../../../shared/constants'
import type { FtlProbeResponse, FtlProbeTarget, FtlReport } from '../../../../shared/playback'
import { sessionHeaders } from '../../api/session'
import { devbus } from '../../lib/devbus'
import { logEvent } from '../../telemetry/logger'
import { FtlRanking, pulseWinner, type FtlResult } from './ftlRanking'

const ranking = new FtlRanking()
const TARGET_TIMEOUT_MS = 8000
let started = false
let iter = 0
let generation = 0
let timers: number[] = []
let reprobeTimer: number | null = null

/** Manifest isteği için CDN sıralaması (en hızlı başta). Yoklama yapılmadıysa boş dizi. */
export function cdnRanking(): string[] {
  return ranking.ranking()
}

/** FTL ölçümüne göre en iyi düğümün hızı; ABR'nin ilk tahmini için ipucu. */
export function ftlBestKbps(): number | null {
  return ranking.bestKbps()
}

export function ftlSnapshot(): ReturnType<FtlRanking['snapshot']> {
  return ranking.snapshot()
}

function isAnycast(name: string): boolean {
  return /anycast/i.test(name)
}

async function measure(target: FtlProbeTarget): Promise<FtlResult> {
  const t0 = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TARGET_TIMEOUT_MS)
  try {
    const res = await fetch(target.url, { cache: 'no-store', credentials: 'same-origin', signal: ctrl.signal })
    const ttfbMs = performance.now() - t0
    const buf = await res.arrayBuffer()
    const totalMs = performance.now() - t0
    const bytes = buf.byteLength
    return {
      name: target.name,
      cdnId: target.cdnId,
      ok: res.ok,
      ttfbMs: Math.round(ttfbMs),
      totalMs: Math.round(totalMs),
      bytes,
      kbps: totalMs > 0 ? Math.round((bytes * 8) / totalMs) : 0,
    }
  } catch {
    const totalMs = performance.now() - t0
    return { name: target.name, cdnId: target.cdnId, ok: false, ttfbMs: 0, totalMs: Math.round(totalMs), bytes: 0, kbps: 0 }
  } finally {
    clearTimeout(timer)
  }
}

async function runPulse(probe: FtlProbeResponse, it: number, pulse: number, gen: number): Promise<void> {
  if (gen !== generation) return
  const t0 = performance.now()
  const results = await Promise.all(probe.urls.map(measure))
  if (gen !== generation) return
  // anycast bir manifest CDN'i değildir: ölçülür ve raporlanır ama sıralamaya (cdnHints) girmez
  ranking.record(results.filter((r) => !isAnycast(r.name)))
  const winner = pulseWinner(results)
  devbus.emit(
    'ftl',
    `darbe ${pulse + 1}`,
    {
      iter: it,
      pulse,
      results: results.map((r) => ({ name: r.name, cdnId: r.cdnId, ok: r.ok, ttfbMs: r.ttfbMs, totalMs: r.totalMs, kbps: r.kbps })),
      winner: winner?.cdnId ?? null,
      ranking: ranking.ranking(),
    },
    { ms: performance.now() - t0, ok: !!winner },
  )
  logEvent('ftl.result', { iter: it, pulse, winner: winner?.cdnId ?? null, ranking: ranking.ranking(), results })
  const report: FtlReport = { iter: it, pulse, results }
  try {
    await fetch(probe.report || ROUTES.FTL_REPORT, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'content-type': 'application/json', ...sessionHeaders() },
      body: JSON.stringify(report),
    })
  } catch {
    /* rapor gönderilemezse ölçüm yine de kullanılır */
  }
}

async function probeOnce(): Promise<void> {
  const gen = ++generation
  for (const t of timers) clearTimeout(t)
  timers = []
  const it = iter++
  const t0 = performance.now()
  let probe: FtlProbeResponse
  try {
    const res = await fetch(`${ROUTES.FTL_PROBE}?monotonic=false&device=web&iter=${it}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...sessionHeaders() },
    })
    if (!res.ok) throw new Error(`durum ${res.status}`)
    probe = (await res.json()) as FtlProbeResponse
  } catch (err) {
    devbus.emit('ftl', 'yoklama alınamadı', { iter: it, error: String(err) }, { ms: performance.now() - t0, ok: false })
    return
  }
  if (gen !== generation) return
  devbus.emit('ftl', 'yoklama', { iter: it, targets: probe.urls.map((u) => u.name), pulse_delays: probe.pulse_delays, ctx: probe.ctx }, { ms: performance.now() - t0 })
  const delays = probe.pulse_delays.slice(0, probe.pulses || probe.pulse_delays.length)
  delays.forEach((delay, pulse) => {
    // Gecikmeler yoklamanın başından itibaren ölçülür: [0, 2000, 70000]
    const id = window.setTimeout(() => void runPulse(probe, it, pulse, gen), delay)
    timers.push(id)
  })
}

function scheduleReprobe(reason: string): void {
  if (reprobeTimer !== null) clearTimeout(reprobeTimer)
  reprobeTimer = window.setTimeout(() => {
    reprobeTimer = null
    devbus.emit('ftl', 'yeniden yoklama', { reason })
    void probeOnce()
  }, 1000)
}

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string
}

/** Yoklamayı başlatır; tekrar çağrılırsa bir şey yapmaz. Bağlantı değişince / çevrimiçi olunca yeniden yoklar. */
export function startNetworkProbing(): void {
  if (started || typeof window === 'undefined') return
  started = true
  void probeOnce()
  window.addEventListener('online', () => scheduleReprobe('çevrimiçi oldu'))
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
  conn?.addEventListener('change', () => scheduleReprobe(`bağlantı değişti (${conn.effectiveType ?? '?'})`))
}
