// Süre hesapları: talep hizmet seviyesi (SLA) ve periyodik kontrollerin bir sonraki tarihi.
import { SLA_HOURS, type Priority } from '../../shared/labels.ts'
import { addMonthsToDate, diffDays } from './dates.ts'

export function slaDueAt(priority: Priority, from: Date = new Date()): string {
  return new Date(from.getTime() + SLA_HOURS[priority] * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export type ComplianceStatus = 'gecikti' | 'yaklasiyor' | 'tamam' | 'bilinmiyor'

export function nextDue(lastDone: string | null, intervalMonths: number): string | null {
  return lastDone ? addMonthsToDate(lastDone, intervalMonths) : null
}

export function complianceStatus(due: string | null, today: string, warnDays = 30): ComplianceStatus {
  if (!due) return 'bilinmiyor'
  const d = diffDays(today, due)
  if (d < 0) return 'gecikti'
  if (d <= warnDays) return 'yaklasiyor'
  return 'tamam'
}
