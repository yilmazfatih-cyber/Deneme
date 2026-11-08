# Keşif toplantısı sunum şablonu

Müşteriyle ilk toplantıda kullanılan, müşteriye göre özelleştirilen 14 slaytlık şablon.
Çevrim içi sürüm (düzenlenebilir, PowerPoint/PDF indirilebilir): https://claude.ai/artifact/DYoRQY2jKkauwELVoe4nxk

Bu klasördeki `project/` kaynak dosyalarıdır: `deck.json` (slayt sırası, bölümler, yazı tipleri) ve
`slides/<id>.html` (her slayt tek bir `<section>`; son `<aside>` konuşmacı notu).

| # | Slayt | Kim doldurur |
| --- | --- | --- |
| 1 | Kapak | Sunan, toplantı öncesi |
| 2 | Gündem | Sabit |
| 3 | Rolleriniz ve acı noktaları | **Müşteriyle birlikte**, toplantıda |
| 4 | Çözüm mimarisi | Sabit (ERP adı eklenir) |
| 5 | Modül mağazası | Sabit; mümkünse canlı ekran |
| 6 | Size özel modül paketi | **Müşteriyle birlikte**; 3. slayttan türetilir |
| 7 | Demo | Sunan; rakamlar demo sonrası |
| 8 | Ölçüt | **Müşteriyle birlikte** |
| 9 | Donanım | Sunan; fiyatlar teklif aşamasında |
| 10 | KVKK | Sabit |
| 11 | Yol haritası | Sunan; süreler müşterinin takvimine göre |
| 12 | Teklif çerçevesi | Sunan; keşifte rakam verilmez |
| 13 | Sonraki adımlar | **Müşteriyle birlikte**; tarihle kapatılır |
| 14 | Ek: model tablosu | Yalnız BT katılımcısı varsa |

Köşeli parantez içindeki tüm alanlar yer tutucudur; sayı, yüzde ve tutar uydurulmaz.
Model tablosu platform kataloğuyla (`catalog/models.yaml`) aynı kaynaktan gelir.
