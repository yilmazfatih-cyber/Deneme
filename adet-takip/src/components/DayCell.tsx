import type { DayInfo } from '../lib/cycle'

/** Gün sayısının arka plan sınıfı: kaydedilen adet > yumurtlama > tahmini adet > doğurgan. */
export function numClass(info: DayInfo): string {
  if (info.loggedPeriod) return 'num period'
  if (info.ovulation) return 'num ovulation'
  if (info.predictedPeriod) return 'num predicted'
  if (info.fertile) return 'num fertile'
  return 'num'
}

export function dayAria(info: DayInfo, label: string, hasLog: boolean): string {
  const parts = [label]
  if (info.loggedPeriod) parts.push('adet')
  else if (info.predictedPeriod) parts.push('tahmini adet')
  if (info.ovulation) parts.push('yumurtlama')
  else if (info.fertile) parts.push('doğurgan')
  if (hasLog) parts.push('kayıt var')
  return parts.join(', ')
}
