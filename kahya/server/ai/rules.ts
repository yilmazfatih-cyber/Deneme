// Kural tabanlı Türkçe motor: API anahtarı yokken ya da Claude'a ulaşılamadığında aynı görevleri yerel yapar.
// Anahtar kelimeler sadeleştirilmiş (fold) metinde aranır: "sızıntı" ve "sizinti" aynı sayılır.
import { TICKET_CATEGORIES, type Intent, type Priority, type TicketCategory } from '../../shared/labels.ts'
import { extractUnitHint } from '../domain/matcher.ts'
import type { Hit } from '../domain/search.ts'
import { firstName, fold, tokenize, truncate } from '../domain/text.ts'
import type { Announcement, Answer, Triage } from './schemas.ts'

type Hazard = { words: string[]; category: TicketCategory; advice: string }

// Anahtar kelimeler kelime BAŞINDAN eşleşir ("sizinti" → "sızıntısı"); sonunda boşluk olanlar tam kelimedir ("su ").
const HAZARDS: Hazard[] = [
  {
    words: ['gaz koku', 'dogalgaz koku', 'gaz kacag', 'gaz kacak', 'dogalgaz kacak', 'gaz sizinti'],
    category: 'isitma',
    advice:
      'Elektrik düğmelerine ve cihazlara dokunmayın, ateş yakmayın, pencereleri açın, binadan çıkın ve 187 Doğalgaz Acil hattını arayın.',
  },
  {
    words: ['yangin', 'duman ', 'dumanl', 'alev ', 'alevler', 'yaniyor', 'yanik koku'],
    category: 'elektrik',
    advice: 'Hemen 112’yi arayın, asansörü kullanmayın ve merdivenden binayı terk edin.',
  },
  {
    words: ['asansorde kal', 'asansorde mahsur', 'mahsur kal', 'asansorde sikis', 'icinde kaldi', 'icinde kald'],
    category: 'asansor',
    advice: 'Kabindekilere alarm düğmesine basmalarını ve kapıyı zorlamamalarını söyleyin; gerekirse 112’yi arayın.',
  },
  {
    words: ['su basti', 'su basiyor', 'sel ', 'su baskin', 'her yer su', 'su fiskir', 'boru patla', 'patlak boru'],
    category: 'tesisat',
    advice: 'Mümkünse dairenizin ana su vanasını kapatın ve elektrikli cihazları sudan uzak tutun.',
  },
  {
    words: ['kivilcim', 'elektrik carp', 'carpildi', 'priz yandi', 'kablo yandi', 'sigorta yandi'],
    category: 'elektrik',
    advice: 'Sigortayı kapatın, prize ve kablolara dokunmayın; yangın belirtisi varsa 112’yi arayın.',
  },
  {
    words: ['cokme', 'coktu', 'cokuyor', 'catlak buyu', 'dusmek uzere', 'sarkiyor'],
    category: 'cati_cephe',
    advice: 'Bölgeden uzak durun ve çevredekileri uyarın; tehlike sürerse 112’yi arayın.',
  },
]

const CATEGORY_WORDS: [TicketCategory, string[]][] = [
  [
    'aidat',
    [
      'aidat',
      'borc',
      'odeme',
      'odedim',
      'dekont',
      'iban',
      'tahsilat',
      'gecikme',
      'makbuz',
      'havale',
      'eft ',
      'ekstre',
      'yatirdim',
    ],
  ],
  ['asansor', ['asansor']],
  [
    'tesisat',
    [
      'su ',
      'suyu',
      'sular',
      'sizinti',
      'sizdir',
      'kacak',
      'akit',
      'tikan',
      'tikal',
      'gider',
      'musluk',
      'boru',
      'rogar',
      'kanalizasyon',
      'damla',
      'damliyor',
      'tesisat',
      'basinc',
      'lavabo',
      'klozet',
      'rezervuar',
    ],
  ],
  ['isitma', ['kalorifer', 'petek', 'isinma', 'isitma', 'sicak su', 'kombi', 'dogalgaz', 'soguk', 'radyator']],
  [
    'elektrik',
    ['elektrik', 'sigorta', 'isik', 'lamba', 'priz', 'aydinlatma', 'otomatig', 'karanlik', 'ampul', 'armatur'],
  ],
  ['otopark', ['otopark', 'park yer', 'park et', 'arac', 'araba', 'plaka', 'garaj']],
  [
    'gurultu',
    [
      'gurultu',
      'ses',
      'muzik',
      'bagir',
      'tadilat',
      'matkap',
      'havliyor',
      'kavga',
      'rahatsiz',
      'uyuyamiyo',
      'gece yarisi',
      'yuksek sesle',
      'komsu',
    ],
  ],
  ['guvenlik', ['guvenlik', 'kamera', 'kapi', 'hirsiz', 'kilit', 'bariyer', 'yabanci', 'kart ', 'kartli', 'bekci']],
  ['temizlik', ['temizlik', 'temizlen', 'cop', 'kirli', 'koku', 'bocek', 'hamam bocegi', 'fare', 'ilaclama', 'pis']],
  ['peyzaj', ['bahce', 'cim', 'agac', 'sulama', 'peyzaj', 'cicek', 'yaprak', 'salincak', 'cocuk park']],
  ['cati_cephe', ['cati', 'cephe', 'mantolama', 'yalitim', 'rutubet', 'kuf', 'catlak', 'oluk', 'nem ']],
]

