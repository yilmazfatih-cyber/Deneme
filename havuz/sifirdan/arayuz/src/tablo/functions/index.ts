// İşlev kayıt dosyası: tüm işlev grupları burada tek bir tabloda toplanır ve katlanmış adla aranır.
// Aynı (katlanmış) adın iki ayrı işlevde tanımlanması kurulumda hata verir (sessizce üzerine yazılmasın).
// Bir işlevin MİN/MIN gibi katlanınca aynı olan adları sorun değildir.
// Genişletme: YENİ GRUP BURAYA → yeni bir dosya (ör. finance.ts) yazıp `GROUPS` dizisine ekleyin.
import { foldName } from '../parser.ts'
import { DATE } from './date.ts'
import { LOGIC } from './logic.ts'
import { LOOKUP } from './lookup.ts'
import { MATH } from './math.ts'
import type { FunctionDef } from './registry.ts'
import { TEXT } from './text.ts'

const GROUPS: FunctionDef[][] = [MATH, LOGIC, TEXT, DATE, LOOKUP]

const table = new Map<string, FunctionDef>()
for (const def of GROUPS.flat()) {
  for (const name of def.names) {
    const key = foldName(name)
    const existing = table.get(key)
    if (existing && existing !== def) throw new Error(`İşlev adı iki kez tanımlandı: ${name}`)
    table.set(key, def)
  }
}

export function lookupFunction(foldedName: string): FunctionDef | undefined {
  return table.get(foldedName)
}

/** Tüm işlevler (her biri bir kez), ilk adına göre sıralı: gösterim ve belgeler için. */
export function listFunctions(): FunctionDef[] {
  return GROUPS.flat().sort((a, b) => (a.names[0] as string).localeCompare(b.names[0] as string, 'tr'))
}
