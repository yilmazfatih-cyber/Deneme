/**
 * `node:fs` karşılığı: bellek içi dosya sistemi. İçerik paketi `/content` altına, kalıcı durum (`dataDir`) `/data`
 * altına yerleşir; `/data` altındaki her değişiklik `onChange` ile bildirilir ve IndexedDB'ye yazılır
 * (bkz. static-host/worker/persist.ts). Dosyalar parça listesi olarak tutulur: sık `appendFile` ucuzdur.
 */
import { EventEmitter } from './events'
import { dirname, resolve } from './path'
import { Buffer } from './buffer'

type Encoding = 'utf8' | 'utf-8' | 'hex' | 'base64' | 'base64url' | 'latin1' | 'binary' | 'ascii'

interface FileNode {
  kind: 'file'
  chunks: Uint8Array[]
  size: number
  mtimeMs: number
  birthtimeMs: number
  mode: number
}
interface DirNode {
  kind: 'dir'
  children: Map<string, FsNode>
  mtimeMs: number
  birthtimeMs: number
}
type FsNode = FileNode | DirNode

export type ChangeKind = 'write' | 'delete'
type ChangeListener = (path: string, kind: ChangeKind) => void

const root: DirNode = { kind: 'dir', children: new Map(), mtimeMs: Date.now(), birthtimeMs: Date.now() }
const listeners = new Set<ChangeListener>()
const encoder = new TextEncoder()

