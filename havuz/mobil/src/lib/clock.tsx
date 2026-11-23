/**
 * Saat: "şimdi" ve "bugün" bileşenlere buradan gelir ki testte sabitlenebilsin.
 *   const today = useToday()         // '2026-11-16' (gün dönünce kendiliğinden yenilenir)
 *   const { now } = useClock()       // olay işleyicilerinde şimdiki an
 * Testte: <ClockProvider clock={{ now: () => new Date('2026-11-16T09:00:00') }}>.
 *
 * Kaynak: uygulama/web/src/lib/clock.tsx. Genişletme: başka bir zaman kaynağı → `Clock` arayüzüne yöntem.
 */
import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import { toIsoDate } from './date.ts'

export interface Clock {
  now(): Date
}

const systemClock: Clock = { now: () => new Date() }

const ClockContext = createContext<Clock>(systemClock)

export function ClockProvider({ clock, children }: { clock: Clock; children: ReactNode }) {
  return <ClockContext value={clock}>{children}</ClockContext>
}

export function useClock(): Clock {
  return use(ClockContext)
}

/** Yerel günün tarihi (`YYYY-AA-GG`). Gece yarısından sonra kendiliğinden güncellenir. */
export function useToday(): string {
  const clock = useClock()
  const [today, setToday] = useState(() => toIsoDate(clock.now()))
  useEffect(() => {
    const now = clock.now()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
    const timer = setTimeout(() => setToday(toIsoDate(clock.now())), midnight.getTime() - now.getTime())
    return () => clearTimeout(timer)
  }, [clock, today])
  return today
}
