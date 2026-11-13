/**
 * Her yolun çerçevesi: hata sınırı (ErrorState + "Tekrar dene") ve tembel yükleme iskeleti.
 * Bir sayfanın hatası kabuğu ve diğer sayfaları düşürmez.
 */
import { Component, Suspense, type ErrorInfo, type ReactElement, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ErrorState, Skeleton, SkeletonRow } from '../design'
import { devbus } from '../lib/devbus'

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

/** Sayfa yüklenirken: başlık + iki satır iskelet. */
export function PageSkeleton(): ReactElement {
  return (
    <div className="cn-page" aria-busy="true">
      <span className="cn-gutter-x">
        <Skeleton variant="title" width={220} />
      </span>
      <SkeletonRow variant="landscape" count={6} />
      <SkeletonRow variant="poster" count={10} />
    </div>
  )
}

/** Yol değişince hata sınırı sıfırlanır (anahtar = yol). */
export function RouteFrame({ children }: { children: ReactNode }): ReactElement {
  const { pathname } = useLocation()
  return (
    <RouteErrorBoundary key={pathname} name={pathname}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </RouteErrorBoundary>
  )
}
