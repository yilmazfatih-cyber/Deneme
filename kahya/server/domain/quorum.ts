// Kat malikleri kurulu: toplantı yeter sayısı, karar yeter sayısı ve çağrı süreleri (KMK m.29–31).
// - İlk toplantı: kat maliklerinin sayı VE arsa payı bakımından yarıdan fazlası katılmalı (m.30).
// - İkinci toplantı: ilkinden en az 7, en geç 15 gün sonra; toplantı yeter sayısı aranmaz, kararlar katılanların
//   salt çoğunluğuyla alınır (m.30).
// - Özel çoğunluklar TÜM kat maliklerine göre hesaplanır: yönetici seçimi ve faydalı yenilikler sayı ve arsa payı
//   çoğunluğu (m.34, m.42), yönetim planı değişikliği beşte dört (m.28).
// - Her bağımsız bölüm bir oy; birden çok bölümü olan malikin oyu toplam oyun üçte biriyle sınırlı (m.31).
// - Vekâlet: 40 ve daha az bölümlü yapıda bir kişi en çok iki malike, daha büyük yapılarda oyların %5'inden fazlasına
//   vekâlet edemez (m.31).
// Bu modül karar destek aracıdır; resmî sonuç noter onaylı karar defterine yazılır ve imzalanır (m.32).
import type { MeetingRule } from '../../shared/labels.ts'
import { diffDays } from './dates.ts'
import { fold } from './text.ts'

export type Round = 'ilk' | 'ikinci'
export type VoterUnit = { unitId: number; landShare: number; ownerKey: string | null; label?: string }
export type AttendanceInfo = { present: boolean; proxy: string | null }
export type VoteValue = 'evet' | 'hayir' | 'cekimser'

export type QuorumResult = {
  round: Round
  ok: boolean
  presentCount: number
  totalCount: number
  presentShare: number
  totalShare: number
  explanation: string
}

export function quorum(units: VoterUnit[], attendance: Map<number, AttendanceInfo>, round: Round): QuorumResult {
  const totalCount = units.length
  const totalShare = units.reduce((s, u) => s + u.landShare, 0)
  const present = units.filter((u) => attendance.get(u.unitId)?.present)
  const presentCount = present.length
  const presentShare = present.reduce((s, u) => s + u.landShare, 0)
  if (round === 'ikinci') {
    return {
      round,
      ok: presentCount > 0,
      presentCount,
      totalCount,
      presentShare,
      totalShare,
      explanation: 'İkinci toplantıda toplantı yeter sayısı aranmaz; kararlar katılanların salt çoğunluğuyla alınır.',
    }
  }
  const ok = presentCount * 2 > totalCount && presentShare * 2 > totalShare
  return {
    round,
    ok,
    presentCount,
    totalCount,
    presentShare,
    totalShare,
    explanation: ok
      ? 'Kat maliklerinin sayı ve arsa payı bakımından yarıdan fazlası hazır; toplantı yeter sayısı sağlandı.'
      : `Toplantı yeter sayısı için ${Math.floor(totalCount / 2) + 1} bağımsız bölüm ve arsa payının yarıdan fazlası (${Math.floor(totalShare / 2) + 1}/${totalShare}) gerekir.`,
  }
}

/** m.31: birden çok bölümü olan malikin oy sayısı toplamın üçte birini (küsurat atılır) aşamaz. */
export function voteCaps(units: VoterUnit[]): { cap: number; capped: { ownerKey: string; units: number }[] } {
  const cap = Math.max(1, Math.floor(units.length / 3))
  const byOwner = new Map<string, number>()
  for (const u of units) if (u.ownerKey) byOwner.set(u.ownerKey, (byOwner.get(u.ownerKey) ?? 0) + 1)
  const capped = [...byOwner.entries()].filter(([, n]) => n > cap).map(([ownerKey, n]) => ({ ownerKey, units: n }))
  return { cap, capped }
}

export type Tally = {
  rule: MeetingRule
  passed: boolean
  yes: number
  no: number
  abstain: number
  notVoted: number
  yesShare: number
  totalCount: number
  totalShare: number
  presentCount: number
  explanation: string
}

