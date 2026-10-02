import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { BigButton, Page } from '../components/Shell'
import { categoryById, content, wordById } from '../content'
import { db, newId, updateSettings, type GridSize, type LayoutMode, type PersonalItem, type Profile } from '../db'
import { useToast } from '../features/board/store'
import { stopsInOrder } from '../features/journey/learn'
import { toCsv } from '../features/journey/progress'
import { t } from '../i18n'
import { backupFilename, createBackup, downloadBlob, readBackupSummary, restoreBackup } from '../lib/backup'
import { useBlobUrl, usePersonalItems, useProfile, useSettings } from '../lib/hooks'
import { recordingSupported, resizeImage, startRecording, type Recording } from '../lib/media'
import { checkTurkishVoice, loadVoices, speak, turkishVoices, type VoiceCheck } from '../lib/speech'
import {
  canPromptInstall,
  isIos,
  isPersisted,
  isStandalone,
  onInstallAvailable,
  promptInstall,
  requestPersistence,
} from '../lib/storage'
import { capitalizeTr, compareTr } from '../lib/text'

const leafCategories = content.categories.filter((c) => !content.categories.some((x) => x.parent === c.id))

function categoryLabel(id: string): string {
  const c = categoryById.get(id)
  if (!c) return id
  const parent = c.parent ? categoryById.get(c.parent) : undefined
  return parent ? `${parent.label} › ${c.label}` : c.label
}

export function CaregiverHome() {
  const navigate = useNavigate()
  const links: { to: string; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
    { to: '/ayarlar/kartlar', label: t('cg.items'), icon: 'camera' },
    { to: '/ayarlar/ben', label: t('cg.profile'), icon: 'person' },
    { to: '/ayarlar/gorunum', label: t('cg.display'), icon: 'settings' },
    { to: '/ayarlar/ses', label: t('cg.voice'), icon: 'speak' },
    { to: '/ayarlar/yolculuk', label: t('cg.journey'), icon: 'learn' },
    { to: '/ayarlar/rapor', label: t('cg.report'), icon: 'download' },
    { to: '/ayarlar/yedek', label: t('cg.backup'), icon: 'upload' },
    { to: '/kurulum', label: t('cg.setup'), icon: 'check' },
    { to: '/ayarlar/hakkinda', label: t('cg.about'), icon: 'unknown' },
  ]
  return (
    <Page title={t('cg.title')} back="/">
      <p className="hint">{t('cg.subtitle')}</p>
      <div className="menu">
        {links.map((l) => (
          <button key={l.to} type="button" className="btn btn-secondary menu-btn" onClick={() => navigate(l.to)}>
            <Icon name={l.icon} />
            <span>{l.label}</span>
          </button>
        ))}
      </div>
    </Page>
  )
}

function Thumb({ item }: { item: PersonalItem }) {
  const url = useBlobUrl(item.photo)
  const replaced = item.replacesId ? wordById.get(item.replacesId) : undefined
  return url ? (
    <img src={url} alt="" className="thumb" />
  ) : replaced ? (
    <img src={`${import.meta.env.BASE_URL}${replaced.symbol}`} alt="" className="thumb" />
  ) : (
    <span className="thumb tile-initial">{item.word.charAt(0)}</span>
  )
}

