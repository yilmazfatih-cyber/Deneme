// Online aidat ödemesi: ödeme niyeti (intent) oluşturma ve sonuçlandırma. Sonuçlandırma idempotenttir:
// PayTR aynı bildirimi birden çok kez gönderebilir; yalnız ilki işlenir.
import { randomBytes } from 'node:crypto'
import { get, insert, run, tx, type DB } from '../db/db.ts'
import { today } from '../domain/dates.ts'
import { recordPayment } from './finance.ts'

export function newOid(): string {
  return `KHY${randomBytes(10).toString('hex').toUpperCase()}`
}

export type IntentRow = {
  id: number
  org_id: number
  site_id: number
  unit_id: number
  person_id: number | null
  amount: number
  provider: string
  oid: string
  status: 'bekliyor' | 'basarili' | 'basarisiz'
  payment_id: number | null
  failure: string | null
  created_at: string
}

export function createIntent(
  db: DB,
  p: { orgId: number; siteId: number; unitId: number; personId: number | null; amount: number; provider: string },
): IntentRow {
  const oid = newOid()
  const id = insert(db, 'payment_intents', {
    org_id: p.orgId,
    site_id: p.siteId,
    unit_id: p.unitId,
    person_id: p.personId,
    amount: p.amount,
    provider: p.provider,
    oid,
  })
  return get<IntentRow>(db, 'SELECT * FROM payment_intents WHERE id = ?', id)!
}

export function completeIntent(db: DB, oid: string, success: boolean, now: Date, failure?: string) {
  return tx(db, () => {
    const intent = get<IntentRow>(db, 'SELECT * FROM payment_intents WHERE oid = ?', oid)
    if (!intent) return { found: false as const }
    if (intent.status !== 'bekliyor') return { found: true as const, already: true, intent }
    if (success) {
      const paymentId = recordPayment(db, {
        orgId: intent.org_id,
        siteId: intent.site_id,
        unitId: intent.unit_id,
        amount: intent.amount,
        paidOn: today(now),
        method: 'online',
        source: 'online',
        reference: oid,
        note: `Online ödeme (${intent.provider})`,
      })
      run(
        db,
        `UPDATE payment_intents SET status = 'basarili', payment_id = ?, completed_at = ? WHERE id = ?`,
        paymentId,
        now.toISOString(),
        intent.id,
      )
    } else {
      run(
        db,
        `UPDATE payment_intents SET status = 'basarisiz', failure = ?, completed_at = ? WHERE id = ?`,
        failure ?? 'Ödeme başarısız',
        now.toISOString(),
        intent.id,
      )
    }
    return {
      found: true as const,
      already: false,
      intent: get<IntentRow>(db, 'SELECT * FROM payment_intents WHERE id = ?', intent.id)!,
    }
  })
}
