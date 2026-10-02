import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { Navigate } from 'react-router-dom'
import { Pager } from '../components/Pager'
import { Page } from '../components/Shell'
import { Tile } from '../components/Tile'
import { categoryById, childCategories, content, symbolUrl, type Category } from '../content'
import { allItems, frequentIds, gridDims, itemsInCategory, type BoardItem } from '../features/board/items'
import { SentenceStrip } from '../features/board/SentenceStrip'
import { useSelectItem, useSelectQuick, useSelectTemplate } from '../features/board/useSelect'
import { t } from '../i18n'
import { canSay } from '../lib/srs'
import { usePersonalItems, useSettings, useSrsStates } from '../lib/hooks'
import { compareTr, firstLetter, lowerTr, TURKISH_ALPHABET, upperTr } from '../lib/text'
import { Icon } from '../components/Icon'

type RootTile =
  | { kind: 'link'; id: string; label: string; to: string; icon?: Parameters<typeof Icon>[0]['name']; symbol?: string }
  | { kind: 'category'; category: Category }

function CanSayBadge() {
  return (
    <span title={t('board.canSay')}>
      <Icon name="check" size={24} strokeWidth={2.4} />
    </span>
  )
}

function ItemTile({ item, onSelect }: { item: BoardItem; onSelect: (i: BoardItem) => void }) {
  const settings = useSettings()
  const srs = useSrsStates()
  const said = canSay(srs.get(item.id))
  return (
    <Tile
      label={item.label}
      symbol={item.symbol}
      photo={item.photo}
      fitz={item.fitz}
      holdMs={settings.holdMs}
      onSelect={() => onSelect(item)}
      badge={said ? <CanSayBadge /> : undefined}
      description={said ? t('board.canSay') : undefined}
      testId={`item-${item.id}`}
    />
  )
}

/** Konuş: kategoriler, hızlı ihtiyaçlar, kalıplar, harfle bulma. Sık kullanılanlar ayrı satırda. */
export function BoardRoot() {
  const settings = useSettings()
  const navigate = useNavigate()
  const personal = usePersonalItems()
  const select = useSelectItem()
  const { cols, rows } = gridDims(settings)
  const frequent = useLiveQuery(() => frequentIds(cols), [cols], [])
  const all = allItems(personal, settings)
  const frequentItems = frequent.flatMap((f) => all.filter((i) => i.id === f.id))

  const tiles: RootTile[] = [
    { kind: 'link', id: 'hizli', label: t('board.quick'), to: '/konus/hizli', icon: 'quick' },
    ...childCategories(undefined).map((c): RootTile => ({ kind: 'category', category: c })),
    { kind: 'link', id: 'kaliplar', label: t('board.templates'), to: '/konus/kaliplar', icon: 'template' },
    { kind: 'link', id: 'harf', label: t('board.letters'), to: '/konus/harf', icon: 'letters' },
  ]

  return (
    <Page title={t('board.title')} back="/" hideTitle className="board">
      <SentenceStrip />
      <section className="frequent" aria-label={t('board.frequent')}>
        <div className="frequent-row" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {frequentItems.length === 0 ? <span className="placeholder">{t('board.frequentHint')}</span> : null}
          {frequentItems.map((item) => (
            <ItemTile key={item.id} item={item} onSelect={select} />
          ))}
        </div>
      </section>
      <Pager
        pageKey="root"
        items={tiles}
        cols={cols}
        rows={Math.max(2, rows - 1)}
        title={t('board.title')}
        render={(tile) =>
          tile.kind === 'link' ? (
            <Tile
              label={tile.label}
              icon={tile.icon}
              symbol={tile.symbol}
              holdMs={settings.holdMs}
              onSelect={() => navigate(tile.to)}
              testId={`tile-${tile.id}`}
            />
          ) : (
            <Tile
              label={tile.category.label}
              symbol={symbolUrl(tile.category.symbol)}
              fitz={tile.category.fitz}
              holdMs={settings.holdMs}
              onSelect={() => navigate(`/konus/k/${tile.category.id}`)}
              testId={`cat-${tile.category.id}`}
            />
          )
        }
      />
    </Page>
  )
}

/** Kategori: alt kategoriler ya da kartlar. En fazla 3 seviye (Yiyecek → Kahvaltı → Peynir). */
export function CategoryPage() {
  const { categoryId = '' } = useParams()
  const category = categoryById.get(categoryId)
  const settings = useSettings()
  const navigate = useNavigate()
  const personal = usePersonalItems()
  const select = useSelectItem()
  if (!category) return <Navigate to="/konus" replace />
  const { cols, rows } = gridDims(settings)
  const children = childCategories(category.id)
  const back = category.parent ? `/konus/k/${category.parent}` : '/konus'

  if (children.length) {
    return (
      <Page title={category.label} back={back} hideTitle className="board">
        <SentenceStrip />
        <Pager
          pageKey={category.id}
          items={children}
          cols={cols}
          rows={rows}
          title={category.label}
          render={(c) => (
            <Tile
              label={c.label}
              symbol={symbolUrl(c.symbol)}
              fitz={c.fitz}
              holdMs={settings.holdMs}
              onSelect={() => navigate(`/konus/k/${c.id}`)}
              testId={`cat-${c.id}`}
            />
          )}
        />
      </Page>
    )
  }

  const items = itemsInCategory(category.id, personal, settings)
  const extra: ('body' | BoardItem)[] = category.id === 'vucut' ? ['body', ...items] : items
  return (
    <Page title={category.label} back={back} hideTitle className="board">
      <SentenceStrip />
      {items.length === 0 ? <p className="note">{t('board.empty')}</p> : null}
      <Pager
        pageKey={category.id}
        items={extra}
        cols={cols}
        rows={rows}
        title={category.label}
        render={(item) =>
          item === 'body' ? (
            <Tile
              label={t('board.bodyMap')}
              icon="body"
              tone="urgent"
              holdMs={settings.holdMs}
              onSelect={() => navigate('/konus/vucut-haritasi')}
              testId="tile-body-map"
            />
          ) : (
            <ItemTile item={item} onSelect={select} />
          )
        }
      />
    </Page>
  )
}

