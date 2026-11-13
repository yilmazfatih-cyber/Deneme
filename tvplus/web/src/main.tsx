/**
 * Giriş noktası. Tasarım sistemi v2'nin tokenları ve temel stilleri ilk yüklenir (web/src/ui);
 * v1 (web/src/design) yalnız henüz yenilenmemiş sayfalar onu içe aktardıkça yüklenir.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/tokens.css'
import './ui/base.css'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