export function PersonalItemsPage() {
  const navigate = useNavigate()
  const items = usePersonalItems()
  return (
    <Page title={t('cg.items')} back="/ayarlar">
      <BigButton
        icon="plus"
        label={t('cg.addItem')}
        onClick={() => navigate('/ayarlar/kartlar/yeni')}
        testId="item-add"
      />
      {items.length === 0 ? <p className="note">{t('item.none')}</p> : null}
      <ul className="list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="btn btn-secondary list-btn"
              onClick={() => navigate(`/ayarlar/kartlar/${item.id}`)}
            >
              <Thumb item={item} />
              <span className="list-text">
                <span className="list-label">{capitalizeTr(item.word)}</span>
                <span className="list-sub">{categoryLabel(item.category)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Page>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

/** Kişisel kart: fotoğraf çek, kelimeyi yaz, sesi kaydet. Silme her zaman onaylı ve geri alınabilir. */
export function ItemEditor() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const showToast = useToast((s) => s.show)
  const existing = useLiveQuery(
    () => (itemId && itemId !== 'yeni' ? db.personalItems.get(itemId) : undefined),
    [itemId],
  )
  const [draft, setDraft] = useState<PersonalItem | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [micNote, setMicNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isNew = !itemId || itemId === 'yeni'

  const item: PersonalItem = draft ??
    existing ?? {
      id: '',
      word: '',
      category: 'kisiler',
      phrases: [],
      createdAt: 0,
    }
  const photoUrl = useBlobUrl(item.photo)
  const update = (patch: Partial<PersonalItem>) => setDraft({ ...item, ...patch })

  useEffect(() => () => recording?.cancel(), [recording])

  const onPhoto = async (file: File | undefined) => {
    if (!file) return
    update({ photo: await resizeImage(file) })
  }

  const toggleRecord = async () => {
    if (recording) {
      const blob = await recording.stop()
      setRecording(null)
      update({ audio: blob })
      return
    }
    setMicNote(t('item.micExplain'))
    try {
      setRecording(await startRecording())
      setMicNote(null)
    } catch {
      setMicNote(t('item.micDenied'))
    }
  }

  const save = async () => {
    if (!item.word.trim()) {
      setError(t('item.needWord'))
      return
    }
    const replaced = item.replacesId ? wordById.get(item.replacesId) : undefined
    const record: PersonalItem = {
      ...item,
      id: item.id || newId(),
      word: item.word.trim(),
      category: replaced?.category ?? item.category,
      phrases: item.phrases.map((p) => p.trim()).filter(Boolean),
      createdAt: item.createdAt || Date.now(),
    }
    await db.personalItems.put(record)
    showToast(t('cg.saved'))
    navigate('/ayarlar/kartlar')
  }

  const remove = async () => {
    if (!existing) return
    if (!window.confirm(t('item.deleteConfirm'))) return
    const snapshot = existing
    await db.personalItems.delete(snapshot.id)
    showToast(t('item.deleted'), t('item.undo'), () => void db.personalItems.put(snapshot))
    navigate('/ayarlar/kartlar')
  }

  const stockWords = [...content.words].sort((a, b) => compareTr(a.word, b.word))

  return (
    <Page title={isNew ? t('cg.addItem') : capitalizeTr(item.word)} back="/ayarlar/kartlar">
      <div className="form">
        <Field label={t('item.photo')}>
          <div className="photo-row">
            {photoUrl ? <img src={photoUrl} alt="" className="photo-preview" /> : null}
            <span className="btn btn-secondary file-btn">
              <Icon name="camera" />
              <span>{t('item.takePhoto')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void onPhoto(e.target.files?.[0])}
                data-testid="item-photo"
              />
            </span>
          </div>
        </Field>
        <Field label={t('item.word')} hint={t('item.wordHint')}>
          <input
            className="input"
            value={item.word}
            onChange={(e) => update({ word: e.target.value })}
            autoComplete="off"
            lang="tr"
            data-testid="item-word"
          />
        </Field>
        {error ? <p className="note">{error}</p> : null}
        <Field label={t('item.category')}>
          <select
            className="input"
            value={item.category}
            onChange={(e) => update({ category: e.target.value })}
            data-testid="item-category"
          >
            {leafCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c.id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('item.replaces')}>
          <select
            className="input"
            value={item.replacesId ?? ''}
            onChange={(e) => update({ replacesId: e.target.value || undefined })}
          >
            <option value="">{t('item.replacesNone')}</option>
            {stockWords.map((w) => (
              <option key={w.id} value={w.id}>
                {capitalizeTr(w.word)} ({categoryLabel(w.category)})
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('item.voice')} hint={t('item.voiceHint')}>
          <div className="row">
            {recordingSupported() ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void toggleRecord()}
                aria-pressed={!!recording}
              >
                <Icon name={recording ? 'stop' : 'mic'} />
                <span>{recording ? t('item.stop') : t('item.record')}</span>
              </button>
            ) : null}
            {item.audio ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void speak(item.word, { blob: item.audio })}
                >
                  <Icon name="play" />
                  <span>{t('item.play')}</span>
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => update({ audio: undefined })}>
                  {t('item.removeAudio')}
                </button>
              </>
            ) : null}
          </div>
          {micNote ? <span className="field-hint">{micNote}</span> : null}
        </Field>
        <Field label={t('item.phrases')} hint={t('item.phrasesHint')}>
          <textarea
            className="input"
            rows={3}
            value={item.phrases.join('\n')}
            onChange={(e) => update({ phrases: e.target.value.split('\n') })}
            lang="tr"
          />
        </Field>
        <Field label={t('item.semanticCue')} hint={t('item.semanticCueHint')}>
          <input
            className="input"
            value={item.semanticCue ?? ''}
            onChange={(e) => update({ semanticCue: e.target.value || undefined })}
            lang="tr"
          />
        </Field>
        <Field label={t('item.sentenceCue')} hint={t('item.sentenceCueHint')}>
          <input
            className="input"
            value={item.sentenceCue ?? ''}
            onChange={(e) => update({ sentenceCue: e.target.value || undefined })}
            lang="tr"
          />
        </Field>
        <BigButton icon="yes" label={t('item.save')} onClick={() => void save()} testId="item-save" />
        {!isNew && existing ? (
          <button type="button" className="btn btn-quiet" onClick={() => void remove()}>
            <Icon name="trash" />
            <span>{t('item.delete')}</span>
          </button>
        ) : null}
      </div>
    </Page>
  )
}

