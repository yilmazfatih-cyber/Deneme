/**
 * Laboratuvar sonuçları — çevrimdışı analiz laboratuvarının (tvplus/lab) yazdığı sonuç dosyalarının SALT OKUNUR
 * penceresi. Sözleşme: shared/lab.ts (yalnız türler; sunucu lab kodunu içe aktarmaz), deney özeti shared/types.ts.
 *
 *   GET /api/studio/lab             → LabIndex                (veri durumu + hangi sonuçlar var)
 *   GET /api/studio/lab/sonuc/:ad   → LabEnvelope<unknown>    (dosya olduğu gibi; ad: ^[a-z0-9][a-z0-9-]{0,80}$)
 *   GET /api/studio/lab/deneyler    → ExperimentRunSummary[]  (deney-*.json + gercek-*.json; en yeni önce)
 *
 * Lab klasörü lab kodundaki kuralla bulunur: TVP_LAB_DIR, yoksa <veri klasörü>/lab; sonuçlar <lab>/sonuc/<ad>.json.
 * Dosyalar küçüktür ve CLI her çalıştığında değişir: önbellek yoktur, her istekte diskten okunur. Klasör yoksa ya da
 * bir dosya bozuksa (JSON değil, sonuç zarfı değil) hata fırlatılmaz; o dosya yok sayılır.
 *
 * Gizlilik: sonuç dosyaları yalnız toplam içerir (kullanıcı kimliği ve ham olay yoktur). Bu eklenti lab klasörünün
 * başka hiçbir yerini (depo, tablo, anahtar) okumaz ve hiçbir şey yazmaz. Erişim öteki /api/studio/* uçlarıyla aynıdır
 * (app.ts'teki stüdyo koruması).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { ROUTES } from '../../../../shared/constants'
import type { ExperimentRun, LabDataStatus, LabEnvelope, LabIndex } from '../../../../shared/lab'
import type { ExperimentRunSummary } from '../../../../shared/types'
import { httpError } from '../../gateway/errors'
import type { AppConfig } from '../../kernel/config'

const BASE = `${ROUTES.STUDIO}/lab`

/** Sonuç adı: küçük harf, rakam ve tire. Nokta ve yol ayırıcı olmadığından ad sonuç klasörünün dışını gösteremez. */
const RESULT_NAME = /^[a-z0-9][a-z0-9-]{0,80}$/
/** Deney koşuları: simülasyon 'deney-<anahtar>', gerçek deney 'gercek-<anahtar>' */
const RUN_NAME = /^(?:deney|gercek)-/
/** Bundan büyük dosya sonuç sayılmaz (beklenen boy onlarca KB; okuma eşzamanlı olduğu için üst sınır). */
const MAX_RESULT_BYTES = 8 * 1024 * 1024

/** Sonuç klasörü. Ortam değişkeni her çağrıda okunur: lab klasörü sunucu yeniden başlamadan değişebilir. */
export function labResultDir(config: Pick<AppConfig, 'dataDir'>): string {
  const labDir = process.env.TVP_LAB_DIR ? resolve(process.env.TVP_LAB_DIR) : join(config.dataDir, 'lab')
  return join(labDir, 'sonuc')
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Klasördeki sonuç adları (uzantısız, ada göre sıralı). Klasör yoksa boş liste. */
function resultNames(dir: string): string[] {
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return []
  }
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .filter((name) => RESULT_NAME.test(name))
    .sort()
}

/** Bir sonuç dosyasını okur. Dosya yoksa, okunamıyorsa ya da sonuç zarfı değilse null döner (hata fırlatmaz). */
function readEnvelope(dir: string, name: string): LabEnvelope<unknown> | null {
  try {
    const file = join(dir, `${name}.json`)
    const st = statSync(file, { throwIfNoEntry: false })
    if (!st || !st.isFile() || st.size > MAX_RESULT_BYTES) return null
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!isObject(parsed) || typeof parsed.at !== 'string' || !('data' in parsed)) return null
    return parsed as unknown as LabEnvelope<unknown>
  } catch {
    return null
  }
}

/** Zarfın verisi bir deney koşusuna benziyor mu (özet için gereken alanlar). */
function isRun(data: unknown): data is ExperimentRun {
  return (
    isObject(data) &&
    typeof data.key === 'string' &&
    typeof data.name === 'string' &&
    Array.isArray(data.arms) &&
    data.arms.every(isObject)
  )
}

function summarize(name: string, env: LabEnvelope<unknown>): ExperimentRunSummary | null {
  const run = env.data
  if (!isRun(run)) return null
  return {
    name,
    key: run.key,
    title: run.name,
    source: run.source,
    design: run.design,
    at: typeof run.at === 'string' ? run.at : env.at,
    days: run.days,
    synthetic: run.synthetic === true,
    fidelity: typeof run.fidelity === 'number' ? run.fidelity : null,
    arms: run.arms.map((a) => ({ key: a.key, decision: a.decision, summary: a.summary })),
  }
}

/** En yeni önce; an okunamıyorsa sona, eşitlikte ada göre. */
function newestFirst(a: ExperimentRunSummary, b: ExperimentRunSummary): number {
  const ta = Date.parse(a.at) || 0
  const tb = Date.parse(b.at) || 0
  return tb - ta || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}

export default async function labPlugin(app: FastifyInstance): Promise<void> {
  app.get(BASE, async (_req, reply): Promise<LabIndex> => {
    const dir = labResultDir(app.config)
    const results: LabIndex['results'] = []
    let status: LabDataStatus | null = null
    for (const name of resultNames(dir)) {
      const env = readEnvelope(dir, name)
      if (!env) continue
      results.push({ name, at: env.at, dataRev: typeof env.dataRev === 'string' ? env.dataRev : null })
      if (name === 'durum' && isObject(env.data)) status = env.data as unknown as LabDataStatus
    }
    reply.header('cache-control', 'no-store')
    return { ready: status !== null, status, results }
  })

  app.get(`${BASE}/deneyler`, async (_req, reply): Promise<ExperimentRunSummary[]> => {
    const dir = labResultDir(app.config)
    const runs: ExperimentRunSummary[] = []
    for (const name of resultNames(dir)) {
      if (!RUN_NAME.test(name)) continue
      const env = readEnvelope(dir, name)
      const summary = env && summarize(name, env)
      if (summary) runs.push(summary)
    }
    reply.header('cache-control', 'no-store')
    return runs.sort(newestFirst)
  })

  app.get<{ Params: { ad: string } }>(`${BASE}/sonuc/:ad`, async (req, reply): Promise<LabEnvelope<unknown>> => {
    const { ad } = req.params
    if (!RESULT_NAME.test(ad))
      throw httpError(
        400,
        'VALIDATION_FAILED',
        'Sonuç adı geçersiz: yalnız küçük harf, rakam ve tire içerebilir (ör. churn, sim-karne, deney-kalite).',
      )
    const env = readEnvelope(labResultDir(app.config), ad)
    if (!env)
      throw httpError(
        404,
        'LAB_RESULT_NOT_FOUND',
        `"${ad}" adlı bir laboratuvar sonucu yok ya da dosyası okunamıyor. Sonuçlar terminalden üretilir: npm run lab -- durum`,
      )
    reply.header('cache-control', 'no-store')
    return env
  })
}
