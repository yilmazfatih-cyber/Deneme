/**
 * Etiketleme servisi (bkz. docs/ICERIK_ZEKASI.md §3): kılavuz sözlüğü, etiket fişleri, uzlaşı, geçerli etiketler.
 * Sözleşme: server/src/kernel/intelligence.ts (TaggingService) · tel: shared/intelligence.ts ("Etiketleme").
 *
 * Açılışta sözlük ve örnek fişler doğrulanır; içerik geçersizse sunucu açık bir iletiyle durur.
 * Uçlar /api/studio/tagging altındadır; yazma uçları assertStudioWrite çağırır.
 */
import { join } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { z } from 'zod'
import { ROUTES } from '../../../../shared/constants'
import { zTagSheet, type TagSheet, type TagVocabulary } from '../../../../shared/tagging-schema'
import { httpError } from '../../gateway/errors'
import { assertStudioWrite } from '../../kernel/intelligence'
import { createStore } from '../../kernel/store'
import { TAGGER_RE, zSheetInput, zTitleIdParam } from './schemas'
import { createTaggingCore, type TaggingCore, type TaggingState } from './service'
import { loadTaggingContentOrThrow, VOCABULARY_FILE } from './vocabulary'

const coreByApp = new WeakMap<FastifyInstance, TaggingCore>()
/** Testler ve aynı ekibin mikro tür servisi için iç çekirdek. */
export function taggingCore(app: FastifyInstance): TaggingCore {
  const c = coreByApp.get(app)
  if (!c) throw new Error('Etiketleme eklentisi bu uygulamada kurulmamış')
  return c
}

/** İstanbul saatine göre bugün, 'YYYY-MM-DD' */
const todayIstanbul = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

function issueMessage(err: z.ZodError): string {
  const i = err.issues[0]
  if (!i) return 'İstek geçersiz.'
  if (i.code === 'unrecognized_keys') return `Bilinmeyen alan: ${i.keys.join(', ')}`
  const path = i.path.map(String).join('.')
  return path ? `${path}: ${i.message}` : i.message
}

export default async function taggingPlugin(app: FastifyInstance): Promise<void> {
  const config = app.config
  const content = loadTaggingContentOrThrow(config.contentDir, join(config.rootDir, 'content', VOCABULARY_FILE))
  const store = createStore<TaggingState>(config, 'tagging', () => ({ sheets: [] }))
  // Depodaki kayıtlar şemaya uymuyorsa (elle düzenlenmiş dosya) yalnız bozuk olanlar düşer.
  const stored: unknown = store.get().sheets
  const list: unknown[] = Array.isArray(stored) ? stored : []
  const valid = list.flatMap((x): TagSheet[] => {
    const r = zTagSheet.safeParse(x)
    return r.success && r.data.source === 'TAGGER' && r.data.tagger !== null ? [r.data] : []
  })
  if (!Array.isArray(stored) || valid.length !== list.length) {
    app.log.warn({ dropped: list.length - valid.length }, 'etiketleme deposunda geçersiz fişler atlandı')
    store.update((s) => void (s.sheets = valid))
  }

  const core = createTaggingCore({
    vocabulary: content.vocabulary,
    sampleSheets: content.sheets.map((s) => s.sheet),
    store,
    titles: () => app.services.catalog.allTitles(),
    getTitle: (id) => app.services.catalog.getTitle(id),
    today: todayIstanbul,
  })
  coreByApp.set(app, core)
  app.services.tagging = {
    vocabulary: core.vocabulary,
    effective: core.effective,
    sheets: core.sheets,
    revision: core.revision,
  }
  app.addHook('onClose', async () => store.flush())

  /* ───────────── uçlar ───────────── */
  const BASE = `${ROUTES.STUDIO}/tagging`

  const titleIdOf = (req: FastifyRequest<{ Params: { titleId: string } }>): number => {
    const r = zTitleIdParam.safeParse(req.params.titleId)
    if (!r.success) throw httpError(400, 'INVALID_TITLE_ID', 'Başlık kimliği pozitif bir tam sayı olmalı.')
    return r.data
  }
  const taggerOf = (req: FastifyRequest<{ Params: { tagger: string } }>): string => {
    const t = req.params.tagger
    if (!TAGGER_RE.test(t))
      throw httpError(
        400,
        'INVALID_TAGGER',
        `Etiketleyici kimliği "${t.slice(0, 40)}" geçersiz: 2–32 karakter; küçük harf, rakam, nokta, alt çizgi ve tire (ör. etiket-01).`,
      )
    return t
  }

  app.get(`${BASE}/vocabulary`, async (_req, reply): Promise<TagVocabulary> => {
    reply.header('cache-control', 'no-store')
    return core.vocabulary()
  })

  app.get(`${BASE}/queue`, async (_req, reply) => {
    reply.header('cache-control', 'no-store')
    return core.queue()
  })

  app.get<{ Params: { titleId: string } }>(`${BASE}/titles/:titleId`, async (req, reply) => {
    const id = titleIdOf(req)
    const t = core.titleTagging(id)
    if (!t) throw httpError(404, 'TITLE_NOT_FOUND', `${id} kimlikli başlık katalogda yok.`)
    reply.header('cache-control', 'no-store')
    return t
  })

  app.put<{ Params: { titleId: string; tagger: string } }>(`${BASE}/titles/:titleId/sheets/:tagger`, async (req) => {
    assertStudioWrite(req, config)
    const id = titleIdOf(req)
    const tagger = taggerOf(req)
    const body = zSheetInput.safeParse(req.body)
    if (!body.success) throw httpError(400, 'INVALID_SHEET', issueMessage(body.error))
    return core.putSheet(id, tagger, body.data)
  })

  app.post<{ Params: { titleId: string; tagger: string } }>(
    `${BASE}/titles/:titleId/sheets/:tagger/approve`,
    async (req) => {
      assertStudioWrite(req, config)
      return core.approve(titleIdOf(req), taggerOf(req))
    },
  )

  app.delete<{ Params: { titleId: string; tagger: string } }>(
    `${BASE}/titles/:titleId/sheets/:tagger`,
    async (req, reply) => {
      assertStudioWrite(req, config)
      core.remove(titleIdOf(req), taggerOf(req))
      return reply.code(204).send()
    },
  )
}
