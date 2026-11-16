// Modül çizgesi: giriş dosyasından başlayıp her içe aktarmayı çözerek tüm modülleri yükler. Yol çözme yalnız
// göreli/kök yollar içindir ("./a.js", "../b", "/c.js"); uzantısız yolda .js, .mjs ve /index.js denenir.
// Sıra: derinlik öncelikli, bağımlılık önce (ESM'nin değerlendirme sırası). Döngüsel bağımlılıklar Tarjan
// algoritmasıyla bulunur ve raporlanır (paketleme yine yapılır; bkz. README "Döngüler").
// Dosya sistemi dışarıdan verilir (`FileSystem`): testlerde bellekteki bir harita, komut satırında node:fs.
// Genişletme: paket adlarını (node_modules) çözmek için `resolveSpecifier`'a package.json "exports" okuması ekleyin.
import { parseModule, type ParsedModule } from './module_parser.ts'

export interface FileSystem {
  readFile(path: string): string | undefined
}

export interface ModuleRecord {
  id: string
  parsed: ParsedModule
  /** İçe aktarma dizgisi → çözülmüş modül kimliği. */
  deps: Map<string, string>
}

export interface ModuleGraph {
  entry: string
  modules: Map<string, ModuleRecord>
  /** Bağımlılıklar önce gelecek biçimde sıra. */
  order: string[]
  cycles: string[][]
}

/** "a/./b/../c.js" → "a/c.js" (eğik çizgili yollar; tarayıcıda da çalışsın diye node:path kullanılmaz). */
export function normalizePath(path: string): string {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return (path.startsWith('/') ? '/' : '') + out.join('/')
}

export function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? (path.startsWith('/') ? '/' : '') : path.slice(0, index)
}

export function resolveSpecifier(from: string, specifier: string, fs: FileSystem): string {
  if (!/^(\.{1,2}\/|\/)/.test(specifier)) {
    throw new Error(
      `Paket adıyla içe aktarma desteklenmez: "${specifier}" (${from}). Göreli yol kullanın ("./dosya.js").`,
    )
  }
  const base = specifier.startsWith('/') ? specifier : `${dirname(from)}/${specifier}`
  const joined = normalizePath(base)
  const candidates = [joined, `${joined}.js`, `${joined}.mjs`, `${joined}/index.js`]
  const found = candidates.find((candidate) => fs.readFile(candidate) !== undefined)
  if (!found)
    throw new Error(`Modül bulunamadı: "${specifier}" (${from} içinden). Denenen yollar: ${candidates.join(', ')}`)
  return found
}

function importSources(parsed: ParsedModule): string[] {
  const out: string[] = []
  for (const s of parsed.statements) if (s.kind === 'import' || s.kind === 'export-from') out.push(s.source)
  return out
}

export function buildGraph(entry: string, fs: FileSystem): ModuleGraph {
  const entryId = normalizePath(entry)
  const modules = new Map<string, ModuleRecord>()
  const order: string[] = []
  const visit = (id: string) => {
    if (modules.has(id)) return
    const source = fs.readFile(id)
    if (source === undefined) throw new Error(`Giriş dosyası okunamadı: ${id}`)
    let parsed: ParsedModule
    try {
      parsed = parseModule(source)
    } catch (error) {
      throw new Error(`${id} çözümlenemedi: ${(error as Error).message}`, { cause: error })
    }
    const record: ModuleRecord = { id, parsed, deps: new Map() }
    modules.set(id, record)
    for (const specifier of importSources(parsed)) {
      const target = resolveSpecifier(id, specifier, fs)
      record.deps.set(specifier, target)
      visit(target)
    }
    order.push(id)
  }
  visit(entryId)
  return { entry: entryId, modules, order, cycles: findCycles(modules) }
}

/** Güçlü bağlı bileşenler (Tarjan): birden çok modüllü ya da kendini içe aktaran bileşen döngüdür. */
export function findCycles(modules: Map<string, ModuleRecord>): string[][] {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const cycles: string[][] = []
  let counter = 0
  const strongConnect = (id: string) => {
    index.set(id, counter)
    low.set(id, counter++)
    stack.push(id)
    onStack.add(id)
    for (const dep of modules.get(id)?.deps.values() ?? []) {
      if (!index.has(dep)) {
        strongConnect(dep)
        low.set(id, Math.min(low.get(id) as number, low.get(dep) as number))
      } else if (onStack.has(dep)) low.set(id, Math.min(low.get(id) as number, index.get(dep) as number))
    }
    if (low.get(id) !== index.get(id)) return
    const component: string[] = []
    let member: string
    do {
      member = stack.pop() as string
      onStack.delete(member)
      component.push(member)
    } while (member !== id)
    const selfImport = [...(modules.get(id)?.deps.values() ?? [])].includes(id)
    if (component.length > 1 || selfImport) cycles.push(component.reverse())
  }
  for (const id of modules.keys()) if (!index.has(id)) strongConnect(id)
  return cycles
}
