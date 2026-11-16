/**
 * Beklenmeyen hata yakalayıcı: bir bileşen çökerse boş sayfa yerine suçlamayan bir ileti ve "Yenile" düğmesi.
 * Veriler yerel veritabanında durduğu için yenilemek veri kaybettirmez.
 * Genişletme: hata raporlama eklenecekse `componentDidCatch` içine yazın (kişisel veri göndermeyin).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../i18n/index.ts'

interface State {
  readonly error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Arayüz hatası:', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('error.crashTitle')}</h1>
        <p className="text-muted">{t('error.crashMessage')}</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="min-h-12 rounded-xl bg-accent px-5 font-semibold text-accent-ink"
        >
          {t('common.reload')}
        </button>
        {import.meta.env.DEV && (
          <pre className="max-w-full overflow-auto text-left text-sm text-muted">{this.state.error.message}</pre>
        )}
      </main>
    )
  }
}