/** Bir yol değiştiğinde (yazım/silme) çağrılır. Kalıcılık katmanı kullanır. */
export function onChange(fn: ChangeListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const notify = (path: string, kind: ChangeKind): void => {
  for (const fn of listeners) fn(path, kind)
}

/* ───────────── hatalar ───────────── */

const ERRNO: Record<string, [number, string]> = {
  ENOENT: [-2, 'no such file or directory'],
  EEXIST: [-17, 'file already exists'],
  ENOTDIR: [-20, 'not a directory'],
  EISDIR: [-21, 'illegal operation on a directory'],
  ENOTEMPTY: [-39, 'directory not empty'],
  EBADF: [-9, 'bad file descriptor'],
  EINVAL: [-22, 'invalid argument'],
}

export interface FsError extends Error {
  code: string
  errno: number
  syscall: string
  path: string
}

function fsError(code: keyof typeof ERRNO | string, syscall: string, path: string): FsError {
  const [errno, text] = ERRNO[code] ?? [-1, 'error']
  const e = new Error(`${code}: ${text}, ${syscall} '${path}'`) as FsError
  e.code = code
  e.errno = errno
  e.syscall = syscall
  e.path = path
  return e
}

/* ───────────── düğüm erişimi ───────────── */

export type PathLike = string | URL | Uint8Array

export function toPath(p: PathLike): string {
  if (typeof p === 'string') return resolve(p)
  if (p instanceof URL) return resolve(decodeURIComponent(p.pathname))
  return resolve(new TextDecoder().decode(p))
}

const partsOf = (abs: string): string[] => abs.split('/').filter(Boolean)

function lookup(abs: string): FsNode | null {
  let node: FsNode = root
  for (const part of partsOf(abs)) {
    if (node.kind !== 'dir') return null
    const next = node.children.get(part)
    if (!next) return null
    node = next
  }
  return node
}

function parentDir(abs: string, syscall: string): { dir: DirNode; name: string } {
  const name = abs.slice(abs.lastIndexOf('/') + 1)
  const parent = lookup(dirname(abs))
  if (!parent) throw fsError('ENOENT', syscall, abs)
  if (parent.kind !== 'dir') throw fsError('ENOTDIR', syscall, abs)
  return { dir: parent, name }
}

function fileContent(node: FileNode): Uint8Array {
  if (node.chunks.length === 1) return node.chunks[0]!
  const all = new Uint8Array(node.size)
  let off = 0
  for (const c of node.chunks) {
    all.set(c, off)
    off += c.length
  }
  node.chunks = [all]
  return all
}

function toBytes(data: unknown, enc?: string): Uint8Array {
  if (typeof data === 'string') {
    if (!enc || enc === 'utf8' || enc === 'utf-8') return encoder.encode(data)
    return Buffer.from(data, enc as Encoding)
  }
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return encoder.encode(String(data))
}

function decode(bytes: Uint8Array, enc: string | null | undefined): string | Buffer {
  if (!enc || enc === 'buffer') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (enc === 'utf8' || enc === 'utf-8') return new TextDecoder().decode(bytes)
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(enc as Encoding)
}

type EncOpt = string | null | undefined | { encoding?: string | null; flag?: string; mode?: number }
const encodingOf = (o: EncOpt): string | null | undefined => (typeof o === 'object' && o !== null ? o.encoding : o)

/* ───────────── Stats ───────────── */

export class Stats {
  size: number
  mtimeMs: number
  birthtimeMs: number
  atimeMs: number
  ctimeMs: number
  mode: number
  #dir: boolean
  constructor(node: FsNode) {
    this.#dir = node.kind === 'dir'
    this.size = node.kind === 'file' ? node.size : 4096
    this.mtimeMs = node.mtimeMs
    this.atimeMs = node.mtimeMs
    this.ctimeMs = node.mtimeMs
    this.birthtimeMs = node.birthtimeMs
    this.mode = node.kind === 'file' ? 0o100000 | node.mode : 0o040755
  }
  get mtime(): Date {
    return new Date(this.mtimeMs)
  }
  get atime(): Date {
    return new Date(this.atimeMs)
  }
  get ctime(): Date {
    return new Date(this.ctimeMs)
  }
  get birthtime(): Date {
    return new Date(this.birthtimeMs)
  }
  isFile(): boolean {
    return !this.#dir
  }
  isDirectory(): boolean {
    return this.#dir
  }
  isSymbolicLink(): boolean {
    return false
  }
}

export class Dirent {
  name: string
  parentPath: string
  path: string
  #dir: boolean
  constructor(name: string, parent: string, dir: boolean) {
    this.name = name
    this.parentPath = parent
    this.path = parent
    this.#dir = dir
  }
  isFile(): boolean {
    return !this.#dir
  }
  isDirectory(): boolean {
    return this.#dir
  }
  isSymbolicLink(): boolean {
    return false
  }
}

/* ───────────── eşzamanlı API ───────────── */

export function existsSync(p: PathLike): boolean {
  try {
    return lookup(toPath(p)) !== null
  } catch {
    return false
  }
}

export function statSync(p: PathLike, opts?: { throwIfNoEntry?: boolean }): Stats {
  const abs = toPath(p)
  const node = lookup(abs)
  if (!node) {
    if (opts?.throwIfNoEntry === false) return undefined as unknown as Stats
    throw fsError('ENOENT', 'stat', abs)
  }
  return new Stats(node)
}
export const lstatSync = statSync

export function accessSync(p: PathLike): void {
  const abs = toPath(p)
  if (!lookup(abs)) throw fsError('ENOENT', 'access', abs)
}

export function readFileSync(p: PathLike | number, opts?: EncOpt): string | Buffer {
  if (typeof p === 'number') {
    const h = handles.get(p)
    if (!h) throw fsError('EBADF', 'read', String(p))
    p = h.path
  }
  const abs = toPath(p)
  const node = lookup(abs)
  if (!node) throw fsError('ENOENT', 'open', abs)
  if (node.kind === 'dir') throw fsError('EISDIR', 'read', abs)
  return decode(fileContent(node), encodingOf(opts))
}

/** Dosyayı (gerekirse) oluşturup içeriğini değiştirir; değişikliği bildirir. */
function putFile(abs: string, bytes: Uint8Array, append: boolean, syscall: string, mode?: number): void {
  const { dir, name } = parentDir(abs, syscall)
  const existing = dir.children.get(name)
  if (existing?.kind === 'dir') throw fsError('EISDIR', syscall, abs)
  const now = Date.now()
  // Çağıranın tamponu sonradan değişebilir: kopya saklanır.
  const copy = bytes.slice()
  if (existing && append) {
    if (copy.length) {
      existing.chunks.push(copy)
      existing.size += copy.length
    }
    existing.mtimeMs = now
  } else if (existing) {
    existing.chunks = [copy]
    existing.size = copy.length
    existing.mtimeMs = now
  } else {
    dir.children.set(name, {
      kind: 'file',
      chunks: [copy],
      size: copy.length,
      mtimeMs: now,
      birthtimeMs: now,
      mode: mode ?? 0o644,
    })
    dir.mtimeMs = now
  }
  notify(abs, 'write')
}

export function writeFileSync(p: PathLike | number, data: unknown, opts?: EncOpt): void {
  if (typeof p === 'number') {
    const h = handles.get(p)
    if (!h) throw fsError('EBADF', 'write', String(p))
    p = h.path
  }
  const abs = toPath(p)
  const o = typeof opts === 'object' && opts !== null ? opts : undefined
  if (o?.flag?.includes('x') && lookup(abs)) throw fsError('EEXIST', 'open', abs)
  putFile(abs, toBytes(data, encodingOf(opts) ?? undefined), Boolean(o?.flag?.startsWith('a')), 'open', o?.mode)
}

export function appendFileSync(p: PathLike, data: unknown, opts?: EncOpt): void {
  putFile(toPath(p), toBytes(data, encodingOf(opts) ?? undefined), true, 'open')
}

export function mkdirSync(p: PathLike, opts?: { recursive?: boolean; mode?: number } | number): string | undefined {
  const abs = toPath(p)
  const recursive = typeof opts === 'object' && opts?.recursive === true
  let node: DirNode = root
  let created: string | undefined
  const parts = partsOf(abs)
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    const next = node.children.get(part)
    const here = `/${parts.slice(0, i + 1).join('/')}`
    if (next) {
      if (next.kind !== 'dir') throw fsError('ENOTDIR', 'mkdir', here)
      if (i === parts.length - 1 && !recursive) throw fsError('EEXIST', 'mkdir', abs)
      node = next
      continue
    }
    if (!recursive && i < parts.length - 1) throw fsError('ENOENT', 'mkdir', abs)
    const now = Date.now()
    const dir: DirNode = { kind: 'dir', children: new Map(), mtimeMs: now, birthtimeMs: now }
    node.children.set(part, dir)
    created ??= here
    node = dir
  }
  return recursive ? created : undefined
}

