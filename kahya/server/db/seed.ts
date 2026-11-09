// Demo verisi: kurgusal bir yönetim şirketi, 3 site, 50 bağımsız bölüm, 6 aylık aidat ve tahsilat geçmişi,
// borçlular, devralınan portföy bakiyeleri, arızalar, gelen mesajlar (yapay zekâ hattından geçirilerek),
// bekleyen banka hareketleri, periyodik kontroller, belgeler ve genel kurul. Tüm adlar ve numaralar kurgudur.
import { AIService } from '../ai/service.ts'
import { hashPassword } from '../auth/auth.ts'
import { loadConfig } from '../config.ts'
import { addDays, addMonths, dateInMonth, monthLabel, monthOf, nowIso, today as todayOf } from '../domain/dates.ts'
import { formatTL } from '../domain/money.ts'
import { trUpper } from '../domain/text.ts'
import type { Deps } from '../http.ts'
import { Messaging } from '../integrations/messaging.ts'
import { Payments } from '../integrations/payments.ts'
import { indexDocument } from '../services/assistant.ts'
import { createBankImport } from '../services/bank.ts'
import { orgSettings } from '../services/common.ts'
import { generateAccruals, recordPayment, unitCharges } from '../services/finance.ts'
import { receiveInbound } from '../services/inbox.ts'
import { minutesText, meetingDetail } from '../services/meetings.ts'
import { runReminders } from '../services/reminders.ts'
import { addTicketEvent, createTicket, setTicketStatus } from '../services/tickets.ts'
import { DEFAULT_SETTINGS } from '../../shared/labels.ts'
import { nextDue } from '../domain/schedule.ts'
import { get, insert, run, type DB } from './db.ts'

export const DEMO_PASSWORD = 'Kahya!2026'
export const DEMO_USERS = {
  admin: 'elif@yildizyonetim.example',
  yonetici: 'murat@yildizyonetim.example',
  muhasebe: 'deniz@yildizyonetim.example',
}
export const DEMO_RESIDENT_PHONE = '+905321112233'

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** TR IBAN: banka kodu + hesap no'dan geçerli kontrol haneleriyle üretir (kurgusal). */
function makeIban(bank: string, account: string): string {
  const bban = `${bank}0${account}`.padEnd(22, '0').slice(0, 22)
  const numeric = `${bban}2927` + '00' // T=29, R=27
  let rem = 0
  for (const d of numeric) rem = (rem * 10 + Number(d)) % 97
  const check = String(98 - rem).padStart(2, '0')
  return `TR${check}${bban}`.replace(/(.{4})/g, '$1 ').trim()
}

const FIRST = [
  'Mehmet',
  'Zeynep',
  'Ahmet',
  'Elif',
  'Mustafa',
  'Fatma',
  'Can',
  'Selin',
  'Emre',
  'Burcu',
  'Hakan',
  'Derya',
  'Gülşen',
  'Serkan',
  'Ebru',
  'Okan',
  'Nazlı',
  'Tolga',
  'Esra',
  'Volkan',
  'Pınar',
  'Barış',
  'Sevgi',
  'Cem',
  'İpek',
  'Kerem',
  'Aslı',
  'Onur',
  'Hülya',
  'Levent',
  'Melike',
  'Uğur',
  'Şule',
  'Tarık',
  'Gizem',
  'Yusuf',
  'Damla',
  'Erkan',
  'Nur',
  'Sinan',
  'Özlem',
  'Kaan',
  'Merve',
  'İlker',
  'Canan',
  'Bülent',
  'Ceren',
  'Oğuz',
  'Seda',
  'Çağlar',
  'Yasemin',
  'Recep',
  'Dilek',
  'Koray',
  'Tuba',
  'Gökhan',
  'Ayten',
  'Berk',
  'Nilay',
  'Orhan',
  'Sibel',
  'Taner',
  'Leyla',
  'Ferhat',
  'Bahar',
]
const LAST = [
  'Demir',
  'Arslan',
  'Yılmaz',
  'Çelik',
  'Şahin',
  'Doğan',
  'Kılıç',
  'Aydın',
  'Öztürk',
  'Koç',
  'Kurt',
  'Özdemir',
  'Aslan',
  'Polat',
  'Erdoğan',
  'Güneş',
  'Tekin',
  'Bozkurt',
  'Karaca',
  'Uysal',
  'Ateş',
  'Keskin',
  'Çetin',
  'Yıldız',
  'Taş',
  'Kara',
  'Avcı',
  'Ünal',
  'Sarı',
  'Korkmaz',
  'Işık',
  'Erdem',
  'Tunç',
  'Aktaş',
  'Duman',
  'Ekinci',
]

type SeedUnit = {
  id: number
  siteKey: string
  key: string
  block: string | null
  no: string
  ownerId: number
  payerId: number
  payerName: string
}

