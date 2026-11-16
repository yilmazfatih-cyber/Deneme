/**
 * Giriş noktası: görünüm ayarlarını uygular, uygulamayı çizer, (derlenmiş sürümde) servis çalışanını kaydeder.
 * Genişletme: açılışta bir kez çalışacak yeni bir şey → buraya, `createRoot`tan önce.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import { startAppearance } from './lib/appearance.ts'
import { installPreloadRecovery } from './lib/preloadRecovery.ts'
import { startPwa } from './lib/pwa.ts'
import './styles/index.css'

startAppearance()
installPreloadRecovery()

const root = document.getElementById('root')
if (!root) throw new Error('index.html içinde #root öğesi yok.')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD) void startPwa()