export function readdirSync(p: PathLike, opts?: EncOpt | { withFileTypes?: boolean }): string[] | Dirent[] {
  const abs = toPath(p)
  const node = lookup(abs)
  if (!node) throw fsError('ENOENT', 'scandir', abs)
  if (node.kind !== 'dir') throw fsError('ENOTDIR', 'scandir', abs)
  const names = [...node.children.keys()].sort()
  if (typeof opts === 'object' && opts !== null && 'withFileTypes' in opts && opts.withFileTypes)
    return names.map((n) => new Dirent(n, abs, node.children.get(n)!.kind === 'dir'))
  return names
}

/** Bir düğümün altındaki tüm dosya yollarını verir (silme/taşıma bildirimleri için). */
function filesUnder(abs: string, node: FsNode, out: string[] = []): string[] {
  if (node.kind === 'file') out.push(abs)
  else for (const [n, c] of node.children) filesUnder(abs === '/' ? `/${n}` : `${abs}/${n}`, c, out)
  return out
}

export function renameSync(from: PathLike, to: PathLike): void {
  const a = toPath(from)
  const b = toPath(to)
  if (a === b) return
  const src = parentDir(a, 'rename')
  const node = src.dir.children.get(src.name)
  if (!node) throw fsError('ENOENT', 'rename', a)
  const dst = parentDir(b, 'rename')
  const target = dst.dir.children.get(dst.name)
  if (target?.kind === 'dir' && node.kind !== 'dir') throw fsError('EISDIR', 'rename', b)
  if (target?.kind === 'dir' && target.children.size) throw fsError('ENOTEMPTY', 'rename', b)
  const gone = filesUnder(a, node)
  const replaced = target ? filesUnder(b, target) : []
  src.dir.children.delete(src.name)
  dst.dir.children.set(dst.name, node)
  node.mtimeMs = Date.now()
  for (const f of replaced) notify(f, 'delete')
  for (const f of gone) notify(f, 'delete')
  for (const f of filesUnder(b, node)) notify(f, 'write')
}

