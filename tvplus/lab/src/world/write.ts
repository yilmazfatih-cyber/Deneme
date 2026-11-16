/**
 * Yer gerçeği dünyasını dosyaya yazar: `<yol>` (Mixpanel ham dışa aktarım biçimi; .gz ise sıkıştırılır) ve
 * `<yol>.gercek.json` (gömülü nedenler — yalnız doğrulama içindir, içe ALINMAZ).
 */
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { once } from 'node:events'
import { createGzip } from 'node:zlib'
import { writeJson } from '../core/lab'
import { generateWorld, type WorldOptions, type WorldTruth } from './world'

export const truthPathOf = (exportPath: string): string => `${exportPath}.gercek.json`

export async function writeWorld(path: string, opts: WorldOptions): Promise<WorldTruth> {
  mkdirSync(dirname(path), { recursive: true })
  const file = createWriteStream(path)
  const sink = path.endsWith('.gz') ? createGzip({ level: 4 }) : null
  if (sink) sink.pipe(file)
  const target = sink ?? file
  const gen = generateWorld(opts)
  let truth: WorldTruth | null = null
  for (;;) {
    const r = gen.next()
    if (r.done) {
      truth = r.value
      break
    }
    if (!target.write(r.value)) await once(target, 'drain')
  }
  target.end()
  await once(file, 'finish')
  writeJson(truthPathOf(path), truth, false)
  return truth
}
