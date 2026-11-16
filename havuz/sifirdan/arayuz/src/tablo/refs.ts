// Göreli/mutlak başvuru kaydırma: bir formül başka bir hücreye kopyalanınca göreli başvurular kayar, `$` ile
// sabitlenmiş parçalar kaymaz. =A1+$B$1+C$2 formülü 1 satır aşağı, 1 sütun sağa kopyalanırsa
// =B2+$B$1+D$2 olur. Sayfanın dışına taşan başvuru #BAŞV! olur. Kaydırma belirteç (token) düzeyinde yapılır:
// kullanıcının boşlukları ve işlev adlarının dili (TOPLA/SUM) olduğu gibi kalır.
// Genişletme: satır/sütun ekleme-silmede başvuruları güncellemek için aynı yöntemle `insertRows` yazılabilir.
import { formatRef, parseRef } from './address.ts'
import { tokenize, type LexOptions } from './lexer.ts'

export function shiftFormula(input: string, rowDelta: number, colDelta: number, options: LexOptions): string {
  if (!input.startsWith('=')) return input
  const body = input.slice(1)
  let tokens
  try {
    tokens = tokenize(body, options)
  } catch {
    return input // bozuk formül olduğu gibi kopyalanır
  }
  let out = ''
  let last = 0
  for (const token of tokens) {
    if (token.type !== 'ref') continue
    const ref = parseRef(token.text)
    if (!ref) continue
    const row = ref.absRow ? ref.row : ref.row + rowDelta
    const col = ref.absCol ? ref.col : ref.col + colDelta
    out += body.slice(last, token.start) + (row < 0 || col < 0 ? '#BAŞV!' : formatRef({ ...ref, row, col }))
    last = token.end
  }
  return `=${out}${body.slice(last)}`
}
