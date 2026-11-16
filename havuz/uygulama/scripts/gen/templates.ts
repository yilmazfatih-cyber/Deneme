/**
 * Üretecin dosya şablonları. Çıktı Prettier'dan geçirilir (scripts/gen.ts), burada biçim önemli değildir.
 * Şablonlar web/src/features/tasks (başvuru özelliği) örneğinin sadeleştirilmiş hâlidir.
 *
 * Genişletme: şablonu değiştirince `npm run test:gen` ile üretilen kodun derlenip testten geçtiğini doğrulayın.
 */

export interface EntityNames {
  /** Koleksiyon (çoğul, İngilizce): `notes` */
  readonly collection: string
  /** Sözlük öneki: `notes` (alt çizgi varsa camelCase) */
  readonly key: string
  /** Bileşen adı öneki: `Notes` */
  readonly pascal: string
  /** Varlık değişkeni: `noteEntity` */
  readonly entityVar: string
  /** Kayıt türü: `Note` */
  readonly typeName: string
  /** Adres: `/notlar` */
  readonly path: string
  readonly labelSingular: string
  readonly labelPlural: string
}

export function entityFile(n: EntityNames): string {
  return `/**
 * Varlık: ${n.labelPlural} — üreteçle oluşturuldu (npm run gen -- entity ${n.collection}).
 * Alanları ihtiyacınıza göre değiştirin. Kurallar shared/src/entity.ts başında: yeni alana .default(...) verin,
 * alan silmeyin/türünü değiştirmeyin. KOPYALA-UYARLA örneği: tasks.ts.
 */
import { z } from 'zod'
import { defineEntity, type EntityData, type EntityInput } from '../entity.ts'

export const ${n.entityVar} = defineEntity({
  collection: '${n.collection}',
  label: { singular: '${n.labelSingular}', plural: '${n.labelPlural}' },
  schema: z.object({
    title: z.string().trim().min(1, 'Bir başlık yazın.').max(200, 'Başlık en çok 200 karakter olabilir.'),
    note: z.string().max(5000, 'Not en çok 5000 karakter olabilir.').default(''),
    /** Sıralama anahtarı: küçük olan üstte. */
    order: z.number().default(0),
  }),
})

export type ${n.typeName} = EntityData<typeof ${n.entityVar}>
export type ${n.typeName}Input = EntityInput<typeof ${n.entityVar}>
`
}

