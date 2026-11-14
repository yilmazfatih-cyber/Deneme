/**
 * İçerik paketi: `content/**` içinden (ve kökten birkaç dosya) sunucunun çalışma anında okuduğu metin dosyaları tek bir JSON'da toplanır;
 * worker açılışta indirip bellek içi dosya sistemine (/content) yerleştirir. Kullanılmayan büyük dosyalar dışarıda
 * kalır: model ağırlıkları (model.safetensors — vektörler vectors.jsonl'de), kare görselleri (*.jpg — tarayıcıda
 * sharp yok), belgeler (*.md) ve geliştirici raporları.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { ContentPack } from '../shared/protocol'

const EXCLUDE: RegExp[] = [
  /(^|\/)\./, // gizli dosyalar (.youtube-report.json …)
  /\.safetensors$/,
  /\.(jpe?g|png|webp|gif|mp4|webm|bin)$/i,
  /\.md$/i,
]

export interface PackResult {
  json: string
  files: number
  bytes: number
  skipped: string[]
}

/**
 * @param rootDir tvplus/ kökü. `content/**` → `/content/...`; sunucunun kök klasörden okuduğu GraphQL şeması ve kalıcı
 *   sorgu kayıt defteri → `/app/shared/graphql/...` (worker'da rootDir `/app`).
 */
export function buildContentPack(rootDir: string): PackResult {
  const contentDir = join(rootDir, 'content')
  const files: Record<string, string> = {}
  for (const rel of ['shared/graphql/schema.graphql', 'shared/graphql/persisted.server.json'])
    files[`/app/${rel}`] = readFileSync(join(rootDir, rel), 'utf8')
  const skipped: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name)
      const rel = relative(contentDir, abs).split(sep).join('/')
      if (statSync(abs).isDirectory()) {
        if (/(^|\/)\./.test(rel)) continue
        walk(abs)
        continue
      }
      if (EXCLUDE.some((re) => re.test(rel))) {
        skipped.push(rel)
        continue
      }
      files[`/content/${rel}`] = readFileSync(abs, 'utf8')
    }
  }
  walk(contentDir)
  const body = JSON.stringify(files)
  const version = createHash('sha256').update(body).digest('hex').slice(0, 16)
  const pack: ContentPack = { version, files }
  const json = JSON.stringify(pack)
  return { json, files: Object.keys(files).length, bytes: Buffer.byteLength(json), skipped }
}
