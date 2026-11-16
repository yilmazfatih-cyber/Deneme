# Değerlendirme

Değerlendirme, modelin **eğitimde görmediği** veride yapılır. Ayrı doğrulama/test dosyası vermezseniz eğitim verisi
aynı tohumla sızıntısız bölünür ve `degerlendir` aynı parçayı yeniden kurar.

## Sohbet

| Ölçüt              | Nasıl hesaplanır                                                             | Ne söyler / ne söylemez |
| ------------------ | ---------------------------------------------------------------------------- | ----------------------- |
| `kayip`            | Yalnız asistan belirteçlerinde belirteç ağırlıklı ortalama çapraz entropi     | Düşük = model beklenen yanıta yüksek olasılık veriyor. Eğitimdeki doğrulama kaybıyla aynı hesaptır (test). |
| `saskinlik`        | exp(kayıp)                                                                   | Kaybın sezgisel ölçeği |
| `tam_eslesme`      | Üretilen ve beklenen yanıt sadeleştirilince (Türkçe küçük harf, noktalama yok) birebir aynı mı | Kısa, tek doğru yanıtlı işlerde anlamlı (sınıf adı, tarih, evet/hayır) |
| `rouge_l`          | Sözcük düzeyinde en uzun ortak alt dizi F1                                   | Yüzey benzerliği. Türkçe eklerde katıdır ("evde" ≠ "evdeki") |
| `rouge_l_karakter` | Aynısı, karakter düzeyinde                                                    | Eklere toleranslı; ama anlamı ölçmez |

Üretim açgözlü çözümlemeyle (sıcaklık 0) yapılır; sonuç yeniden üretilebilir. `--karsilastir` aynı veride
bağdaştırıcıyı kapatıp taban modeli de ölçer: **asıl soru "ince ayar tabandan iyi mi?"dir.** Örnek üretimler
`degerlendirme_ornekleri.jsonl` ve eğitim sırasında `ornek_uretimler.jsonl` (rapor.html'de tablo) içindedir.

Neden LLM hakem (başka bir modele puanlatma) yok: ek bir model ve sunucu ister, kendi yanlılıkları vardır ve küçük
modelin kurup doğrulaması zordur. Onun yerine: 30–50 doğrulama örneğini **insan gözüyle** okuyun.

## Sınıflandırma

- **Doğruluk:** doğru tahmin oranı. Dengesiz veride yanıltır (her şeye çoğunluk sınıfını demek bile yüksek doğruluk verir).
- **Makro F1:** her sınıfın F1'inin ortalaması; az sınıfı eşit önemser. En iyi denetim buna göre seçilir.
- **Karışıklık matrisi:** satır = gerçek, sütun = tahmin. Hangi sınıfların karıştığını gösterir; veri eklemeyi yönlendirir.
- **Eşik:** ikili görevde olumlu (az olan) sınıfın eşiği doğrulamada makro F1'e göre seçilir; rapor **testte** verilir.
  Test kümesi yoksa rapor iyimserdir ve uyarı yazılır. İsteğe bağlı güven eşiği ile kapsama (yanıtlanan oran) ve
  yanıtlananlarda doğruluk raporlanır.
- ONNX modeli de değerlendirilebilir (`--onnx`); PyTorch ile aynı sonuç beklenir (fark `onnx_bilgi.json`'da).

Ölçütler scikit-learn ile karşılaştırılarak test edildi (`tests/test_metrics.py`).

## Gömme (arama)

Her doğrulama sorgusu derlemin tamamında aranır (derlem = doğrulama çiftlerinin olumluları + olumsuzları + `ek_belgeler`).

- **isabet@k:** ilk k sonuçta en az bir doğru belge var mı.
- **recall@k:** doğru belgelerin kaçta kaçı ilk k içinde.
- **MRR@k:** ilk doğru belgenin sırası r ise 1/r (ilk k'da yoksa 0).
- **nDCG@k:** sıralama kalitesi (ikili ilgililik).

Eğitim öncesi (taban) ve sonrası aynı derlemde ölçülür. **Derlem küçükse ölçütler iyimserdir** (az rakip belge):
gerçekçi sonuç için gerçek belge havuzunuzu `ek_belgeler` olarak verin. Ölçütler sentence-transformers'ın
`InformationRetrievalEvaluator` sonucuyla karşılaştırılarak test edildi.

## Varlık tanıma

Varlık düzeyi kesinlik/duyarlılık/F1 (tür ve sınırlar tam eşleşmeli; seqeval'in katı tanımı gibi) ve belirteç
doğruluğu ("O" etiketinin çokluğu yüzünden şişkin çıkar; varlık F1'e bakın).

## Tuzaklar

1. **Sızıntı:** aynı ya da çok benzer örnek iki tarafta → ölçüt şişer. Ayrım bunu engeller; ayrı dosya verdiyseniz
   `python -m ince_ayar veri sizinti --bicim … --egitim … --test …` çalıştırın. Sentetik veride aynı belgeden
   üretilenleri `grup_alani = "grup"` ile aynı tarafta tutun.
2. **Küçük değerlendirme kümesi:** 20 örnekte %5'lik fark gürültüdür. Mümkünse ≥ 200 örnek.
3. **Eğitim verisinden seçilen eşik/hiperparametre:** test kümesine bir kez, en sonda bakın.
4. **Yüzey ölçütleri:** ROUGE/tam eşleşme doğru ama farklı sözcüklü yanıtı cezalandırır; insan incelemesiyle tamamlayın.
5. **Taban karşılaştırması olmadan sonuç:** "ROUGE 0,4" tek başına bir şey söylemez; tabanla farkı raporlayın.
