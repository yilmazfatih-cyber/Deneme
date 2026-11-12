// AŞAMA 3 — Şablon derleyici: şablon dizesi → AST → dönüşüm → kod üretimi → render fonksiyonu.
// Desteklenen alt küme: {{ ifade }}, statik nitelikler, :nitelik / v-bind:, @olay / v-on:, v-if / v-else-if / v-else,
// v-for="(oge, i) in liste", :key. Derleyici çalışma zamanına ipucu da bırakır: patch bayrakları (TEXT/CLASS/PROPS)
// ve statik alt ağaçların önbelleğe alınması (_cache).
// Gerçek karşılıklar (packages/compiler-core/src/):
//   compile.ts (baseCompile, getBaseTransformPreset)   parser.ts + tokenizer.ts (baseParse; 3.4'ten beri durum makinesi)
//   transform.ts (traverseNode)  transforms/vIf.ts, vFor.ts, vOn.ts, vBind.ts, transformElement.ts, transformText.ts,
//   cacheStatic.ts   codegen.ts (generate; tarayıcı derlemesinde `with (_ctx) { ... }` bloğu)
//   packages/vue/src/index.ts (compileToFunction → new Function ile çalışma zamanında derleme)
// Mini'nin ayrıştırıcısı Vue 3.0–3.3'teki gibi özyinelemeli inişlidir; 3.4+ htmlparser2'den uyarlanmış tokenizer kullanır.

import { h, createCommentVNode, PatchFlags } from './asama2_vnode_patch.js'

// ------------------------------------------------------------------ 1) parse

const BOS_ELEMANLAR = new Set(['br', 'hr', 'img', 'input', 'meta', 'link'])
// &nbsp; bölünmez boşluktur (U+00A0); kaynakta görünmez karakter olmasın diye kaçış dizisiyle yazıldı.
const VARLIKLAR = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': '\u00a0' }

export function parse(sablon) {
  const ctx = { kaynak: sablon }
  return { type: 'Root', children: parseChildren(ctx) }
}

const ilerle = (ctx, n) => {
  ctx.kaynak = ctx.kaynak.slice(n)
}
const boslukAtla = (ctx) => {
  const m = /^[\t\r\n\f ]+/.exec(ctx.kaynak)
  if (m) ilerle(ctx, m[0].length)
}

function parseChildren(ctx) {
  const dugumler = []
  while (ctx.kaynak.length > 0 && !ctx.kaynak.startsWith('</')) {
    const s = ctx.kaynak
    if (s.startsWith('{{')) dugumler.push(parseInterpolation(ctx))
    else if (s.startsWith('<!--')) {
      const son = s.indexOf('-->')
      ilerle(ctx, son < 0 ? s.length : son + 3) // yorumlar atılır
    } else if (s[0] === '<' && /[a-z]/i.test(s[1] || '')) dugumler.push(parseElement(ctx))
    else dugumler.push(parseText(ctx))
  }
  return bosluklariSadelestir(dugumler)
}

function parseElement(ctx) {
  const [eslesme, tag] = /^<([a-z][^\t\r\n\f />]*)/i.exec(ctx.kaynak)
  ilerle(ctx, eslesme.length)
  const props = parseAttributes(ctx)
  const kendindenKapali = ctx.kaynak.startsWith('/>')
  ilerle(ctx, kendindenKapali ? 2 : 1)
  const el = { type: 'Element', tag, props, children: [] }
  if (kendindenKapali || BOS_ELEMANLAR.has(tag)) return el
  el.children = parseChildren(ctx)
  const kapanis = new RegExp(`^</${tag}[\\t\\r\\n\\f ]*>`).exec(ctx.kaynak)
  if (!kapanis) throw new Error(`<${tag}> etiketi kapatılmamış`)
  ilerle(ctx, kapanis[0].length)
  return el
}

function parseAttributes(ctx) {
  const props = []
  for (;;) {
    boslukAtla(ctx)
    if (ctx.kaynak.length === 0) throw new Error('Etiket kapanmadan şablon bitti')
    if (ctx.kaynak.startsWith('>') || ctx.kaynak.startsWith('/>')) return props
    const ad = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(ctx.kaynak)[0]
    ilerle(ctx, ad.length)
    boslukAtla(ctx)
    let deger = null
    if (ctx.kaynak[0] === '=') {
      ilerle(ctx, 1)
      boslukAtla(ctx)
      const tirnak = ctx.kaynak[0]
      if (tirnak === '"' || tirnak === "'") {
        const son = ctx.kaynak.indexOf(tirnak, 1)
        deger = ctx.kaynak.slice(1, son)
        ilerle(ctx, son + 1)
      } else {
        deger = /^[^\t\r\n\f >]+/.exec(ctx.kaynak)[0]
        ilerle(ctx, deger.length)
      }
    }
    props.push(nitelikYaDaDirektif(ad, deger))
  }
}

