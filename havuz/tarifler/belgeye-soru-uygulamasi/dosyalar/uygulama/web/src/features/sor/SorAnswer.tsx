/**
 * Belgeye soru yanıtı: yanıt metni, "belgelerde yok" bildirimi, denetlenecek uyarılar ve kaynak listesi
 * (numara + belge › bölüm; alıntı açılır kapanır). Yanıttaki [n] işaretleri kaynak numaralarıyla eşleşir.
 * Kullanan: SorPage.tsx.
 *
 * Genişletme: kaynağa bağlantı (belgeyi açma) gerekirse API yanıtına adres alanı ekleyip burada <a> çizin.
 */
import { type AskResponse } from '@uygulama/shared'
import { CircleExclamationPoint, Info } from 'lucide-react'
import { t } from '../../i18n/index.ts'
import { Card } from '../../ui/index.ts'

export function SorAnswer({ question, answer }: { question: string; answer: AskResponse }) {
  return (
    <Card title={t('ask.answer')} description={t('ask.asked', { question })}>
      <div className="flex flex-col gap-4">
        {answer.notInDocuments ? (
          <p className="flex items-start gap-2 rounded-2xl bg-surface-2 px-4 py-3 font-medium">
            <Info aria-hidden size={20} className="mt-0.5 shrink-0" />
            <span>{t('ask.notInDocuments')}</span>
          </p>
        ) : (
          <p className="text-lg leading-relaxed whitespace-pre-line">{answer.answer}</p>
        )}
        {answer.warnings.length > 0 && (
          <section aria-labelledby="sor-uyarilar" className="rounded-2xl bg-warn-soft px-4 py-3">
            <h3 id="sor-uyarilar" className="flex items-center gap-2 font-bold">
              <CircleExclamationPoint aria-hidden size={18} />
              {t('ask.warnings')}
            </h3>
            <ul className="mt-1 list-disc pl-6">
              {answer.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        )}
        {answer.sources.length > 0 && (
          <section aria-labelledby="sor-kaynaklar" className="flex flex-col gap-2">
            <h3 id="sor-kaynaklar" className="font-bold">
              {t('ask.sources')}
            </h3>
            <ul className="flex flex-col gap-2">
              {answer.sources.map((source) => (
                <li key={source.number}>
                  <details className="rounded-2xl border border-line px-4">
                    <summary className="flex min-h-12 cursor-pointer items-center font-semibold">
                      {t('ask.source', { number: source.number, title: source.title })}
                    </summary>
                    <p className="pb-3 whitespace-pre-line text-muted">{source.excerpt}</p>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-sm text-muted">{t('ask.checkHint')}</p>
      </div>
    </Card>
  )
}
