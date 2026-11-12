// Tek doğruluk kaynağından (kaynak.json) birden çok harness'in yapılandırma dosyalarını üretir.
//
// ECC (affaan-m/ECC, d2ef268) aynı içeriği 16 hedefe kurar: scripts/lib/install-targets/ altında her
// hedef için bir "adaptör" vardır (registry.js) ve kurulum önce bir işlem planı çıkarır, sonra uygular.
// Bu dosya o fikrin küçük bir modelidir: kaynak → adaptörler → plan (yol + içerik + özet).
// Diske yazma işi kurulum.js'tedir; burada hiçbir dosya yazılmaz.
//
// Ürettiğimiz dosya biçimleri klonlarda gördüklerimizdir:
//   claude          CLAUDE.md, .claude/skills/<ad>/SKILL.md              (ECC claude-project hedefi)
//   claude-eklenti  .claude-plugin/plugin.json + marketplace.json, skills/<ad>/SKILL.md
//   codex           AGENTS.md, .agents/skills/<ad>/SKILL.md + agents/openai.yaml (ECC, mattpocock)
//   cursor          .cursor/rules/*.mdc (description, alwaysApply)        (karpathy-skills, ECC)
//   gemini          GEMINI.md + gemini-extension.json (contextFileName)   (superpowers)

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const AD = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SURUM = /^\d+\.\d+\.\d+$/
const KABUK_DILLERI = new Set(['bash', 'sh', 'zsh', 'shell'])
// Claude Code'un yerine koyduğu değişkenler; diğer harness'ler bunları olduğu gibi bırakır
// (ECC scripts/ci/validate-skill-host-compat.js). Yalnızca proje dizininin taşınabilir bir karşılığı var.
const CLAUDE_DEGISKENI =
  /\$\{?(CLAUDE_SESSION_ID|CLAUDE_SKILL_DIR|CLAUDE_PLUGIN_ROOT|CLAUDE_PROJECT_DIR|ARGUMENTS)\b\}?/g

export class KaynakHatasi extends Error {}
export class CakismaHatasi extends Error {}

/** @param {string} metin */
export function ozet(metin) {
  return createHash('sha256').update(metin, 'utf8').digest('hex')
}

/**
 * kaynak.json'u okur, doğrular ve beceri gövdelerini yükler.
 * @param {string} dosya
 */
export function kaynagiYukle(dosya) {
  const kok = path.dirname(path.resolve(dosya))
  const kaynak = JSON.parse(readFileSync(dosya, 'utf8'))
  const hatalar = kaynagiDogrula(kaynak, kok)
  if (hatalar.length) throw new KaynakHatasi(hatalar.join('\n'))
  for (const beceri of kaynak.beceriler) {
    beceri.metin = readFileSync(path.join(kok, beceri.govde), 'utf8')
  }
  return kaynak
}

/**
 * @param {any} kaynak
 * @param {string} kok kaynak.json'un klasörü (gövde yolları buna göredir)
 * @returns {string[]} hata listesi
 */
export function kaynagiDogrula(kaynak, kok) {
  const hatalar = []
  if (!AD.test(kaynak.proje ?? '')) hatalar.push(`proje adı kebab-case olmalı: ${kaynak.proje}`)
  if (!SURUM.test(kaynak.surum ?? '')) hatalar.push(`surum x.y.z biçiminde olmalı: ${kaynak.surum}`)
  if (!Array.isArray(kaynak.kurallar) || kaynak.kurallar.length === 0) hatalar.push('en az bir kural gerekli')
  const adlar = new Set()
  for (const beceri of kaynak.beceriler ?? []) {
    const ad = beceri.ad ?? ''
    if (!AD.test(ad) || ad.length > 64) hatalar.push(`beceri adı geçersiz: ${ad}`)
    if (adlar.has(ad)) hatalar.push(`beceri adı iki kez kullanılmış: ${ad}`)
    adlar.add(ad)
    const aciklama = beceri.aciklama ?? ''
    if (!aciklama || aciklama.length > 1024 || /[<>]/.test(aciklama)) {
      hatalar.push(`${ad}: açıklama boş, 1024 karakterden uzun ya da < > içeriyor`)
    }
    const govde = path.resolve(kok, beceri.govde ?? '')
    if (!govde.startsWith(kok + path.sep) || !existsSync(govde))
      hatalar.push(`${ad}: gövde dosyası yok: ${beceri.govde}`)
    if ('kullanici_cagirir' in beceri && typeof beceri.kullanici_cagirir !== 'boolean') {
      hatalar.push(`${ad}: kullanici_cagirir true/false olmalı`)
    }
  }
  for (const hedef of kaynak.hedefler ?? []) {
    if (!(hedef in ADAPTORLER)) hatalar.push(`bilinmeyen hedef: ${hedef}`)
  }
  return hatalar
}

// --- yardımcı biçimlendiriciler ------------------------------------------------------------------

