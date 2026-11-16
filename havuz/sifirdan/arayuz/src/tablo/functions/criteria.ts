// Ölçüt (koşul) eşleme: ETOPLA/EĞERSAY/EĞERORTALAMA için ">5", "<>0", "=elma", "el*", "?ar" gibi ölçütler.
// İşleç önekleri: = <> < > <= >= (yoksa "eşit"). Metin karşılaştırması Türkçe ve harf büyüklüğüne duyarsız;
// * herhangi bir dizi, ? tek karakter; ~* ve ~? gerçek yıldız/soru işaretidir.
// Genişletme: tarih ölçütü (">"&TARİH(...)) zaten sayı olarak çalışır; düzenli ifade isteniyorsa buraya ekleyin.
import { compareValues, isError, textToNumber, type CellValue, type NumberStyle } from '../values.ts'

export type Predicate = (value: CellValue) => boolean

function wildcardToRegex(pattern: string): RegExp {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] as string
    if (ch === '~' && (pattern[i + 1] === '*' || pattern[i + 1] === '?')) {
      source += `\\${pattern[++i]}`
    } else if (ch === '*') source += '.*'
    else if (ch === '?') source += '.'
    else source += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`, 'su')
}

const fold = (text: string) => text.toLocaleLowerCase('tr-TR')

export function makeCriteria(criterion: CellValue, style: NumberStyle): Predicate {
  if (typeof criterion !== 'string')
    return (value) => !isError(value) && value !== null && compareValues(value, criterion) === 0
  const match = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(criterion) as RegExpExecArray
  const op = match[1] ?? '='
  const operand = match[2] ?? ''
  const asNumber = textToNumber(operand, style)
  const target: CellValue = asNumber ?? operand
  const wildcard = typeof target === 'string' && /[*?]/.test(target) && (op === '=' || op === '<>')
  const regex = wildcard ? wildcardToRegex(fold(target as string)) : undefined
  return (value) => {
    if (isError(value)) return false
    if (op === '=' && operand === '') return value === null || value === ''
    if (regex) {
      const hit = typeof value === 'string' && regex.test(fold(value))
      return op === '=' ? hit : !hit
    }
    if (value === null) return op === '<>'
    if (typeof target === 'number' && typeof value !== 'number') return op === '<>'
    if (typeof target === 'string' && typeof value !== 'string') return op === '<>'
    const c = compareValues(value, target)
    switch (op) {
      case '=':
        return c === 0
      case '<>':
        return c !== 0
      case '<':
        return c < 0
      case '>':
        return c > 0
      case '<=':
        return c <= 0
      default:
        return c >= 0
    }
  }
}
