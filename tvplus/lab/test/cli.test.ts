/**
 * Komut satırı (lab/src/cli): argüman ayrıştırma (tırnak, --bayrak=değer, Türkçe bayrak adları, negatif sayılar) ve
 * geçici klasörde kurulan bir lab üzerinde komutlar — durum, yardım, churn ve alt komutları, toplu sorgu, --json,
 * Türkçe hata iletileri, denetim günlüğü (her çıktı kaydedilir) ve kompakt çıktı bütçesi. Ayrıca belgelenen kurulum
 * yolu (kesif → esleme --kabul → al → kur) komutlarla baştan sona yürütülür.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ChurnDeep } from '../../shared/lab'
import { flagBool, flagNum, flagStr, parseArgs, splitCommandLine } from '../src/cli/args'
import { execute } from '../src/cli/commands'
import { loadTable, type Table } from '../src/core/columns'
import { openLab } from '../src/core/lab'
import { build, type BuildMeta } from '../src/data/build'
import { ingest } from '../src/data/ingest'
import { WORLD_MAPPING } from '../src/world/world'
import { writeWorld } from '../src/world/write'

const SECRET = 'cli-testi-anahtari'
// Ortam değişkenleri sonucu etkilemesin; komutların açtığı lab da aynı anahtarı kullansın
delete process.env.TVP_LAB_K
delete process.env.TVP_LAB_DIR
delete process.env.TVP_DATA_DIR
process.env.TVP_LAB_SECRET = SECRET

const root = mkdtempSync(join(tmpdir(), 'lab-cli-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const labDir = join(root, 'lab')
const worldPath = join(root, 'ham', 'dunya.jsonl')
const auditFile = (dir: string): string => join(dir, 'gunluk', 'ciktilar.ndjson')

interface AuditLine {
  at: string
  komut: string
  karakter: number
  cikti: string
}
const auditLines = (dir = labDir): AuditLine[] =>
  existsSync(auditFile(dir))
    ? readFileSync(auditFile(dir), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as AuditLine)
    : []

/** Bu dosyada üretilen her çıktı (gizlilik taraması için) */
const outputs: string[] = []

/**
 * Komutu çalıştırır ve HER seferinde denetim günlüğünü doğrular: tam bir satır eklenmiş olmalı; satırdaki çıktı
 * dönen metnin aynısı, komut da verilen argümanlar olmalı.
 */
async function runIn(dir: string, argv: readonly string[]): Promise<string> {
  const full = [...argv, '--lab', dir]
  const before = auditLines(dir).length
  const out = await execute(full, parseArgs, undefined, true)
  outputs.push(out)
  const lines = auditLines(dir)
  if (lines.length !== before + 1)
    throw new Error(`denetim günlüğüne ${lines.length - before} satır eklendi (beklenen 1): ${argv.join(' ')}`)
  const last = lines[lines.length - 1]
  if (last.cikti !== out) throw new Error(`denetim günlüğündeki çıktı dönen metinle aynı değil: ${argv.join(' ')}`)
  if (last.karakter !== out.length) throw new Error('denetim günlüğündeki karakter sayısı yanlış')
  if (last.komut !== full.join(' ')) throw new Error(`denetim günlüğündeki komut yanlış: ${last.komut}`)
  if (Number.isNaN(Date.parse(last.at))) throw new Error('denetim günlüğündeki zaman okunamıyor')
  return out
}
const run = (...argv: string[]): Promise<string> => runIn(labDir, argv)
/** Tek satırlık komut metni (MCP aracındaki gibi) */
const line = (text: string): Promise<string> => runIn(labDir, splitCommandLine(text))

let meta: BuildMeta
let users: Table

const total = (xs: ArrayLike<number>): number => {
  let s = 0
  for (let i = 0; i < xs.length; i++) s += xs[i]
  return s
}

beforeAll(async () => {
  await writeWorld(worldPath, { users: 400, days: 90, seed: 11, end: '2026-11-10' })
  const lab = openLab({ dir: labDir, secret: SECRET })
  writeFileSync(lab.mappingFile, JSON.stringify(WORLD_MAPPING))
  await ingest(lab, [worldPath], { mapping: WORLD_MAPPING, reset: true, synthetic: true })
  meta = build(lab)
  users = loadTable(lab.tableDir, 'kullanici')
}, 120_000)

describe('splitCommandLine', () => {
  it('boşluklar ayırır; art arda boşluk, sekme ve satır sonu tek ayırıcıdır', () => {
    expect(splitCommandLine('churn neden --limit 5')).toEqual(['churn', 'neden', '--limit', '5'])
    expect(splitCommandLine('  churn \t neden\n--limit   5  ')).toEqual(['churn', 'neden', '--limit', '5'])
    expect(splitCommandLine('')).toEqual([])
    expect(splitCommandLine('   ')).toEqual([])
    expect(splitCommandLine('durum')).toEqual(['durum'])
  })

  it('çift ve tek tırnak içindeki boşluklar korunur; tırnaklar atılır', () => {
    expect(splitCommandLine('sorgu gun --olc "n, ort(x)" --nerede "a>3 & b=TV"')).toEqual([
      'sorgu',
      'gun',
      '--olc',
      'n, ort(x)',
      '--nerede',
      'a>3 & b=TV',
    ])
    expect(splitCommandLine("kesif '/veri klasörü/dışa aktarım.jsonl' --olay 'Playback Started'")).toEqual([
      'kesif',
      '/veri klasörü/dışa aktarım.jsonl',
      '--olay',
      'Playback Started',
    ])
    // Öteki tür tırnak, tırnak içinde düz karakterdir
    expect(splitCommandLine(`--nerede 'plan="aylik"' --not "Ali'nin sorgusu"`)).toEqual([
      '--nerede',
      'plan="aylik"',
      '--not',
      "Ali'nin sorgusu",
    ])
  })

  it('tırnaklı ve tırnaksız bitişik parçalar tek parçadır; boş tırnak boş parça verir', () => {
    expect(splitCommandLine('--olc=n,"ort(izleme dk)",kisi')).toEqual(['--olc=n,ort(izleme dk),kisi'])
    expect(splitCommandLine('a"b c"d')).toEqual(['ab cd'])
    expect(splitCommandLine('kesif "" x')).toEqual(['kesif', '', 'x'])
    expect(splitCommandLine("''")).toEqual([''])
    // Kapanmayan tırnak satır sonuna dek sürer
    expect(splitCommandLine('a "b c')).toEqual(['a', 'b c'])
  })

  it('Türkçe karakterler ve simgeler bozulmaz', () => {
    expect(splitCommandLine('sorgu kullanici --nerede "sehir=İstanbul & izleme_dk>=1.5" --sıfırla')).toEqual([
      'sorgu',
      'kullanici',
      '--nerede',
      'sehir=İstanbul & izleme_dk>=1.5',
      '--sıfırla',
    ])
  })
})

