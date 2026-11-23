/**
 * Belgelere soru sayfası (/sor): kullanıcı sorusunu yazar; API (POST /api/sor) yerel yz sunucusuna sorar, yanıt,
 * kaynaklar ve uyarılar gösterilir. Durumlar: boş (ne yapılacağını anlatır) · yükleniyor (role=status) ·
 * hata (role=alert; alan hatası kutunun altında) · çevrimdışı (gönderme kapalı, nedeni yazılı).
 * Yanıt eşitlenmez ve saklanmaz: yalnız bu ekranda durur. Sunucu tarafı: api/src/modules/sor.
 *
 * Genişletme: soru geçmişi istenirse yeni varlık olarak ekleyin (npm run gen -- entity questions) ve yanıtı
 * `useWrite` ile kaydedin; bu sayfaya doğrudan veritabanı yazısı eklemeyin.
 */
import { type AskResponse } from '@uygulama/shared'
import { BookOpenText, Send, WifiOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { useSession } from '../../lib/session/context.ts'
import { Button, Card, EmptyState, PageHeader, Spinner, TextAreaField } from '../../ui/index.ts'
import { useOnline } from '../sync/syncView.ts'
import { SorAnswer } from './SorAnswer.tsx'

type AskState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string; readonly field?: string | undefined }
  | { readonly status: 'done'; readonly question: string; readonly answer: AskResponse }

export function SorPage() {
  const { api } = useSession()
  const online = useOnline()
  const [question, setQuestion] = useState('')
  const [state, setState] = useState<AskState>({ status: 'idle' })
  const loading = state.status === 'loading'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!api || !online || loading) return
    setState({ status: 'loading' })
    try {
      const answer = await api.ask({ question })
      setState({ status: 'done', question: question.trim(), answer })
    } catch (error) {
      const field = fieldErrors(error).question
      setState({ status: 'error', message: field ?? errorMessage(error), field })
    }
  }

  return (
    <>
      <PageHeader title={t('ask.title')} description={t('ask.description')} />
      <div className="flex flex-col gap-5">
        {!online && (
          <p role="status" className="flex items-start gap-2 rounded-2xl bg-surface-2 px-4 py-3 font-medium">
            <WifiOff aria-hidden size={20} className="mt-0.5 shrink-0" />
            <span>{t('ask.offline')}</span>
          </p>
        )}
        <Card>
          <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
            <TextAreaField
              label={t('ask.question')}
              hint={t('ask.hint')}
              error={state.status === 'error' ? state.field : undefined}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              maxLength={1000}
              required
            />
            <Button
              type="submit"
              icon={Send}
              loading={loading}
              disabled={!online || question.trim() === ''}
              className="self-start"
            >
              {t('ask.submit')}
            </Button>
          </form>
        </Card>
        <div aria-live="polite" className="flex flex-col gap-5">
          {state.status === 'idle' && (
            <EmptyState icon={BookOpenText} title={t('ask.emptyTitle')} message={t('ask.emptyMessage')} />
          )}
          {state.status === 'loading' && (
            <p role="status" className="flex items-center gap-3 text-muted">
              <Spinner />
              {t('ask.loading')}
            </p>
          )}
          {state.status === 'error' && !state.field && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 font-medium text-danger">
              {state.message}
            </p>
          )}
          {state.status === 'done' && <SorAnswer question={state.question} answer={state.answer} />}
        </div>
      </div>
    </>
  )
}
