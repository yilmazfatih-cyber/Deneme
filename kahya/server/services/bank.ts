// Banka hesap hareketlerini içe aktarır ve her gelen tutarı bağımsız bölüme eşlemeye çalışır.
// Eşleşme önerisi personel onayına sunulur; onaylanan satır tahsilat olarak kaydedilir.
import { all, get, insert, tx, type DB } from '../db/db.ts'
import { parseBankStatement } from '../domain/bankcsv.ts'
import { matchTransaction } from '../domain/matcher.ts'
import { fail } from '../http.ts'
import { siteStandings } from './finance.ts'

export function createBankImport(
  db: DB,
  p: { siteId: number; csv: string; filename?: string | null; userId?: number | null; asOf: string },
) {
  const parsed = parseBankStatement(p.csv)
  if (!parsed.columns) fail(400, 'Başlık satırı bulunamadı: tarih, açıklama ve tutar (ya da alacak) sütunları gerekli')
  const standings = siteStandings(db, p.siteId, p.asOf)
  const people = all<{ unit_id: number; full_name: string }>(
    db,
    `SELECT o.unit_id, p.full_name FROM occupancies o JOIN people p ON p.id = o.person_id JOIN units u ON u.id = o.unit_id
     WHERE u.site_id = ? AND p.anonymized_at IS NULL`,
    p.siteId,
  )
  const matchUnits = standings.map((u) => ({
    id: u.id,
    block: u.block,
    no: u.no,
    names: people.filter((x) => x.unit_id === u.id).map((x) => x.full_name),
    expected: [u.monthly ?? 0, u.position.overdue, Math.max(0, u.position.balance)].filter((x) => x > 0),
  }))
  const id = tx(db, () => {
    const id = insert(db, 'bank_imports', {
      site_id: p.siteId,
      filename: p.filename ?? null,
      row_count: parsed.rows.length,
      created_by: p.userId ?? null,
    })
    for (const row of parsed.rows) {
      const duplicate = row.reference
        ? get(
            db,
            `SELECT id FROM payments WHERE site_id = ? AND reference = ? AND status = 'aktif'`,
            p.siteId,
            row.reference,
          )
        : undefined
      const m = matchTransaction(row.description, row.amount, matchUnits)
      insert(db, 'bank_rows', {
        import_id: id,
        row_no: row.rowNo,
        txn_date: row.date,
        description: row.description,
        amount: row.amount,
        reference: row.reference,
        suggested_unit_id: m.unitId,
        confidence: m.confidence,
        reason: duplicate ? 'Bu referans daha önce kaydedilmiş' : m.reason,
        status: duplicate ? 'mukerrer' : 'bekliyor',
      })
    }
    return id
  })
  return { id, rows: parsed.rows.length, skipped: parsed.skipped }
}
