/**
 * Etiketleme: sözlük ve çapraz kurallar, uzlaşı ve uyum puanı, geçerli etiket zinciri (uzlaşı → örnek → model → boş),
 * künyeden model önerisi kuralları, REST uçları (doğrulama, iş akışı, CSRF) ve açılışta geçersiz içerikte durma.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Response as InjectResponse } from 'light-my-request'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HEADERS } from '../../shared/constants'
import { zTitle, type ContentTitle } from '../../shared/content-schema'
import type { TaggingQueueItem, TitleTagging } from '../../shared/intelligence'
import { zVocabulary, type TagSheet, type TagVocabulary } from '../../shared/tagging-schema'
import type { BootContext } from '../../shared/types'
import { consensus, jaccard, median } from '../src/services/tagging/consensus'
import { taggingCore } from '../src/services/tagging/plugin'
import { suggestSheet } from '../src/services/tagging/suggest'
import {
  checkSheetAgainstVocabulary,
  checkVocabulary,
  descriptorsOf,
  indexVocabulary,
  readTaggingContent,
} from '../src/services/tagging/vocabulary'
import { createTestApp } from './helpers'

const ROOT = join(__dirname, '..', '..')
const CONTENT = join(ROOT, 'content')
const rawVocabulary = (): unknown => JSON.parse(readFileSync(join(CONTENT, 'tagging', 'vocabulary.json'), 'utf8'))
const VOCAB: TagVocabulary = zVocabulary.parse(rawVocabulary())
const INDEX = indexVocabulary(VOCAB)

const SINTEL = 80010001
const TEARS = 80010002
const NO_SAMPLE = 80040001 // "Evrende İstediğimiz Yere…": örnek fişi yok → model önerisi

function title(over: Record<string, unknown>): ContentTitle {
  return zTitle.parse({
    videoId: 80099001,
    slug: 'deneme',
    type: 'MOVIE',
    title: 'Deneme',
    year: 2020,
    synopsis: 'Yirmi karakterden uzun bir deneme özeti.',
    shortSynopsis: 'Kısa.',
    genres: ['dram'],
    maturity: { rating: 'GENEL' },
    sources: [{ type: 'YOUTUBE', videoId: 'aqz-KE-bpKQ' }],
    license: { name: 'CC BY', attribution: 'x' },
    ...over,
  })
}

const sheet = (scales: Record<string, number | null>, facets: Record<string, string[]> = {}) => ({ scales, facets })

/* ───────────── sözlük ───────────── */

