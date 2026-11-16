/**
 * Lab komutları. Her komut `{ text, json }` döner: `text` kompakt, bütçeli çıktıdır (ajan bunu okur); `json` aynı
 * sonucun makine biçimidir (`--json`). Komutlar CLI'dan (lab/cli.ts) ve MCP aracından (lab/mcp.ts) aynı yoldan çağrılır.
 *
 * Tasarım kuralları (az token, çok iş):
 *   - Çıktı varsayılan olarak kısa; ayrıntı alt komutla ya da --limit ile istenir.
 *   - Uzun işler (içe alma, kurma, model) yerelde koşar; sonuç önbelleğe yazılır, tekrar sorulunca yeniden hesaplanmaz.
 *   - Her çıktı "sıradaki adım"ı söyler: ajan keşif için fazladan komut harcamaz.
 *   - Ham satır, kullanıcı kimliği ve serbest metin HİÇBİR çıktıda yoktur; küçük gruplar gizlenir.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { basename, join } from 'node:path'
import type { ChurnDeep, ChurnDefinition } from '../../../shared/lab'
import { pullExport, validateRange, type MixpanelRegion } from '../../../server/src/services/mixpanel/pull'
import { loadChurnData, loadMeta, statusOf } from '../churn/data'
import { runDeep } from '../churn/deep'
import {
  formatDeep,
  formatDefinition,
  formatDriver,
  formatDrivers,
  formatEarly,
  formatOverview,
  formatReasons,
  formatSegments,
  formatTriggers,
  headerOf,
} from '../churn/format'
import { clip, dayStr, kv, num, pct, table } from '../core/format'
import { audit, loadResult, MIN_K, openLab, readJson, saveResult, saveSettings, writeJson, type Lab } from '../core/lab'
import { build, type BuildMeta } from '../data/build'
import { discover, formatDiscovery } from '../data/discover'
import { KIND_LABEL, type Kind } from '../data/events'
import { ingest, type IngestReport } from '../data/ingest'
import { zLabMapping, type LabMapping, type LabMappingInput } from '../data/mapping'
import { loadManifest, type StoreManifest } from '../data/store'
import { describeTable, runQuery } from '../query/query'
import { openQueryTable, QUERY_TABLES } from '../query/tables'
import { loadTruth, validateWorld, type WorldValidation } from '../world/validate'
import { WORLD_MAPPING } from '../world/world'
import { truthPathOf, writeWorld } from '../world/write'
import { flagBool, flagNum, flagStr, type Args } from './args'

export interface CommandResult {
  text: string
  json?: unknown
}

export interface CommandContext {
  lab: Lab
  /** İlerleme satırları (stderr); MCP'de sessiz */
  progress: (line: string) => void
  /** Ajan kipi (MCP aracı): gizlilik ayarı değiştirme ve depo sıfırlama kapalıdır */
  agent?: boolean
}

/** Ajan kipinde yalnız insanın terminalden yapabileceği işler için hata. */
function humanOnly(ctx: CommandContext, what: string, command: string): void {
  if (ctx.agent)
    throw new Error(`${what} ajan kipinde kapalıdır; bunu kullanıcı terminalden yapar: npm run lab -- ${command}`)
}

const suggestionFile = (lab: Lab): string => join(lab.dir, 'esleme.oneri.json')

function loadMapping(lab: Lab): LabMapping | null {
  const raw = readJson<LabMappingInput>(lab.mappingFile)
  if (!raw) return null
  const r = zLabMapping.safeParse(raw)
  if (!r.success)
    throw new Error(
      `Eşleme dosyası geçersiz (${lab.mappingFile}):\n` +
        r.error.issues
          .slice(0, 8)
          .map((i) => `  ${i.path.join('.') || '(kök)'}: ${i.message}`)
          .join('\n'),
    )
  return r.data
}

const tsDay = (ts: number | null, lab: Lab): string =>
  ts === null ? '–' : dayStr(Math.floor((ts + lab.settings.tzDakika * 60) / 86_400))

/* ───────────── durum ───────────── */

interface LabState {
  mapping: LabMapping | null
  suggestion: boolean
  manifest: StoreManifest | null
  tablesFresh: boolean
  status: ReturnType<typeof statusOf> | null
  churn: { at: string; fresh: boolean } | null
  next: string
}

export function labState(lab: Lab): LabState {
  let mapping: LabMapping | null = null
  try {
    mapping = loadMapping(lab)
  } catch {
    mapping = null
  }
  const manifest = loadManifest(lab)
  const meta = loadMeta(lab)
  const tablesFresh = !!meta && !!manifest && meta.builtAt >= manifest.updatedAt
  const churn = loadResult<ChurnDeep>(lab, 'churn')
  let next: string
  if (!manifest || manifest.events === 0) {
    if (mapping) next = 'al <dışa aktarım dosyası>   (veri yoksa denemek için: demo)'
    else if (existsSync(suggestionFile(lab))) next = 'esleme   (öneriyi gözden geçir; uygunsa: esleme --kabul)'
    else next = 'kesif <dışa aktarım dosyası>   (veri yoksa denemek için: demo)'
  } else if (!tablesFresh) next = 'kur'
  else if (!churn || churn.dataRev !== meta?.dataRev) next = 'churn'
  else next = 'churn neden | churn tetik | sim kur | deney liste'
  return {
    mapping,
    suggestion: existsSync(suggestionFile(lab)),
    manifest,
    tablesFresh,
    status: meta ? statusOf(meta) : null,
    churn: churn ? { at: churn.at, fresh: churn.dataRev === meta?.dataRev } : null,
    next,
  }
}

