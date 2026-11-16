/**
 * Zod'un varsayılan hata iletilerini Türkçeye çevirir ve şema hatalarını okunur satırlara döker.
 * Kim kullanır: şema tanımlayan her modül (site-schema.ts, deploy.ts, content/schemas.ts) `z`'yi buradan alır.
 * Genişletme: yeni bir şema dosyası açarsanız `import { z } from '../lib/zod-tr.ts'` yazın; `astro/zod`'u doğrudan almayın.
 */
import { z } from 'astro/zod'

z.config(z.locales.tr())

export { z }

/** Bir Zod hatasını "  - alan.yolu: ileti" satırlarına çevirir. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String).join('.')
      return `  - ${path === '' ? '(kök)' : path}: ${issue.message}`
    })
    .join('\n')
}
