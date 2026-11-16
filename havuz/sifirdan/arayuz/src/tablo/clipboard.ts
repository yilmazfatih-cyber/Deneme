// Pano: hücre bloklarını sekmeyle ayrılmış metne (TSV) çevirir ve geri okur. E-tablo programları arasında
// kopyala-yapıştırın ortak dili budur. Hücrede sekme, satır sonu ya da tırnak varsa hücre tırnağa alınır ve
// içindeki tırnak ikilenir. Yapıştırırken formüller, kopyalandıkları yere göre kaydırılabilir (refs.ts).
// Genişletme: HTML tablo (`text/html`) desteği ile biçimli yapıştırma eklenebilir.

export function toTSV(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) => row.map((cell) => (/[\t\n"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join('\t'))
    .join('\n')
}

/** TSV metnini satır/hücre dizisine çevirir; sondaki boş satır atılır; CRLF de kabul edilir. */
export function parseTSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  const source = text.replace(/\r\n?/g, '\n')
  while (i < source.length) {
    const ch = source[i] as string
    if (ch === '"' && cell === '') {
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '"' && source[j + 1] === '"') {
          cell += '"'
          j += 2
        } else if (source[j] === '"') break
        else cell += source[j++]
      }
      i = j + 1
      continue
    }
    if (ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
    i++
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
