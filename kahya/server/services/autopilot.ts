// Otopilot: zamanlanmış işler. Her iş anahtarıyla job_runs tablosuna yazılır; aynı iş aynı dönemde iki kez çalışmaz.
// - İşlenmemiş gelen mesajları sınıflandır
// - Ayın ilk günü (ya da sonrasında ilk çalıştırmada) aidat tahakkuku
// - İsteğe bağlı: önceki ay sonu itibarıyla gecikme tazminatı tahakkuku
// - Günlük: geciken aidat hatırlatmaları (özerklik ayarına göre öneri ya da otomatik)
import { all, get, insert, type DB } from '../db/db.ts'
import { addMonths, dateInMonth, daysInMonth, monthOf, today as todayOf } from '../domain/dates.ts'
import type { Deps } from '../http.ts'
import { orgSettings } from './common.ts'
import { activeBudget, generateAccruals, postLateFees } from './finance.ts'
import { processMessage } from './inbox.ts'
import { runReminders } from './reminders.ts'

function once(db: DB, job: string, key: string): boolean {
  return !get<{ job: string }>(db, 'SELECT job FROM job_runs WHERE job = ? AND run_key = ?', job, key)
}
function mark(db: DB, job: string, key: string, result: unknown) {
  insert(db, 'job_runs', { job, run_key: key, result: JSON.stringify(result) })
}

export type AutopilotSummary = {
  orgs: number
  triaged: number
  accruals: number
  lateFees: number
  reminders: number
  errors: string[]
}

export async function runAutopilot(deps: Deps, opts: { orgId?: number } = {}): Promise<AutopilotSummary> {
  const { db } = deps
  const today = todayOf(deps.now())
  const month = monthOf(today)
  const prevMonth = addMonths(month, -1)
  const summary: AutopilotSummary = { orgs: 0, triaged: 0, accruals: 0, lateFees: 0, reminders: 0, errors: [] }
  const orgs = all<{ id: number }>(
    db,
    opts.orgId ? 'SELECT id FROM orgs WHERE id = ?' : 'SELECT id FROM orgs',
    ...(opts.orgId ? [opts.orgId] : []),
  )
  for (const org of orgs) {
    summary.orgs++
    const settings = orgSettings(db, org.id)
    const pending = all<{ id: number }>(
      db,
      `SELECT id FROM messages WHERE org_id = ? AND direction = 'gelen' AND status = 'yeni' AND triage IS NULL ORDER BY id LIMIT 50`,
      org.id,
    )
    for (const m of pending) {
      try {
        await processMessage(deps, m.id)
        summary.triaged++
      } catch (e) {
        summary.errors.push(`Mesaj #${m.id}: ${(e as Error).message}`)
      }
    }
    const sites = all<{ id: number }>(db, 'SELECT id FROM sites WHERE org_id = ?', org.id)
    for (const site of sites) {
      if (settings.autoAccrual && once(db, 'tahakkuk', `${site.id}:${month}`) && activeBudget(db, site.id, month)) {
        try {
          const r = generateAccruals(db, { siteId: site.id, month, orgId: org.id })
          mark(db, 'tahakkuk', `${site.id}:${month}`, r)
          summary.accruals += r.created
        } catch (e) {
          summary.errors.push(`Tahakkuk (site ${site.id}): ${(e as Error).message}`)
        }
      }
      if (settings.autoLateFee && once(db, 'gecikme', `${site.id}:${prevMonth}`)) {
        const asOf = dateInMonth(prevMonth, daysInMonth(prevMonth))
        try {
          const r = postLateFees(db, { orgId: org.id, siteId: site.id, asOf })
          mark(db, 'gecikme', `${site.id}:${prevMonth}`, r)
          summary.lateFees += r.total
        } catch (e) {
          mark(db, 'gecikme', `${site.id}:${prevMonth}`, { error: (e as Error).message })
        }
      }
    }
    const mode = settings.autonomy.payment_reminder
    if (mode !== 'kapali' && once(db, 'hatirlatma', `${org.id}:${today}`)) {
      const r = await runReminders(deps, {
        orgId: org.id,
        siteIds: sites.map((s) => s.id),
        asOf: today,
        mode,
        settings,
      })
      mark(db, 'hatirlatma', `${org.id}:${today}`, r)
      summary.reminders += r.proposed + r.sent
      summary.errors.push(...r.errors)
    }
  }
  return summary
}

/** Sunucu içinde periyodik çalıştırma (varsayılan 15 dakikada bir). Durdurmak için dönen fonksiyonu çağırın. */
export function startScheduler(deps: Deps, intervalMs = 15 * 60_000): () => void {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const s = await runAutopilot(deps)
      if (s.triaged || s.accruals || s.reminders || s.lateFees) {
        console.info(`[otopilot] ${s.triaged} mesaj, ${s.accruals} tahakkuk, ${s.reminders} hatırlatma`)
      }
      for (const e of s.errors) console.warn(`[otopilot] ${e}`)
    } catch (e) {
      console.error('[otopilot] hata:', e)
    } finally {
      running = false
    }
  }
  const timer = setInterval(tick, intervalMs)
  setTimeout(tick, 5_000)
  return () => clearInterval(timer)
}
