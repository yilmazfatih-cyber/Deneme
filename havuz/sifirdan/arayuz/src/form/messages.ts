// Türkçe hata iletileri sözlüğü: doğrulayıcı yalnız bir kod (ör. `too_short`) ve parametre üretir; kullanıcıya
// görünen metin burada, tek yerde durur. İletiler suçlamaz, ne yapılacağını söyler ve sayı eklerinde ses uyumu
// tuzağına düşmemek için ek almayan kalıplarla yazılır ("18'den küçük" yerine "En az 18 olmalı").
// Genişletme: yeni bir doğrulama kodu ekleyince buraya iletisini de ekleyin (tür denetimi eksikse uyarır).

export type IssueCode =
  | 'required'
  | 'type'
  | 'number'
  | 'integer'
  | 'too_short'
  | 'too_long'
  | 'too_small'
  | 'too_big'
  | 'email'
  | 'pattern'
  | 'enum'
  | 'array_too_short'
  | 'array_too_long'
  | 'custom'

export type IssueParams = Record<string, unknown>

const numberFormat = new Intl.NumberFormat('tr-TR')
const n = (value: unknown) => (typeof value === 'number' ? numberFormat.format(value) : String(value))

export const messages: Record<IssueCode, (params: IssueParams) => string> = {
  required: () => 'Bu alan zorunlu.',
  type: () => 'Bu değer geçerli değil.',
  number: () => 'Bir sayı girin.',
  integer: () => 'Tam sayı girin.',
  too_short: (p) => `En az ${n(p.min)} karakter olmalı.`,
  too_long: (p) => `En fazla ${n(p.max)} karakter olabilir.`,
  too_small: (p) => `En az ${n(p.min)} olmalı.`,
  too_big: (p) => `En fazla ${n(p.max)} olabilir.`,
  email: () => 'Geçerli bir e-posta adresi girin (ör. ad@ornek.com).',
  pattern: (p) => (typeof p.message === 'string' ? p.message : 'Biçim uygun değil.'),
  enum: () => 'Listeden bir seçenek seçin.',
  array_too_short: (p) => `En az ${n(p.min)} öğe ekleyin.`,
  array_too_long: (p) => `En fazla ${n(p.max)} öğe olabilir.`,
  custom: (p) => (typeof p.message === 'string' ? p.message : 'Bu değer geçerli değil.'),
}

export function formatIssue(code: IssueCode, params: IssueParams = {}): string {
  return messages[code](params)
}
