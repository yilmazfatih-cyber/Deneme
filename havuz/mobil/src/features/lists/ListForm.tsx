/**
 * Liste formu: ad + renk. Yeni liste ve düzenleme ekranı aynı formu kullanır.
 * Genişletme: listeye yeni alan eklendiğinde (shared/entities/lists.ts) buraya denetimini ekleyin.
 */
import { LIST_COLORS, type ListColor } from '@uygulama/shared'
import { StyleSheet, View } from 'react-native'
import { t } from '../../i18n/index.ts'
import { ChoiceGroup, SPACE, TextField } from '../../ui/index.ts'
import { COLOR_LABELS } from '../tasks/labels.ts'

export interface ListFormValues {
  readonly name: string
  readonly color: ListColor
}

export function ListForm({
  values,
  onChange,
  errors,
  onSubmit,
}: {
  values: ListFormValues
  onChange: (values: ListFormValues) => void
  errors: Record<string, string>
  onSubmit?: () => void
}) {
  return (
    <View style={styles.form}>
      <TextField
        label={t('lists.form.name')}
        value={values.name}
        onChangeText={(name) => onChange({ ...values, name })}
        error={errors.name}
        maxLength={80}
        returnKeyType="done"
        {...(onSubmit ? { onSubmitEditing: onSubmit } : {})}
      />
      <ChoiceGroup
        label={t('lists.form.color')}
        value={values.color}
        onChange={(color) => onChange({ ...values, color })}
        options={LIST_COLORS.map((value) => ({ value, label: t(COLOR_LABELS[value]) }))}
      />
    </View>
  )
}

const styles = StyleSheet.create({ form: { gap: SPACE.md } })
