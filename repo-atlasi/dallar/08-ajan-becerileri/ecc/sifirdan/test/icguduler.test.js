import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { VARSAYILAN, baglamMetni, sec } from '../icguduler.js'

const KLASOR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const icguduler = JSON.parse(readFileSync(path.join(KLASOR, 'kaynak', 'icguduler.json'), 'utf8'))

describe('içgüdü seçimi', () => {
  it('eşik altını ve başka projenin kuralını atar', () => {
    const idler = sec(icguduler, { proje: 'ornek-proje' }).map((i) => i.id)
    assert.ok(!idler.includes('zayif-sezgi'))
    assert.ok(!idler.includes('baska-proje-kurali'))
    assert.ok(idler.includes('ornek-proje-db'))
  })

  it('proje ve yığın artışı sıralamayı değiştirir', () => {
    const yiginsiz = sec(icguduler, { proje: 'ornek-proje' }).map((i) => i.id)
    assert.deepEqual(yiginsiz, ['react-key', 'kisa-commit-basligi', 'ornek-proje-db', 'pytest-fixture'])
    const python = sec(icguduler, { proje: 'ornek-proje', yigin: ['python'], projeArtisi: 0 }).map((i) => i.id)
    assert.deepEqual(python, ['react-key', 'kisa-commit-basligi', 'pytest-fixture', 'ornek-proje-db'])
  })

  it('en fazla N içgüdü ve karakter sınırı', () => {
    assert.equal(sec(icguduler, { proje: 'ornek-proje', enFazla: 2 }).length, 2)
    assert.equal(VARSAYILAN.enFazla, 6)
    const metin = baglamMetni(sec(icguduler, { proje: 'ornek-proje' }), 60)
    assert.ok(metin.length <= 60)
    assert.match(metin, /\[kesildi\]/)
  })
})
