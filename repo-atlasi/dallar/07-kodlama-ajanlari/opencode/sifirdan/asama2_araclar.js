// Aşama 2 — Araçlar (tools): read, write, edit, glob, grep, bash
//
// opencode'da her araç bir eklentidir (packages/core/src/tool/plugin/*.ts) ve izin kontrolünü
// aracın kendisi yapar: edit "edit" eylemi için dosya yolunu, shell her alt komutu ayrı bir kaynak
// olarak denetletir. Burada da öyle: her araç `ctx.permission.assert(...)` çağırır; döngü yalnızca
// aracı çalıştırır.

import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MAX_OUTPUT_CHARS = 30_000
export const DEFAULT_BASH_TIMEOUT_MS = 2 * 60 * 1000 // opencode'daki varsayılanla aynı: 2 dakika

/** Araç hatası: modele "isError: true" sonucu olarak döner, döngüyü durdurmaz. */
export class ToolError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ToolError'
  }
}

/**
 * Araç tanımı. `parameters` JSON Schema'nın küçük bir alt kümesidir (object + properties + required).
 * @typedef {{ root: string, permission: { assert: Function }, signal?: AbortSignal }} ToolContext
 * @typedef {{ name: string, description: string, permission: string, parameters: object, execute: (input: any, ctx: ToolContext) => Promise<string> }} Tool
 * @param {Tool} tool
 */
export function defineTool(tool) {
  for (const key of ['name', 'description', 'permission', 'parameters', 'execute']) {
    if (!tool[key]) throw new Error(`Araç tanımında "${key}" eksik`)
  }
  if (!/^[A-Za-z0-9_-]+$/.test(tool.name)) throw new Error(`Geçersiz araç adı: ${tool.name}`)
  return tool
}

/** Modelin gönderdiği argümanları şemaya göre denetler; hata metni ya da null döner. */
export function validateInput(schema, input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return 'Argümanlar bir JSON nesnesi olmalı'
  if ('__invalidJson' in input) return `Argümanlar geçerli JSON değil: ${input.__invalidJson}`
  for (const key of schema.required ?? []) {
    if (!(key in input)) return `Zorunlu argüman eksik: ${key}`
  }
  for (const [key, value] of Object.entries(input)) {
    const expected = schema.properties?.[key]?.type
    if (!expected) continue
    const actual = Number.isInteger(value) ? 'integer' : typeof value
    const ok = expected === actual || (expected === 'number' && actual === 'integer')
    if (!ok) return `"${key}" için ${expected} bekleniyordu, ${actual} geldi`
  }
  return null
}

/** Yolu çalışma alanına göre çözer; alan dışına çıkan yollar "external" olarak işaretlenir. */
export function resolveInWorkspace(root, target) {
  const absolute = path.resolve(root, target)
  const relative = path.relative(root, absolute).split(path.sep).join('/')
  const external = relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)
  return { absolute, relative: external ? absolute : relative || '.', external }
}

/** Alan dışı yol için ek izin ister (opencode'daki external_directory onayının küçük karşılığı). */
async function authorizePath(ctx, action, target) {
  const resolved = resolveInWorkspace(ctx.root, target)
  if (resolved.external) await ctx.permission.assert({ action: 'external_directory', resources: [resolved.absolute] })
  await ctx.permission.assert({ action, resources: [resolved.relative] })
  return resolved
}