export function QuickNeedsPage() {
  const settings = useSettings()
  const navigate = useNavigate()
  const select = useSelectQuick()
  const { cols, rows } = gridDims(settings)
  type QuickTile = (typeof content.quick)[number] | 'body'
  const tiles: QuickTile[] = [...content.quick, 'body']
  return (
    <Page title={t('board.quick')} back="/konus" hideTitle className="board">
      <SentenceStrip />
      <Pager
        pageKey="quick"
        items={tiles}
        cols={cols}
        rows={rows}
        title={t('board.quick')}
        render={(q) =>
          q === 'body' ? (
            <Tile
              label={t('board.bodyMap')}
              icon="body"
              tone="urgent"
              holdMs={settings.holdMs}
              onSelect={() => navigate('/konus/vucut-haritasi')}
              testId="tile-body-map"
            />
          ) : (
            <Tile
              label={q.label}
              symbol={q.symbol ? symbolUrl(q.symbol) : undefined}
              icon={q.icon}
              tone={q.tone}
              holdMs={settings.holdMs}
              onSelect={() => select(q)}
              testId={`quick-${q.id}`}
            />
          )
        }
      />
    </Page>
  )
}

export function TemplatesPage() {
  const settings = useSettings()
  const select = useSelectTemplate()
  const { cols, rows } = gridDims(settings)
  return (
    <Page title={t('board.templates')} back="/konus" hideTitle className="board">
      <SentenceStrip />
      <Pager
        pageKey="templates"
        items={content.templates}
        cols={Math.min(cols, 2)}
        rows={rows}
        title={t('board.templates')}
        render={(tpl) => (
          <Tile
            label={tpl.label}
            symbol={symbolUrl(tpl.symbol)}
            fitz="eylemler"
            holdMs={settings.holdMs}
            onSelect={() => select(tpl)}
            testId={`tpl-${tpl.id}`}
          />
        )}
      />
    </Page>
  )
}

/** İlk harf veya hece ile bulma: harf → (gerekirse) ilk hece → kartlar. */
export function LettersPage() {
  const { letter, syllable } = useParams()
  const settings = useSettings()
  const navigate = useNavigate()
  const personal = usePersonalItems()
  const select = useSelectItem()
  const { cols, rows } = gridDims(settings)
  const all = allItems(personal, settings)
  const perPage = cols * rows

  if (!letter) {
    const available = TURKISH_ALPHABET.filter((l) => all.some((i) => firstLetter(i.word) === l))
    return (
      <Page title={t('board.letterTitle')} back="/konus" hideTitle className="board">
        <SentenceStrip />
        <Pager
          pageKey="letters"
          items={[...available]}
          cols={Math.max(cols, 4)}
          rows={rows}
          title={t('board.letterTitle')}
          render={(l) => (
            <button
              type="button"
              className="btn letter-btn"
              onClick={() => navigate(`/konus/harf/${encodeURIComponent(l)}`)}
              data-testid={`letter-${l}`}
            >
              {upperTr(l)}
            </button>
          )}
        />
      </Page>
    )
  }

  const byLetter = all.filter((i) => firstLetter(i.word) === letter).sort((a, b) => compareTr(a.word, b.word))
  const firstSyllable = (i: BoardItem) =>
    lowerTr(content.words.find((w) => w.id === i.id)?.syllables[0] ?? i.word.slice(0, 2))
  const syllables = [...new Set(byLetter.map(firstSyllable))].sort(compareTr)
  const back = syllable ? `/konus/harf/${encodeURIComponent(letter)}` : '/konus/harf'

  if (!syllable && byLetter.length > perPage && syllables.length > 1) {
    return (
      <Page title={t('board.syllableTitle')} back={back} hideTitle className="board">
        <SentenceStrip />
        <Pager
          pageKey={`syl-${letter}`}
          items={['*', ...syllables]}
          cols={cols}
          rows={rows}
          title={`${upperTr(letter)} — ${t('board.syllableTitle')}`}
          render={(s) => (
            <button
              type="button"
              className="btn letter-btn"
              onClick={() => navigate(`/konus/harf/${encodeURIComponent(letter)}/${encodeURIComponent(s)}`)}
            >
              {s === '*' ? t('board.allWords') : `${s}…`}
            </button>
          )}
        />
      </Page>
    )
  }

  const items = syllable && syllable !== '*' ? byLetter.filter((i) => firstSyllable(i) === syllable) : byLetter
  return (
    <Page title={upperTr(letter)} back={back} hideTitle className="board">
      <SentenceStrip />
      <Pager
        pageKey={`words-${letter}-${syllable ?? ''}`}
        items={items}
        cols={cols}
        rows={rows}
        title={syllable && syllable !== '*' ? `${syllable}…` : upperTr(letter)}
        render={(item) => <ItemTile item={item} onSelect={select} />}
      />
    </Page>
  )
}
