// Kod üretimi: her dahil modül bir işleve sarılır: function (exports, __require) { … }. Küçük çalışma zamanı
// (`__require`) modülü ilk istendiğinde bir kez çalıştırır ve dışa aktarımlarını önbelleğe alır.
// Dönüşümler:
//   import { a as b } from './x.js'  → const { a: b } = __require("x.js")      (bağ anlık görüntüdür)
//   import * as ns from './x.js'     → const ns = __require("x.js")            (canlı: alıcılar üzerinden)
//   export const a = 1               → const a = 1  +  alıcı a: () => a
//   export default ifade             → const __default = ifade
//   export { a } from './x.js'       → alıcı a: () => __reN.a  (canlı)
//   export * from './x.js'           → __exportStar(exports, __require("x.js"))
// Alıcılar (getter) modül gövdesinden ÖNCE tanımlanır: döngüsel içe aktarmada bile yukarı taşınan (hoisted)
// function bildirimleri erişilebilir olur; let/const'a erken erişim ESM'deki gibi ReferenceError verir.
// Genişletme: ad çakışmasız "kapsam yükseltme" (scope hoisting) için modül sarmalarını kaldırıp adları
// yeniden adlandırmak gerekir; bu, tam bir ayrıştırıcı ister (README "Buradan nereye").
import type { ModuleGraph, ModuleRecord } from './graph.ts'
import type { Statement } from './module_parser.ts'
import type { ShakeResult } from './shake.ts'

export interface EmittedLine {
  text: string
  origin: { module: string; line: number } | null
}

const RUNTIME = `var __modules = {};
var __cache = {};
function __require(id) {
  var cached = __cache[id];
  if (cached) return cached.exports;
  var module = { exports: Object.create(null) };
  Object.defineProperty(module.exports, Symbol.toStringTag, { value: "Module" });
  __cache[id] = module;
  __modules[id](module.exports, __require);
  return module.exports;
}
function __export(target, getters) {
  for (var name in getters) Object.defineProperty(target, name, { enumerable: true, get: getters[name] });
}
function __exportStar(target, source) {
  for (var name of Object.keys(source)) {
    if (name !== "default" && !Object.prototype.hasOwnProperty.call(target, name)) {
      Object.defineProperty(target, name, { enumerable: true, get: (function (key) { return function () { return source[key]; }; })(name) });
    }
  }
}`

const isIdentifier = (name: string) => /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name)
const key = (name: string) => (isIdentifier(name) ? name : JSON.stringify(name))

/** Kaynak metindeki konumun satır numarası (1 tabanlı). */
function lineAt(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i++) if (source.charCodeAt(i) === 10) line++
  return line
}

function bodyText(source: string, s: Statement): string {
  if (s.kind === 'declaration') return source.slice(s.bodyStart, s.end)
  if (s.kind === 'default') {
    const text = source.slice(s.bodyStart, s.end)
    if (!s.isDeclaration) return `const __default = ${text.replace(/;\s*$/, '')}`
    return s.name ? text : text.replace(/^(async\s+)?(function\s*\*?|class)\s*/, (m) => `${m.trimEnd()} __default `)
  }
  return source.slice(s.start, s.end)
}

function needsSemicolon(s: Statement, text: string): boolean {
  if (text.trimEnd().endsWith(';')) return false
  if (s.kind === 'default') return !s.isDeclaration
  return !(s.kind === 'declaration' && /^(async\s+)?(function|class)\b/.test(text))
}

