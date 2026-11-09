// Geciken aidat hatırlatmaları. Metinler şablondan üretilir (tutarlar sistemden gelir, model uydurmaz).
// İYS: borç hatırlatma iletileri önceden onay gerektirmez (Ticari İletişim Yönetmeliği m.6/2) ancak tanıtım içeremez.
// KVKK: hatırlatma yalnız ilgili kişiye gider; borçlu listesi asla duyuru olarak yayınlanmaz.
import { REMINDER_STAGES, type OrgSettings, type ReminderStage } from '../../shared/labels.ts'
import { all, get, type DB } from '../db/db.ts'
import { dateLabel, diffDays } from '../domain/dates.ts'
import { formatTL } from '../domain/money.ts'
import { firstName } from '../domain/text.ts'
import type { Deps } from '../http.ts'
import { sendReminder, type ReminderPayload } from './actions.ts'
import { logAi } from './common.ts'
import { siteStandings } from './finance.ts'

export function stageFor(maxOverdueDays: number, s: OrgSettings['reminders']): ReminderStage | null {
  if (maxOverdueDays >= s.finalAfterDays) return 'son'
  if (maxOverdueDays >= s.secondAfterDays) return 'hatirlatma'
  if (maxOverdueDays >= s.firstAfterDays) return 'nazik'
  return null
}

export function reminderText(
  stage: ReminderStage,
  c: {
    name: string | null
    site: string
    unit: string
    overdue: number
    oldestDue: string
    days: number
    lateFee: number
    iban: string | null
  },
): string {
  const hello = c.name ? `Merhaba ${firstName(c.name)},` : 'Merhaba,'
  const pay = c.iban
    ? `Ödemeyi sakin portalından kartla ya da ${c.iban} IBAN’ına “${c.unit}” açıklamasıyla yapabilirsiniz.`
    : 'Ödemeyi sakin portalından kartla yapabilirsiniz.'
  const sign = `${c.site} Yönetimi`
  if (stage === 'nazik') {
    return `${hello} ${c.site} ${c.unit} için ${dateLabel(c.oldestDue)} vadeli ödemenizi henüz göremedik. Güncel vadesi geçmiş tutar: ${formatTL(c.overdue)}. ${pay} Ödeme yaptıysanız bu mesajı dikkate almayınız. — ${sign}`
  }
  if (stage === 'hatirlatma') {
    const fee =
      c.lateFee > 0
        ? ` Kat Mülkiyeti Kanunu m.20 gereği geciken ödemelere aylık %5 gecikme tazminatı işler; şu ana kadar ${formatTL(c.lateFee)} oluşmuştur.`
        : ''
    return `${hello} ${c.unit} için vadesi geçmiş ${formatTL(c.overdue)} ortak gider borcunuz bulunuyor (en eski vade: ${dateLabel(c.oldestDue)}).${fee} ${pay} Ödeme planı isterseniz bu mesaja yanıt verebilirsiniz. — ${sign}`
  }
  return `${hello} ${c.unit} için ${c.days} gündür ödenmeyen ${formatTL(c.overdue)} ortak gider borcu bulunmaktadır${c.lateFee > 0 ? `; işleyen gecikme tazminatı ${formatTL(c.lateFee)}` : ''}. Borcun ödenmemesi halinde Kat Mülkiyeti Kanunu ve yönetim planı kapsamında yasal yollara başvurulabilecektir. Ödeme ya da taksit için lütfen yönetimle iletişime geçin. — ${sign}`
}

export type ReminderCandidate = {
  siteId: number
  unitId: number
  unit: string
  personId: number | null
  name: string | null
  overdue: number
  days: number
  stage: ReminderStage
  text: string
  skip: string | null
}

