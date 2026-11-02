export type Tab = 'today' | 'calendar' | 'insights' | 'settings'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'today', label: 'Bugün', icon: '🌸' },
  { key: 'calendar', label: 'Takvim', icon: '📅' },
  { key: 'insights', label: 'Analiz', icon: '📈' },
  { key: 'settings', label: 'Ayarlar', icon: '⚙️' },
]

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Ana menü">
      {TABS.map((t) => (
        <button
          key={t.key}
          className="tab"
          aria-current={tab === t.key ? 'page' : undefined}
          onClick={() => onChange(t.key)}
        >
          <span className="ic" aria-hidden="true">
            {t.icon}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