export function ProfileForm({ onSaved, embedded }: { onSaved?: () => void; embedded?: boolean }) {
  const profile = useProfile()
  const showToast = useToast((s) => s.show)
  const [draft, setDraft] = useState<Profile | null>(null)
  const p = draft ?? profile
  const set = (patch: Partial<Profile>) => setDraft({ ...p, ...patch })
  const form = (
    <div className="form">
      <Field label={t('profile.name')}>
        <input
          className="input"
          value={p.name}
          onChange={(e) => set({ name: e.target.value })}
          lang="tr"
          data-testid="profile-name"
        />
      </Field>
      <Field label={t('profile.message')}>
        <textarea
          className="input"
          rows={3}
          value={p.message}
          onChange={(e) => set({ message: e.target.value })}
          lang="tr"
        />
      </Field>
      <Field label={t('profile.emergencyName')}>
        <input
          className="input"
          value={p.emergencyName}
          onChange={(e) => set({ emergencyName: e.target.value })}
          lang="tr"
        />
      </Field>
      <Field label={t('profile.emergencyPhone')}>
        <input
          className="input"
          type="tel"
          inputMode="tel"
          value={p.emergencyPhone}
          onChange={(e) => set({ emergencyPhone: e.target.value })}
        />
      </Field>
      <BigButton
        icon="yes"
        label={t('profile.save')}
        onClick={() =>
          void db.profile.put({ ...p, id: 'main' }).then(() => {
            showToast(t('cg.saved'))
            onSaved?.()
          })
        }
        testId="profile-save"
      />
    </div>
  )
  if (embedded) return form
  return (
    <Page title={t('cg.profile')} back="/ayarlar">
      {form}
    </Page>
  )
}

function Choice<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  hint?: string
}) {
  return (
    <fieldset className="choice-set">
      <legend className="field-label">{label}</legend>
      <div className="choice-options">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className="btn btn-secondary"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.value === value ? <Icon name="yes" /> : null}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </fieldset>
  )
}

const yesNo = [
  { value: true, label: t('nav.yes') },
  { value: false, label: t('nav.no') },
]

export function DisplaySettings() {
  const s = useSettings()
  return (
    <Page title={t('cg.display')} back="/ayarlar">
      <div className="form">
        <Choice<GridSize>
          label={t('display.grid')}
          value={s.grid}
          options={[
            { value: '2x3', label: '2 × 3' },
            { value: '3x3', label: '3 × 3' },
            { value: '3x4', label: '3 × 4' },
            { value: '3x5', label: '3 × 5' },
          ]}
          onChange={(grid) => void updateSettings({ grid })}
        />
        <Choice
          label={t('display.leftHand')}
          value={s.leftHand}
          options={yesNo}
          onChange={(leftHand) => void updateSettings({ leftHand })}
        />
        <Choice
          label={t('display.largeText')}
          value={s.largeText}
          options={yesNo}
          onChange={(largeText) => void updateSettings({ largeText })}
        />
        <Choice
          label={t('display.highContrast')}
          value={s.highContrast}
          options={yesNo}
          onChange={(highContrast) => void updateSettings({ highContrast })}
        />
        <Choice<LayoutMode>
          label={t('display.layout')}
          value={s.layout}
          options={[
            { value: 'normal', label: t('display.layoutNormal') },
            { value: 'single', label: t('display.layoutSingle') },
            { value: 'left-half', label: t('display.layoutLeftHalf') },
          ]}
          onChange={(layout) => void updateSettings({ layout })}
        />
        <Choice<number>
          label={t('display.hold')}
          hint={t('display.holdHint')}
          value={s.holdMs}
          options={[0, 300, 600, 1000].map((ms) => ({
            value: ms,
            label: t('display.seconds', { n: (ms / 1000).toLocaleString('tr-TR') }),
          }))}
          onChange={(holdMs) => void updateSettings({ holdMs })}
        />
        <Choice<'kadin' | 'erkek'>
          label={t('display.figure')}
          value={s.figure}
          options={[
            { value: 'kadin', label: t('display.figureWoman') },
            { value: 'erkek', label: t('display.figureMan') },
          ]}
          onChange={(figure) => void updateSettings({ figure })}
        />
      </div>
    </Page>
  )
}

