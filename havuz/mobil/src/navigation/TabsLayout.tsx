/**
 * Alt sekmeler (src/app/(app)/(tabs)/_layout.tsx): Görevler · Listeler · Ayarlar. Her sekmenin adı, simgesi ve
 * ekran okuyucu adı buradadır. Sekme çubuğu yüksekliği ≥ 48 dp; simgeler süstür (ad metinden okunur).
 *
 * Genişletme: yeni sekme → src/app/(app)/(tabs)/<ad>.tsx + aşağıdaki TABS listesine satır (en çok 5 sekme).
 */
import { Tabs } from 'expo-router/js-tabs'
import type { ColorValue } from 'react-native'
import { t, type MessageKey } from '../i18n/index.ts'
import { Icon, useTheme, type IconName } from '../ui/index.ts'

/** Sekmeler (sırası ekranda görünen sıradır). Üreteç yeni sekmeyi işaretli satırın üstüne ekler. */
const TABS: readonly { name: string; title: MessageKey; icon: IconName }[] = [
  { name: 'tasks', title: 'tasks.title', icon: 'checkbox-outline' },
  { name: 'lists', title: 'lists.title', icon: 'list-outline' },
  // YENİ SEKME BURAYA
  { name: 'settings', title: 'settings.title', icon: 'settings-outline' },
]

function tabIcon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} size={24} {...(typeof color === 'string' ? { color } : {})} />
  }
}

export function TabsLayout() {
  const { colors } = useTheme()
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accentInk,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, minHeight: 56 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.ink,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map((tab, index) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarIcon: tabIcon(tab.icon),
            // Varsayılan iOS etiketi İngilizcedir ("…, tab, 1 of 3"); Türkçesi:
            tabBarAccessibilityLabel: t('nav.tab', { name: t(tab.title), index: index + 1, count: TABS.length }),
          }}
        />
      ))}
    </Tabs>
  )
}