export function reminderCandidates(db: DB, siteIds: number[], asOf: string, s: OrgSettings): ReminderCandidate[] {
  const out: ReminderCandidate[] = []
  for (const siteId of siteIds) {
    const site = get<{ name: string; iban: string | null }>(db, 'SELECT name, iban FROM sites WHERE id = ?', siteId)
    if (!site) continue
    for (const u of siteStandings(db, siteId, asOf)) {
      const p = u.position
      if (p.overdue <= 0 || !p.oldestOverdue) continue
      const stage = stageFor(p.maxOverdueDays, s.reminders)
      if (!stage) continue
      let skip: string | null = null
      if (!u.payer_id) skip = 'Kayıtlı kişi yok'
      else if (u.lastReminder) {
        const since = diffDays(u.lastReminder.created_at.slice(0, 10), asOf)
        if (since < 7) skip = `Son hatırlatma ${since} gün önce`
        else if (u.lastReminder.stage === stage && since < 30) skip = `Aynı aşama ${since} gün önce gönderildi`
      }
      out.push({
        siteId,
        unitId: u.id,
        unit: u.label,
        personId: u.payer_id,
        name: u.payer_name,
        overdue: p.overdue,
        days: p.maxOverdueDays,
        stage,
        skip,
        text: reminderText(stage, {
          name: u.payer_name,
          site: site.name,
          unit: u.label,
          overdue: p.overdue,
          oldestDue: p.oldestOverdue,
          days: p.maxOverdueDays,
          lateFee: p.lateFeeAccrued,
          iban: site.iban,
        }),
      })
    }
  }
  return out
}

/** Hatırlatmaları önerir (onay kuyruğu) ya da doğrudan gönderir. */
export async function runReminders(
  deps: Deps,
  p: {
    orgId: number
    siteIds: number[]
    asOf: string
    mode: 'oneri' | 'otomatik'
    settings: OrgSettings
    unitIds?: number[]
  },
) {
  const candidates = reminderCandidates(deps.db, p.siteIds, p.asOf, p.settings).filter(
    (c) => !p.unitIds || p.unitIds.includes(c.unitId),
  )
  let proposed = 0
  let sent = 0
  let skipped = 0
  const errors: string[] = []
  for (const c of candidates) {
    // Bekleyen aynı öneri varsa yinelenmesin
    const pending = get<{ id: number }>(
      deps.db,
      `SELECT id FROM ai_actions WHERE org_id = ? AND kind = 'hatirlatma' AND status = 'oneri' AND ref_type = 'unit' AND ref_id = ?`,
      p.orgId,
      c.unitId,
    )
    if ((c.skip && !p.unitIds) || pending) {
      skipped++
      continue
    }
    const payload: ReminderPayload = {
      siteId: c.siteId,
      unitId: c.unitId,
      personId: c.personId,
      stage: c.stage,
      amount: c.overdue,
      body: c.text,
      channels: p.settings.reminders.channels,
    }
    const title = `${REMINDER_STAGES[c.stage]}: ${c.unit} — ${formatTL(c.overdue)}`
    if (p.mode === 'otomatik') {
      try {
        const out = await sendReminder(deps, p.orgId, payload)
        logAi(deps.db, {
          orgId: p.orgId,
          siteId: c.siteId,
          kind: 'hatirlatma',
          status: 'uygulandi',
          title,
          payload,
          engine: 'kural',
          refType: 'unit',
          refId: c.unitId,
          note: out.note,
        })
        sent++
      } catch (e) {
        errors.push(`${c.unit}: ${(e as Error).message}`)
        logAi(deps.db, {
          orgId: p.orgId,
          siteId: c.siteId,
          kind: 'hatirlatma',
          status: 'hata',
          title,
          payload,
          engine: 'kural',
          refType: 'unit',
          refId: c.unitId,
          note: (e as Error).message,
        })
      }
    } else {
      logAi(deps.db, {
        orgId: p.orgId,
        siteId: c.siteId,
        kind: 'hatirlatma',
        status: 'oneri',
        title,
        payload,
        engine: 'kural',
        refType: 'unit',
        refId: c.unitId,
      })
      proposed++
    }
  }
  return { candidates: candidates.length, proposed, sent, skipped, errors }
}

export function lastReminders(db: DB, unitIds: number[]) {
  if (unitIds.length === 0) return []
  return all<{ unit_id: number; stage: string; created_at: string }>(
    db,
    `SELECT unit_id, stage, MAX(created_at) AS created_at FROM reminders WHERE unit_id IN (${unitIds.join(',')}) GROUP BY unit_id`,
  )
}
