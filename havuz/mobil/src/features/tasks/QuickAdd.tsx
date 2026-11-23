/**
 * Hızlı ekleme: başlığı yazıp klavyenin "Ekle" tuşuna ya da düğmeye basınca görev açılır; kutu boşalır, klavye açık
 * kalır (art arda ekleme). Boş başlık sözlükteki iletiyle reddedilir (şema: shared/entities/tasks.ts).
 *
 * Genişletme: hızlı eklemede başka bir alan (ör. son tarih "yarın") isteniyorsa `create` girdisine ekleyin.
 */
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { useWrite } from '../../lib/store/hooks.ts'
import { Button, SPACE, TextField } from '../../ui/index.ts'

export function QuickAdd({ listId, order }: { listId: string | null; order: number }) {
  const { create } = useWrite('tasks')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  const submit = async () => {
    try {
      await create({ title, listId, order })
      setTitle('')
      setError(undefined)
    } catch (caught) {
      setError(fieldErrors(caught).title ?? errorMessage(caught))
    }
  }

  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextField
          label={t('tasks.quickAdd.label')}
          placeholder={t('tasks.quickAdd.placeholder')}
          value={title}
          onChangeText={(text) => {
            setTitle(text)
            if (error) setError(undefined)
          }}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={() => void submit()}
          error={error}
          maxLength={200}
        />
      </View>
      <Button label={t('common.add')} icon="add" onPress={() => void submit()} style={styles.button} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  field: { flex: 1 },
  button: { marginTop: 26 },
})