export function unlinkSync(p: PathLike): void {
  const abs = toPath(p)
  const { dir, name } = parentDir(abs, 'unlink')
  const node = dir.children.get(name)
  if (!node) throw fsError('ENOENT', 'unlink', abs)
  if (node.kind === 'dir') throw fsError('EISDIR', 'unlink', abs)
  dir.children.delete(name)
  notify(abs, 'delete')
}

export function rmSync(p: PathLike, opts?: { recursive?: boolean; force?: boolean }): void {
  const abs = toPath(p)
  const node = lookup(abs)
  if (!node) {
    if (opts?.force) return
    throw fsError('ENOENT', 'rm', abs)
  }
  if (node.kind === 'dir' && !opts?.recursive) throw fsError('EISDIR', 'rm', abs)
  if (abs === '/') throw fsError('EINVAL', 'rm', abs)
  const { dir, name } = parentDir(abs, 'rm')
  const gone = filesUnder(abs, node)
  dir.children.delete(name)
  for (const f of gone) notify(f, 'delete')
}

export function rmdirSync(p: PathLike, opts?: { recursive?: boolean }): void {
  const abs = toPath(p)
  const node = lookup(abs)
  if (!node) throw fsError('ENOENT', 'rmdir', abs)
  if (node.kind !== 'dir') throw fsError('ENOTDIR', 'rmdir', abs)
  if (node.children.size && !opts?.recursive) throw fsError('ENOTEMPTY', 'rmdir', abs)
  rmSync(abs, { recursive: true })
}

export function copyFileSync(from: PathLike, to: PathLike): void {
  writeFileSync(to, readFileSync(from))
}

export function realpathSync(p: PathLike): string {
  const abs = toPath(p)
  if (!lookup(abs)) throw fsError('ENOENT', 'realpath', abs)
  return abs
}

/* ───────────── dosya tanıtıcıları ───────────── */

interface Handle {
  path: string
  flags: string
  pos: number
}
const handles = new Map<number, Handle>()
let nextFd = 10

export function openSync(p: PathLike, flags: string = 'r'): number {
  const abs = toPath(p)
  const node = lookup(abs)
  if (flags.startsWith('r') && !node) throw fsError('ENOENT', 'open', abs)
  if (node?.kind === 'dir' && !flags.startsWith('r')) throw fsError('EISDIR', 'open', abs)
  if (flags.includes('x') && node) throw fsError('EEXIST', 'open', abs)
  if (flags.startsWith('w')) putFile(abs, new Uint8Array(0), false, 'open')
  else if (flags.startsWith('a') && !node) putFile(abs, new Uint8Array(0), false, 'open')
  const fd = nextFd++
  handles.set(fd, { path: abs, flags, pos: 0 })
  return fd
}

export function closeSync(fd: number): void {
  if (!handles.delete(fd)) throw fsError('EBADF', 'close', String(fd))
}

export function readSync(
  fd: number,
  buf: Uint8Array,
  offset: number = 0,
  length: number = buf.length - offset,
  position: number | null = null,
): number {
  const h = handles.get(fd)
  if (!h) throw fsError('EBADF', 'read', String(fd))
  const node = lookup(h.path)
  if (!node || node.kind !== 'file') throw fsError('ENOENT', 'read', h.path)
  const data = fileContent(node)
  const pos = position ?? h.pos
  const n = Math.max(0, Math.min(length, data.length - pos))
  buf.set(data.subarray(pos, pos + n), offset)
  if (position === null) h.pos += n
  return n
}

export function writeSync(fd: number, data: unknown, ...rest: unknown[]): number {
  const h = handles.get(fd)
  if (!h) throw fsError('EBADF', 'write', String(fd))
  const bytes = toBytes(data, typeof rest[1] === 'string' ? rest[1] : undefined)
  // Yalnız ekleme ve baştan yazma desteklenir (sunucu kodu başka biçim kullanmıyor).
  putFile(h.path, bytes, true, 'write')
  h.pos += bytes.length
  return bytes.length
}

