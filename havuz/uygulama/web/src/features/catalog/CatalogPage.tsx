/**
 * Bileşen kataloğu (/katalog — yalnız geliştirmede): ui/ altındaki her bileşenin canlı örneği.
 * Yeni ekran yazmadan önce buraya bakın; yeni bileşen eklerseniz örneğini buraya da koyun.
 */
import { Inbox, Pencil, Plus, Save, Trash } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { t } from '../../i18n/index.ts'
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  IconButton,
  Menu,
  PageHeader,
  SelectField,
  Skeleton,
  Spinner,
  Switch,
  Tabs,
  TextAreaField,
  TextField,
  useToast,
} from '../../ui/index.ts'

function Example({ name, children }: { name: string; children: ReactNode }) {
  return (
    <Card title={name}>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </Card>
  )
}

export function CatalogPage() {
  const toast = useToast()
  const [dialog, setDialog] = useState<'plain' | 'confirm' | null>(null)
  const [tab, setTab] = useState<'a' | 'b'>('a')
  const [checked, setChecked] = useState(true)
  const sample = t('catalog.sample')

  return (
    <>
      <PageHeader title={t('catalog.title')} description={t('catalog.description')} />
      <div className="flex flex-col gap-5">
        <Example name="Button · IconButton · ButtonLink">
          <Button icon={Save}>{t('common.save')}</Button>
          <Button variant="secondary" icon={Plus}>
            {t('common.add')}
          </Button>
          <Button variant="ghost">{t('common.cancel')}</Button>
          <Button variant="danger" icon={Trash}>
            {t('common.delete')}
          </Button>
          <Button loading>{t('common.save')}</Button>
          <Button disabled>{t('common.save')}</Button>
          <IconButton icon={Pencil} label={t('common.edit')} />
          <IconButton icon={Pencil} label={t('common.edit')} variant="secondary" />
          <ButtonLink to="/gorevler" variant="secondary">
            {t('tasks.title')}
          </ButtonLink>
        </Example>
        <Example name="TextField · TextAreaField · SelectField">
          <div className="grid w-full gap-4 sm:grid-cols-2">
            <TextField label={t('tasks.form.title')} placeholder={sample} />
            <TextField label={t('tasks.form.title')} error={t('catalog.sampleError')} defaultValue="" />
            <TextAreaField label={t('tasks.form.note')} hint={t('tasks.form.noteHint')} rows={3} />
            <SelectField label={t('tasks.form.priority')} defaultValue="normal">
              <option value="low">{t('tasks.priority.low')}</option>
              <option value="normal">{t('tasks.priority.normal')}</option>
              <option value="high">{t('tasks.priority.high')}</option>
            </SelectField>
          </div>
        </Example>
        <Example name="Checkbox · Switch">
          <div className="flex w-full flex-col">
            <Checkbox label={sample} description={t('catalog.sampleHint')} />
            <Switch label={sample} description={t('catalog.sampleHint')} checked={checked} onChange={setChecked} />
          </div>
        </Example>
        <Example name="Dialog · ConfirmDialog · Toast">
          <Button variant="secondary" onClick={() => setDialog('plain')}>
            Dialog
          </Button>
          <Button variant="secondary" onClick={() => setDialog('confirm')}>
            ConfirmDialog
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.show({ message: sample, action: { label: t('common.undo'), onAction: () => {} } })}
          >
            Toast
          </Button>
          <Button variant="secondary" onClick={() => toast.show({ message: t('error.unexpected'), tone: 'error' })}>
            Toast (error)
          </Button>
        </Example>
        <Example name="Menu · Tabs">
          <Menu
            label={t('catalog.sample')}
            items={[
              { label: t('common.edit'), icon: Pencil, onSelect: () => {} },
              { label: t('common.delete'), icon: Trash, tone: 'danger', onSelect: () => {} },
            ]}
          />
          <div className="w-full">
            <Tabs
              label={t('catalog.sample')}
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'a', label: t('tasks.status.open'), count: 3 },
                { value: 'b', label: t('tasks.status.done') },
              ]}
            >
              <p className="text-muted">{tab === 'a' ? t('tasks.status.open') : t('tasks.status.done')}</p>
            </Tabs>
          </div>
        </Example>
        <Example name="Badge · Spinner · Skeleton">
          <Badge>neutral</Badge>
          <Badge tone="accent">accent</Badge>
          <Badge tone="ok">ok</Badge>
          <Badge tone="warn">warn</Badge>
          <Badge tone="danger">danger</Badge>
          <Spinner label={t('common.loading')} />
          <Skeleton lines={2} className="w-full" />
        </Example>
        <EmptyState icon={Inbox} title={t('tasks.empty.title')} message={t('tasks.empty.message')} />
      </div>
      <Dialog
        open={dialog === 'plain'}
        onClose={() => setDialog(null)}
        title={sample}
        description={t('catalog.sampleHint')}
        footer={<Button onClick={() => setDialog(null)}>{t('common.close')}</Button>}
      >
        <TextField label={t('tasks.form.title')} />
      </Dialog>
      <ConfirmDialog
        open={dialog === 'confirm'}
        onClose={() => setDialog(null)}
        title={t('lists.confirmDelete.title', { name: sample })}
        message={t('catalog.sampleHint')}
        confirmLabel={t('common.delete')}
        tone="danger"
        onConfirm={() => {}}
      />
    </>
  )
}
