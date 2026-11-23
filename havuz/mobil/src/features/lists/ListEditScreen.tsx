/**
 * Liste düzenleme ekranı (/list/<kimlik>): ad ve renk; sil (geri alınabilir — listedeki görevler silinmez,
 * "listesiz" görünür). Yalnız değişen alanlar gönderilir.
 *
 * Genişletme: TaskEditScreen.tsx ile aynı kalıp; yeni alan → ListForm.tsx.
 */
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { useRecord, useWrite } from '../../lib/store/hooks.ts'
import { Button, EmptyState, Loading, Screen, useToast } from '../../ui/index.ts'
import type { TaskList } from '../tasks/logic.ts'
import { useTaskActions } from '../tasks/useTaskActions.ts'
import { ListForm } from './ListForm.tsx'

export function ListEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const list = useRecord('lists', id)
  if (list === undefined) {
    return (
      <Screen title={t('lists.edit')}>
        <Loading label={t('common.loading')} />
      </Screen>
    )
  }
  if (list === null || list.deleted) {
    return (
      <Screen title={t('lists.edit')}>
        <EmptyState
          icon="alert-circle-outline"
          title={t('lists.notFound.title')}
          message={t('lists.notFound.message')}
          action={<Button label={t('lists.backToLists')} variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    )
  }
  return <ListEditForm key={list.id} list={list} />
}

function ListEditForm({ list }: { list: TaskList }) {
  const { update } = useWrite('lists')
  const actions = useTaskActions()
  const toast = useToast()
  const [values, setValues] = useState({ name: list.data.name, color: list.data.color })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = async () => {
    try {
      const changed = await update(list.id, values)
      toast.show({ message: changed ? t('common.saved') : t('common.noChanges'), tone: 'success' })
      router.back()
    } catch (error) {
      const fields = fieldErrors(error)
      setErrors(fields)
      if (Object.keys(fields).length === 0) toast.show({ message: errorMessage(error), tone: 'error' })
    }
  }

  const footer = (
    <>
      <Button label={t('common.save')} icon="checkmark" onPress={() => void save()} />
      <Button
        label={t('lists.delete', { name: list.data.name })}
        variant="danger"
        icon="trash-outline"
        onPress={() => {
          void actions.removeList(list)
          router.back()
        }}
      />
    </>
  )

  return (
    <Screen title={t('lists.edit')} footer={footer}>
      <ListForm values={values} onChange={setValues} errors={errors} />
    </Screen>
  )
}