function cmdStatus(ctx: CommandContext): CommandResult {
  const { lab } = ctx
  const s = labState(lab)
  const lines: string[] = [`LAB · ${lab.dir}`]
  lines.push(
    s.mapping
      ? `eşleme: var (${Object.keys(s.mapping.events).length} olay adı, ${Object.keys(s.mapping.dims).length} boyut)`
      : s.suggestion
        ? 'eşleme: yok · öneri hazır (esleme)'
        : 'eşleme: yok',
  )
  if (s.manifest && s.manifest.events > 0) {
    const m = s.manifest
    lines.push(
      `depo: ${num(m.events)} olay · ${m.ingests.length} içe alma · ${tsDay(m.firstTs, lab)}…${tsDay(m.lastTs, lab)} · kullanıcı örneklemi ${pct(m.sample)}` +
        (m.synthetic ? ' · SENTETİK DEMO' : ''),
    )
  } else lines.push('depo: boş')
  if (s.status)
    lines.push(
      `tablolar: ${s.tablesFresh ? 'güncel' : 'ESKİ (kur gerekli)'} · ${num(s.status.users)} kullanıcı · ${num(s.status.userDays)} kullanıcı-gün · ${num(s.status.sessions)} oturum · ${num(s.status.titles)} başlık · sürüm ${s.status.dataRev}`,
    )
  else lines.push('tablolar: kurulmamış')
  lines.push(
    `churn analizi: ${s.churn ? `${s.churn.at.slice(0, 16).replace('T', ' ')}${s.churn.fresh ? '' : ' (eski veriyle)'}` : 'yok'}`,
  )
  lines.push(
    `gizlilik: gruplar en az ${lab.settings.kAnonim} kullanıcı · içerik adları ${lab.settings.icerikAdlari ? 'gösterilir' : 'gizli'}`,
  )
  lines.push(`sıradaki: ${s.next}`)
  return { text: lines.join('\n'), json: s }
}

/* ───────────── kesif / esleme ───────────── */

async function cmdDiscover(ctx: CommandContext, a: Args): Promise<CommandResult> {
  const paths = a._.slice(1)
  if (!paths.length)
    throw new Error('Kullanım: kesif <dosya|klasör…> [--olay "Olay Adı"] [--limit 30] [--satir 400000]')
  for (const p of paths) if (!existsSync(p)) throw new Error(`Dosya bulunamadı: ${p}`)
  ctx.progress('taranıyor…')
  const report = await discover(paths, { maxLines: flagNum(a, 'satir') })
  writeJson(suggestionFile(ctx.lab), report.suggestion)
  const event = flagStr(a, 'olay')
  const text = formatDiscovery(report, { limit: flagNum(a, 'limit'), event })
  return {
    text: event ? text : `${text}\nöneri yazıldı: ${suggestionFile(ctx.lab)}`,
    json: report,
  }
}