export function VoiceTest() {
  const [check, setCheck] = useState<VoiceCheck | null>(null)
  const run = async () => {
    void speak(t('voice.testPhrase'))
    setCheck(await checkTurkishVoice())
  }
  return (
    <div className="voice-test">
      <BigButton icon="speak" label={t('voice.test')} onClick={() => void run()} tone="secondary" testId="voice-test" />
      {check ? (
        <p className="note" data-testid="voice-result">
          {!check.supported
            ? t('voice.unsupported')
            : check.turkish
              ? t('voice.ok', { name: check.voiceName ?? '' })
              : t('voice.missing')}
        </p>
      ) : null}
    </div>
  )
}

export function VoiceSettings() {
  const s = useSettings()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    void loadVoices().then(() => setVoices(turkishVoices()))
  }, [])
  return (
    <Page title={t('cg.voice')} back="/ayarlar">
      <div className="form">
        <Choice<number>
          label={t('voice.rate')}
          value={s.speechRate}
          options={[
            { value: 0.6, label: '0,6' },
            { value: 0.8, label: `0,8 · ${t('voice.slow')}` },
            { value: 1, label: `1,0 · ${t('voice.normal')}` },
          ]}
          onChange={(speechRate) => void updateSettings({ speechRate })}
        />
        {voices.length > 1 ? (
          <Choice<string>
            label={t('voice.choose')}
            value={s.voiceURI ?? voices[0]!.voiceURI}
            options={voices.map((v) => ({ value: v.voiceURI, label: v.name }))}
            onChange={(voiceURI) => void updateSettings({ voiceURI })}
          />
        ) : null}
        <VoiceTest />
      </div>
    </Page>
  )
}

