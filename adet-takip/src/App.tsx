import { useEffect, useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { today as todayISO } from './lib/dates'
import { Calendar } from './screens/Calendar'
import { Insights } from './screens/Insights'
import { Onboarding } from './screens/Onboarding'
import { Settings } from './screens/Settings'
import { Today } from './screens/Today'
import { useStore } from './state/store'

/** Gün değişince (gece yarısı, uygulama açıkken) ekranlar yenilensin. */
function useToday() {
  const [t, setT] = useState(todayISO)
  useEffect(() => {
    const id = setInterval(() => setT((prev) => (prev === todayISO() ? prev : todayISO())), 60_000)
    const onVis = () => setT(todayISO())
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  return t
}

export default function App() {
  const { state } = useStore()
  const [tab, setTab] = useState<Tab>('today')
  const today = useToday()

  if (!state.onboarded) return <Onboarding />

  return (
    <>
      <main>
        {/* key: gün değişince seçili gün sıfırlanır */}
        {tab === 'today' && <Today key={today} today={today} />}
        {tab === 'calendar' && <Calendar today={today} />}
        {tab === 'insights' && <Insights today={today} />}
        {tab === 'settings' && <Settings />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </>
  )
}
