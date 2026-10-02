import { useEffect, useRef } from 'react'
import { createHashRouter, Navigate, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom'
import { useSettings, useSettingsLoaded } from '../lib/hooks'
import { configureSpeech } from '../lib/speech'
import { applyTokens } from '../theme/tokens'
import { BoardRoot, CategoryPage, LettersPage, QuickNeedsPage, TemplatesPage } from './BoardPages'
import { BodyMapPage } from './BodyMapPage'
import {
  AboutPage,
  BackupPage,
  CaregiverHome,
  DisplaySettings,
  ItemEditor,
  JourneySettings,
  PersonalItemsPage,
  ProfileForm,
  ReportPage,
  SetupWizard,
  VoiceSettings,
} from './CaregiverPages'
import { HomePage, MeCardPage } from './HomePages'
import { JourneyHome, ProgressPage, SessionPage } from './JourneyPages'
import { PartnerPage } from './PartnerPage'

/** Ayarları köke uygular: token'lar, sol el modu, düzen, ses hızı. */
function Root() {
  const settings = useSettings()
  const loaded = useSettingsLoaded()
  const navigate = useNavigate()
  const location = useLocation()
  const redirected = useRef(false)

  useEffect(() => {
    const root = document.documentElement
    applyTokens(root, { highContrast: settings.highContrast, largeText: settings.largeText })
    root.dataset.hand = settings.leftHand ? 'left' : 'right'
    root.dataset.layout = settings.layout
    root.dataset.contrast = settings.highContrast ? 'high' : 'normal'
    configureSpeech({ rate: settings.speechRate, voiceURI: settings.voiceURI })
  }, [settings])

  // İlk açılışta kurulum sihirbazı (bir kez; kullanıcı atlayabilir).
  useEffect(() => {
    if (redirected.current || loaded === undefined) return
    redirected.current = true
    if (!loaded?.setupDone && location.pathname === '/') navigate('/kurulum', { replace: true })
  }, [loaded, location.pathname, navigate])

  return <Outlet />
}

const router = createHashRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/konus', element: <BoardRoot /> },
      { path: '/konus/hizli', element: <QuickNeedsPage /> },
      { path: '/konus/kaliplar', element: <TemplatesPage /> },
      { path: '/konus/harf', element: <LettersPage /> },
      { path: '/konus/harf/:letter', element: <LettersPage /> },
      { path: '/konus/harf/:letter/:syllable', element: <LettersPage /> },
      { path: '/konus/vucut-haritasi', element: <BodyMapPage /> },
      { path: '/konus/k/:categoryId', element: <CategoryPage /> },
      { path: '/goster', element: <PartnerPage /> },
      { path: '/ben', element: <MeCardPage /> },
      { path: '/ogren', element: <JourneyHome /> },
      { path: '/ogren/oturum', element: <SessionPage /> },
      { path: '/ogren/ilerleme', element: <ProgressPage /> },
      { path: '/ayarlar', element: <CaregiverHome /> },
      { path: '/ayarlar/kartlar', element: <PersonalItemsPage /> },
      { path: '/ayarlar/kartlar/:itemId', element: <ItemEditor /> },
      { path: '/ayarlar/ben', element: <ProfileForm /> },
      { path: '/ayarlar/gorunum', element: <DisplaySettings /> },
      { path: '/ayarlar/ses', element: <VoiceSettings /> },
      { path: '/ayarlar/yolculuk', element: <JourneySettings /> },
      { path: '/ayarlar/rapor', element: <ReportPage /> },
      { path: '/ayarlar/yedek', element: <BackupPage /> },
      { path: '/ayarlar/hakkinda', element: <AboutPage /> },
      { path: '/kurulum', element: <SetupWizard /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
