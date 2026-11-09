// Yetki kapsamı: her sorgu kuruluşa (org) göre süzülür. Site yöneticisi yalnız atandığı siteleri görür;
// şirket yöneticisi ve muhasebe kuruluşun tüm sitelerini görür. Sakin yalnız kendi bağımsız bölümlerini görür.
import { all, get, type DB } from './db/db.ts'
import { fail, notFound, type AppUser } from './http.ts'

export type SiteRow = {
  id: number
  org_id: number
  name: string
  kind: string
  address: string | null
  district: string | null
  city: string | null
  bank_name: string | null
  iban: string | null
  due_day: number
  late_fee_bps: number
  land_share_total: number | null
  manager_phone: string | null
}

export type UnitRow = {
  id: number
  site_id: number
  block_id: number | null
  no: string
  floor: number | null
  kind: string
  area_m2: number | null
  land_share: number
}

export function allowedSiteIds(db: DB, user: AppUser): number[] {
  if (user.role === 'yonetici') {
    return all<{ site_id: number }>(
      db,
      `SELECT us.site_id FROM user_sites us JOIN sites s ON s.id = us.site_id WHERE us.user_id = ? AND s.org_id = ?`,
      user.id,
      user.orgId,
    ).map((r) => r.site_id)
  }
  if (user.role === 'sakin') {
    return all<{ site_id: number }>(
      db,
      `SELECT DISTINCT u.site_id FROM occupancies o JOIN units u ON u.id = o.unit_id
       WHERE o.person_id = ? AND (o.end_date IS NULL OR o.end_date >= date('now'))`,
      user.personId ?? -1,
    ).map((r) => r.site_id)
  }
  return all<{ id: number }>(db, 'SELECT id FROM sites WHERE org_id = ? ORDER BY name', user.orgId).map((r) => r.id)
}

/** "IN (...)" için güvenli liste; boşsa hiçbir satırla eşleşmeyen -1. */
export const inList = (ids: number[]) => (ids.length ? ids.join(',') : '-1')

export function assertSite(db: DB, user: AppUser, siteId: number): SiteRow {
  const site = get<SiteRow>(db, 'SELECT * FROM sites WHERE id = ? AND org_id = ?', siteId, user.orgId)
  if (!site) notFound('Site')
  if (!allowedSiteIds(db, user).includes(site.id)) fail(403, 'Bu siteye erişim yetkiniz yok')
  return site
}

export function assertUnit(db: DB, user: AppUser, unitId: number): UnitRow & { site: SiteRow } {
  const unit = get<UnitRow>(db, 'SELECT * FROM units WHERE id = ?', unitId)
  if (!unit) notFound('Bağımsız bölüm')
  const site = assertSite(db, user, unit.site_id)
  return { ...unit, site }
}

/** Kuruluşa ait bir kaydı (org_id sütunu olan tablolar) getirir ve site yetkisini doğrular. */
export function assertOrgRow<T extends { org_id: number; site_id?: number | null }>(
  db: DB,
  user: AppUser,
  table: string,
  id: number,
  what: string,
): T {
  const row = get<T>(db, `SELECT * FROM ${table} WHERE id = ? AND org_id = ?`, id, user.orgId)
  if (!row) notFound(what)
  if (row.site_id && user.role !== 'sakin' && !allowedSiteIds(db, user).includes(row.site_id)) {
    fail(403, 'Bu siteye erişim yetkiniz yok')
  }
  return row
}

/** Sakin: aktif oturduğu/sahibi olduğu bağımsız bölümler. */
export function residentUnits(db: DB, user: AppUser) {
  return all<UnitRow & { block: string | null; site_name: string; role: string; is_payer: number }>(
    db,
    `SELECT u.*, b.name AS block, s.name AS site_name, o.role, o.is_payer
     FROM occupancies o JOIN units u ON u.id = o.unit_id JOIN sites s ON s.id = u.site_id
     LEFT JOIN blocks b ON b.id = u.block_id
     WHERE o.person_id = ? AND s.org_id = ? AND (o.end_date IS NULL OR o.end_date >= date('now'))
     ORDER BY s.name, b.name, CAST(u.no AS INTEGER), u.no`,
    user.personId ?? -1,
    user.orgId,
  )
}

export function assertResidentUnit(db: DB, user: AppUser, unitId: number) {
  const unit = residentUnits(db, user).find((u) => u.id === unitId)
  if (!unit) fail(403, 'Bu bağımsız bölüme erişim yetkiniz yok')
  return unit
}

export function unitLabel(u: { block?: string | null; no: string }): string {
  return u.block ? `${u.block} No ${u.no}` : `Daire ${u.no}`
}
