// Aşama 3 — İzin sistemi (allow / ask / deny kuralları)
//
// opencode'daki model (packages/core/src/permission.ts): kural = { action, resource, effect }.
// Eşleşen SON kural kazanır; hiçbir kural eşleşmezse sonuç "ask"tır.
// Yapılandırılmış "deny" her zaman önce bakılır; kullanıcının "always" yanıtları ayrı bir
// "kaydedilmiş kurallar" listesine "allow" olarak eklenir.
// Bu dosya opencode'dan kopyalanmadı: aynı kuralları başka bir yapıyla uygular (düzenli ifade
// kurmayan joker eşleyici, listeyi sondan başa tarayan döngüler).

/**
 * `*` (boş dahil her dizi) ve `?` (tam bir karakter) destekleyen joker eşleme.
 * Düzenli ifade kurmadan iki işaretçiyle çalışır: bir `*` görülünce yeri not edilir; ileride eşleşme
 * bozulursa o `*`'a bir karakter daha yutturulup kalan desen yeniden denenir (geri izleme).
 */
export function wildcardMatch(value, pattern) {
  let v = 0 // value içindeki konum
  let p = 0 // pattern içindeki konum
  let star = -1 // son görülen `*`'ın pattern içindeki konumu
  let resume = 0 // o `*` yerleştirildiğinde value'da kalınan konum
  while (v < value.length) {
    const want = pattern[p]
    if (want === '*') {
      star = p
      p += 1
      resume = v
    } else if (p < pattern.length && (want === '?' || want === value[v])) {
      p += 1
      v += 1
    } else if (star !== -1) {
      resume += 1
      p = star + 1
      v = resume
    } else {
      return false
    }
  }
  while (pattern[p] === '*') p += 1
  return p === pattern.length
}

/** Hiçbir kural eşleşmezse verilecek karar: kullanıcıya sor. */
const WHEN_NOTHING_MATCHES = 'ask'

/**
 * Eylem + kaynak için geçerli kuralı bulur. Liste SONDAN başa taranır ve ilk uyan kural döner;
 * bu, "eşleşen son kural kazanır" demektir. Hiçbiri uymazsa karar "ask" olur.
 */
export function evaluate(action, resource, rules) {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index]
    if (wildcardMatch(action, rule.action) && wildcardMatch(resource, rule.resource)) return rule
  }
  return { action, resource: '*', effect: WHEN_NOTHING_MATCHES }
}

/**
 * Eylem tümüyle yasak mı? Eyleme uyan son kural "her kaynak için deny" ise evet.
 * Böyle bir araç modele hiç gösterilmez (opencode: tool.ts, Tool.snapshot).
 */
export function isWhollyDenied(action, rules) {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index]
    if (wildcardMatch(action, rule.action)) return rule.effect === 'deny' && rule.resource === '*'
  }
  return false
}

/** Kural gereği reddedildi: model bunu araç hatası olarak görür. */
export class PermissionDeniedError extends Error {
  constructor(action, resources) {
    super(`İzin reddedildi: ${action} (${resources.join(', ')})`)
    this.name = 'PermissionDeniedError'
  }
}

/** Kullanıcı reddetti ve açıklama yazdı: model düzeltmeyi görür ve devam eder. */
export class PermissionCorrectedError extends Error {
  constructor(feedback) {
    super(`Kullanıcı reddetti: ${feedback}`)
    this.name = 'PermissionCorrectedError'
  }
}

/** Kullanıcı açıklamasız reddetti: adım kesilir (opencode'da da bu durum adımı durdurur). */
export class PermissionRejectedError extends Error {
  constructor(action) {
    super(`Kullanıcı ${action} isteğini reddetti`)
    this.name = 'PermissionRejectedError'
  }
}

let nextRequestId = 1

/**
 * İzin servisi. `ask` kullanıcıya soran fonksiyondur ve
 * 'once' | 'always' | { reply: 'reject', message?: string } döndürür.
 * @param {{ rules: Array<{action: string, resource: string, effect: 'allow'|'ask'|'deny'}>, ask?: Function, saved?: Array }} options
 */
