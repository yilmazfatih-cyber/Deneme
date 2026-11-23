/**
 * Seçim denetimleri: onay kutusu (`Checkbox`) ve tek seçimli düğme grubu (`ChoiceGroup`, ör. öncelik ya da tema).
 * Ekran okuyucu rolü ve durumu (işaretli/seçili) verilir; her seçenek ≥ 48 dp.
 *
 *   <Checkbox checked={task.data.done} label={t('tasks.markDone', { title })} onChange={toggle} />
 *   <ChoiceGroup label={t('tasks.form.priority')} value={priority} onChange={setPriority}
 *     options={TASK_PRIORITIES.map((value) => ({ value, label: t(PRIORITY_LABELS[value]) }))} />
 *
 * Genişletme: çoklu seçim gerekiyorsa ayrı bir bileşen yazın (bunu değiştirmeyin; tek seçim varsayımı testlidir).
 */
import { Pressable, StyleSheet, View } from 'react-native'
import { a11yState } from './a11y.ts'
import { Icon } from './Icon.tsx'
import { AppText } from './Text.tsx'
import { RADIUS, SPACE, TOUCH, useTheme } from './theme.tsx'

export function Checkbox({
  checked,
  label,
  onChange,
  disabled,
  showLabel = false,
}: {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
  disabled?: boolean
  /** Etiket kutunun yanında yazılsın mı (formlarda `true`; satırlarda başlık zaten görünür). */
  showLabel?: boolean
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      {...a11yState({ checked, disabled: disabled === true })}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.checkbox, showLabel ? styles.labelled : null]}
    >
      <Icon
        name={checked ? 'checkbox' : 'square-outline'}
        size={28}
        color={checked ? colors.accent : colors.lineStrong}
      />
      {showLabel ? <AppText weight="medium">{label}</AppText> : null}
    </Pressable>
  )
}

export interface ChoiceOption<T extends string> {
  readonly value: T
  readonly label: string
  /** Seçeneğin yanında küçük renk noktası (ör. liste rengi). Süstür; anlamı etiket taşır. */
  readonly swatch?: string
}

export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly ChoiceOption<T>[]
  onChange: (value: T) => void
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.group}>
      <AppText weight="medium" accessibilityElementsHidden importantForAccessibility="no" aria-hidden>
        {label}
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              {...a11yState({ checked: selected })}
              onPress={() => onChange(option.value)}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? colors.accentSoft : colors.surface,
                  borderColor: selected ? colors.accentInk : colors.lineStrong,
                },
              ]}
            >
              {selected ? <Icon name="checkmark" size={18} color={colors.accentInk} /> : null}
              {option.swatch ? <View style={[styles.swatch, { backgroundColor: option.swatch }]} /> : null}
              <AppText weight={selected ? 'bold' : 'regular'} tone={selected ? 'accent' : 'ink'}>
                {option.label}
              </AppText>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  checkbox: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  labelled: { flexDirection: 'row', justifyContent: 'flex-start', gap: SPACE.sm, alignSelf: 'flex-start' },
  group: { gap: SPACE.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  option: {
    minHeight: TOUCH,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
})