export function fstatSync(fd: number): Stats {
  const h = handles.get(fd)
  if (!h) throw fsError('EBADF', 'fstat', String(fd))
  return statSync(h.path)
}

/* ───────────── akışlar ───────────── */

interface ReadStreamOpts {
  start?: number
  end?: number
  encoding?: string
  highWaterMark?: number
}

/** Dosyayı parçalar hâlinde okuyan, `for await` ile tüketilebilen akış. */
export class ReadStream extends EventEmitter {
  path: string
  #opts: ReadStreamOpts
  constructor(path: string, opts: ReadStreamOpts) {
    super()
    this.path = path
    this.#opts = opts
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<string | Buffer> {
    const node = lookup(this.path)
    if (!node) throw fsError('ENOENT', 'open', this.path)
    if (node.kind !== 'file') throw fsError('EISDIR', 'read', this.path)
    const data = fileContent(node)
    const start = this.#opts.start ?? 0
    const end = Math.min(data.length - 1, this.#opts.end ?? data.length - 1)
    const step = this.#opts.highWaterMark ?? 64 * 1024
    const dec = this.#opts.encoding ? new TextDecoder() : null
    for (let pos = start; pos <= end; pos += step) {
      const slice = data.subarray(pos, Math.min(end + 1, pos + step))
      if (dec) yield dec.decode(slice, { stream: pos + step <= end })
      else yield Buffer.from(slice)
    }
  }
  destroy(): this {
    return this
  }
}

export function createReadStream(p: PathLike, opts?: ReadStreamOpts | string): ReadStream {
  return new ReadStream(toPath(p), typeof opts === 'string' ? { encoding: opts } : (opts ?? {}))
}

/* ───────────── geri çağırmalı API (az kullanılır) ───────────── */

type Cb<T> = (err: Error | null, value?: T) => void
const wrapCb =
  <A extends unknown[], T>(fn: (...args: A) => T) =>
  (...args: [...A, Cb<T>]): void => {
    const cb = args.pop() as Cb<T>
    try {
      const v = fn(...(args as unknown as A))
      queueMicrotask(() => cb(null, v))
    } catch (err) {
      queueMicrotask(() => cb(err as Error))
    }
  }

export const readFile = wrapCb(readFileSync)
export const writeFile = wrapCb(writeFileSync)
export const stat = wrapCb(statSync)
export const unlink = wrapCb(unlinkSync)
export const mkdir = wrapCb(mkdirSync)

/* ───────────── iç durum (kalıcılık katmanı için) ───────────── */

/** Bildirim üretmeden dosya yerleştirir (açılışta IndexedDB'den ve içerik paketinden yükleme). */
export function seedFile(path: string, bytes: Uint8Array, mtimeMs?: number): void {
  const abs = resolve(path)
  mkdirSync(dirname(abs), { recursive: true })
  const { dir, name } = parentDir(abs, 'open')
  const t = mtimeMs ?? Date.now()
  dir.children.set(name, { kind: 'file', chunks: [bytes], size: bytes.length, mtimeMs: t, birthtimeMs: t, mode: 0o644 })
}

/** Dosyanın güncel içeriği ve değişim zamanı; yoksa null. */
export function snapshotFile(path: string): { bytes: Uint8Array; mtimeMs: number } | null {
  const node = lookup(resolve(path))
  if (!node || node.kind !== 'file') return null
  return { bytes: fileContent(node), mtimeMs: node.mtimeMs }
}

export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, O_RDONLY: 0 }

export default {
  existsSync,
  statSync,
  lstatSync,
  accessSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
  rmSync,
  rmdirSync,
  copyFileSync,
  realpathSync,
  openSync,
  closeSync,
  readSync,
  writeSync,
  fstatSync,
  createReadStream,
  readFile,
  writeFile,
  stat,
  unlink,
  mkdir,
  Stats,
  Dirent,
  constants,
}