describe('sözlük', () => {
  it('depodaki sözlük şemaya ve çapraz kurallara uyar; kapsam beklenen genişlikte', () => {
    expect(checkVocabulary(VOCAB, 'vocabulary.json').filter((i) => i.level === 'error')).toEqual([])
    expect(VOCAB.version).toBe('2026.11-1')
    expect(VOCAB.scales.length).toBeGreaterThanOrEqual(15)
    expect(VOCAB.facets.length).toBeGreaterThanOrEqual(8)
    const groups = new Set(VOCAB.scales.map((s) => s.group))
    expect([...groups].sort()).toEqual(['ADVISORY', 'FORM', 'STORY', 'TONE'])
    // içerik uyarıları RTÜK'e bağlı ve "sonun netliği" var
    for (const s of VOCAB.scales.filter((x) => x.group === 'ADVISORY')) expect(s.advisory?.ratings).toHaveLength(6)
    expect(INDEX.scales.get('son-netligi')?.descriptors.map((d) => d.adjective)).toContain('Ucu Açık')
    // her yuva doldurulabilir; adda kullanılan her değerin hazır ifadesi var
    for (const f of VOCAB.facets) if (f.slot) expect(f.values.some((v) => v.phrase)).toBe(true)
    expect(Object.keys(VOCAB.naming.genreNouns)).toHaveLength(24)
  })

  it('çapraz kurallar: eksik tür adı, yinelenen anahtar, RTÜK bağı, çözülmeyen implied, eksik yuva sırası', () => {
    const v = structuredClone(VOCAB)
    delete v.naming.genreNouns['dram']
    v.scales[1]!.descriptors.push({ key: v.scales[0]!.descriptors[0]!.key, min: 4, max: 5, adjective: 'Başka' })
    delete v.scales[0]!.advisory
    v.naming.genreNouns['komedi']!.implied = ['ADJECTIVE:yok-boyle-bir-sey']
    v.naming.order = v.naming.order.filter((s) => s !== 'PERSON')
    v.naming.redundantPairs = [['FORMAT:bicim:sessiz', 'ADJECTIVE:yok']]
    const msgs = checkVocabulary(v, 'x')
      .filter((i) => i.level === 'error')
      .map((i) => `${i.path}: ${i.message}`)
    expect(msgs.join('\n')).toMatch(/"dram" türünün adı/)
    expect(msgs.join('\n')).toMatch(/Niteleyici anahtarı "erotik" yinelenmiş/)
    expect(msgs.join('\n')).toMatch(/cinsellik: içerik uyarısı ölçeğinde RTÜK bağı/)
    expect(msgs.join('\n')).toMatch(/ADJECTIVE:yok-boyle-bir-sey" çözülemedi/)
    expect(msgs.join('\n')).toMatch(/PERSON yuvası sırada yok/)
    expect(msgs.join('\n')).toMatch(/naming\.redundantPairs\[0\]\[1\]: "ADJECTIVE:yok" çözülemedi/)
  })

  it('fiş denetimi: bilinmeyen ölçek/yüz/değer ve max aşımı anahtarı adıyla bildirilir', () => {
    const problems = checkSheetAgainstVocabulary(INDEX, {
      scales: { romantizm: 3, uydurma: 2 },
      facets: {
        mekan: ['uzay', 'mars'],
        bilinmeyen: ['x'],
        'ek-sifatlar': ['kult', 'odullu', 'absurt', 'nostaljik', 'gercekci'],
      },
    })
    const text = problems.map((p) => `${p.path} ${p.message}`).join('\n')
    expect(text).toMatch(/scales\.uydurma Bilinmeyen ölçek: "uydurma"/)
    expect(text).toMatch(/facets\.mekan\[1\] "mekan" yüzünde "mars" değeri yok/)
    expect(text).toMatch(/facets\.bilinmeyen Bilinmeyen yüz/)
    expect(text).toMatch(/"ek-sifatlar" yüzünde en çok 4 değer/)
  })

  it('örnek fişler depodan okunur ve kurallara uyar (12 başlık, başlık başına tek fiş)', () => {
    const r = readTaggingContent(CONTENT)
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([])
    if (!('vocabulary' in r)) throw new Error('sözlük okunamadı')
    expect(r.sheets).toHaveLength(12)
    expect(new Set(r.sheets.map((s) => s.sheet.titleId)).size).toBe(12)
    expect(r.sheets.every((s) => s.sheet.source === 'SAMPLE' && !s.sheet.watched)).toBe(true)
    expect(r.sheets.map((s) => s.sheet.titleId)).toEqual(expect.arrayContaining([SINTEL, TEARS]))
  })
})

/* ───────────── uzlaşı ───────────── */

describe('uzlaşı ve uyum', () => {
  it('ortanca: tek sayıda ortadaki, çift sayıda ortadaki ikisinin ortalaması aşağı yuvarlanır', () => {
    expect(median([3])).toBe(3)
    expect(median([5, 1, 3])).toBe(3)
    expect(median([2, 4])).toBe(3)
    expect(median([2, 3])).toBe(2)
    expect(median([0, 1, 4, 5])).toBe(2)
  })

  it('jaccard: kesişim / birleşim; iki boş küme 1', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3)
    expect(jaccard([], [])).toBe(1)
  })

  it('ölçekte ortanca, yüzde çoğunluk; uyum ölçek ve yüz kalemlerinin ortalaması', () => {
    const c = consensus(INDEX, [
      sheet({ romantizm: 4, mizah: 1, tempo: null }, { mekan: ['uzay'], konu: ['aile', 'savas'] }),
      sheet({ romantizm: 2, mizah: 1, tempo: 3 }, { mekan: ['uzay'], konu: ['aile'] }),
      sheet({ romantizm: 3, mizah: 1 }, { mekan: ['uzay', 'deniz'], konu: ['savas'] }),
    ])
    expect(c.scales).toEqual({ romantizm: 3, mizah: 1, tempo: 3 })
    expect(c.facets).toEqual({ mekan: ['uzay'], konu: ['aile', 'savas'] })
    // romantizm: çift farkları 2,1,1 → ort. 4/3 → 1 − (4/3)/5 ; mizah: 1 ; tempo tek fiş → sayılmaz
    // mekan: J({u},{u})=1, J({u},{u,d})=.5, J({u},{u,d})=.5 → 2/3 ; konu: J({a,s},{a})=.5, J({a,s},{s})=.5, J({a},{s})=0 → 1/3
    const expected = (1 - 4 / 3 / 5 + 1 + 2 / 3 + 1 / 3) / 4
    expect(c.agreement).toBeCloseTo(expected, 3)
  })

  it('tek fişte uyum null; tam uyuşan fişlerde 1; max aşan çoğunluk en çok seçilene göre kırpılır', () => {
    expect(consensus(INDEX, [sheet({ mizah: 2 })]).agreement).toBeNull()
    expect(
      consensus(INDEX, [sheet({ mizah: 2 }, { mekan: ['uzay'] }), sheet({ mizah: 2 }, { mekan: ['uzay'] })]).agreement,
    ).toBe(1)
    const s = (v: string[]) => sheet({}, { mekan: v })
    const c = consensus(INDEX, [s(['uzay', 'deniz']), s(['uzay', 'deniz']), s(['uzay', 'okul']), s(['okul', 'deniz'])])
    // max 2: uzay 3, deniz 3, okul 2 (yarıdan fazla değil) → uzay ve deniz
    expect(c.facets['mekan']).toEqual(['deniz', 'uzay'])
  })

  it('niteleyiciler ölçek aralığından türer', () => {
    expect(descriptorsOf(INDEX, { romantizm: 4, tempo: 1, 'son-netligi': 0, mizah: 2 })).toEqual([
      'romantik',
      'esprili',
      'agir-tempolu',
      'ucu-acik',
    ])
    expect(descriptorsOf(INDEX, { romantizm: 3 })).toEqual([])
  })
})

