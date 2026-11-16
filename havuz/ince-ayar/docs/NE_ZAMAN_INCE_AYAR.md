# Ne zaman ince ayar?

İnce ayar pahalıdır (veri hazırlama, GPU, değerlendirme). Önce daha ucuz yolların yetip yetmediğine bakın.

## Karar tablosu

| İhtiyaç                                                        | İstem mühendisliği | RAG (belge arama) | İnce ayar |
| -------------------------------------------------------------- | :----------------: | :---------------: | :-------: |
| Modelin **bilmediği, sık değişen** bilgiyi kullanması (fiyat, stok, mevzuat) | — | **evet** | hayır (bilgi ezberletmek için yanlış araç) |
| Belirli bir **biçimde/üslupta** yanıt (kısa, resmî, JSON, şirket dili) | önce bunu deneyin | — | **evet**, istemle tutmuyorsa |
| Aynı görevi **çok ucuz/hızlı** yapmak (küçük model büyük modelin işini yapsın) | — | — | **evet** (gerekirse damıtma) |
| Metni **sınıflara** ayırmak (talep türü, duygu, öncelik)       | büyük modelle olur ama pahalı | — | **evet**: küçük kodlayıcı + ONNX, CPU'da milisaniyeler |
| Kendi belgelerinizde **arama** kalitesi düşük                   | — | evet | **gömme modelini** alana uydurun (`gomme`) |
| Kişi/yer/ürün **adlarını çıkarmak**                             | olur | — | **evet** (`varlik`) |
| Modelin **tehlikeli/yanlış** şey söylemesini tamamen engellemek | kısmen | kısmen | tek başına güvence değildir |

Kural: **bilgi** için RAG, **davranış** için ince ayar, **ikisi de** gerekiyorsa ikisi birlikte (RAG'lı yanıtları
örnek alan sohbet ince ayarı).

## Ne kadar veri?

Aşağıdakiler yaygın uygulamadan kaba başlangıç noktalarıdır, ölçüm değildir; kendi doğrulama kümenizle karar verin.

| Görev            | Başlamak için                         | Not |
| ---------------- | ------------------------------------- | --- |
| Sınıflandırma    | sınıf başına en az ~50–100 temiz örnek | Az sınıfta makro F1'e bakın; dengesizse `agirlikli-kayip` |
| Sohbet / talimat | birkaç yüz–birkaç bin **kaliteli** örnek | Nicelikten çok tutarlılık; çelişen yanıtlar zarar verir |
| Gömme            | birkaç yüz–birkaç bin (sorgu, belge) çifti | Çift yoksa `gomme uret` ile belgelerden sorgu ürettirin |
| Varlık tanıma    | tür başına birkaç yüz örnek varlık     | Etiket tutarlılığı kritik |

Veri yoksa: açık lisanslı kümeler (lisansı kontrol edin) ya da **açık bir öğretmen modelle** üretim
(`sohbet uret`, `gomme uret`). Öğretmenin lisansı ticari kullanıma izin vermelidir (`katalog/modeller.yaml`).

## Ne beklenir, ne beklenmez

- **Beklenir:** biçim, üslup ve görev odağında belirgin iyileşme; sınıflandırmada küçük modelle yüksek doğruluk;
  alan aramasında recall/MRR artışı. Her zaman **taban modelle karşılaştırın** (`degerlendir --karsilastir`,
  gömmede önce/sonra tablosu kendiliğinden yazılır).
- **Beklenmez:** küçük modelin büyük modelin akıl yürütmesini kazanması; az veriyle yeni bilgi "öğrenmesi"
  (uydurmaya, yani halüsinasyona yol açar — bilgi için RAG); doğrulama ölçütünün gerçek kullanıcıyı temsil etmesi
  (insan gözüyle örnek okuyun).
- **Risk:** aşırı öğrenme (doğrulama kaybı yükselirken eğitim kaybı düşer), "felaket unutma" (genel yetenek kaybı),
  sızıntılı değerlendirme (ölçüt şişer). Belirtiler ve çözümler: `docs/HIPERPARAMETRE.md`, `docs/DEGERLENDIRME.md`.

## Önerilen sıra

1. İstemi iyileştirin, 20–50 gerçek örnekte büyük ve küçük modeli karşılaştırın.
2. Bilgi eksikse RAG ekleyin (`havuz/yz`).
3. Hâlâ biçim/hız/maliyet sorunu varsa: veriyi toplayın/üretin → `dogrula` → `egit --kuru` → küçük bir koşu →
   `degerlendir --karsilastir` → yeterliyse büyütün.
