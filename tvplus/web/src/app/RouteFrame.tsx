/**
 * Her yolun çerçevesi: hata sınırı (ErrorState + "Tekrar Dene") ve tembel yükleme iskeleti.
 * Bir sayfanın hatası kabuğu ve diğer sayfaları düşürmez; yol değişince sınır sıfırlanır.
 */
import { Component, Suspense, type ErrorInfo, type ReactElement, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { devbus } from '../lib/devbus'
import { ErrorState, SkeletonBillboard, SkeletonSlider } from '../ui'

interface BoundaryProps {
  children: ReactNode
  /** Hata kaydında görünen ad */
  name: string
}
interface BoundaryState {
  error: Error | null
}

export class RouteErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    devbus.emit(
      'rest',
      `sayfa hatası: ${this.props.name}`,
      { error: String(error), stack: info.componentStack?.slice(0, 600) },
      { ok: false },
    )
  }

  private retry = () => this.setState({ error: null })

  render(): ReactNode {
    if (this.state.error) {
      return (
        <ErrorState size="page" title="Bu sayfa açılamadı" message="Biraz sonra yeniden dene." onRetry={this.retry} />
      )
    }
    return this.props.children
  }
}

/** Sayfa yüklenirken: vitrin + iki satır iskeleti (Netflix'in gri yükleme ekranı). */
export function PageSkeleton({ hero = true }: { hero?: boolean }): ReactElement {
  return (
    <div className="app-page-skeleton" aria-busy="true" aria-label="Yükleniyor">
      {hero ? <SkeletonBillboard /> : <div className="app-page-skeleton__spacer" />}
      <SkeletonSlider />
      <SkeletonSlider />
    </div>
  )
}

/** Yol değişince hata sınırı sıfırlanır (anahtar = yol). */
export function RouteFrame({ children, hero }: { children: ReactNode; hero?: boolean }): ReactElement {
  const { pathname } = useLocation()
  return (
    <RouteErrorBoundary key={pathname} name={pathname}>
      <Suspense fallback={<PageSkeleton hero={hero} />}>{children}</Suspense>
    </RouteErrorBoundary>
  )
}
