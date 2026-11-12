// Aşama 2 — Komut kaydı, bağlam anahtarları ("when" ifadeleri) ve tuş bağlama çözümleyicisi.
//
// VS Code'da her eylem bir komuttur: menü, komut paleti, tuş kısayolu ve eklentiler aynı
// komut kimliğini çağırır. "when" ifadesi, bir kısayolun ya da menü öğesinin hangi bağlamda
// geçerli olduğunu söyler (ör. "editorTextFocus && !editorReadonly").
// Gerçek dosyalar:
//   src/vs/platform/commands/common/commands.ts            (CommandsRegistry)
//   src/vs/workbench/services/commands/common/commandService.ts (onCommand: etkinleştirme)
//   src/vs/platform/contextkey/common/contextkey.ts        (Parser, ifade türleri)
//   src/vs/platform/keybinding/common/keybindingResolver.ts (çözümleme, "-komut" ile silme)

// ---------------------------------------------------------------------------------------------
// Komutlar

export class CommandRegistry {
  /** @type {Map<string, Array<{ handler: Function, aciklama?: string }>>} */
  #komutlar = new Map()
  /** @type {Set<(id: string) => void>} */
  #dinleyiciler = new Set()

  /**
   * Aynı kimlikle ikinci kayıt öncekini gölgeler; dispose edilince eskisi geri gelir
   * (gerçekte de her kimlik için bir bağlı liste tutulur).
   * @param {string} id
   * @param {Function} handler
   * @param {{ aciklama?: string }} [secenek]
   */
  registerCommand(id, handler, secenek = {}) {
    const kayit = { handler, aciklama: secenek.aciklama }
    const yigin = this.#komutlar.get(id) ?? []
    yigin.push(kayit)
    this.#komutlar.set(id, yigin)
    for (const d of this.#dinleyiciler) d(id)
    return {
      dispose: () => {
        const y = this.#komutlar.get(id)
        if (!y) return
        const i = y.indexOf(kayit)
        if (i >= 0) y.splice(i, 1)
        if (y.length === 0) this.#komutlar.delete(id)
      },
    }
  }

  /** @param {string} id */
  getCommand(id) {
    const y = this.#komutlar.get(id)
    return y ? y[y.length - 1] : undefined
  }

  getCommands() {
    return [...this.#komutlar.keys()]
  }

  /** @param {(id: string) => void} dinleyici */
  onDidRegisterCommand(dinleyici) {
    this.#dinleyiciler.add(dinleyici)
    return { dispose: () => this.#dinleyiciler.delete(dinleyici) }
  }
}

export class CommandService {
  /**
   * @param {CommandRegistry} kayit
   * @param {{ activateByEvent?: (olay: string) => Promise<void> }} [secenek]
   */
  constructor(kayit, secenek = {}) {
    this.kayit = kayit
    this.activateByEvent = secenek.activateByEvent
    /** @type {string[]} Çalıştırılan komutların günlüğü (öğretim amaçlı) */
    this.gunluk = []
  }

  /**
   * Komut kayıtlı değilse önce "onCommand:<id>" olayıyla eklentileri uyandırır.
   * @param {string} id
   * @param {...unknown} args
   */
  async executeCommand(id, ...args) {
    if (!this.kayit.getCommand(id) && this.activateByEvent) {
      await this.activateByEvent(`onCommand:${id}`)
    }
    const komut = this.kayit.getCommand(id)
    if (!komut) throw new Error(`'${id}' komutu bulunamadı`)
    this.gunluk.push(id)
    return await komut.handler(...args)
  }
}

// ---------------------------------------------------------------------------------------------
// Bağlam anahtarları

export class ContextKeyService {
  /** @type {Map<string, unknown>} */
  #degerler = new Map()

  /** @param {ContextKeyService | null} [ust] Kapsamlı bağlamlar üst bağlama düşer (ör. editör → pencere). */
  constructor(ust = null) {
    this.ust = ust
  }

  /** @param {string} anahtar @param {unknown} deger */
  set(anahtar, deger) {
    this.#degerler.set(anahtar, deger)
  }

  /** @param {string} anahtar */
  get(anahtar) {
    if (this.#degerler.has(anahtar)) return this.#degerler.get(anahtar)
    return this.ust ? this.ust.get(anahtar) : undefined
  }

  createScoped() {
    return new ContextKeyService(this)
  }
}

// ---------------------------------------------------------------------------------------------
// "when" ifadeleri: sözcükleyici + özyinelemeli iniş ayrıştırıcısı + değerlendirici

/**
 * @typedef {{ tur: 'anahtar' | 'dizgi' | 'regex' | 'op' | 'son', deger: string, bayrak?: string }} Jeton
 * @typedef {{ tur: string, [k: string]: any }} Ifade
 */

/** @param {string} kaynak @returns {Jeton[]} */
export function sozcukle(kaynak) {
  /** @type {Jeton[]} */
  const jetonlar = []
  let i = 0
  const operatorler = ['&&', '||', '==', '!=', '=~', '<=', '>=', '!', '(', ')', '<', '>']
  while (i < kaynak.length) {
    const c = kaynak[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    // =~ sonrasında /regex/bayrak gelir
    const onceki = jetonlar[jetonlar.length - 1]
    if (c === '/' && onceki && onceki.tur === 'op' && onceki.deger === '=~') {
      let j = i + 1
      let govde = ''
      while (j < kaynak.length && kaynak[j] !== '/') {
        if (kaynak[j] === '\\' && j + 1 < kaynak.length) {
          govde += kaynak[j] + kaynak[j + 1]
          j += 2
          continue
        }
        govde += kaynak[j++]
      }
      if (j >= kaynak.length) throw new SyntaxError(`Kapanmamış düzenli ifade: ${kaynak.slice(i)}`)
      j++
      let bayrak = ''
      while (j < kaynak.length && /[a-z]/.test(kaynak[j])) bayrak += kaynak[j++]
      jetonlar.push({ tur: 'regex', deger: govde, bayrak })
      i = j
      continue
    }
    if (c === "'" || c === '"') {
      const kapanis = kaynak.indexOf(c, i + 1)
      if (kapanis < 0) throw new SyntaxError(`Kapanmamış tırnak: ${kaynak.slice(i)}`)
      jetonlar.push({ tur: 'dizgi', deger: kaynak.slice(i + 1, kapanis) })
      i = kapanis + 1
      continue
    }
    const op = operatorler.find((o) => kaynak.startsWith(o, i))
    if (op) {
      jetonlar.push({ tur: 'op', deger: op })
      i += op.length
      continue
    }
    // anahtar ya da çıplak değer: harf, rakam, nokta, iki nokta, tire, alt çizgi
    const m = /^[A-Za-z0-9_.:\-/@]+/.exec(kaynak.slice(i))
    if (!m) throw new SyntaxError(`Beklenmeyen karakter '${c}' (konum ${i})`)
    jetonlar.push({ tur: 'anahtar', deger: m[0] })
    i += m[0].length
  }
  jetonlar.push({ tur: 'son', deger: '' })
  return jetonlar
}

/**
 * Dilbilgisi (gerçek Parser ile aynı öncelik):
 *   ifade := veya ;  veya := ve ('||' ve)* ;  ve := terim ('&&' terim)*
 *   terim := '!' terim | birincil
 *   birincil := true | false | '(' ifade ')' | ANAHTAR [ işleç değer ]
 * @param {string} kaynak
 * @returns {Ifade}
 */
export function parseWhen(kaynak) {
  const j = sozcukle(kaynak)
  let k = 0
  const bak = () => j[k]
  const al = () => j[k++]
  const bekle = (deger) => {
    const t = al()
    if (t.deger !== deger) throw new SyntaxError(`'${deger}' bekleniyordu, '${t.deger || 'son'}' geldi`)
  }

  const veya = () => {
    const parcalar = [ve()]
    while (bak().tur === 'op' && bak().deger === '||') {
      al()
      parcalar.push(ve())
    }
    return parcalar.length === 1 ? parcalar[0] : { tur: 'or', parcalar }
  }
  const ve = () => {
    const parcalar = [terim()]
    while (bak().tur === 'op' && bak().deger === '&&') {
      al()
      parcalar.push(terim())
    }
    return parcalar.length === 1 ? parcalar[0] : { tur: 'and', parcalar }
  }
  const terim = () => {
    if (bak().tur === 'op' && bak().deger === '!') {
      al()
      return { tur: 'not', ic: terim() }
    }
    return birincil()
  }
  const deger = () => {
    const t = al()
    if (t.tur !== 'anahtar' && t.tur !== 'dizgi') throw new SyntaxError(`Değer bekleniyordu, '${t.deger}' geldi`)
    if (t.tur === 'anahtar' && t.deger === 'true') return true
    if (t.tur === 'anahtar' && t.deger === 'false') return false
    return t.deger
  }
  const birincil = () => {
    const t = al()
    if (t.tur === 'op' && t.deger === '(') {
      const ic = veya()
      bekle(')')
      return ic
    }
    if (t.tur !== 'anahtar') throw new SyntaxError(`Anahtar bekleniyordu, '${t.deger || 'son'}' geldi`)
    if (t.deger === 'true') return { tur: 'true' }
    if (t.deger === 'false') return { tur: 'false' }
    const anahtar = t.deger
    const s = bak()
    if (s.tur === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(s.deger)) {
      al()
      return { tur: s.deger, anahtar, deger: deger() }
    }
    if (s.tur === 'op' && s.deger === '=~') {
      al()
      const r = al()
      if (r.tur !== 'regex') throw new SyntaxError('=~ işlecinden sonra /düzenli ifade/ bekleniyordu')
      return { tur: '=~', anahtar, regex: new RegExp(r.deger, r.bayrak) }
    }
    if (s.tur === 'anahtar' && s.deger === 'in') {
      al()
      return { tur: 'in', anahtar, kume: al().deger }
    }
    if (s.tur === 'anahtar' && s.deger === 'not' && j[k + 1]?.deger === 'in') {
      k += 2
      return { tur: 'not in', anahtar, kume: al().deger }
    }
    return { tur: 'tanimli', anahtar }
  }

  const sonuc = veya()
  if (bak().tur !== 'son') throw new SyntaxError(`Fazladan jeton: '${bak().deger}'`)
  return sonuc
}

/**
 * @param {Ifade | null | undefined} ifade
 * @param {{ get: (anahtar: string) => unknown }} baglam
 * @returns {boolean}
 */
export function evaluateWhen(ifade, baglam) {
  if (!ifade) return true
  const v = (a) => baglam.get(a)
  switch (ifade.tur) {
    case 'true':
      return true
    case 'false':
      return false
    case 'tanimli':
      return Boolean(v(ifade.anahtar))
    case 'not':
      return !evaluateWhen(ifade.ic, baglam)
    case 'and':
      return ifade.parcalar.every((p) => evaluateWhen(p, baglam))
    case 'or':
      return ifade.parcalar.some((p) => evaluateWhen(p, baglam))
    case '==':
      // Gerçek kod da gevşek eşitlik kullanır: 4 == '4' doğru sayılır.
      return v(ifade.anahtar) == ifade.deger
    case '!=':
      return v(ifade.anahtar) != ifade.deger
    case '=~':
      return ifade.regex.test(String(v(ifade.anahtar) ?? ''))
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const a = parseFloat(String(v(ifade.anahtar)))
      const b = parseFloat(String(ifade.deger))
      if (Number.isNaN(a) || Number.isNaN(b)) return false
      if (ifade.tur === '<') return a < b
      if (ifade.tur === '<=') return a <= b
      if (ifade.tur === '>') return a > b
      return a >= b
    }
    case 'in':
    case 'not in': {
      const kume = v(ifade.kume)
      const deger = v(ifade.anahtar)
      let var_ = false
      if (Array.isArray(kume)) var_ = kume.includes(deger)
      else if (kume && typeof kume === 'object') var_ = Object.prototype.hasOwnProperty.call(kume, String(deger))
      return ifade.tur === 'in' ? var_ : !var_
    }
    default:
      throw new Error(`Bilinmeyen ifade türü: ${ifade.tur}`)
  }
}

// ---------------------------------------------------------------------------------------------
// Tuş bağlamaları

const DEGISTIRICI_SIRASI = ['ctrl', 'shift', 'alt', 'meta']

/** "Shift+Ctrl+P" → "ctrl+shift+p" (tek akor). */
export function normalizeChord(akor) {
  const parcalar = akor.toLowerCase().split('+').filter(Boolean)
  const tus = parcalar.filter((p) => !DEGISTIRICI_SIRASI.includes(p))
  if (tus.length !== 1) throw new Error(`Geçersiz akor: ${akor}`)
  const mod = DEGISTIRICI_SIRASI.filter((m) => parcalar.includes(m))
  return [...mod, tus[0]].join('+')
}

/** "ctrl+k ctrl+c" → ["ctrl+k", "ctrl+c"] */
export function parseKeybinding(tuslar) {
  return tuslar.trim().split(/\s+/).map(normalizeChord)
}

/**
 * @typedef {{ key?: string, command: string, when?: string, args?: unknown }} KeybindingTanimi
 * @typedef {{ chords: string[], command: string, when: Ifade | null, whenKaynak: string, args?: unknown }} KeybindingOgesi
 */

/** @param {KeybindingTanimi} t @returns {KeybindingOgesi} */
function ogeYap(t) {
  return {
    chords: t.key ? parseKeybinding(t.key) : [],
    command: t.command,
    when: t.when ? parseWhen(t.when) : null,
    whenKaynak: t.when ? t.when.replace(/\s+/g, ' ').trim() : '',
    args: t.args,
  }
}

export class KeybindingResolver {
  /** @type {KeybindingOgesi[]} */
  #ogeler
  /** @type {Map<string, KeybindingOgesi[]>} ilk akor → adaylar (kayıt sırasıyla) */
  #harita = new Map()

  /**
   * @param {KeybindingTanimi[]} varsayilanlar Yerleşik + eklenti kısayolları
   * @param {KeybindingTanimi[]} [kullanici] keybindings.json; "-komut" varsayılanı siler
   */
  constructor(varsayilanlar, kullanici = []) {
    this.#ogeler = KeybindingResolver.silmeleriUygula([...varsayilanlar, ...kullanici].map(ogeYap))
    for (const oge of this.#ogeler) {
      if (oge.chords.length === 0) continue
      const liste = this.#harita.get(oge.chords[0]) ?? []
      liste.push(oge)
      this.#harita.set(oge.chords[0], liste)
    }
  }

  /**
   * "-komut" kuralları kendisinden önce gelen eşleşen kuralları kaldırır.
   * Gerçek kod "when" için içerme (implication) denetimi yapar; biz metin eşitliğine bakıyoruz.
   * @param {KeybindingOgesi[]} ogeler
   */
  static silmeleriUygula(ogeler) {
    const sonuc = []
    for (const oge of ogeler) {
      if (oge.command.startsWith('-')) {
        const hedef = oge.command.slice(1)
        for (let i = sonuc.length - 1; i >= 0; i--) {
          const aday = sonuc[i]
          if (aday.command !== hedef) continue
          if (oge.chords.length && oge.chords.join(' ') !== aday.chords.join(' ')) continue
          if (oge.whenKaynak && oge.whenKaynak !== aday.whenKaynak) continue
          sonuc.splice(i, 1)
        }
        continue
      }
      sonuc.push(oge)
    }
    return sonuc
  }

  /**
   * @param {{ get: (a: string) => unknown }} baglam
   * @param {string[]} oncekiAkorlar
   * @param {string} tus
   * @returns {{ tur: 'yok' } | { tur: 'devami-bekleniyor' } | { tur: 'bulundu', commandId: string, args?: unknown }}
   */
  resolve(baglam, oncekiAkorlar, tus) {
    const basilan = [...oncekiAkorlar, normalizeChord(tus)]
    const adaylar = this.#harita.get(basilan[0])
    if (!adaylar) return { tur: 'yok' }
    const uygun = adaylar.filter(
      (a) => a.chords.length >= basilan.length && basilan.every((akor, i) => a.chords[i] === akor),
    )
    // Sondan başa: sonra kaydedilen (ör. kullanıcının) kazanır — gerçek: _findCommand.
    let sonuc = null
    for (let i = uygun.length - 1; i >= 0; i--) {
      if (evaluateWhen(uygun[i].when, baglam)) {
        sonuc = uygun[i]
        break
      }
    }
    if (!sonuc) return { tur: 'yok' }
    if (basilan.length < sonuc.chords.length) return { tur: 'devami-bekleniyor' }
    return { tur: 'bulundu', commandId: sonuc.command, args: sonuc.args }
  }

  /** Komut paletinde gösterilecek kısayol. @param {string} komut */
  lookupKeybinding(komut) {
    for (let i = this.#ogeler.length - 1; i >= 0; i--) {
      if (this.#ogeler[i].command === komut && this.#ogeler[i].chords.length) return this.#ogeler[i].chords.join(' ')
    }
    return undefined
  }
}

/**
 * Akor durumunu tutan tuş dağıtıcısı (gerçek: AbstractKeybindingService._doDispatch).
 */
export class KeybindingDispatcher {
  /** @type {string[]} */
  #bekleyen = []

  /**
   * @param {KeybindingResolver} cozumleyici
   * @param {CommandService} komutlar
   * @param {{ get: (a: string) => unknown }} baglam
   */
  constructor(cozumleyici, komutlar, baglam) {
    this.cozumleyici = cozumleyici
    this.komutlar = komutlar
    this.baglam = baglam
  }

  /** @param {string} tus @returns {Promise<{ durum: string, sonuc?: unknown }>} */
  async dispatch(tus) {
    const r = this.cozumleyici.resolve(this.baglam, this.#bekleyen, tus)
    if (r.tur === 'devami-bekleniyor') {
      this.#bekleyen.push(normalizeChord(tus))
      return { durum: `(${this.#bekleyen.join(' ')}) basıldı, ikinci tuş bekleniyor` }
    }
    this.#bekleyen = []
    if (r.tur === 'yok') return { durum: 'eşleşme yok' }
    const sonuc = await this.komutlar.executeCommand(r.commandId, ...(r.args === undefined ? [] : [r.args]))
    return { durum: `çalıştı: ${r.commandId}`, sonuc }
  }
}
