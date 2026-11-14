/**
 * `node:zlib` karşılığı: yalnız `createGunzip` (Mixpanel dışa aktarımı .gz yüklemesi). Tarayıcının
 * DecompressionStream'i kullanılır.
 */
import { Buffer } from './buffer'
import { Transform } from './stream'

class Gunzip extends Transform {
  #writer: WritableStreamDefaultWriter<BufferSource>

  constructor() {
    super()
    const ds = new DecompressionStream('gzip')
    this.#writer = ds.writable.getWriter()
    const reader = ds.readable.getReader()
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          this.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength))
        }
        this.push(null)
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error(String(err)))
      }
    })()
  }

  override write(chunk: unknown): boolean {
    const bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk))
    this.#writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {
      /* hata okuma tarafında bildirilir */
    })
    return true
  }

  override end(chunk?: unknown): void {
    if (chunk !== undefined && chunk !== null) this.write(chunk)
    this.#writer.close().catch(() => {
      /* hata okuma tarafında bildirilir */
    })
  }
}

export function createGunzip(): Gunzip {
  return new Gunzip()
}

export function gunzipSync(): never {
  throw new Error('gunzipSync tarayıcı kipinde desteklenmiyor')
}

export const constants = {}
export default { createGunzip, gunzipSync, constants }
