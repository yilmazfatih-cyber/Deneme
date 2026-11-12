import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { ana } from '../cli.js'

function calistir(...arg) {
  const cikti = []
  const kod = ana(arg, (s) => cikti.push(s))
  return { kod, metin: cikti.join('\n') }
}

describe('cli', () => {
  it('plan, uygula, denetle, kaldır döngüsü', () => {
    const kok = mkdtempSync(path.join(os.tmpdir(), 'cli-'))
    try {
      const plan = calistir('plan', '--hedefler', 'codex')
      assert.match(plan.metin, /AGENTS\.md/)
      assert.doesNotMatch(plan.metin, /uyarı/, '${CLAUDE_PROJECT_DIR} dönüştürülebildiği için uyarı yok')
      assert.equal(calistir('uygula', '--cikti', kok).kod, 0)
      assert.equal(calistir('denetle', '--cikti', kok).kod, 0)
      writeFileSync(path.join(kok, 'GEMINI.md'), 'elle\n')
      const denetim = calistir('denetle', '--cikti', kok)
      assert.equal(denetim.kod, 1)
      assert.deepEqual(JSON.parse(denetim.metin).elle_degismis, ['GEMINI.md'])
      assert.deepEqual(JSON.parse(calistir('kaldir', '--cikti', kok).metin).korunan, ['GEMINI.md'])
    } finally {
      rmSync(kok, { recursive: true, force: true })
    }
  })

  it('içgüdü metni ve hatalı komut', () => {
    assert.match(calistir('icgudu', '--yigin', 'python').metin, /Öğrenilmiş içgüdüler/)
    assert.throws(() => calistir('yok'), /bilinmeyen komut/)
    assert.throws(() => calistir('uygula'), /--cikti/)
  })
})