describe('parseArgs', () => {
  it('konumsal parçalar ve değerli bayraklar', () => {
    const a = parseArgs(['churn', 'etken', 'gun_son', '--limit', '5', '--lab', '/tmp/x'])
    expect(a._).toEqual(['churn', 'etken', 'gun_son'])
    expect(a.flags).toEqual({ limit: '5', lab: '/tmp/x' })
    expect(parseArgs([])).toEqual({ _: [], flags: {} })
    // Bayraktan sonra gelen konumsal parça değer sayılır; öncekiler konumsaldır
    expect(parseArgs(['al', 'a.jsonl', 'b.jsonl', '--ornek', '0.1'])).toEqual({
      _: ['al', 'a.jsonl', 'b.jsonl'],
      flags: { ornek: '0.1' },
    })
  })

  it('--bayrak=değer biçimi; değerde = kalabilir; boş değer boş dizgedir', () => {
    expect(parseArgs(['sorgu', '--limit=7', '--nerede=plan=aylik', '--bos=']).flags).toEqual({
      limit: '7',
      nerede: 'plan=aylik',
      bos: '',
    })
    // = biçiminde sonraki parça tüketilmez
    expect(parseArgs(['--limit=7', 'churn'])).toEqual({ _: ['churn'], flags: { limit: '7' } })
  })

  it('değersiz bayrak açık / kapalıdır: sonda ya da başka bir bayraktan önce', () => {
    expect(parseArgs(['churn', '--json']).flags).toEqual({ json: true })
    expect(parseArgs(['churn', '--yeniden', '--json', '--limit', '3']).flags).toEqual({
      yeniden: true,
      json: true,
      limit: '3',
    })
    expect(parseArgs(['--kisa', '--hizli']).flags).toEqual({ kisa: true, hizli: true })
  })

  it('negatif sayılar ve tire ile başlayan değerler değer sayılır', () => {
    expect(parseArgs(['--esik', '-5']).flags).toEqual({ esik: '-5' })
    expect(parseArgs(['--esik', '-0.5', '--json']).flags).toEqual({ esik: '-0.5', json: true })
    expect(parseArgs(['sorgu', 'gun', '--sirala', '-n']).flags).toEqual({ sirala: '-n' })
    expect(parseArgs(['sorgu', 'gun', '--sirala', '-oran(churn)', '--limit', '3']).flags).toEqual({
      sirala: '-oran(churn)',
      limit: '3',
    })
    expect(flagNum(parseArgs(['--esik', '-5']), 'esik')).toBe(-5)
    expect(flagNum(parseArgs(['--esik=-2.5e3']), 'esik')).toBe(-2500)
  })

  it('Türkçe bayrak adları ASCII’ye indirgenir; değerlere dokunulmaz', () => {
    expect(parseArgs(['al', 'x', '--sıfırla']).flags).toEqual({ sifirla: true })
    expect(parseArgs(['--ölç', 'n', '--gün', '90', '--kullanıcı=400', '--çıktı', 'ş']).flags).toEqual({
      olc: 'n',
      gun: '90',
      kullanici: '400',
      cikti: 'ş',
    })
    expect(parseArgs(['--İçerik-Adları=hayır']).flags).toEqual({ 'icerik-adlari': 'hayır' })
    expect(parseArgs(['--LIMIT', '4', '--Json']).flags).toEqual({ limit: '4', json: true })
    expect(parseArgs(['--nerede', 'Şehir=İstanbul']).flags).toEqual({ nerede: 'Şehir=İstanbul' })
  })

  it('aynı bayrak yinelenirse son değer geçerlidir; tek tire ve yalın -- konumsaldır', () => {
    expect(parseArgs(['--limit', '3', '--limit', '9']).flags).toEqual({ limit: '9' })
    expect(parseArgs(['-n', '--', 'x'])).toEqual({ _: ['-n', '--', 'x'], flags: {} })
  })

  it('flagStr / flagNum / flagBool', () => {
    const a = parseArgs([
      '--limit',
      '12',
      '--ad',
      'deneme',
      '--json',
      '--acik',
      'hayır',
      '--kapali',
      '0',
      '--evet',
      'evet',
      '--sayi',
      'abc',
    ])
    expect(flagStr(a, 'ad')).toBe('deneme')
    expect(flagStr(a, 'yok', 'ad')).toBe('deneme')
    expect(flagStr(a, 'json')).toBeUndefined()
    expect(flagStr(a, 'yok')).toBeUndefined()
    expect(flagNum(a, 'limit')).toBe(12)
    expect(flagNum(a, 'yok')).toBeUndefined()
    expect(() => flagNum(a, 'sayi')).toThrow(/--sayi bir sayı olmalı \(verilen: abc\)/)
    expect(flagBool(a, 'json')).toBe(true)
    expect(flagBool(a, 'yok')).toBe(false)
    expect(flagBool(a, 'acik')).toBe(false)
    expect(flagBool(a, 'kapali')).toBe(false)
    expect(flagBool(a, 'evet')).toBe(true)
    expect(flagBool(parseArgs(['--x', 'false']), 'x')).toBe(false)
    expect(flagBool(parseArgs(['--x', 'HAYIR']), 'x')).toBe(false)
  })

  it('tek satırlık komut metni baştan sona ayrışır', () => {
    const a = parseArgs(
      splitCommandLine(
        'sorgu anlik --grup plan,cihaz --olc "n, oran(churn)" --nerede "kidem_gun>=30 & cihaz=TV" --sirala -n --json',
      ),
    )
    expect(a._).toEqual(['sorgu', 'anlik'])
    expect(a.flags).toEqual({
      grup: 'plan,cihaz',
      olc: 'n, oran(churn)',
      nerede: 'kidem_gun>=30 & cihaz=TV',
      sirala: '-n',
      json: true,
    })
  })
})