const TECHNICAL: TicketCategory[] = [
  'tesisat',
  'elektrik',
  'asansor',
  'isitma',
  'temizlik',
  'guvenlik',
  'peyzaj',
  'cati_cephe',
]
const FAULT_WORDS = [
  'ariza',
  'bozuk',
  'bozul',
  'calismiyor',
  'calismi',
  'yanmiyor',
  'akiyor',
  'akit',
  'damla',
  'damli',
  'sizinti',
  'sizdir',
  'kacak',
  'tikan',
  'tikal',
  'patla',
  'kirik',
  'kirildi',
  'kopuk',
  'koptu',
  'kesildi',
  'kesik',
  'yok ',
  'gelmiyor',
  'acilmiyor',
  'kapanmiyor',
  'ses yapiyor',
  'tehlike',
  'dokulmus',
  'tasiyor',
  'calmiyor',
]
const HIGH_WORDS = [
  'calismiyor',
  'bozuk',
  'bozuldu',
  'su yok',
  'sicak su yok',
  'elektrik yok',
  'isinma yok',
  'kesildi',
  'kilitlenmiyor',
  'kapanmiyor',
  'acilmiyor',
  'tavan',
  'su akiyor',
  'su damliyor',
  'patladi',
  'tasiyor',
]
const INFO_WORDS = [
  'ne zaman',
  'kac ',
  'kacta',
  'nasil',
  'nerede',
  'nereye',
  'hangi',
  'bilgi',
  'ogrenebilir',
  'merak',
  'ne kadar',
  'var mi',
  'mumkun mu',
]
const PAYMENT_ACTION = ['odedim', 'havale ettim', 'yatirdim', 'gonderdim', 'dekont', 'borc gorun', 'cift', 'yanlis']
const THANKS_WORDS = ['tesekkur', 'sagol', 'eline saglik', 'emeginize', 'emegi gecen', 'cok guzel olmus', 'memnun']
const SUGGEST_WORDS = ['oneri', 'onerim', 'teklif ediyorum', 'yapilsa', 'olsa iyi olur', 'konulsa']

/** Metin " kelime kelime " biçiminde; anahtar kelime bir kelimenin başında olmalı. */
const has = (text: string, words: string[]) => words.some((w) => text.includes(` ${w}`))
const count = (text: string, words: string[]) => words.filter((w) => text.includes(` ${w}`)).length

export type TriageContext = { senderName?: string | null; blockKeys?: string[] }