function nitelikYaDaDirektif(ad, deger) {
  if (ad[0] === ':') return { type: 'Directive', name: 'bind', arg: ad.slice(1), exp: deger }
  if (ad[0] === '@') return { type: 'Directive', name: 'on', arg: ad.slice(1), exp: deger }
  const m = /^v-([a-z-]+)(?::(.+))?$/.exec(ad)
  if (m) return { type: 'Directive', name: m[1], arg: m[2] ?? null, exp: deger }
  return { type: 'Attribute', name: ad, value: deger ?? '' }
}

function parseInterpolation(ctx) {
  const son = ctx.kaynak.indexOf('}}')
  if (son < 0) throw new Error('{{ kapatılmamış')
  const icerik = ctx.kaynak.slice(2, son).trim()
  ilerle(ctx, son + 2)
  return { type: 'Interpolation', content: icerik }
}

function parseText(ctx) {
  const adaylar = [ctx.kaynak.indexOf('<', 1), ctx.kaynak.indexOf('{{')].filter((i) => i > 0)
  const son = adaylar.length > 0 ? Math.min(...adaylar) : ctx.kaynak.length
  const ham = ctx.kaynak.slice(0, son)
  ilerle(ctx, son)
  return { type: 'Text', content: ham.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (v) => VARLIKLAR[v]) }
}

// Vue'nun varsayılan "condense" davranışı: elemanlar arasındaki satır sonlu boşluk atılır, diğerleri tek boşluğa iner.
function bosluklariSadelestir(dugumler) {
  const sadece = (d) => d.type === 'Text' && !/[^\t\r\n\f ]/.test(d.content)
  return dugumler
    .filter((d, i) => {
      if (!sadece(d)) return true
      const onceki = dugumler[i - 1]
      const sonraki = dugumler[i + 1]
      if (!onceki || !sonraki) return false
      return !(onceki.type === 'Element' && sonraki.type === 'Element' && /[\r\n]/.test(d.content))
    })
    .map((d) => (d.type === 'Text' ? { ...d, content: d.content.replace(/[\t\r\n\f ]+/g, ' ') } : d))
}

// ------------------------------------------------------------------ 2) transform

export function transform(root) {
  root.children = transformChildren(root.children)
  const kokler = root.children.filter((d) => !(d.type === 'Text' && !d.content.trim()))
  if (kokler.length !== 1 || !['Element', 'If'].includes(kokler[0].type)) {
    throw new Error('Mini derleyici tek kök eleman ister (Vue 3 fragment destekler, mini desteklemez)')
  }
  root.kok = kokler[0]
  if (root.kok.type === 'Element') root.kok.kok = true // kök önbelleğe alınmaz
  isaretle(root.kok, false)
  return root
}

function direktifCikar(el, ad) {
  const i = el.props.findIndex((p) => p.type === 'Directive' && p.name === ad)
  return i < 0 ? null : el.props.splice(i, 1)[0]
}

/** Bir kardeş listesini dönüştürür: v-if zincirleri tek If düğümüne, v-for For düğümüne, metinler birleşir. */
function transformChildren(cocuklar) {
  const sonuc = []
  for (let i = 0; i < cocuklar.length; i++) {
    const d = cocuklar[i]
    if (d.type !== 'Element') {
      sonuc.push(d)
      continue
    }
    const vIf = direktifCikar(d, 'if')
    if (!vIf) {
      if (direktifCikar(d, 'else-if') || direktifCikar(d, 'else')) throw new Error('v-else, v-if olmadan kullanılamaz')
      sonuc.push(yapiDonustur(d))
      continue
    }
    const dallar = [{ kosul: vIf.exp, dugum: yapiDonustur(d) }]
    let j = i + 1
    while (j < cocuklar.length) {
      const k = cocuklar[j]
      if (k.type === 'Text' && !k.content.trim()) {
        j++
        continue
      }
      if (k.type !== 'Element') break
      const elseIf = direktifCikar(k, 'else-if')
      const els = elseIf ? null : direktifCikar(k, 'else')
      if (!elseIf && !els) break
      dallar.push({ kosul: elseIf ? elseIf.exp : null, dugum: yapiDonustur(k) })
      j++
      if (els) break
    }
    // Aynı etiketli dallar birbirine yamalanmasın diye her dala otomatik key (Vue da 0, 1, 2... verir).
    dallar.forEach((dal, n) => {
      if (dal.dugum.type === 'Element' && !dal.dugum.props.some((p) => p.ad === 'key')) {
        dal.dugum.props.unshift({ ad: 'key', kod: String(n), dinamik: false })
      }
    })
    sonuc.push({ type: 'If', dallar })
    i = j - 1
  }
  return metinleriBirlestir(sonuc)
}

