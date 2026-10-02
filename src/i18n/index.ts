import tr from './tr.json'

export type MessageKey = keyof typeof tr

/** Arayüz metni. `{ad}` yer tutucuları verilen değerlerle doldurulur. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = tr[key]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v))
  }
  return text
}
