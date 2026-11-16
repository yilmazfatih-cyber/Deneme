// Ağaç silkeleme (tree shaking): kullanılmayan dışa aktarımları ve onlara giden kodu atar. Varsayım: modüller
// yan etkisizdir — hiçbir dışa aktarımı kullanılmayan modül tümden düşer. Dahil edilen modülün "diğer"
// deyimleri (başlatma kodu) ise tutulur. Yalnız `import './x.js'` biçimindeki çıplak içe aktarma, modülü
// yan etkisi için dahil eder.
// Algoritma (iş listesi): girişin tüm dışa aktarımları "kullanılır". Kullanılan ad → onu tanımlayan deyim
// canlı → deyimin başvurduğu adlar → yerel bildirim ya da içe aktarma → kaynak modülde kullanılan ad ...
// Yeniden dışa aktarım (`export { a } from`, `export *`) zinciri izlenir.
// Genişletme: "sideEffects" listesi (bu modüller yan etkilidir, düşürme) seçeneği `includeModule`'e eklenir.
import type { ModuleGraph, ModuleRecord } from './graph.ts'
import type { Statement } from './module_parser.ts'

export interface ShakeResult {
  included: Set<string>
  /** Modül → canlı deyim sıraları. */
  live: Map<string, Set<number>>
  /** Modül → kullanılan dışa aktarım adları. */
  usedExports: Map<string, Set<string>>
}

/** Bir modülün dışa aktardığı tüm adlar (export * zinciri dahil; 'default' yıldızla geçmez). */
export function exportNames(graph: ModuleGraph, id: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>()
  const record = graph.modules.get(id)
  if (!record || seen.has(id)) return names
  seen.add(id)
  for (const s of record.parsed.statements) {
    if (s.kind === 'declaration' && s.exported) s.names.forEach((n) => names.add(n))
    else if (s.kind === 'default') names.add('default')
    else if (s.kind === 'export-names') s.specifiers.forEach((x) => names.add(x.exported))
    else if (s.kind === 'export-from') {
      if (s.namespace) names.add(s.namespace)
      s.specifiers.forEach((x) => names.add(x.exported))
      if (s.star)
        for (const n of exportNames(graph, record.deps.get(s.source) as string, seen)) if (n !== 'default') names.add(n)
    }
  }
  return names
}

export function shake(graph: ModuleGraph, treeShake = true): ShakeResult {
  const included = new Set<string>()
  const live = new Map<string, Set<number>>()
  const usedExports = new Map<string, Set<string>>()
  const record = (id: string) => graph.modules.get(id) as ModuleRecord
  const statements = (id: string) => record(id).parsed.statements

  const markStatement = (id: string, index: number): void => {
    const set = live.get(id) as Set<number>
    if (set.has(index)) return
    set.add(index)
    for (const name of (statements(id)[index] as Statement).refs) resolveLocal(id, name)
  }

  const resolveLocal = (id: string, name: string): void => {
    statements(id).forEach((s, i) => {
      if ((s.kind === 'declaration' && s.names.includes(name)) || (s.kind === 'default' && s.name === name))
        markStatement(id, i)
      if (s.kind === 'import') {
        const spec = s.specifiers.find((x) => x.local === name)
        if (!spec) return
        markStatement(id, i)
        const source = record(id).deps.get(s.source) as string
        if (spec.imported === '*') useAll(source)
        else useExport(source, spec.imported)
      }
    })
  }

  const includeModule = (id: string): void => {
    if (included.has(id)) return
    included.add(id)
    live.set(id, new Set())
    usedExports.set(id, new Set())
    statements(id).forEach((s, i) => {
      if (s.kind === 'other' || !treeShake) markStatement(id, i)
      if (s.kind === 'import' && s.specifiers.length === 0) {
        markStatement(id, i)
        includeModule(record(id).deps.get(s.source) as string)
      }
    })
  }

  const useExport = (id: string, name: string): void => {
    includeModule(id)
    const used = usedExports.get(id) as Set<string>
    if (used.has(name)) return
    used.add(name)
    statements(id).forEach((s, i) => {
      if (s.kind === 'declaration' && s.exported && s.names.includes(name)) markStatement(id, i)
      else if (s.kind === 'default' && name === 'default') markStatement(id, i)
      else if (s.kind === 'export-names')
        s.specifiers.filter((x) => x.exported === name).forEach((x) => resolveLocal(id, x.local))
      else if (s.kind === 'export-from') {
        const source = record(id).deps.get(s.source) as string
        if (s.namespace === name) useAll(source)
        s.specifiers.filter((x) => x.exported === name).forEach((x) => useExport(source, x.local))
        if (s.star && name !== 'default' && exportNames(graph, source).has(name)) useExport(source, name)
      }
    })
  }

  const useAll = (id: string): void => {
    includeModule(id)
    for (const name of exportNames(graph, id)) useExport(id, name)
  }

  if (treeShake) useAll(graph.entry)
  else for (const id of graph.order) useAll(id)
  return { included, live, usedExports }
}