export function listPage(n: EntityNames): string {
  return `/**
 * ${n.labelPlural} sayfası (${n.path}) — üreteçle oluşturuldu (npm run gen -- entity ${n.collection}).
 * Görevler özelliğinin (features/tasks) sadeleştirilmiş kopyası: hızlı ekleme, Türkçe arama, silme + "Geri al".
 * Alan ekleyince/değiştirince ${n.pascal}EditPage.tsx'i ve testi (test/features/${n.collection}.test.tsx) de güncelleyin.
 */
import { matchesTr } from '@uygulama/shared'
import { Inbox, Plus, Trash } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { useStore } from '../../lib/store/context.tsx'
import { useRecords, useWrite } from '../../lib/store/hooks.ts'
import { Button, EmptyState, Field, Input, Menu, PageHeader, Skeleton, TextField, useToast } from '../../ui/index.ts'

export function ${n.pascal}Page() {
  const { workspace } = useStore()
  const items = useRecords('${n.collection}', { sort: 'order' })
  const { create, remove, restore } = useWrite('${n.collection}')
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [query, setQuery] = useState('')
  const visible = (items ?? []).filter((item) => matchesTr(\`\${item.data.title} \${item.data.note}\`, query))

  const add = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const order = (items ?? []).reduce((max, item) => Math.max(max, item.data.order), 0) + 1
      await create({ title, order })
      setTitle('')
      setError(undefined)
    } catch (reason) {
      setError(fieldErrors(reason).title ?? errorMessage(reason))
    }
  }

  const removeItem = async (id: string, itemTitle: string) => {
    try {
      await remove(id)
      toast.show({
        message: t('${n.key}.deleted', { title: itemTitle }),
        action: { label: t('common.undo'), onAction: () => restore(id) },
      })
    } catch (reason) {
      toast.show({ message: errorMessage(reason), tone: 'error' })
    }
  }

  return (
    <>
      <PageHeader title={t('${n.key}.title')} description={t('${n.key}.summary', { count: items?.length ?? 0 })} />
      <div className="flex flex-col gap-4">
        {workspace.canWrite && (
          <form onSubmit={(event) => void add(event)} noValidate className="flex items-start gap-2">
            <Field label={t('${n.key}.new')} hideLabel error={error} className="flex-1">
              {(control) => (
                <Input
                  {...control}
                  value={title}
                  placeholder={t('${n.key}.placeholder')}
                  autoComplete="off"
                  onChange={(event) => {
                    setTitle(event.target.value)
                    setError(undefined)
                  }}
                />
              )}
            </Field>
            <Button type="submit" icon={Plus}>
              {t('common.add')}
            </Button>
          </form>
        )}
        <TextField
          label={t('${n.key}.search')}
          hideLabel
          type="search"
          placeholder={t('${n.key}.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {items === undefined ? (
          <Skeleton lines={3} />
        ) : visible.length === 0 ? (
          <EmptyState icon={Inbox} title={t('${n.key}.empty.title')} message={t('${n.key}.empty.message')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((item) => (
              <li key={item.id} className="flex items-center gap-2 rounded-2xl border border-line bg-surface py-1 pr-1 pl-4">
                <Link
                  to={\`${n.path}/\${item.id}\`}
                  className="flex min-h-12 min-w-0 flex-1 items-center font-semibold break-words hover:underline"
                >
                  {item.data.title}
                </Link>
                {workspace.canWrite && (
                  <Menu
                    label={t('${n.key}.menu', { title: item.data.title })}
                    items={[
                      {
                        label: t('common.delete'),
                        icon: Trash,
                        tone: 'danger',
                        onSelect: () => void removeItem(item.id, item.data.title),
                      },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
`
}

export function editPage(n: EntityNames): string {
  return `/**
 * ${n.labelSingular} ayrıntısı (${n.path}/:id) — üreteçle oluşturuldu (npm run gen -- entity ${n.collection}).
 * Doğrulama ortak şemayla (shared/src/entities/${n.collection}.ts); iletiler alanların altında görünür.
 */
import { ${n.entityVar} } from '@uygulama/shared'
import { SearchX } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { validate, type FieldErrors } from '../../lib/form.ts'
import { useStore } from '../../lib/store/context.tsx'
import { useRecord, useWrite } from '../../lib/store/hooks.ts'
import { Button, EmptyState, PageHeader, Skeleton, TextAreaField, TextField, useToast } from '../../ui/index.ts'

const BACK = { to: '${n.path}', label: t('${n.key}.title') }

export function ${n.pascal}EditPage() {
  const { id } = useParams()
  const item = useRecord('${n.collection}', id)
  if (item === undefined) return <Skeleton lines={3} />
  if (item === null || item.deleted)
    return (
      <>
        <PageHeader title={t('${n.key}.notFound')} back={BACK} />
        <EmptyState icon={SearchX} title={t('${n.key}.notFound')} />
      </>
    )
  return (
    <>
      <PageHeader title={item.data.title} back={BACK} />
      <${n.pascal}Form key={item.id} id={item.id} initial={item.data} />
    </>
  )
}

function ${n.pascal}Form({ id, initial }: { id: string; initial: { title: string; note: string } }) {
  const { workspace } = useStore()
  const { update } = useWrite('${n.collection}')
  const navigate = useNavigate()
  const toast = useToast()
  const [values, setValues] = useState({ title: initial.title, note: initial.note })
  const [errors, setErrors] = useState<FieldErrors>({})

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = validate(${n.entityVar}.schema, { ...values, order: 0 })
    if (!result.ok) return setErrors(result.errors)
    try {
      await update(id, values)
      toast.show({ message: t('common.saved'), tone: 'success' })
      void navigate('${n.path}')
    } catch (reason) {
      const fields = fieldErrors(reason)
      setErrors(Object.keys(fields).length > 0 ? fields : { title: errorMessage(reason) })
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-5">
      <TextField
        label={t('${n.key}.form.title')}
        value={values.title}
        disabled={!workspace.canWrite}
        onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
        error={errors.title}
      />
      <TextAreaField
        label={t('${n.key}.form.note')}
        rows={5}
        value={values.note}
        disabled={!workspace.canWrite}
        onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))}
        error={errors.note}
      />
      {workspace.canWrite && (
        <div className="flex justify-end border-t border-line pt-5">
          <Button type="submit">{t('common.save')}</Button>
        </div>
      )}
    </form>
  )
}
`
}

