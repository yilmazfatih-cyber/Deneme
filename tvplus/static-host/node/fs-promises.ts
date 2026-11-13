/**
 * `node:fs/promises` karşılığı: bellek içi dosya sisteminin eşzamanlı işlemlerini söz (Promise) olarak sunar.
 */
import {
  accessSync,
  appendFileSync,
  closeSync,
  copyFileSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
  type PathLike,
  type Stats,
} from './fs'

const later = <T>(fn: () => T): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    try {
      resolve(fn())
    } catch (err) {
      reject(err as Error)
    }
  })

type Opt = Parameters<typeof readFileSync>[1]

export const readFile = (p: PathLike, opts?: Opt) => later(() => readFileSync(p, opts))
export const writeFile = (p: PathLike, data: unknown, opts?: Parameters<typeof writeFileSync>[2]) =>
  later(() => writeFileSync(p, data, opts))
export const appendFile = (p: PathLike, data: unknown, opts?: Parameters<typeof appendFileSync>[2]) =>
  later(() => appendFileSync(p, data, opts))
export const mkdir = (p: PathLike, opts?: Parameters<typeof mkdirSync>[1]) => later(() => mkdirSync(p, opts))
export const readdir = (p: PathLike, opts?: Parameters<typeof readdirSync>[1]) => later(() => readdirSync(p, opts))
export const rename = (a: PathLike, b: PathLike) => later(() => renameSync(a, b))
export const rm = (p: PathLike, opts?: Parameters<typeof rmSync>[1]) => later(() => rmSync(p, opts))
export const unlink = (p: PathLike) => later(() => unlinkSync(p))
export const stat = (p: PathLike): Promise<Stats> => later(() => statSync(p))
export const lstat = stat
export const access = (p: PathLike) => later(() => accessSync(p))
export const copyFile = (a: PathLike, b: PathLike) => later(() => copyFileSync(a, b))

export class FileHandle {
  fd: number
  constructor(fd: number) {
    this.fd = fd
  }
  read(
    buf: Uint8Array,
    offset?: number,
    length?: number,
    position?: number | null,
  ): Promise<{ bytesRead: number; buffer: Uint8Array }> {
    return later(() => ({ bytesRead: readSync(this.fd, buf, offset, length, position ?? null), buffer: buf }))
  }
  write(data: unknown): Promise<{ bytesWritten: number }> {
    return later(() => ({ bytesWritten: writeSync(this.fd, data) }))
  }
  readFile(opts?: Opt) {
    return later(() => readFileSync(this.fd, opts))
  }
  stat(): Promise<Stats> {
    return later(() => fstatSync(this.fd))
  }
  close(): Promise<void> {
    return later(() => closeSync(this.fd))
  }
  sync(): Promise<void> {
    return Promise.resolve()
  }
}

export const open = (p: PathLike, flags?: string) => later(() => new FileHandle(openSync(p, flags)))

export default {
  readFile,
  writeFile,
  appendFile,
  mkdir,
  readdir,
  rename,
  rm,
  unlink,
  stat,
  lstat,
  access,
  copyFile,
  open,
}