const VFOR = /^\s*(?:\(\s*([^,)]+?)\s*(?:,\s*([^,)]+?)\s*)?\)|(\S+))\s+(?:in|of)\s+(.+?)\s*$/

/** Tek bir elemanı dönüştürür: v-for → For düğümü; nitelik/direktifler → kod parçaları; çocuklar özyinelemeli. */
function yapiDonustur(el) {
  const vFor = direktifCikar(el, 'for')
  el.children = transformChildren(el.children)
  el.props = el.props.map(propDonustur)
  if (!vFor) return el
  const m = VFOR.exec(vFor.exp)
  if (!m) throw new Error(`v-for anlaşılamadı: ${vFor.exp}`)
  return { type: 'For', kaynak: m[4], deger: m[1] || m[3], indeks: m[2] || null, dugum: el }
}

const UYE_IFADESI = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*|\[[^\]]+\])*$/
const FONKSIYON_IFADESI = /^\s*(?:\([^)]*?\)|[\w$]+)\s*=>|^\s*(?:async\s+)?function[\s(]/

function propDonustur(p) {
  if (p.type === 'Attribute') return { ad: p.name, kod: JSON.stringify(p.value), dinamik: false }
  if (p.name === 'bind') return { ad: p.arg, kod: `(${p.exp})`, dinamik: true }
  if (p.name === 'on') {
    const ad = 'on' + p.arg[0].toUpperCase() + p.arg.slice(1)
    // @click="sec" → doğrudan fonksiyon; @click="sayac++" → ($event) => { sayac++ } (vOn.ts'deki ayrım)
    const kod = UYE_IFADESI.test(p.exp) || FONKSIYON_IFADESI.test(p.exp) ? p.exp : `($event) => { ${p.exp} }`
    return { ad, kod, dinamik: true }
  }
  throw new Error(`Mini derleyici v-${p.name} direktifini desteklemiyor`)
}

/** Yan yana Text/Interpolation düğümlerini tek bir birleşik ifade yapar: "Merhaba " + ad */
function metinleriBirlestir(dugumler) {
  const sonuc = []
  for (const d of dugumler) {
    const metinsi = d.type === 'Text' || d.type === 'Interpolation'
    const son = sonuc[sonuc.length - 1]
    if (metinsi && son && son.type === 'Compound') son.parcalar.push(d)
    else if (metinsi) sonuc.push({ type: 'Compound', parcalar: [d] })
    else sonuc.push(d)
  }
  return sonuc
}

/** Statik mi? + patch bayrakları. inFor: v-for içindeki düğümler önbelleğe alınamaz (her öğe ayrı vnode ister). */
function isaretle(d, inFor) {
  if (d.type === 'Compound') return d.parcalar.every((p) => p.type === 'Text')
  if (d.type === 'If') {
    d.dallar.forEach((dal) => isaretle(dal.dugum, inFor))
    return false
  }
  if (d.type === 'For') {
    isaretle(d.dugum, true)
    return false
  }
  // Element (bileşen etiketleri asla statik sayılmaz: kendi durumları ve yaşam döngüleri var)
  if (bilesenMi(d.tag) && d.children.length > 0) throw new Error(`<${d.tag}>: mini derleyici slot desteklemiyor`)
  const cocuklarStatik = d.children.map((c) => isaretle(c, inFor)).every(Boolean)
  const dinamikProps = d.props.filter((p) => p.dinamik)
  let bayrak = 0
  const dinamikAdlar = []
  for (const p of dinamikProps) {
    if (p.ad === 'key') continue
    if (p.ad === 'class') bayrak |= PatchFlags.CLASS
    else {
      bayrak |= PatchFlags.PROPS
      dinamikAdlar.push(p.ad)
    }
  }
  const tekMetin = d.children.length === 1 && d.children[0].type === 'Compound'
  if (tekMetin && !cocuklarStatik) bayrak |= PatchFlags.TEXT
  d.patchFlag = bayrak
  d.dynamicProps = dinamikAdlar
  d.statik = dinamikProps.length === 0 && cocuklarStatik && !bilesenMi(d.tag)
  d.onbellek = d.statik && !inFor && !d.kok
  return d.statik
}

/** PascalCase etiket = bileşen (Vue ayrıca kebab-case ve global kaydı da çözer). */
const bilesenMi = (tag) => /^[A-Z]/.test(tag)

// ------------------------------------------------------------------ 3) codegen

const BAYRAK_ADLARI = { 1: 'TEXT', 2: 'CLASS', 8: 'PROPS' }

export function generate(root) {
  const ctx = { onbellekSayisi: 0 }
  return [
    'const { _h, _toDisplayString, _renderList, _createCommentVNode, _resolveComponent } = yardimcilar',
    'return function render(_ctx, _cache) {',
    '  with (_ctx) {',
    `    return ${genNode(root.kok, ctx)}`,
    '  }',
    '}',
  ].join('\n')
}

function genNode(d, ctx) {
  switch (d.type) {
    case 'Element':
      return genElement(d, ctx)
    case 'Compound':
      return d.parcalar
        .map((p) => (p.type === 'Text' ? JSON.stringify(p.content) : `_toDisplayString(${p.content})`))
        .join(' + ')
    case 'If':
      return genIf(d, ctx)
    case 'For':
      return genFor(d, ctx)
    default:
      throw new Error(`kod üretilemedi: ${d.type}`)
  }
}

function genIf(d, ctx) {
  const parcalar = d.dallar.map((dal) => [dal.kosul, genNode(dal.dugum, ctx)])
  const sonDal = parcalar[parcalar.length - 1]
  let kod = sonDal[0] === null ? sonDal[1] : `(${sonDal[0]}) ? ${sonDal[1]} : _createCommentVNode("v-if")`
  for (let i = parcalar.length - 2; i >= 0; i--) kod = `(${parcalar[i][0]}) ? ${parcalar[i][1]} : ${kod}`
  return `(${kod})`
}

function genFor(d, ctx) {
  const params = d.indeks ? `(${d.deger}, ${d.indeks})` : `(${d.deger})`
  return `_renderList(${d.kaynak}, ${params} => ${genNode(d.dugum, ctx)})`
}

function genElement(el, ctx) {
  const props =
    el.props.length > 0 ? `{ ${el.props.map((p) => `${JSON.stringify(p.ad)}: ${p.kod}`).join(', ')} }` : 'null'
  let cocuklar = 'null'
  if (el.children.length === 1 && el.children[0].type === 'Compound') cocuklar = genNode(el.children[0], ctx)
  else if (el.children.length === 1 && el.children[0].type === 'For') cocuklar = genFor(el.children[0], ctx)
  else if (el.children.length > 0) {
    cocuklar = `[${el.children.map((c) => (c.type === 'For' ? `...${genFor(c, ctx)}` : genNode(c, ctx))).join(', ')}]`
  }
  // Bileşen: tür çalışma zamanında, render eden bileşenin `components` alanından çözülür (resolveComponent).
  const tur = bilesenMi(el.tag) ? `_resolveComponent(${JSON.stringify(el.tag)}, _ctx)` : JSON.stringify(el.tag)
  const args = [tur, props, cocuklar]
  if (el.patchFlag > 0) {
    const adlar = Object.keys(BAYRAK_ADLARI)
      .filter((b) => el.patchFlag & Number(b))
      .map((b) => BAYRAK_ADLARI[b])
    args.push(`${el.patchFlag} /* ${adlar.join(', ')} */`)
    if (el.dynamicProps.length > 0) args.push(JSON.stringify(el.dynamicProps))
  }
  const kod = `_h(${args.join(', ')})`
  if (!el.onbellek) return kod
  const n = ctx.onbellekSayisi++
  return `_cache[${n}] || (_cache[${n}] = ${kod})`
}

// ------------------------------------------------------------------ 4) çalışma zamanı yardımcıları + compile

export function toDisplayString(v) {
  if (v == null) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

export function renderList(kaynak, fn) {
  if (Array.isArray(kaynak)) return kaynak.map((oge, i) => fn(oge, i))
  if (typeof kaynak === 'number') return Array.from({ length: kaynak }, (_, i) => fn(i + 1, i))
  if (kaynak && typeof kaynak === 'object') return Object.keys(kaynak).map((k, i) => fn(kaynak[k], k, i))
  return []
}

export function resolveComponent(ad, ctx) {
  const bilesen = ctx.$bilesenler && ctx.$bilesenler[ad]
  if (!bilesen) throw new Error(`<${ad}> bileşeni bulunamadı (components alanına ekle)`)
  return bilesen
}

const yardimcilar = {
  _h: h,
  _toDisplayString: toDisplayString,
  _renderList: renderList,
  _createCommentVNode: createCommentVNode,
  _resolveComponent: resolveComponent,
}

/** Şablonu render fonksiyonuna çevirir. render.kod üretilen JS'i gösterir (template explorer gibi). */
export function compile(sablon) {
  const ast = transform(parse(sablon))
  const kod = generate(ast)
  // new Function gövdesi katı kip değildir; bu yüzden `with` kullanılabilir (Vue'nun tarayıcı derlemesi de böyle).
  const render = new Function('yardimcilar', kod)(yardimcilar)
  render.kod = kod
  return render
}
