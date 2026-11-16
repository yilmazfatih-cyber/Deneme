/**
 * Çalışma alanı ekranlarının ortak yardımcıları: API istemcisi (hesaplı kipte), eşitlemeyi tazeleme ve
 * hata bildirimi. Alan listesi eşitleme yanıtıyla güncellendiği için her değişiklikten sonra `refresh` çağrılır.
 */
import { useCallback } from 'react'
import { errorMessage } from '../../lib/errors.ts'
import { useSession } from '../../lib/session/context.ts'
import { useToast } from '../../ui/index.ts'

export function useWorkspaceApi() {
  const session = useSession()
  const toast = useToast()
  const engine = session.state.status === 'account' ? session.state.engine : null
  const userId = session.state.status === 'account' ? session.state.session.userId : null
  const refresh = useCallback(async () => {
    await engine?.syncNow()
  }, [engine])
  const fail = useCallback((error: unknown) => toast.show({ message: errorMessage(error), tone: 'error' }), [toast])
  return { api: session.api, refresh, fail, userId, toast }
}
