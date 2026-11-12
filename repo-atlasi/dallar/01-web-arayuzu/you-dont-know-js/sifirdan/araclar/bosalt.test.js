import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { bosalt } from './bosalt.js'

const koanlar = fileURLToPath(new URL('../koanlar/', import.meta.url))

test('bosalt: iç içe parantez, dize ve şablon içindeki parantezleri doğru atlar', () => {
  const kaynak = "assert.equal(f(1), __(g('(', `)${h(2)}`)))\n// yorumdaki __(x) kalır\nconst s = '__(dize)'"
  assert.equal(bosalt(kaynak), "assert.equal(f(1), __())\n// yorumdaki __(x) kalır\nconst s = '__(dize)'")
})

test('her koan dosyasının boş hâli sözdizimsel olarak geçerli ve gerçekten boş', () => {
  for (const ad of readdirSync(koanlar).filter((a) => a.endsWith('.test.js'))) {
    const bos = bosalt(readFileSync(join(koanlar, ad), 'utf8'))
    assert.doesNotMatch(bos, /__\([^)]/, `${ad} içinde dolu boşluk kaldı`)
    const gecici = mkdtempSync(join(tmpdir(), 'koan-'))
    try {
      const dosya = join(gecici, ad.replace(/\.js$/, '.mjs'))
      writeFileSync(dosya, bos)
      const sonuc = spawnSync(process.execPath, ['--check', dosya], { encoding: 'utf8' })
      assert.equal(sonuc.status, 0, `${ad}: ${sonuc.stderr}`)
    } finally {
      rmSync(gecici, { recursive: true, force: true })
    }
  }
})

test('boşaltılmış bir koan kırmızı yanar (öğrenci doldurana kadar)', () => {
  const gecici = mkdtempSync(join(tmpdir(), 'koan-'))
  try {
    cpSync(koanlar, gecici, { recursive: true })
    writeFileSync(join(gecici, 'package.json'), '{"type":"module"}')
    const hedef = join(gecici, '02_this.test.js')
    writeFileSync(hedef, bosalt(readFileSync(hedef, 'utf8')))
    // Test çalıştırıcısı alt süreçlere NODE_TEST_CONTEXT verir; iç içe `node --test` bağımsız koşsun diye çıkarılır.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT'))
    const sonuc = spawnSync(process.execPath, ['--test', hedef], { encoding: 'utf8', env })
    assert.notEqual(sonuc.status, 0)
    assert.match(sonuc.stdout, /# fail [1-9]/)
  } finally {
    rmSync(gecici, { recursive: true, force: true })
  }
})
