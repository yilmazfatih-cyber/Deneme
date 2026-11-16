// Erişilebilirlik yedekleri: HTML açıklama (renk kutusu + seri adı) ve veri tablosu. Grafiği göremeyen ya da
// sayıları kopyalamak isteyen kullanıcı tabloyu okur. Tüm metinler kaçışlanır.
// Genişletme: tabloya "CSV indir" düğmesi eklemek için aynı satırları `toTSV` benzeri bir işlevle yazın.
import { escapeXml } from './svg.ts'
import { seriesClass } from './theme.ts'

export function legendHtml(names: readonly string[], extra: readonly string[] = []): string {
  const items = names.map(
    (name, i) =>
      `<li class="${seriesClass(i)}"><span class="renk" aria-hidden="true"></span>${escapeXml(name)}${extra[i] ? ` <span class="ek">${escapeXml(extra[i])}</span>` : ''}</li>`,
  )
  return `<ul class="grafik-aciklama">${items.join('')}</ul>`
}

export function tableHtml(caption: string, header: readonly string[], rows: readonly (readonly string[])[]): string {
  const head = `<tr>${header.map((h) => `<th scope="col">${escapeXml(h)}</th>`).join('')}</tr>`
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell, i) => (i === 0 ? `<th scope="row">${escapeXml(cell)}</th>` : `<td>${escapeXml(cell)}</td>`)).join('')}</tr>`,
    )
    .join('')
  return `<table class="grafik-tablo"><caption>${escapeXml(caption)}</caption><thead>${head}</thead><tbody>${body}</tbody></table>`
}
