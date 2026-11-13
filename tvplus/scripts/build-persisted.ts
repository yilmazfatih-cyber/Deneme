/**
 * Kalıcı sorgu kayıt defterini üretir (Netflix "persisted queries" deseni).
 *   shared/graphql/operations/*.graphql  →  shared/graphql/persisted.server.json  (kimlik → belge; yalnız sunucu okur)
 *                                           shared/graphql/persisted.client.json  (ad → kimlik; istemci paketine girer)
 * İstemci hiçbir zaman sorgu metnini yollamaz; yalnızca { id, version }.
 * Her belge şemaya karşı doğrulanır: şema ile sorgu uyuşmazsa derleme burada kırılır.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSchema, Kind, parse, print, validate, visit, type DocumentNode, type FragmentDefinitionNode } from 'graphql'
import { PERSISTED_QUERY_VERSION } from '../shared/constants'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'graphql')
const opsDir = join(root, 'operations')
const schema = buildSchema(readFileSync(join(root, 'schema.graphql'), 'utf8'))

const fragments = new Map<string, FragmentDefinitionNode>()
for (const def of parse(readFileSync(join(opsDir, '_fragments.graphql'), 'utf8')).definitions) {
  if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def)
}

/** Belgede kullanılan parçaları geçişli olarak toplar. */
function usedFragments(doc: DocumentNode): FragmentDefinitionNode[] {
  const seen = new Set<string>()
  const local = new Set(doc.definitions.filter((d) => d.kind === Kind.FRAGMENT_DEFINITION).map((d) => d.name.value))
  const walk = (node: DocumentNode | FragmentDefinitionNode) => {
    visit(node, {
      FragmentSpread(spread) {
        const name = spread.name.value
        if (seen.has(name) || local.has(name)) return
        const frag = fragments.get(name)
        if (!frag) throw new Error(`Tanımsız parça: ${name}`)
        seen.add(name)
        walk(frag)
      },
    })
  }
  walk(doc)
  return [...seen].sort().map((n) => fragments.get(n)!)
}

/** Belge özetinden UUID biçimli kararlı kimlik. */
function idOf(text: string): string {
  const h = createHash('sha256').update(text).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const server: Record<string, { name: string; type: string; document: string }> = {}
const client: Record<string, string> = {}
let failed = false

for (const file of readdirSync(opsDir).sort()) {
  if (!file.endsWith('.graphql') || file.startsWith('_')) continue
  const doc = parse(readFileSync(join(opsDir, file), 'utf8'))
  const ops = doc.definitions.filter((d) => d.kind === Kind.OPERATION_DEFINITION)
  if (ops.length !== 1 || !ops[0]!.name) {
    console.error(`✗ ${file}: tam olarak bir adlı işlem içermeli`)
    failed = true
    continue
  }
  const name = ops[0]!.name.value
  if (`${name}.graphql` !== file) {
    console.error(`✗ ${file}: dosya adı işlem adıyla aynı olmalı (${name}.graphql)`)
    failed = true
    continue
  }
  const full: DocumentNode = { kind: Kind.DOCUMENT, definitions: [...doc.definitions, ...usedFragments(doc)] }
  const errors = validate(schema, full)
  if (errors.length) {
    failed = true
    for (const e of errors) console.error(`✗ ${file}: ${e.message}`)
    continue
  }
  const text = print(full)
  const id = idOf(text)
  server[id] = { name, type: ops[0]!.operation, document: text }
  client[name] = id
}

if (failed) process.exit(1)
writeFileSync(join(root, 'persisted.server.json'), JSON.stringify({ version: PERSISTED_QUERY_VERSION, operations: server }, null, 2) + '\n')
writeFileSync(join(root, 'persisted.client.json'), JSON.stringify({ version: PERSISTED_QUERY_VERSION, operations: client }, null, 2) + '\n')
console.log(`✓ ${Object.keys(client).length} kalıcı sorgu kaydedildi (sürüm ${PERSISTED_QUERY_VERSION})`)
