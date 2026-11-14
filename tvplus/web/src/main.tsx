/**
 * Giriş noktası. Tasarım sisteminin tokenları ve temel stilleri ilk yüklenir (web/src/ui).
 * Uygulama ilk kez çizilince açılış tanılaması (index.html) devreden çıkar; çizim sırasında yakalanmayan bir hata
 * olursa boş ekran yerine okunur bir hata ekranı gösterilir.
 */
import { Component, StrictMode, useEffect, type ErrorInfo, type ReactElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/tokens.css'
import './ui/base.css'
import { App } from './app/App'

declare global {
  interface Window {
    /** Uygulama en az bir kez çizildi (index.html'deki açılış tanılaması buna bakar) */
    __tvpBooted?: boolean
  }
}

function Booted({ children }: { children: ReactNode }): ReactElement {
  useEffect(() => {
    window.__tvpBooted = true
    document.getElementById('tvp-boot-error')?.remove()
  }, [])
  return <>{children}</>
}

interface RootBoundaryState {
  error: Error | null
}

/** Son savunma hattı: hiçbir sınırın yakalamadığı çizim hatasında ekran boş kalmaz. */
class RootBoundary extends Component<{ children: ReactNode }, RootBoundaryState> {
  state: RootBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error): RootBoundaryState {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('TV+ kök hata sınırı:', error, info.componentStack)
  }
  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <main
        role="alert"
        style={{ minHeight: '100vh', padding: '40px 24px', color: '#fff', background: '#141414', lineHeight: 1.6 }}
      >
        <h1 style={{ fontSize: 24, margin: '0 0 12px' }}>Bir şeyler ters gitti</h1>
        <p style={{ color: '#b3b3b3', margin: '0 0 16px', maxWidth: '60ch' }}>
          Sayfa çizilirken bir hata oluştu. Yeniden yüklemek çoğu zaman yeter.
        </p>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#232323',
            padding: 16,
            borderRadius: 8,
            maxWidth: '100ch',
            font: '13px/1.5 ui-monospace, Menlo, Consolas, monospace',
          }}
        >
          {String(error.stack ?? error.message)}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 16,
            padding: '10px 20px',
            border: 0,
            borderRadius: 4,
            background: '#fff',
            color: '#141414',
            font: 'inherit',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Yeniden Yükle
        </button>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootBoundary>
      <Booted>
        <App />
      </Booted>
    </RootBoundary>
  </StrictMode>,
)