/* ───────────── model önerisi ───────────── */

describe('künyeden model önerisi', () => {
  it('GENEL işaretinde tüm uyarı ölçekleri 0; ton kuralları ruh hâli ve türden', () => {
    const s = suggestSheet(
      INDEX,
      title({ genres: ['komedi', 'romantik'], moods: ['duygusal', 'sakin', 'dusundurucu'] }),
      '2026-11-13',
    )
    for (const k of ['cinsellik', 'siddet', 'kan', 'korku', 'argo', 'madde-kullanimi']) expect(s.scales[k]).toBe(0)
    expect(s.scales).toMatchObject({ mizah: 4, romantizm: 4, duygusallik: 4, tempo: 1, karmasiklik: 4 })
    expect(s.scales['son-netligi']).toBeNull()
    expect(s).toMatchObject({ source: 'MODEL', tagger: null, watched: false, status: 'DRAFT' })
  })

  it('RTÜK gerekçesi: işareti gerektiren en düşük seviye; dayanağı olmayan kardeş ölçek bir aşağı', () => {
    const s = suggestSheet(
      INDEX,
      title({ genres: ['macera', 'animasyon'], maturity: { rating: '13+', reasons: ['siddet-korku'] } }),
      '2026-11-13',
    )
    // şiddet: macera dayanağı → 13+'ın en düşük seviyesi 3; kan ve korku dayanaksız → 2
    expect(s.scales).toMatchObject({ siddet: 3, kan: 2, korku: 2 })
    // gerekçesi yazılmamış uyarılar değerlendirilmez
    expect(s.scales['cinsellik']).toBeNull()
    expect(s.scales['argo']).toBeNull()
  })

  it('yüzler: süre, çocuk işareti, anahtar kelimeler (Türkçe harf duyarsız, tam sözcük)', () => {
    const s = suggestSheet(
      INDEX,
      title({
        kids: true,
        runtimeSec: 1200,
        genres: ['doga-bilim'],
        moods: ['sozsuz', 'kult-klasik'],
        keywords: ['Ay üssü', 'NASA', 'Kara Delik', 'yemek kültürü'],
      }),
      '2026-11-13',
    )
    expect(s.facets['bicim']).toEqual(['kisa-film'])
    expect(s.facets['yas-grubu']).toEqual(['cocuk'])
    expect(s.facets['konu']).toEqual(['uzay-kesfi', 'astronomi', 'yemek'])
    expect(s.facets['ek-sifatlar']).toEqual(['kult', 'diyalogsuz'])
    expect(s.scales['ogreticilik']).toBe(4)
    // aynı künye → aynı öneri
    expect(suggestSheet(INDEX, title({}), 'x').scales).toEqual(suggestSheet(INDEX, title({}), 'y').scales)
  })

  it('sessiz filmde "sözsüz" ara yazı demektir: diyalogsuz sayılmaz', () => {
    const silent = suggestSheet(INDEX, title({ genres: ['komedi', 'sessiz-sinema'], moods: ['sozsuz'] }), 'x')
    expect(silent.facets['ek-sifatlar']).toBeUndefined()
    expect(silent.facets['bicim']).toEqual(['sessiz'])
  })

  it('uzun metraj, belgesel dizi ve sözlükte olmayan anahtar sessizce atlanır', () => {
    expect(suggestSheet(INDEX, title({ runtimeSec: 5400 }), 'x').facets['bicim']).toEqual(['uzun-metraj'])
    const v = structuredClone(VOCAB)
    v.scales = v.scales.filter((s) => s.key !== 'mizah')
    const s = suggestSheet(indexVocabulary(v), title({ genres: ['komedi'] }), 'x')
    expect('mizah' in s.scales).toBe(false)
  })
})