function mappingSummary(m: LabMapping, title: string): string {
  const byKind = new Map<string, string[]>()
  for (const [name, rule] of Object.entries(m.events)) {
    const rules = Array.isArray(rule) ? rule : [rule]
    for (const r of rules) {
      const kind = typeof r === 'string' ? r : r.kind
      const cond =
        typeof r === 'string' || !r.when
          ? ''
          : ` [${Object.entries(r.when)
              .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`)
              .join(', ')}]`
      const list = byKind.get(kind) ?? []
      list.push(`${name}${cond}`)
      byKind.set(kind, list)
    }
  }
  const rows = [...byKind].map(([kind, names]) => ({
    tur: KIND_LABEL[kind as Kind] ?? kind,
    kod: kind,
    olay: names.join(' · '),
  }))
  const props = Object.entries(m.props)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`)
    .join(' · ')
  const dims = Object.entries(m.dims)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`)
    .join(' · ')
  return [
    title,
    table(rows, [
      { h: 'tür', v: 'tur' },
      { h: 'kod', v: 'kod' },
      { h: 'sizin olay adlarınız', v: 'olay', max: 120 },
    ]),
    `özellikler: ${props || '–'}`,
    `boyutlar: ${dims || '–'}`,
    kv({
      'süre birimi': m.durationUnit,
      'izlenen süre kipi': m.watched,
      'oturum boşluğu (dk)': m.sessionGapMin,
      etkinlik: m.activity.join('+'),
      'eşlenmeyenler saklanır': m.keepUnmapped ? 'evet' : 'hayır',
    }),
  ].join('\n')
}

function cmdMapping(ctx: CommandContext, a: Args): CommandResult {
  const { lab } = ctx
  const file = flagStr(a, 'dosya')
  const accept = flagBool(a, 'kabul')
  if (file || accept) {
    const src = file ?? suggestionFile(lab)
    if (!existsSync(src)) throw new Error(file ? `Dosya bulunamadı: ${file}` : 'Öneri yok. Önce: kesif <dosya>')
    const parsed = zLabMapping.safeParse(JSON.parse(readFileSync(src, 'utf8')))
    if (!parsed.success)
      throw new Error(
        'Eşleme geçersiz:\n' +
          parsed.error.issues
            .slice(0, 10)
            .map((i) => `  ${i.path.join('.') || '(kök)'}: ${i.message}`)
            .join('\n'),
      )
    writeJson(lab.mappingFile, JSON.parse(readFileSync(src, 'utf8')))
    return {
      text: `${mappingSummary(parsed.data, `EŞLEME KAYDEDİLDİ · ${lab.mappingFile}`)}\nsıradaki: al <dosya>   (önce denemek için: al <dosya> --deneme)`,
      json: parsed.data,
    }
  }
  const current = loadMapping(lab)
  if (current)
    return {
      text: `${mappingSummary(current, `EŞLEME · ${lab.mappingFile}`)}\ndeğiştirmek için dosyayı düzenleyin ya da: esleme --dosya <yol>`,
      json: current,
    }
  const sug = readJson<LabMappingInput>(suggestionFile(lab))
  if (!sug) return { text: 'Eşleme yok. Önce: kesif <dosya>   (veri yoksa: demo)' }
  const parsed = zLabMapping.parse(sug)
  return {
    text: `${mappingSummary(parsed, `EŞLEME ÖNERİSİ (henüz kabul edilmedi) · ${suggestionFile(lab)}`)}\nuygunsa: esleme --kabul · düzeltmek için öneri dosyasını düzenleyip yine: esleme --kabul`,
    json: parsed,
  }
}

/* ───────────── al / cek / kur ───────────── */

function formatIngest(reports: IngestReport[], manifest: StoreManifest, lab: Lab, dryRun: boolean): string {
  const lines: string[] = [dryRun ? 'İÇE ALMA DENEMESİ (depoya yazılmadı)' : 'İÇE ALINDI']
  lines.push(
    table(reports, [
      { h: 'dosya', v: 'file', max: 40 },
      { h: 'satır', v: 'lines' },
      { h: 'kabul', v: 'accepted' },
      { h: 'reddedilen', v: 'rejected' },
      { h: 'örneklem dışı', v: 'sampledOut' },
      { h: 'eşlenmeyen', v: 'unmappedTotal' },
      { h: 'aralık', v: (r) => `${tsDay(r.firstTs, lab)}…${tsDay(r.lastTs, lab)}` },
      { h: 'sn', v: 'seconds' },
    ]),
  )
  const kinds = new Map<string, number>()
  const unmapped = new Map<string, number>()
  for (const r of reports) {
    for (const [k, n] of Object.entries(r.byKind)) kinds.set(k, (kinds.get(k) ?? 0) + n)
    for (const [k, n] of Object.entries(r.unmapped)) unmapped.set(k, (unmapped.get(k) ?? 0) + n)
  }
  lines.push(
    `türler: ${[...kinds]
      .sort((x, y) => y[1] - x[1])
      .map(([k, n]) => `${KIND_LABEL[k as Kind] ?? k} ${num(n)}`)
      .join(' · ')}`,
  )
  if (unmapped.size)
    lines.push(
      `eşlenmeyen olay adları (en sık): ${[...unmapped]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 12)
        .map(([k, n]) => `${k} ${num(n)}`)
        .join(' · ')}`,
    )
  for (const r of reports) for (const w of r.warnings) lines.push(`uyarı (${r.file}): ${w}`)
  if (!dryRun) lines.push(`depo toplamı: ${num(manifest.events)} olay · sıradaki: kur`)
  else lines.push('rapor uygunsa aynı komutu --deneme olmadan çalıştırın')
  return lines.join('\n')
}

async function cmdIngest(ctx: CommandContext, a: Args): Promise<CommandResult> {
  const { lab } = ctx
  const paths = a._.slice(1)
  if (!paths.length) throw new Error('Kullanım: al <dosya|klasör…> [--ornek 0.1] [--sifirla] [--deneme]')
  for (const p of paths) if (!existsSync(p)) throw new Error(`Dosya bulunamadı: ${p}`)
  const mapping = loadMapping(lab)
  if (!mapping) throw new Error('Eşleme yok. Önce: kesif <dosya> → esleme --kabul')
  const existing = loadManifest(lab)
  if (existing?.synthetic && existing.events > 0 && !flagBool(a, 'sifirla'))
    throw new Error(
      'Depoda sentetik demo verisi var. Gerçek veriyi almak için --sifirla ekleyin (demo verisi silinir).',
    )
  if (flagBool(a, 'sifirla')) humanOnly(ctx, 'Depoyu boşaltmak', 'al <dosya> --sifirla')
  const dryRun = flagBool(a, 'deneme')
  let last = 0
  const r = await ingest(lab, paths, {
    mapping,
    sample: flagNum(a, 'ornek'),
    reset: flagBool(a, 'sifirla'),
    dryRun,
    synthetic: false,
    onProgress: (n) => {
      if (n - last >= 2_000_000) {
        last = n
        ctx.progress(`${num(n)} satır…`)
      }
    },
  })
  return { text: formatIngest(r.reports, r.manifest, lab, dryRun), json: r.reports }
}

async function cmdPull(ctx: CommandContext, a: Args): Promise<CommandResult> {
  const { lab } = ctx
  const from = flagStr(a, 'from', 'bas')
  const to = flagStr(a, 'to', 'son')
  const bad = validateRange(from, to)
  if (bad || !from || !to)
    throw new Error(`Kullanım: cek --from YYYY-AA-GG --to YYYY-AA-GG [--ornek 0.1] [--sakla]\n${bad ?? ''}`)
  const username = process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME
  const secret = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET
  const projectId = process.env.MIXPANEL_PROJECT_ID
  if (!username || !secret || !projectId)
    throw new Error(
      'Mixpanel servis hesabı tanımlı değil. Ortam değişkenleri: MIXPANEL_SERVICE_ACCOUNT_USERNAME, MIXPANEL_SERVICE_ACCOUNT_SECRET, MIXPANEL_PROJECT_ID, MIXPANEL_REGION (us|eu|in). ' +
        'Değerleri sohbete ya da dosyaya yazmayın; yalnız kabuğunuzda export edin.',
    )
  const mapping = loadMapping(lab)
  if (!mapping) throw new Error('Eşleme yok. Önce bir günlük dosyayla: kesif <dosya> → esleme --kabul')
  const region: MixpanelRegion =
    process.env.MIXPANEL_REGION === 'eu' ? 'eu' : process.env.MIXPANEL_REGION === 'in' ? 'in' : 'us'
  const rawDir = join(lab.dir, 'ham')
  mkdirSync(rawDir, { recursive: true })
  const file = join(rawDir, `mixpanel-${from}_${to}.jsonl`)
  ctx.progress(`Mixpanel'den çekiliyor: ${from}…${to}`)
  const out = createWriteStream(file)
  let bytes = 0
  try {
    for await (const chunk of pullExport({ from, to, region, username, secret, projectId })) {
      bytes += chunk.byteLength
      if (!out.write(chunk)) await once(out, 'drain')
    }
  } finally {
    out.end()
    await once(out, 'finish')
  }
  ctx.progress(`${num(bytes)} bayt indi; içe alınıyor…`)
  if (flagBool(a, 'sifirla')) humanOnly(ctx, 'Depoyu boşaltmak', 'cek … --sifirla')
  const r = await ingest(lab, [file], {
    mapping,
    sample: flagNum(a, 'ornek'),
    reset: flagBool(a, 'sifirla'),
    synthetic: false,
  })
  // Ham dışa aktarım kişisel veri içerebilir: istenmedikçe diskte bırakılmaz
  if (!flagBool(a, 'sakla')) rmSync(file, { force: true })
  return {
    text: `${formatIngest(r.reports, r.manifest, lab, false)}\nham dosya: ${flagBool(a, 'sakla') ? file : 'silindi (saklamak için --sakla)'}`,
    json: r.reports,
  }
}

