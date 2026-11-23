/**
 * Açılış yönlendirmesi (/): oturum yüklenince karşılama ekranına ya da görevlere gider.
 * Genişletme: açılışta başka bir ekrana gidilecekse (ör. tanıtım) koşulu buraya ekleyin.
 */
import { Redirect } from 'expo-router'
import { t } from '../i18n/index.ts'
import { useSession } from '../lib/session/context.ts'
import { Loading } from '../ui/index.ts'

export function IndexRedirect() {
  const { state, welcomeDone } = useSession()
  if (state.status === 'loading') return <Loading label={t('common.loading')} />
  return <Redirect href={state.status === 'account' || welcomeDone ? '/tasks' : '/welcome'} />
}
