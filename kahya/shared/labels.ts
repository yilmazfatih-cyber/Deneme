// Sunucu ve arayüzün ortak kullandığı sabitler ve Türkçe etiketler.
// Anahtarlar veritabanında saklanır (ASCII, değişmez); etiketler ekranda gösterilir.

export const ROLES = {
  admin: 'Şirket yöneticisi',
  yonetici: 'Site yöneticisi',
  muhasebe: 'Muhasebe / denetçi',
  sakin: 'Sakin',
} as const
export type Role = keyof typeof ROLES
export const STAFF_ROLES: Role[] = ['admin', 'yonetici', 'muhasebe']

export const TICKET_CATEGORIES = {
  tesisat: 'Su / tesisat',
  elektrik: 'Elektrik',
  asansor: 'Asansör',
  isitma: 'Isıtma / doğalgaz',
  temizlik: 'Temizlik / haşere',
  guvenlik: 'Güvenlik / kapı',
  otopark: 'Otopark',
  gurultu: 'Gürültü / komşuluk',
  peyzaj: 'Bahçe / peyzaj',
  cati_cephe: 'Çatı / cephe / nem',
  aidat: 'Aidat / ödeme',
  diger: 'Diğer',
} as const
export type TicketCategory = keyof typeof TICKET_CATEGORIES

export const PRIORITIES = { acil: 'Acil', yuksek: 'Yüksek', normal: 'Normal', dusuk: 'Düşük' } as const
export type Priority = keyof typeof PRIORITIES

/** Önceliğe göre ilk müdahale hedefi (saat). */
export const SLA_HOURS: Record<Priority, number> = { acil: 4, yuksek: 24, normal: 72, dusuk: 168 }

export const TICKET_STATUSES = {
  acik: 'Açık',
  atandi: 'Atandı',
  islemde: 'İşlemde',
  beklemede: 'Beklemede',
  cozuldu: 'Çözüldü',
  kapandi: 'Kapandı',
} as const
export type TicketStatus = keyof typeof TICKET_STATUSES
export const OPEN_TICKET_STATUSES: TicketStatus[] = ['acik', 'atandi', 'islemde', 'beklemede']

export const INTENTS = {
  ariza: 'Arıza bildirimi',
  sikayet: 'Şikâyet',
  odeme: 'Aidat / ödeme',
  bilgi: 'Bilgi talebi',
  oneri: 'Öneri',
  tesekkur: 'Teşekkür',
  diger: 'Diğer',
} as const
export type Intent = keyof typeof INTENTS

export const VENDOR_TRADES = {
  tesisat: 'Sıhhi tesisat',
  elektrik: 'Elektrik',
  asansor: 'Asansör',
  isitma: 'Kombi / kalorifer',
  temizlik: 'Temizlik',
  ilaclama: 'İlaçlama',
  guvenlik: 'Güvenlik / kamera / kapı',
  peyzaj: 'Bahçe / peyzaj',
  cati_cephe: 'Çatı / cephe / yalıtım',
  boya: 'Boya / badana',
  yangin: 'Yangın güvenliği',
  cilingir: 'Çilingir',
  genel: 'Genel tamir',
} as const
export type VendorTrade = keyof typeof VENDOR_TRADES

/** Talep kategorisinden önerilen usta / firma türü. */
export const CATEGORY_TRADE: Partial<Record<TicketCategory, VendorTrade>> = {
  tesisat: 'tesisat',
  elektrik: 'elektrik',
  asansor: 'asansor',
  isitma: 'isitma',
  temizlik: 'temizlik',
  guvenlik: 'guvenlik',
  peyzaj: 'peyzaj',
  cati_cephe: 'cati_cephe',
}

export const CHANNELS = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'E-posta',
  portal: 'Sakin portalı',
  telefon: 'Telefon',
} as const
export type Channel = keyof typeof CHANNELS
export const SENDABLE_CHANNELS: Channel[] = ['whatsapp', 'sms', 'email']

export const CHARGE_KINDS = {
  aidat: 'Aidat',
  ek: 'Ek toplama',
  gecikme: 'Gecikme tazminatı',
  devir: 'Devir bakiyesi',
  diger: 'Diğer',
} as const
export type ChargeKind = keyof typeof CHARGE_KINDS

export const PAYMENT_METHODS = {
  havale: 'Havale / EFT',
  nakit: 'Nakit',
  kart: 'Kredi kartı',
  online: 'Online ödeme',
} as const
export type PaymentMethod = keyof typeof PAYMENT_METHODS

export const DISTRIBUTION_METHODS = {
  esit: 'Eşit (KMK 20/a)',
  arsa_payi: 'Arsa payı oranında (KMK 20/b)',
  m2: 'Metrekare oranında',
} as const
export type DistributionMethod = keyof typeof DISTRIBUTION_METHODS

export const BUDGET_CATEGORIES = {
  personel: 'Personel (kapıcı, kaloriferci, bahçıvan, bekçi)',
  enerji: 'Ortak alan elektrik / su / doğalgaz',
  bakim: 'Bakım ve onarım',
  asansor: 'Asansör bakımı',
  temizlik: 'Temizlik ve malzeme',
  guvenlik: 'Güvenlik / bekçi hizmeti',
  peyzaj: 'Bahçe / peyzaj',
  sigorta: 'Bina sigortası',
  yonetim: 'Yönetim hizmet bedeli',
  demirbas: 'Demirbaş',
  yedek: 'Yedek akçe',
  diger: 'Diğer',
} as const
export type BudgetCategory = keyof typeof BUDGET_CATEGORIES

/** KMK m.20: kapıcı, kaloriferci, bahçıvan ve bekçi giderleri eşit; diğer tüm ortak giderler (sigorta, bakım-onarım,
 * yönetici ücreti…) arsa payı oranında paylaşılır — kat malikleri başka türlü anlaşmadıkça. */