/** Terapist modu: durak sırası, ipucu sırası, oturum uzunluğu, eklenen hedef kelimeler. */
export function JourneySettings() {
  const s = useSettings()
  const personal = usePersonalItems()
  const stops = stopsInOrder(s)
  const move = (index: number, delta: number) => {
    const ids = stops.map((x) => x.id)
    const j = index + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j]!, ids[index]!]
    void updateSettings({ stopOrder: ids })
  }
  const [toAdd, setToAdd] = useState('')
  const labelOf = (id: string) => capitalizeTr(wordById.get(id)?.word ?? personal.find((p) => p.id === id)?.word ?? id)
  const candidates = [...content.words, ...personal.map((p) => ({ id: p.id, word: p.word }))]
    .filter((w) => !s.extraWords.includes(w.id))
    .sort((a, b) => compareTr(a.word, b.word))

  return (
    <Page title={t('cg.journey')} back="/ayarlar">
      <div className="form">
        <Choice
          label={t('journey.cueOrder')}
          value={s.cueOrder}
          options={[
            { value: 'decreasing', label: t('journey.cueDecreasing') },
            { value: 'increasing', label: t('journey.cueIncreasing') },
          ]}
          onChange={(cueOrder) => void updateSettings({ cueOrder })}
        />
        <Choice<number>
          label={t('journey.sessionSize')}
          value={s.sessionSize}
          options={[6, 8, 10].map((n) => ({ value: n, label: String(n) }))}
          onChange={(sessionSize) => void updateSettings({ sessionSize })}
        />
        <section className="section">
          <h2>{t('journey.stopOrder')}</h2>
          <ol className="list">
            {stops.map((stop, i) => (
              <li key={stop.id} className="list-row">
                <span className="list-label">
                  {i + 1}. {stop.label}
                </span>
                <span className="row-tight">
                  <button
                    type="button"
                    className="btn btn-secondary icon-btn"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`${stop.label}: ${t('journey.up')}`}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary icon-btn"
                    onClick={() => move(i, 1)}
                    disabled={i === stops.length - 1}
                    aria-label={`${stop.label}: ${t('journey.down')}`}
                  >
                    <Icon name="down" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="section">
          <h2>{t('journey.extra')}</h2>
          <ul className="list">
            {s.extraWords.map((id) => (
              <li key={id} className="list-row">
                <span className="list-label">{labelOf(id)}</span>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => void updateSettings({ extraWords: s.extraWords.filter((x) => x !== id) })}
                >
                  {t('journey.remove')}
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <select
              className="input"
              value={toAdd}
              onChange={(e) => setToAdd(e.target.value)}
              aria-label={t('journey.addWord')}
            >
              <option value="">{t('journey.addWord')}</option>
              {candidates.map((w) => (
                <option key={w.id} value={w.id}>
                  {capitalizeTr(w.word)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!toAdd}
              onClick={() => {
                void updateSettings({ extraWords: [...s.extraWords, toAdd] })
                setToAdd('')
              }}
            >
              <Icon name="plus" />
              <span>{t('learn.addToJourney')}</span>
            </button>
          </div>
        </section>
      </div>
    </Page>
  )
}

export function ReportPage() {
  const records = useLiveQuery(() => db.practiceRecords.orderBy('at').toArray(), [], [])
  const personal = usePersonalItems()
  const states = useLiveQuery(() => db.srsStates.toArray(), [], [])
  const labelOf = (id: string) => capitalizeTr(wordById.get(id)?.word ?? personal.find((p) => p.id === id)?.word ?? id)

  const perWord = new Map<string, { attempts: number; uncued: number; best: number }>()
  for (const r of records) {
    const w = perWord.get(r.wordId) ?? { attempts: 0, uncued: 0, best: 6 }
    w.attempts++
    if ((r.result === 'said' || r.result === 'correct') && r.cueLevel === 0) w.uncued++
    if (r.result !== 'not_yet') w.best = Math.min(w.best, r.cueLevel)
    perWord.set(r.wordId, w)
  }
  const stageOf = new Map(states.map((s) => [s.wordId, s.stage]))

  return (
    <Page title={t('cg.report')} back="/ayarlar" className="report">
      <p className="hint">{t('report.records', { n: records.length })}</p>
      <div className="row no-print">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            downloadBlob(new Blob([toCsv(records, labelOf)], { type: 'text/csv;charset=utf-8' }), 'kopru-rapor.csv')
          }
          disabled={!records.length}
        >
          <Icon name="download" />
          <span>{t('report.csv')}</span>
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          <Icon name="download" />
          <span>{t('report.print')}</span>
        </button>
      </div>
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">Kelime</th>
            <th scope="col">Deneme</th>
            <th scope="col">İpucusuz</th>
            <th scope="col">En az ipucu</th>
            <th scope="col">Aşama</th>
          </tr>
        </thead>
        <tbody>
          {[...perWord.entries()]
            .sort((a, b) => compareTr(labelOf(a[0]), labelOf(b[0])))
            .map(([id, w]) => (
              <tr key={id}>
                <td>{labelOf(id)}</td>
                <td>{w.attempts}</td>
                <td>{w.uncued}</td>
                <td>{w.best === 6 ? '—' : w.best}</td>
                <td>{stageOf.get(id) ?? '—'}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="field-hint">
        İpucu basamağı: 0 ipucusuz, 1 anlam, 2 cümle, 3 ilk ses, 4 yazılı kelime, 5 model, 6 henüz değil.
      </p>
    </Page>
  )
}

export function BackupPage() {
  const s = useSettings()
  const showToast = useToast((x) => x.show)
  const [persisted, setPersisted] = useState<boolean | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void isPersisted().then(setPersisted)
  }, [])

  const download = async () => {
    setBusy(true)
    try {
      downloadBlob(await createBackup(), backupFilename())
      await updateSettings({ lastBackupAt: Date.now() })
    } finally {
      setBusy(false)
    }
  }

  const restore = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const summary = await readBackupSummary(file)
      const when = new Date(summary.exportedAt).toLocaleDateString('tr-TR')
      if (!window.confirm(`${t('backup.restoreConfirm')}\n(${when}, ${summary.personalItems} kart)`)) return
      await restoreBackup(file)
      showToast(t('backup.restored'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Page title={t('cg.backup')} back="/ayarlar">
      <p className="hint">{t('backup.explain')}</p>
      <p className="note">
        {s.lastBackupAt
          ? t('backup.last', { date: new Date(s.lastBackupAt).toLocaleDateString('tr-TR') })
          : t('backup.never')}
      </p>
      <BigButton
        icon="download"
        label={t('backup.download')}
        onClick={() => void download()}
        disabled={busy}
        testId="backup-download"
      />
      <span className="btn btn-secondary big-btn file-btn">
        <Icon name="upload" size={40} />
        <span>{t('backup.restore')}</span>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => void restore(e.target.files?.[0])}
          data-testid="backup-restore"
        />
      </span>
      {error ? <p className="note">{error}</p> : null}
      <p className="field-hint">
        {persisted ? t('backup.persisted') : t('backup.notPersisted')}{' '}
        {!persisted ? (
          <button
            type="button"
            className="btn btn-quiet inline-btn"
            onClick={() => void requestPersistence().then(setPersisted)}
          >
            {t('backup.persist')}
          </button>
        ) : null}
      </p>
    </Page>
  )
}

export function AboutPage() {
  return (
    <Page title={t('about.title')} back="/ayarlar">
      <p>{t('about.text')}</p>
      <p>{t('about.privacy')}</p>
      <p>{t('about.symbols')}</p>
      <p>{t('about.font')}</p>
      <p className="field-hint">{t('about.version', { v: __APP_VERSION__ })}</p>
    </Page>
  )
}

/** Kurulum: uyarı, el tercihi, ses testi, ana ekrana ekleme, Ben kartı. Her adım atlanabilir. */
export function SetupWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const finish = async () => {
    await requestPersistence()
    await updateSettings({ setupDone: true, disclaimerAccepted: true })
    navigate('/')
  }
  const next = () => setStep((n) => n + 1)
  const steps: ReactNode[] = [
    <div key="welcome" className="setup-step">
      <h2>{t('setup.welcome')}</h2>
      <p>{t('setup.disclaimer')}</p>
      <p>{t('setup.privacy')}</p>
      <BigButton
        icon="yes"
        label={t('setup.accept')}
        onClick={() => {
          void updateSettings({ disclaimerAccepted: true })
          next()
        }}
        testId="setup-accept"
      />
    </div>,
    <div key="hand" className="setup-step">
      <h2>{t('setup.hand')}</h2>
      <BigButton
        label={t('setup.handLeft')}
        tone="secondary"
        onClick={() => {
          void updateSettings({ leftHand: true })
          next()
        }}
        testId="setup-left"
      />
      <BigButton
        label={t('setup.handRight')}
        tone="secondary"
        onClick={() => {
          void updateSettings({ leftHand: false })
          next()
        }}
        testId="setup-right"
      />
    </div>,
    <div key="voice" className="setup-step">
      <h2>{t('setup.voice')}</h2>
      <p className="hint">{t('setup.voiceHint')}</p>
      <VoiceTest />
      <BigButton icon="next" label={t('setup.next')} onClick={next} testId="setup-next" />
    </div>,
    <InstallStep key="install" onNext={next} />,
    <div key="me" className="setup-step">
      <h2>{t('setup.me')}</h2>
      <ProfileForm embedded onSaved={() => void finish()} />
      <button type="button" className="btn btn-quiet" onClick={() => void finish()} data-testid="setup-finish">
        {t('setup.skip')}
      </button>
    </div>,
  ]
  return (
    <Page title={t('setup.title')} back="/">
      <p className="session-progress">{`${step + 1} / ${steps.length}`}</p>
      {steps[step]}
      {step > 0 && step < steps.length - 1 ? (
        <button type="button" className="btn btn-quiet" onClick={next}>
          {t('setup.skip')}
        </button>
      ) : null}
    </Page>
  )
}

function InstallStep({ onNext }: { onNext: () => void }) {
  const [available, setAvailable] = useState(canPromptInstall)
  const standalone = isStandalone()
  useEffect(() => {
    const off = onInstallAvailable(() => setAvailable(true))
    return () => {
      off()
    }
  }, [])
  return (
    <div className="setup-step">
      <h2>{t('setup.install')}</h2>
      {standalone ? (
        <p className="note">{t('setup.installed')}</p>
      ) : (
        <>
          <p>{t('setup.installHint')}</p>
          <p className="note">{isIos() ? t('setup.installIos') : t('setup.installAndroid')}</p>
          {available ? (
            <BigButton
              icon="download"
              label={t('setup.installNow')}
              tone="secondary"
              onClick={() => void promptInstall()}
            />
          ) : null}
        </>
      )}
      <BigButton icon="next" label={t('setup.next')} onClick={onNext} testId="setup-next" />
    </div>
  )
}
