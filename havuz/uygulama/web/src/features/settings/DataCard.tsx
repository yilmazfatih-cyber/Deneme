/**
 * Veri: geçerli alanı JSON olarak dışa aktar; JSON'dan içe aktar (şemayla doğrular, özet gösterir, onay ister);
 * hesaplı kipte bu cihazda kalmış hesapsız kayıtları hesaba taşı.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRightLeft, Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n/index.ts'
import { applyImport, downloadJson, exportWorkspace, planImport, type ImportPlan } from '../../lib/backup.ts'
import { toIsoDate } from '../../lib/date.ts'
import { errorMessage } from '../../lib/errors.ts'
import { useSession } from '../../lib/session/context.ts'
import { countLocalRecords, totalCount } from '../../lib/session/migrate.ts'
import { useStore } from '../../lib/store/context.tsx'
import { LOCAL_DB_NAME, openDb } from '../../lib/store/db.ts'
import { Button, ButtonLink, Card, ConfirmDialog, useToast } from '../../ui/index.ts'

export function DataCard() {
  const { db, workspace } = useStore()
  const { state } = useSession()
  const toast = useToast()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const localDb = openDb(LOCAL_DB_NAME)
  const localCount = useLiveQuery(
    async () => (state.status === 'account' ? totalCount(await countLocalRecords(localDb)) : 0),
    [state.status, localDb],
  )

  const exportNow = async () => {
    const backup = await exportWorkspace(db, workspace.id)
    downloadJson(t('settings.data.exportFile', { date: toIsoDate(new Date()) }), backup)
  }

  const readFile = async (file: File) => {
    try {
      const result = await planImport(db, workspace.id, JSON.parse(await file.text()))
      if (!result.ok) toast.show({ message: t('settings.data.badFile'), tone: 'error' })
      else if (result.plan.writes.length === 0 && result.plan.problems.length === 0)
        toast.show({ message: t('settings.data.nothingNew') })
      else setPlan(result.plan)
    } catch (error) {
      toast.show({
        message: error instanceof SyntaxError ? t('settings.data.badFile') : errorMessage(error),
        tone: 'error',
      })
    }
  }

  const summary = plan
    ? Object.entries(plan.summary).reduce(
        (sum, [, counts]) => ({ added: sum.added + counts.added, updated: sum.updated + counts.updated }),
        { added: 0, updated: 0 },
      )
    : { added: 0, updated: 0 }

  return (
    <Card title={t('settings.data')} description={t('settings.data.description', { workspace: workspace.name })}>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={Download} onClick={() => void exportNow()}>
          {t('settings.data.export')}
        </Button>
        {workspace.canWrite && (
          <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()}>
            {t('settings.data.import')}
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void readFile(file)
          }}
        />
      </div>
      {(localCount ?? 0) > 0 && (
        <div className="mt-4 flex flex-col items-start gap-2 rounded-2xl bg-accent-soft p-4">
          <p>{t('settings.data.localLeft', { count: localCount ?? 0 })}</p>
          <ButtonLink to="/hesaba-tasi?next=%2Fayarlar" variant="secondary" icon={ArrowRightLeft}>
            {t('migrate.submit')}
          </ButtonLink>
        </div>
      )}
      <ConfirmDialog
        open={plan !== null}
        onClose={() => setPlan(null)}
        title={t('settings.data.importTitle')}
        message={t('settings.data.importSummary', { added: summary.added, updated: summary.updated })}
        confirmLabel={t('settings.data.importConfirm')}
        confirmDisabled={(plan?.writes.length ?? 0) === 0}
        onConfirm={async () => {
          if (!plan) return
          const written = await applyImport(db, workspace.id, plan)
          toast.show({ message: t('settings.data.imported', { count: written }), tone: 'success' })
          void navigate('/gorevler')
        }}
      >
        {plan && plan.problems.length > 0 && (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-warn">
            {t('settings.data.importProblems', { count: plan.problems.length })}
          </p>
        )}
      </ConfirmDialog>
    </Card>
  )
}