/** Tabloları kurar ve veri durumunu sonuç olarak yazar (Stüdyo lab kodunu çalıştırmadan buradan okur). */
function buildTables(lab: Lab, onProgress?: (bucket: number, of: number) => void): BuildMeta {
  const meta = build(lab, { onProgress })
  saveResult(lab, 'durum', statusOf(meta), { dataRev: meta.dataRev })
  return meta
}

function cmdBuild(ctx: CommandContext): CommandResult {
  ctx.progress('tablolar kuruluyor…')
  const meta = buildTables(ctx.lab, (b, of) => {
    if (of > 8 && b > 0 && b % Math.ceil(of / 4) === 0) ctx.progress(`kova ${b}/${of}`)
  })
  const s = statusOf(meta)
  const text = [
    `KURULDU · ${headerOf(s)} · ${meta.seconds} sn`,
    kv({
      olay: meta.events,
      'kullanıcı-gün': meta.userDays,
      oturum: meta.sessions,
      başlık: meta.titles,
      içerik: meta.contents,
      'izleme özeti': meta.facts,
      boyutlar: meta.dimNames.join(', '),
      sürüm: meta.dataRev,
    }),
    `oturum başına oynatma: ${meta.profile.playsPerSession
      .map((n, i) => `${i === 10 ? '10+' : i}:${num(n)}`)
      .slice(0, 6)
      .join(' ')} · boş oturum ${pct(meta.profile.playsPerSession[0] / Math.max(1, meta.sessions))}`,
    'sıradaki: churn',
  ].join('\n')
  return { text, json: meta }
}