/* ───────────── servis + REST ───────────── */

describe('etiketleme servisi ve uçlar', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(async () => {
    await app.close()
  })

  const put = (titleId: number, tagger: string, payload: unknown) =>
    app.inject({
      method: 'PUT',
      url: `/api/studio/tagging/titles/${titleId}/sheets/${tagger}`,
      payload: payload as object,
    })
  const approve = (titleId: number, tagger: string) =>
    app.inject({ method: 'POST', url: `/api/studio/tagging/titles/${titleId}/sheets/${tagger}/approve` })
  const get = async (titleId: number) => {
    const r = await app.inject({ method: 'GET', url: `/api/studio/tagging/titles/${titleId}` })
    expect(r.statusCode).toBe(200)
    return r.json<TitleTagging>()
  }
  const err = (r: InjectResponse) => r.json<{ error: { code: string; message: string } }>().error

  it('GET vocabulary sözlüğün kendisini döndürür', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/studio/tagging/vocabulary' })
    expect(r.statusCode).toBe(200)
    expect(r.json<TagVocabulary>().version).toBe(VOCAB.version)
    expect(app.services.tagging.vocabulary().scales).toHaveLength(VOCAB.scales.length)
  })

  it('geçerli etiket zinciri: örnek fiş → model önerisi; bilinmeyen başlık NONE', () => {
    const t = app.services.tagging
    expect(t.effective(SINTEL)).toMatchObject({ basis: 'SAMPLE', sheetCount: 0, agreement: null })
    expect(t.effective(SINTEL).descriptors).toEqual(expect.arrayContaining(['duygusal', 'gorsel']))
    expect(t.effective(NO_SAMPLE).basis).toBe('MODEL')
    expect(t.effective(NO_SAMPLE).facets['konu']).toEqual(expect.arrayContaining(['astronomi']))
    expect(t.effective(123)).toMatchObject({ basis: 'NONE', scales: {}, facets: {}, descriptors: [] })
    const sources = t.sheets(SINTEL).map((s) => s.source)
    expect(sources).toEqual(['SAMPLE', 'MODEL'])
  })

  it('kuyruk: etiketsizler ve yalnız örnek fişi olanlar önce', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/studio/tagging/queue' })
    const q = r.json<TaggingQueueItem[]>()
    expect(q).toHaveLength(app.services.catalog.allTitles().length)
    const ranks = q.map((i) => ({ NONE: 0, MODEL: 1, SAMPLE: 2, CONSENSUS: 3 })[i.basis])
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    expect(q.filter((i) => i.basis === 'SAMPLE')).toHaveLength(12)
  })

  it('doğrulama: bilinmeyen ölçek/yüz/değer, max aşımı, aralık dışı, bilinmeyen alan, kötü kimlik → 400 ve anahtar adı', async () => {
    const base = { watched: true, scales: { romantizm: 2 }, facets: {} }
    const cases: [unknown, RegExp][] = [
      [{ ...base, scales: { uydurma: 2 } }, /uydurma/],
      [{ ...base, facets: { bilinmeyen: ['x'] } }, /bilinmeyen/],
      [{ ...base, facets: { mekan: ['mars'] } }, /mekan.*mars/],
      [{ ...base, facets: { mekan: ['uzay', 'deniz', 'okul'] } }, /en çok 2 değer/],
      [{ ...base, scales: { romantizm: 6 } }, /scales\.romantizm/],
      [{ ...base, scales: { romantizm: 2.5 } }, /scales\.romantizm/],
      [{ ...base, fazla: 1 }, /Bilinmeyen alan: fazla/],
      [{ ...base, status: 'APPROVED' }, /status/],
      [{ scales: {}, facets: {} }, /watched/],
    ]
    for (const [payload, re] of cases) {
      const r = await put(TEARS, 'etiket-01', payload)
      expect(r.statusCode, JSON.stringify(payload)).toBe(400)
      expect(err(r).message).toMatch(re)
    }
    const badTagger = await put(TEARS, 'Etiket 01', base)
    expect(badTagger.statusCode).toBe(400)
    expect(err(badTagger).code).toBe('INVALID_TAGGER')
    expect((await put(999, 'etiket-01', base)).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/studio/tagging/titles/abc' })).statusCode).toBe(400)
    // izlenmemiş fiş gönderilemez, taslak olabilir
    const unwatched = await put(TEARS, 'etiket-01', { ...base, watched: false })
    expect(err(unwatched).code).toBe('NOT_WATCHED')
    expect((await put(TEARS, 'etiket-01', { ...base, watched: false, status: 'DRAFT' })).statusCode).toBe(200)
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/studio/tagging/titles/${TEARS}/sheets/etiket-01` })).statusCode,
    ).toBe(204)
  })

  it('iş akışı: iki etiketleyici → taslak onaylanamaz → onay → uzlaşı, uyum; revizyon her değişiklikte artar', async () => {
    const rev0 = app.services.tagging.revision()
    const a = await put(SINTEL, 'etiket-01', {
      watched: true,
      scales: { siddet: 3, kan: 2, korku: 2, romantizm: 0, duygusallik: 4, 'son-netligi': 1, gorsellik: 5 },
      facets: { mekan: ['hayali-dunya'], 'ana-karakter': ['guclu-kadin', 'fantastik-varlik'], bicim: ['kisa-film'] },
      notes: 'Ejderhayla yüzleşme sahnesi (yaklaşık 10. dakika) şiddet 3.',
    })
    expect(a.statusCode).toBe(200)
    expect(a.json<TagSheet>()).toMatchObject({
      source: 'TAGGER',
      tagger: 'etiket-01',
      status: 'SUBMITTED',
      watched: true,
    })
    const second = {
      watched: true,
      scales: { siddet: 3, kan: 3, korku: 2, romantizm: 0, duygusallik: 5, 'son-netligi': 0, gorsellik: 4 },
      facets: { mekan: ['hayali-dunya', 'vahsi-doga'], 'ana-karakter': ['guclu-kadin'], bicim: ['kisa-film'] },
    }
    const b = await put(SINTEL, 'etiket-02', { ...second, status: 'DRAFT' })
    expect(b.json<TagSheet>().status).toBe('DRAFT')
    expect(app.services.tagging.revision()).toBe(rev0 + 2)

    const draft = await approve(SINTEL, 'etiket-02')
    expect(draft.statusCode).toBe(409)
    expect(err(draft).code).toBe('SHEET_IS_DRAFT')
    expect((await approve(SINTEL, 'etiket-09')).statusCode).toBe(404)

    // gönderilmiş ama onaylanmamış fiş kuyrukta "onay bekliyor"; geçerli etiket hâlâ örnek fiş
    let t = await get(SINTEL)
    expect(t.effective.basis).toBe('SAMPLE')
    const queued = (await app.inject({ method: 'GET', url: '/api/studio/tagging/queue' })).json<TaggingQueueItem[]>()
    expect(queued.find((q) => q.titleId === SINTEL)).toMatchObject({ pendingReview: true, humanSheets: 2 })

    expect((await approve(SINTEL, 'etiket-01')).json<TagSheet>().status).toBe('APPROVED')
    t = await get(SINTEL)
    expect(t.effective).toMatchObject({ basis: 'CONSENSUS', sheetCount: 1, agreement: null })

    expect((await put(SINTEL, 'etiket-02', { ...second, status: 'SUBMITTED' })).statusCode).toBe(200)
    expect((await approve(SINTEL, 'etiket-02')).statusCode).toBe(200)
    // onay tekrarı zararsız
    expect((await approve(SINTEL, 'etiket-02')).statusCode).toBe(200)
    t = await get(SINTEL)
    expect(t.effective.basis).toBe('CONSENSUS')
    expect(t.effective.sheetCount).toBe(2)
    // ortanca: kan (2,3)→2, duygusallık (4,5)→4, sonun netliği (1,0)→0, görsellik (5,4)→4
    expect(t.effective.scales).toMatchObject({
      siddet: 3,
      kan: 2,
      korku: 2,
      duygusallik: 4,
      'son-netligi': 0,
      gorsellik: 4,
    })
    expect(t.effective.facets).toEqual({
      mekan: ['hayali-dunya'],
      'ana-karakter': ['guclu-kadin'],
      bicim: ['kisa-film'],
    })
    expect(t.effective.descriptors).toEqual(expect.arrayContaining(['duygusal', 'ucu-acik', 'gorsel']))
    expect(t.effective.agreement).toBeGreaterThan(0.6)
    expect(t.effective.agreement).toBeLessThan(1)
    expect(t.sheets.map((s) => s.source)).toEqual(['TAGGER', 'TAGGER', 'SAMPLE', 'MODEL'])

    // silme: uzlaşı tek fişe döner; ikisi de silinince örnek fişe
    const before = app.services.tagging.revision()
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/studio/tagging/titles/${SINTEL}/sheets/etiket-02` })).statusCode,
    ).toBe(204)
    expect(app.services.tagging.revision()).toBe(before + 1)
    expect((await get(SINTEL)).effective.sheetCount).toBe(1)
    await app.inject({ method: 'DELETE', url: `/api/studio/tagging/titles/${SINTEL}/sheets/etiket-01` })
    expect((await get(SINTEL)).effective.basis).toBe('SAMPLE')
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/studio/tagging/titles/${SINTEL}/sheets/etiket-01` })).statusCode,
    ).toBe(404)
  })

  it('RTÜK uyarısı: fiş başlıktakinden yüksek işaret ya da yazılmamış gerekçe gerektirirse', async () => {
    // Sintel 13+ (şiddet ve korku): şiddet 4 → 18+ ; cinsellik 3 → 13+ ama gerekçe yok
    await put(SINTEL, 'etiket-03', { watched: true, scales: { siddet: 4, cinsellik: 3 }, facets: {} })
    const t = await get(SINTEL)
    expect(t.advisoryWarnings.join('\n')).toMatch(
      /"etiket-03" fişi: Şiddet 4 \("Sert"\) en az 18\+ işaretini gerektiriyor; başlık 13\+ işaretli/,
    )
    expect(t.advisoryWarnings.join('\n')).toMatch(/Cinsellik 3 .*"Cinsellik" gerekçesini gerektiriyor/)
    await app.inject({ method: 'DELETE', url: `/api/studio/tagging/titles/${SINTEL}/sheets/etiket-03` })
    expect((await get(SINTEL)).advisoryWarnings).toEqual([])
  })

  it('insan fişleri depoya yazılır ve aynı veri klasörüyle yeniden açılınca geri gelir', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-etiket-'))
    const a1 = await createTestApp({ dataDir, isTest: false })
    await a1.inject({
      method: 'PUT',
      url: `/api/studio/tagging/titles/${TEARS}/sheets/etiket-07`,
      payload: { watched: true, scales: { mizah: 1 }, facets: {} },
    })
    await a1.close()
    const a2 = await createTestApp({ dataDir })
    expect(
      taggingCore(a2)
        .humanSheets(TEARS)
        .map((s) => s.tagger),
    ).toEqual(['etiket-07'])
    await a2.close()
  })
})

/* ───────────── CSRF ve erişim ───────────── */

describe('stüdyo erişimi (TVP_STUDIO=member)', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createTestApp({ studioAccess: 'member' })
  })
  afterAll(async () => {
    await app.close()
  })

  it('oturumsuz okuma 401; oturumla okuma serbest; yazma authURL ister', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/studio/tagging/queue' })).statusCode).toBe(401)
    const cookies: Record<string, string> = {}
    const take = (r: InjectResponse) => {
      for (const c of r.cookies) cookies[c.name] = c.value
    }
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    take(login)
    const guid = login.json<BootContext>().profiles[0]!.guid
    const sw = await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies, payload: { guid } })
    take(sw)
    const authURL = sw.json<BootContext>().authURL ?? ''
    expect(authURL).not.toBe('')
    expect((await app.inject({ method: 'GET', url: '/api/studio/tagging/queue', cookies })).statusCode).toBe(200)

    const url = `/api/studio/tagging/titles/${TEARS}/sheets/etiket-01`
    const payload = { watched: true, scales: { mizah: 1 }, facets: {} }
    const noCsrf = await app.inject({ method: 'PUT', url, cookies, payload })
    expect(noCsrf.statusCode).toBe(403)
    expect(noCsrf.json<{ error: { code: string } }>().error.code).toBe('CSRF')
    const ok = await app.inject({ method: 'PUT', url, cookies, payload, headers: { [HEADERS.AUTH_URL]: authURL } })
    expect(ok.statusCode).toBe(200)
    const appr = await app.inject({ method: 'POST', url: `${url}/approve`, cookies })
    expect(appr.statusCode).toBe(403)
    const del = await app.inject({ method: 'DELETE', url, cookies, headers: { [HEADERS.AUTH_URL]: authURL } })
    expect(del.statusCode).toBe(204)
  })
})

/* ───────────── açılış ───────────── */

describe('açılışta içerik denetimi', () => {
  const contentWith = (mutate: (dir: string) => void): string => {
    const dir = mkdtempSync(join(tmpdir(), 'tvplus-etiket-icerik-'))
    mkdirSync(join(dir, 'titles'), { recursive: true })
    cpSync(join(CONTENT, 'tagging'), join(dir, 'tagging'), { recursive: true })
    mutate(dir)
    return dir
  }

  it('geçersiz sözlük → sunucu dosya ve anahtar adıyla açılmaz', async () => {
    const dir = contentWith((d) => {
      const v = rawVocabulary() as { scales: { levels: unknown[] }[] }
      v.scales[2]!.levels.pop()
      writeFileSync(join(d, 'tagging', 'vocabulary.json'), JSON.stringify(v))
    })
    await expect(createTestApp({ contentDir: dir })).rejects.toThrow(/tagging\/vocabulary\.json scales\[2\]\.levels/)
  })

  it('geçersiz örnek fiş → dosya, sıra ve anahtar adıyla durur', async () => {
    const dir = contentWith((d) => {
      const f = join(d, 'tagging', 'sheets', 'ornek-temel.json')
      const sheets = JSON.parse(readFileSync(f, 'utf8')) as { facets: Record<string, string[]> }[]
      sheets[3]!.facets['mekan'] = ['mars']
      writeFileSync(f, JSON.stringify(sheets))
    })
    await expect(createTestApp({ contentDir: dir })).rejects.toThrow(
      /tagging\/sheets\/ornek-temel\.json \[3\]\.facets\.mekan\[0\]: "mekan" yüzünde "mars" değeri yok/,
    )
  })

  it('içerik klasöründe sözlük yoksa depodaki sözlük kullanılır (test içerikleri yalnız başlık taşır)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tvplus-bos-'))
    const a = await createTestApp({ contentDir: dir })
    expect(a.services.tagging.vocabulary().version).toBe(VOCAB.version)
    await a.close()
  })
})
