// Aşama 5 — Beceriler: SKILL.md keşfi, öncelik, uygunluk süzgeci ve istemdeki <available_skills> kataloğu.
//
// Gerçek karşılığı: src/skills/loading/ (skill-root-discovery.ts, skill-precedence.ts, frontmatter.ts,
// skill-contract.ts → <available_skills>, skill-prompt-catalog.ts), skills/ (paketle gelen beceriler),
// docs/tools/skills.md. Topluluk becerileri ClawHub'dan kurulur (skills/clawhub).
//
// Kademeli açılım: istemde yalnızca ad + açıklama + konum durur; model gerekince SKILL.md'yi `read`
// aracıyla okur. Öncelik (yüksekten düşüğe): çalışma alanı > yönetilen (~/.openclaw/skills) > paketle gelen.
// Uygunluk: frontmatter'daki metadata.openclaw.requires (bins / env) sağlanmıyorsa beceri hiç listelenmez.

import { readdir, readFile, realpath } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const MAX_DEPTH = 6 // en çok 6 klasör derinliği (gerçekte skill-root-discovery.ts: MAX_GROUPED_SKILL_SCAN_DEPTH = 6)

/** '---' arasındaki 'anahtar: değer' satırları; metadata tek satırlık JSON olarak yazılır. */
export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  if (!m) return { meta: {}, body: text }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const key = line.slice(0, i).trim()
    const raw = line.slice(i + 1).trim()
    if (key === 'metadata') {
      try {
        meta.metadata = JSON.parse(raw)
      } catch {
        meta.metadata = {} // bozuk metadata beceriyi düşürmez, yalnızca kısıtlarını yok sayar
      }
    } else meta[key] = raw.replace(/^["']|["']$/g, '')
  }
  return { meta, body: text.slice(m[0].length) }
}

async function findSkillFiles(dir, depth = 0) {
  if (depth > MAX_DEPTH) return []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) return [join(dir, 'SKILL.md')] // altına inme
  const found = []
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory() && !e.name.startsWith('.')) found.push(...(await findSkillFiles(join(dir, e.name), depth + 1)))
  }
  return found
}

/**
 * @param {{dir: string, source: string}[]} roots yüksek öncelikten düşüğe
 * @returns {Promise<Map<string, {name: string, description: string, location: string, source: string, metadata: any}>>}
 */
export async function discoverSkills(roots) {
  const skills = new Map()
  for (const { dir, source } of roots) {
    for (const file of await findSkillFiles(dir)) {
      const { meta } = parseFrontmatter(await readFile(file, 'utf8'))
      const name = meta.name || file.split(sep).at(-2)
      if (!meta.description || skills.has(name)) continue // açıklamasız beceri geçersiz; isim çakışmasında ilk kök kazanır
      skills.set(name, { name, description: meta.description, location: file, source, metadata: meta.metadata ?? {} })
    }
  }
  return skills
}

/** metadata.openclaw.requires: { bins: [...], env: [...] } */
export function isEligible(skill, { env = process.env, hasBin = () => false } = {}) {
  const req = skill.metadata?.openclaw?.requires ?? {}
  return (req.bins ?? []).every((b) => hasBin(b)) && (req.env ?? []).every((k) => Boolean(env[k]))
}

const escapeXml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

/** İsteme giren katalog; açıklamalar kısaltılır, ayrıntı SKILL.md'de kalır. */
export function formatSkillsForPrompt(skills, maxDescription = 200) {
  if (skills.length === 0) return ''
  const lines = [
    'Bir görev aşağıdaki becerilerden birine uyuyorsa önce o SKILL.md dosyasını read ile oku.',
    '<available_skills>',
  ]
  for (const s of skills) {
    lines.push('  <skill>')
    lines.push(`    <name>${escapeXml(s.name)}</name>`)
    lines.push(`    <description>${escapeXml(s.description.slice(0, maxDescription))}</description>`)
    lines.push(`    <location>${escapeXml(s.location)}</location>`)
    lines.push('  </skill>')
  }
  lines.push('</available_skills>')
  return lines.join('\n')
}

/** Yalnızca izinli köklerin içindeki dosyaları okuyan araç (sembolik bağla dışarı kaçış da engellenir). */
export function createReadTool(allowedRoots) {
  return {
    name: 'read',
    description: 'Bir dosyayı oku (yalnızca çalışma alanı ve beceri klasörleri).',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    async execute({ path }) {
      let real
      try {
        real = await realpath(path)
      } catch {
        return { error: `dosya yok: ${path}` }
      }
      for (const root of allowedRoots) {
        const rel = relative(await realpath(root), real)
        if (rel && !rel.startsWith('..') && !rel.startsWith(sep)) {
          return { path, content: (await readFile(real, 'utf8')).slice(0, 50_000) }
        }
      }
      return { error: 'bu yol izinli köklerin dışında' }
    },
  }
}
