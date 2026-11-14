/**
 * `Buffer` karşılığı: `buffer` paketi (saf JS) + Node'un `base64url` kodlaması (paket bunu tanımıyor).
 */
import { Buffer as BaseBuffer } from 'buffer'

type Enc = string | undefined

const toStd = (s: string): string => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  return t + '='.repeat((4 - (t.length % 4)) % 4)
}
const toUrl = (s: string): string => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

interface LooseBufferStatic {
  from: (...args: unknown[]) => unknown
  byteLength: (...args: unknown[]) => number
  isEncoding: (enc: string) => boolean
  alloc: (...args: unknown[]) => unknown
}
interface LooseBufferProto {
  toString: (enc?: Enc, start?: number, end?: number) => string
  write: (...args: unknown[]) => number
}

const statics = BaseBuffer as unknown as LooseBufferStatic
const proto = BaseBuffer.prototype as unknown as LooseBufferProto

const patched = Symbol.for('tvplus.buffer.base64url')
const marks = BaseBuffer as unknown as Record<symbol, boolean>
if (!marks[patched]) {
  marks[patched] = true

  const from = statics.from
  statics.from = function (value: unknown, enc?: unknown, len?: unknown) {
    if (typeof value === 'string' && enc === 'base64url') return from.call(BaseBuffer, toStd(value), 'base64')
    return from.call(BaseBuffer, value, enc, len)
  }

  const byteLength = statics.byteLength
  statics.byteLength = function (value: unknown, enc?: unknown) {
    if (typeof value === 'string' && enc === 'base64url') return byteLength.call(BaseBuffer, toStd(value), 'base64')
    return byteLength.call(BaseBuffer, value, enc)
  }

  const isEncoding = statics.isEncoding
  statics.isEncoding = (enc: string) => enc === 'base64url' || isEncoding.call(BaseBuffer, enc)

  const alloc = statics.alloc
  statics.alloc = function (size: unknown, fill?: unknown, enc?: unknown) {
    if (typeof fill === 'string' && enc === 'base64url') return alloc.call(BaseBuffer, size, toStd(fill), 'base64')
    return alloc.call(BaseBuffer, size, fill, enc)
  }

  const toString = proto.toString
  proto.toString = function (this: unknown, enc?: Enc, start?: number, end?: number) {
    if (enc === 'base64url') return toUrl(toString.call(this, 'base64', start, end))
    return toString.call(this, enc, start, end)
  }

  const write = proto.write
  proto.write = function (this: unknown, ...args: unknown[]) {
    if (typeof args[0] === 'string') {
      const i = args.findIndex((a, k) => k > 0 && a === 'base64url')
      if (i > 0) {
        args[0] = toStd(args[0])
        args[i] = 'base64'
      }
    }
    return write.apply(this, args)
  }
}

export const Buffer = BaseBuffer
export const kMaxLength = 0x7fffffff
export const constants = { MAX_LENGTH: kMaxLength, MAX_STRING_LENGTH: 0x1fffffe8 }
export default { Buffer, kMaxLength, constants }