/** Uzun çıktıyı modelin bağlamını boğmadan keser. */
export function truncate(text, max = MAX_OUTPUT_CHARS) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… [çıktı kesildi: ${text.length - max} karakter daha]`
}

/** `.git` ve `node_modules` dışındaki tüm dosyaları göreli POSIX yollarıyla listeler. */
async function walk(root, start = '.') {
  const out = []
  async function visit(relative) {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const child = relative === '.' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) await visit(child)
      else if (entry.isFile()) out.push(child)
    }
  }
  await visit(start)
  return out.sort()
}

/** `**`, `*` ve `?` destekleyen glob deseni → düzenli ifade. */
export function globToRegExp(pattern) {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*' && pattern[i + 1] === '*') {
      const slash = pattern[i + 2] === '/'
      source += slash ? '(?:.*/)?' : '.*'
      i += slash ? 2 : 1
    } else if (char === '*') source += '[^/]*'
    else if (char === '?') source += '[^/]'
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}

/** Komut ayraçları; uzun olanlar önce denenir (`&&` `&`'tan, `||` ve `|&` `|`'dan önce). */
const SEPARATORS = ['&&', '||', '|&', ';', '|', '&', '\n']

/** Bileşik komutların ilk sözcükleri: mini bunları çözümlemez. */
const COMPOUND_WORDS = new Set([
  'if',
  'then',
  'elif',
  'else',
  'fi',
  'for',
  'while',
  'until',
  'do',
  'done',
  'case',
  'esac',
  'select',
  'function',
  '{',
  '}',
])

/** `2>&1`, `>&2`, `&>dosya`, `>|dosya`: buradaki & ve | ayraç değil, yönlendirmenin parçasıdır. */
function partOfRedirect(separator, previous, next) {
  if (separator === '&') return previous === '>' || previous === '<' || next === '>'
  if (separator === '|') return previous === '>'
  return false
}

/**
 * Kabuk komutunu izin için alt komutlara ayırır (opencode packages/core/src/shell/scan.ts'nin çok basit eşi).
 * Ayraçlar: &&, ||, |&, |, ;, & ve satır sonu. Tırnak içi ayraç sayılmaz, yönlendirmeler bölünmez.
 * Çözümleyemediği komutta null döner: komut ikamesi ($(…), `…`), alt kabuk ya da süreç ikamesi
 * (parantez), if/for/while gibi bileşik komutlar ve kapanmamış tırnak. Gerçek tarayıcı da böyle bir
 * komutu ("opaque") çalıştırmaz, hata verir. Bu bölücü bir GÜVENLİK SINIRI DEĞİLDİR:
 * `bash -c '…'`, `FOO=1 rm …` gibi biçimler kuralları yine atlatır.
 * @returns {string[] | null}
 */
export function splitCommands(command) {
  const parts = []
  let current = ''
  let quote = null
  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    const next = command[i + 1]
    if (quote === "'") {
      // Tek tırnak içinde hiçbir karakter özel değildir.
      current += char
      if (char === "'") quote = null
      continue
    }
    if (char === '\\' && next !== undefined) {
      current += char + next
      i++
      continue
    }
    // Komut ikamesi çift tırnak içinde de çalışır; mini içindeki komutu göremez.
    if (char === '`' || (char === '$' && next === '(')) return null
    if (quote === '"') {
      current += char
      if (char === '"') quote = null
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }
    if (char === '(' || char === ')') return null
    const separator = SEPARATORS.find((item) => command.startsWith(item, i))
    if (separator && !partOfRedirect(separator, current.at(-1), next)) {
      parts.push(current)
      current = ''
      i += separator.length - 1
      continue
    }
    current += char
  }
  if (quote) return null
  parts.push(current)
  const commands = parts.map((part) => part.trim()).filter(Boolean)
  if (commands.some((part) => COMPOUND_WORDS.has(part.split(/\s+/)[0]))) return null
  return commands
}

