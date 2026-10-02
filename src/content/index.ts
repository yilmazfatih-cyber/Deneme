import categoriesJson from '../../content/categories.json'
import journeyJson from '../../content/journey.json'
import quickJson from '../../content/quick.json'
import templatesJson from '../../content/templates.json'
import type { Category, ContentBundle, Journey, QuickItem, Template, Word } from './schema'

/**
 * İçerik derleme sırasında scripts/validate-content.ts ile doğrulanır;
 * burada yalnızca tipleriyle içe aktarılır (Zod çalışma zamanında yüklenmez).
 */
const vocabularyModules = import.meta.glob<{ default: Word[] }>('../../content/vocabulary/*.json', {
  eager: true,
})

/** Kelime dosyaları içerikteki kategori sırasına göre birleştirilir; sıra panodaki yeri belirler. */
const categories = categoriesJson as Category[]
const categoryOrder = new Map(categories.map((c, i) => [c.id, i]))
const words: Word[] = Object.keys(vocabularyModules)
  .sort()
  .flatMap((key) => vocabularyModules[key]!.default)
  .map((w, i) => ({ w, i }))
  .sort((a, b) => (categoryOrder.get(a.w.category) ?? 0) - (categoryOrder.get(b.w.category) ?? 0) || a.i - b.i)
  .map(({ w }) => w)

export const content: ContentBundle = {
  categories,
  templates: templatesJson as Template[],
  quick: quickJson as QuickItem[],
  words,
  journey: journeyJson as Journey,
}

export const wordById = new Map(content.words.map((w) => [w.id, w]))
export const categoryById = new Map(content.categories.map((c) => [c.id, c]))
export const templateById = new Map(content.templates.map((t) => [t.id, t]))

export function childCategories(parentId: string | undefined): Category[] {
  return content.categories.filter((c) => c.parent === parentId)
}

export function wordsInCategory(categoryId: string): Word[] {
  return content.words.filter((w) => w.category === categoryId)
}

export function symbolUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}

export type { Category, Journey, QuickItem, Template, Word } from './schema'