/** YAML ön bilgisi: JSON dizgileri geçerli YAML çift tırnaklı değerleridir, ': ' sorununu önler. */
function onbilgi(alanlar) {
  const satirlar = Object.entries(alanlar)
    .filter(([, deger]) => deger !== undefined)
    .map(([anahtar, deger]) => `${anahtar}: ${typeof deger === 'string' ? JSON.stringify(deger) : deger}`)
  return `---\n${satirlar.join('\n')}\n---\n`
}

function json(nesne) {
  return JSON.stringify(nesne, null, 2) + '\n'
}

function talimatDosyasi(kaynak, baslik, ekler = []) {
  const kurallar = kaynak.kurallar.map((k) => `- **${k.baslik}:** ${k.metin}`).join('\n')
  return [
    `# ${kaynak.proje} — ${baslik}`,
    '',
    `> Bu dosya kaynak.json dosyasından üretildi (sürüm ${kaynak.surum}). Elle düzenleme; kaynağı değiştirip yeniden üret.`,
    '',
    '## Kurallar',
    '',
    kurallar,
    '',
    ...ekler,
  ]
    .join('\n')
    .replace(/\n*$/, '\n')
}

function becerilerBolumu(kaynak, konum) {
  const satirlar = kaynak.beceriler.map(
    (b) => `- \`${b.ad}\`${b.kullanici_cagirir ? ' (yalnızca kullanıcı çağırır)' : ''}: ${b.aciklama}`,
  )
  return ['## Beceriler', '', `Beceriler \`${konum}\` altında.`, '', ...satirlar, '']
}

/**
 * Claude Code dışındaki hedefler için kabuk bloklarındaki Claude değişkenlerini dönüştürür.
 * ${CLAUDE_PROJECT_DIR} → $(pwd); karşılığı olmayanlar için uyarı üretir.
 */
