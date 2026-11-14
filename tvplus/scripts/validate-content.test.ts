import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatReport, validateContent } from './validate-content'

type Obj = Record<string, unknown>

/** Küçük ama eksiksiz geçerli içerik ağacı. */
function goodTree(): Tree {
  const movie = (videoId: number, slug: string, extra: Obj = {}) => ({
    videoId,
    slug,
    type: 'MOVIE',
    title: `Film ${slug}`,
    year: 2008,
    synopsis: 'Uzunca bir özet metni, yirmi karakterden fazla.',
    shortSynopsis: 'Kısa özet.',
    genres: ['animasyon'],
    maturity: { rating: 'GENEL' },
    sources: [{ type: 'YOUTUBE', videoId: 'aqz-KE-bpKQ' }],
    license: { name: 'CC BY 3.0', attribution: '© Blender Foundation' },
    ...extra,
  })
  return {
    'titles/a.json': [
      movie(80010001, 'bir', {
        sources: [
          {
            type: 'PROGRESSIVE',
            url: 'https://archive.org/download/x/x.mp4',
            timedText: [{ lang: 'tr', label: 'Türkçe', format: 'vtt', file: 'bir.tr.vtt' }],
          },
        ],
      }),
      movie(80010002, 'iki', { kids: true, maturity: { rating: '7+' } }),
      movie(80010003, 'uc'),
    ],
    'titles/b.json': [
      {
        ...movie(80030001, 'dizi'),
        type: 'SHOW',
        sources: [],
        seasons: [
          {
            number: 1,
            episodes: [
              {
                videoId: 80030101,
                number: 1,
                title: 'B1',
                synopsis: 'Bölüm bir.',
                sources: [{ type: 'YOUTUBE', videoId: 'aqz-KE-bpKQ' }],
              },
              {
                videoId: 80030102,
                number: 2,
                title: 'B2',
                synopsis: 'Bölüm iki.',
                sources: [{ type: 'YOUTUBE', videoId: 'aqz-KE-bpKQ' }],
              },
            ],
          },
        ],
        supplementals: [
          {
            videoId: 81000001,
            title: 'Fragman',
            synopsis: 'Fragman.',
            sources: [{ type: 'YOUTUBE', videoId: 'aqz-KE-bpKQ' }],
          },
        ],
      },
    ],
    'channels.json': [
      {
        channelId: 1,
        slug: 'haber',
        name: 'Haber',
        number: 10,
        category: 'haber',
        description: 'x',
        source: { type: 'YOUTUBE_LIVE', channelId: 'UC' + 'a'.repeat(22) },
      },
      {
        channelId: 2,
        slug: 'sinema',
        name: 'Sinema',
        number: 11,
        category: 'film-dizi',
        description: 'x',
        source: { type: 'LINEAR', playlist: [80010001, 80030101] },
      },
    ],
    'epg.json': [
      {
        channelId: 1,
        programs: [{ start: '20:00', durationMin: 60, title: 'Ana Haber', kind: 'haber', videoId: 80010003 }],
      },
    ],
    'collections.json': [
      { collectionId: 9001, slug: 'secki', name: 'Seçki', description: 'x', videoIds: [80010001, 80010002] },
    ],
    'home-layout.json': {
      billboard: [80010001],
      rows: [
        { kind: 'collection', collectionId: 9001 },
        { kind: 'curated', id: 'c1', title: 'Seçtiklerimiz', videoIds: [80010001, 80010002, 80030001] },
        { kind: 'genre', genre: 'animasyon' },
      ],
    },
    'notifications.json': [{ id: 'n1', title: 'Yeni', body: 'Yeni film', videoId: 80010001, channelId: 1 }],
    'interstitials.json': [{ id: 'i1', location: 'HOME', title: 'Merhaba', body: 'x', cta: 'Tamam', href: '#/' }],
    'subtitles/bir.tr.vtt': 'WEBVTT\n',
  }
}