/* ───────────── churn ───────────── */

function churnResult(ctx: CommandContext, a: Args): ChurnDeep {
  const { lab } = ctx
  const meta = loadMeta(lab)
  if (!meta) throw new Error('Tablolar kurulmamış. Önce: kur (veri yoksa: demo)')
  const n = flagNum(a, 'n')
  const activityFlag = flagStr(a, 'etkinlik')
  if (activityFlag && activityFlag !== 'izleme' && activityFlag !== 'uygulama')
    throw new Error('--etkinlik izleme ya da uygulama olmalı')
  const activity = activityFlag as ChurnDefinition['activity'] | undefined
  const cached = loadResult<ChurnDeep>(lab, 'churn')
  const sameParams =
    cached &&
    cached.dataRev === meta.dataRev &&
    (n === undefined || cached.data.overview.definition.n === n) &&
    (activity === undefined || cached.data.overview.definition.activity === activity)
  if (cached && sameParams && !flagBool(a, 'yeniden')) return cached.data
  ctx.progress('churn analizi çalışıyor…')
  return runDeep(lab, { n, activity, gbdt: !flagBool(a, 'hizli') }).result
}

function cmdChurn(ctx: CommandContext, a: Args): CommandResult {
  const r = churnResult(ctx, a)
  const sub = a._[1] ?? ''
  const limit = flagNum(a, 'limit')
  let text: string
  switch (sub) {
    case '':
    case 'ozet':
    case 'bulgular':
      text = formatDeep(r, { limit, brief: flagBool(a, 'kisa') })
      break
    case 'tanim':
      text = formatDefinition(r)
      break
    case 'genel':
      text = formatOverview(r)
      break
    case 'neden':
      text = formatReasons(r)
      break
    case 'tetik':
      text = formatTriggers(r, limit)
      break
    case 'etken':
      text = a._[2] ? formatDriver(r, a._[2]) : formatDrivers(r, limit)
      break
    case 'kim':
      text = formatSegments(r, limit)
      break
    case 'yeni':
      text = formatEarly(r)
      break
    default:
      throw new Error(`Bilinmeyen alt komut: churn ${sub}. Olanlar: genel, neden, tetik, etken [ad], kim, yeni, tanim`)
  }
  return { text, json: sub === '' ? r : undefined }
}

/* ───────────── sorgu ───────────── */

function cmdQuery(ctx: CommandContext, a: Args): CommandResult {
  const name = a._[1]
  if (!name)
    return {
      text: [
        'SORGU — hazır analizlerin yanıtlamadığı sorular için toplu sorgu (yalnız toplam döner; küçük gruplar gizlenir)',
        `tablolar: ${QUERY_TABLES.join(', ')}   (sütunlar: sorgu <tablo> --kolonlar)`,
        'kullanım: sorgu <tablo> --grup a,b --olc "n,oran(churn),ort(x)" --nerede "x>3 & cihaz=TV" [--sirala -n] [--limit 20]',
        'ölçüler: n · kisi · ort(k) · top(k) · oran(k) · p50(k) · p90(k) · min(k) · maks(k)',
        'gruplama: kategorik sütun · k:4 (dört eşit dilim) · k@0,1,5 (elle sınırlar)',
        'örnek: sorgu anlik --grup plan,cihaz --olc "n,oran(churn),ort(izleme_dk_28)" --sirala -oran(churn)',
      ].join('\n'),
    }
  const cached = loadResult<ChurnDeep>(ctx.lab, 'churn')
  const t = openQueryTable(ctx.lab, name, cached?.data.overview.definition)
  if (flagBool(a, 'kolonlar')) return { text: describeTable(t) }
  const kAnon = name === 'baslik' ? 1 : ctx.lab.settings.kAnonim
  const r = runQuery(
    t,
    {
      group: splitGroups(flagStr(a, 'grup') ?? ''),
      measures: splitMeasures(flagStr(a, 'olc') ?? 'n'),
      where: flagStr(a, 'nerede') ?? '',
      sort: flagStr(a, 'sirala'),
      limit: flagNum(a, 'limit'),
    },
    kAnon,
  )
  return { text: r.text, json: { headers: r.headers, rows: r.rows, matched: r.matched, hiddenGroups: r.hiddenGroups } }
}

/**
 * "--grup a,k@0,10,60,b" → ['a', 'k@0,10,60', 'b']: elle sınırlı gruplamanın sınırları da virgülle yazıldığı için
 * yalnız sayıdan oluşan parça, önündeki '@'li parçaya eklenir.
 */
export function splitGroups(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(',')) {
    const part = raw.trim()
    if (!part) continue
    const prev = out[out.length - 1]
    if (prev !== undefined && prev.includes('@') && /^-?\d+(\.\d+)?$/.test(part))
      out[out.length - 1] = `${prev},${part}`
    else out.push(part)
  }
  return out
}

