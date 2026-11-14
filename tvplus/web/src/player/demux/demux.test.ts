import { describe, expect, it } from 'vitest'
import { DemuxError, listBoxes, parseSidx } from './sidx'
import { locateSegment } from './types'
import { parseWebmIndex, readElementId, readElementSize } from './webmCues'

/* ───────────── yardımcılar: sentetik baytlar ───────────── */

function bytes(...parts: (number[] | Uint8Array)[]): Uint8Array {
  const arr: number[] = []
  for (const p of parts) arr.push(...p)
  return new Uint8Array(arr)
}
function be32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
}
function be16(n: number): number[] {
  return [(n >>> 8) & 0xff, n & 0xff]
}
function box(type: string, body: Uint8Array): Uint8Array {
  return bytes(
    be32(8 + body.length),
    [...type].map((c) => c.charCodeAt(0)),
    body,
  )
}

function sidxBox(opts: {
  version: 0 | 1
  timescale: number
  ept: number
  firstOffset: number
  refs: [number, number][]
}): Uint8Array {
  const body: number[] = [opts.version, 0, 0, 0, ...be32(1), ...be32(opts.timescale)]
  if (opts.version === 0) body.push(...be32(opts.ept), ...be32(opts.firstOffset))
  else body.push(...be32(0), ...be32(opts.ept), ...be32(0), ...be32(opts.firstOffset))
  body.push(...be16(0), ...be16(opts.refs.length))
  for (const [size, dur] of opts.refs) body.push(...be32(size & 0x7fffffff), ...be32(dur), ...be32(0x90000000))
  return box('sidx', new Uint8Array(body))
}