function writeTree(tree: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tvplus-content-'))
  for (const [rel, value] of Object.entries(tree)) {
    const file = join(dir, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  }
  return dir
}

type Tree = Record<string, unknown>
const DELETE = Symbol('sil')
/** Ağaçta nokta yollu düzenleme: edit(t, 'titles/a.json', '0.maturity.rating', '13+'); son anahtar '+' ise diziye ekler. */
function edit(t: Tree, file: string, path: string, value: unknown) {
  if (path === '') {
    if (value === DELETE) delete t[file]
    else t[file] = value
    return
  }
  const keys = path.split('.')
  const last = keys.pop() ?? ''
  let node: unknown = t[file]
  for (const k of keys) node = (node as Record<string, unknown>)[k]
  const target = node as Record<string, unknown> & unknown[]
  if (last === '+') target.push(value)
  else if (value === DELETE) delete target[last]
  else target[last] = value
}

/** Ağacı derin kopyalar, değiştirir, doğrular. */
function validateWith(mutate: (t: Tree) => void) {
  const tree = structuredClone(goodTree())
  mutate(tree)
  const dir = writeTree(tree)
  try {
    return validateContent(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const messages = (r: { errors: { message: string; file: string; path: string }[] }) =>
  r.errors.map((e) => `${e.file} ${e.path}: ${e.message}`)

describe('validateContent', () => {
  it('geçerli ağaç: hata ve uyarı yok, sayımlar doğru', () => {
    const r = validateWith(() => {})
    expect(messages(r)).toEqual([])
    expect(r.warnings).toEqual([])
    expect(r.stats).toMatchObject({
      titles: 4,
      movies: 3,
      shows: 1,
      episodes: 2,
      supplementals: 1,
      channels: 2,
      epgTemplates: 1,
      collections: 1,
      homeRows: 3,
    })
    expect(r.stats.bySourceKind).toEqual({ PROGRESSIVE: 1, YOUTUBE: 5, YOUTUBE_LIVE: 1, LINEAR: 1 })
    expect(formatReport(r, '/x')).toContain('Sonuç: geçerli')
  })

  it('boş klasör yalnızca uyarı', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tvplus-content-'))
    const r = validateContent(dir)
    expect(r.errors).toEqual([])
    expect(r.warnings).toHaveLength(1)
  })

  it('eksik isteğe bağlı dosyalar uyarıdır', () => {
    const r = validateWith((t) => {
      for (const f of ['collections.json', 'home-layout.json', 'notifications.json']) edit(t, f, '', DELETE)
    })
    expect(r.errors).toEqual([])
    expect(r.warnings.map((w) => w.file)).toEqual(
      expect.arrayContaining(['collections.json', 'home-layout.json', 'notifications.json']),
    )
  })

  it('şema hatası dosya ve yol ile', () => {
    const r = validateWith((t) => {
      edit(t, 'titles/a.json', '0.year', 1700)
    })
    expect(r.errors).toEqual([expect.objectContaining({ file: join('titles', 'a.json'), path: '[0].year' })])
  })

  it('bozuk JSON hatadır', () => {
    const r = validateWith((t) => {
      edit(t, 'epg.json', '', '{ bozuk')
    })
    expect(messages(r)[0]).toMatch(/epg\.json .*JSON okunamadı/)
  })

  const cases: [string, string, string, unknown, RegExp][] = [
    ['videoId başlıklar arasında yinelenmiş', 'titles/b.json', '0.videoId', 80010001, /videoId 80010001 yinelenmiş/],
    [
      'bölüm videoId başlıkla çakışıyor',
      'titles/b.json',
      '0.seasons.0.episodes.1.videoId',
      80010002,
      /videoId 80010002 yinelenmiş/,
    ],
    [
      'ek video videoId çakışıyor',
      'titles/b.json',
      '0.supplementals.0.videoId',
      80030101,
      /videoId 80030101 yinelenmiş/,
    ],
    ['slug yinelenmiş', 'titles/a.json', '1.slug', 'bir', /slug "bir" yinelenmiş/],
    [
      'koleksiyonda olmayan başlık',
      'collections.json',
      '0.videoIds.+',
      123,
      /collections\.json \[0\]\.videoIds\[2\]: videoId 123 katalogda yok/,
    ],
    ['koleksiyonda bölüm kimliği', 'collections.json', '0.videoIds.+', 80030101, /bir üst başlık değil/],
    [
      'vitrinde olmayan başlık',
      'home-layout.json',
      'billboard.0',
      999,
      /home-layout\.json billboard\[0\]: videoId 999/,
    ],
    ['satırda olmayan koleksiyon', 'home-layout.json', 'rows.0.collectionId', 9999, /Koleksiyon 9999/],
    [
      'seçki satırında olmayan başlık',
      'home-layout.json',
      'rows.1.videoIds.2',
      5,
      /rows\[1\]\.videoIds\[2\]: videoId 5/,
    ],
    ['akış videoId yok', 'epg.json', '0.programs.0.videoId', 42, /epg\.json \[0\]\.programs\[0\]\.videoId: videoId 42/],
    ['akış kanalı yok', 'epg.json', '0.channelId', 77, /Kanal 77 channels\.json'da yok/],
    [
      'LINEAR çalma listesi kırık',
      'channels.json',
      '1.source.playlist.1',
      4242,
      /playlist\[1\]: Çalma listesindeki videoId 4242/,
    ],
    ['bildirim videoId yok', 'notifications.json', '0.videoId', 1, /notifications\.json \[0\]\.videoId/],
    ['bildirim kanalı yok', 'notifications.json', '0.channelId', 99, /notifications\.json \[0\]\.channelId/],
    ['kanal kimliği yinelenmiş', 'channels.json', '1.channelId', 1, /Kanal kimliği 1 yinelenmiş/],
    ['kanal numarası yinelenmiş', 'channels.json', '1.number', 10, /Kanal numarası 10 yinelenmiş/],
    ['altyazı dosyası yok', 'subtitles/bir.tr.vtt', '', DELETE, /Altyazı dosyası yok: subtitles\/bir\.tr\.vtt/],
    ['çocuk başlığı 13+', 'titles/a.json', '1.maturity.rating', '13+', /Çocuk başlığı GENEL ya da 7\+ olmalı/],
    ['filmde kaynak yok', 'titles/a.json', '2.sources', [], /kaynak olmalı/],
    ['dizide sezon yok', 'titles/b.json', '0.seasons', [], /en az bir sezon/],
    ['bölümde kaynak yok', 'titles/b.json', '0.seasons.0.episodes.0.sources', [], /episodes\[0\]\.sources/],
  ]
  for (const [name, file, path, value, expected] of cases)
    it(`hata: ${name}`, () => {
      const r = validateWith((t) => edit(t, file, path, value))
      expect(
        messages(r).some((m) => expected.test(m)),
        messages(r).join('\n'),
      ).toBe(true)
      expect(formatReport(r, '/x')).toContain('BAŞARISIZ')
    })
})
