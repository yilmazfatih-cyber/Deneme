// form — form durum yöneticisi + bağımlılıksız şema doğrulayıcı + erişilebilir DOM köprüsü.
// Ayrıntılı anlatım: README.md.
// Genişletme: yeni parça ayrı dosyada yazılıp buradan dışa aktarılır.
export {
  s,
  string,
  number,
  boolean,
  enumOf,
  object,
  array,
  makeSchema,
  makeIssue,
  graphemeLength,
  toNumber,
} from './schema.ts'
export type { Issue, ParseResult, Schema, StringSchema, NumberSchema, ArraySchema, Infer } from './schema.ts'
export { messages, formatIssue, type IssueCode, type IssueParams } from './messages.ts'
export {
  createForm,
  type AsyncValidator,
  type FieldState,
  type Form,
  type FormOptions,
  type SubmitResult,
} from './form.ts'
export { bindForm, renderForm, focusFirstError, readValue, type BindOptions } from './dom.ts'
export { getPath, setPath, parsePath, joinPath, deepEqual, leafPaths } from './path.ts'
export { remapPath, removeMapping, moveMapping, matchesPattern } from './field_array.ts'