export function tally(
  units: VoterUnit[],
  attendance: Map<number, AttendanceInfo>,
  votes: Map<number, VoteValue>,
  rule: MeetingRule,
): Tally {
  const { cap } = voteCaps(units)
  const usedByOwner = new Map<string, number>()
  let yes = 0
  let no = 0
  let abstain = 0
  let yesShare = 0
  let presentCount = 0
  for (const u of units) {
    if (!attendance.get(u.unitId)?.present) continue
    presentCount++
    const v = votes.get(u.unitId)
    if (!v) continue
    if (u.ownerKey) {
      const used = usedByOwner.get(u.ownerKey) ?? 0
      if (used >= cap) continue // üçte bir sınırını aşan oy sayılmaz
      usedByOwner.set(u.ownerKey, used + 1)
    }
    if (v === 'evet') {
      yes++
      yesShare += u.landShare
    } else if (v === 'hayir') no++
    else abstain++
  }
  const totalCount = units.length
  const totalShare = units.reduce((s, u) => s + u.landShare, 0)
  const notVoted = presentCount - yes - no - abstain
  let passed = false
  let explanation = ''
  switch (rule) {
    case 'cogunluk':
      passed = yes * 2 > presentCount
      explanation = `Katılan ${presentCount} oyun salt çoğunluğu (${Math.floor(presentCount / 2) + 1}) gerekir; evet: ${yes}.`
      break
    case 'sayi_arsa':
      passed = yes * 2 > totalCount && yesShare * 2 > totalShare
      explanation = `Tüm kat maliklerinin sayı (${Math.floor(totalCount / 2) + 1}/${totalCount}) ve arsa payı (${Math.floor(totalShare / 2) + 1}/${totalShare}) çoğunluğu gerekir; evet: ${yes} bölüm, ${yesShare} arsa payı.`
      break
    case 'bestedort': {
      const need = Math.ceil((totalCount * 4) / 5)
      passed = yes >= need
      explanation = `Tüm kat maliklerinin beşte dördü (${need}/${totalCount}) gerekir; evet: ${yes}.`
      break
    }
    case 'oybirligi':
      passed = yes === totalCount
      explanation = `Tüm kat maliklerinin (${totalCount}) oybirliği gerekir; evet: ${yes}.`
      break
  }
  return { rule, passed, yes, no, abstain, notVoted, yesShare, totalCount, totalShare, presentCount, explanation }
}

/** m.31 vekâlet sınırları: aşan vekiller için uyarı listesi. */
export function proxyWarnings(units: VoterUnit[], attendance: Map<number, AttendanceInfo>): string[] {
  const limit = units.length <= 40 ? 2 : Math.max(1, Math.floor(units.length * 0.05))
  const byProxy = new Map<string, { name: string; owners: Set<string> }>()
  for (const u of units) {
    const a = attendance.get(u.unitId)
    if (!a?.present || !a.proxy?.trim()) continue
    const key = fold(a.proxy)
    const entry = byProxy.get(key) ?? { name: a.proxy.trim(), owners: new Set<string>() }
    entry.owners.add(u.ownerKey ?? `u${u.unitId}`)
    byProxy.set(key, entry)
  }
  const out: string[] = []
  for (const { name, owners } of byProxy.values()) {
    if (owners.size > limit) {
      out.push(
        units.length <= 40
          ? `${name} ${owners.size} malike vekâlet ediyor; 40 ve daha az bölümlü yapılarda sınır 2 malik (KMK m.31).`
          : `${name} ${owners.size} malike vekâlet ediyor; oyların %5’ini (${limit}) aşamaz (KMK m.31).`,
      )
    }
  }
  const { cap, capped } = voteCaps(units)
  for (const c of capped) {
    const label = units.find((u) => u.ownerKey === c.ownerKey)?.label ?? 'Bir malik'
    out.push(`${label}: ${c.units} bölüm; oyu toplamın üçte biriyle (${cap}) sınırlıdır (KMK m.31).`)
  }
  return out
}

/** m.29: çağrı en az 15 gün önce; ikinci toplantı ilkinden en az 7, en geç 15 gün sonra. */
export function scheduleWarnings(p: {
  invitedOn: string | null
  firstDate: string
  secondDate: string | null
  today: string
}): string[] {
  const out: string[] = []
  const inviteDay = p.invitedOn ?? p.today
  const lead = diffDays(inviteDay, p.firstDate)
  if (lead < 15) {
    out.push(
      p.invitedOn
        ? `Çağrı toplantıdan ${lead} gün önce yapılmış; en az 15 gün önce yapılması gerekir (KMK m.29).`
        : `Bugün çağrı yapılırsa toplantıya ${lead} gün kalır; en az 15 gün gerekir (KMK m.29).`,
    )
  }
  if (!p.secondDate) out.push('Çağrıda ikinci toplantının yeri ve zamanı da belirtilmelidir (KMK m.29).')
  else {
    const gap = diffDays(p.firstDate, p.secondDate)
    if (gap < 7) out.push(`İkinci toplantı ilkinden ${gap} gün sonra; en az 7 gün olmalıdır.`)
    if (gap > 15) out.push(`İkinci toplantı ilkinden ${gap} gün sonra; en geç 15 gün içinde yapılmalıdır (KMK m.30).`)
  }
  return out
}
