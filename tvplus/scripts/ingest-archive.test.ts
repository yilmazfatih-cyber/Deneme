import { describe, expect, it } from 'vitest'
import { zTitle } from '../shared/content-schema'
import {
  archiveSkeleton,
  fetchArchiveMetadata,
  licenseName,
  parseLength,
  pickBestMp4,
  type ArchiveMetadata,
} from './ingest-archive'

const META: ArchiveMetadata = {
  metadata: {
    identifier: 'nosferatu-ornek',
    title: 'Nosferatu',
    year: '1922',
    creator: 'F. W. Murnau',
    description: '<p>Kont Orlok&#39;un hikâyesi: <b>sessiz sinemanın</b> korku klasiği, Almanya 1922.</p>',
    licenseurl: 'http://creativecommons.org/publicdomain/mark/1.0/',
  },
  files: [
    { name: 'Nosferatu.avi', source: 'original', format: 'AVI', size: '900000000' },
    {
      name: 'Nosferatu_512kb.mp4',
      source: 'derivative',
      format: '512Kb MPEG4',
      size: '200000000',
      length: '5640.2',
      height: '240',
    },
    {
      name: 'Nosferatu.ia.mp4',
      source: 'derivative',
      format: 'h.264 IA',
      size: '400000000',
      length: '5640.2',
      height: '480',
    },
    {
      name: 'Nosferatu.mp4',
      source: 'derivative',
      format: 'h.264',
      size: '600000000',
      length: '01:34:00',
      height: '720',
    },
    {
      name: 'Nosferatu 4K.mp4',
      source: 'derivative',
      format: 'h.264',
      size: '3000000000',
      length: '5640',
      height: '2160',
    },
    { name: 'Nosferatu.ogv', source: 'derivative', format: 'Ogg Video', size: '300000000' },
    { name: 'poster.jpg', source: 'original', format: 'JPEG', size: '500000', width: '1000', height: '1500' },
    { name: '__ia_thumb.jpg', source: 'original', format: 'Item Tile', size: '7000' },
  ],
}

describe('ingest-archive', () => {
  it('süre ayrıştırma', () => {
    expect(parseLength('5640.2')).toBe(5640)
    expect(parseLength('01:34:00')).toBe(5640)
    expect(parseLength('12:30')).toBe(750)
    expect(parseLength(undefined)).toBeNull()
    expect(parseLength('bilinmiyor')).toBeNull()
  })

  it('en iyi H.264 MP4: h.264 > h.264 IA > 512kb; 1080 üstü (4K) geri planda', () => {
    expect(pickBestMp4(META.files ?? [])?.name).toBe('Nosferatu.mp4')
    expect(pickBestMp4((META.files ?? []).filter((f) => f.name !== 'Nosferatu.mp4'))?.name).toBe('Nosferatu 4K.mp4')
    expect(
      pickBestMp4((META.files ?? []).filter((f) => !/\.mp4$/.test(f.name) || f.format === '512Kb MPEG4'))?.name,
    ).toBe('Nosferatu_512kb.mp4')
    expect(pickBestMp4([{ name: 'a.ogv', format: 'Ogg Video' }])).toBeNull()
    // Yalnızca özgün MPEG4 varsa o seçilir
    expect(pickBestMp4([{ name: 'film.mp4', source: 'original', format: 'MPEG4', size: '1' }])?.name).toBe('film.mp4')
  })

  it('lisans adı', () => {
    expect(licenseName('http://creativecommons.org/publicdomain/mark/1.0/', '')).toBe('Kamu malı')
    expect(licenseName('https://creativecommons.org/licenses/by-sa/4.0/', '')).toBe('CC BY-SA 4.0')
    expect(licenseName('', 'This film is in the Public Domain')).toBe('Kamu malı')
  })

  it('iskelet şemaya uyar ve PROGRESSIVE kaynak taşır', () => {
    const sk = archiveSkeleton('nosferatu-ornek', META, { videoId: 80020009, today: '2026-11-13' })
    expect(sk).toMatchObject({
      videoId: 80020009,
      slug: 'nosferatu',
      year: 1922,
      runtimeSec: 5640,
      directors: ['F. W. Murnau'],
      sources: [
        {
          type: 'PROGRESSIVE',
          url: 'https://archive.org/download/nosferatu-ornek/Nosferatu.mp4',
          sizeBytes: 600000000,
          mimeType: 'video/mp4',
        },
      ],
      artwork: { boxart: 'https://archive.org/download/nosferatu-ornek/poster.jpg', storyArt: null },
      license: { name: 'Kamu malı', url: 'http://creativecommons.org/publicdomain/mark/1.0/' },
    })
    expect(String((sk as { synopsis: string }).synopsis)).toBe(
      "Kont Orlok'un hikâyesi: sessiz sinemanın korku klasiği, Almanya 1922.",
    )
    const parsed = zTitle.safeParse(sk)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
  })

  it('MP4 yoksa anlaşılır hata', () => {
    expect(() => archiveSkeleton('x', { metadata: {}, files: [] }, { videoId: 1, today: '2026-11-13' })).toThrow(/MP4/)
  })

  it('üst veri okuma: olmayan öğe ve HTTP hatası', async () => {
    await expect(
      fetchArchiveMetadata('yok', async () => ({ status: 200, contentType: 'application/json', text: '{}' })),
    ).rejects.toThrow(/bulunamadı/)
    await expect(fetchArchiveMetadata('x', async () => ({ status: 503, contentType: null, text: '' }))).rejects.toThrow(
      /503/,
    )
    const m = await fetchArchiveMetadata('x', async (url) => {
      expect(url).toBe('https://archive.org/metadata/x')
      return { status: 200, contentType: 'application/json', text: JSON.stringify(META) }
    })
    expect(m.files).toHaveLength(8)
  })
})
