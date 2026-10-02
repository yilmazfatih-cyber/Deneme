import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { BigButton, Page } from '../components/Shell'
import { content, symbolUrl } from '../content'
import { db, newId, updateSettings, type SrsState } from '../db'
import { allItems, frequentIds } from '../features/board/items'
import {
  ChoiceActivity,
  NamingActivity,
  Picture,
  RepeatActivity,
  Warmup,
  type Outcome,
} from '../features/journey/Activities'
import { stopsInOrder, targetItems, type LearnItem } from '../features/journey/learn'
import { saveOutcome, summarizeWeek, weekStart } from '../features/journey/progress'
import {
  adaptChoiceCount,
  planSession,
  seededRng,
  shouldSuggestBreak,
  startingCue,
  type SessionPlan,
} from '../features/journey/session'
import { t } from '../i18n'
import { usePersonalItems, useSettings, useSrsStates } from '../lib/hooks'
import { playConfirmTone } from '../lib/media'
import { canSay, isUncued, STAGE_LABEL } from '../lib/srs'

export function JourneyHome() {
  const navigate = useNavigate()
  const settings = useSettings()
  const personal = usePersonalItems()
  const srs = useSrsStates()
  const targets = targetItems(settings, personal)
  const targetIds = new Set(targets.map((i) => i.id))
  const frequent = useLiveQuery(() => frequentIds(12), [], [])
  const board = allItems(personal, settings)
  const suggestions = frequent
    .filter((f) => f.count >= 3 && !targetIds.has(f.id))
    .flatMap((f) => board.filter((b) => b.id === f.id))
    .slice(0, 3)
  const due = useLiveQuery(
    async () => {
      const now = Date.now()
      const states = new Map((await db.srsStates.toArray()).map((s) => [s.wordId, s]))
      return targets.filter((i) => {
        const s = states.get(i.id)
        return !s || s.nextReview <= now
      }).length
    },
    [targets],
    1,
  )

  return (
    <Page title={t('learn.title')} back="/">
      <BigButton icon="play" label={t('learn.start')} onClick={() => navigate('/ogren/oturum')} testId="learn-start" />
      {due === 0 ? <p className="note">{t('learn.allDone')}</p> : null}
      <BigButton
        icon="star"
        label={t('learn.progress')}
        onClick={() => navigate('/ogren/ilerleme')}
        tone="secondary"
        testId="learn-progress"
      />

      {suggestions.length ? (
        <section className="section" aria-label={t('learn.suggestions')}>
          <h2>{t('learn.suggestions')}</h2>
          {suggestions.map((s) => (
            <div className="list-row" key={s.id}>
              <span className="list-label">{s.label}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void updateSettings({ extraWords: [...settings.extraWords, s.id] })}
              >
                <Icon name="plus" />
                <span>{t('learn.addToJourney')}</span>
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="section" aria-label={t('learn.stops')}>
        <h2>{t('learn.stops')}</h2>
        <ol className="stops">
          {stopsInOrder(settings).map((stop, i) => {
            const learned = stop.words.filter((w) => canSay(srs.get(w))).length
            return (
              <li key={stop.id} className="stop">
                <img src={symbolUrl(stop.symbol)} alt="" className="stop-img" />
                <span className="stop-text">
                  <span className="stop-name">
                    {i + 1}. {stop.label}
                  </span>
                  <span className="stop-sub">
                    {t('learn.stopWords', { n: stop.words.length })}
                    {learned ? ` · ${t('learn.stopLearned', { n: learned })}` : ''}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      </section>
    </Page>
  )
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'warmup' }
  | { kind: 'step'; index: number }
  | { kind: 'break'; index: number }
  | { kind: 'done' }

interface Done {
  wordId: string
  uncued: boolean
  success: boolean
}

export function SessionPage() {
  const navigate = useNavigate()
  const settings = useSettings()
  const personal = usePersonalItems()
  const [plan, setPlan] = useState<SessionPlan | null>(null)
  const [states, setStates] = useState<Map<string, SrsState>>(new Map())
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [done, setDone] = useState<Done[]>([])
  const [times, setTimes] = useState<number[]>([])
  const [breakAsked, setBreakAsked] = useState(false)
  const [sessionId] = useState(newId)
  const [choiceCount, setChoiceCount] = useState<number | null>(null)

  const targets = useMemo(() => targetItems(settings, personal), [settings, personal])
  const itemsById = useMemo(() => new Map<string, LearnItem>(targets.map((i) => [i.id, i])), [targets])

  useEffect(() => {
    if (plan) return
    let cancelled = false
    void (async () => {
      const stored = await db.settings.get('main')
      if (cancelled) return
      const list = await db.srsStates.toArray()
      const map = new Map(list.map((s) => [s.wordId, s]))
      const s = { ...settings, ...stored }
      const next = planSession({
        targets,
        states: map,
        now: Date.now(),
        size: s.sessionSize,
        choiceCount: s.choiceCount,
        warmupIds: content.journey.warmups.map((w) => w.id),
        scenarioWords: new Set(content.journey.scenarios.map((sc) => sc.answer)),
        rng: seededRng(Date.now()),
      })
      if (cancelled) return
      setStates(map)
      setChoiceCount(s.choiceCount)
      setPlan(next)
      setPhase(next.steps.length ? { kind: 'warmup' } : { kind: 'done' })
    })()
    return () => {
      cancelled = true
    }
  }, [plan, settings, targets])

  const finish = async (list: Done[]) => {
    setPhase({ kind: 'done' })
    if (list.length) playConfirmTone()
    if (choiceCount !== null) {
      const recognition = list.length
      const next = adaptChoiceCount(choiceCount, list.filter((d) => d.success).length, recognition)
      if (next !== choiceCount) await updateSettings({ choiceCount: next })
    }
  }

  const onStepDone = async (index: number, outcome: Outcome) => {
    if (!plan) return
    const step = plan.steps[index]!
    const next = await saveOutcome(step, outcome, sessionId)
    setStates((m) => new Map(m).set(step.wordId, next))
    const success = outcome.result !== 'not_yet'
    const list = [...done, { wordId: step.wordId, uncued: isUncued(outcome) && step.activity !== 'repeat', success }]
    const nextTimes = [...times, outcome.responseMs]
    setDone(list)
    setTimes(nextTimes)
    if (index + 1 >= plan.steps.length) {
      await finish(list)
    } else if (!breakAsked && shouldSuggestBreak(nextTimes)) {
      setBreakAsked(true)
      setPhase({ kind: 'break', index: index + 1 })
    } else {
      setPhase({ kind: 'step', index: index + 1 })
    }
  }

  const total = plan?.steps.length ?? 0
  const progress = phase.kind === 'step' ? t('session.progress', { i: phase.index + 1, n: total }) : ''

  let body: React.ReactNode
  if (phase.kind === 'loading' || !plan) {
    body = null
  } else if (phase.kind === 'warmup') {
    body = <Warmup warmupId={plan.warmupId} onDone={() => setPhase({ kind: 'step', index: 0 })} />
  } else if (phase.kind === 'break') {
    body = (
      <div className="activity" data-testid="activity-break">
        <h2 className="activity-title">{t('session.break')}</h2>
        <BigButton icon="pause" label={t('session.breakYes')} onClick={() => void finish(done)} tone="secondary" />
        <BigButton
          icon="next"
          label={t('session.breakNo')}
          onClick={() => setPhase({ kind: 'step', index: phase.index })}
        />
      </div>
    )
  } else if (phase.kind === 'step') {
    const step = plan.steps[phase.index]!
    const item = itemsById.get(step.wordId)
    if (!item) {
      body = null
    } else if (step.activity === 'match' || step.activity === 'listen') {
      body = (
        <ChoiceActivity
          key={phase.index}
          step={step}
          item={item}
          itemsById={itemsById}
          onDone={(o) => void onStepDone(phase.index, o)}
        />
      )
    } else if (step.activity === 'repeat') {
      body = <RepeatActivity key={phase.index} item={item} onDone={(o) => void onStepDone(phase.index, o)} />
    } else {
      body = (
        <NamingActivity
          key={phase.index}
          step={step}
          item={item}
          startLevel={startingCue(settings.cueOrder, states.get(step.wordId), item)}
          onDone={(o) => void onStepDone(phase.index, o)}
        />
      )
    }
  } else {
    const uncued = [...new Set(done.filter((d) => d.uncued).map((d) => d.wordId))]
    const studied = new Set(done.map((d) => d.wordId)).size
    body = (
      <div className="activity" data-testid="session-done">
        {total === 0 ? (
          <p className="note">{t('session.empty')}</p>
        ) : (
          <>
            <h2 className="activity-title">{t('session.done', { n: studied })}</h2>
            {uncued.length ? (
              <section className="section">
                <h3>{t('session.uncued')}</h3>
                <div className="mini-grid">
                  {uncued.map((id) => {
                    const it = itemsById.get(id)
                    return it ? (
                      <div key={id} className="mini-item">
                        <Picture item={it} size="small" />
                        <span>{it.label}</span>
                      </div>
                    ) : null
                  })}
                </div>
              </section>
            ) : null}
            <p className="hint">{t('session.seeYou')}</p>
          </>
        )}
        <BigButton icon="yes" label={t('session.finish')} onClick={() => navigate('/ogren')} testId="session-finish" />
      </div>
    )
  }

  return (
    <Page title={t('learn.title')} back="/ogren" hideTitle className="session">
      {progress ? (
        <p className="session-progress" aria-live="polite">
          {progress}
        </p>
      ) : null}
      {body}
    </Page>
  )
}

export function ProgressPage() {
  const settings = useSettings()
  const personal = usePersonalItems()
  const srs = useSrsStates()
  const records = useLiveQuery(() => db.practiceRecords.where('at').above(weekStart()).toArray(), [], [])
  const summary = summarizeWeek(records, weekStart())
  const items = new Map(targetItems(settings, personal).map((i) => [i.id, i]))
  const stageCounts = new Map<string, number>()
  for (const s of srs.values()) stageCounts.set(s.stage, (stageCounts.get(s.stage) ?? 0) + 1)

  return (
    <Page title={t('progress.title')} back="/ogren">
      <section className="section">
        <h2>{t('progress.week')}</h2>
        {records.length === 0 ? (
          <p className="note">{t('progress.none')}</p>
        ) : (
          <ul className="facts">
            <li>{t('progress.days', { n: summary.days })}</li>
            <li>{t('progress.words', { n: summary.words })}</li>
          </ul>
        )}
      </section>
      <section className="section">
        <h2>{t('progress.uncued')}</h2>
        <div className="mini-grid" data-testid="progress-uncued">
          {summary.uncued.map((id) => {
            const it = items.get(id)
            return it ? (
              <div key={id} className="mini-item">
                <Picture item={it} size="small" />
                <span>{it.label}</span>
              </div>
            ) : null
          })}
        </div>
      </section>
      <section className="section">
        <h2>{t('progress.stages')}</h2>
        <ul className="facts">
          {(['tani', 'hatirla', 'kullan', 'surdur', 'kazanildi'] as const).map((stage) => (
            <li key={stage}>
              {STAGE_LABEL[stage]}: {stageCounts.get(stage) ?? 0}
            </li>
          ))}
        </ul>
      </section>
    </Page>
  )
}
