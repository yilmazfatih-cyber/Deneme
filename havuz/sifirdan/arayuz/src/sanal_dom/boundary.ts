// Hata sınırı: alt ağaçtaki bir bileşen çizilirken ya da etkisi çalışırken hata atarsa, uygulamanın tamamı
// çökmek yerine `fallback` görünümü çizilir. `reset()` alt ağacı yeniden dener.
// Olay işleyicilerindeki hatalar sınıra gelmez (React'te de böyledir): onları işleyicinin içinde yakalayın.
// Genişletme: hatayı bir günlük servisine göndermek için `onError` özelliğini çağıran bir satır ekleyin.
import { useErrorHandler, useState } from './hooks.ts'
import type { Child } from './vnode.ts'

export interface ErrorBoundaryProps {
  fallback: (error: unknown, reset: () => void) => Child
  onError?: (error: unknown) => void
  children?: Child
}

export function ErrorBoundary(props: ErrorBoundaryProps): Child {
  const [caught, setCaught] = useState<{ error: unknown } | null>(null)
  useErrorHandler((error) => {
    props.onError?.(error)
    setCaught({ error })
  })
  if (caught) return props.fallback(caught.error, () => setCaught(null))
  return props.children ?? null
}
