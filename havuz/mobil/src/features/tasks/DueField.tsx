/**
 * Son tarih alanı: hazır seçimler (Tarih yok / Bugün / Yarın / Gelecek hafta) + elle yazma ("17.11.2026").
 * Değer `YYYY-AA-GG` ya da `null`dır (şema: shared/entities/tasks.ts → dueDate). Yazılan metin geçersizse alan
 * altında ileti çıkar ve değer DEĞİŞMEZ.
 *
 * Genişletme: telefonun yerel takvim seçicisini kullanmak isterseniz @react-native-community/datetimepicker
 * eklenebilir (yerel modül; Expo Go'da var). Bkz. docs/KARARLAR.md → "Tarih seçimi".
 */
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { t } from '../../i18n/index.ts'
import { addDays, formatDayInput, parseDayInput } from '../../lib/date.ts'
import { ChoiceGroup, SPACE, TextField } from '../../ui/index.ts'

type Preset = 'none' | 'today' | 'tomorrow' | 'nextWeek' | 'custom'

function presetOf(value: string | null, today: string): Preset {
  if (value === null) return 'none'
  if (value === today) return 'today'
  if (value === addDays(today, 1)) return 'tomorrow'
  if (value === addDays(today, 7)) return 'nextWeek'
  return 'custom'
}

export function DueField({
  value,
  today,
  onChange,
  error,
}: {
  value: string | null
  today: string
  onChange: (next: string | null) => void
  error?: string | undefined
}) {
  const [text, setText] = useState(value ? formatDayInput(value) : '')
  const [typingError, setTypingError] = useState<string | undefined>(undefined)
  const preset = presetOf(value, today)

  const choose = (next: Preset) => {
    const day =
      next === 'today'
        ? today
        : next === 'tomorrow'
          ? addDays(today, 1)
          : next === 'nextWeek'
            ? addDays(today, 7)
            : null
    if (next === 'custom') return
    onChange(day)
    setText(day ? formatDayInput(day) : '')
    setTypingError(undefined)
  }

  return (
    <View style={styles.wrap}>
      <ChoiceGroup
        label={t('tasks.form.dueDate')}
        value={preset}
        onChange={choose}
        options={[
          { value: 'none', label: t('tasks.form.noDate') },
          { value: 'today', label: t('date.today') },
          { value: 'tomorrow', label: t('date.tomorrow') },
          { value: 'nextWeek', label: t('date.nextWeek') },
        ]}
      />
      <TextField
        label={t('tasks.form.dueDateInput')}
        hint={t('tasks.form.dueDateHint')}
        placeholder={t('tasks.form.dueDatePlaceholder')}
        value={text}
        keyboardType="numbers-and-punctuation"
        onChangeText={(next) => {
          setText(next)
          if (next.trim() === '') {
            setTypingError(undefined)
            onChange(null)
            return
          }
          const parsed = parseDayInput(next)
          setTypingError(parsed ? undefined : t('tasks.form.dueDateInvalid'))
          if (parsed) onChange(parsed)
        }}
        error={typingError ?? error}
        maxLength={10}
      />
    </View>
  )
}

const styles = StyleSheet.create({ wrap: { gap: SPACE.sm } })
