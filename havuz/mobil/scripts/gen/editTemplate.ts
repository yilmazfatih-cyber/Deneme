/**
 * Üretecin ayrıntı (düzenleme) ekranı şablonu: metin → TextField, evet/hayır → Checkbox, seçenek → ChoiceGroup.
 * Sayı, tarih ve başka kayda bağ gibi alanlar iskelete girmez; dosya başlığında listelenir (elle eklenir; örnek:
 * features/tasks/TaskEditScreen.tsx + DueField.tsx). Yalnız değişen alanlar gönderilir (useWrite → update).
 *
 * Genişletme: yeni alan türü → `fieldControl`'e dal + model.ts → `classify`.
 */
import type { Field, Names } from './model.ts'
import { labelsName } from './templates.ts'

function fieldControl(field: Field): string | null {
  const name = field.name
  const label = `t(FIELD_LABELS.${name})`
  switch (field.type.kind) {
    case 'text':
      return `      <TextField label={${label}} value={values.${name}} onChangeText={(${name}) => setValues({ ...values, ${name} })} error={errors.${name}} />`
    case 'boolean':
      return `      <Checkbox checked={values.${name}} label={${label}} onChange={(${name}) => setValues({ ...values, ${name} })} showLabel />`
    case 'enum':
      return [
        '      <ChoiceGroup',
        `        label={${label}}`,
        `        value={values.${name}}`,
        `        onChange={(${name}) => setValues({ ...values, ${name} })}`,
        `        options={(Object.keys(${labelsName(name)}) as (keyof typeof ${labelsName(name)})[]).map((value) => ({`,
        '          value,',
        `          label: t(${labelsName(name)}[value]),`,
        '        }))}',
        '      />',
      ].join('\n')
    case 'other':
      return null
  }
}

export function editScreen(names: Names, fields: readonly Field[], display: string): string {
  const { key, pascal } = names
  const editable = fields.filter((field) => field.type.kind !== 'other')
  const manual = fields.filter((field) => field.type.kind === 'other')
  const enums = fields.filter((field) => field.type.kind === 'enum').map((field) => labelsName(field.name))
  const uiImports = ['Button', 'EmptyState', 'Loading', 'Screen', 'useToast']
  if (editable.some((field) => field.type.kind === 'text')) uiImports.push('TextField')
  if (editable.some((field) => field.type.kind === 'boolean')) uiImports.push('Checkbox')
  if (enums.length > 0) uiImports.push('ChoiceGroup')
  const manualLine =
    manual.length > 0
      ? ` * Elle eklenecek alanlar (iskelete girmedi): ${manual.map((f) => `${f.name} (${f.type.kind === 'other' ? f.type.description : ''})`).join(', ')}.`
      : ' * Bütün alanların denetimi üretildi.'
  return `/**
 * ${pascal} ayrıntı ekranı (/${key}/<kimlik>): alanları düzenle, kaydet, sil (geri alınabilir).
 * npm run gen -- entity ${key} üretti; örnek aldığı elle yazılmış ekran: features/lists/ListEditScreen.tsx.
${manualLine}
 */
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { useRecord, useWrite } from '../../lib/store/hooks.ts'
import type { Rec } from '../../lib/store/records.ts'
import { ${uiImports.toSorted().join(', ')} } from '../../ui/index.ts'
import { ${['FIELD_LABELS', ...enums].join(', ')} } from './labels.ts'

export function ${pascal}EditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const record = useRecord('${key}', id)
  if (record === undefined) {
    return (
      <Screen title={t('${key}.edit.title')}>
        <Loading label={t('common.loading')} />
      </Screen>
    )
  }
  if (record === null || record.deleted) {
    return (
      <Screen title={t('${key}.edit.title')}>
        <EmptyState
          icon="alert-circle-outline"
          title={t('${key}.notFound.title')}
          message={t('${key}.notFound.message')}
          action={<Button label={t('${key}.back')} variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    )
  }
  return <${pascal}Form key={record.id} record={record} />
}

function ${pascal}Form({ record }: { record: Rec<'${key}'> }) {
  const { update, remove, restore } = useWrite('${key}')
  const toast = useToast()
  const [values, setValues] = useState({
${editable.map((field) => `    ${field.name}: record.data.${field.name},`).join('\n')}
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = async () => {
    try {
      const changed = await update(record.id, values)
      toast.show({ message: changed ? t('common.saved') : t('common.noChanges'), tone: 'success' })
      router.back()
    } catch (error) {
      const fields = fieldErrors(error)
      setErrors(fields)
      if (Object.keys(fields).length === 0) toast.show({ message: errorMessage(error), tone: 'error' })
    }
  }

  const removeThis = async () => {
    await remove(record.id)
    toast.show({
      message: t('${key}.deleted', { name: record.data.${display} }),
      action: { label: t('common.undo'), onAction: () => void restore(record.id) },
    })
    router.back()
  }

  const footer = (
    <>
      <Button label={t('common.save')} icon="checkmark" onPress={() => void save()} />
      <Button
        label={t('${key}.delete', { name: record.data.${display} })}
        variant="danger"
        icon="trash-outline"
        onPress={() => void removeThis()}
      />
    </>
  )

  return (
    <Screen title={t('${key}.edit.title')} footer={footer}>
${editable
  .map((field) => fieldControl(field))
  .filter((line): line is string => line !== null)
  .join('\n')}
    </Screen>
  )
}
`
}
