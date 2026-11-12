// Aşama 6 — Otomasyonlar (cron): at / every / cron zamanlamaları, yalıtılmış koşu oturumu ve kanala teslim.
//
// Gerçek karşılığı: src/cron/ (service.ts, schedule.ts, isolated-agent.ts, delivery.ts, store/),
// docs/automation/cron-jobs/*.md. Gerçekte işler Gateway SÜRECİNİN içinde koşar ve SQLite'ta kalıcıdır;
// yalıtılmış koşunun oturum anahtarı agent:<agentId>:cron:<jobId>:run:<runId> biçimindedir.
// Eski "heartbeat" izleyicisi artık sıradan bir otomasyon işidir (docs/gateway/heartbeat.md); bu mini
// sürümde de heartbeat, HEARTBEAT_OK cevabı sessiz sayılan periyodik bir iştir.

import { randomUUID } from 'node:crypto'

const FIELDS = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
]

function parseField(expr, [min, max]) {
  const values = new Set()
  for (const part of expr.split(',')) {
    const [range, stepText] = part.split('/')
    if (range === '') throw new Error(`geçersiz cron alanı: ${expr}`)
    const step = stepText === undefined ? 1 : Number(stepText)
    let [lo, hi] = range === '*' ? [min, max] : range.split('-').map(Number)
    if (hi === undefined) hi = stepText === undefined ? lo : max
    if (![lo, hi, step].every(Number.isInteger) || step < 1 || lo < min || hi > max || lo > hi) {
      throw new Error(`geçersiz cron alanı: ${part}`)
    }
    for (let v = lo; v <= hi; v += step) values.add(v)
  }
  return values
}

/** 5 alanlı cron: dakika saat gün ay hafta-günü. Saatler UTC'de değerlendirilir (testler deterministik olsun). */
export function parseCron(expr) {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`cron ifadesi 5 alan içermeli: ${expr}`)
  const [minute, hour, day, month, weekday] = parts.map((p, i) => parseField(p, FIELDS[i]))
  return { minute, hour, day, month, weekday, dayRestricted: parts[2] !== '*', weekdayRestricted: parts[4] !== '*' }
}

function cronMatches(c, d) {
  if (!c.minute.has(d.getUTCMinutes()) || !c.hour.has(d.getUTCHours()) || !c.month.has(d.getUTCMonth() + 1))
    return false
  const dayOk = c.day.has(d.getUTCDate())
  const weekdayOk = c.weekday.has(d.getUTCDay())
  return c.dayRestricted && c.weekdayRestricted ? dayOk || weekdayOk : dayOk && weekdayOk
}

const DURATION = /^(\d+)\s*(s|m|h|d)$/
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }

export function parseDuration(text) {
  const m = DURATION.exec(String(text).trim())
  if (!m) throw new Error(`süre anlaşılmadı: ${text} (örn. 30m, 1h, 1d)`)
  return Number(m[1]) * UNIT_MS[m[2]]
}

/**
 * @param {{kind: 'at', at: string} | {kind: 'every', every: string, anchorMs?: number} | {kind: 'cron', expr: string}} schedule
 * @param {number} afterMs bu andan SONRAKİ ilk çalışma (ms); hiç yoksa null
 */
export function computeNextRun(schedule, afterMs) {
  if (schedule.kind === 'at') {
    const at = Date.parse(schedule.at)
    if (Number.isNaN(at)) throw new Error(`geçersiz tarih: ${schedule.at}`)
    return at > afterMs ? at : null
  }
  if (schedule.kind === 'every') {
    const every = parseDuration(schedule.every)
    const anchor = schedule.anchorMs ?? afterMs
    return anchor + (Math.floor((afterMs - anchor) / every) + 1) * every // sabit ızgara: kayma birikmez
  }
  const c = parseCron(schedule.expr)
  let t = Math.floor(afterMs / 60_000) * 60_000 + 60_000
  for (let i = 0; i < 366 * 24 * 60; i++, t += 60_000) if (cronMatches(c, new Date(t))) return t
  return null
}

export class CronService {
  /**
   * @param {{runtime: any, deliver: (target: any, text: string) => Promise<any>, now?: () => number}} options
   */
  constructor({ runtime, deliver, now = Date.now }) {
    this.runtime = runtime
    this.deliver = deliver
    this.now = now
    /** @type {Map<string, any>} */
    this.jobs = new Map()
    this.history = []
  }

  /**
   * @param {{name: string, agentId?: string, schedule: any, message: string, delivery?: {channel: string, to: string},
   *          deleteAfterRun?: boolean}} spec
   */
  add(spec) {
    const now = this.now()
    const schedule = spec.schedule.kind === 'every' ? { anchorMs: now, ...spec.schedule } : spec.schedule
    const nextRunAt = computeNextRun(schedule, now)
    if (nextRunAt === null) throw new Error('bu zamanlama bir daha hiç çalışmaz')
    const job = {
      id: randomUUID().slice(0, 8),
      agentId: spec.agentId ?? 'main',
      enabled: true,
      deleteAfterRun: spec.deleteAfterRun ?? schedule.kind === 'at', // tek seferlik iş başarıyla bitince silinir
      ...spec,
      schedule,
      nextRunAt,
    }
    this.jobs.set(job.id, job)
    return job
  }

  list() {
    return [...this.jobs.values()].sort((a, b) => a.nextRunAt - b.nextRunAt)
  }

  remove(id) {
    return this.jobs.delete(id)
  }

  /** Zamanı gelen işleri koştur. Önce sonraki zamanı yaz (en fazla bir kez), sonra çalıştır ve teslim et. */
  async tick() {
    const now = this.now()
    const due = this.list().filter((j) => j.enabled && j.nextRunAt <= now)
    for (const job of due) {
      job.nextRunAt = computeNextRun(job.schedule, now) ?? Infinity
      job.enabled = job.nextRunAt !== Infinity
    }
    const results = []
    for (const job of due) results.push(await this.#runJob(job, now))
    return results
  }

  async #runJob(job, now) {
    const runId = randomUUID().slice(0, 8)
    const sessionKey = `agent:${job.agentId}:cron:${job.id}:run:${runId}` // her koşu taze, yalıtılmış oturum
    const record = { jobId: job.id, runId, sessionKey, at: now, status: 'ok', delivered: false, text: '' }
    try {
      const result = await this.runtime.runTurn({ agentId: job.agentId, sessionKey, text: job.message })
      record.text = result.text
      if (job.delivery && !result.silent) {
        await this.deliver(job.delivery, result.text)
        record.delivered = true
      }
      if (job.deleteAfterRun && !job.enabled) this.jobs.delete(job.id)
    } catch (err) {
      record.status = 'error'
      record.text = err.message
    }
    this.history.push(record)
    return record
  }
}
