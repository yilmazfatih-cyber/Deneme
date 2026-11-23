/**
 * Uygulamanın ön planda olup olmadığı (React Native `AppState`). Web derlemesinde sekmenin görünürlüğüdür.
 * Eşitleme tetikleyicileri (lib/sync/triggers.ts) bunu kullanır; testler sahte bir `AppLifecycle` verir.
 *
 * Genişletme: başka bir yaşam döngüsü olayı gerekiyorsa arayüze yöntem ekleyin ve iki gerçeklemeyi güncelleyin.
 */
import { AppState } from 'react-native'

export interface AppLifecycle {
  /** Uygulama şu an ön planda mı. */
  isActive(): boolean
  /** Ön plana gelince (`true`) ya da arka plana gidince (`false`) çağrılır. Dönen işlev dinlemeyi bırakır. */
  onChange(listener: (active: boolean) => void): () => void
}

export const appLifecycle: AppLifecycle = {
  isActive: () => AppState.currentState === 'active' || AppState.currentState == null,
  onChange: (listener) => {
    const subscription = AppState.addEventListener('change', (state) => listener(state === 'active'))
    return () => subscription.remove()
  },
}