export function createPermissionService(options) {
  const rules = options.rules
  const saved = options.saved ?? []
  const ask = options.ask

  /** Kaynak, verilen kural listesine göre hangi kararı alıyor? */
  const effectOf = (action, list) => (resource) => evaluate(action, resource, list).effect

  return {
    rules,
    saved,
    /**
     * İzni doğrular; gerekirse sorar. Reddedilirse hata fırlatır.
     * @param {{ action: string, resources: string[], save?: string[] }} input
     */
    async assert(input) {
      const { action, resources } = input
      // 1) Yapılandırılmış deny kuralları her zaman kazanır ("always" ile aşılamaz).
      const configured = resources.map(effectOf(action, rules))
      if (configured.includes('deny')) throw new PermissionDeniedError(action, resources)
      // 2) Kaydedilmiş onaylar da hesaba katılır; izinli olmayan tek bir kaynak bile soruyu gerektirir.
      const withSaved = resources.map(effectOf(action, rules.concat(saved)))
      if (withSaved.every((effect) => effect === 'allow')) return 'allow'
      // 3) Sor. Kimse yoksa (ör. zamanlanmış iş) güvenli varsayılan: reddet.
      if (!ask) throw new PermissionDeniedError(action, resources)
      const reply = await ask({ id: `perm_${nextRequestId++}`, action, resources })
      if (reply === 'once') return 'allow'
      if (reply === 'always') {
        for (const resource of input.save ?? resources) saved.push({ action, resource, effect: 'allow' })
        return 'allow'
      }
      if (reply?.message) throw new PermissionCorrectedError(reply.message)
      throw new PermissionRejectedError(action)
    },
    isWhollyDenied: (action) => isWhollyDenied(action, rules),
  }
}

// --- Yerleşik ajanlar ------------------------------------------------------------------------
// Varsayılan kurallar opencode'un varsayılan ajanındakilerle aynı veridir: her şeye izin, .env
// okumaya sor (packages/schema/src/agent.ts). Plan ajanı düzenlemeyi kapatır (gerçekte yalnızca
// plan klasörüne yazabilir: packages/core/src/plugin/plan.ts). Explore önce her şeyi kapatır, sonra
// okuma, arama ve KABUK araçlarını açar (packages/core/src/plugin/agent.ts). Kabuğun salt okunur
// kullanılmasını izin kuralı değil, ajanın istemi ister ("Shell commands MUST be read-only"):
// izin kuralı bir sınırdır, istem yalnızca bir ricadır.

/** .env dosyalarını okumadan önce sor; örnek dosya (.env.example) serbest. */
const ENV_READ_RULES = [
  { action: 'read', resource: '*.env', effect: 'ask' },
  { action: 'read', resource: '*.env.*', effect: 'ask' },
  { action: 'read', resource: '*.env.example', effect: 'allow' },
]

export const DEFAULT_RULES = [{ action: '*', resource: '*', effect: 'allow' }, ...ENV_READ_RULES]

export const agents = {
  build: {
    id: 'build',
    description: 'Varsayılan ajan: araçları izin kurallarına göre çalıştırır.',
    system: 'Sen bir kodlama ajanısın. Önce oku, sonra küçük ve doğrulanabilir değişiklikler yap.',
    // `rm *` kuralı mini'nin kendi örneğidir; opencode'un build ajanında yoktur.
    rules: [...DEFAULT_RULES, { action: 'bash', resource: 'rm *', effect: 'ask' }],
  },
  plan: {
    id: 'plan',
    description: 'Salt okunur: kodu inceler, plan yapar, dosya değiştirmez.',
    system: 'Plan modundasın. Dosya değiştirme; yalnızca incele ve plan öner.',
    rules: [...DEFAULT_RULES, { action: 'edit', resource: '*', effect: 'deny' }],
  },
  explore: {
    id: 'explore',
    description: 'Hızlı keşif alt ajanı: okur, arar, salt okunur kabuk komutları çalıştırır.',
    system: 'Yalnızca ara ve oku. Hiçbir dosyayı değiştirme. Kabuk komutların salt okunur olmalı.',
    rules: [
      { action: '*', resource: '*', effect: 'deny' },
      { action: 'bash', resource: '*', effect: 'allow' },
      { action: 'grep', resource: '*', effect: 'allow' },
      { action: 'glob', resource: '*', effect: 'allow' },
      { action: 'read', resource: '*', effect: 'allow' },
      ...ENV_READ_RULES,
    ],
  },
}
