/**
 * Mixpanel ham dışa aktarımını izleme verisi deposuna alır (ayrıntı: docs/MIXPANEL.md).
 *
 *   npm run mixpanel:import -- --file <yol.jsonl[.gz]> [--dry-run]            dosyadan
 *   npm run mixpanel:import -- --from 2026-10-01 --to 2026-10-07 [--dry-run]   Export API'den (ortam değişkenleri)
 *   … --server http://127.0.0.1:8787                                          çalışan sunucuya gönder (TVP_STUDIO_KEY)
 *
 * Doğrudan kip depoyu (TVP_DATA_DIR/viewing) bu süreçte açar; sunucu aynı depoyu açık tutuyorsa kilit yüzünden
 * reddeder — çalışan sunucunun bellekteki özetleri eskir, bu yüzden o durumda --server kullanılır.
 * Takma kimlikler sunucunun gizli anahtarından türediği için doğrudan kip sunucuyla aynı TVP_DATA_DIR (ya da
 * TVP_SECRET) ile çalıştırılmalıdır.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EnvHttpProxyAgent, fetch } from 'undici'
import { HEADERS, ROUTES } from '../shared/constants'
import type { ImportReport } from '../shared/intelligence'
import { loadContent } from '../server/src/services/catalog/load'
import { deriveKey, loadConfig } from '../server/src/kernel/config'
import { importMixpanelExport } from '../server/src/services/mixpanel/importer'
import { compileMapping, loadEffectiveMapping, mappingPaths } from '../server/src/services/mixpanel/mapping'
import { pullExport, validateRange } from '../server/src/services/mixpanel/pull'
import { SYNTHETIC_MAPPING } from '../server/src/services/mixpanel/synthetic'
import { createTitleResolver } from '../server/src/services/viewing/resolve'
import { openViewingStore } from '../server/src/services/viewing/store'
import { isMain } from './lib/net'

export interface ImportArgs {
  file: string | null
  from: string | null
  to: string | null
  dryRun: boolean
  server: string | null
}

export function parseImportArgs(argv: string[]): ImportArgs {
  const get = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`)
    if (i < 0) return null
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`--${name} bir değer ister`)
    return v
  }
  const args: ImportArgs = {
    file: get('file'),
    from: get('from'),
    to: get('to'),
    dryRun: argv.includes('--dry-run'),
    server: get('server'),
  }
  if (args.file && (args.from || args.to)) throw new Error('--file ile --from/--to birlikte kullanılamaz')
  if (!args.file && !(args.from && args.to))
    throw new Error('Kullanım: --file <yol> [--dry-run]  ya da  --from YYYY-MM-DD --to YYYY-MM-DD   [--server <adres>]')
  if (args.from || args.to) {
    const bad = validateRange(args.from, args.to)
    if (bad) throw new Error(bad)
  }
  if (args.server && !/^https?:\/\/[^/]+/.test(args.server)) throw new Error('--server http(s)://makine:port olmalı')
  return args
}

/** Raporu insan okur biçimde yazar. */
export function formatImportReport(r: ImportReport, dryRun: boolean): string {
  const out = [
    `${dryRun ? 'DENEME (depoya yazılmadı) — ' : ''}${r.source} ${r.from ?? '?'} … ${r.to ?? '?'}`,
    `  satır ${r.lines} · kabul ${r.accepted} · yinelenen ${r.duplicates} · reddedilen ${r.rejected}`,
  ]
  const unmapped = Object.entries(r.unmappedEvents)
  if (unmapped.length) {
    out.push(`  Eşlenmeyen olaylar (eşleme dosyasına eklenmeli ya da yok sayılabilir):`)
    for (const [name, n] of unmapped.slice(0, 20)) out.push(`    ${n.toString().padStart(8)}  ${name}`)
  }
  if (r.unknownTitles.length) {
    out.push(`  Katalogda bulunamayan içerik kimlikleri (başlıklara externalIds olarak yazılmalı):`)
    for (const u of r.unknownTitles.slice(0, 20)) out.push(`    ${u.count.toString().padStart(8)}  ${u.externalId}`)
  }
  return out.join('\n')
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)} MB`

async function viaServer(args: ImportArgs): Promise<ImportReport> {
  const dispatcher = new EnvHttpProxyAgent({ bodyTimeout: 0, headersTimeout: 0 })
  const headers: Record<string, string> = {}
  const key = process.env.TVP_STUDIO_KEY
  if (key) headers[HEADERS.STUDIO_KEY] = key
  const base = args.server!.replace(/\/+$/, '')
  let res
  if (args.file) {
    const url = `${base}${ROUTES.STUDIO}/sources/mixpanel/import${args.dryRun ? '?dryRun=1' : ''}`
    res = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/x-ndjson',
        'content-length': String(statSync(args.file).size),
      },
      body: createReadStream(args.file),
      duplex: 'half',
      dispatcher,
    })
  } else {
    res = await fetch(`${base}${ROUTES.STUDIO}/sources/mixpanel/pull`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ from: args.from, to: args.to }),
      dispatcher,
    })
  }
  const text = await res.text()
  if (!res.ok) {
    let msg = text.slice(0, 300)
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? msg
    } catch {
      /* düz metin */
    }
    throw new Error(`Sunucu ${res.status} döndü: ${msg}${res.status === 401 ? ' (TVP_STUDIO_KEY ayarlı mı?)' : ''}`)
  }
  return JSON.parse(text) as ImportReport
}

async function direct(args: ImportArgs): Promise<ImportReport> {
  const config = loadConfig()
  const bundle = loadContent(config.contentDir, (level, msg) => {
    if (level === 'error') console.error(msg)
  })
  const { mapping, origin } = loadEffectiveMapping(
    mappingPaths(config.dataDir, config.contentDir),
    SYNTHETIC_MAPPING,
    (m) => console.warn(m),
  )
  console.log(`Eşleme: ${origin} · katalog: ${bundle.titles.length} başlık · depo: ${join(config.dataDir, 'viewing')}`)
  const store = await openViewingStore({
    dir: join(config.dataDir, 'viewing'),
    viewerKey: deriveKey(config, 'viewer-id'),
    snapshotDelayMs: 60_000,
  })
  try {
    let input: AsyncIterable<Buffer | Uint8Array>
    let range: { from: string; to: string } | undefined
    if (args.file) {
      if (!existsSync(args.file)) throw new Error(`Dosya yok: ${args.file}`)
      input = createReadStream(args.file, { highWaterMark: 1024 * 1024 })
    } else {
      const mp = config.mixpanel
      if (!mp.serviceAccountUsername || !mp.serviceAccountSecret || !mp.projectId)
        throw new Error(
          'MIXPANEL_SERVICE_ACCOUNT_USERNAME, MIXPANEL_SERVICE_ACCOUNT_SECRET ve MIXPANEL_PROJECT_ID ortam değişkenleri gerekli',
        )
      range = { from: args.from!, to: args.to! }
      input = pullExport({
        ...range,
        region: mp.region,
        username: mp.serviceAccountUsername,
        secret: mp.serviceAccountSecret,
        projectId: mp.projectId,
        onAttempt: (a) => console.log(`  Mixpanel ${a.from}…${a.to} deneme ${a.attempt}: ${a.status ?? 'ağ hatası'}`),
      })
    }
    let lastLog = Date.now()
    const report = await importMixpanelExport(input, {
      source: 'MIXPANEL',
      mapping: compileMapping(mapping),
      resolver: createTitleResolver(bundle.titles.map((t) => t.title)),
      viewerKey: deriveKey(config, 'viewer-id'),
      eventKey: deriveKey(config, 'viewing-event-id'),
      sink: store,
      dryRun: args.dryRun,
      range,
      onProgress: (lines) => {
        if (Date.now() - lastLog > 5000) {
          lastLog = Date.now()
          console.log(`  … ${lines} satır (bellek ${mb(process.memoryUsage().rss)})`)
        }
      },
    })
    if (!args.dryRun) store.recordImport(report)
    return report
  } finally {
    store.close()
  }
}

export async function runImport(args: ImportArgs): Promise<ImportReport> {
  return args.server ? viaServer(args) : direct(args)
}

if (isMain(import.meta.url)) {
  try {
    const args = parseImportArgs(process.argv.slice(2))
    const t0 = Date.now()
    const report = await runImport(args)
    console.log(formatImportReport(report, args.dryRun))
    const m = process.memoryUsage()
    console.log(
      `  süre ${((Date.now() - t0) / 1000).toFixed(1)} sn · bellek (bu süreç) rss ${mb(m.rss)}, heap ${mb(m.heapUsed)}`,
    )
  } catch (e) {
    console.error(`Hata: ${(e as Error).message}`)
    process.exit(1)
  }
}
