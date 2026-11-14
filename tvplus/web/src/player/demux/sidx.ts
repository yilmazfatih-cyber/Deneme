/**
 * ISO-BMFF `sidx` (Segment Index Box) ayrıştırıcı — MP4 akışlarının parça dizini.
 * Girdi: dosyanın 0. baytından başlayan başlık (init + sidx). Çıktı: her alt bölümün mutlak bayt aralığı ve zamanı.
 */
import type { SegmentIndex, SegmentRef } from './types'

export class DemuxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DemuxError'
  }
}

function u32(v: DataView, o: number): number {
  return v.getUint32(o)
}
function u64(v: DataView, o: number): number {
  return v.getUint32(o) * 0x1_0000_0000 + v.getUint32(o + 4)
}

export interface BoxRef {
  type: string
  offset: number
  size: number
  headerSize: number
}

/** Üst düzey kutuları sırayla gezer (eksik son kutu dahil edilmez). */
export function listBoxes(bytes: Uint8Array, from = 0, to = bytes.length): BoxRef[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: BoxRef[] = []
  let o = from
  while (o + 8 <= to) {
    let size = u32(v, o)
    const type = String.fromCharCode(bytes[o + 4]!, bytes[o + 5]!, bytes[o + 6]!, bytes[o + 7]!)
    let headerSize = 8
    if (size === 1) {
      if (o + 16 > to) break
      size = u64(v, o + 8)
      headerSize = 16
    } else if (size === 0) {
      size = to - o
    }
    if (size < headerSize) throw new DemuxError(`Bozuk kutu boyu: ${type} @${o}`)
    out.push({ type, offset: o, size, headerSize })
    o += size
  }
  return out
}

/**
 * `bytes` dosyanın `fileOffset` konumundan başlayan parçasıdır (genelde 0). sidx kutusunu bulur ve
 * başvuruları mutlak bayt aralıklarına çevirir: ilk bölüm = sidx kutusunun sonu + first_offset.
 */
export function parseSidx(bytes: Uint8Array, fileOffset = 0): SegmentIndex {
  const box = listBoxes(bytes).find((b) => b.type === 'sidx')
  if (!box) throw new DemuxError('sidx kutusu bulunamadı')
  if (box.offset + box.size > bytes.length) throw new DemuxError('sidx kutusu eksik indirildi')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let o = box.offset + box.headerSize
  const version = bytes[o]!
  o += 4 // sürüm + bayraklar
  o += 4 // reference_ID
  const timescale = u32(v, o)
  o += 4
  if (!timescale) throw new DemuxError('sidx timescale sıfır')
  let ept: number
  let firstOffset: number
  if (version === 0) {
    ept = u32(v, o)
    firstOffset = u32(v, o + 4)
    o += 8
  } else {
    ept = u64(v, o)
    firstOffset = u64(v, o + 8)
    o += 16
  }
  o += 2 // ayrılmış
  const count = v.getUint16(o)
  o += 2
  const segments: SegmentRef[] = []
  let byte = fileOffset + box.offset + box.size + firstOffset
  let time = ept
  for (let i = 0; i < count; i++) {
    const word = u32(v, o)
    const refType = word >>> 31
    const size = word & 0x7fff_ffff
    const dur = u32(v, o + 4)
    o += 12 // + SAP alanı
    if (refType === 1) throw new DemuxError('Hiyerarşik sidx desteklenmiyor')
    segments.push({ start: byte, end: byte + size - 1, startTime: time / timescale, endTime: (time + dur) / timescale })
    byte += size
    time += dur
  }
  const last = segments[segments.length - 1]
  return { segments, durationSec: last ? last.endTime : 0 }
}