export async function seedDemo(db: DB, opts: { now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const today = todayOf(now)
  const month = monthOf(today)
  const year = Number(month.slice(0, 4))
  const r = rng(20261109)
  const ri = (min: number, max: number) => min + Math.floor(r() * (max - min + 1))

  const config = loadConfig({ KAHYA_AI: 'kural', KAHYA_DEMO: '1' })
  const deps: Deps = {
    db,
    config,
    ai: new AIService(config, null),
    messaging: new Messaging(config, { log: () => {} }),
    payments: new Payments(config),
    now: () => now,
  }

  // --- Kuruluş ve kullanıcılar ---
  const orgId = insert(db, 'orgs', {
    name: 'Yıldız Yapı Yönetim A.Ş.',
    phone: '+902125550100',
    email: 'iletisim@yildizyonetim.example',
    address: 'Barbaros Mah. Begonya Sok. No:3, Ataşehir / İstanbul',
    tax_no: '9990001112',
    settings: JSON.stringify({ ...DEFAULT_SETTINGS, emergencyPhone: '+905321110001' }),
  })
  const pw = await hashPassword(DEMO_PASSWORD)
  const adminId = insert(db, 'users', {
    org_id: orgId,
    name: 'Elif Aksoy',
    email: DEMO_USERS.admin,
    password_hash: pw,
    role: 'admin',
  })
  const managerId = insert(db, 'users', {
    org_id: orgId,
    name: 'Murat Şahin',
    email: DEMO_USERS.yonetici,
    password_hash: pw,
    role: 'yonetici',
  })
  insert(db, 'users', {
    org_id: orgId,
    name: 'Deniz Yıldırım',
    email: DEMO_USERS.muhasebe,
    password_hash: pw,
    role: 'muhasebe',
  })

  // --- Tedarikçiler ---
  const vendor: Record<string, number> = {}
  for (const [key, name, trade, rating] of [
    ['tesisat', 'Akın Tesisat', 'tesisat', 5],
    ['elektrik', 'Volt Elektrik', 'elektrik', 4],
    ['asansor', 'Yükseliş Asansör Servis', 'asansor', 4],
    ['temizlik', 'Pırıl Temizlik Hizmetleri', 'temizlik', 4],
    ['peyzaj', 'Yeşil Vadi Peyzaj', 'peyzaj', 5],
    ['guvenlik', 'Güven Kilit ve Kamera', 'guvenlik', 3],
    ['isitma', 'Isıtan Kombi Servisi', 'isitma', 4],
    ['cati', 'Çatı Ustası Kemal Usta', 'cati_cephe', 4],
    ['yangin', 'Anka Yangın Güvenlik', 'yangin', 5],
    ['genel', 'Usta Eller Tamirat', 'genel', 3],
    ['ilaclama', 'Ekoloji İlaçlama', 'ilaclama', 4],
  ] as const) {
    vendor[key] = insert(db, 'vendors', {
      org_id: orgId,
      name,
      trade,
      rating,
      phone: `+90532${String(4000000 + Object.keys(vendor).length * 131).padStart(7, '0')}`,
    })
  }

  // --- Siteler, bloklar, bağımsız bölümler, kişiler ---
  let personSeq = 0
  const newPerson = (name?: string, phone?: string) => {
    const i = personSeq++
    const full = name ?? `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]}`
    return {
      id: insert(db, 'people', {
        org_id: orgId,
        full_name: full,
        phone: phone ?? `+90533${String(2000000 + i * 37).padStart(7, '0')}`,
        email:
          i % 3 === 0
            ? `${full
                .split(' ')[0]!
                .toLocaleLowerCase('tr-TR')
                .replace(
                  /[çğıöşü]/g,
                  (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c,
                )}${i}@posta.example`
            : null,
        kvkk_notice_at: i % 4 === 0 ? null : nowIso(now),
        consent_email: 1,
        consent_sms: 1,
        consent_whatsapp: i % 9 === 4 ? 0 : 1,
      }),
      name: full,
    }
  }

  const units: SeedUnit[] = []
  const sites: Record<string, number> = {}
  const siteDefs = [
    {
      key: 'lale',
      name: 'Lale Evleri Sitesi',
      kind: 'site',
      district: 'Ataşehir',
      city: 'İstanbul',
      address: 'Küçükbakkalköy Mah. Lale Sok. No:12, Ataşehir / İstanbul',
      dueDay: 15,
      total: 2400,
      manager: '+905321110001',
      blocks: ['A Blok', 'B Blok'],
      perBlock: 12,
      shares: [90, 95, 100, 100, 105, 110],
      tenantEvery: 3,
    },
    {
      key: 'cinar',
      name: 'Çınar Apartmanı',
      kind: 'apartman',
      district: 'Kadıköy',
      city: 'İstanbul',
      address: 'Caferağa Mah. Çınar Sok. No:8, Kadıköy / İstanbul',
      dueDay: 10,
      total: 1000,
      manager: '+905321110001',
      blocks: [] as string[],
      perBlock: 10,
      shares: [140, 90, 90, 95, 95, 100, 100, 95, 95, 100],
      tenantEvery: 4,
    },
    {
      key: 'deniz',
      name: 'Deniz Konutları',
      kind: 'site',
      district: 'Karşıyaka',
      city: 'İzmir',
      address: 'Bostanlı Mah. 1855 Sok. No:4, Karşıyaka / İzmir',
      dueDay: 5,
      total: 1900,
      manager: '+905321110002',
      blocks: ['Martı Blok', 'Yelken Blok'],
      perBlock: 8,
      shares: [110, 110, 115, 115, 120, 120, 130, 130],
      tenantEvery: 3,
    },
  ]
  let unitIndex = 0
  for (const s of siteDefs) {
    const siteId = insert(db, 'sites', {
      org_id: orgId,
      name: s.name,
      kind: s.kind,
      address: s.address,
      district: s.district,
      city: s.city,
      bank_name: 'Örnek Katılım Bankası',
      iban: makeIban('00099', `${String(100000 + Object.keys(sites).length * 7777).padStart(16, '0')}`),
      due_day: s.dueDay,
      late_fee_bps: 500,
      land_share_total: s.total,
      manager_phone: s.manager,
    })
    sites[s.key] = siteId
    if (s.key !== 'deniz') insert(db, 'user_sites', { user_id: managerId, site_id: siteId })
    const blockList = s.blocks.length ? s.blocks : [null]
    for (const blockName of blockList) {
      const blockId = blockName ? insert(db, 'blocks', { site_id: siteId, name: blockName }) : null
      for (let n = 1; n <= s.perBlock; n++) {
        const share = s.blocks.length ? s.shares[Math.floor((n - 1) / 2)]! : s.shares[n - 1]!
        const kind = s.key === 'cinar' && n === 1 ? 'dukkan' : 'daire'
        const unitId = insert(db, 'units', {
          site_id: siteId,
          block_id: blockId,
          no: String(n),
          floor: s.blocks.length ? Math.ceil(n / 2) : n - 1,
          kind,
          area_m2: Math.round(share * 1.18),
          land_share: share,
        })
        const isAyse = s.key === 'lale' && blockName === 'A Blok' && n === 5
        const owner = isAyse ? newPerson('Ayşe Kaya', DEMO_RESIDENT_PHONE) : newPerson()
        const hasTenant = !isAyse && unitIndex % s.tenantEvery === 1
        const tenant = hasTenant ? newPerson() : null
        insert(db, 'occupancies', {
          unit_id: unitId,
          person_id: owner.id,
          role: 'malik',
          is_payer: hasTenant ? 0 : 1,
          start_date: `${year - 3}-05-01`,
        })
        if (tenant)
          insert(db, 'occupancies', {
            unit_id: unitId,
            person_id: tenant.id,
            role: 'kiraci',
            is_payer: 1,
            start_date: `${year - 1}-09-01`,
          })
        const payer = tenant ?? owner
        units.push({
          id: unitId,
          siteKey: s.key,
          key: `${s.key}:${blockName ? blockName.split(' ')[0] : ''}${blockName ? '-' : ''}${n}`,
          block: blockName,
          no: String(n),
          ownerId: owner.id,
          payerId: payer.id,
          payerName: payer.name,
        })
        unitIndex++
      }
    }
  }
  // Bir yatırımcı iki daireye sahip (Lale A-11 ve B-11) — vekâlet/oy sınırı örneği
  const investor = newPerson('Kemal Ertürk')
  for (const key of ['lale:A-11', 'lale:B-11']) {
    const u = units.find((x) => x.key === key)!
    run(db, `UPDATE occupancies SET person_id = ? WHERE unit_id = ? AND role = 'malik'`, investor.id, u.id)
    u.ownerId = investor.id
  }

  // --- İşletme projeleri ---
  const budgets: Record<string, [string, string, number, string][]> = {
    lale: [
      ['personel', 'Kapıcı ve bahçıvan ücretleri (SGK dahil)', 540_000_00, 'esit'],
      ['guvenlik', 'Gece bekçisi hizmeti', 180_000_00, 'esit'],
      ['enerji', 'Ortak alan elektrik, su, doğalgaz', 120_000_00, 'arsa_payi'],
      ['asansor', 'Asansör bakım sözleşmesi (4 asansör)', 48_000_00, 'arsa_payi'],
      ['temizlik', 'Temizlik malzemesi', 30_000_00, 'arsa_payi'],
      ['peyzaj', 'Peyzaj ve sulama', 24_000_00, 'arsa_payi'],
      ['sigorta', 'Bina ortak alan sigortası', 36_000_00, 'arsa_payi'],
      ['yonetim', 'Profesyonel yönetim hizmet bedeli', 96_000_00, 'arsa_payi'],
      ['yedek', 'Yedek akçe', 30_000_00, 'arsa_payi'],
    ],
    cinar: [
      ['personel', 'Kapıcı ücreti (SGK dahil)', 300_000_00, 'esit'],
      ['enerji', 'Ortak alan elektrik, su, kalorifer yakıtı', 60_000_00, 'arsa_payi'],
      ['asansor', 'Asansör bakımı', 30_000_00, 'arsa_payi'],
      ['temizlik', 'Temizlik malzemesi', 12_000_00, 'arsa_payi'],
      ['sigorta', 'Bina sigortası', 15_000_00, 'arsa_payi'],
      ['yonetim', 'Profesyonel yönetim hizmet bedeli', 36_000_00, 'arsa_payi'],
      ['yedek', 'Yedek akçe', 12_000_00, 'arsa_payi'],
    ],
    deniz: [
      ['personel', 'Site görevlisi ve bahçıvan', 360_000_00, 'esit'],
      ['guvenlik', 'Güvenlik hizmeti', 120_000_00, 'esit'],
      ['enerji', 'Ortak alan elektrik ve su', 90_000_00, 'arsa_payi'],
      ['peyzaj', 'Bahçe bakımı', 30_000_00, 'arsa_payi'],
      ['bakim', 'Havuz bakımı ve kimyasallar', 40_000_00, 'arsa_payi'],
      ['sigorta', 'Bina ortak alan sigortası', 24_000_00, 'arsa_payi'],
      ['yonetim', 'Profesyonel yönetim hizmet bedeli', 64_000_00, 'arsa_payi'],
      ['yedek', 'Yedek akçe', 20_000_00, 'arsa_payi'],
    ],
  }
  const budgetIds: Record<string, number> = {}
  for (const [key, lines] of Object.entries(budgets)) {
    const id = insert(db, 'budgets', {
      site_id: sites[key],
      name: `${year} İşletme Projesi`,
      start_month: `${year}-01`,
      months: 12,
      round_to: 100,
      status: 'onaylandi',
      approved_at: `${year}-01-20T17:00:00Z`,
      approved_note: `${year} olağan kat malikleri kurulunda kabul edildi`,
    })
    budgetIds[key] = id
    for (const [category, name, amount, method] of lines)
      insert(db, 'budget_lines', { budget_id: id, category, name, annual_amount: amount, method })
  }
  // Gelecek yıl için taslak (TÜFE varsayımıyla artırılmış)
  const draftId = insert(db, 'budgets', {
    site_id: sites.lale,
    name: `${year + 1} İşletme Projesi (taslak)`,
    start_month: `${year + 1}-01`,
    months: 12,
    round_to: 100,
  })
  for (const [category, name, amount, method] of budgets.lale!) {
    insert(db, 'budget_lines', {
      budget_id: draftId,
      category,
      name,
      annual_amount: Math.round((amount * 1.32) / 100_00) * 100_00,
      method,
    })
  }

  // --- Devralınan portföy: Deniz Konutları önceki yönetimden devir bakiyeleriyle geldi ---
  const firstMonth = addMonths(month, -5)
  const devirDate = dateInMonth(firstMonth, 1)
  const deniz = (k: string) => units.find((u) => u.key === `deniz:${k}`)!
  insert(db, 'charges', {
    site_id: sites.deniz,
    unit_id: deniz('Martı-3').id,
    kind: 'devir',
    description: `Devir bakiyesi (önceki yönetim, ${devirDate})`,
    amount: 7_500_00,
    due_date: devirDate,
    late_fee: 0,
    batch_key: 'devir',
  })
  insert(db, 'charges', {
    site_id: sites.deniz,
    unit_id: deniz('Yelken-6').id,
    kind: 'devir',
    description: `Devir bakiyesi (önceki yönetim, ${devirDate})`,
    amount: 12_800_00,
    due_date: devirDate,
    late_fee: 0,
    batch_key: 'devir',
  })
  insert(db, 'payments', {
    site_id: sites.deniz,
    unit_id: deniz('Martı-8').id,
    amount: 2_000_00,
    paid_on: devirDate,
    method: 'havale',
    source: 'devir',
    note: 'Devir avansı (önceki yönetim)',
  })

  // --- 6 aylık tahakkuk ---
  for (let k = 5; k >= 0; k--) {
    const m = addMonths(month, -k)
    for (const key of Object.keys(sites)) generateAccruals(db, { siteId: sites[key]!, month: m, orgId })
  }

  // --- Tahsilatlar: profillere göre ---
  const profile: Record<string, string> = {
    'lale:A-8': 'borclu3',
    'lale:B-4': 'kismi',
    'lale:A-3': 'gec',
    'lale:B-9': 'gec',
    'lale:B-10': 'gec',
    'lale:A-12': 'avans',
    'cinar:7': 'borclu4',
    'cinar:1': 'gec',
    'cinar:4': 'son_ay',
    'deniz:Yelken-6': 'borclu6',
    'deniz:Martı-3': 'gec',
    'deniz:Yelken-2': 'borclu2',
  }
  const bankRows: { date: string; desc: string; amount: number; ref: string; siteKey: string }[] = []
  const monthNameUpper = (m: string) => trUpper(monthLabel(m).split(' ')[0]!)
  for (const u of units) {
    const p = profile[u.key] ?? 'duzenli'
    const charges = unitCharges(db, u.id).filter((c) => c.kind === 'aidat')
    if (p === 'avans') {
      const total = (charges[0]?.amount ?? 0) * 12
      recordPayment(db, {
        orgId,
        siteId: sites[u.siteKey]!,
        unitId: u.id,
        amount: total,
        paidOn: addDays(charges[0]!.due_date, -6),
        method: 'havale',
        note: '12 aylık peşin aidat',
      })
      continue
    }
    charges.forEach((c, i) => {
      const fromEnd = charges.length - 1 - i
      if (p === 'borclu3' && fromEnd < 3) return
      if (p === 'borclu4' && fromEnd < 4) return
      if (p === 'borclu6') return
      if (p === 'borclu2' && fromEnd < 2) return
      if (p === 'son_ay' && fromEnd === 0) return
      let paidOn = p === 'gec' ? addDays(c.due_date, ri(5, 25)) : addDays(c.due_date, -ri(0, 8))
      let amount = c.amount
      if (p === 'kismi' && fromEnd < 2) {
        amount = Math.round(c.amount / 2 / 100) * 100
        paidOn = addDays(c.due_date, ri(3, 12))
      }
      if (paidOn > today) return
      const isCurrent = c.period === month
      if (isCurrent && p === 'duzenli' && u.siteKey !== 'deniz' && units.indexOf(u) % 3 === 0) {
        // Bu ayın bazı havaleleri henüz eşleştirilmedi: banka dökümünde bekliyor
        const style = units.indexOf(u) % 4
        const name = trUpper(u.payerName)
        const blk = u.block ? `${u.block[0]} BLK ` : ''
        const desc =
          style === 0
            ? `FAST ${name} ${blk}D:${u.no} ${monthNameUpper(month)} AIDAT`
            : style === 1
              ? `EFT GELEN ${name} AIDAT`
              : style === 2
                ? `HAVALE ${u.block ? `${u.block.split(' ')[0]}-${u.no}` : `DAIRE ${u.no}`} ${monthNameUpper(month)}`
                : `INTERNET BANKACILIGI ${name}`
        bankRows.push({
          date: paidOn,
          desc,
          amount,
          ref: `D${String(100000 + u.id * 13).slice(-6)}`,
          siteKey: u.siteKey,
        })
        return
      }
      const method = r() < 0.15 ? 'online' : r() < 0.08 ? 'nakit' : 'havale'
      recordPayment(db, {
        orgId,
        siteId: sites[u.siteKey]!,
        unitId: u.id,
        amount,
        paidOn,
        method,
        source: method === 'online' ? 'online' : method === 'havale' ? 'banka' : 'manuel',
        note: method === 'havale' ? `${monthLabel(c.period ?? month)} aidatı — havale` : null,
      })
    })
  }
  // Bekleyen banka dökümleri (Lale ve Çınar)
  for (const key of ['lale', 'cinar']) {
    const rows = bankRows.filter((b) => b.siteKey === key)
    const extra =
      key === 'lale'
        ? [
            {
              date: addDays(today, -2),
              desc: 'GELEN EFT REKLAM PANOSU KIRASI MEDYA LTD',
              amount: 2_500_00,
              ref: 'D900001',
              siteKey: key,
            },
          ]
        : []
    const lines = [...rows, ...extra].map(
      (b) =>
        `${b.date.slice(8, 10)}.${b.date.slice(5, 7)}.${b.date.slice(0, 4)};${b.desc};${formatTL(b.amount).replace('₺', '')};${b.ref}`,
    )
    if (lines.length === 0) continue
    const csv = [
      'Hesap Hareketleri',
      `Hesap;${key === 'lale' ? 'Lale Evleri Sitesi Yönetimi' : 'Çınar Apartmanı Yönetimi'}`,
      '',
      'İşlem Tarihi;Açıklama;Tutar;Dekont No',
      ...lines,
    ].join('\n')
    createBankImport(db, {
      siteId: sites[key]!,
      csv,
      filename: `banka-${key}-${month}.csv`,
      userId: adminId,
      asOf: today,
    })
  }

  // --- Giderler (son 6 ay) ---
  for (const [key, lines] of Object.entries(budgets)) {
    for (let k = 5; k >= 0; k--) {
      const m = addMonths(month, -k)
      for (const [category, name, annual] of lines) {
        if (category === 'yedek') continue
        if (category === 'sigorta' && k !== 4) continue
        if (k === 0 && !['enerji', 'personel', 'yonetim'].includes(category)) continue
        const base = category === 'sigorta' ? annual : annual / 12
        let amount = Math.round((base * (0.9 + r() * 0.2)) / 100) * 100
        if (k === 0 && category === 'enerji' && key === 'lale') amount = Math.round((base * 1.85) / 100) * 100
        const vendorKey = {
          asansor: 'asansor',
          temizlik: 'temizlik',
          peyzaj: 'peyzaj',
          guvenlik: 'guvenlik',
          bakim: 'genel',
        }[category]
        insert(db, 'expenses', {
          site_id: sites[key],
          spent_on: dateInMonth(m, k === 0 ? Math.min(5, Number(today.slice(8, 10))) : ri(3, 25)),
          category,
          description: `${name} — ${monthLabel(m)}`,
          amount,
          vendor_id: vendorKey ? vendor[vendorKey] : null,
          invoice_no: vendorKey ? `F${year}${String(ri(10000, 99999))}` : null,
        })
      }
    }
  }

  // --- Periyodik kontroller ---
  const comp = (
    key: string,
    kind: string,
    title: string,
    months: number,
    daysAgo: number,
    vendorKey: string | null,
    result: string | null = null,
  ) => {
    const last = addDays(today, -daysAgo)
    const next = nextDue(last, months)
    insert(db, 'compliance_items', {
      site_id: sites[key],
      kind,
      title,
      interval_months: months,
      last_done: last,
      next_due: next,
      vendor_id: vendorKey ? vendor[vendorKey] : null,
      result,
    })
  }
  comp('lale', 'asansor_periyodik', 'Asansör yıllık periyodik kontrolü (4 asansör)', 12, 355, 'asansor', 'yesil')
  comp('lale', 'asansor_bakim', 'Asansör aylık bakımı', 1, 25, 'asansor')
  comp('lale', 'yangin_tup', 'Yangın söndürme tüpleri kontrolü', 12, 200, 'yangin')
  comp('lale', 'su_deposu', 'Su deposu temizliği ve dezenfeksiyonu', 6, 192, 'temizlik')
  comp('lale', 'dogalgaz', 'Doğalgaz tesisatı sızdırmazlık kontrolü', 12, 300, 'isitma')
  comp('lale', 'sigorta', 'Bina ortak alan sigortası yenileme', 12, 340, null)
  comp('lale', 'jenerator', 'Jeneratör bakımı', 6, 100, 'elektrik')
  comp('cinar', 'asansor_periyodik', 'Asansör yıllık periyodik kontrolü', 12, 400, 'asansor', 'mavi')
  comp('cinar', 'yangin_tup', 'Yangın söndürme tüpleri kontrolü', 12, 380, 'yangin')
  comp('cinar', 'dogalgaz', 'Kalorifer kazanı ve doğalgaz kontrolü', 12, 100, 'isitma')
  comp('deniz', 'havuz', 'Havuz suyu analizi', 1, 20, 'genel')
  comp('deniz', 'asansor_periyodik', 'Asansör yıllık periyodik kontrolü', 12, 200, 'asansor', 'sari')
  comp('deniz', 'paratoner', 'Paratoner ölçümü', 12, 300, 'elektrik')
  comp('deniz', 'sigorta', 'Bina ortak alan sigortası yenileme', 12, 30, null)

  // --- Belgeler (asistanın bilgi kaynağı) ---
  const doc = (siteKey: string | null, title: string, kind: string, body: string) => {
    const id = insert(db, 'documents', {
      org_id: orgId,
      site_id: siteKey ? sites[siteKey] : null,
      title,
      kind,
      body,
      visibility: 'sakin',
    })
    indexDocument(db, id, body)
  }
  doc(null, 'Sıkça Sorulan Sorular', 'sss', FAQ)
  doc('lale', 'Lale Evleri Site İç Yönetmeliği', 'ic_yonetmelik', LALE_RULES)
  doc('lale', 'Lale Evleri Yönetim Planı (özet)', 'yonetim_plani', LALE_PLAN)
  doc('lale', `${year} Olağan Kat Malikleri Kurulu Kararları`, 'karar', LALE_DECISIONS(year))
  doc('cinar', 'Çınar Apartmanı Kullanım Kuralları', 'ic_yonetmelik', CINAR_RULES)
  doc('deniz', 'Deniz Konutları Havuz ve Sosyal Tesis Kuralları', 'ic_yonetmelik', DENIZ_RULES)

  // --- Talepler (geçmiş) ---
  const u = (key: string) => units.find((x) => x.key === key)!
  const t1 = createTicket(db, {
    orgId,
    siteId: sites.lale!,
    title: 'Otopark aydınlatması yanmıyor',
    description: '-2. kat otoparkta 6 armatür yanmıyor.',
    category: 'elektrik',
    priority: 'normal',
    location: 'Ortak alan',
    source: 'personel',
    actor: 'Murat Şahin',
    now: new Date(now.getTime() - 22 * 86_400_000),
  })
  run(db, 'UPDATE tickets SET vendor_id = ?, cost = ? WHERE id = ?', vendor.elektrik, 1_850_00, t1)
  addTicketEvent(db, t1, 'Murat Şahin', 'atama', 'Volt Elektrik görevlendirildi', true)
  setTicketStatus(db, t1, 'cozuldu', 'Volt Elektrik', 'Armatürler LED ile değiştirildi')
  const t2 = createTicket(db, {
    orgId,
    siteId: sites.lale!,
    title: 'B Blok giriş kapısı kartlı geçiş arızası',
    description: 'Kart okuyucu bazı kartları tanımıyor, kapı açık kalıyor.',
    category: 'guvenlik',
    priority: 'yuksek',
    location: 'Ortak alan',
    source: 'telefon',
    actor: 'Murat Şahin',
    now: new Date(now.getTime() - 3 * 86_400_000),
  })
  run(db, `UPDATE tickets SET vendor_id = ?, status = 'islemde' WHERE id = ?`, vendor.guvenlik, t2)
  addTicketEvent(
    db,
    t2,
    'Güven Kilit ve Kamera',
    'yorum',
    'Kart okuyucu kartı sipariş edildi, Perşembe takılacak.',
    true,
  )
  createTicket(db, {
    orgId,
    siteId: sites.lale!,
    unitId: u('lale:A-2').id,
    personId: u('lale:A-2').payerId,
    title: 'Çocuk parkında salıncak zinciri kopuk',
    description: 'Salıncaklardan birinin zinciri kopmuş, çocuklar için tehlikeli.',
    category: 'peyzaj',
    priority: 'normal',
    location: 'Ortak alan',
    source: 'portal',
    actor: u('lale:A-2').payerName,
    now: new Date(now.getTime() - 1 * 86_400_000),
  })
  const t4 = createTicket(db, {
    orgId,
    siteId: sites.cinar!,
    title: 'Çatı oluğu tıkalı — yağmurda taşıyor',
    description: 'Cephede su izi oluştu.',
    category: 'cati_cephe',
    priority: 'normal',
    location: 'Ortak alan',
    source: 'personel',
    actor: 'Murat Şahin',
    now: new Date(now.getTime() - 6 * 86_400_000),
  })
  run(db, `UPDATE tickets SET vendor_id = ?, status = 'atandi' WHERE id = ?`, vendor.cati, t4)
  const t5 = createTicket(db, {
    orgId,
    siteId: sites.deniz!,
    title: 'Havuz pompası ses yapıyor',
    description: 'Kış kapanışı öncesi kontrol gerekli.',
    category: 'diger',
    priority: 'normal',
    location: 'Ortak alan',
    source: 'personel',
    actor: 'Elif Aksoy',
    now: new Date(now.getTime() - 9 * 86_400_000),
  })
  setTicketStatus(db, t5, 'beklemede', 'Elif Aksoy', 'Yedek parça bekleniyor')
  const t6 = createTicket(db, {
    orgId,
    siteId: sites.deniz!,
    title: 'Yelken Blok merdiven otomatiği',
    description: '3. kat merdiven ışığı yanmıyor.',
    category: 'elektrik',
    priority: 'dusuk',
    location: 'Ortak alan',
    source: 'whatsapp',
    actor: 'Elif Aksoy',
    now: new Date(now.getTime() - 15 * 86_400_000),
  })
  setTicketStatus(db, t6, 'kapandi', 'Elif Aksoy')
  insert(db, 'expenses', {
    site_id: sites.lale,
    spent_on: addDays(today, -20),
    category: 'bakim',
    description: 'Otopark armatür değişimi (#' + t1 + ')',
    amount: 1_850_00,
    vendor_id: vendor.elektrik,
    ticket_id: t1,
    invoice_no: `F${year}50211`,
  })

  // --- Genel kurul: yaklaşan (Lale) ve tamamlanmış (Çınar) ---
  const at = (date: string, hhmm: string) =>
    new Date(`${date}T${hhmm}:00+03:00`).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const first = addDays(today, 24)
  const laleMeeting = insert(db, 'meetings', {
    site_id: sites.lale,
    kind: 'olagan',
    title: `${year + 1} Olağan Kat Malikleri Kurulu`,
    first_at: at(first, '19:30'),
    second_at: at(addDays(first, 7), '19:30'),
    location: 'Lale Evleri sosyal tesis toplantı salonu',
  })
  ;[
    ['Açılış ve toplantı başkanlık divanının seçilmesi', null, 'cogunluk'],
    [`${year} yılı yönetim ve denetim raporlarının okunması ve görüşülmesi`, null, 'cogunluk'],
    ['Yöneticinin ibrası', null, 'cogunluk'],
    [
      `${year + 1} işletme projesinin görüşülmesi ve onaylanması`,
      'Taslak proje ekte; aylık aidatlarda yaklaşık %32 artış öngörülüyor.',
      'cogunluk',
    ],
    ['Yönetici ve denetçi seçimi', null, 'sayi_arsa'],
    [
      'Otopark girişine plaka tanıma kamerası kurulması',
      'Faydalı yenilik (KMK m.42); tahmini maliyet 145.000 TL, ek toplama ile.',
      'sayi_arsa',
    ],
    ['Dilek ve temenniler', null, 'cogunluk'],
  ].forEach(([title, details, rule], i) =>
    insert(db, 'agenda_items', { meeting_id: laleMeeting, seq: i + 1, title, details, rule }),
  )

  const cinarMeeting = insert(db, 'meetings', {
    site_id: sites.cinar,
    kind: 'olagan',
    title: `${year} Olağan Kat Malikleri Kurulu`,
    first_at: at(`${year}-01-24`, '14:00'),
    second_at: at(`${year}-01-31`, '14:00'),
    location: 'Çınar Apartmanı giriş katı',
    status: 'tamamlandi',
    held_round: 'ilk',
    invited_at: at(`${year}-01-05`, '10:00'),
  })
  const agendaIds = [
    ['Toplantı başkanlık divanının seçilmesi', 'cogunluk'],
    [`${year} işletme projesinin onaylanması`, 'cogunluk'],
    ['Yöneticinin seçimi (Yıldız Yapı Yönetim A.Ş.)', 'sayi_arsa'],
    ['Dış cephe boyasının yenilenmesi', 'bestedort'],
  ].map(([title, rule], i) => insert(db, 'agenda_items', { meeting_id: cinarMeeting, seq: i + 1, title, rule }))
  const cinarUnits = units.filter((x) => x.siteKey === 'cinar')
  cinarUnits.forEach((cu, i) => {
    const present = i !== 3 && i !== 8 && i !== 9
    insert(db, 'attendance', {
      meeting_id: cinarMeeting,
      unit_id: cu.id,
      present: present ? 1 : 0,
      proxy: i === 5 ? 'Av. Selim Toprak' : null,
    })
    if (!present) return
    agendaIds.forEach((itemId, k) => {
      const vote = k === 3 ? (i % 3 === 0 ? 'hayir' : 'evet') : i === 6 && k === 1 ? 'cekimser' : 'evet'
      insert(db, 'votes', { item_id: itemId, unit_id: cu.id, vote })
    })
  })
  const cinarDetail = meetingDetail(db, cinarMeeting, now)!
  for (const a of cinarDetail.agenda)
    run(db, 'UPDATE agenda_items SET result = ? WHERE id = ?', a.tally.passed ? 'kabul' : 'ret', a.id)
  run(
    db,
    'UPDATE meetings SET minutes = ? WHERE id = ?',
    minutesText(meetingDetail(db, cinarMeeting, now)!),
    cinarMeeting,
  )

  // --- Duyurular ---
  run(
    db,
    `INSERT INTO announcements (org_id, site_id, title, body, channels, sent_count, ai, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    orgId,
    sites.deniz,
    'Havuz sezonu kapandı',
    'Değerli site sakinlerimiz,\n\nHavuzumuz kış bakımı için kapatılmıştır. Sezon boyunca kurallara gösterdiğiniz özen için teşekkür ederiz.\n\nSite Yönetimi',
    '["whatsapp"]',
    16,
    adminId,
    nowIso(new Date(now.getTime() - 30 * 86_400_000)),
  )
  run(
    db,
    `INSERT INTO announcements (org_id, site_id, title, body, channels, sent_count, ai, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    orgId,
    sites.lale,
    'Planlı su kesintisi',
    `Değerli site sakinlerimiz,\n\nŞebeke bakım çalışması nedeniyle ${addDays(today, 2).split('-').reverse().join('.')} tarihinde 10:00–14:00 saatleri arasında sitemizde su kesintisi olacaktır. Depo suyu yalnız ortak alanlar için kullanılacaktır.\n\nAnlayışınız için teşekkür ederiz.\nSite Yönetimi`,
    '["whatsapp","sms"]',
    24,
    managerId,
    nowIso(new Date(now.getTime() - 1 * 86_400_000)),
  )

  // --- Gelen mesajlar: yapay zekâ hattından geçirilir ---
  const inbound: [string, 'whatsapp' | 'sms' | 'email', string][] = [
    [
      DEMO_RESIDENT_PHONE,
      'whatsapp',
      'Merhaba, mutfak tavanından su damlıyor, üst kattan geliyor olabilir. Bakabilir misiniz? A blok 5',
    ],
    [
      phoneOf(db, u('lale:B-3').payerId),
      'sms',
      'B blok asansör yine çalışmıyor, annem 6. katta oturuyor merdiven çıkamıyor',
    ],
    [
      phoneOf(db, u('cinar:4').payerId),
      'whatsapp',
      'Ekim aidatını havale ettim ama portalda hâlâ borç görünüyor, kontrol eder misiniz?',
    ],
    [
      'merakli.alici@posta.example',
      'email',
      'Merhaba, Lale Evleri’nde satılık daire olduğunu duydum. Aylık aidatlar ne kadar ve otopark var mı?',
    ],
    [
      phoneOf(db, u('lale:A-10').payerId),
      'whatsapp',
      'Üst kattaki komşu gece 2’ye kadar yüksek sesle müzik açıyor, 3 gündür uyuyamıyoruz.',
    ],
    [
      phoneOf(db, u('deniz:Martı-5').payerId),
      'whatsapp',
      'Bahçe düzenlemesi çok güzel olmuş, emeği geçen herkese teşekkür ederiz.',
    ],
  ]
  for (const [from, channel, text] of inbound) {
    await receiveInbound(deps, {
      channel,
      from,
      body: text,
      orgId,
      provider: 'demo',
      providerId: `demo-${from}-${text.length}`,
    })
  }

  // --- Hatırlatmalar: geçmiş kayıt + bugünkü öneriler ---
  insert(db, 'reminders', {
    unit_id: u('cinar:7').id,
    stage: 'hatirlatma',
    amount: 0,
    created_at: nowIso(new Date(now.getTime() - 26 * 86_400_000)),
  })
  await runReminders(deps, {
    orgId,
    siteIds: Object.values(sites),
    asOf: today,
    mode: 'oneri',
    settings: orgSettings(db, orgId),
  })

  return { orgId, sites, units: units.length }
}

function phoneOf(db: DB, personId: number): string {
  return get<{ phone: string }>(db, 'SELECT phone FROM people WHERE id = ?', personId)!.phone
}

const FAQ = `# Aidatımı nasıl öderim?

Aidatınızı sakin portalındaki "Hesabım" bölümünden kredi kartıyla ya da sitenizin banka hesabına havale/EFT ile ödeyebilirsiniz. Havale açıklamasına mutlaka blok ve daire numaranızı yazın (örnek: "A Blok D:5 Kasım aidat"). Böylece ödemeniz otomatik eşleşir.

# Aidat son ödeme günü ve gecikme tazminatı

Her ayın aidatı, yönetim planında belirtilen son ödeme gününe kadar ödenir. Kat Mülkiyeti Kanunu m.20 gereği zamanında ödenmeyen ortak gider payına, geciken her gün için aylık yüzde beş hesabıyla gecikme tazminatı uygulanır.

# Arıza nasıl bildirilir?

Arızaları sakin portalındaki "Talepler" bölümünden, WhatsApp hattımızdan ya da yönetim ofisini arayarak bildirebilirsiniz. Her bildirime bir talep numarası verilir ve süreç portaldan izlenir.

# Acil durumlar

Gaz kokusu alırsanız elektrik düğmelerine dokunmayın, pencereleri açın ve 187 Doğalgaz Acil hattını arayın. Yangın ve sağlık acil durumlarında 112’yi arayın. Asansörde mahsur kalındığında kabin içindeki alarm düğmesine basın.

# Kişisel verilerim nasıl korunur?

Kişisel verileriniz 6698 sayılı KVKK kapsamında yalnız site yönetimi hizmetinin yürütülmesi için işlenir. Portalın "Gizlilik" bölümünden iletişim tercihlerinizi değiştirebilir ve verilerinizin dökümünü indirebilirsiniz.

# Kiracıyım, aidatı kim öder?

Aidat ödeme sorumluluğu kat malikindedir; ancak kiracı ile malik arasındaki anlaşmaya göre ödemeyi kiracı yapabilir. Kayıtlarımızda ödeyen kişi olarak kim tanımlıysa hatırlatmalar ona gönderilir.`

const LALE_RULES = `# Ortak alanların kullanımı

Ortak alanlar tüm sakinlerin ortak malıdır. Koridor, merdiven ve yangın kaçış yollarına eşya, ayakkabılık ve bisiklet bırakılamaz.

# Havuz

Açık havuz 1 Haziran ile 15 Eylül arasında her gün 09:00–21:00 saatleri arasında açıktır. Pazartesi 09:00–12:00 arası bakım nedeniyle kapalıdır. 12 yaş altı çocuklar yanlarında bir yetişkin olmadan havuza giremez. Havuza misafir getirmek için yönetime önceden bilgi verilir; her daire en fazla 2 misafir getirebilir.

# Otopark

Her daireye kapalı otoparkta bir araçlık yer tahsis edilmiştir. İkinci araçlar açık otoparkta boş yerlere park edebilir. Misafir araçları için giriş kapısındaki güvenliğe plaka bildirilmelidir. Otoparkta araç yıkanamaz.

# Evcil hayvanlar

Evcil hayvanlar ortak alanlarda tasmalı gezdirilir. Dışkılar sahibi tarafından toplanır. Havuz ve çocuk parkı alanına evcil hayvan sokulmaz.

# Gürültü ve tadilat

Hafta içi 22:00–08:00, hafta sonu 23:00–10:00 saatleri sessizlik saatleridir. Tadilat ve gürültülü işler yalnız hafta içi 09:00–18:00, cumartesi 10:00–16:00 saatleri arasında yapılabilir; pazar günü tadilat yapılamaz. Tadilat başlamadan önce yönetime yazılı bilgi verilir.

# Çöp ve geri dönüşüm

Evsel atıklar her gün 20:00’den sonra kapıcı tarafından kapı önünden alınır. Ambalaj atıkları blok girişlerindeki geri dönüşüm kutularına, atık piller güvenlik kulübesindeki kutuya bırakılır.

# Sosyal tesis

Sosyal tesis toplantı salonu sakinler tarafından ücretsiz olarak, en az 3 gün önceden yönetimden rezervasyon yapılarak kullanılabilir.`

const LALE_PLAN = `# Yönetim

Anagayrimenkulün yönetimi kat malikleri kurulunca seçilen yöneticiye aittir. Kurul yönetimi profesyonel bir yönetim şirketine bırakabilir. Yönetici her yıl kurula hesap verir.

# Ortak giderlere katılma

Kapıcı, kaloriferci, bahçıvan ve bekçi giderleri bağımsız bölümler arasında eşit olarak; sigorta, ortak yerlerin bakım, onarım ve işletme giderleri ile yönetici ücreti arsa payları oranında paylaşılır.

# Ödeme günü

Aylık aidat her ayın 15’ine kadar ödenir. Zamanında ödenmeyen aidata Kat Mülkiyeti Kanunu m.20 uyarınca aylık %5 gecikme tazminatı uygulanır.

# Kat malikleri kurulu

Olağan kurul her yıl Aralık ayında toplanır. Toplantı çağrısı en az on beş gün önce yapılır; çağrıda ikinci toplantının yeri ve zamanı da belirtilir.

# Yedek akçe

Beklenmeyen büyük onarımlar için işletme projesine yedek akçe konur. Yedek akçenin kullanılması yönetimin önerisi ve denetçinin onayıyla olur.`

const LALE_DECISIONS = (year: number) => `# ${year} işletme projesi

${year} yılı işletme projesi kabul edildi. Aylık aidatlar daire büyüklüğüne ve arsa payına göre yaklaşık 3.600 TL ile 4.100 TL arasında belirlendi.

# Çatı onarımı

B Blok çatı izolasyonunun yenilenmesine ve maliyetin ek toplama ile arsa payı oranında karşılanmasına karar verildi.

# Kamera sistemi

Site girişindeki kameraların yenilenmesi için üç teklif alınması ve bir sonraki kurulda karara bağlanması kararlaştırıldı.

# Yönetim

Yönetimin Yıldız Yapı Yönetim A.Ş.’ye bırakılmasına ve hizmet bedelinin işletme projesine konmasına karar verildi.`

const CINAR_RULES = `# Apartman kuralları

Apartman giriş kapısı 23:00’ten sonra kilitli tutulur. Bodrum kattaki bisiklet odası yalnız apartman sakinlerinin kullanımına açıktır.

# Kalorifer

Kalorifer 15 Ekim ile 15 Nisan arasında yakılır. Hafta içi 06:00–23:00, hafta sonu 07:00–24:00 saatleri arasında çalışır.

# Çöp

Çöpler her gün 19:00–21:00 arasında kapı önüne bırakılır, kapıcı tarafından toplanır.`

const DENIZ_RULES = `# Havuz

Havuz 1 Haziran ile 30 Eylül arasında 10:00–20:00 saatleri arasında açıktır. Cankurtaran bulunmadığında havuza girilemez.

# Spor salonu

Spor salonu her gün 07:00–23:00 arasında açıktır. 16 yaş altı kullanıcılar yanlarında bir yetişkinle girebilir.

# Barbekü alanı

Barbekü alanı en az bir gün önceden site görevlisine bildirilerek kullanılır; kullanım sonrası temizlik kullanana aittir.`
