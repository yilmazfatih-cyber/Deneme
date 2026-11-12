import { aDegeri } from './dongu_a.js'

// dongu_a henüz değerlendirilmedi: aDegeri bağlaması var ama TDZ'de.
export let bSonuc
try {
  bSonuc = aDegeri
} catch (hata) {
  bSonuc = hata.name
}
