/**
 * "Hesapsız devam et" düğmesi: karşılama ekranını geçildi sayar ve görevlere götürür. Veriler yalnız bu cihazda
 * kalır; sonra giriş yapılırsa hesaba taşınabilir.
 */
import { useNavigate } from 'react-router'
import { t } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { Button } from '../../ui/index.ts'

export function ContinueWithoutAccount({ variant = 'ghost' }: { variant?: 'ghost' | 'secondary' }) {
  const session = useSession()
  const navigate = useNavigate()
  return (
    <Button
      variant={variant}
      block
      onClick={() => {
        void session.finishWelcome().then(() => navigate('/gorevler'))
      }}
    >
      {t('auth.continueWithoutAccount')}
    </Button>
  )
}
