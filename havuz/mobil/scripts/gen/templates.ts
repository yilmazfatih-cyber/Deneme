/**
 * Üretecin şablonları: varlık için liste ekranı + ayrıntı ekranı + etiketler + test, düz ekran + test.
 * Üretilen kod elle yazılmış örneklerle (features/lists, features/tasks) aynı kalıbı izler ve kural testlerinden geçer.
 *
 * Genişletme: yeni bir alan türüne denetim → `fieldControl`; şablonu değiştirdiyseniz `npm run test:gen` çalıştırın.
 */
import type { Field, Names } from './model.ts'

const header = (lines: string[]) => ['/**', ...lines.map((line) => ` * ${line}`.trimEnd()), ' */'].join('\n')

/** Enum etiketleri eşlemi adı: `color` → `COLOR_LABELS`. */
export function labelsName(field: string): string {
  return `${field.replace(/[A-Z]/g, (ch) => `_${ch}`).toLocaleUpperCase('en-US')}_LABELS`
}

export function labelsFile(names: Names, fields: readonly Field[]): string {
  const enums = fields.flatMap((field) =>
    field.type.kind === 'enum' ? [{ name: field.name, options: field.type.options }] : [],
  )
  const maps = enums.map(
    (field) =>
      `export const ${labelsName(field.name)}: Record<${field.options.map((o) => `'${o}'`).join(' | ')}, MessageKey> = {\n` +
      field.options.map((option) => `  ${option}: '${names.key}.${field.name}.${option}',`).join('\n') +
      '\n}',
  )
  return [
    header([
      `${names.pascal}: seçenek alanlarının sözlük anahtarları (npm run gen -- entity ${names.key} üretti).`,
      "Anahtarlar AÇIKÇA yazılır ki kural testi kullanılanları görsün. Şemaya seçenek eklenince buraya ve tr.json'a ekleyin.",
    ]),
    "import type { MessageKey } from '../../i18n/index.ts'",
    '',
    `/** Ekranda gösterilen alanların sözlük anahtarları. */`,
    `export const FIELD_LABELS = {`,
    ...fields.filter((f) => f.type.kind !== 'other').map((f) => `  ${f.name}: '${names.key}.field.${f.name}',`),
    `} as const satisfies Record<string, MessageKey>`,
    ...maps.map((map) => `\n${map}`),
    '',
  ].join('\n')
}

export function listScreen(names: Names, display: string): string {
  const { key, pascal } = names
  return `${header([
    `${pascal} ekranı (/${key}): hızlı ekleme, liste, dokununca ayrıntı, sil + geri al.`,
    `npm run gen -- entity ${key} üretti; örnek aldığı elle yazılmış ekran: features/lists/ListsScreen.tsx.`,
    'Genişletme: arama/süzme için features/tasks/TasksScreen.tsx ve logic.ts kalıbını izleyin.',
  ])}
import { compareTr } from '@uygulama/shared'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { useStore } from '../../lib/store/context.tsx'
import { useRecords, useWrite } from '../../lib/store/hooks.ts'
import {
  Banner,
  Button,
  EmptyState,
  IconButton,
  Loading,
  RADIUS,
  Screen,
  SPACE,
  TextField,
  TOUCH,
  AppText,
  useTheme,
  useToast,
} from '../../ui/index.ts'

export function ${pascal}Screen() {
  const { workspace } = useStore()
  const records = useRecords('${key}')
  const { create, remove, restore } = useWrite('${key}')
  const toast = useToast()
  const { colors } = useTheme()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const visible = useMemo(
    () => (records ?? []).filter((record) => !record.deleted).toSorted((a, b) => compareTr(a.data.${display}, b.data.${display})),
    [records],
  )

  const add = async () => {
    try {
      await create({ ${display}: text })
      setText('')
      setError(undefined)
    } catch (caught) {
      setError(fieldErrors(caught).${display} ?? errorMessage(caught))
    }
  }

  const removeOne = async (id: string, name: string) => {
    try {
      await remove(id)
      toast.show({
        message: t('${key}.deleted', { name }),
        action: { label: t('common.undo'), onAction: () => void restore(id) },
      })
    } catch (caught) {
      toast.show({ message: errorMessage(caught), tone: 'error' })
    }
  }

  if (records === undefined) {
    return (
      <Screen title={t('${key}.title')}>
        <Loading label={t('common.loading')} />
      </Screen>
    )
  }

  const header = (
    <View style={styles.header}>
      {workspace.canWrite ? (
        <>
          <TextField
            label={t('${key}.new')}
            value={text}
            onChangeText={setText}
            error={error}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={() => void add()}
          />
          <Button label={t('${key}.create')} icon="add" onPress={() => void add()} />
        </>
      ) : (
        <Banner tone="warn" message={t('workspace.viewerNotice')} />
      )}
    </View>
  )

  return (
    <Screen title={t('${key}.title')} scroll={false}>
      <FlatList
        data={visible}
        keyExtractor={(record) => record.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState icon="list-outline" title={t('${key}.empty.title')} message={t('${key}.empty.message')} />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint={t('${key}.openHint')}
              onPress={() => router.push({ pathname: '/${key}/[id]', params: { id: item.id } })}
              style={styles.body}
            >
              <AppText>{item.data.${display}}</AppText>
            </Pressable>
            {workspace.canWrite ? (
              <IconButton
                icon="trash-outline"
                label={t('${key}.delete', { name: item.data.${display} })}
                onPress={() => void removeOne(item.id, item.data.${display})}
              />
            ) : null}
          </View>
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: SPACE.md, paddingBottom: SPACE.md },
  list: { gap: SPACE.sm, paddingBottom: 120 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: RADIUS.md, paddingLeft: SPACE.md },
  body: { flex: 1, minHeight: TOUCH + 8, justifyContent: 'center' },
})
`
}
