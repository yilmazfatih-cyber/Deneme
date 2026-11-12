// Aşama 5 testleri: keşif ve öncelik, uygunluk süzgeci, katalog biçimi, read aracının sınırları.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import {
  createReadTool,
  discoverSkills,
  formatSkillsForPrompt,
  isEligible,
  parseFrontmatter,
} from '../asama5_beceriler.js'

let kok
const yaz = async (yol, metin) => {
  await mkdir(join(yol, '..'), { recursive: true })
  await writeFile(yol, metin)
}
const beceri = (ad, aciklama, ek = '') => `---\nname: ${ad}\ndescription: ${aciklama}\n${ek}---\ngövde\n`

before(async () => {
  kok = await mkdtemp(join(tmpdir(), 'oc-skill-'))
  await yaz(join(kok, 'ws', 'arastirma', 'not-al', 'SKILL.md'), beceri('not-al', 'Çalışma alanı sürümü'))
  await yaz(join(kok, 'ws', 'not-al-kopya', 'SKILL.md'), beceri('not-al', 'Aynı ad, aynı kökte ikinci'))
  await yaz(join(kok, 'paket', 'not-al', 'SKILL.md'), beceri('not-al', 'Paket sürümü'))
  await yaz(
    join(kok, 'paket', 'gh', 'SKILL.md'),
    beceri(
      'gh',
      'GitHub <issue> & PR',
      'metadata: {"openclaw": {"requires": {"bins": ["gh"], "env": ["GH_TOKEN"]}}}\n',
    ),
  )
  await yaz(join(kok, 'paket', 'gh', 'alt', 'SKILL.md'), beceri('alt', 'SKILL.md altındaki beceri keşfedilmez'))
  await yaz(join(kok, 'paket', 'aciklamasiz', 'SKILL.md'), '---\nname: aciklamasiz\n---\nx')
  await writeFile(join(kok, 'gizli.txt'), 'kök dışında gizli')
})
after(() => rm(kok, { recursive: true, force: true }))

test('frontmatter ve metadata JSON', () => {
  const { meta, body } = parseFrontmatter(beceri('x', 'y', 'metadata: {"openclaw": {"emoji": "🦞"}}\n'))
  assert.equal(meta.metadata.openclaw.emoji, '🦞')
  assert.equal(body, 'gövde\n')
  assert.deepEqual(parseFrontmatter(beceri('x', 'y', 'metadata: {bozuk\n')).meta.metadata, {})
})

test('ilk kök kazanır; SKILL.md altına inilmez; açıklamasız beceri atlanır', async () => {
  const skills = await discoverSkills([
    { dir: join(kok, 'ws'), source: 'workspace' },
    { dir: join(kok, 'paket'), source: 'bundled' },
  ])
  assert.deepEqual([...skills.keys()].sort(), ['gh', 'not-al'])
  assert.equal(skills.get('not-al').description, 'Çalışma alanı sürümü')
  assert.equal(skills.get('not-al').source, 'workspace')
})

test('gereksinim süzgeci: bins ve env', async () => {
  const gh = (await discoverSkills([{ dir: join(kok, 'paket'), source: 'bundled' }])).get('gh')
  assert.equal(isEligible(gh, { env: {}, hasBin: () => true }), false)
  assert.equal(isEligible(gh, { env: { GH_TOKEN: 'x' }, hasBin: (b) => b === 'gh' }), true)
})

test('katalog XML kaçışlı ve konum içerir', async () => {
  const skills = [...(await discoverSkills([{ dir: join(kok, 'paket'), source: 'bundled' }])).values()]
  const katalog = formatSkillsForPrompt(skills)
  assert.match(katalog, /<available_skills>\n {2}<skill>\n {4}<name>gh<\/name>/)
  assert.match(katalog, /GitHub &lt;issue&gt; &amp; PR/)
  assert.match(katalog, /<location>.*gh\/SKILL\.md<\/location>/)
  assert.equal(formatSkillsForPrompt([]), '')
})

test('read aracı yalnızca izinli kökleri okur (sembolik bağ kaçışı dahil)', async () => {
  const read = createReadTool([join(kok, 'ws')])
  assert.match((await read.execute({ path: join(kok, 'ws', 'arastirma', 'not-al', 'SKILL.md') })).content, /gövde/)
  assert.match((await read.execute({ path: join(kok, 'gizli.txt') })).error, /dışında/)
  assert.match((await read.execute({ path: join(kok, 'ws', '..', 'gizli.txt') })).error, /dışında/)
  await symlink(join(kok, 'gizli.txt'), join(kok, 'ws', 'kisayol.txt'))
  assert.match((await read.execute({ path: join(kok, 'ws', 'kisayol.txt') })).error, /dışında/)
})
