// duzenleyici — metin düzenleyici çekirdeği: parça tablosu, satır dizini, çoklu seçim, gruplu geri al,
// Türkçe büyük/küçük harf duyarsız bul/değiştir, grafem kümelerine saygılı imleç. Tek giriş noktası.
// Ayrıntılı anlatım: README.md.
// Genişletme: yeni parça ayrı dosyada yazılıp buradan dışa aktarılır.
export { PieceTable, normalizeNewlines } from './piece_table.ts'
export { ChangeSet, type Change } from './changes.ts'
export { UndoHistory, type EditKind, type HistoryEntry } from './history.ts'
export {
  cursor,
  single,
  normalizeSelection,
  primaryRange,
  rangeFrom,
  rangeTo,
  isEmpty,
  type Range,
  type Selection,
} from './selection.ts'
export {
  nextGrapheme,
  prevGrapheme,
  snapToGrapheme,
  graphemeCount,
  offsetOfGrapheme,
  nextWordEnd,
  prevWordStart,
  wordAt,
} from './text_units.ts'
export {
  findAll,
  buildRegExp,
  turkishCaseInsensitive,
  caseVariants,
  escapeRegExp,
  expandReplacement,
  SearchError,
  type Match,
  type SearchQuery,
} from './search.ts'
export { Editor, type EditorOptions } from './editor.ts'
