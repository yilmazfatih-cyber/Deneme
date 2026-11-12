import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { DURUM_DOSYASI, KurulumHatasi, denetle, guvenliYol, kaldir, uygula } from '../kurulum.js'
import { kaynagiYukle, planla } from '../uretici.js'

const KLASOR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const kaynak = () => kaynagiYukle(path.join(KLASOR, 'kaynak.json'))

let kok
beforeEach(() => {
  kok = mkdtempSync(path.join(os.tmpdir(), 'kurulum-'))
})
afterEach(() => {
  rmSync(kok, { recursive: true, force: true })
})

describe('uygula', () => {
  it('ilk kurulum her şeyi yazar, ikincisi hiçbir şeye dokunmaz', () => {
    const plan = planla(kaynak())
    const ilk = uygula(plan, kok)
    assert.equal(ilk.yazilan.length, plan.islemler.length)
    const durum = JSON.parse(readFileSync(path.join(kok, DURUM_DOSYASI), 'utf8'))
    assert.equal(Object.keys(durum.dosyalar).length, plan.islemler.length)
    const ikinci = uygula(plan, kok)
    assert.equal(ikinci.yazilan.length, 0)
    assert.equal(ikinci.ayni.length, plan.islemler.length)
  })

  it('kullanıcının kendi dosyasına dokunmaz', () => {
    writeFileSync(path.join(kok, 'CLAUDE.md'), '# Benim notlarım\n')
    const rapor = uygula(planla(kaynak(), ['claude']), kok)
    assert.deepEqual(rapor.atlanan, [{ yol: 'CLAUDE.md', neden: 'kullanıcının dosyası (sahibi biz değiliz)' }])
    assert.equal(readFileSync(path.join(kok, 'CLAUDE.md'), 'utf8'), '# Benim notlarım\n')
    const zorla = uygula(planla(kaynak(), ['claude']), kok, { zorla: true })
    assert.ok(zorla.yazilan.includes('CLAUDE.md'))
  })

  it('elle değiştirilmiş dosyayı korur ama sahipliği bırakmaz', () => {
    uygula(planla(kaynak(), ['codex']), kok)
    writeFileSync(path.join(kok, 'AGENTS.md'), '# Elle düzenlendi\n')
    const rapor = uygula(planla(kaynak(), ['codex']), kok)
    assert.deepEqual(
      rapor.atlanan.map((a) => a.neden),
      ['kurulumdan sonra elle değiştirilmiş'],
    )
    assert.equal(denetle(planla(kaynak(), ['codex']), kok).elle_degismis[0], 'AGENTS.md')
  })

  it('artık üretilmeyen dosyaları siler, boş klasörleri temizler', () => {
    const k = kaynak()
    uygula(planla(k, ['claude']), kok)
    k.beceriler = k.beceriler.filter((b) => b.ad !== 'surum-notu')
    const rapor = uygula(planla(k, ['claude']), kok)
    assert.deepEqual(rapor.silinen, ['.claude/skills/surum-notu/SKILL.md'])
    assert.equal(existsSync(path.join(kok, '.claude/skills/surum-notu')), false)
    assert.ok(rapor.yazilan.includes('CLAUDE.md'), 'beceri listesi değiştiği için CLAUDE.md güncellenir')
  })
})

describe('denetle', () => {
  it('eksik, eski, sahipsiz ve yetim dosyaları ayırır', () => {
    const k = kaynak()
    assert.equal(denetle(planla(k, ['gemini']), kok).eksik.length, 2)
    uygula(planla(k, ['gemini', 'cursor']), kok)
    assert.equal(denetle(planla(k, ['gemini', 'cursor']), kok).tamam.length, 6)
    k.kurallar.push({ baslik: 'Yeni kural', metin: 'Kaynakta değişti.' })
    const sonuc = denetle(planla(k, ['gemini']), kok)
    assert.deepEqual(sonuc.eski, ['GEMINI.md'])
    assert.deepEqual(sonuc.yetim.sort(), [
      '.cursor/rules/commit-mesaji.mdc',
      '.cursor/rules/gelistirme-sunucusu.mdc',
      '.cursor/rules/ornek-proje.mdc',
      '.cursor/rules/surum-notu.mdc',
    ])
    writeFileSync(path.join(kok, 'AGENTS.md'), 'kullanıcının\n')
    assert.deepEqual(denetle(planla(k, ['codex']), kok).sahipsiz, ['AGENTS.md'])
  })
})

describe('kaldır', () => {
  it('yalnızca kendi ve değişmemiş dosyalarını siler', () => {
    writeFileSync(path.join(kok, 'notlar.txt'), 'kullanıcının\n')
    uygula(planla(kaynak(), ['claude', 'gemini']), kok)
    writeFileSync(path.join(kok, 'GEMINI.md'), 'elle değişti\n')
    const rapor = kaldir(kok)
    assert.deepEqual(rapor.korunan, ['GEMINI.md'])
    assert.ok(rapor.silinen.includes('CLAUDE.md'))
    assert.equal(existsSync(path.join(kok, '.claude')), false)
    assert.equal(existsSync(path.join(kok, 'notlar.txt')), true)
    assert.equal(existsSync(path.join(kok, DURUM_DOSYASI)), false)
  })
})

describe('güvenli yol', () => {
  it('kök dışına çıkan ve mutlak yolları reddeder', () => {
    for (const yol of ['../disari.md', '/etc/passwd', 'a/../../b', 'a//b']) {
      assert.throws(() => guvenliYol(kok, yol), KurulumHatasi, yol)
    }
    assert.equal(guvenliYol(kok, 'a/b.md'), path.join(kok, 'a', 'b.md'))
  })

  it('sembolik bağlantı üzerinden yazmaz', () => {
    const disari = mkdtempSync(path.join(os.tmpdir(), 'disari-'))
    try {
      symlinkSync(disari, path.join(kok, '.claude'))
      assert.throws(() => uygula(planla(kaynak(), ['claude']), kok), KurulumHatasi)
      assert.equal(existsSync(path.join(disari, 'skills')), false)
    } finally {
      rmSync(disari, { recursive: true, force: true })
    }
  })
})