describe('boş lab', () => {
  const empty = join(root, 'bos-lab')

  it('durum sıradaki adımı söyler; veri isteyen komutlar Türkçe hata verir', async () => {
    const out = await runIn(empty, ['durum'])
    expect(out.split('\n')[0]).toBe(`LAB · ${empty}`)
    expect(out).toMatch(/eşleme: yok/)
    expect(out).toMatch(/depo: boş/)
    expect(out).toMatch(/tablolar: kurulmamış/)
    expect(out).toMatch(/churn analizi: yok/)
    expect(out).toMatch(/sıradaki: kesif/)
    // Komut verilmezse durum
    expect(await runIn(empty, [])).toBe(out)
    await expect(runIn(empty, ['churn'])).rejects.toThrow(/Tablolar kurulmamış/)
    await expect(runIn(empty, ['kur'])).rejects.toThrow(/Depo boş/)
    await expect(runIn(empty, ['sorgu', 'kullanici'])).rejects.toThrow(/Tablolar kurulmamış/)
    await expect(runIn(empty, ['al', worldPath])).rejects.toThrow(/Eşleme yok/)
    await expect(runIn(empty, ['al'])).rejects.toThrow(/Kullanım: al/)
    await expect(runIn(empty, ['kesif'])).rejects.toThrow(/Kullanım: kesif/)
    await expect(runIn(empty, ['kesif', join(root, 'olmayan.jsonl')])).rejects.toThrow(/Dosya bulunamadı/)
    expect(await runIn(empty, ['esleme'])).toMatch(/Eşleme yok\. Önce: kesif/)
    expect(await runIn(empty, ['gunluk'])).toMatch(/DENETİM GÜNLÜĞÜ/)
  })
})

describe('durum, yardım, sözlük', () => {
  it('durum: eşleme, depo, tablolar ve sıradaki adım (henüz churn yok)', async () => {
    const out = await run('durum')
    const lines = out.split('\n')
    expect(lines[0]).toBe(`LAB · ${labDir}`)
    expect(out).toMatch(/eşleme: var \(18 olay adı, 6 boyut\)/)
    expect(out).toMatch(
      /depo: \S+ olay · 1 içe alma · 2026-08-\d\d…2026-11-1\d · kullanıcı örneklemi %100 · SENTETİK DEMO/,
    )
    expect(out).toContain(`tablolar: güncel · ${meta.users} kullanıcı`)
    expect(out).toContain(`sürüm ${meta.dataRev}`)
    expect(out).toMatch(/churn analizi: yok/)
    expect(out).toMatch(/gizlilik: gruplar en az 20 kullanıcı/)
    expect(lines[lines.length - 1]).toBe('sıradaki: churn')
    expect(out.length).toBeLessThan(1000)
    expect(lines.length).toBeLessThanOrEqual(8)
  })

  it('durum --json makine çıktısı verir', async () => {
    const s = JSON.parse(await run('durum', '--json')) as {
      tablesFresh: boolean
      next: string
      status: { users: number; events: number; dataRev: string; synthetic: boolean }
      manifest: { events: number; sample: number }
      churn: unknown
    }
    expect(s.tablesFresh).toBe(true)
    expect(s.next).toBe('churn')
    expect(s.status).toMatchObject({ users: meta.users, events: meta.events, dataRev: meta.dataRev, synthetic: true })
    expect(s.manifest.sample).toBe(1)
    expect(s.churn).toBeNull()
  })

  it('yardim: komut listesi; yardım ve help aynı metni verir', async () => {
    const out = await run('yardim')
    for (const cmd of [
      'durum',
      'demo',
      'kesif',
      'esleme',
      'al ',
      'kur',
      'churn',
      'sorgu',
      'gunluk',
      'ayar',
      'sozluk',
      '--json',
      '--lab',
    ])
      expect(out, cmd).toContain(cmd)
    expect(await run('yardım')).toBe(out)
    expect(await run('help')).toBe(out)
    expect(out.length).toBeLessThan(4000)
    expect(out.split('\n').length).toBeLessThanOrEqual(40)
  })

  it('sozluk: terimler', async () => {
    const out = await run('sozluk')
    expect(out.split('\n')[0]).toBe('SÖZLÜK')
    for (const term of ['etkin gün', 'churn', 'RO', 'CUPED', 'SRM']) expect(out).toContain(term)
    expect(await run('sözlük')).toBe(out)
  })

  it('bilinmeyen komut Türkçe hata verir ve yardımı ekler', async () => {
    await expect(run('bilinmeyen')).rejects.toThrow(/^Bilinmeyen komut: bilinmeyen\n/)
    const err = await run('churnn').then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    )
    expect(err).toMatch(/Bilinmeyen komut: churnn/)
    expect(err).toMatch(/durum\s+neredeyiz/)
  })
})

