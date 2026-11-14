/**
 * Etiketleme masası (docs/ICERIK_ZEKASI.md §3; uçlar /api/studio/tagging/*).
 *   Kuyruk: başlık, tür, dayanak çipi, insan fişi, onay bekleyen; dayanağa göre süzme.
 *   Başlık: geçerli etiketler, her fiş kaynağıyla, uyarılar, bu başlığın mikro türleri (onaydan sonra değişimi),
 *   sözlükten kurulan form (0–5 ölçekler + seçili seviyenin yazılı ölçütü, yüz çipleri `max` sınırıyla).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import type {
  Microgenre,
  TaggingQueueItem,
  TagSheet,
  TagVocabulary,
  TitleTagging,
} from '../../../../shared/intelligence'
import type { TagScale } from '../../../../shared/tagging-schema'
import { Button, Switch, TextField, toast } from '../../ui'
import { studioSend, useAction, useStudio } from './api'
import { fmtDate, fmtPct } from './format'
import {
  BASIS_LABEL,
  BasisChip,
  Chip,
  Disclosure,
  Loadable,
  LoadingBlock,
  NotReady,
  Panel,
  SectionHead,
  SHEET_SOURCE_LABEL,
  SHEET_SOURCE_TONE,
  SLOT_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
} from './parts'
import {
  initialForm,
  ratedCount,
  setScale,
  toggleFacet,
  toInput,
  validateForm,
  type FormIssue,
  type TagFormState,
} from './tagForm'

const GROUP_LABEL: Record<string, string> = {
  ADVISORY: 'İçerik uyarıları',
  TONE: 'Ton',
  STORY: 'Anlatı',
  FORM: 'Biçim',
}

type BasisFilter = 'ALL' | 'NONE' | 'MODEL' | 'SAMPLE' | 'CONSENSUS' | 'PENDING'
const FILTERS: { id: BasisFilter; label: string }[] = [
  { id: 'ALL', label: 'Tümü' },
  { id: 'MODEL', label: 'Model önerisi' },
  { id: 'SAMPLE', label: 'Örnek' },
  { id: 'CONSENSUS', label: 'Uzlaşı' },
  { id: 'NONE', label: 'Etiketsiz' },
  { id: 'PENDING', label: 'Onay bekleyen' },
]

const TAGGER_KEY = 'tvp.studio.tagger'
function readTagger(): string {
  try {
    return window.localStorage.getItem(TAGGER_KEY) ?? 'etiket-01'
  } catch {
    return 'etiket-01'
  }
}
function writeTagger(v: string): void {
  try {
    window.localStorage.setItem(TAGGER_KEY, v)
  } catch {
    /* gizli pencere: hatırlanmaz */
  }
}

export function TaggingSection(): ReactElement {
  const { titleId } = useParams()
  const id = titleId && /^\d+$/.test(titleId) ? Number(titleId) : null
  const queue = useStudio<TaggingQueueItem[]>('/tagging/queue')
  const vocab = useStudio<TagVocabulary>('/tagging/vocabulary')
  return (
    <>
      <SectionHead
        title="Etiketleme"
        lead="İnsan etiketleyiciler yapımı izleyip ölçütlere göre fiş doldurur. Onaylanan fişlerin uzlaşısı örnek fişlerin ve model önerisinin önüne geçer."
      />
      <div className="st-split">
        <Panel title="Kuyruk" sub="Etiketsizler ve yalnız örnek fişi olanlar önce" className="st-split__side">
          <Loadable res={queue} what="Etiketleme kuyruğu">
            {(q) => <Queue items={q} selected={id} />}
          </Loadable>
        </Panel>
        <div className="st-split__main">
          {id === null ? (
            <Panel>
              <p className="ui-meta">Soldaki kuyruktan bir başlık seçin.</p>
              {vocab.data && <VocabularySummary v={vocab.data} />}
            </Panel>
          ) : (
            <TitleDesk key={id} titleId={id} vocab={vocab} onChanged={queue.refetch} />
          )}
        </div>
      </div>
    </>
  )
}