export const DEFAULT_METHOD: Record<BudgetCategory, DistributionMethod> = {
  personel: 'esit',
  enerji: 'arsa_payi',
  bakim: 'arsa_payi',
  asansor: 'arsa_payi',
  temizlik: 'arsa_payi',
  guvenlik: 'esit',
  peyzaj: 'arsa_payi',
  sigorta: 'arsa_payi',
  yonetim: 'arsa_payi',
  demirbas: 'arsa_payi',
  yedek: 'arsa_payi',
  diger: 'arsa_payi',
}

export const EXPENSE_CATEGORIES = BUDGET_CATEGORIES

/** Önerilen periyotlar (ay). Mevzuat ve üretici talimatına göre site bazında değiştirilebilir. */
export const COMPLIANCE_KINDS = {
  asansor_periyodik: { label: 'Asansör yıllık periyodik kontrolü (A tipi muayene kuruluşu)', months: 12 },
  asansor_bakim: { label: 'Asansör aylık bakımı', months: 1 },
  yangin_tup: { label: 'Yangın söndürme tüpleri kontrolü / dolumu', months: 12 },
  yangin_sistem: { label: 'Yangın algılama ve söndürme sistemi bakımı', months: 6 },
  dogalgaz: { label: 'Doğalgaz tesisatı sızdırmazlık kontrolü', months: 12 },
  jenerator: { label: 'Jeneratör bakımı', months: 6 },
  su_deposu: { label: 'Su deposu temizliği ve dezenfeksiyonu', months: 6 },
  hidrofor: { label: 'Hidrofor bakımı', months: 12 },
  paratoner: { label: 'Paratoner (yıldırımdan korunma) ölçümü', months: 12 },
  sigorta: { label: 'Bina ortak alan sigortası yenileme', months: 12 },
  dask: { label: 'DASK hatırlatması (bağımsız bölümler)', months: 12 },
  havuz: { label: 'Havuz suyu analizi', months: 1 },
  oyun_alani: { label: 'Çocuk oyun alanı güvenlik kontrolü', months: 12 },
  diger: { label: 'Diğer', months: 12 },
} as const
export type ComplianceKind = keyof typeof COMPLIANCE_KINDS

export const MEETING_RULES = {
  cogunluk: 'Olağan karar — katılanların salt çoğunluğu',
  sayi_arsa: 'Tüm maliklerin sayı ve arsa payı çoğunluğu (yönetici seçimi, faydalı yenilik)',
  bestedort: 'Tüm maliklerin beşte dördü (yönetim planı değişikliği)',
  oybirligi: 'Tüm maliklerin oybirliği',
} as const

export const ELEVATOR_LABELS = {
  yesil: 'Yeşil etiket — güvenli',
  mavi: 'Mavi etiket — hafif kusurlu',
  sari: 'Sarı etiket — kusurlu',
  kirmizi: 'Kırmızı etiket — güvensiz, kullanılamaz',
} as const
export type MeetingRule = keyof typeof MEETING_RULES

export const AI_KINDS = {
  triage: 'Mesaj sınıflandırma',
  yanit: 'Yanıt taslağı',
  talep: 'Talep oluşturma',
  atama: 'Usta / firma atama',
  hatirlatma: 'Ödeme hatırlatması',
  duyuru: 'Duyuru taslağı',
  soru: 'Sakin sorusu',
  eslestirme: 'Banka eşleştirme',
  tutanak: 'Toplantı tutanağı',
} as const
export type AiKind = keyof typeof AI_KINDS

export const AUTONOMY_LEVELS = { kapali: 'Kapalı', oneri: 'Öneri — onayla', otomatik: 'Otomatik' } as const
export type AutonomyLevel = keyof typeof AUTONOMY_LEVELS

export const AUTONOMY_ACTIONS = {
  create_ticket: 'Gelen mesajdan talep oluşturma',
  reply: 'Gelen mesaja yanıt gönderme',
  assign_vendor: 'Talebe usta / firma atama',
  payment_reminder: 'Geciken aidat hatırlatması',
} as const
export type AutonomyAction = keyof typeof AUTONOMY_ACTIONS

export type OrgSettings = {
  autonomy: Record<AutonomyAction, AutonomyLevel>
  /** Her ayın ilk günü onaylı işletme projesinden aidat tahakkuku. */
  autoAccrual: boolean
  /** Her ayın ilk günü önceki ay sonuna kadar KMK m.20 gecikme tazminatı tahakkuku. */
  autoLateFee: boolean
  reminders: { firstAfterDays: number; secondAfterDays: number; finalAfterDays: number; channels: Channel[] }
  emergencyPhone: string | null
}

export const DEFAULT_SETTINGS: OrgSettings = {
  autonomy: { create_ticket: 'otomatik', reply: 'oneri', assign_vendor: 'oneri', payment_reminder: 'oneri' },
  autoAccrual: true,
  autoLateFee: false,
  reminders: { firstAfterDays: 5, secondAfterDays: 20, finalAfterDays: 45, channels: ['whatsapp', 'sms'] },
  emergencyPhone: null,
}

export const REMINDER_STAGES = {
  nazik: 'Nazik hatırlatma',
  hatirlatma: 'İkinci hatırlatma',
  son: 'Son hatırlatma (yasal süreç öncesi)',
} as const
export type ReminderStage = keyof typeof REMINDER_STAGES

export const BUDGET_STATUSES = {
  taslak: 'Taslak',
  onaylandi: 'Kurulca onaylı',
  gecici: 'Geçici işletme projesi',
} as const
export type BudgetStatus = keyof typeof BUDGET_STATUSES
