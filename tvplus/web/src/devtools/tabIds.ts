/** Panel sekmeleri (kapalı paneli yüklemeden kalıcı sekme seçimini doğrulamak için ayrı dosyada). */
export const TABS = [
  { id: 'akis', label: 'Akış' },
  { id: 'hat', label: 'Oynatma hattı' },
  { id: 'api', label: 'API' },
  { id: 'cdn', label: 'CDN' },
  { id: 'kimlik', label: 'Kimlik' },
  { id: 'olaylar', label: 'Olaylar' },
  { id: 'cihazlar', label: 'Cihazlar' },
] as const
export type TabId = (typeof TABS)[number]['id']

export function isTabId(v: unknown): v is TabId {
  return TABS.some((t) => t.id === v)
}