/** "n,ort(x),oran(y)" → parçalar (parantez içindeki virgüller korunur). */
function splitMeasures(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/* ───────────── demo ───────────── */

export function formatValidation(v: WorldValidation): string {
  const lines: string[] = [
    `YER GERÇEĞİ DOĞRULAMASI · ${v.passed}/${v.checks.filter((c) => !c.weak).length} denetim geçti · neden atfı isabeti ${pct(v.accuracy, 0)} (${num(v.analyzed)} churn olayı)`,
  ]
  for (const c of v.checks) lines.push(`${c.weak ? '~' : c.ok ? '✓' : '✗'} ${c.name} — ${c.detail}`)
  lines.push(`neden başına isabet: ${v.perCause.map((c) => `${c.cause} ${c.hit}/${c.n}`).join(' · ')}`)
  return lines.join('\n')
}

async function cmdDemo(ctx: CommandContext, a: Args): Promise<CommandResult> {
  const { lab } = ctx
  const existing = loadManifest(lab)
  if (existing && existing.events > 0 && !existing.synthetic)
    throw new Error(
      'Bu lab klasöründe gerçek veri var; demo onu silerdi. Demoyu ayrı bir klasörde çalıştırın: --lab <klasör> (ya da TVP_LAB_DIR).',
    )
  const users = Math.max(200, Math.min(200_000, flagNum(a, 'kullanici') ?? 4000))
  const days = Math.max(60, Math.min(730, flagNum(a, 'gun') ?? 120))
  const seed = flagNum(a, 'tohum') ?? 7
  const end = flagStr(a, 'son') ?? dayStr(Math.floor((Date.now() + lab.settings.tzDakika * 60_000) / 86_400_000) - 1)
  const dir = join(lab.dir, 'demo')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'dunya.jsonl.gz')
  ctx.progress(`sentetik dünya üretiliyor: ${users} kullanıcı × ${days} gün…`)
  const truth = await writeWorld(file, { users, days, seed, end })
  // Gerçek kullanıcının izleyeceği yol: keşif → eşleme önerisi → içe alma. Öneri, dünyanın doğru eşlemesiyle
  // aynı türleri vermiyorsa (olmamalı) doğru eşlemeye düşülür ve fark raporlanır.
  ctx.progress('şema keşfi…')
  const report = await discover([file], { maxLines: 200_000 })
  const suggested = zLabMapping.parse(report.suggestion)
  const expected = zLabMapping.parse(WORLD_MAPPING)
  const kindOf = (m: LabMapping, name: string): string => {
    const r = m.events[name]
    if (r === undefined) return '–'
    const first = Array.isArray(r) ? r[0] : r
    return typeof first === 'string' ? first : first.kind
  }
  const diffs = Object.keys(expected.events).filter((name) => kindOf(suggested, name) !== kindOf(expected, name))
  const mapping = diffs.length ? expected : suggested
  writeJson(lab.mappingFile, diffs.length ? WORLD_MAPPING : report.suggestion)
  ctx.progress('içe alınıyor…')
  const ing = await ingest(lab, [file], { mapping, reset: true, synthetic: true })
  ctx.progress('tablolar kuruluyor…')
  const meta = buildTables(lab)
  ctx.progress('churn analizi…')
  const d = loadChurnData(lab)
  const deep = runDeep(lab, { data: d })
  const v = validateWorld(lab, loadTruth(truthPathOf(file)), d, deep.result, deep.hazard, deep.primaryOfUser)
  saveResult(lab, 'demo-dogrulama', v, { dataRev: meta.dataRev })
  const size = statSync(file).size
  const text = [
    `DEMO HAZIR · ${headerOf(statusOf(meta))}`,
    `dosya: ${basename(file)} (${num(size)} bayt, ${num(truth.lines)} satır) · içe alınan ${num(ing.manifest.events)} olay`,
    `eşleme: otomatik öneri ${diffs.length ? `doğru eşlemeden ${diffs.length} olayda ayrıştı (${diffs.slice(0, 4).join(', ')}); doğru eşleme kullanıldı` : 'doğru eşlemeyle birebir aynı türleri verdi'}`,
    '',
    formatValidation(v),
    '',
    clip(formatDeep(deep.result, { limit: 6, brief: true }), 14),
    '',
    'sıradaki: churn | churn neden | churn tetik | sim kur',
  ].join('\n')
  return { text, json: { validation: v, status: statusOf(meta) } }
}

/* ───────────── günlük / ayar / sözlük ───────────── */

function cmdLog(ctx: CommandContext, a: Args): CommandResult {
  const file = join(ctx.lab.logDir, 'ciktilar.ndjson')
  if (!existsSync(file)) return { text: 'Denetim günlüğü boş.' }
  const n = flagNum(a, 'son') ?? 15
  const lines = readFileSync(file, 'utf8').trim().split('\n').slice(-n)
  const rows = lines.map((l) => JSON.parse(l) as { at: string; komut: string; karakter: number; cikti: string })
  if (flagBool(a, 'tam')) return { text: rows.map((r) => `── ${r.at} · ${r.komut}\n${r.cikti}`).join('\n\n') }
  return {
    text: [
      `DENETİM GÜNLÜĞÜ · ${file}`,
      "lab'ın yazdırdığı her çıktı buradadır; bir ajanla çalışırken modele giden her şey bu dosyada görülebilir.",
      table(rows, [
        { h: 'an', v: (r) => r.at.slice(0, 19).replace('T', ' ') },
        { h: 'komut', v: 'komut', max: 70 },
        { h: 'karakter', v: 'karakter' },
      ]),
      'çıktıların tamamı için: gunluk --tam [--son 3]',
    ].join('\n'),
  }
}