export function tasinabilirYap(metin, hedef, ad, uyarilar) {
  let blokDili = null
  return metin
    .split('\n')
    .map((satir) => {
      const cit = satir.trim().match(/^(```|~~~)\s*([A-Za-z0-9_+-]*)/)
      if (cit) {
        blokDili = blokDili === null ? cit[2].toLowerCase() : null
        return satir
      }
      if (blokDili === null || !KABUK_DILLERI.has(blokDili)) return satir
      return satir.replace(CLAUDE_DEGISKENI, (eslesme, degisken) => {
        if (degisken === 'CLAUDE_PROJECT_DIR') return '$(pwd)'
        uyarilar.push(`${hedef}/${ad}: ${eslesme} bu hedefte karşılıksız kalır`)
        return eslesme
      })
    })
    .join('\n')
}

function kisaAciklama(beceri) {
  if (beceri.kisa_aciklama) return beceri.kisa_aciklama
  const ilkCumle = beceri.aciklama.split(/(?<=\.)\s/)[0]
  return ilkCumle.length <= 80 ? ilkCumle : ilkCumle.slice(0, 77) + '...'
}

function claudeSkill(beceri, metin = beceri.metin) {
  return (
    onbilgi({
      name: beceri.ad,
      description: beceri.aciklama,
      'disable-model-invocation': beceri.kullanici_cagirir ? true : undefined,
      'argument-hint': beceri.kullanici_cagirir ? beceri.arguman_ipucu : undefined,
    }) +
    '\n' +
    metin
  )
}

// --- adaptörler ----------------------------------------------------------------------------------
// Her adaptör (kaynak, uyarilar) alır ve [{ yol, icerik }] döndürür. ECC'deki createInstallTargetAdapter
// fabrikasının karşılığıdır: kimlik + kök + işlem planlayıcısı.

function adaptor(id, aciklama, uret) {
  return Object.freeze({ id, aciklama, uret })
}

export const ADAPTORLER = Object.freeze({
  claude: adaptor('claude', 'Claude Code projesi', (kaynak) => [
    {
      yol: 'CLAUDE.md',
      icerik: talimatDosyasi(kaynak, 'Claude Code talimatları', becerilerBolumu(kaynak, '.claude/skills/')),
    },
    ...kaynak.beceriler.map((b) => ({ yol: `.claude/skills/${b.ad}/SKILL.md`, icerik: claudeSkill(b) })),
  ]),

  // ECC .claude-plugin/PLUGIN_SCHEMA_NOTES.md: version zorunlu, skills bir dizi; agents ve hooks alanı eklenmez.
  'claude-eklenti': adaptor('claude-eklenti', 'Claude Code eklentisi + pazar yeri', (kaynak) => [
    {
      yol: '.claude-plugin/plugin.json',
      icerik: json({
        name: kaynak.proje,
        version: kaynak.surum,
        description: kaynak.aciklama,
        skills: kaynak.beceriler.map((b) => `./skills/${b.ad}`),
      }),
    },
    {
      yol: '.claude-plugin/marketplace.json',
      icerik: json({
        name: `${kaynak.proje}-pazari`,
        owner: { name: kaynak.sahip },
        plugins: [{ name: kaynak.proje, source: './', description: kaynak.aciklama, version: kaynak.surum }],
      }),
    },
    ...kaynak.beceriler.map((b) => ({ yol: `skills/${b.ad}/SKILL.md`, icerik: claudeSkill(b) })),
  ]),

  // Codex kopyalarında ön bilgi izin listesi: name, description, metadata, license, allowed-tools.
  // Kullanıcı-çağırır bilgisi ön bilgiye değil agents/openai.yaml içine gider (mattpocock/skills deseni).
  codex: adaptor('codex', 'Codex ve AGENTS.md okuyan araçlar', (kaynak, uyarilar) => [
    {
      yol: 'AGENTS.md',
      icerik: talimatDosyasi(kaynak, 'ajan talimatları', becerilerBolumu(kaynak, '.agents/skills/')),
    },
    ...kaynak.beceriler.flatMap((b) => {
      const govde = tasinabilirYap(b.metin, 'codex', b.ad, uyarilar)
      const politika = b.kullanici_cagirir ? 'policy:\n  allow_implicit_invocation: false\n' : ''
      return [
        {
          yol: `.agents/skills/${b.ad}/SKILL.md`,
          icerik: onbilgi({ name: b.ad, description: b.aciklama }) + '\n' + govde,
        },
        {
          yol: `.agents/skills/${b.ad}/agents/openai.yaml`,
          icerik:
            'interface:\n' +
            `  display_name: ${JSON.stringify(b.gorunen_ad ?? b.ad)}\n` +
            `  short_description: ${JSON.stringify(kisaAciklama(b))}\n` +
            politika,
        },
      ]
    }),
  ]),

  // Cursor kuralı: description + alwaysApply. Proje kuralları her zaman, beceriler isteğe bağlı yüklenir.
  // alwaysApply:false kuralın tam olarak nasıl seçildiği Cursor'a bağlıdır (doğrulanmadı).
  cursor: adaptor('cursor', 'Cursor proje kuralları', (kaynak, uyarilar) => [
    {
      yol: `.cursor/rules/${kaynak.proje}.mdc`,
      icerik:
        onbilgi({ description: kaynak.aciklama, alwaysApply: true }) +
        '\n' +
        talimatDosyasi(kaynak, 'Cursor kuralları'),
    },
    ...kaynak.beceriler.map((b) => ({
      yol: `.cursor/rules/${b.ad}.mdc`,
      icerik:
        onbilgi({ description: b.aciklama, alwaysApply: false }) +
        '\n' +
        tasinabilirYap(b.metin, 'cursor', b.ad, uyarilar),
    })),
  ]),

  // Talimat dosyası biçimi (superpowers "Shape C"): beceri aracı yoksa gövdeler her oturum bağlama girer.
  gemini: adaptor('gemini', 'Gemini CLI uzantısı', (kaynak, uyarilar) => {
    const govdeler = kaynak.beceriler
      .filter((b) => !b.kullanici_cagirir)
      .flatMap((b) => [
        `### ${b.ad}`,
        '',
        `Ne zaman: ${b.aciklama}`,
        '',
        tasinabilirYap(b.metin, 'gemini', b.ad, uyarilar).trim(),
        '',
      ])
    return [
      { yol: 'GEMINI.md', icerik: talimatDosyasi(kaynak, 'Gemini talimatları', ['## İş akışları', '', ...govdeler]) },
      {
        yol: 'gemini-extension.json',
        icerik: json({
          name: kaynak.proje,
          version: kaynak.surum,
          description: kaynak.aciklama,
          contextFileName: 'GEMINI.md',
        }),
      },
    ]
  }),
})

/**
 * Seçilen hedefler için işlem planı: yola göre sıralı [{ hedef, yol, icerik, sha256 }].
 * Aynı yola farklı içerik yazan iki işlem CakismaHatasi verir (sessizce "sonuncu kazanır" yok).
 */
export function planla(kaynak, hedefler = kaynak.hedefler, adaptorler = ADAPTORLER) {
  const uyarilar = []
  const yollar = new Map()
  for (const id of hedefler) {
    const secilen = adaptorler[id]
    if (!secilen) throw new KaynakHatasi(`bilinmeyen hedef: ${id}`)
    for (const { yol, icerik } of secilen.uret(kaynak, uyarilar)) {
      const islem = { hedef: id, yol, icerik, sha256: ozet(icerik) }
      const onceki = yollar.get(yol)
      if (onceki && onceki.sha256 !== islem.sha256) {
        throw new CakismaHatasi(`${yol}: "${onceki.hedef}" ve "${id}" farklı içerik üretiyor`)
      }
      yollar.set(yol, onceki ?? islem)
    }
  }
  const islemler = [...yollar.values()].sort((a, b) => (a.yol < b.yol ? -1 : a.yol > b.yol ? 1 : 0))
  return { islemler, uyarilar }
}
