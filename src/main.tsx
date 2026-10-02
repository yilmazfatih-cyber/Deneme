// latin + latin-ext: ğ, ş, ı, İ, ç, ö, ü
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { applyTokens } from './theme/tokens'
import './styles.css'

// Token'lar ayarlar okunmadan önce de uygulansın (ilk boyamada renk sıçraması olmasın).
applyTokens(document.documentElement, { highContrast: false, largeText: false })

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // İlk açılıştan sonra internetsiz çalışma; güncellemeler sessizce uygulanır.
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