export function emitModule(result: ShakeResult, record: ModuleRecord): EmittedLine[] {
  const { source, statements } = record.parsed
  const live = result.live.get(record.id) ?? new Set<number>()
  const used = result.usedExports.get(record.id) ?? new Set<string>()
  const lines: EmittedLine[] = [
    { text: `__modules[${JSON.stringify(record.id)}] = function (exports, __require) {`, origin: null },
  ]
  const getters: string[] = []
  const requires: string[] = []
  let reexportCounter = 0
  for (const s of statements) {
    if (s.kind === 'declaration' && s.exported)
      s.names.filter((n) => used.has(n)).forEach((n) => getters.push(`${key(n)}: () => ${n}`))
    else if (s.kind === 'default' && used.has('default')) getters.push(`default: () => ${s.name ?? '__default'}`)
    else if (s.kind === 'export-names')
      s.specifiers
        .filter((x) => used.has(x.exported))
        .forEach((x) => getters.push(`${key(x.exported)}: () => ${x.local}`))
    else if (s.kind === 'export-from') {
      const target = record.deps.get(s.source) as string
      if (!result.included.has(target)) continue
      const wanted = s.specifiers.filter((x) => used.has(x.exported))
      if (s.star) {
        requires.push(`__exportStar(exports, __require(${JSON.stringify(target)}));`)
        continue
      }
      if (wanted.length === 0 && !(s.namespace && used.has(s.namespace))) continue
      const local = `__re${++reexportCounter}`
      requires.push(`const ${local} = __require(${JSON.stringify(target)});`)
      if (s.namespace) getters.push(`${key(s.namespace)}: () => ${local}`)
      wanted.forEach((x) => getters.push(`${key(x.exported)}: () => ${local}[${JSON.stringify(x.local)}]`))
    }
  }
  if (getters.length > 0) lines.push({ text: `__export(exports, { ${getters.join(', ')} });`, origin: null })
  statements.forEach((s, i) => {
    if (s.kind !== 'import' || !live.has(i)) return
    const target = JSON.stringify(record.deps.get(s.source))
    const line = lineAt(source, s.start)
    const namespace = s.specifiers.find((x) => x.imported === '*')
    const named = s.specifiers.filter((x) => x.imported !== '*')
    if (namespace)
      lines.push({ text: `const ${namespace.local} = __require(${target});`, origin: { module: record.id, line } })
    if (named.length > 0) {
      const pattern = named.map((x) => (x.imported === x.local ? x.local : `${key(x.imported)}: ${x.local}`)).join(', ')
      lines.push({ text: `const { ${pattern} } = __require(${target});`, origin: { module: record.id, line } })
    }
    if (!namespace && named.length === 0)
      lines.push({ text: `__require(${target});`, origin: { module: record.id, line } })
  })
  for (const text of requires) lines.push({ text, origin: null })
  statements.forEach((s, i) => {
    if (!live.has(i) || s.kind === 'import' || s.kind === 'export-names' || s.kind === 'export-from') return
    const text = bodyText(source, s)
    const first = lineAt(source, s.kind === 'declaration' || s.kind === 'default' ? s.bodyStart : s.start)
    const parts = (needsSemicolon(s, text) ? `${text};` : text).split('\n')
    parts.forEach((part, k) => lines.push({ text: part, origin: { module: record.id, line: first + k } }))
  })
  lines.push({ text: '};', origin: null })
  return lines
}

export type Format = 'iife' | 'cjs' | 'esm'

/** Tüm paketi satır satır kurar; biçime göre giriş/çıkış sarmalarını ekler. */
export function emitBundle(graph: ModuleGraph, result: ShakeResult, format: Format, name?: string): EmittedLine[] {
  const plain = (text: string): EmittedLine[] => text.split('\n').map((t) => ({ text: t, origin: null }))
  const head =
    format === 'iife' && name
      ? `var ${name} = (function () {`
      : format === 'cjs'
        ? 'module.exports = (function () {'
        : format === 'esm'
          ? 'const __entry = (function () {'
          : '(function () {'
  const lines: EmittedLine[] = [...plain(head), ...plain('"use strict";'), ...plain(RUNTIME)]
  for (const id of graph.order)
    if (result.included.has(id)) lines.push(...emitModule(result, graph.modules.get(id) as ModuleRecord))
  lines.push(...plain(`return __require(${JSON.stringify(graph.entry)});`), ...plain('})();'))
  if (format === 'esm') {
    for (const exported of result.usedExports.get(graph.entry) ?? []) {
      if (exported === 'default') lines.push(...plain('export default __entry.default;'))
      else if (isIdentifier(exported)) lines.push(...plain(`export const ${exported} = __entry.${exported};`))
    }
  }
  return lines
}
