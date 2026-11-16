/**
 * Laboratuvarın çalışma alanı. Her şey TEK bir klasörde ve yerelde durur (varsayılan `tvplus/.data/lab`, git'e girmez):
 *
 *   ayar.json      ayarlar (k-anonimlik eşiği, içerik adları gösterilsin mi, saat dilimi)
 *   anahtar        kullanıcı kimliklerini takma kimliğe çeviren gizli anahtar (0600; TVP_LAB_SECRET varsa o)
 *   esleme.json    Mixpanel eşlemesi (olay ve özellik adlarınız — depoya girmez)
 *   depo/          içe alınmış olaylar: kullanıcıya göre bölümlenmiş ikili kayıtlar + sözlükler
 *   tablo/         türetilmiş kolon tabloları (kullanıcılar, kullanıcı-günler, oturumlar, izleme özetleri)
 *   sonuc/         analiz sonuçları (JSON; Stüdyo ve rapor bunları okur)
 *   rapor/         insan için HTML / Markdown raporlar
 *   sim/           simülasyon dünyası (katalog köprüsü, kalibrasyon, deney koşuları)
 *   gunluk/        denetim günlüğü: lab'ın yazdırdığı her çıktı (ajanın gördüğü her şey buradadır)
 */
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface LabSettings {
  /** Bundan az kullanıcılı gruplar çıktıda gösterilmez (k-anonimlik) */
  kAnonim: number
  /** İçerik adları çıktılarda gösterilsin mi (false → 'içerik #17' gibi sıra numarası) */
  icerikAdlari: boolean
  /** Gün sınırları için saat dilimi farkı (dakika; İstanbul 180) */
  tzDakika: number
}

export const DEFAULT_SETTINGS: LabSettings = { kAnonim: 20, icerikAdlari: true, tzDakika: 180 }
/** k-anonimlik eşiğinin alt sınırı */
export const MIN_K = 5

export interface Lab {
  dir: string
  storeDir: string
  tableDir: string
  resultDir: string
  reportDir: string
  simDir: string
  logDir: string
  mappingFile: string
  settings: LabSettings
  /** Takma kimlik anahtarı */
  key: Buffer
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** tvplus/ kök klasörü */
export const tvplusRoot = (): string => ROOT

export function defaultLabDir(): string {
  if (process.env.TVP_LAB_DIR) return resolve(process.env.TVP_LAB_DIR)
  return join(process.env.TVP_DATA_DIR ? resolve(process.env.TVP_DATA_DIR) : join(ROOT, '.data'), 'lab')
}

function loadKey(dir: string): Buffer {
  if (process.env.TVP_LAB_SECRET) return Buffer.from(process.env.TVP_LAB_SECRET, 'utf8')
  const file = join(dir, 'anahtar')
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex')
  const key = randomBytes(32)
  writeFileSync(file, key.toString('hex'), { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    /* bazı dosya sistemleri kipi desteklemez */
  }
  return key
}

export function openLab(opts: { dir?: string; secret?: string } = {}): Lab {
  const dir = opts.dir ? resolve(opts.dir) : defaultLabDir()
  const sub = (name: string): string => {
    const p = join(dir, name)
    mkdirSync(p, { recursive: true })
    return p
  }
  mkdirSync(dir, { recursive: true })
  const settingsFile = join(dir, 'ayar.json')
  let settings = { ...DEFAULT_SETTINGS }
  if (existsSync(settingsFile)) {
    try {
      settings = { ...settings, ...(JSON.parse(readFileSync(settingsFile, 'utf8')) as Partial<LabSettings>) }
    } catch {
      /* bozuk ayar dosyası: varsayılanlar */
    }
  }
  if (process.env.TVP_LAB_K) settings.kAnonim = Number(process.env.TVP_LAB_K) || settings.kAnonim
  // Eşik hiçbir yoldan (ayar dosyası, ortam değişkeni) 5'in altına inmez: daha küçük gruplar kişiyi ele verir
  settings.kAnonim = Math.max(MIN_K, Math.floor(Number(settings.kAnonim) || DEFAULT_SETTINGS.kAnonim))
  return {
    dir,
    storeDir: sub('depo'),
    tableDir: sub('tablo'),
    resultDir: sub('sonuc'),
    reportDir: sub('rapor'),
    simDir: sub('sim'),
    logDir: sub('gunluk'),
    mappingFile: join(dir, 'esleme.json'),
    settings,
    key: opts.secret ? Buffer.from(opts.secret, 'utf8') : loadKey(dir),
  }
}

export function saveSettings(lab: Lab, patch: Partial<LabSettings>): LabSettings {
  lab.settings = { ...lab.settings, ...patch }
  writeJson(join(lab.dir, 'ayar.json'), lab.settings)
  return lab.settings
}

/** Atomik JSON yazımı. */
export function writeJson(file: string, value: unknown, pretty = true): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value))
  renameSync(tmp, file)
}
export function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

/* ───────────── Sonuçlar ve denetim günlüğü ───────────── */

export interface ResultEnvelope<T> {
  name: string
  /** ISO an */
  at: string
  /** Sonucun dayandığı veri sürümü (tablo kurulum damgası) */
  dataRev: string | null
  params: Record<string, unknown>
  data: T
}

export function saveResult<T>(
  lab: Lab,
  name: string,
  data: T,
  meta: { dataRev?: string | null; params?: Record<string, unknown> } = {},
): ResultEnvelope<T> {
  const env: ResultEnvelope<T> = {
    name,
    at: new Date().toISOString(),
    dataRev: meta.dataRev ?? null,
    params: meta.params ?? {},
    data,
  }
  writeJson(join(lab.resultDir, `${name}.json`), env, false)
  return env
}
export function loadResult<T>(lab: Lab, name: string): ResultEnvelope<T> | null {
  return readJson<ResultEnvelope<T>>(join(lab.resultDir, `${name}.json`))
}

/**
 * Denetim günlüğü: bir komutun yazdırdığı metni olduğu gibi kaydeder. Ajanla çalışırken modele giden her şey
 * bu dosyadadır; kullanıcı dilediğinde açıp bakabilir (`npm run lab -- gunluk`).
 */
export function audit(lab: Lab, command: string, output: string): void {
  try {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      komut: command,
      karakter: output.length,
      cikti: output,
    })
    const file = join(lab.logDir, 'ciktilar.ndjson')
    writeFileSync(file, `${line}\n`, { flag: 'a' })
  } catch {
    /* günlük yazılamadıysa komut yine de çalışır */
  }
}