function cmdSettings(ctx: CommandContext, a: Args): CommandResult {
  const patch: Record<string, unknown> = {}
  const k = flagNum(a, 'k')
  if (k !== undefined) {
    if (k < MIN_K) throw new Error(`k-anonimlik eşiği en az ${MIN_K} olmalı.`)
    patch.kAnonim = Math.floor(k)
  }
  const names = flagStr(a, 'icerik-adlari')
  if (names !== undefined) patch.icerikAdlari = !['hayir', 'hayır', 'false', '0'].includes(names.toLowerCase())
  if (Object.keys(patch).length) humanOnly(ctx, 'Gizlilik ayarını değiştirmek', 'ayar --k 20')
  const s = Object.keys(patch).length ? saveSettings(ctx.lab, patch) : ctx.lab.settings
  return {
    text: [
      `AYARLAR · ${join(ctx.lab.dir, 'ayar.json')}`,
      kv({
        'k-anonimlik eşiği (--k)': s.kAnonim,
        'içerik adları çıktıda (--icerik-adlari evet|hayir)': s.icerikAdlari ? 'evet' : 'hayır',
        'saat dilimi (dk)': s.tzDakika,
      }),
    ].join('\n'),
    json: s,
  }
}

export const GLOSSARY = [
  'SÖZLÜK',
  'etkin gün: eşlemedeki etkinlik türlerinden (varsayılan izleme) en az bir olayı olan gün',
  'uygulama günü: en az bir oturumu olan gün (izleme olmasa da)',
  'churn: son etkin günden beri n gün etkinlik yok; n veriden seçilir (churn tanim)',
  'son gün: kullanıcının geri dönmediği son uygulama günü (churn olayı)',
  'boş oturum / boş gün: hiç oynatma içermeyen oturum / uygulama günü',
  'RO (risk oranı): bir deneyimin yaşandığı günün son gün olma riski ÷ benzer kullanıcıların yaşamadığı günlerdeki risk',
  'BD (bilgi değeri): bir özelliğin tek başına churn edenleri ayırma gücü',
  'OO (olasılık oranı): diğer özellikler sabitken etkinin büyüklüğü',
  'taban risk: özel bir işaret yokken de var olan gitme riski',
  'ikiz evren: aynı simüle kullanıcıların aynı rastgelelikle iki ayrı varyantta yaşatılması (eşli karşılaştırma)',
  'CUPED: deney öncesi dönem ölçüsüyle varyans azaltma (aynı kullanıcıyla daha kısa deney)',
  'SRM: kollar arası örneklem oranı uyuşmazlığı (atama bozukluğu göstergesi)',
].join('\n')

export const HELP = [
  'TV+ LAB — yerel churn analizi, simülasyon ve A/B (ham veri makineden çıkmaz; çıktılar yalnız toplamdır)',
  'durum                         neredeyiz, sıradaki adım ne',
  'demo [--kullanici 4000]       sentetik veriyle tüm hattı kur ve yöntemi bilinen gerçeklerle doğrula',
  'kesif <dosya…>                Mixpanel dışa aktarımının şeması + eşleme önerisi (--olay "Ad" ile ayrıntı)',
  'esleme [--kabul|--dosya x]    eşlemeyi göster / öneriyi kabul et',
  'al <dosya…> [--ornek 0.1]     içe al (--deneme: yazmadan rapor; --sifirla: depoyu boşalt)',
  'cek --from G --to G           Mixpanel Export API ile çek ve içe al (kimlik bilgisi ortam değişkenlerinden)',
  'kur                           analiz tablolarını kur',
  'churn [genel|neden|tetik|etken [ad]|kim|yeni|tanim]   churn analizi (--n gün, --etkinlik, --yeniden)',
  'sorgu <tablo> --grup … --olc … --nerede …             toplu sorgu (sorgu: yardım)',
  'sim [durum|kur|karne|varsayim]   uygulama simülasyonu: katalog köprüsü, kalibrasyon + gerçeklik karnesi, parametre kaynakları',
  'deney liste                   uygulamadaki deney tanımları, bayraklar, veride görülen gerçek deneyler, geçmiş koşular',
  'deney calistir <anahtar>      tanımlı deneyi simülasyonda (ikiz evren) çalıştır (--gun 28 --ikiz 1500 --tohum 1)',
  'deney dene --bayrak k=v[,k=v] tanım yazmadan tek değişiklik (--hata 0.5 --takilma 0.5 --devam 1.2 --arama-hata 0.7; --ad x --olcu y)',
  'deney sonuc <anahtar>         kayıtlı koşunun sonucu',
  'deney guc [--olcu izleme_dk]  gerçek veriden güç: hangi sürede hangi etki görülür (--trafik 0.5 --pencere 14)',
  'deney gercek ["<ad>"]         gerçek deneyi çözümle (--pencere 14 --kontrol <kol> --olcu y --pay "a=0.9,b=0.1")',
  'rapor                         insan için HTML rapor',
  'gunluk [--tam]                denetim günlüğü: lab ne yazdırdı',
  'ayar [--k 20]                 gizlilik ayarları',
  'sozluk                        terimler',
  'genel bayraklar: --json (makine çıktısı) · --lab <klasör> · --limit N · MCP aracında komutlar ";" ile ardışık çalışır',
].join('\n')

