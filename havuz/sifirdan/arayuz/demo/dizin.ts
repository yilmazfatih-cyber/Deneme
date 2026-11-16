// Gösterim dizini: kayıt dosyasındaki (gosterimler.json) her sistem için bir kart çizer.
// Genişletme: yeni kart için kayda bir satır eklemek yeter (npm run gen -- <ad>).
import gosterimler from './gosterimler.json'

const list = document.getElementById('dizin') as HTMLUListElement
for (const g of gosterimler) {
  const item = document.createElement('li')
  item.className = 'kart'
  const link = document.createElement('a')
  link.href = `./demo/${g.ad}/`
  link.textContent = g.baslik
  const title = document.createElement('h3')
  title.append(link)
  const teaches = document.createElement('p')
  teaches.textContent = g.ogretir
  const action = document.createElement('p')
  action.className = 'ikincil'
  action.textContent = g.etkilesim
  const code = document.createElement('code')
  code.textContent = `src/${g.ad}/`
  item.append(title, teaches, action, code)
  list.append(item)
}
