/**
 * Bulunamayan sayfa (tanımsız adres ya da yetkisiz yönetim sayfası).
 */
import { MapPinOff } from 'lucide-react'
import { useEffect } from 'react'
import { t } from '../i18n/index.ts'
import { ButtonLink, EmptyState, PageHeader } from '../ui/index.ts'
import { APP } from './config.ts'

export function NotFoundPage() {
  useEffect(() => {
    document.title = `${t('page.notFound')} · ${APP.name}`
  }, [])
  return (
    <>
      <PageHeader title={t('page.notFound')} />
      <EmptyState
        icon={MapPinOff}
        title={t('page.notFound')}
        message={t('page.notFoundHint')}
        action={<ButtonLink to="/gorevler">{t('common.goHome')}</ButtonLink>}
      />
    </>
  )
}