export function entityTest(n: EntityNames): string {
  return `/**
 * ${n.labelPlural} özelliği (üreteçle oluşturuldu): ekleme, boş başlıkta doğrulama iletisi, silme + "Geri al".
 * Alanları değiştirince bu testi de güncelleyin; örnek: test/features/tasks.test.tsx.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { t } from '../../src/i18n/index.ts'
import { renderApp, resetBrowserData } from '../helpers/render.tsx'

beforeEach(async () => {
  await resetBrowserData()
})

describe('${n.labelPlural}', () => {
  it('eklenir; boş başlıkta ileti alanın altında görünür; silinir ve geri alınır', async () => {
    const user = userEvent.setup()
    renderApp({ path: '${n.path}' })
    const input = await screen.findByRole('textbox', { name: t('${n.key}.new') })
    await user.type(input, '   {Enter}')
    expect(await screen.findByText('Bir başlık yazın.')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'İlk kayıt{Enter}')
    expect(await screen.findByRole('link', { name: 'İlk kayıt' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: t('${n.key}.menu', { title: 'İlk kayıt' }) }))
    await user.click(await screen.findByRole('menuitem', { name: t('common.delete') }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'İlk kayıt' })).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: t('common.undo') }))
    expect(await screen.findByRole('link', { name: 'İlk kayıt' })).toBeInTheDocument()
  })
})
`
}

export interface PageNames {
  readonly name: string
  readonly key: string
  readonly pascal: string
  readonly title: string
}

export function simplePage(n: PageNames): string {
  return `/**
 * ${n.title} sayfası (/${n.name}) — üreteçle oluşturuldu (npm run gen -- page ${n.name}).
 * İçeriği yazın: veri gerekiyorsa useRecords (lib/store/hooks.ts), bileşenler için ui/ (canlı örnekler: /#/katalog).
 */
import { t } from '../../i18n/index.ts'
import { Card, PageHeader } from '../../ui/index.ts'

export function ${n.pascal}Page() {
  return (
    <>
      <PageHeader title={t('${n.key}.title')} description={t('${n.key}.description')} />
      <Card title={t('${n.key}.title')}>
        <p className="text-muted">{t('${n.key}.description')}</p>
      </Card>
    </>
  )
}
`
}

export function simplePageTest(n: PageNames): string {
  return `/**
 * ${n.title} sayfası (üreteçle oluşturuldu): açılır ve başlığı görünür. Sayfayı doldurdukça test ekleyin.
 */
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { t } from '../../src/i18n/index.ts'
import { renderApp, resetBrowserData } from '../helpers/render.tsx'

beforeEach(async () => {
  await resetBrowserData()
})

describe('${n.title}', () => {
  it('açılır', async () => {
    renderApp({ path: '/${n.name}' })
    expect(await screen.findByRole('heading', { level: 1, name: t('${n.key}.title') })).toBeInTheDocument()
  })
})
`
}

export function migrationFile(number: string, name: string): string {
  return `-- ${number} — ${name}: bu migrasyonun ne yaptığını bir cümleyle yazın.
-- Yayınlanmış bir migrasyonu DEĞİŞTİRMEYİN; düzeltme için yeni dosya açın (npm run gen -- migration <ad>).
-- Not: eşitlenen varlıklar için migrasyon GEREKMEZ (hepsi tek records tablosunda JSON olarak durur).
`
}
