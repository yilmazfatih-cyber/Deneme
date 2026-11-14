/**
 * Kaynak görsel yükleme: uzak adres (vekil sunucu üzerinden, zaman aşımlı, asıl dosya diske önbelleklenir)
 * ya da web/public altındaki yerel dosya.
 */
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { EnvHttpProxyAgent } from 'undici'
import type { ArtworkTypeName } from '../../kernel/imageUrls'

export interface FetchedSource {
  status: number
  contentType: string | null
  body: Buffer
}
export type SourceFetcher = (url: string, timeoutMs: number) => Promise<FetchedSource>

export const SOURCE_TIMEOUT_MS = 6000
const MAX_SOURCE_BYTES = 20 * 1024 * 1024

let agent: EnvHttpProxyAgent | null = null

/** Varsayılan uzak okuyucu: undici + HTTPS_PROXY'ye uyan ajan (undici yalnız gerektiğinde yüklenir). */
export const defaultFetcher: SourceFetcher = async (url, timeoutMs) => {
  const undici = await import('undici')
  agent ??= new undici.EnvHttpProxyAgent()
  const res = await undici.fetch(url, {
    dispatcher: agent,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
      'user-agent': 'TVplus-ImageService/1.0',
    },
  })
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_SOURCE_BYTES) {
    await res.body?.cancel()
    throw new Error(`Kaynak görsel çok büyük: ${len} bayt`)
  }
  const body = Buffer.from(await res.arrayBuffer())
  if (body.length > MAX_SOURCE_BYTES) throw new Error(`Kaynak görsel çok büyük: ${body.length} bayt`)
  return { status: res.status, contentType: res.headers.get('content-type'), body }
}

/** Test ve araçlar için değiştirilebilir okuyucu (vi.spyOn(imageFetcher, 'fetch')). */
export const imageFetcher: { fetch: SourceFetcher } = { fetch: defaultFetcher }

export type RemoteOrigin = 'remote' | 'source-cache' | 'failed' | 'offline'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/** Uzak kaynakları okur; aynı adrese eşzamanlı istekleri birleştirir, başarısızlığı kısa süre hatırlar. */
export function createRemoteLoader(opts: { dataDir: string; offline: boolean; failureTtlMs?: number }) {
  const dir = join(opts.dataDir, 'img-src')
  const inflight = new Map<string, Promise<{ buf: Buffer | null; origin: RemoteOrigin }>>()
  const failures = new Map<string, number>()
  const failureTtl = opts.failureTtlMs ?? 5 * 60_000

  async function load(url: string): Promise<{ buf: Buffer | null; origin: RemoteOrigin }> {
    const file = join(dir, sha(url))
    try {
      return { buf: await readFile(file), origin: 'source-cache' }
    } catch {
      /* önbellekte yok */
    }
    if (opts.offline) return { buf: null, origin: 'offline' }
    if (!/^https?:\/\//i.test(url)) return { buf: null, origin: 'failed' }
    const failedAt = failures.get(url)
    if (failedAt !== undefined && Date.now() - failedAt < failureTtl) return { buf: null, origin: 'failed' }
    try {
      const res = await imageFetcher.fetch(url, SOURCE_TIMEOUT_MS)
      if (res.status !== 200 || res.body.length === 0) throw new Error(`HTTP ${res.status}`)
      if (res.contentType && !/^image\//i.test(res.contentType) && !/octet-stream/i.test(res.contentType))
        throw new Error(`Görsel değil: ${res.contentType}`)
      await mkdir(dir, { recursive: true })
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
      await writeFile(tmp, res.body)
      await rename(tmp, file)
      failures.delete(url)
      return { buf: res.body, origin: 'remote' }
    } catch {
      failures.set(url, Date.now())
      return { buf: null, origin: 'failed' }
    }
  }

  return {
    load(url: string) {
      const running = inflight.get(url)
      if (running) return running
      const p = load(url).finally(() => inflight.delete(url))
      inflight.set(url, p)
      return p
    },
  }
}

/**
 * Yerel dosya yolunu çözer: önce web/public'e göre, bulunamazsa kanal logosu için brand/channels/, avatar için brand/
 * altına bakılır. web/public dışına çıkan yol reddedilir.
 */
export function resolveLocalFile(
  publicDir: string,
  localFile: string,
  type: ArtworkTypeName,
): { path: string; mtimeMs: number } | null {
  const root = resolve(publicDir)
  const name = localFile.replace(/^\/+/, '')
  const candidates = [isAbsolute(localFile) ? resolve(localFile) : resolve(root, name)]
  if (type === 'CHANNEL_LOGO') candidates.push(resolve(root, 'brand', 'channels', name))
  if (type === 'AVATAR' || type === 'CHANNEL_LOGO') candidates.push(resolve(root, 'brand', name))
  for (const p of candidates) {
    const rel = relative(root, p)
    if (rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) continue
    if (!existsSync(p)) continue
    const st = statSync(p)
    if (st.isFile()) return { path: p, mtimeMs: st.mtimeMs }
  }
  return null
}