function Queue({ items, selected }: { items: TaggingQueueItem[]; selected: number | null }): ReactElement {
  const [filter, setFilter] = useState<BasisFilter>('ALL')
  const [q, setQ] = useState('')
  const shown = items.filter((i) => {
    if (filter === 'PENDING' ? !i.pendingReview : filter !== 'ALL' && i.basis !== filter) return false
    return !q.trim() || i.title.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))
  })
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of items) c[i.basis] = (c[i.basis] ?? 0) + 1
    return c
  }, [items])
  return (
    <>
      <p className="ui-caption">
        {items.length} başlık · Uzlaşı {counts.CONSENSUS ?? 0} · Örnek {counts.SAMPLE ?? 0} · Model önerisi{' '}
        {counts.MODEL ?? 0} · Etiketsiz {counts.NONE ?? 0}
      </p>
      <div className="st-filters">
        <select
          aria-label="Dayanağa göre süz"
          value={filter}
          onChange={(e) => setFilter(e.target.value as BasisFilter)}
          className="st-input"
        >
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <TextField label="Ara" hideLabel placeholder="Başlık ara" value={q} onChange={setQ} />
      </div>
      <ul className="st-queue" aria-label="Etiketleme kuyruğu">
        {shown.map((i) => (
          <li key={i.titleId}>
            <Link
              to={`/studyo/etiketleme/${i.titleId}`}
              className={i.titleId === selected ? 'st-queue__item is-on' : 'st-queue__item'}
              aria-current={i.titleId === selected ? 'true' : undefined}
            >
              <span className="st-queue__title">{i.title}</span>
              <span className="st-queue__meta">
                <span className="st-dim">{TYPE_LABEL[i.type]}</span>
                <BasisChip basis={i.basis} />
                {i.humanSheets > 0 && <span className="st-dim">{i.humanSheets} insan fişi</span>}
                {i.pendingReview && <Chip tone="accent">Onay bekliyor</Chip>}
              </span>
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className="ui-meta">Bu süzgeçte başlık yok.</li>}
      </ul>
    </>
  )
}

function VocabularySummary({ v }: { v: TagVocabulary }): ReactElement {
  return (
    <div className="st-vocab">
      <p className="ui-body">
        Kılavuz sürümü <strong>{v.version}</strong>: {v.scales.length} ölçek, {v.facets.length} yüz. Her ölçeğin altı
        seviyesi ve her seviyenin yazılı ölçütü vardır; etiketleyici yoruma değil ölçüte bakar.
      </p>
      {(['ADVISORY', 'TONE', 'STORY', 'FORM'] as const).map((g) => (
        <Disclosure key={g} summary={`${GROUP_LABEL[g]} · ${v.scales.filter((s) => s.group === g).length} ölçek`}>
          {v.scales
            .filter((s) => s.group === g)
            .map((s) => (
              <div key={s.key} className="st-guide" id={`kilavuz-${s.key}`}>
                <p className="st-guide__q">
                  <strong>{s.name}</strong> — {s.question}
                </p>
                <ol className="st-guide__levels" start={0}>
                  {s.levels.map((l) => (
                    <li key={l.value}>
                      <strong>
                        {l.value} {l.label}:
                      </strong>{' '}
                      {l.description}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
        </Disclosure>
      ))}
    </div>
  )
}

/* ───────────── Başlık masası ───────────── */

function TitleDesk({
  titleId,
  vocab,
  onChanged,
}: {
  titleId: number
  vocab: ReturnType<typeof useStudio<TagVocabulary>>
  onChanged: () => void
}): ReactElement {
  const t = useStudio<TitleTagging>(`/tagging/titles/${titleId}`)
  const mg = useStudio<Microgenre[]>(`/microgenres/by-title/${titleId}`)
  const [mgBefore, setMgBefore] = useState<Microgenre[] | null>(null)
  const approve = useAction()
  const refreshAll = () => {
    t.refetch()
    mg.refetch()
    onChanged()
  }
  const doApprove = async (sheet: TagSheet) => {
    if (!sheet.tagger) return
    setMgBefore(mg.data ?? null)
    const r = await approve.run(() =>
      studioSend<TagSheet>('POST', `/tagging/titles/${titleId}/sheets/${encodeURIComponent(sheet.tagger!)}/approve`),
    )
    if (r) {
      toast(`${sheet.tagger} fişi onaylandı.`, { kind: 'success' })
      refreshAll()
    }
  }
  return (
    <Loadable res={t} what="Başlık etiketleri" skeleton={<LoadingBlock lines={4} />}>
      {(data) => (
        <>
          <Panel
            title={data.title}
            sub={`Kimlik ${data.titleId} · kılavuz ${data.effective.rubricVersion}`}
            actions={<BasisChip basis={data.effective.basis} />}
          >
            <Effective data={data} vocab={vocab.data} />
            {data.advisoryWarnings.length > 0 && (
              <ul className="st-warnings" aria-label="Uyarılar">
                {data.advisoryWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <TitleMicrogenres res={mg} before={mgBefore} />
          </Panel>
          <Panel
            title="Fişler"
            sub="Örnek fişler izlenmeden doldurulmuştur; model önerisi yalnız başlangıç noktasıdır."
          >
            {approve.error && (
              <p className="st-error" role="alert">
                {approve.error}
              </p>
            )}
            <div className="st-sheets">
              {data.sheets.map((s, i) => (
                <SheetCard
                  key={`${s.source}-${s.tagger ?? i}`}
                  s={s}
                  vocab={vocab.data}
                  onApprove={doApprove}
                  busy={approve.busy}
                />
              ))}
              {data.sheets.length === 0 && <p className="ui-meta">Bu başlıkta fiş yok.</p>}
            </div>
          </Panel>
          {vocab.data ? (
            <TagFormPanel titleId={titleId} vocab={vocab.data} sheets={data.sheets} onSaved={refreshAll} />
          ) : vocab.error ? (
            <NotReady detail={`Sözlük yüklenemedi: ${vocab.error.message}`} onRetry={vocab.refetch} />
          ) : (
            <LoadingBlock lines={3} />
          )}
        </>
      )}
    </Loadable>
  )
}

function Effective({ data, vocab }: { data: TitleTagging; vocab: TagVocabulary | undefined }): ReactElement {
  const e = data.effective
  const scaleName = (k: string) => vocab?.scales.find((s) => s.key === k)
  const facetName = (k: string) => vocab?.facets.find((f) => f.key === k)
  const descName = (k: string) => {
    for (const s of vocab?.scales ?? []) for (const d of s.descriptors) if (d.key === k) return d.adjective
    return k
  }
  const scales = Object.entries(e.scales)
  const facets = Object.entries(e.facets).filter(([, v]) => v.length)
  return (
    <div className="st-effective">
      <p className="ui-meta">
        Geçerli etiketler: <strong>{BASIS_LABEL[e.basis]}</strong>
        {e.basis === 'CONSENSUS' && (
          <>
            {' '}
            · {e.sheetCount} onaylı fiş · uyum {e.agreement === null ? 'tek fiş' : fmtPct(e.agreement, 0)}
          </>
        )}
      </p>
      {scales.length === 0 && facets.length === 0 ? (
        <p className="ui-meta">Etiket yok.</p>
      ) : (
        <div className="st-effective__grid">
          <dl className="st-dl st-dl--tight">
            {scales.map(([k, v]) => {
              const s = scaleName(k)
              return (
                <div key={k} className="st-dl__row">
                  <dt>{s?.name ?? k}</dt>
                  <dd>
                    <span className="st-level">{v}</span> {s?.levels[v]?.label}
                  </dd>
                </div>
              )
            })}
          </dl>
          <div>
            {facets.map(([k, vals]) => {
              const f = facetName(k)
              return (
                <p key={k} className="st-facetline">
                  <span className="st-dim">{f?.name ?? k}:</span>{' '}
                  {vals.map((v) => (
                    <Chip key={v}>{f?.values.find((x) => x.key === v)?.name ?? v}</Chip>
                  ))}
                </p>
              )
            })}
            {e.descriptors.length > 0 && (
              <p className="st-facetline">
                <span className="st-dim">Niteleyiciler:</span>{' '}
                {e.descriptors.map((d) => (
                  <Chip key={d} tone="accent">
                    {descName(d)}
                  </Chip>
                ))}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TitleMicrogenres({
  res,
  before,
}: {
  res: ReturnType<typeof useStudio<Microgenre[]>>
  before: Microgenre[] | null
}): ReactElement {
  const list = res.data ?? []
  const prev = before ? new Set(before.map((m) => m.id)) : null
  const now = new Set(list.map((m) => m.id))
  const removed = before?.filter((m) => !now.has(m.id)) ?? []
  return (
    <div className="st-titlemg">
      <h3 className="st-h4">Bu başlığın mikro türleri {res.data && <span className="st-dim">· {list.length}</span>}</h3>
      {res.error && !res.data && <p className="ui-meta">Mikro türler yüklenemedi: {res.error.message}</p>}
      <div className="st-chips">
        {list.map((m) => (
          <Link key={m.id} to={`/studyo/mikro-turler/${m.id}`} className="st-chiplink">
            <Chip tone={prev && !prev.has(m.id) ? 'accent' : m.layer === 'VISIBLE' ? 'neutral' : 'muted'}>
              {prev && !prev.has(m.id) && 'Yeni · '}
              {m.name}
            </Chip>
          </Link>
        ))}
        {removed.map((m) => (
          <Chip key={m.id} tone="warn">
            Çıktı · {m.name}
          </Chip>
        ))}
      </div>
      {prev && (
        <p className="ui-caption">
          Onaydan önceki listeyle karşılaştırıldı: yeni gelenler vurgulu, çıkanlar ayrıca gösterilir.
        </p>
      )}
    </div>
  )
}

function SheetCard({
  s,
  vocab,
  onApprove,
  busy,
}: {
  s: TagSheet
  vocab: TagVocabulary | undefined
  onApprove: (s: TagSheet) => void
  busy: boolean
}): ReactElement {
  const rated = Object.entries(s.scales).filter((e): e is [string, number] => e[1] !== null)
  const facetCount = Object.values(s.facets).reduce((a, v) => a + v.length, 0)
  return (
    <article className="st-sheet">
      <header className="st-sheet__head">
        <Chip tone={SHEET_SOURCE_TONE[s.source]}>{SHEET_SOURCE_LABEL[s.source]}</Chip>
        {s.tagger && <span className="st-mono">{s.tagger}</span>}
        <Chip tone={s.status === 'APPROVED' ? 'ok' : s.status === 'SUBMITTED' ? 'accent' : 'muted'}>
          {STATUS_LABEL[s.status]}
        </Chip>
        <span className="st-dim">
          {s.watched ? 'izlendi' : 'izlenmeden'} · {fmtDate(s.taggedAt)} · {rated.length} ölçek · {facetCount} yüz
          değeri
        </span>
        {s.source === 'TAGGER' && s.status === 'SUBMITTED' && (
          <Button variant="accent" size="sm" onClick={() => onApprove(s)} busy={busy} disabled={busy}>
            Onayla
          </Button>
        )}
      </header>
      {s.notes && <p className="ui-meta st-sheet__notes">{s.notes}</p>}
      <Disclosure summary="Fişin değerleri">
        <p className="ui-caption">
          {rated.map(([k, v]) => `${vocab?.scales.find((x) => x.key === k)?.name ?? k} ${v}`).join(' · ') ||
            'Ölçek yok'}
        </p>
        <p className="ui-caption">
          {Object.entries(s.facets)
            .filter(([, v]) => v.length)
            .map(([k, v]) => {
              const f = vocab?.facets.find((x) => x.key === k)
              return `${f?.name ?? k}: ${v.map((x) => f?.values.find((y) => y.key === x)?.name ?? x).join(', ')}`
            })
            .join(' · ') || 'Yüz yok'}
        </p>
      </Disclosure>
    </article>
  )
}

/* ───────────── Etiketleme formu ───────────── */

function TagFormPanel({
  titleId,
  vocab,
  sheets,
  onSaved,
}: {
  titleId: number
  vocab: TagVocabulary
  sheets: TagSheet[]
  onSaved: () => void
}): ReactElement {
  const [tagger, setTagger] = useState(readTagger)
  const own = sheets.find((s) => s.source === 'TAGGER' && s.tagger === tagger) ?? null
  const [form, setForm] = useState<TagFormState>(() => initialForm(vocab, own))
  const [issues, setIssues] = useState<FormIssue[]>([])
  const action = useAction()
  // Etiketleyici değişince (ya da kendi fişi yeni geldiyse) form o fişle yeniden kurulur
  const ownKey = own ? `${own.tagger}-${own.status}-${own.taggedAt}` : `yok-${tagger}`
  const lastKey = useRef(ownKey)
  useEffect(() => {
    if (lastKey.current === ownKey) return
    lastKey.current = ownKey
    setForm(initialForm(vocab, own))
    setIssues([])
  }, [ownKey, own, vocab])

  const modelSheet = sheets.find((s) => s.source === 'MODEL') ?? null
  const save = async (status: 'DRAFT' | 'SUBMITTED') => {
    const found = validateForm(vocab, form, tagger, status)
    setIssues(found)
    if (found.length) return
    writeTagger(tagger)
    const r = await action.run(() =>
      studioSend<TagSheet>(
        'PUT',
        `/tagging/titles/${titleId}/sheets/${encodeURIComponent(tagger)}`,
        toInput(form, status),
      ),
    )
    if (r) {
      toast(status === 'DRAFT' ? 'Taslak kaydedildi.' : 'Fiş gönderildi; onay bekliyor.', { kind: 'success' })
      onSaved()
    }
  }
  const issueAt = (path: string) => issues.find((i) => i.path === path)?.message ?? null

  return (
    <Panel
      id="etiket-formu"
      title="Etiketleme formu"
      sub={
        own
          ? `${tagger} fişi: ${STATUS_LABEL[own.status]} (${fmtDate(own.taggedAt)})`
          : 'Bu başlık için yeni fiş. Seçili seviyenin altında kılavuzdaki ölçüt yazar.'
      }
      actions={
        modelSheet && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setForm({ ...initialForm(vocab, modelSheet), watched: form.watched, notes: form.notes })}
          >
            Model önerisinden doldur
          </Button>
        )
      }
    >
      <div className="st-form-row">
        <TextField
          label="Etiketleyici kimliği"
          hint="Takma ad; bu tarayıcıda hatırlanır"
          value={tagger}
          onChange={(v) => setTagger(v.trim().toLowerCase())}
          error={issueAt('tagger')}
          autoComplete="off"
          spellCheck={false}
        />
        <Switch
          checked={form.watched}
          onChange={(w) => setForm({ ...form, watched: w })}
          label="İzledim"
          description="Yapımı baştan sona izlediyseniz açın. Göndermek için gerekir."
        />
      </div>
      {issueAt('watched') && <p className="st-error">{issueAt('watched')}</p>}
      {(['ADVISORY', 'TONE', 'STORY', 'FORM'] as const).map((g) => {
        const scales = vocab.scales.filter((s) => s.group === g)
        if (!scales.length) return null
        return (
          <fieldset key={g} className="st-fieldset">
            <legend>{GROUP_LABEL[g]}</legend>
            {scales.map((s) => (
              <ScaleInput
                key={s.key}
                scale={s}
                value={form.scales[s.key] ?? null}
                onChange={(v) => setForm(setScale(form, s.key, v))}
                error={issueAt(`scales.${s.key}`)}
              />
            ))}
          </fieldset>
        )
      })}
      <fieldset className="st-fieldset">
        <legend>Yüzler</legend>
        {vocab.facets.map((f) => {
          const sel = form.facets[f.key] ?? []
          return (
            <div key={f.key} className="st-facet" role="group" aria-labelledby={`yuz-${f.key}`}>
              <p className="st-facet__head" id={`yuz-${f.key}`}>
                <strong>{f.name}</strong> <span className="st-dim">— {f.question}</span>{' '}
                <span className="st-dim">
                  ({sel.length}/{f.max}
                  {f.slot ? ` · ad yuvası ${SLOT_LABEL[f.slot] ?? f.slot}` : ''})
                </span>
              </p>
              <div className="st-chips">
                {f.values.map((v) => {
                  const on = sel.includes(v.key)
                  const full = !on && f.multi && sel.length >= f.max
                  return (
                    <button
                      key={v.key}
                      type="button"
                      className={on ? 'st-toggle is-on' : 'st-toggle'}
                      aria-pressed={on}
                      aria-disabled={full || undefined}
                      title={v.description ?? v.phrase ?? undefined}
                      onClick={() => {
                        const r = toggleFacet(form, f, v.key)
                        if (r.blocked) toast(`${f.name}: en çok ${f.max} değer seçilebilir.`, { kind: 'info' })
                        else setForm(r.state)
                      }}
                    >
                      {v.name}
                    </button>
                  )
                })}
              </div>
              {issueAt(`facets.${f.key}`) && <p className="st-error">{issueAt(`facets.${f.key}`)}</p>}
            </div>
          )
        })}
      </fieldset>
      <label className="st-textarea">
        <span className="st-select__label">Notlar</span>
        <textarea
          value={form.notes}
          maxLength={2000}
          rows={3}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Kararı etkileyen sahneler, kararsız kalınan ölçekler"
        />
        <span className="ui-caption">{form.notes.length}/2000</span>
      </label>
      {issueAt('notes') && <p className="st-error">{issueAt('notes')}</p>}
      {issueAt('scales') && <p className="st-error">{issueAt('scales')}</p>}
      {action.error && (
        <p className="st-error" role="alert">
          {action.error}
        </p>
      )}
      <div className="st-actions">
        <span className="ui-meta">
          {ratedCount(form)}/{vocab.scales.length} ölçek değerlendirildi
        </span>
        <Button variant="secondary" size="sm" onClick={() => save('DRAFT')} disabled={action.busy}>
          Taslak kaydet
        </Button>
        <Button variant="accent" size="sm" onClick={() => save('SUBMITTED')} busy={action.busy} disabled={action.busy}>
          Gönder
        </Button>
      </div>
    </Panel>
  )
}

/** 0–5 bölümlü ölçek denetimi: radyo grubu; ←/→ ile gezilir; seçili seviyeye yeniden basmak seçimi kaldırır. */
function ScaleInput({
  scale,
  value,
  onChange,
  error,
}: {
  scale: TagScale
  value: number | null
  onChange: (v: number) => void
  error: string | null
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const level = value === null ? null : scale.levels[value]
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const cur = value ?? (e.key === 'ArrowRight' ? -1 : scale.levels.length)
    const next = Math.max(0, Math.min(scale.levels.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)))
    if (next !== value) onChange(next)
    ref.current?.querySelector<HTMLElement>(`[data-v="${next}"]`)?.focus()
  }
  const labelId = `olcek-${scale.key}`
  return (
    <div className="st-scale">
      <div className="st-scale__head">
        <span id={labelId} className="st-scale__name">
          {scale.name}
        </span>
        <span className="st-dim st-scale__q">{scale.question}</span>
      </div>
      <div ref={ref} className="st-scale__seg" role="radiogroup" aria-labelledby={labelId} onKeyDown={onKey}>
        {scale.levels.map((l) => {
          const on = value === l.value
          return (
            <button
              key={l.value}
              type="button"
              role="radio"
              data-v={l.value}
              aria-checked={on}
              tabIndex={on || (value === null && l.value === 0) ? 0 : -1}
              className={on ? 'st-scale__btn is-on' : 'st-scale__btn'}
              onClick={() => onChange(l.value)}
              title={l.label}
            >
              <span className="st-scale__v">{l.value}</span>
              <span className="st-scale__l">{l.label}</span>
            </button>
          )
        })}
      </div>
      <p className="st-scale__crit" aria-live="polite">
        {level ? (
          <>
            <strong>
              {level.value} · {level.label}:
            </strong>{' '}
            {level.description}
            {scale.advisory && (
              <span className="st-dim"> · önerilen en düşük işaret {scale.advisory.ratings[level.value]}</span>
            )}
          </>
        ) : (
          <span className="st-dim">Değerlendirilmedi</span>
        )}
      </p>
      {error && <p className="st-error">{error}</p>}
    </div>
  )
}
