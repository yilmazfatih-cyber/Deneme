/**
 * Açılış tohumu ↔ web ana sayfası: tohum, web'in ilk boyamada ve ilk etkileşime kadar istediği HER yaprağı (masaüstü ve
 * mobil) taşımalıdır; yoksa ana sayfa kaydırmadan önce pathEvaluator isteği yapar.
 * Web kümeleri web/src/features/home/lolomo.ts'ten çalışma anında okunur (`leavesFor`, `heroDeferredLeaves`,
 * `planRowItems`, `rowKindOf`, `initialItemCount`) — web değişip tohum geride kalırsa bu test kırılır.
 */
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BootContext, FalcorPath, JsonGraph } from '../../shared/types'
import { BOOT_ROWS, bootRowPaths } from '../src/services/identity/boot'
import { FIXTURE_CONTENT_DIR, ID } from './fixtures/alan'
import { installIntelligence } from './fixtures/intelligence'
import { createTestApp } from './helpers'

type Screen = 'desktop' | 'mobile'
type RowKind = 'hero' | 'continue' | 'top10' | 'standard' | 'bridge'
interface WebHome {
  leavesFor(kind: RowKind, screen: Screen): string[]
  heroDeferredLeaves(screen: Screen): string[]
  rowKindOf(context: string | undefined): RowKind | null
  initialItemCount(kind: RowKind, length: number): number
  planRowItems(listId: string, kind: RowKind, screen: Screen, from: number, to: number): FalcorPath[]
}
// Yol değişkende: sunucu tip denetimi web kaynağını derlemeye çekmez; vitest çalışma anında çözer
const WEB_HOME = join(import.meta.dirname, '..', '..', 'web', 'src', 'features', 'home', 'lolomo.ts')
const SCREENS: Screen[] = ['desktop', 'mobile']

type Node = Record<string, unknown>
const isRef = (n: unknown): n is { $type: 'ref'; value: (string | number)[] } =>
  !!n && typeof n === 'object' && (n as Node).$type === 'ref'

/** Yolu grafikte ref'leri izleyerek açar; eksik yaprakların yollarını döndürür (aralık ve dizi anahtarları açılır). */
function missing(graph: JsonGraph, path: FalcorPath): string[] {
  const out: string[] = []
  const walk = (node: unknown, rest: FalcorPath, at: (string | number)[], depth: number): void => {
    if (isRef(node) && depth < 10) {
      let target: unknown = graph
      for (const k of node.value)
        target = target && typeof target === 'object' ? (target as Node)[String(k)] : undefined
      return walk(target, rest, [...node.value], depth + 1)
    }
    if (!rest.length) {
      if (node === undefined) out.push(at.join('.'))
      return
    }
    // Atom / hata yaprağı yolu kapatır (Falcor: altındaki yol "bulundu" sayılır, istek gitmez)
    if (node && typeof node === 'object' && (node as Node).$type) return
    if (node === undefined || node === null || typeof node !== 'object') {
      out.push([...at, ...rest.map((k) => JSON.stringify(k))].join('.'))
      return
    }
    const [head, ...tail] = rest
    const keys: (string | number)[] = Array.isArray(head)
      ? (head as (string | number)[])
      : head && typeof head === 'object'
        ? Array.from(
            { length: ((head as { to: number }).to ?? 0) - ((head as { from?: number }).from ?? 0) + 1 },
            (_, i) => ((head as { from?: number }).from ?? 0) + i,
          )
        : [head as string | number]
    for (const k of keys) walk((node as Node)[String(k)], tail, [...at, k], depth)
  }
  walk(graph, path, [], 0)
  return out
}

describe('açılış tohumu ↔ web ana sayfası yaprakları', () => {
  let web: WebHome
  let app: FastifyInstance
  let graph: JsonGraph
  beforeAll(async () => {
    web = (await import(/* @vite-ignore */ WEB_HOME)) as WebHome
    app = await createTestApp({ contentDir: FIXTURE_CONTENT_DIR })
    installIntelligence(app) // ilk satırlar arasında mikro tür satırları da olsun
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    const cookies = Object.fromEntries(login.cookies.map((c) => [c.name, c.value]))
    const guid = login.json<BootContext>().profiles.find((p) => !p.isKids)!.guid
    const sw = await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies, payload: { guid } })
    for (const c of sw.cookies) cookies[c.name] = c.value
    app.services.progress.setBookmark(guid, ID.caminandes, 30) // devam et satırı (dizi: current ref)
    graph = (await app.inject({ url: '/api/boot', cookies })).json<BootContext>().falcorCache as JsonGraph
  })
  afterAll(async () => {
    await app.close()
  })

  it('her satır türü için tohum yaprakları web kümelerinin (masaüstü ∪ mobil) üst kümesi', () => {
    const seeded = (context: string) => {
      const paths = bootRowPaths({ id: 'L', context, length: 10 })
      const leaves = new Set<string>()
      for (const p of paths)
        if (p[0] === 'lists' && p.length === 4 && Array.isArray(p[3])) for (const l of p[3]) leaves.add(String(l))
      return leaves
    }
    const cases: [string, RowKind][] = [
      ['billboard', 'hero'],
      ['continueWatching', 'continue'],
      ['top10', 'top10'],
      ['genre', 'standard'],
      ['microgenre', 'standard'],
    ]
    for (const [context, kind] of cases) {
      expect(web.rowKindOf(context)).toBe(kind)
      const want = new Set(SCREENS.flatMap((s) => web.leavesFor(kind, s)))
      if (kind === 'hero') for (const s of SCREENS) for (const l of web.heroDeferredLeaves(s)) want.add(l)
      const have = seeded(context)
      expect(
        [...want].filter((l) => !have.has(l)),
        context,
      ).toEqual([])
    }
    // Açıkça (web değişirse burası da güncellenir): masaüstü afiş storyArt, mobil devam et boxart, vitrin ertelenenleri
    expect(seeded('genre').has('storyArt')).toBe(true)
    expect(seeded('continueWatching').has('boxart')).toBe(true)
    for (const l of ['boxart', 'top10Rank', 'queue']) expect(seeded('billboard').has(l)).toBe(true)
  })

  it('gerçek tohum: ilk satırların web planı (iki ekran + vitrin ertelenenleri) grafikte eksiksiz', () => {
    const lolomo = graph.lolomos as Record<string, Record<string, unknown>>
    const guidKey = Object.keys(lolomo)[0]!
    const kinds = new Set<string>()
    let rows = 0
    for (let i = 0; i < BOOT_ROWS; i++) {
      const ref = lolomo[guidKey]![String(i)]
      if (!isRef(ref)) continue
      const listId = String(ref.value[1])
      const summary = (
        (graph.lists as Record<string, Node>)[listId]!.summary as { value: { context: string; length: number } }
      ).value
      const kind = web.rowKindOf(summary.context)
      if (!kind || kind === 'bridge') continue
      rows++
      kinds.add(kind)
      const count = web.initialItemCount(kind, summary.length)
      for (const screen of SCREENS) {
        const paths = web.planRowItems(listId, kind, screen, 0, count - 1)
        if (kind === 'hero') paths.push(['lists', listId, 0, web.heroDeferredLeaves(screen)])
        for (const p of paths)
          expect(missing(graph, p), `${summary.context} ${screen} ${JSON.stringify(p)}`).toEqual([])
      }
    }
    expect(rows).toBeGreaterThanOrEqual(4)
    for (const k of ['hero', 'continue', 'top10', 'standard']) expect(kinds.has(k), k).toBe(true)
  })
})