/* EBML: kimlik baytları + boy (8 baytlık vint: 0x01 + 7 bayt) */
function ebmlSize(n: number, unknown = false): number[] {
  if (unknown) return [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
  if (n < 0x7f) return [0x80 | n]
  const out = [0x01]
  for (let i = 6; i >= 0; i--) out.push(Math.floor(n / 2 ** (8 * i)) & 0xff)
  return out
}
function el(id: number[], body: Uint8Array | number[], unknownSize = false): Uint8Array {
  const b = body instanceof Uint8Array ? body : new Uint8Array(body)
  return bytes(id, ebmlSize(b.length, unknownSize), b)
}
function uint(n: number, len: number): number[] {
  const out: number[] = []
  for (let i = len - 1; i >= 0; i--) out.push(Math.floor(n / 2 ** (8 * i)) & 0xff)
  return out
}
function f64(n: number): number[] {
  const dv = new DataView(new ArrayBuffer(8))
  dv.setFloat64(0, n)
  return [...new Uint8Array(dv.buffer)]
}

function webmHeader(
  cues: [number, number][],
  opts: { scale?: number; durationTicks?: number } = {},
): { data: Uint8Array; segData: number } {
  const ebmlHeader = el(
    [0x1a, 0x45, 0xdf, 0xa3],
    el(
      [0x42, 0x82],
      [...'webm'].map((c) => c.charCodeAt(0)),
    ),
  )
  const infoChildren: Uint8Array[] = []
  if (opts.scale !== undefined) infoChildren.push(el([0x2a, 0xd7, 0xb1], uint(opts.scale, 3)))
  if (opts.durationTicks !== undefined) infoChildren.push(el([0x44, 0x89], f64(opts.durationTicks)))
  const info = el([0x15, 0x49, 0xa9, 0x66], bytes(...infoChildren))
  const tracks = el([0x16, 0x54, 0xae, 0x6b], [0xae, 0x80])
  const cuePoints = cues.map(([time, pos]) =>
    el([0xbb], bytes(el([0xb3], uint(time, 4)), el([0xb7], bytes(el([0xf7], [1]), el([0xf1], uint(pos, 4)))))),
  )
  const cuesEl = el([0x1c, 0x53, 0xbb, 0x6b], bytes(...cuePoints))
  const clusterStart = [0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
  const segHeader = bytes([0x18, 0x53, 0x80, 0x67], ebmlSize(0, true))
  const data = bytes(ebmlHeader, segHeader, info, tracks, cuesEl, clusterStart)
  return { data, segData: ebmlHeader.length + segHeader.length }
}

/* ───────────── sidx ───────────── */

describe('sidx', () => {
  it('v0 kutusundan mutlak bayt aralıklarını ve zamanları çıkarır', () => {
    const ftyp = box('ftyp', new Uint8Array(16))
    const moov = box('moov', new Uint8Array(40))
    const sidx = sidxBox({
      version: 0,
      timescale: 1000,
      ept: 0,
      firstOffset: 0,
      refs: [
        [100, 2000],
        [200, 2000],
        [300, 1500],
      ],
    })
    const data = bytes(ftyp, moov, sidx)
    const ix = parseSidx(data)
    const anchor = ftyp.length + moov.length + sidx.length
    expect(ix.segments).toEqual([
      { start: anchor, end: anchor + 99, startTime: 0, endTime: 2 },
      { start: anchor + 100, end: anchor + 299, startTime: 2, endTime: 4 },
      { start: anchor + 300, end: anchor + 599, startTime: 4, endTime: 5.5 },
    ])
    expect(ix.durationSec).toBe(5.5)
  })

  it('v1 kutusu, first_offset ve earliest_presentation_time değerlerini uygular', () => {
    const sidx = sidxBox({ version: 1, timescale: 90000, ept: 90000, firstOffset: 10, refs: [[50, 180000]] })
    const ix = parseSidx(bytes(box('ftyp', new Uint8Array(4)), sidx))
    const anchor = 12 + sidx.length + 10
    expect(ix.segments[0]).toEqual({ start: anchor, end: anchor + 49, startTime: 1, endTime: 3 })
  })

  it('kutuları listeler; sidx yoksa ya da hiyerarşikse hata verir', () => {
    const data = bytes(box('ftyp', new Uint8Array(4)), box('moov', new Uint8Array(4)))
    expect(listBoxes(data).map((b) => b.type)).toEqual(['ftyp', 'moov'])
    expect(() => parseSidx(data)).toThrow(DemuxError)
    const hier = sidxBox({ version: 0, timescale: 1000, ept: 0, firstOffset: 0, refs: [[0x80000000 | 10, 1000]] })
    // reference_type = 1 bitini elle kur
    const h = new Uint8Array(hier)
    h[8 + 24] = h[8 + 24]! | 0x80
    expect(() => parseSidx(h)).toThrow(/Hiyerarşik/)
  })
})

/* ───────────── WebM Cues ───────────── */

describe('WebM Cues', () => {
  it('EBML vint okur (kimlikte işaret biti kalır, boyda atılır, hepsi 1 → bilinmeyen)', () => {
    expect(readElementId(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), 0)).toEqual({
      value: 0x1a45dfa3,
      length: 4,
      unknown: false,
    })
    expect(readElementSize(new Uint8Array([0x81]), 0)).toEqual({ value: 1, length: 1, unknown: false })
    expect(readElementSize(new Uint8Array([0x40, 0x02]), 0)).toEqual({ value: 2, length: 2, unknown: false })
    expect(readElementSize(new Uint8Array([0xff]), 0).unknown).toBe(true)
  })

  it('Segment veri başlangıcına göre küme konumlarını ve süreleri hesaplar', () => {
    const { data, segData } = webmHeader(
      [
        [0, 1000],
        [4000, 5000],
        [8000, 9000],
      ],
      { scale: 1_000_000, durationTicks: 10_000 },
    )
    const ix = parseWebmIndex(data, 20_000)
    expect(ix.segmentDataOffset).toBe(segData)
    expect(ix.segments).toEqual([
      { start: segData + 1000, end: segData + 4999, startTime: 0, endTime: 4 },
      { start: segData + 5000, end: segData + 8999, startTime: 4, endTime: 8 },
      { start: segData + 9000, end: 19_999, startTime: 8, endTime: 10 },
    ])
    expect(ix.durationSec).toBe(10)
  })

  it('TimecodeScale yoksa 1 ms varsayar, yinelenen kümeleri tekilleştirir', () => {
    const { data } = webmHeader([
      [0, 100],
      [0, 100],
      [2000, 700],
    ])
    const ix = parseWebmIndex(data, 1000)
    expect(ix.timecodeScale).toBe(1_000_000)
    expect(ix.segments.length).toBe(2)
    expect(ix.segments[1]!.endTime).toBe(4) // süre bilinmiyor → önceki bölüm uzunluğu
  })

  it('farklı zaman ölçeğini uygular', () => {
    const { data } = webmHeader(
      [
        [0, 10],
        [500, 20],
      ],
      { scale: 2_000_000 },
    )
    expect(parseWebmIndex(data, 100).segments[1]!.startTime).toBe(1)
  })

  it('Cues eksik indirildiyse hata verir', () => {
    const { data } = webmHeader([[0, 10]])
    expect(() => parseWebmIndex(data.slice(0, data.length - 20), 100)).toThrow(DemuxError)
  })
})

describe('locateSegment', () => {
  const segs = [
    { start: 0, end: 9, startTime: 0, endTime: 4 },
    { start: 10, end: 19, startTime: 4, endTime: 8 },
    { start: 20, end: 29, startTime: 8, endTime: 10 },
  ]
  it('zamanı içeren bölümü bulur', () => {
    expect(locateSegment(segs, 0)).toBe(0)
    expect(locateSegment(segs, 3.99)).toBe(0)
    expect(locateSegment(segs, 4)).toBe(1)
    expect(locateSegment(segs, 9.5)).toBe(2)
    expect(locateSegment(segs, 10)).toBe(-1)
    expect(locateSegment(segs, -1)).toBe(0)
  })
})

/* ───────────── gerçek başlıklar (isteğe bağlı) ─────────────
 * Sintel (shaka-demo-assets) başlıkları indirilmişse: TVP_REAL_HEADERS_DIR=<klasör> npx vitest run web/src/player
 *   v144.hdr  = v-0144p-0100k-vp9.webm  bayt 0-4055   (dosya 9104457 bayt)
 *   aopus.hdr = a-eng-0128k-libopus.webm bayt 0-4097  (dosya 14497193 bayt)
 *   v144mp4.hdr = v-0144p-0100k-libx264.mp4 bayt 0-3532 (dosya 11189127 bayt)
 */
// web tsconfig'i Node türlerini içermez; dosya sistemine dinamik içe aktarmayla erişilir
const REAL = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.TVP_REAL_HEADERS_DIR
async function readReal(name: string): Promise<Uint8Array> {
  const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as { readFileSync(p: string): Uint8Array }
  return new Uint8Array(fs.readFileSync(`${REAL}/${name}`))
}

describe.skipIf(!REAL)('gerçek Sintel başlıkları', () => {
  it('VP9 WebM: 222 bölüm, ilk bölüm dizinin hemen ardından başlar', async () => {
    const ix = parseWebmIndex(await readReal('v144.hdr'), 9104457)
    expect(ix.segments.length).toBe(222)
    expect(ix.segments[0]!.start).toBe(4056)
    expect(ix.segments.at(-1)!.end).toBe(9104456)
    expect(ix.durationSec).toBeCloseTo(888, 0)
  })
  it('Opus WebM: ilk bölüm 4098 baytında', async () => {
    const ix = parseWebmIndex(await readReal('aopus.hdr'), 14497193)
    expect(ix.segments[0]!.start).toBe(4098)
    expect(ix.segments.at(-1)!.end).toBe(14497192)
  })
  it('H.264 MP4 sidx: son bölüm dosya sonunda biter', async () => {
    const ix = parseSidx(await readReal('v144mp4.hdr'))
    expect(ix.segments[0]!.start).toBe(3533)
    expect(ix.segments.at(-1)!.end).toBe(11189126)
  })
})
