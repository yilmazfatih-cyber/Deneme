// Sakin asistanı: site belgelerinde (BM25) arar, sakinin hesap özetini ekler, yapay zekâyla yanıtlar.
// Yanıt bulunamazsa soru gelen kutusuna düşer ve personel görür.
import { all, insert, run, tx, type DB } from '../db/db.ts'
import { today } from '../domain/dates.ts'
import { chunkText, search, type Chunk } from '../domain/search.ts'
import type { Deps } from '../http.ts'
import { logAi } from './common.ts'
import { accountFacts } from './finance.ts'
import { receiveInbound } from './inbox.ts'

export function indexDocument(db: DB, documentId: number, body: string) {
  tx(db, () => {
    run(db, 'DELETE FROM doc_chunks WHERE document_id = ?', documentId)
    chunkText(body).forEach((c, i) =>
      insert(db, 'doc_chunks', { document_id: documentId, seq: i, heading: c.heading, text: c.text }),
    )
  })
}

export function loadChunks(db: DB, orgId: number, siteId: number | null, audience: 'sakin' | 'personel'): Chunk[] {
  return all<{ id: number; document_id: number; title: string; heading: string | null; text: string }>(
    db,
    `SELECT c.id, c.document_id, d.title, c.heading, c.text FROM doc_chunks c JOIN documents d ON d.id = c.document_id
     WHERE d.org_id = ? AND (d.site_id IS NULL OR d.site_id = ?) ${audience === 'sakin' ? `AND d.visibility = 'sakin'` : ''}
     ORDER BY d.id, c.seq`,
    orgId,
    siteId ?? -1,
  ).map((r) => ({ id: r.id, documentId: r.document_id, title: r.title, heading: r.heading, text: r.text }))
}

export async function ask(
  deps: Deps,
  p: {
    orgId: number
    siteId: number | null
    question: string
    audience: 'sakin' | 'personel'
    personId?: number | null
    unitIds?: number[]
    askerName?: string | null
    phone?: string | null
  },
) {
  const { db } = deps
  const hits = search(p.question, loadChunks(db, p.orgId, p.siteId, p.audience), 4)
  const facts = p.unitIds?.length ? accountFacts(db, p.unitIds, today(deps.now())) : null
  const siteName = p.siteId
    ? (db.prepare('SELECT name FROM sites WHERE id = ?').get(p.siteId) as { name: string } | undefined)?.name
    : null
  const r = await deps.ai.answer({ question: p.question, hits, facts, askerName: p.askerName, siteName })
  const used = r.result.used_sources.length ? r.result.used_sources : hits.length && !r.result.needs_staff ? [1] : []
  const sources = used
    .map((n) => hits[n - 1])
    .filter((h): h is NonNullable<typeof h> => Boolean(h))
    .map((h) => ({ title: h.chunk.title, heading: h.chunk.heading, excerpt: h.chunk.text.slice(0, 280) }))
  logAi(db, {
    orgId: p.orgId,
    siteId: p.siteId,
    kind: 'soru',
    status: 'bilgi',
    title: p.question.slice(0, 140),
    payload: { answer: r.result.answer, needsStaff: r.result.needs_staff, sources: sources.map((s) => s.title) },
    engine: r.engine,
    model: r.model,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    masked: r.masked,
    note: r.fallbackReason ?? null,
  })
  let forwarded = false
  if (r.result.needs_staff && p.audience === 'sakin' && p.personId) {
    await receiveInbound(deps, {
      channel: 'portal',
      from: p.phone ?? `kisi:${p.personId}`,
      body: p.question,
      personId: p.personId,
      orgId: p.orgId,
    })
    forwarded = true
  }
  return {
    answer: r.result.answer,
    needsStaff: r.result.needs_staff,
    forwarded,
    sources,
    engine: r.engine,
    model: r.model,
  }
}
