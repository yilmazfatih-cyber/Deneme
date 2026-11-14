/**
 * Kap (container) çözümleyicileri: fragmanlı MP4 (ftyp/moov/sidx) ve WebM (EBML: Info/Tracks/Cues).
 * Paketleyici kendi çıktısının bayt aralıklarını bunlarla doğrular; testler de aynı işlevleri kullanır.
 * Yalnızca dosyanın başı gerekir: aralıklar dosyanın önündeki dizinden (sidx / Cues) çıkarılır.
 */
import type { ByteRange } from '../../../../../shared/playback'

/* ───────────── MP4 (ISO BMFF) ───────────── */

export interface Mp4Box {
  type: string
  start: number
  /** dahil */
  end: number
  headerSize: number
}

/** Üst düzey kutuları sırayla okur; tampon kutunun ortasında biterse orada durur. */
export function mp4TopLevelBoxes(buf: Buffer, limit = Number.MAX_SAFE_INTEGER): Mp4Box[] {
  const boxes: Mp4Box[] = []
  let off = 0
  while (off + 8 <= buf.length && boxes.length < limit) {
    let size = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    let headerSize = 8
    if (size === 1) {
      if (off + 16 > buf.length) break
      size = Number(buf.readBigUInt64BE(off + 8))
      headerSize = 16
    } else if (size === 0) {
      size = buf.length - off
    }
    if (size < headerSize) break
    boxes.push({ type, start: off, end: off + size - 1, headerSize })
    off += size
  }
  return boxes
}

export interface SidxReference {
  /** dosya içi bayt aralığı */
  range: ByteRange
  durationSec: number
  startSec: number
}
export interface SidxInfo {
  timescale: number
  references: SidxReference[]
  durationSec: number
}

/** sidx kutusunu çözer (kutunun tamamı tamponda olmalı). */
export function parseSidx(buf: Buffer, box: Mp4Box): SidxInfo {
  let p = box.start + box.headerSize
  const version = buf.readUInt8(p)
  p += 4 // version + flags
  p += 4 // reference_ID
  const timescale = buf.readUInt32BE(p)
  p += 4
  let earliest: number
  let firstOffset: number
  if (version === 0) {
    earliest = buf.readUInt32BE(p)
    firstOffset = buf.readUInt32BE(p + 4)
    p += 8
  } else {
    earliest = Number(buf.readBigUInt64BE(p))
    firstOffset = Number(buf.readBigUInt64BE(p + 8))
    p += 16
  }
  p += 2 // reserved
  const count = buf.readUInt16BE(p)
  p += 2
  let offset = box.end + 1 + firstOffset
  let t = earliest
  const references: SidxReference[] = []
  for (let i = 0; i < count; i++) {
    const sizeWord = buf.readUInt32BE(p)
    const duration = buf.readUInt32BE(p + 4)
    p += 12
    const size = sizeWord & 0x7fffffff
    references.push({
      range: { start: offset, end: offset + size - 1 },
      startSec: t / timescale,
      durationSec: duration / timescale,
    })
    offset += size
    t += duration
  }
  return { timescale, references, durationSec: (t - earliest) / timescale }
}

export interface Mp4Layout {
  init: ByteRange
  index: ByteRange
  sidx: SidxInfo
}

/** On-demand MP4 düzeni: ftyp + moov (başlatma) ardından sidx (dizin). Uymuyorsa hata fırlatır. */
export function mp4Layout(head: Buffer): Mp4Layout {
  const boxes = mp4TopLevelBoxes(head, 16)
  const moov = boxes.find((b) => b.type === 'moov')
  const sidx = boxes.find((b) => b.type === 'sidx')
  if (!boxes[0] || boxes[0].type !== 'ftyp') throw new Error('MP4: dosya ftyp ile başlamıyor')
  if (!moov) throw new Error('MP4: moov kutusu yok')
  if (!sidx) throw new Error('MP4: dosyanın başında sidx kutusu yok')
  if (sidx.start !== moov.end + 1) throw new Error('MP4: sidx, moov kutusunun hemen ardında değil')
  if (sidx.end >= head.length) throw new Error('MP4: sidx kutusu okunan bölümün dışında')
  const firstMoof = boxes.find((b) => b.type === 'moof')
  if (firstMoof && firstMoof.start < sidx.start) throw new Error('MP4: moof kutusu sidx kutusundan önce')
  return { init: { start: 0, end: moov.end }, index: { start: sidx.start, end: sidx.end }, sidx: parseSidx(head, sidx) }
}

/* ───────────── WebM (Matroska / EBML) ───────────── */

export const EBML_IDS = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueClusterPosition: 0xf1,
  Cluster: 0x1f43b675,
  Void: 0xec,
} as const

export interface EbmlElement {
  id: number
  /** öğenin ilk baytı */
  start: number
  /** veri başlangıcı */
  dataStart: number
  /** veri boyu; bilinmiyorsa (canlı yazım) null */
  size: number | null
  /** dahil; boyu bilinmiyorsa tampon sonu */
  end: number
}

