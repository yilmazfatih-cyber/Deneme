/** Bildirim zamanı: "az önce", "5 dk önce", "3 sa önce", "dün", "4 gün önce", sonra "4 Eki". */
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

export function relativeTime(at: number, now: number): string {
  const diff = now - at
  if (diff < 60_000) return 'az önce'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${min} dk önce`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} sa önce`
  const d = Math.floor(h / 24)
  if (d === 1) return 'dün'
  if (d < 7) return `${d} gün önce`
  const date = new Date(at)
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}
