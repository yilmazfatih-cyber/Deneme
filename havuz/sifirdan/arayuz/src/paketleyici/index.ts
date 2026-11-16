// paketleyici — mini modül paketleyici: ES modül içe/dışa aktarımlarını çözümler, bağımlılık çizgesi kurar,
// döngüleri bulur, modülleri küçük bir `require` çalışma zamanıyla tek dosyaya sarar, kullanılmayan
// dışa aktarımları atar (ağaç silkeleme) ve satır eşlemeli kaynak haritası üretir. Komut satırı: cli.ts.
// Ayrıntılı anlatım: README.md.
export { tokenize, SyntaxErrorAt, type Token, type TokenType } from './tokenizer.ts'
export { parseModule, type ParsedModule, type Statement, type ImportSpec, type ExportSpec } from './module_parser.ts'
export {
  buildGraph,
  findCycles,
  resolveSpecifier,
  normalizePath,
  dirname,
  type FileSystem,
  type ModuleGraph,
  type ModuleRecord,
} from './graph.ts'
export { shake, exportNames, type ShakeResult } from './shake.ts'
export { emitBundle, emitModule, type Format, type EmittedLine } from './emit.ts'
export {
  encodeVlq,
  decodeVlq,
  buildSourceMap,
  decodeLines,
  inlineComment,
  base64Utf8,
  type SourceMapV3,
} from './sourcemap.ts'
export { bundle, type BundleOptions, type BundleResult } from './bundle.ts'