function readVint(
  buf: Buffer,
  off: number,
  keepMarker: boolean,
): { value: number; length: number; allOnes: boolean } | null {
  if (off >= buf.length) return null
  const first = buf.readUInt8(off)
  let length = 1
  let mask = 0x80
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1
    length++
  }
  if (length > 8 || off + length > buf.length) return null
  let value = keepMarker ? first : first & (mask - 1)
  let allOnes = (first & (mask - 1)) === mask - 1
  for (let i = 1; i < length; i++) {
    const b = buf.readUInt8(off + i)
    value = value * 256 + b
    if (b !== 0xff) allOnes = false
  }
  return { value, length, allOnes }
}

/** [from, to) aralığındaki kardeş öğeleri okur. */
export function ebmlChildren(buf: Buffer, from: number, to: number): EbmlElement[] {
  const out: EbmlElement[] = []
  let off = from
  const limit = Math.min(to, buf.length)
  while (off < limit) {
    const id = readVint(buf, off, true)
    if (!id) break
    const size = readVint(buf, off + id.length, false)
    if (!size) break
    const dataStart = off + id.length + size.length
    const known = !size.allOnes
    const end = known ? dataStart + size.value - 1 : limit - 1
    out.push({ id: id.value, start: off, dataStart, size: known ? size.value : null, end })
    if (!known) break
    off = end + 1
  }
  return out
}

function readUint(buf: Buffer, el: EbmlElement): number {
  let v = 0
  for (let i = el.dataStart; i <= el.end; i++) v = v * 256 + buf.readUInt8(i)
  return v
}
function readFloat(buf: Buffer, el: EbmlElement): number {
  return el.size === 4 ? buf.readFloatBE(el.dataStart) : buf.readDoubleBE(el.dataStart)
}

export interface WebmCue {
  timeSec: number
  /** küme (Cluster) başlangıcı, dosya içi mutlak bayt */
  clusterOffset: number
}
export interface WebmLayout {
  init: ByteRange
  index: ByteRange
  durationSec: number | null
  cues: WebmCue[]
  firstClusterOffset: number | null
}

/** On-demand WebM düzeni: EBML + Segment(SeekHead, Info, Tracks) başlatma, ardından kümelerden önce Cues. */
export function webmLayout(head: Buffer): WebmLayout {
  const top = ebmlChildren(head, 0, head.length)
  const ebml = top[0]
  const segment = top[1]
  if (!ebml || ebml.id !== EBML_IDS.EBML) throw new Error('WebM: EBML başlığı yok')
  if (!segment || segment.id !== EBML_IDS.Segment) throw new Error('WebM: Segment öğesi yok')
  const children = ebmlChildren(
    head,
    segment.dataStart,
    segment.size === null ? head.length : segment.dataStart + segment.size,
  )
  const info = children.find((c) => c.id === EBML_IDS.Info)
  const tracks = children.find((c) => c.id === EBML_IDS.Tracks)
  const cues = children.find((c) => c.id === EBML_IDS.Cues)
  const firstCluster = children.find((c) => c.id === EBML_IDS.Cluster)
  if (!info || !tracks) throw new Error('WebM: Info/Tracks öğesi yok')
  if (!cues) throw new Error('WebM: Cues öğesi dosyanın başında değil')
  if (firstCluster && firstCluster.start < cues.start) throw new Error('WebM: Cues kümelerden sonra geliyor')
  if (cues.end >= head.length) throw new Error('WebM: Cues öğesi okunan bölümün dışında')

  let scale = 1_000_000
  let durationTicks: number | null = null
  for (const c of ebmlChildren(head, info.dataStart, info.end + 1)) {
    if (c.id === EBML_IDS.TimecodeScale) scale = readUint(head, c)
    if (c.id === EBML_IDS.Duration) durationTicks = readFloat(head, c)
  }
  const cueList: WebmCue[] = []
  for (const cp of ebmlChildren(head, cues.dataStart, cues.end + 1)) {
    if (cp.id !== EBML_IDS.CuePoint) continue
    let time = 0
    let pos: number | null = null
    for (const f of ebmlChildren(head, cp.dataStart, cp.end + 1)) {
      if (f.id === EBML_IDS.CueTime) time = readUint(head, f)
      if (f.id === EBML_IDS.CueTrackPositions && pos === null) {
        for (const g of ebmlChildren(head, f.dataStart, f.end + 1)) {
          if (g.id === EBML_IDS.CueClusterPosition) pos = readUint(head, g)
        }
      }
    }
    if (pos !== null) cueList.push({ timeSec: (time * scale) / 1e9, clusterOffset: segment.dataStart + pos })
  }
  return {
    init: { start: 0, end: tracks.end },
    index: { start: cues.start, end: cues.end },
    durationSec: durationTicks === null ? null : (durationTicks * scale) / 1e9,
    cues: cueList,
    firstClusterOffset: firstCluster ? firstCluster.start : null,
  }
}