describe('churn', () => {
  let deep: ChurnDeep

  it('churn: tanım, özet ve önem sırasıyla bulgular — kompakt', async () => {
    const out = await run('churn')
    const lines = out.split('\n')
    expect(lines[0]).toBe(`CHURN · ${meta.users} kullanıcı · 2026-08-13…2026-11-11 (91 gün) · SENTETİK DEMO VERİSİ`)
    expect(lines[1]).toMatch(/^tanım: \d+ gün izleme yok \(veriden: /)
    expect(lines[2]).toMatch(/^özet: .*pencere sonunda gitmiş %[\d.]+ \(\d+\/\d+\)/)
    expect(out).toMatch(/BULGULAR \(önem sırasıyla\)/)
    expect(out).toMatch(/^b1 +●●● /m)
    expect(out).toMatch(/→ churn (genel|neden|tetik)/)
    expect(out).toMatch(/ayrıntı: churn genel \| neden \| tetik/)
    // Varsayılan çıktı kısa kalır
    expect(out.length).toBeLessThan(6000)
    expect(lines.length).toBeLessThanOrEqual(40)
    for (const l of lines) expect(l.length).toBeLessThan(400)
  })

  it('churn --json: ayrıştırılabilir JSON ve metinle aynı sonuç', async () => {
    const text = await run('churn', '--json')
    deep = JSON.parse(text) as ChurnDeep
    expect(deep.status).toMatchObject({ ready: true, synthetic: true, users: meta.users, dataRev: meta.dataRev })
    expect(deep.overview.users).toBe(meta.users)
    expect(deep.overview.definition.chosenBy).toBe('veri')
    expect(deep.findings.length).toBeGreaterThan(5)
    expect(deep.model).not.toBeNull()
    expect(deep.reasons).not.toBeNull()
    expect(deep.triggers).not.toBeNull()
    // Metin çıktısındaki sayılar JSON'dakilerle aynı
    const out = await run('churn')
    expect(out).toContain(`tanım: ${deep.overview.definition.n} gün izleme yok`)
    expect(out).toContain(`(${deep.overview.churned}/${deep.overview.everActive})`)
    expect(out).toContain(deep.findings[0].title)
    // Sonuç önbelleğe yazıldı ve durum bunu gösteriyor
    expect(existsSync(join(labDir, 'sonuc', 'churn.json'))).toBe(true)
    const status = await run('durum')
    expect(status).toMatch(/churn analizi: \d{4}-\d\d-\d\d \d\d:\d\d/)
    expect(status).toMatch(/sıradaki: churn neden \| churn tetik/)
  })

  it('--limit ve --kisa çıktıyı daraltır ve kesildiğini söyler', async () => {
    const full = await run('churn')
    const brief = await run('churn', '--kisa')
    expect(brief.length).toBeLessThan(full.length)
    expect(brief).toContain(deep.findings[0].title)
    expect(brief).not.toContain(deep.findings[0].evidence)
    const three = await run('churn', '--limit', '3')
    expect(three).toMatch(/^b3 /m)
    expect(three).not.toMatch(/^b4 /m)
    expect(three).toContain(`… +${deep.findings.length - 3} bulgu daha (--limit ${deep.findings.length})`)
    expect(await run('churn', 'ozet')).toBe(full)
  })

  it('churn neden: neden aileleri ve taban risk', async () => {
    const out = await run('churn', 'neden')
    const lines = out.split('\n')
    expect(lines[0]).toMatch(/^CHURN NEDENLERİ · 400 kullanıcı/)
    expect(out).toContain(`${deep.reasons?.churners} churn olayı`)
    expect(out).toMatch(/neden ailesi +pay +birincil +giderilirse/)
    expect(out).toMatch(/Keşif başarısızlığı/)
    expect(out).toMatch(/Taban risk \(özel işaret yok\)/)
    expect(out.length).toBeLessThan(3000)
    expect(lines.length).toBeLessThanOrEqual(14)
  })

  it('churn tetik: risk oranı tablosu; --limit satır bütçesi', async () => {
    const out = await run('churn', 'tetik')
    expect(out.split('\n')[0]).toMatch(/^CHURN TETİKLEYİCİLERİ · 400 kullanıcı/)
    expect(out).toContain(`${deep.triggers?.terminal}'`)
    expect(out).toMatch(/deneyim +aile +günlerin +RO +%95 aralık +p \(düz\.\) +atfedilen/)
    expect(out).toMatch(/Hiçbir şey izlemeden çıktı +Keşif +%[\d.]+ +[\d.]+x +\[[\d.]+x, [\d.]+x\]/)
    expect(out.length).toBeLessThan(4000)
    const rows = deep.triggers?.rows.length ?? 0
    expect(rows).toBeGreaterThan(5)
    const five = await run('churn', 'tetik', '--limit', '5')
    expect(five).toContain(`… +${rows - 5} satır daha (--limit 30)`)
    expect(five.length).toBeLessThan(out.length)
    const all = await run('churn', 'tetik', '--limit', '30')
    expect(all).not.toMatch(/satır daha/)
    for (const t of deep.triggers?.rows ?? []) expect(all).toContain(t.label.slice(0, 40))
  })

  it('diğer alt komutlar: genel, tanim, kim, yeni, etken, etken <ad>', async () => {
    const genel = await run('churn', 'genel')
    expect(genel).toMatch(/^CHURN GENEL · /)
    expect(genel).toContain(`kullanıcı ${deep.overview.users} · en az bir kez etkin ${deep.overview.everActive}`)
    expect(genel).toMatch(/DÖNEM CHURN'Ü/)
    expect(genel).toMatch(/YENİ KULLANICI TUTUNMASI/)
    const tanim = await run('churn', 'tanim')
    expect(tanim).toMatch(/^CHURN TANIMI · /)
    expect(tanim).toMatch(new RegExp(`^ +${deep.overview.definition.n} .*← seçilen$`, 'm'))
    const kim = await run('churn', 'kim')
    expect(kim).toMatch(/^KİM GİDİYOR · /)
    expect(kim).toMatch(/boyut = değer +satır +churn +genele oran +p/)
    const yeni = await run('churn', 'yeni')
    expect(yeni.length).toBeGreaterThan(20)
    const etken = await run('churn', 'etken')
    expect(etken).toMatch(/^CHURN ETKENLERİ/)
    expect(etken).toMatch(/gun_son +Son etkinlikten beri gün/)
    const one = await run('churn', 'etken', 'gun_son')
    expect(one).toMatch(/^ETKEN · gun_son — Son etkinlikten beri gün/)
    expect(one).toMatch(/dilim +satır +churn +%95 aralık/)
    expect(await run('churn', 'etken', 'olmayan_ozellik')).toMatch(/Böyle bir özellik yok: olmayan_ozellik\. Olanlar: /)
    for (const out of [genel, tanim, kim, yeni, etken, one]) {
      expect(out.length).toBeLessThan(6000)
      expect(out.split('\n').length).toBeLessThanOrEqual(45)
    }
  })

  it('geçersiz alt komut ve bayraklar Türkçe hata verir', async () => {
    await expect(run('churn', 'olmayan')).rejects.toThrow(
      /Bilinmeyen alt komut: churn olmayan\. Olanlar: genel, neden, tetik/,
    )
    await expect(run('churn', '--n', 'abc')).rejects.toThrow(/--n bir sayı olmalı \(verilen: abc\)/)
    await expect(run('churn', '--etkinlik', 'bilinmeyen')).rejects.toThrow(/--etkinlik izleme ya da uygulama olmalı/)
    await expect(run('churn', '--n', '9999')).rejects.toThrow(/Churn süresi 1 ile 90 gün arasında olmalı/)
  })

  it('--n ile elle tanım; --yeniden ile veriden seçilen tanıma dönüş', async () => {
    const manual = await run('churn', '--n', '14')
    expect(manual).toMatch(/tanım: 14 gün izleme yok \(elle verildi\)/)
    expect(await run('churn', 'tanim')).toMatch(/seçilen: 14 gün izleme yok \(elle\)/)
    const app = await run('churn', '--n', '14', '--etkinlik', 'uygulama', '--hizli')
    expect(app).toMatch(/tanım: 14 gün oturum yok \(elle verildi\)/)
    const back = await run('churn', '--yeniden')
    expect(back).toContain(`tanım: ${deep.overview.definition.n} gün izleme yok (veriden:`)
    const again = JSON.parse(await run('churn', '--json')) as ChurnDeep
    expect(again.overview).toEqual(deep.overview)
    expect(again.findings).toEqual(deep.findings)
  })
})

describe('sorgu', () => {
  interface QueryJson {
    headers: { groups: string[]; measures: string[] }
    rows: { group: string[]; values: (number | null)[]; n: number }[]
    matched: number
    hiddenGroups: number
  }
  const json = async (text: string): Promise<QueryJson> => JSON.parse(await line(`${text} --json`)) as QueryJson
  const countBy = (dim: string): Map<string, number> => {
    const out = new Map<string, number>()
    const codes = users.cols[`dim_${dim}`]
    for (let u = 0; u < users.rows; u++) {
      const name = users.dicts[`dim_${dim}`][codes[u]]
      out.set(name, (out.get(name) ?? 0) + 1)
    }
    return out
  }

  it('tablo adı verilmezse kullanım yardımı', async () => {
    const out = await run('sorgu')
    expect(out).toMatch(/^SORGU — /)
    expect(out).toMatch(/tablolar: anlik, kullanici, gun, oturum, baslik/)
    expect(out).toMatch(/ölçüler: n · kisi · ort\(k\)/)
    expect(out.length).toBeLessThan(1200)
  })

  it('--kolonlar: sütun listesi; takma kimlik ve satır aralığı sütunları sorguya açılmaz', async () => {
    for (const name of ['kullanici', 'gun', 'oturum', 'anlik', 'baslik']) {
      const out = await run('sorgu', name, '--kolonlar')
      expect(out.split('\n')[0]).toMatch(new RegExp(`^TABLO · ${name} · \\S+ satır`))
      expect(out).toMatch(/^kategorik: /m)
      expect(out).toMatch(/^sayısal: /m)
      expect(out).not.toMatch(/\buid|uid_hi|uid_lo|day_from|sess_from|fact_from|\btuple\b|main_tid/)
      expect(out.length).toBeLessThan(2500)
    }
    await expect(line('sorgu kullanici --olc "maks(uid_hi)"')).rejects.toThrow(
      /'kullanici' tablosunda 'uid_hi' sütunu yok/,
    )
    await expect(line('sorgu gun --grup uid --olc n')).rejects.toThrow(/'gun' tablosunda 'uid' sütunu yok/)
    await expect(line('sorgu oturum --olc "min(uid)"')).rejects.toThrow(/sütunu yok/)
  })

  it('gruplama ve ölçüler tablodaki gerçek sayılarla aynı', async () => {
    const out = await line('sorgu kullanici --grup plan --olc "n,kisi,oran(churn),ort(izleme_dk)"')
    const lines = out.split('\n')
    expect(lines[0]).toBe(`SORGU · kullanici · eşleşen ${meta.users} / ${meta.users} satır`)
    expect(lines[1]).toMatch(/^plan +n +kişi +oran\(churn\) +ort\(izleme_dk\)$/)
    const r = await json('sorgu kullanici --grup plan --olc "n,kisi,oran(churn),ort(izleme_dk)"')
    expect(r.headers).toEqual({ groups: ['plan'], measures: ['n', 'kişi', 'oran(churn)', 'ort(izleme_dk)'] })
    const expected = countBy('plan')
    expect(r.rows).toHaveLength(expected.size)
    for (const row of r.rows) {
      expect(row.values[0]).toBe(expected.get(row.group[0]))
      // Kullanıcı tablosunda satır = kullanıcı
      expect(row.values[1]).toBe(row.values[0])
      expect(lines.some((l) => l.startsWith(row.group[0]) && l.includes(String(row.values[0])))).toBe(true)
    }
    expect(r.matched).toBe(meta.users)
    expect(r.hiddenGroups).toBe(0)
    expect(out.length).toBeLessThan(1000)
  })

  it('toplamlar churn analiziyle ve tablolarla tutarlı', async () => {
    const deep = JSON.parse(await run('churn', '--json')) as ChurnDeep
    const user = await json('sorgu kullanici --olc "n,top(churn),top(hic_etkin_degil),top(plays),top(sessions)"')
    expect(user.rows[0].values).toEqual([
      meta.users,
      deep.overview.churned,
      deep.overview.neverActive,
      total(users.cols.plays),
      meta.sessions,
    ])
    const day = await json('sorgu gun --olc "n,kisi,top(sessions)"')
    expect(day.rows[0].values).toEqual([meta.userDays, meta.users, meta.sessions])
    const sess = await json('sorgu oturum --olc "n,kisi"')
    expect(sess.rows[0].values?.[0]).toBe(meta.sessions)
    const snap = await json('sorgu anlik --olc "n,oran(churn)"')
    expect(snap.rows[0].values[0]).toBe(deep.model?.rows)
    expect(snap.rows[0].values[1]).toBeCloseTo(deep.model?.churnRate ?? NaN, 12)
  })

  it('koşul, sıralama ve satır bütçesi', async () => {
    const filtered = await json('sorgu kullanici --grup plan --olc n --nerede "cihaz=TV & plays>=1"')
    let expected = 0
    for (let u = 0; u < users.rows; u++)
      if (users.dicts.dim_cihaz[users.cols.dim_cihaz[u]] === 'TV' && users.cols.plays[u] >= 1) expected++
    expect(filtered.matched).toBe(expected)
    expect((await line('sorgu kullanici --grup plan --olc n --nerede "cihaz=TV & plays>=1"')).split('\n')[0]).toBe(
      `SORGU · kullanici · eşleşen ${expected} / ${meta.users} satır · koşul: cihaz=TV & plays>=1`,
    )
    const asc = await json('sorgu kullanici --grup plan --olc "n,ort(izleme_dk)" --sirala n')
    expect(asc.rows.map((r) => r.n)).toEqual([...asc.rows.map((r) => r.n)].sort((a, b) => a - b))
    const desc = await json('sorgu kullanici --grup plan --olc "n,ort(izleme_dk)" --sirala -ort(izleme_dk)')
    const means = desc.rows.map((r) => r.values[1] ?? 0)
    expect(means).toEqual([...means].sort((a, b) => b - a))
    const limited = await line('sorgu anlik --grup plan,cihaz --olc "n,oran(churn)" --sirala -oran(churn) --limit 2')
    expect(limited.split('\n').filter((l) => /^(aylik|yillik|promo-3ay) /.test(l))).toHaveLength(2)
    expect(limited).toMatch(/… \+\d+ satır daha \(--limit N\)/)
    // Yardımdaki örnek olduğu gibi çalışır
    const example = await line(
      'sorgu anlik --grup plan,cihaz --olc "n,oran(churn),ort(izleme_dk_28)" --sirala -oran(churn)',
    )
    expect(example).toMatch(/^plan +cihaz +n +oran\(churn\) +ort\(izleme_dk_28\)$/m)
    expect(example.length).toBeLessThan(2000)
  })

  it('sayısal dilimler: k:N ve tek sınırlı k@a', async () => {
    const q3 = await json('sorgu gun --grup izleme_dk:3 --olc "n,kisi"')
    expect(q3.rows).toHaveLength(3)
    expect(q3.rows.reduce((s, r) => s + r.n, 0)).toBe(meta.userDays)
    expect(Math.max(...q3.rows.map((r) => r.n)) - Math.min(...q3.rows.map((r) => r.n))).toBeLessThanOrEqual(
      meta.userDays * 0.02,
    )
    const cut = await json('sorgu gun --grup izleme_dk@10 --olc "n,kisi"')
    expect(cut.rows.map((r) => r.group[0])).toEqual(['≤ 10', '> 10'])
    expect(cut.rows.reduce((s, r) => s + r.n, 0)).toBe(meta.userDays)
  })

  it('belgelenen çok sınırlı gruplama komut satırından çalışır: --grup "izleme_dk@0,10,60"', async () => {
    // query.ts başlığındaki örnek ve yardımdaki "k@0,1,5 (elle sınırlar)" yazımı. --grup değeri virgülden
    // bölündüğü için sınırlar ayrı sütun adı sanılıyor ("'gun' tablosunda '10' sütunu yok").
    const r = await json('sorgu gun --grup "izleme_dk@0,10,60" --olc "n,kisi,oran(errors)" --sirala -n --limit 10')
    expect(r.rows.map((x) => x.group[0]).sort()).toEqual(['0–10', '10–60', '> 60', '≤ 0'].sort())
    expect(r.rows.reduce((s, x) => s + x.n, 0)).toBe(meta.userDays)
  })

  it('k-anonimlik: 20 kullanıcıdan küçük gruplar gösterilmez ve gizlendiği söylenir', async () => {
    const cities = countBy('sehir')
    const small = [...cities].filter(([, n]) => n < 20).map(([name]) => name)
    const big = [...cities].filter(([, n]) => n >= 20).map(([name]) => name)
    expect(small.length).toBeGreaterThan(0)
    expect(big.length).toBeGreaterThan(0)
    const out = await line('sorgu kullanici --grup sehir --olc "n,kisi,ort(izleme_dk)"')
    expect(out).toContain(`${small.length} grup gizlendi (20 kullanıcıdan az: k-anonimlik)`)
    for (const name of small) expect(out).not.toContain(name)
    for (const name of big) expect(out).toContain(name)
    const r = await json('sorgu kullanici --grup sehir --olc "n,kisi,ort(izleme_dk)"')
    expect(r.hiddenGroups).toBe(small.length)
    expect(r.rows.map((x) => x.group[0]).sort()).toEqual(big.sort())
    for (const row of r.rows) expect(row.values[1]).toBeGreaterThanOrEqual(20)
    // Çok satırlı tablolarda da eşik kullanıcıya göre: anlık görüntüde 20+ satırı olan küçük şehirler yine gizli
    const snap = await json('sorgu anlik --grup sehir --olc "n,kisi"')
    for (const row of snap.rows) expect(row.values[1]).toBeGreaterThanOrEqual(20)
    expect(snap.hiddenGroups).toBeGreaterThan(0)
    // Eşiğin altında kullanıcı bırakan koşul hiçbir değer döndürmez
    const narrow = await json(`sorgu kullanici --olc "n,ort(izleme_dk),maks(plays)" --nerede "sehir=${small[0]}"`)
    expect(narrow.rows).toEqual([])
    expect(narrow.hiddenGroups).toBe(1)
  })

  it('başlık tablosu kullanıcı içermez: eşik uygulanmaz', async () => {
    const r = await json('sorgu baslik --grup klass --olc "n,top(plays),ort(tamamlama)"')
    expect(r.hiddenGroups).toBe(0)
    expect(r.rows.reduce((s, x) => s + (x.values[1] ?? 0), 0)).toBe(total(users.cols.plays))
    expect(r.rows.map((x) => x.group[0])).toContain('FILM')
  })

  it('hatalar Türkçe ve yol gösterici', async () => {
    await expect(run('sorgu', 'yok')).rejects.toThrow(
      /Böyle bir tablo yok: yok\. Tablolar: anlik, kullanici, gun, oturum, baslik/,
    )
    await expect(line('sorgu kullanici --grup olmayan')).rejects.toThrow(
      /'kullanici' tablosunda 'olmayan' sütunu yok\. Sütunlar: /,
    )
    await expect(line('sorgu kullanici --olc "medyan(plays)"')).rejects.toThrow(/Ölçü anlaşılamadı/)
    await expect(line('sorgu kullanici --nerede "plan=bedava"')).rejects.toThrow(
      /'plan' sütununda 'bedava' değeri yok\. Değerler: /,
    )
    await expect(line('sorgu kullanici --nerede "plays ~ 3"')).rejects.toThrow(/Koşul anlaşılamadı/)
    await expect(line('sorgu kullanici --limit çok')).rejects.toThrow(/--limit bir sayı olmalı/)
  })
})

describe('ayar ve denetim günlüğü', () => {
  it('ayar: eşik gösterilir, 5’in altına inmez, değişince sorguya yansır', async () => {
    const out = await run('ayar')
    expect(out).toMatch(/^AYARLAR · /)
    expect(out).toMatch(/k-anonimlik eşiği \(--k\): 20/)
    await expect(run('ayar', '--k', '3')).rejects.toThrow(/k-anonimlik eşiği en az 5 olmalı/)
    const before = (JSON.parse(await line('sorgu kullanici --grup sehir --olc n --json')) as { hiddenGroups: number })
      .hiddenGroups
    expect(await run('ayar', '--k', '60')).toMatch(/k-anonimlik eşiği \(--k\): 60/)
    expect(JSON.parse(readFileSync(join(labDir, 'ayar.json'), 'utf8'))).toMatchObject({ kAnonim: 60 })
    const strict = JSON.parse(await line('sorgu kullanici --grup sehir --olc n,kisi --json')) as {
      hiddenGroups: number
      rows: { values: number[] }[]
    }
    expect(strict.hiddenGroups).toBeGreaterThan(before)
    for (const row of strict.rows) expect(row.values[1]).toBeGreaterThanOrEqual(60)
    expect(await run('durum')).toMatch(/gizlilik: gruplar en az 60 kullanıcı/)
    expect(await run('ayar', '--k', '20')).toMatch(/k-anonimlik eşiği \(--k\): 20/)
  })

  it('her komut denetim günlüğüne bir satır ekler; çıktı dönen metnin aynısıdır', async () => {
    // `run` her çağrıda bunu doğrular; burada açıkça ve farklı çıktı türleriyle bir kez daha
    const n0 = auditLines().length
    expect(n0).toBeGreaterThan(40)
    const text = await run('churn', 'neden')
    const json = await run('churn', '--json')
    const query = await line('sorgu kullanici --grup plan --olc "n,oran(churn)" --nerede "plays>0"')
    const lines = auditLines()
    expect(lines).toHaveLength(n0 + 3)
    const [a, b, c] = lines.slice(-3)
    expect(a).toMatchObject({ komut: `churn neden --lab ${labDir}`, cikti: text, karakter: text.length })
    expect(b).toMatchObject({ komut: `churn --json --lab ${labDir}`, cikti: json, karakter: json.length })
    expect(c.cikti).toBe(query)
    expect(c.komut).toBe(`sorgu kullanici --grup plan --olc n,oran(churn) --nerede plays>0 --lab ${labDir}`)
    for (const l of lines) expect(Date.parse(l.at)).toBeGreaterThan(Date.parse('2020-01-01'))
    // Zaman sırası bozulmaz
    for (let i = 1; i < lines.length; i++) expect(lines[i].at >= lines[i - 1].at).toBe(true)
  })

  it('hata ile biten komutun iletisi de denetim günlüğüne yazılır (ajana giden her metin kayıtta olmalı)', async () => {
    // docs/LAB.md: "Ajana giden her metin → gunluk/ciktilar.ndjson". Hata iletisi de ajana gider (CLI'da stderr, MCP
    // aracında "Hata: …" yanıtı) ve veri taşıyabilir: aşağıdaki ileti sütunun tüm değerlerini — k-anonimlik eşiğinin
    // altındaki şehirler dahil — sayar. Şu an yalnız başarılı komutlar kaydediliyor.
    const before = auditLines().length
    const message = await execute(
      ['sorgu', 'kullanici', '--nerede', 'sehir=yok', '--lab', labDir],
      parseArgs,
      undefined,
      true,
    ).then(
      () => '',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    )
    expect(message).toMatch(/'sehir' sütununda 'yok' değeri yok\. Değerler: /)
    const lines = auditLines()
    expect(lines).toHaveLength(before + 1)
    expect(lines[lines.length - 1].cikti).toContain(message)
    expect(lines[lines.length - 1].komut).toBe(`sorgu kullanici --nerede sehir=yok --lab ${labDir}`)
  })

  it('gunluk: son komutların özeti ve --tam ile çıktıların kendisi', async () => {
    const last = await run('churn', 'tetik', '--limit', '3')
    const out = await run('gunluk', '--son', '4')
    expect(out).toMatch(/^DENETİM GÜNLÜĞÜ · /)
    expect(out).toMatch(/an +komut +karakter/)
    expect(out).toMatch(new RegExp(`churn tetik --limit 3 --lab.* ${last.length}$`, 'm'))
    expect(out.split('\n')).toHaveLength(3 + 4 + 1)
    const full = await run('gunluk', '--tam', '--son', '2')
    expect(full).toContain(last)
    expect(await run('günlük', '--son', '1')).toMatch(/^DENETİM GÜNLÜĞÜ/)
  })
})

describe('komutlarla kurulum: kesif → esleme --kabul → al → kur → churn', () => {
  const dir = join(root, 'lab-akis')
  const small = join(root, 'ham-kucuk', 'kucuk.jsonl')
  const go = (...argv: string[]): Promise<string> => runIn(dir, argv)

  beforeAll(async () => {
    await writeWorld(small, { users: 80, days: 45, seed: 3, end: '2026-11-10' })
  }, 60_000)

  it('her adım sıradakini söyler ve lab adım adım kurulur', async () => {
    const discovery = await go('kesif', small)
    expect(discovery).toMatch(/^Keşif · kucuk\.jsonl · jsonl/)
    expect(discovery).toMatch(/80 kullanıcı/)
    expect(discovery).toContain(`öneri yazıldı: ${join(dir, 'esleme.oneri.json')}`)
    expect(await go('durum')).toMatch(/eşleme: yok · öneri hazır \(esleme\)[\s\S]*sıradaki: esleme/)
    expect(await go('esleme')).toMatch(/^EŞLEME ÖNERİSİ \(henüz kabul edilmedi\)/)
    await expect(go('al', small)).rejects.toThrow(/Eşleme yok/)
    expect(await go('esleme', '--kabul')).toMatch(/^EŞLEME KAYDEDİLDİ · [\s\S]*sıradaki: al <dosya>/)
    expect(existsSync(join(dir, 'esleme.json'))).toBe(true)
    expect(await go('esleme')).toMatch(/^EŞLEME · /)
    expect(await go('durum')).toMatch(/eşleme: var \(18 olay adı, 6 boyut\)[\s\S]*sıradaki: al </)

    const dry = await go('al', small, '--deneme')
    expect(dry).toMatch(/^İÇE ALMA DENEMESİ \(depoya yazılmadı\)/)
    expect(dry).toMatch(/eşlenmeyen olay adları \(en sık\): Settings Opened/)
    expect(readdirSync(join(dir, 'depo'))).toEqual([])
    const real = await go('al', small)
    expect(real).toMatch(/^İÇE ALINDI/)
    expect(real).toMatch(/depo toplamı: \S+ olay · sıradaki: kur/)
    // Deneme ve gerçek içe alma aynı sayıları bildirir
    expect(real.split('\n')[3]).toBe(dry.split('\n')[3])
    expect(await go('durum')).toMatch(/tablolar: kurulmamış[\s\S]*sıradaki: kur/)

    const built = await go('kur')
    expect(built).toMatch(/^KURULDU · 80 kullanıcı · /)
    expect(built).toMatch(/sıradaki: churn$/)
    const status = await go('durum')
    expect(status).toMatch(/tablolar: güncel · 80 kullanıcı/)
    // Gerçek veri yolu: sentetik etiketi yok
    expect(status).not.toMatch(/SENTETİK/)
    expect(status).toMatch(/sıradaki: churn$/)

    const churn = await go('churn')
    expect(churn).toMatch(/^CHURN · 80 kullanıcı · /)
    expect(churn).not.toMatch(/SENTETİK/)
    expect(churn.length).toBeLessThan(6000)
    expect(await go('durum')).toMatch(/sıradaki: churn neden/)

    // Yeni veri gelince tablolar eski sayılır ve durum bunu söyler
    await go('al', small)
    expect(await go('durum')).toMatch(/tablolar: ESKİ \(kur gerekli\)[\s\S]*sıradaki: kur$/)
    // Başarılı her adım sırasıyla günlüğe yazıldı (hata veren tek komut — eşleme yokken `al` — ayrıca kaydedilebilir)
    const succeeded = [
      'kesif',
      'durum',
      'esleme',
      'esleme',
      'esleme',
      'durum',
      'al',
      'al',
      'durum',
      'kur',
      'durum',
      'churn',
      'durum',
      'al',
      'durum',
    ]
    const logged = auditLines(dir).map((l) => l.komut.split(' ')[0])
    expect(logged.length).toBeGreaterThanOrEqual(succeeded.length)
    expect(logged.length).toBeLessThanOrEqual(succeeded.length + 1)
    let at = 0
    for (const cmd of logged) if (cmd === succeeded[at]) at++
    expect(at).toBe(succeeded.length)
  }, 60_000)
})

describe('gizlilik: komut çıktıları', () => {
  it('hiçbir çıktıda ve denetim günlüğünde ham kimlik, e-posta, telefon, IP, ad ya da takma kimlik yok', () => {
    const raw = readFileSync(worldPath, 'utf8') + readFileSync(join(root, 'ham-kucuk', 'kucuk.jsonl'), 'utf8')
    const values = (re: RegExp): Set<string> => new Set([...raw.matchAll(re)].map((m) => m[1]))
    const ids = values(/"distinct_id":"([^"]+)"/g)
    const emails = values(/"\$email":"([^"]+)"/g)
    const phones = values(/"msisdn":"([^"]+)"/g)
    const ips = values(/"\$ip":"([^"]+)"/g)
    const names = values(/"\$name":"([^"]+)"/g)
    expect(ids.size).toBe(480)
    for (const set of [emails, phones, ips, names]) expect(set.size).toBeGreaterThan(50)
    const logs = [labDir, join(root, 'lab-akis'), join(root, 'bos-lab')].map((d) => readFileSync(auditFile(d), 'utf8'))
    expect(outputs.length).toBeGreaterThan(60)
    const pseudonyms = new Set<string>()
    for (let u = 0; u < users.rows; u++)
      for (const v of [users.cols.uid_hi[u], users.cols.uid_lo[u]]) if (v >= 1e6) pseudonyms.add(String(v))
    for (const text of [...outputs, ...logs]) {
      // Kalıplar
      expect(text).not.toMatch(/sentetik-\d+-[0-9a-f]{12}/)
      expect(text).not.toMatch(/@ornek-posta|Soyad\d|msisdn/)
      // Değerlerin kendisi
      for (const m of text.matchAll(/[\w.+-]+@[\w.-]+/g)) expect(emails.has(m[0]), m[0]).toBe(false)
      for (const m of text.matchAll(/\d{7,}/g)) {
        expect(phones.has(m[0]), `telefon ${m[0]}`).toBe(false)
        expect(pseudonyms.has(m[0]), `takma kimlik ${m[0]}`).toBe(false)
      }
      for (const m of text.matchAll(/\d+\.\d+\.\d+\.\d+/g)) expect(ips.has(m[0]), `IP ${m[0]}`).toBe(false)
      for (const m of text.matchAll(/Ad\d+ Soyad\d+/g)) expect(names.has(m[0]), m[0]).toBe(false)
    }
    // Kimlikler toplu aranır: hiçbir çıktı satırı bir ham kimlik içermez
    const all = [...outputs, ...logs].join('\n')
    for (const id of ids) if (all.includes(id)) throw new Error(`ham kimlik çıktıda: ${id}`)
  })

  it('komutların yazdığı dosyalarda da yok (öneri, eşleme, depo, tablolar, sonuçlar, günlük)', () => {
    // Komutlarla kurulan lab: kesif önerisi ve kabul edilen eşleme de dahil
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      )
    const files = [labDir, join(root, 'lab-akis')].flatMap(walk)
    const names = new Set(files.map((f) => f.slice(f.lastIndexOf('/') + 1)))
    for (const must of [
      'esleme.oneri.json',
      'esleme.json',
      'alim.json',
      'sozluk.json',
      'meta.json',
      'durum.json',
      'churn.json',
      'ciktilar.ndjson',
    ])
      expect(names.has(must), must).toBe(true)
    const leaks: string[] = []
    for (const f of files) {
      const bytes = readFileSync(f)
      // Her ham kimlik 'sentetik-' ile başlar; e-posta alan adı ve soyad kalıbı da değerlerin ortak parçasıdır
      for (const marker of ['sentetik-', 'ornek-posta', 'Soyad', 'msisdn', '$email'])
        if (bytes.includes(marker)) leaks.push(`${f.slice(root.length + 1)}: '${marker}'`)
      if (/\.(json|ndjson)$/.test(f) && /90532\d{7}|\b10\.\d{1,3}\.\d{1,3}\.7\b/.test(bytes.toString('utf8')))
        leaks.push(`${f.slice(root.length + 1)}: telefon ya da IP kalıbı`)
    }
    expect(leaks).toEqual([])
  })
})
