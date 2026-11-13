/**
 * `node:path` karşılığı (yalnız POSIX). Bellek içi dosya sisteminin çalışma klasörü her zaman `/`'dir.
 */

export const sep = '/'
export const delimiter = ':'

function normalizeParts(parts: string[], absolute: boolean): string[] {
  const out: string[] = []
  for (const p of parts) {
    if (!p || p === '.') continue
    if (p === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!absolute) out.push('..')
      continue
    }
    out.push(p)
  }
  return out
}

export function normalize(path: string): string {
  if (path === '') return '.'
  const absolute = path.startsWith('/')
  const trailing = path.endsWith('/')
  let body = normalizeParts(path.split('/'), absolute).join('/')
  if (!body && !absolute) body = '.'
  if (body && trailing) body += '/'
  return (absolute ? '/' : '') + body
}

export function join(...parts: string[]): string {
  const joined = parts.filter((p) => p !== '').join('/')
  return joined ? normalize(joined) : '.'
}

export function resolve(...parts: string[]): string {
  let path = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!
    if (!p) continue
    path = path ? `${p}/${path}` : p
    if (p.startsWith('/')) break
  }
  if (!path.startsWith('/')) path = `/${path}`
  const n = normalizeParts(path.split('/'), true).join('/')
  return `/${n}`
}

export const isAbsolute = (path: string): boolean => path.startsWith('/')

export function dirname(path: string): string {
  if (!path) return '.'
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path
  const i = trimmed.lastIndexOf('/')
  if (i < 0) return '.'
  if (i === 0) return '/'
  return trimmed.slice(0, i)
}

export function basename(path: string, ext?: string): string {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path
  let base = trimmed.slice(trimmed.lastIndexOf('/') + 1)
  if (ext && base.endsWith(ext) && base !== ext) base = base.slice(0, -ext.length)
  return base
}

export function extname(path: string): string {
  const base = basename(path)
  const i = base.lastIndexOf('.')
  return i <= 0 ? '' : base.slice(i)
}

export function relative(from: string, to: string): string {
  const a = resolve(from).split('/').filter(Boolean)
  const b = resolve(to).split('/').filter(Boolean)
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
}

export interface ParsedPath {
  root: string
  dir: string
  base: string
  ext: string
  name: string
}

export function parse(path: string): ParsedPath {
  const base = basename(path)
  const ext = extname(path)
  return {
    root: path.startsWith('/') ? '/' : '',
    dir: dirname(path),
    base,
    ext,
    name: ext ? base.slice(0, -ext.length) : base,
  }
}

export function format(p: Partial<ParsedPath>): string {
  const dir = p.dir ?? p.root ?? ''
  const base = p.base ?? `${p.name ?? ''}${p.ext ?? ''}`
  return dir ? (dir.endsWith('/') ? dir + base : `${dir}/${base}`) : base
}

export const toNamespacedPath = (path: string): string => path

const posixApi = {
  sep,
  delimiter,
  normalize,
  join,
  resolve,
  isAbsolute,
  dirname,
  basename,
  extname,
  relative,
  parse,
  format,
  toNamespacedPath,
}

export const posix = posixApi
export default posixApi
