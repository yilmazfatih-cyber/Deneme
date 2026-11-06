import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProfileStore, stems } from '../src/profile/store.js'

const NOW = Date.UTC(2026, 10, 2, 9, 0) // 2 Kasım 2026 12:00 İstanbul
let dir: string
let store: ProfileStore

const write = (name: string, body: string) => fs.writeFileSync(path.join(dir, name), body)

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profil-'))
  store = new ProfileStore(dir, () => NOW)
  write('temel.md', "# Temel\nAdım Fatih. İstanbul Kadıköy'de yaşıyorum.\n")
  write(
    'aile.md',
    "# Aile\n\n## Kardeşler\nKız kardeşim Ayşe Ankara'da yaşıyor. Doğum günü 14 Mart.\n\n## Anne\nAnnemin adı Fatma.\n",
  )
  write(
    'saglik.md',
    '# Sağlık\n\n## İlaçlar\nSabah 08:00 tansiyon ilacı, akşam 21:00 vitamin.\n\n## Doktorlar\nDr. Kaya, kardiyoloji.\n',
  )
})

describe('stems', () => {
  it('drops stop words and cuts agglutinated words to a 5-letter stem', () => {
    expect(stems('Annemin adı ne?')).toEqual(['annem', 'adi'])
    expect(stems('İlaçlarım ve doktorum')).toEqual(['ilacl', 'dokto'])
  })
})

describe('ProfileStore.contextFor', () => {
  it('returns nothing for an empty folder', () => {
    const empty = new ProfileStore(path.join(dir, 'yok'), () => NOW)
    expect(empty.contextFor('merhaba')).toBe('')
  })

  it('always includes temel.md, even for an unrelated question', () => {
    const ctx = store.contextFor('hava nasıl')
    expect(ctx).toContain('Adım Fatih')
    expect(ctx).not.toContain('Fatma')
  })

  it('selects only the chunk that matches the question', () => {
    const ctx = store.contextFor('Annemin adı ne?')
    expect(ctx).toContain('Annemin adı Fatma')
    expect(ctx).not.toContain('tansiyon')
    expect(ctx).not.toContain('Ayşe')
  })

  it('matches inflected words and boosts heading matches', () => {
    const ctx = store.contextFor('ilaçlarımı hangi saatte alıyorum')
    expect(ctx).toContain('tansiyon ilacı')
    expect(ctx).toContain('İlaçlar')
  })

  it('labels chunks with file and heading, and frames the block as data', () => {
    const ctx = store.contextFor('kardeşim')
    expect(ctx).toContain('[aile › Aile › Kardeşler]')
    expect(ctx).toMatch(/talimat/i)
  })

  it('respects the character budget', () => {
    write('uzun.md', '# Uzun\n\n## Konu\n' + 'kedi köpek kuş '.repeat(200))
    const ctx = store.contextFor('kedi köpek', 600)
    expect(ctx.length).toBeLessThan(900) // budget + the two framing lines
  })

  it('picks up edits made while the bot is running', () => {
    expect(store.contextFor('araba plakası')).not.toContain('34 ABC')
    write('arac.md', '# Araç\n\n## Plaka\nAraba plakam 34 ABC 123.\n')
    expect(store.contextFor('araba plakası')).toContain('34 ABC 123')
  })

  it('adds events of the next 7 days from takvim.json', () => {
    write(
      'takvim.json',
      JSON.stringify([
        { start: '2026-11-04T14:30', title: 'Diş randevusu', location: 'Kadıköy' },
        { start: '2026-11-20T10:00', title: 'Çok uzak' },
        { start: '2026-11-01T09:00', title: 'Geçmiş' },
      ]),
    )
    const ctx = store.contextFor('merhaba')
    expect(ctx).toContain('2026-11-04 14:30 Diş randevusu (Kadıköy)')
    expect(ctx).not.toContain('Çok uzak')
    expect(ctx).not.toContain('Geçmiş')
  })

  it('ignores a broken events file', () => {
    write('takvim.json', '{bozuk')
    expect(() => store.contextFor('merhaba')).not.toThrow()
  })
})

describe('notes (/hatirla, /unut)', () => {
  it('appends dated notes and lists them', () => {
    expect(store.addNote('Park yeri B2 katında')).toEqual({ ok: true, n: 1 })
    expect(store.addNote('Wi-Fi adı EvAğı')).toEqual({ ok: true, n: 2 })
    const notes = store.listNotes()
    expect(notes[0]).toMatch(/^2 Kasım 2026 Pazartesi: Park yeri B2 katında$/)
    expect(store.contextFor('park yeri neredeydi')).toContain('B2 katında')
  })

  it('refuses sensitive text and does not write it', () => {
    const r = store.addNote('TC kimlik no 10000000146')
    expect(r).toMatchObject({ ok: false, kind: 'tckn' })
    expect(store.listNotes()).toEqual([])
    expect(fs.existsSync(path.join(dir, 'hatirla.md'))).toBe(false)
    expect(store.addNote('şifrem: Kedi1234!')).toMatchObject({ ok: false, kind: 'secret' })
  })

  it('removes a note by number and keeps a copy', () => {
    store.addNote('bir')
    store.addNote('iki')
    store.addNote('üç')
    expect(store.removeNote(2)).toMatch(/iki$/)
    expect(store.listNotes().map((n) => n.split(': ')[1])).toEqual(['bir', 'üç'])
    expect(fs.readFileSync(path.join(dir, '.silinenler.txt'), 'utf8')).toContain('iki')
    expect(store.removeNote(9)).toBeUndefined()
  })
})

describe('stats', () => {
  it('counts files, chunks, notes and events', () => {
    store.addNote('deneme')
    const s = store.stats()
    expect(s.files.map((f) => f.name)).toEqual(
      expect.arrayContaining(['temel.md', 'aile.md', 'saglik.md', 'hatirla.md']),
    )
    expect(s.notes).toBe(1)
    expect(s.totalChars).toBeGreaterThan(100)
  })
})
