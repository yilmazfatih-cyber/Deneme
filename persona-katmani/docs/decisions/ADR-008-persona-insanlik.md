# ADR-008 · F-8: Personaya ne kadar insanlık

Tarih: 2026-11-08 · Durum: Kabul edildi (proje sahibi)

| Alt soru | Karar | Uygulama |
| --- | --- | --- |
| Ad ve yüz | **Numara.** İnsan adı ve fotoğraf yok. | Simülasyon müşterileri `m123` kodu ve segment/küme adıyla anılır; rapor ve arayüzde ad üretilmez. Küme adları ADR-006 kuralıyla (kod + davranış betimlemesi). |
| İnsan gibi kusurlu algı | **Eklensin.** | θ'ya `gorus_kaybi` (0–1) eklendi: belirginliği düşük uyaranları fark etme olasılığını düşürür; yaşla artar (55+ ×1.6, 45–54 ×1.2). Değerler **kalibre edilmemiş varsayımdır**; göz izleme veya kamera bölge sayımıyla kalibre edilene kadar raporda "varsayım" etiketi taşır. Ekibin uyarısı kayıtta: uydurma kusur grupları karikatürleştirebilir; bu yüzden parametre yalnız fark etme olasılığını etkiler, karar kalitesini değil. |
| Sabır modeli vs müşterinin kararı | **İkisi ayrı gösterilsin.** | Terk olayları iki sınıfa ayrılır: **sabır modeli sonlandırdı** (kasa kuyruğu, yavaş yükleme, sayfa bekleme, oturum süresi dolması) ve **müşteri vazgeçti** (hemen çıkma, seçim yükü, bütçe, ilgi yok). Arayüzde "Terk nedenleri" tablosu iki satırı ayrı sayar; dışa aktarımda `terk` olayının `neden/sebep` alanı korunur. |

## Sonuçları
`core/parametreler.ts` ve `db/oncul_s0_s1.json` yeni parametre; `core/karar.ts` `farkEtmeOlasiligi`; `core/nufus.ts` yaş kaydırmaları; `main.ts` terk nedenleri tablosu; 04 §4.2 ve §6 bir sonraki belge turunda güncellenir.
