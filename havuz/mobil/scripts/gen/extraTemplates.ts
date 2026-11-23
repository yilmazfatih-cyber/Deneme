/**
 * Üretecin küçük şablonları: rota dosyaları, düz ekran ve üretilen kodun testleri.
 * Genişletme: üretilen teste yeni bir adım eklerken önce elle yazılmış örneğe (test/features/lists.test.tsx) bakın.
 */
import type { Names } from './model.ts'

export function routeFile(comment: string, component: string, from: string): string {
  return `// ${comment}\nexport { ${component} as default } from '${from}'\n`
}

export function plainScreen(names: Names): string {
  const { key, pascal } = names
  return `/**
 * ${pascal} ekranı (/${key}): npm run gen -- screen ${key} üretti. İçeriği yazın; veri için useRecords/useWrite
 * (lib/store/hooks.ts), bileşenler için src/ui kullanın. Örnek: features/settings/SettingsScreen.tsx.
 */
import { t } from '../../i18n/index.ts'
import { AppText, Card, Screen } from '../../ui/index.ts'

export function ${pascal}Screen() {
  return (
    <Screen title={t('${key}.title')}>
      <Card>
        <AppText>{t('${key}.description')}</AppText>
      </Card>
    </Screen>
  )
}
`
}

export function plainScreenTest(names: Names, title: string): string {
  return `/**
 * ${names.pascal} ekranı: açılır, başlığı ve açıklaması görünür (npm run gen -- screen ${names.key} üretti).
 */
import { renderApp, resetApp, skipWelcome } from '../support/app.tsx'

afterEach(resetApp)

describe('${names.key}', () => {
  it('ekran başlığıyla açılır', async () => {
    await skipWelcome()
    const app = await renderApp({ url: '/${names.key}' })
    expect(await app.screen.findByLabelText(${JSON.stringify(title)})).toBeOnTheScreen()
  })
})
`
}

export function entityTest(names: Names, sample: string): string {
  const { key } = names
  return `/**
 * ${names.pascal}: ekle → listede görünür → ayrıntıda kaydet → sil + geri al (npm run gen -- entity ${key} üretti).
 */
import { userEvent } from '@testing-library/react-native'
import { MESSAGES } from '../../src/i18n/index.ts'
import { renderApp, resetApp, skipWelcome } from '../support/app.tsx'

afterEach(resetApp)

const text = (key: string) => MESSAGES[key] ?? key

describe('${key}', () => {
  it('kayıt eklenir, düzenlenir, silinir ve geri alınır', async () => {
    await skipWelcome()
    const app = await renderApp({ url: '/${key}' })
    const user = userEvent.setup()
    await user.type(await app.screen.findByLabelText(text('${key}.new')), ${JSON.stringify(sample)})
    await user.press(app.screen.getByRole('button', { name: text('${key}.create') }))
    await user.press(await app.screen.findByRole('button', { name: ${JSON.stringify(sample)} }))
    await user.press(await app.screen.findByRole('button', { name: text('common.save') }))
    const remove = await app.screen.findByRole('button', {
      name: text('${key}.delete').replace('{name}', ${JSON.stringify(sample)}),
    })
    await user.press(remove)
    await user.press(await app.screen.findByRole('button', { name: text('common.undo') }))
    expect(await app.screen.findByRole('button', { name: ${JSON.stringify(sample)} })).toBeOnTheScreen()
  })
})
`
}
