// Paketleyicinin dış yüzü: çizgeyi kur → silkele → üret → (isteğe bağlı) kaynak haritası. Sonuçta hangi
// modüllerin dahil edildiği/düşürüldüğü, döngüler ve kaç deyimin tutulduğu da raporlanır.
// Genişletme: küçültme (minify) için `code` üzerinde ayrı bir geçiş yazın; kaynak haritası satır eşlemeli
// olduğu için satır yapısını bozan küçültme haritayı da güncellemelidir.
import { emitBundle, type Format } from './emit.ts'
import { buildGraph, type FileSystem } from './graph.ts'
import { shake } from './shake.ts'
import { buildSourceMap, inlineComment, type SourceMapV3 } from './sourcemap.ts'

export interface BundleOptions {
  entry: string
  fs: FileSystem
  format?: Format
  /** iife biçiminde genel değişken adı. */
  name?: string
  treeShake?: boolean
  sourceMap?: boolean | 'inline'
  /** Haritadaki "file" alanı. */
  outFile?: string
}

export interface BundleResult {
  code: string
  map: SourceMapV3 | undefined
  included: string[]
  removed: string[]
  cycles: string[][]
  stats: { statements: number; kept: number }
}

export function bundle(options: BundleOptions): BundleResult {
  const graph = buildGraph(options.entry, options.fs)
  const result = shake(graph, options.treeShake ?? true)
  const lines = emitBundle(graph, result, options.format ?? 'iife', options.name)
  const included = graph.order.filter((id) => result.included.has(id))
  let code = lines.map((l) => l.text).join('\n')
  let map: SourceMapV3 | undefined
  if (options.sourceMap) {
    const sources = included
    map = buildSourceMap(
      options.outFile ?? 'paket.js',
      sources,
      sources.map((id) => graph.modules.get(id)?.parsed.source ?? ''),
      lines.map((l) => (l.origin ? { source: sources.indexOf(l.origin.module), line: l.origin.line - 1 } : null)),
    )
    if (options.sourceMap === 'inline') code += `\n${inlineComment(map)}`
  }
  let statements = 0
  let kept = 0
  for (const id of graph.order) {
    statements += graph.modules.get(id)?.parsed.statements.length ?? 0
    kept += result.live.get(id)?.size ?? 0
  }
  return {
    code: `${code}\n`,
    map,
    included,
    removed: graph.order.filter((id) => !result.included.has(id)),
    cycles: graph.cycles,
    stats: { statements, kept },
  }
}