export function ruleTriage(message: string, ctx: TriageContext = {}): Triage {
  const t = ` ${fold(message).replace(/[^a-z0-9]+/g, ' ')} `
  const hazard = HAZARDS.find((h) => has(t, h.words))
  let category: TicketCategory = 'diger'
  let best = 0
  for (const [cat, words] of CATEGORY_WORDS) {
    const n = count(t, words)
    if (n > best) {
      best = n
      category = cat
    }
  }
  if (hazard && !(hazard.category === 'elektrik' && TECHNICAL.includes(category))) category = hazard.category

  const fault = has(t, FAULT_WORDS)
  const question = has(t, INFO_WORDS) || message.includes('?')
  let intent: Intent
  if (hazard) intent = 'ariza'
  else if (category === 'aidat') intent = has(t, PAYMENT_ACTION) || !question ? 'odeme' : 'bilgi'
  else if (has(t, THANKS_WORDS) && !fault) intent = 'tesekkur'
  else if (has(t, SUGGEST_WORDS) && !fault) intent = 'oneri'
  else if (['gurultu', 'otopark'].includes(category)) intent = 'sikayet'
  else if (TECHNICAL.includes(category) && fault) intent = 'ariza'
  else if (question) intent = 'bilgi'
  else if (TECHNICAL.includes(category)) intent = 'ariza'
  else intent = 'diger'

  let priority: Priority = 'normal'
  if (hazard) priority = 'acil'
  else if (intent === 'ariza' && (has(t, HIGH_WORDS) || category === 'asansor')) priority = 'yuksek'
  else if (['bilgi', 'tesekkur', 'oneri', 'odeme', 'diger'].includes(intent)) priority = 'dusuk'

  const needsTicket = intent === 'ariza' || intent === 'sikayet'
  const hint = extractUnitHint(message, ctx.blockKeys)
  const location = has(t, ['dairem', 'evim', 'mutfak', 'banyo', 'salon', 'yatak odasi', 'balkon', 'daire ici'])
    ? 'daire_ici'
    : has(t, ['ortak', 'merdiven', 'koridor', 'giris', 'bahce', 'otopark', 'asansor', 'cati', 'cephe', 'havuz', 'lobi'])
      ? 'ortak_alan'
      : 'bilinmiyor'

  const label = TICKET_CATEGORIES[category]
  const firstSentence = message.split(/[.!?\n]/)[0]?.trim() || message
  const title = needsTicket ? `${label}: ${truncate(firstSentence, 48)}` : truncate(firstSentence, 60)
  const hello = ctx.senderName ? `Merhaba ${firstName(ctx.senderName)},` : 'Merhaba,'

  let reply: string
  if (hazard) {
    reply = `${hello} ${hazard.advice} Bildiriminiz acil olarak kaydedildi ve ekibimiz hemen yönlendiriliyor.`
  } else if (needsTicket) {
    reply = `${hello} bildiriminiz için teşekkür ederiz. Talebiniz "${label}" başlığıyla kaydedildi ve ilgili ekibe iletildi; gelişmeleri size bildireceğiz.`
  } else if (intent === 'odeme') {
    reply = `${hello} güncel borç ve ödeme bilgilerinizi sakin portalındaki "Hesabım" bölümünden görebilir, kartla ödeme yapabilirsiniz. Sorunuzu ayrıca muhasebe ekibimize ilettik.`
  } else if (intent === 'tesekkur') {
    reply = `${hello} güzel geri bildiriminiz için teşekkür ederiz, ekibimize iletiyoruz.`
  } else if (intent === 'oneri') {
    reply = `${hello} öneriniz için teşekkür ederiz. Yönetim kurulunun değerlendirmesine sunacağız.`
  } else {
    reply = `${hello} mesajınız için teşekkür ederiz. Sorunuzu yönetim ekibimize ilettik; kısa süre içinde dönüş yapılacaktır.`
  }

  return {
    intent,
    category,
    priority,
    summary: `${label} — ${truncate(message.replace(/\s+/g, ' '), 110)}`,
    needs_ticket: needsTicket,
    ticket_title: title,
    location,
    block_hint: hint.block,
    unit_hint: hint.unit,
    safety_advice: hazard?.advice ?? null,
    reply,
  }
}

const ACCOUNT_WORDS = [
  'borc',
  'aidatim',
  'aidatimi',
  'aidatimiz',
  'bakiye',
  'odemem',
  'son odeme',
  'gecikme',
  'ekstre',
  'odedim',
  'hesabim',
]

export function ruleAnswer(question: string, hits: Hit[], facts: string | null): Answer {
  const q = ` ${fold(question).replace(/[^a-z0-9]+/g, ' ')} `
  if (facts && has(q, ACCOUNT_WORDS)) {
    return { answer: facts, used_sources: [], needs_staff: false }
  }
  const qTokens = new Set(tokenize(question))
  const top = hits[0]
  if (!top || top.score < 0.5) {
    return {
      answer:
        'Bu konuda site belgelerinde bir bilgi bulamadım. Sorunuzu yönetim ekibine iletebilirim; en kısa sürede size dönüş yapılır.',
      used_sources: [],
      needs_staff: true,
    }
  }
  // En ilgili cümleleri seç
  const sentences = top.chunk.text.split(/(?<=[.!?])\s+/)
  const ranked = sentences
    .map((s, i) => ({ s, i, n: tokenize(s).filter((w) => qTokens.has(w)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i)
  const excerpt = (ranked.length ? ranked.map((x) => x.s) : sentences.slice(0, 2)).join(' ')
  const source = `${top.chunk.title}${top.chunk.heading ? ` — ${top.chunk.heading}` : ''}`
  return {
    answer: `${source} metnine göre: “${truncate(excerpt, 420)}”`,
    used_sources: [1],
    needs_staff: false,
  }
}

export function ruleAnnouncement(brief: string): Announcement {
  const clean = brief.replace(/\s+/g, ' ').trim()
  const first = clean.split(/[.!?]/)[0] ?? clean
  const words = first.split(' ').slice(0, 8).join(' ')
  const title = words.charAt(0).toLocaleUpperCase('tr-TR') + words.slice(1)
  const sentence = clean.charAt(0).toLocaleUpperCase('tr-TR') + clean.slice(1)
  const body = `Değerli site sakinlerimiz,\n\n${/[.!?]$/.test(sentence) ? sentence : `${sentence}.`}\n\nAnlayışınız için teşekkür ederiz.\nSite Yönetimi`
  return { title, body }
}
