/**
 * WebM (Matroska/EBML) parça dizini ayrıştırıcı: Segment veri başlangıcı, Info/TimecodeScale (+ Duration) ve
 * Cues → küme (Cluster) konumları. Girdi dosyanın 0. baytından başlayan başlık (init + Cues).
 * Bölüm i: [segmentData + pos_i, segmentData + pos_{i+1} − 1]; son bölüm dosyanın sonunda (sizeBytes − 1) biter.
 */
import { DemuxError } from './sidx'
import type { SegmentIndex, SegmentRef } from './types'

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueClusterPosition: 0xf1,
  Cluster: 0x1f43b675,
} as const

interface Vint {
  value: number
  length: number
  unknown: boolean
}

/** Öğe kimliği: işaret biti DAHİL okunur (0x1A45DFA3 gibi). */
export function readElementId(b: Uint8Array, o: number): Vint {
  const first = b[o]
  if (first === undefined) throw new DemuxError('EBML: veri bitti')
  let len = 1
  let mask = 0x80
  while (len <= 4 && !(first & mask)) {
    len++
    mask >>= 1
  }
  if (len > 4) throw new DemuxError(`EBML: geçersiz kimlik @${o}`)
  if (o + len > b.length) throw new DemuxError('EBML: veri bitti')
  let value = 0
  for (let i = 0; i < len; i++) value = value * 256 + b[o + i]!
  return { value, length: len, unknown: false }
}

/** Öğe boyu: işaret biti ATILIR; tüm bitler 1 ise "bilinmeyen boy". */
export function readElementSize(b: Uint8Array, o: number): Vint {
  const first = b[o]
  if (first === undefined) throw new DemuxError('EBML: veri bitti')
  let len = 1
  let mask = 0x80
  while (len <= 8 && !(first & mask)) {
    len++
    mask >>= 1
  }
  if (len > 8) throw new DemuxError(`EBML: geçersiz boy @${o}`)
  if (o + len > b.length) throw new DemuxError('EBML: veri bitti')
  let value = first & (mask - 1)
  let allOnes = value === mask - 1
  for (let i = 1; i < len; i++) {
    const byte = b[o + i]!
    value = value * 256 + byte
    if (byte !== 0xff) allOnes = false
  }
  return { value, length: len, unknown: allOnes }
}

function readUint(b: Uint8Array, o: number, size: number): number {
  let v = 0
  for (let i = 0; i < size; i++) v = v * 256 + b[o + i]!
  return v
}

function readFloat(b: Uint8Array, o: number, size: number): number {
  const v = new DataView(b.buffer, b.byteOffset + o, size)
  if (size === 4) return v.getFloat32(0)
  if (size === 8) return v.getFloat64(0)
  return 0
}

interface Element {
  id: number
  dataStart: number
  size: number
  unknown: boolean
}

function readElement(b: Uint8Array, o: number): Element {
  const id = readElementId(b, o)
  const size = readElementSize(b, o + id.length)
  return { id: id.value, dataStart: o + id.length + size.length, size: size.value, unknown: size.unknown }
}

function* children(b: Uint8Array, start: number, end: number): Generator<Element> {
  let o = start
  while (o < end && o < b.length) {
    const e = readElement(b, o)
    yield e
    if (e.unknown) return
    o = e.dataStart + e.size
  }
}

export interface WebmIndex extends SegmentIndex {
  /** Segment öğesinin veri başlangıcı (Cues konumları buna görelidir) */
  segmentDataOffset: number
  /** ns / tik */
  timecodeScale: number
}

export function parseWebmIndex(bytes: Uint8Array, sizeBytes: number): WebmIndex {
  let o = 0
  let segment: Element | null = null
  while (o < bytes.length) {
    const e = readElement(bytes, o)
    if (e.id === ID.Segment) {
      segment = e
      break
    }
    if (e.unknown) break
    o = e.dataStart + e.size
  }
  if (!segment) throw new DemuxError('WebM: Segment öğesi bulunamadı')
  const segStart = segment.dataStart
  const segEnd = segment.unknown ? bytes.length : Math.min(bytes.length, segStart + segment.size)

  let timecodeScale = 1_000_000
  let durationTicks: number | null = null
  const cues: { time: number; pos: number }[] = []
  let sawCues = false

  for (const el of children(bytes, segStart, segEnd)) {
    if (el.id === ID.Cluster) break
    const elEnd = el.dataStart + el.size
    if (el.id === ID.Info) {
      for (const c of children(bytes, el.dataStart, Math.min(elEnd, bytes.length))) {
        if (c.id === ID.TimecodeScale) timecodeScale = readUint(bytes, c.dataStart, c.size)
        else if (c.id === ID.Duration) durationTicks = readFloat(bytes, c.dataStart, c.size)
      }
    } else if (el.id === ID.Cues) {
      if (elEnd > bytes.length) throw new DemuxError('WebM: Cues öğesi eksik indirildi')
      sawCues = true
      for (const cp of children(bytes, el.dataStart, elEnd)) {
        if (cp.id !== ID.CuePoint) continue
        let time: number | null = null
        let pos: number | null = null
        for (const f of children(bytes, cp.dataStart, cp.dataStart + cp.size)) {
          if (f.id === ID.CueTime) time = readUint(bytes, f.dataStart, f.size)
          else if (f.id === ID.CueTrackPositions && pos === null) {
            for (const g of children(bytes, f.dataStart, f.dataStart + f.size)) {
              if (g.id === ID.CueClusterPosition) pos = readUint(bytes, g.dataStart, g.size)
            }
          }
        }
        if (time !== null && pos !== null) cues.push({ time, pos })
      }
      break
    }
    if (elEnd > bytes.length) break
  }
  if (!sawCues) throw new DemuxError('WebM: Cues öğesi bulunamadı')
  if (!cues.length) throw new DemuxError('WebM: Cues boş')

  // Aynı kümeyi gösteren yinelenen giriş noktalarını tekilleştir, konuma göre sırala
  cues.sort((a, b) => a.pos - b.pos)
  const uniq: { time: number; pos: number }[] = []
  for (const c of cues) if (!uniq.length || uniq[uniq.length - 1]!.pos !== c.pos) uniq.push(c)

  const toSec = (ticks: number) => (ticks * timecodeScale) / 1e9
  const durationSec = durationTicks !== null ? toSec(durationTicks) : null
  const segments: SegmentRef[] = uniq.map((c, i) => {
    const next = uniq[i + 1]
    const start = segStart + c.pos
    const end = next ? segStart + next.pos - 1 : sizeBytes - 1
    const startTime = toSec(c.time)
    let endTime: number
    if (next) endTime = toSec(next.time)
    else if (durationSec !== null && durationSec > startTime) endTime = durationSec
    else endTime = startTime + (i > 0 ? startTime - toSec(uniq[i - 1]!.time) : 5)
    return { start, end, startTime, endTime }
  })
  const last = segments[segments.length - 1]!
  return { segments, durationSec: durationSec ?? last.endTime, segmentDataOffset: segStart, timecodeScale }
}
