/**
 * Görünüm ayarları: tema (sistem/açık/koyu), yazı boyutu, yüksek karşıtlık, hareketi azalt.
 * Ayarlar cihaza özgüdür (lib/appearance.ts) ve hemen uygulanır.
 */
import { Monitor, Moon, Sun } from 'lucide-react'
import { FONT_SCALES, setAppearance, THEMES, useAppearance, type Appearance } from '../../lib/appearance.ts'
import { t, type MessageKey } from '../../i18n/index.ts'
import { Card, cx, Switch } from '../../ui/index.ts'

const THEME_LABELS: Record<Appearance['theme'], MessageKey> = {
  system: 'settings.theme.system',
  light: 'settings.theme.light',
  dark: 'settings.theme.dark',
}
const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const

const FONT_LABELS: Record<Appearance['fontScale'], MessageKey> = {
  normal: 'settings.font.normal',
  large: 'settings.font.large',
  larger: 'settings.font.larger',
}

function Choice<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string
  name: string
  value: T
  options: readonly { value: T; label: string; icon?: typeof Sun }[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={cx(
                'flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 text-center font-semibold transition-colors',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                value === option.value
                  ? 'border-accent bg-accent-soft text-accent-text'
                  : 'border-line-strong hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {Icon && <Icon aria-hidden size={18} />}
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function AppearanceCard() {
  const appearance = useAppearance()
  const update = (patch: Partial<Appearance>) => setAppearance({ ...appearance, ...patch })
  return (
    <Card title={t('settings.appearance')}>
      <div className="flex flex-col gap-5">
        <Choice
          legend={t('settings.theme')}
          name="tema"
          value={appearance.theme}
          onChange={(theme) => update({ theme })}
          options={THEMES.map((value) => ({ value, label: t(THEME_LABELS[value]), icon: THEME_ICONS[value] }))}
        />
        <Choice
          legend={t('settings.font')}
          name="yazi"
          value={appearance.fontScale}
          onChange={(fontScale) => update({ fontScale })}
          options={FONT_SCALES.map((value) => ({ value, label: t(FONT_LABELS[value]) }))}
        />
        <div className="flex flex-col divide-y divide-line">
          <Switch
            label={t('settings.highContrast')}
            description={t('settings.highContrastHint')}
            checked={appearance.highContrast}
            onChange={(highContrast) => update({ highContrast })}
          />
          <Switch
            label={t('settings.reduceMotion')}
            description={t('settings.reduceMotionHint')}
            checked={appearance.reduceMotion}
            onChange={(reduceMotion) => update({ reduceMotion })}
          />
        </div>
      </div>
    </Card>
  )
}