/** Komutu çalıştırır. Bilinmeyen komut → hata. */
export async function runCommand(ctx: CommandContext, a: Args, extra?: ExtraCommands): Promise<CommandResult> {
  const cmd = a._[0] ?? 'durum'
  switch (cmd) {
    case 'durum':
      return cmdStatus(ctx)
    case 'yardim':
    case 'yardım':
    case 'help':
      return { text: HELP }
    case 'sozluk':
    case 'sözlük':
      return { text: GLOSSARY }
    case 'demo':
      return cmdDemo(ctx, a)
    case 'kesif':
    case 'keşif':
      return cmdDiscover(ctx, a)
    case 'esleme':
    case 'eşleme':
      return cmdMapping(ctx, a)
    case 'al':
      return cmdIngest(ctx, a)
    case 'cek':
    case 'çek':
      return cmdPull(ctx, a)
    case 'kur':
      return cmdBuild(ctx)
    case 'churn':
      return cmdChurn(ctx, a)
    case 'sorgu':
      return cmdQuery(ctx, a)
    case 'gunluk':
    case 'günlük':
      return cmdLog(ctx, a)
    case 'ayar':
      return cmdSettings(ctx, a)
    default: {
      const handler = extra?.[cmd]
      if (handler) return handler(ctx, a)
      throw new Error(`Bilinmeyen komut: ${cmd}\n${HELP}`)
    }
  }
}

export type ExtraCommands = Record<string, (ctx: CommandContext, a: Args) => Promise<CommandResult> | CommandResult>

export interface ExecuteOptions {
  /**
   * Ajan kipi (MCP aracı): lab klasörü sunucu başlarken belirlenir (--lab reddedilir), gizlilik ayarı ve depo sıfırlama
   * kapalıdır, çıktı `maxChars` ile bütçelenir.
   */
  agent?: boolean
  dir?: string
  maxChars?: number
  onProgress?: (line: string) => void
}

/** Çıktı bütçesi: sınırı aşan metin satır sonundan kesilir ve nasıl daraltılacağı söylenir. */
export function budget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const cut = text.lastIndexOf('\n', maxChars)
  const head = text.slice(0, cut > maxChars / 2 ? cut : maxChars)
  return `${head}\n… çıktı bütçesi doldu (${text.length - head.length} karakter daha). Daraltın: alt komut, --limit N, --nerede … ya da ayrı sorun.`
}

/** Komutu çalıştırır, çıktıyı denetim günlüğüne yazar ve metni (ya da JSON'u) döner. */
export async function execute(
  argv: readonly string[],
  parse: (argv: readonly string[]) => Args,
  extra?: ExtraCommands,
  quiet = false,
  opts: ExecuteOptions = {},
): Promise<string> {
  const a = parse(argv)
  if (opts.agent && flagStr(a, 'lab') !== undefined)
    throw new Error('Ajan kipinde lab klasörü değiştirilemez (sunucu başlarken belirlenir).')
  const lab = openLab({ dir: opts.agent ? opts.dir : flagStr(a, 'lab') })
  const ctx: CommandContext = {
    lab,
    agent: opts.agent,
    progress: opts.onProgress ?? (quiet ? () => {} : (line) => process.stderr.write(`· ${line}\n`)),
  }
  let r: CommandResult
  try {
    r = await runCommand(ctx, a, extra)
  } catch (err) {
    // Hata iletisi de çağırana (ajana) gider: denetim günlüğünde o da görünmeli
    audit(lab, argv.join(' '), `Hata: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
  const asJson = flagBool(a, 'json') && r.json !== undefined
  let out = asJson ? JSON.stringify(r.json) : r.text
  if (opts.agent) {
    const max = opts.maxChars ?? 8000
    // Kesilmiş JSON okunamaz: bütçeyi aşıyorsa kesmek yerine metin çıktısına yönlendir
    out =
      asJson && out.length > max
        ? `JSON çıktısı ${out.length} karakter; ajan kipinde bütçe ${max}. --json olmadan (kompakt metin) ya da daha dar bir alt komutla sorun.`
        : budget(out, max)
  }
  audit(lab, argv.join(' '), out)
  return out
}