export const readTool = defineTool({
  name: 'read',
  permission: 'read',
  description: 'Bir dosyayı satır numaralarıyla okur. Büyük dosyalarda offset ve limit kullan.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Okunacak dosya' },
      offset: { type: 'integer', description: 'Başlangıç satırı (1 tabanlı)' },
      limit: { type: 'integer', description: 'En fazla satır' },
    },
    required: ['path'],
  },
  async execute(input, ctx) {
    const { absolute } = await authorizePath(ctx, 'read', input.path)
    const text = await readFile(absolute, 'utf8').catch(() => {
      throw new ToolError(`Dosya bulunamadı: ${input.path}`)
    })
    const lines = text.split('\n')
    const start = Math.max(1, input.offset ?? 1)
    const end = Math.min(lines.length, start - 1 + (input.limit ?? 2000))
    const body = lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`)
    return truncate(body.join('\n'))
  },
})

export const writeTool = defineTool({
  name: 'write',
  permission: 'edit', // opencode'da write ve edit aynı "edit" iznini kullanır
  description: 'Bir dosyayı verilen içerikle oluşturur ya da tamamen yeniden yazar.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string' }, content: { type: 'string' } },
    required: ['path', 'content'],
  },
  async execute(input, ctx) {
    const { absolute, relative } = await authorizePath(ctx, 'edit', input.path)
    await mkdir(path.dirname(absolute), { recursive: true })
    // Yarım yazılmış dosya kalmasın: önce geçici dosyaya yaz, sonra yeniden adlandır.
    const temporary = `${absolute}.${process.pid}.tmp`
    await writeFile(temporary, input.content)
    await rename(temporary, absolute)
    return `${relative} yazıldı (${input.content.length} karakter)`
  },
})

export const editTool = defineTool({
  name: 'edit',
  permission: 'edit',
  description:
    'Dosyada tam metin bul-değiştir yapar. oldString tek bir yeri göstermeli; tüm geçişler için replaceAll kullan. Satır numarası önekini (ör. "3: ") dahil etme.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      oldString: { type: 'string' },
      newString: { type: 'string' },
      replaceAll: { type: 'boolean' },
    },
    required: ['path', 'oldString', 'newString'],
  },
  async execute(input, ctx) {
    if (input.oldString === '') throw new ToolError('oldString boş olamaz; yeni dosya için write kullan')
    if (input.oldString === input.newString) throw new ToolError('oldString ile newString aynı; değişiklik yok')
    const { absolute, relative } = await authorizePath(ctx, 'edit', input.path)
    const source = await readFile(absolute, 'utf8').catch(() => {
      throw new ToolError(`Dosya bulunamadı: ${input.path}`)
    })
    const count = source.split(input.oldString).length - 1
    if (count === 0)
      throw new ToolError(`oldString bulunamadı: ${input.path}.${closestLineHint(source, input.oldString)}`)
    if (count > 1 && !input.replaceAll) {
      throw new ToolError(`oldString ${count} yerde geçiyor; daha fazla bağlam ekle ya da replaceAll: true kullan`)
    }
    const updated = input.replaceAll
      ? source.split(input.oldString).join(input.newString)
      : source.replace(input.oldString, () => input.newString)
    await writeFile(absolute, updated)
    return `${relative} düzenlendi (${input.replaceAll ? count : 1} değişiklik)`
  },
})

/** Eşleşme yoksa modelin bir sonraki denemede başarması için en yakın satırı gösterir. */
function closestLineHint(source, oldString) {
  const firstLine = oldString
    .split('\n')
    .find((line) => line.trim() !== '')
    ?.trim()
  if (!firstLine) return ''
  const lines = source.split('\n')
  const index = lines.findIndex((line) => line.trim() === firstLine)
  if (index === -1) return ''
  return ` En yakın satır ${index + 1}: ${lines[index]} (boşluk ve girintiyi kontrol et)`
}

export const globTool = defineTool({
  name: 'glob',
  permission: 'glob',
  description: 'Glob deseniyle dosya bulur, ör. "src/**/*.js".',
  parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
  async execute(input, ctx) {
    await ctx.permission.assert({ action: 'glob', resources: [input.pattern] })
    const regex = globToRegExp(input.pattern)
    const matches = (await walk(ctx.root)).filter((file) => regex.test(file))
    return matches.length > 0 ? truncate(matches.join('\n')) : 'Eşleşen dosya yok'
  },
})

export const grepTool = defineTool({
  name: 'grep',
  permission: 'grep',
  description: 'Dosya içeriklerinde düzenli ifade arar; "dosya:satır: metin" döner.',
  parameters: {
    type: 'object',
    properties: { pattern: { type: 'string' }, include: { type: 'string', description: 'Dosya glob filtresi' } },
    required: ['pattern'],
  },
  async execute(input, ctx) {
    await ctx.permission.assert({ action: 'grep', resources: [input.pattern] })
    let regex
    try {
      regex = new RegExp(input.pattern)
    } catch (error) {
      throw new ToolError(`Geçersiz düzenli ifade: ${error.message}`)
    }
    const filter = input.include ? globToRegExp(input.include) : null
    const hits = []
    for (const file of await walk(ctx.root)) {
      if (filter && !filter.test(file) && !filter.test(path.posix.basename(file))) continue
      const info = await stat(path.join(ctx.root, file))
      if (info.size > 1_000_000) continue
      const lines = (await readFile(path.join(ctx.root, file), 'utf8')).split('\n')
      lines.forEach((line, index) => {
        if (regex.test(line)) hits.push(`${file}:${index + 1}: ${line}`)
      })
      if (hits.length >= 100) break
    }
    return hits.length > 0 ? truncate(hits.slice(0, 100).join('\n')) : 'Eşleşme yok'
  },
})

export const bashTool = defineTool({
  name: 'bash', // opencode v2'de adı "shell"; "bash" çağrıları shell'e yönlendirilir
  permission: 'bash',
  description: 'Çalışma alanında bir kabuk komutu çalıştırır. timeout milisaniyedir; varsayılan 120000.',
  parameters: {
    type: 'object',
    properties: { command: { type: 'string' }, timeout: { type: 'integer' } },
    required: ['command'],
  },
  async execute(input, ctx) {
    // Her alt komut ayrı bir kaynak: "git status && rm -rf x" kurallara iki ayrı kaynak olarak bakılır;
    // biri bile izinli değilse tek soruda ikisi birlikte sorulur.
    const resources = splitCommands(input.command)
    if (!resources) {
      throw new ToolError(
        'Komut güvenle ayrıştırılamadı (komut ikamesi, alt kabuk, bileşik komut ya da kapanmamış tırnak). ' +
          'Komutu bunlar olmadan, ayrı ayrı yaz.',
      )
    }
    await ctx.permission.assert({ action: 'bash', resources })
    const timeout = input.timeout ?? DEFAULT_BASH_TIMEOUT_MS
    const result = await runCommand(input.command, ctx.root, timeout, ctx.signal)
    const notice = result.timedOut ? `\n[komut ${timeout} ms sonra zaman aşımıyla durduruldu]` : ''
    return truncate(`${result.output}${notice}\n[çıkış kodu: ${result.code ?? 'yok'}]`)
  },
})

/** Komutu kendi süreç grubunda başlatır; zaman aşımında tüm grubu öldürür. */
export function runCommand(command, cwd, timeout, signal) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let timedOut = false
    const collect = (chunk) => {
      if (output.length < MAX_OUTPUT_CHARS * 2) output += chunk
    }
    // Çok baytlı bir karakter (ör. "ş" = C5 9F) iki parçaya bölünse de bozulmasın: setEncoding akışa
    // bir StringDecoder takar, yarım kalan baytları bir sonraki parçayla birleştirir.
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const kill = () => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Süreç zaten bitmiş olabilir.
      }
    }
    const onTimeout = () => {
      timedOut = true
      kill()
    }
    const timer = timeout > 0 ? setTimeout(onTimeout, timeout) : null
    signal?.addEventListener('abort', kill, { once: true })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', kill)
      resolve({ output, code, timedOut })
    })
  })
}

/** Varsayılan araç kümesi. */
export const defaultTools = [readTool, writeTool, editTool, globTool, grepTool, bashTool]
