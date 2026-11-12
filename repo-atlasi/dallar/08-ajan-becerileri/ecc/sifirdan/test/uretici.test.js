import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  ADAPTORLER,
  CakismaHatasi,
  KaynakHatasi,
  kaynagiDogrula,
  kaynagiYukle,
  planla,
  tasinabilirYap,
} from '../uretici.js'

const KLASOR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const kaynak = () => kaynagiYukle(path.join(KLASOR, 'kaynak.json'))
const icerik = (plan, yol) => plan.islemler.find((i) => i.yol === yol)?.icerik

describe('kaynak doğrulama', () => {
  it('örnek kaynak geçerli', () => {
    assert.equal(kaynak().beceriler.length, 3)
  })

  it('hataları toplar', () => {
    const hatalar = kaynagiDogrula(
      {
        proje: 'Kotu Ad',
        surum: '1.0',
        kurallar: [],
        beceriler: [
          { ad: 'a', aciklama: '<b>', govde: '../disari.md' },
          { ad: 'a', aciklama: 'x', govde: 'kaynak.json', kullanici_cagirir: 'evet' },
        ],
        hedefler: ['vim'],
      },
      KLASOR,
    )
    const metin = hatalar.join('\n')
    for (const parca of [
      'proje adı',
      'surum',
      'en az bir kural',
      'iki kez',
      '< >',
      'gövde dosyası yok',
      'true/false',
      'bilinmeyen hedef',
    ]) {
      assert.match(metin, new RegExp(parca.replace(/[<>]/g, '.')), parca)
    }
  })

  it('geçersiz kaynak yüklenmez', () => {
    const td = mkdtempSync(path.join(os.tmpdir(), 'kaynak-'))
    try {
      writeFileSync(path.join(td, 'kaynak.json'), JSON.stringify({ proje: 'x', surum: '1', kurallar: [] }))
      assert.throws(() => kaynagiYukle(path.join(td, 'kaynak.json')), KaynakHatasi)
    } finally {
      rmSync(td, { recursive: true, force: true })
    }
  })
})

describe('adaptörler', () => {
  it('her hedef beklenen dosyaları üretir', () => {
    const plan = planla(kaynak())
    const yollar = plan.islemler.map((i) => i.yol)
    for (const yol of [
      'CLAUDE.md',
      'AGENTS.md',
      'GEMINI.md',
      'gemini-extension.json',
      '.claude/skills/surum-notu/SKILL.md',
      '.agents/skills/surum-notu/agents/openai.yaml',
      '.cursor/rules/ornek-proje.mdc',
      '.claude-plugin/plugin.json',
      'skills/commit-mesaji/SKILL.md',
    ]) {
      assert.ok(yollar.includes(yol), yol)
    }
    assert.deepEqual(yollar, [...yollar].sort(), 'plan yola göre sıralı')
    assert.equal(Object.keys(ADAPTORLER).length, 5)
  })

  it('kullanıcı-çağırır bilgisi her harness’e kendi biçiminde gider', () => {
    const plan = planla(kaynak())
    assert.match(icerik(plan, '.claude/skills/surum-notu/SKILL.md'), /^disable-model-invocation: true$/m)
    assert.match(icerik(plan, '.claude/skills/surum-notu/SKILL.md'), /^argument-hint: "Sürüm etiketi/m)
    const codexSkill = icerik(plan, '.agents/skills/surum-notu/SKILL.md')
    assert.doesNotMatch(codexSkill, /disable-model-invocation|argument-hint/)
    assert.match(icerik(plan, '.agents/skills/surum-notu/agents/openai.yaml'), /allow_implicit_invocation: false/)
    assert.doesNotMatch(icerik(plan, '.agents/skills/commit-mesaji/agents/openai.yaml'), /policy/)
  })

  it('eklenti bildirimi ECC notlarına uyar', () => {
    const eklenti = JSON.parse(icerik(planla(kaynak()), '.claude-plugin/plugin.json'))
    assert.equal(eklenti.version, '1.2.0')
    assert.ok(Array.isArray(eklenti.skills))
    assert.equal(eklenti.agents, undefined)
    assert.equal(eklenti.hooks, undefined)
  })

  it('cursor ve gemini biçimleri', () => {
    const plan = planla(kaynak(), ['cursor', 'gemini'])
    assert.match(icerik(plan, '.cursor/rules/ornek-proje.mdc'), /^alwaysApply: true$/m)
    assert.match(icerik(plan, '.cursor/rules/commit-mesaji.mdc'), /^alwaysApply: false$/m)
    assert.equal(JSON.parse(icerik(plan, 'gemini-extension.json')).contextFileName, 'GEMINI.md')
    const gemini = icerik(plan, 'GEMINI.md')
    assert.match(gemini, /### commit-mesaji/)
    assert.doesNotMatch(gemini, /### surum-notu/, 'kullanıcı-çağırır beceri talimat dosyasına gömülmez')
  })

  it('aynı kaynak her seferinde aynı planı verir', () => {
    assert.deepEqual(planla(kaynak()), planla(kaynak()))
  })
})

describe('taşınabilirlik dönüşümü', () => {
  it('yalnızca kabuk bloklarındaki Claude değişkenlerini dönüştürür', () => {
    const uyarilar = []
    const metin =
      'Düz yazı ${CLAUDE_PROJECT_DIR}\n```bash\ncd "${CLAUDE_PROJECT_DIR}" && ./x $ARGUMENTS\n```\n```js\n// ${CLAUDE_PROJECT_DIR}\n```'
    const sonuc = tasinabilirYap(metin, 'codex', 'b', uyarilar)
    assert.match(sonuc, /cd "\$\(pwd\)"/)
    assert.match(sonuc, /^Düz yazı \$\{CLAUDE_PROJECT_DIR\}$/m)
    assert.match(sonuc, /\/\/ \$\{CLAUDE_PROJECT_DIR\}/)
    assert.deepEqual(uyarilar, ['codex/b: $ARGUMENTS bu hedefte karşılıksız kalır'])
  })

  it('codex kopyası dönüşür, claude kopyası olduğu gibi kalır', () => {
    const plan = planla(kaynak())
    assert.match(icerik(plan, '.claude/skills/gelistirme-sunucusu/SKILL.md'), /\$\{CLAUDE_PROJECT_DIR\}/)
    assert.match(icerik(plan, '.agents/skills/gelistirme-sunucusu/SKILL.md'), /cd "\$\(pwd\)"/)
  })
})

describe('çakışma', () => {
  it('iki hedef aynı yola farklı içerik yazarsa hata; aynı içerik tekilleşir', () => {
    const k = kaynak()
    const ikiz = { ...ADAPTORLER, ikiz: { uret: (x, u) => ADAPTORLER.claude.uret(x, u) } }
    assert.equal(planla(k, ['claude', 'ikiz'], ikiz).islemler.length, planla(k, ['claude']).islemler.length)
    const kavgaci = { ...ADAPTORLER, kavgaci: { uret: () => [{ yol: 'CLAUDE.md', icerik: 'farklı\n' }] } }
    assert.throws(() => planla(k, ['claude', 'kavgaci'], kavgaci), CakismaHatasi)
  })
})
