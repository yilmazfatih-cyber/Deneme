import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inspectOutput, packageTitle } from '../../scripts/package-title'
import { EBML_IDS, ebmlChildren, mp4TopLevelBoxes, parseSidx } from '../src/services/playback/sources/containers'
import { loadPackaged, packagedDir, type PackagedIndex } from '../src/services/playback/sources/packaged'
import { generateClip } from './playback-fakes'

let work: string
let mediaDir: string
let index: PackagedIndex

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'tvplus-paket-'))
  mediaDir = join(work, 'media')
  const clip = await generateClip(work)
  index = await packageTitle({
    input: clip,
    id: 'deneme-klip',
    mediaDir,
    ladder: [90, 144],
    bitrates: { 90: 60, 144: 110 },
    codecs: ['vp9', 'h264'],
    lang: 'tr',
    speed: 'fast',
  })
}, 60_000)
afterAll(() => rmSync(work, { recursive: true, force: true }))

const fileOf = (name: string) => readFileSync(join(packagedDir(mediaDir, 'deneme-klip'), name))

describe('paketleyici (npm run package:title)', () => {
  it('index.json: VP9 + Opus + H.264 + AAC akışları, süre ve GOP', () => {
    expect(index.id).toBe('deneme-klip')
    expect(index.gopSec).toBe(2)
    expect(index.durationSec).toBeCloseTo(6, 1)
    const byProfile = (p: string) => index.streams.filter((s) => s.profile === p)
    expect(byProfile('vp9-webm').map((s) => s.height)).toEqual([90, 144])
    expect(byProfile('h264-mp4').map((s) => s.height)).toEqual([90, 144])
    expect(byProfile('opus-webm')).toHaveLength(1)
    expect(byProfile('aac-mp4')).toHaveLength(1)
    for (const s of index.streams) {
      expect(s.segments).toBeGreaterThanOrEqual(3) // 6 sn / 2 sn GOP
      expect(s.bitrateKbps).toBeGreaterThan(0)
      expect(s.init.start).toBe(0)
      expect(s.init.end).toBeLessThan(s.index.start)
      expect(s.index.end).toBeLessThan(s.sizeBytes)
    }
    const h264 = byProfile('h264-mp4')[0]!
    expect(h264.codecs).toMatch(/^avc1\.[0-9a-f]{6}$/)
    expect(byProfile('opus-webm')[0]!.language).toBe('tr')
    // sunucu tarafı okuyucu aynı dosyayı kabul eder
    expect(loadPackaged(mediaDir, 'deneme-klip')?.index.streams).toHaveLength(6)
  })

  it('WebM aralıkları gerçek: başlatma = EBML…Tracks, dizin = Cues, Cue konumları kümelere denk gelir', () => {
    for (const s of index.streams.filter((x) => x.mimeType.endsWith('webm'))) {
      const buf = fileOf(s.file)
      expect(buf.length).toBe(s.sizeBytes)
      expect(buf.readUInt32BE(0)).toBe(EBML_IDS.EBML)
      // dizin aralığı tam olarak bir Cues öğesi
      const [cues] = ebmlChildren(buf, s.index.start, s.index.end + 1)
      expect(cues?.id).toBe(EBML_IDS.Cues)
      expect(cues?.end).toBe(s.index.end)
      // başlatma bölümünün son öğesi Tracks
      const top = ebmlChildren(buf, 0, buf.length)
      const seg = top[1]!
      const kids = ebmlChildren(buf, seg.dataStart, buf.length)
      const tracks = kids.find((k) => k.id === EBML_IDS.Tracks)!
      expect(tracks.end).toBe(s.init.end)
      // her Cue bir Cluster başını gösterir; kümeler dizinden sonra gelir
      const layout = inspectOutput(join(packagedDir(mediaDir, 'deneme-klip'), s.file), 'webm')
      expect(layout.segments).toBe(s.segments)
      const cluster = kids.find((k) => k.id === EBML_IDS.Cluster)!
      expect(cluster.start).toBeGreaterThan(s.index.end)
    }
  })

  it('MP4 aralıkları gerçek: başlatma = ftyp+moov, dizin = sidx, her parça moof ile başlar', () => {
    for (const s of index.streams.filter((x) => x.mimeType.endsWith('mp4'))) {
      const buf = fileOf(s.file)
      const boxes = mp4TopLevelBoxes(buf)
      expect(boxes[0]!.type).toBe('ftyp')
      const moov = boxes.find((b) => b.type === 'moov')!
      expect(moov.end).toBe(s.init.end)
      expect(buf.toString('latin1', s.index.start + 4, s.index.start + 8)).toBe('sidx')
      const sidxBox = boxes.find((b) => b.type === 'sidx')!
      expect([sidxBox.start, sidxBox.end]).toEqual([s.index.start, s.index.end])
      const sidx = parseSidx(buf, sidxBox)
      expect(sidx.references).toHaveLength(s.segments)
      for (const r of sidx.references) expect(buf.toString('latin1', r.range.start + 4, r.range.start + 8)).toBe('moof')
      expect(sidx.references[sidx.references.length - 1]!.range.end).toBe(buf.length - 1)
      expect(sidx.durationSec).toBeCloseTo(6, 0)
    }
  })

  it('hatalı kimlik reddedilir', async () => {
    await expect(packageTitle({ input: 'x', id: 'Büyük Harf', mediaDir })).rejects.toThrow()
  })
})
