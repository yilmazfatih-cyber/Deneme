/**
 * Mikro tür gezgini (docs/ICERIK_ZEKASI.md §4; uçlar /api/studio/microgenres*).
 * Özet satırı · süzgeçler (çekirdek tür, yuva, katman, en az boyut, metin) · liste · ayrıntı (tanım + başlıklar) ·
 * bir başlıktan onun mikro türleri.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Microgenre, MicrogenreList } from '../../../../shared/intelligence'
import { MICROGENRE_SLOTS } from '../../../../shared/tagging-schema'
import { GENRES } from '../../../../shared/taxonomy'
import { Button, TextField } from '../../ui'
import { useStudio } from './api'
import { fmtDateTime, fmtInt } from './format'
import { Chip, Loadable, LoadingBlock, Panel, SectionHead, SLOT_LABEL, Stat, TYPE_LABEL } from './parts'
import { StudioTitleCard, titleName, useTitleIndex } from './titles'

const PAGE = 50

const genreName = (k: string): string => (GENRES as Record<string, { name: string }>)[k]?.name ?? k

export function MicrogenresSection(): ReactElement {
  const { id } = useParams()
  const [core, setCore] = useState('')
  const [slot, setSlot] = useState('')
  const [layer, setLayer] = useState('')
  const [minSize, setMinSize] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (core) p.set('core', core)
    if (slot) p.set('slot', slot)
    if (layer) p.set('layer', layer)
    const n = Number(minSize)
    if (minSize.trim() && Number.isInteger(n) && n >= 1) p.set('minSize', String(n))
    if (q.trim()) p.set('q', q.trim().slice(0, 100))
    p.set('first', String(PAGE))
    p.set('offset', String(page * PAGE))
    return p.toString()
  }, [core, slot, layer, minSize, q, page])
  const list = useStudio<MicrogenreList>(`/microgenres?${query}`)
  const reset = () => setPage(0)
  return (
    <>
      <SectionHead
        title="Mikro Türler"
        lead="Çekirdek tür ve onu daraltan yuvalar: sıfat, köken, mekân, dönem, konu, kişi. Görünen katman ana sayfada satır olabilir; görünmeyen katman benzerliği ve gerekçeyi besler."
      />
      <Loadable res={list} what="Mikro türler" skeleton={<LoadingBlock lines={2} block={false} />}>
        {(d) => (
          <div className="st-stats">
            <Stat label="Toplam" value={fmtInt(d.stats.total)} />
            <Stat label="Görünen" value={fmtInt(d.stats.visible)} note="≥ 4 başlık, ≤ 2 yuva" />
            <Stat label="Görünmeyen" value={fmtInt(d.stats.hidden)} />
            <Stat label="Kapsanan başlık" value={fmtInt(d.stats.coveredTitles)} />
            <Stat label="Tanımlanabilir alan" value={fmtInt(d.stats.possibleDefinitions)} note="kuramsal birleşim" />
            <Stat
              label="Üretildi"
              value={<span className="st-small">{fmtDateTime(d.stats.generatedAt)}</span>}
              note={`kılavuz ${d.stats.rubricVersion}`}
            />
          </div>
        )}
      </Loadable>
      <div className="st-split st-split--wide">
        <Panel title="Liste" className="st-split__side">
          <div className="st-filters st-filters--grid">
            <label className="st-select">
              <span className="st-select__label">Çekirdek tür</span>
              <select value={core} onChange={(e) => (setCore(e.target.value), reset())}>
                <option value="">Tümü</option>
                {Object.entries(GENRES).map(([k, g]) => (
                  <option key={k} value={k}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="st-select">
              <span className="st-select__label">Yuva</span>
              <select value={slot} onChange={(e) => (setSlot(e.target.value), reset())}>
                <option value="">Tümü</option>
                {MICROGENRE_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {SLOT_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
            </label>
            <label className="st-select">
              <span className="st-select__label">Katman</span>
              <select value={layer} onChange={(e) => (setLayer(e.target.value), reset())}>
                <option value="">Tümü</option>
                <option value="VISIBLE">Görünen</option>
                <option value="HIDDEN">Görünmeyen</option>
              </select>
            </label>
            <TextField
              label="En az başlık"
              inputMode="numeric"
              value={minSize}
              onChange={(v) => (setMinSize(v.replace(/\D/g, '')), reset())}
            />
            <TextField
              label="Ad içinde ara"
              value={q}
              onChange={(v) => (setQ(v), reset())}
              className="st-filters__wide"
            />
          </div>
          <Loadable res={list} what="Mikro türler" skeleton={<LoadingBlock lines={6} block={false} />}>
            {(d) => (
              <>
                <p className="ui-caption" role="status">
                  {fmtInt(d.total)} sonuç
                  {d.total > PAGE ? ` · ${page * PAGE + 1}–${Math.min(d.total, (page + 1) * PAGE)}` : ''}
                </p>
                <ul className="st-mglist">
                  {d.items.map((m) => (
                    <li key={m.id}>
                      <Link
                        to={`/studyo/mikro-turler/${m.id}`}
                        className={m.id === id ? 'st-mgitem is-on' : 'st-mgitem'}
                      >
                        <span className="st-mgitem__name">{m.name}</span>
                        <span className="st-mgitem__meta">
                          <span className="st-num">{m.size} başlık</span>
                          <Chip tone={m.layer === 'VISIBLE' ? 'accent' : 'muted'}>
                            {m.layer === 'VISIBLE' ? 'Görünen' : 'Görünmeyen'}
                          </Chip>
                          {m.definition.slots.map((s) => (
                            <Chip key={`${s.slot}-${s.key}`}>{SLOT_LABEL[s.slot] ?? s.slot}</Chip>
                          ))}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {d.items.length === 0 && <li className="ui-meta">Bu süzgeçle mikro tür yok.</li>}
                </ul>
                {d.total > PAGE && (
                  <div className="st-actions">
                    <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                      Önceki
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={(page + 1) * PAGE >= d.total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Sonraki
                    </Button>
                  </div>
                )}
              </>
            )}
          </Loadable>
        </Panel>
        <div className="st-split__main">
          {id ? (
            <MicrogenreDetail id={id} />
          ) : (
            <Panel>
              <p className="ui-meta">Listeden bir mikro tür seçin.</p>
            </Panel>
          )}
          <ByTitle />
        </div>
      </div>
    </>
  )
}

function MicrogenreDetail({ id }: { id: string }): ReactElement {
  const mg = useStudio<Microgenre>(`/microgenres/${encodeURIComponent(id)}`)
  return (
    <Loadable res={mg} what="Mikro tür" skeleton={<LoadingBlock lines={3} />}>
      {(m) => (
        <Panel
          title={m.name}
          sub={<span className="st-mono">{m.id}</span>}
          actions={
            <Chip tone={m.layer === 'VISIBLE' ? 'accent' : 'muted'}>
              {m.layer === 'VISIBLE' ? 'Görünen katman' : 'Görünmeyen katman'}
            </Chip>
          }
        >
          <dl className="st-dl">
            <dt>Çekirdek tür</dt>
            <dd>
              {genreName(m.definition.core)}
              {m.definition.type && (
                <span className="st-dim"> · yalnız {TYPE_LABEL[m.definition.type].toLocaleLowerCase('tr')}</span>
              )}
            </dd>
            <dt>Yuvalar</dt>
            <dd className="st-chips">
              {m.definition.slots.length === 0
                ? 'Yok (çıplak tür)'
                : m.definition.slots.map((s) => (
                    <Chip key={`${s.slot}-${s.key}`}>
                      {SLOT_LABEL[s.slot] ?? s.slot}: {s.key}
                    </Chip>
                  ))}
            </dd>
            <dt>Boyut</dt>
            <dd>
              {m.size} başlık · özgüllük {m.specificity}
            </dd>
          </dl>
          <div className="st-cards">
            {m.titleIds.map((t) => (
              <StudioTitleCard key={t} id={t} />
            ))}
          </div>
        </Panel>
      )}
    </Loadable>
  )
}

function ByTitle(): ReactElement {
  const idx = useTitleIndex()
  const navigate = useNavigate()
  const [titleId, setTitleId] = useState<number | null>(null)
  const res = useStudio<Microgenre[]>(titleId ? `/microgenres/by-title/${titleId}` : null)
  const options = useMemo(() => [...idx.values()].sort((a, b) => a.title.localeCompare(b.title, 'tr')), [idx])
  return (
    <Panel title="Başlıktan mikro türlere" sub="Bir başlığın girdiği tüm mikro türler, dardan genişe">
      <label className="st-select">
        <span className="st-select__label">Başlık</span>
        <select value={titleId ?? ''} onChange={(e) => setTitleId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Seçin</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
      {titleId !== null && (
        <Loadable res={res} what="Başlığın mikro türleri" skeleton={<LoadingBlock lines={2} block={false} />}>
          {(list) => (
            <>
              <p className="ui-caption">
                {titleName(idx, titleId)} · {list.length} mikro tür
              </p>
              <ul className="st-mglist">
                {[...list]
                  .sort((a, b) => b.specificity - a.specificity || a.size - b.size)
                  .map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="st-mgitem"
                        onClick={() => navigate(`/studyo/mikro-turler/${m.id}`)}
                      >
                        <span className="st-mgitem__name">{m.name}</span>
                        <span className="st-mgitem__meta">
                          <span className="st-num">{m.size} başlık</span>
                          <Chip tone={m.layer === 'VISIBLE' ? 'accent' : 'muted'}>
                            {m.layer === 'VISIBLE' ? 'Görünen' : 'Görünmeyen'}
                          </Chip>
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </Loadable>
      )}
    </Panel>
  )
}
