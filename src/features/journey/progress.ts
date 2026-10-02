import { db, type PracticeRecord, type SrsState } from '../../db'
import { applyOutcome, initialState } from '../../lib/srs'
import type { Outcome } from './Activities'
import type { Step } from './session'

/** Bir adımın sonucunu kaydeder ve kelimenin tekrar planını günceller. */
export async function saveOutcome(
  step: Step,
  outcome: Outcome,
  sessionId: string,
  now = Date.now(),
): Promise<SrsState> {
  const record: PracticeRecord = {
    wordId: step.wordId,
    at: now,
    activity: step.activity,
    cueLevel: outcome.cueLevel,
    result: outcome.result,
    responseMs: outcome.responseMs,
    sessionId,
  }
  return db.transaction('rw', db.practiceRecords, db.srsStates, async () => {
    await db.practiceRecords.add(record)
    const state = (await db.srsStates.get(step.wordId)) ?? initialState(step.wordId, now)
    const next = applyOutcome(state, outcome, now)
    await db.srsStates.put(next)
    return next
  })
}

/** Haftanın başı (pazartesi 00:00, yerel saat). */
export function weekStart(now = new Date()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d.getTime()
}

export interface WeekSummary {
  days: number
  words: number
  sessions: number
  uncued: string[]
}

export function summarizeWeek(records: PracticeRecord[], since: number): WeekSummary {
  const week = records.filter((r) => r.at >= since)
  const days = new Set(week.map((r) => new Date(r.at).toDateString()))
  const uncued = new Set(
    week.filter((r) => r.result === 'said' && r.cueLevel === 0 && r.activity !== 'repeat').map((r) => r.wordId),
  )
  return {
    days: days.size,
    words: new Set(week.map((r) => r.wordId)).size,
    sessions: new Set(week.map((r) => r.sessionId)).size,
    uncued: [...uncued],
  }
}

const CSV_HEADER = ['tarih', 'kelime_id', 'kelime', 'aktivite', 'ipucu_basamagi', 'sonuc', 'yanit_sn', 'oturum']

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Terapist raporu: tüm pratik kayıtları CSV (Excel'de Türkçe karakterler için BOM ile). */
export function toCsv(records: PracticeRecord[], wordLabel: (id: string) => string): string {
  const rows = records.map((r) => [
    new Date(r.at).toISOString(),
    r.wordId,
    wordLabel(r.wordId),
    r.activity,
    r.cueLevel,
    r.result,
    (r.responseMs / 1000).toFixed(1),
    r.sessionId,
  ])
  return '﻿' + [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}
