# Hiperparametreler

Başlangıç değerleri hazır ayarlardadır (`yapilandirma/<görev>/*.toml`). Aşağıdakiler yaygın uygulamadan gelen
**başlangıç noktalarıdır**, bu temelde GPU'da ölçülmedi; kendi doğrulama kümenizle ayarlayın. Değiştirmek için:
`-D egitim.ogrenme_orani=1e-4` gibi.

## Sohbet (LoRA)

| Alan (`[bolum] anahtar`)      | Başlangıç | Ne işe yarar / ne zaman değişir |
| ----------------------------- | --------- | ------------------------------- |
| `[lora] r`                    | 16        | Bağdaştırıcı kapasitesi. Az veri (<1k): 8; çok/karmaşık veri: 32–64 |
| `[lora] alpha`                | 32 (2·r)  | Ölçek = alpha/r. r'yi değiştirince alpha'yı da 2·r tutun |
| `[lora] dropout`              | 0.05      | Az veride aşırı öğrenme varsa 0.1 |
| `[lora] hedef_moduller`       | `all-linear` | Bellek darsa `["q_proj","v_proj"]` (daha az etkili) |
| `[egitim] ogrenme_orani`      | 2e-4      | LoRA için tipik. Kayıp zıplıyorsa 1e-4; çok yavaş düşüyorsa 3e-4 |
| `[egitim] donem`              | 2         | Küçük veride 3; doğrulama kaybı yükselmeye başlarsa azaltın |
| `[egitim] yigin` × `biriktirme` | 4 × 4 = 16 | Etkin yığın. Bellek yetmezse yığını yarıya, biriktirmeyi iki katına |
| `[egitim] zamanlayici`        | cosine    | — |
| `[egitim] isinma_orani`       | 0.03      | Başta kayıp patlıyorsa 0.1 |
| `[egitim] gradyan_denetimi`   | true (GPU) | Belleği belirgin azaltır, ~%20 yavaşlatır |
| `[veri] azami_uzunluk`        | 1024–2048 | `dogrula` çıktısındaki p99'a göre; uzun örnek atılır (kırpılmaz) |
| `[model] dort_bit`            | false     | 24 GB'a sığmayan modelde (yalnız CUDA + bitsandbytes; denenmedi) |
| `[lora] etkin = false`        | —         | Tam ince ayar; LoRA'dan ~5–10 kat bellek, öğrenme oranı 1e-5–2e-5 |

## Sınıflandırma ve varlık tanıma (tam ince ayar)

| Alan                          | Başlangıç | Not |
| ----------------------------- | --------- | --- |
| `ogrenme_orani`               | 3e-5 (sınıf.), 5e-5 (varlık) | 1e-5–5e-5 aralığı; kayıp düşmüyorsa artırın |
| `donem`                       | 3         | `erken_durdurma = 2` ile fazla dönemden korunun |
| `yigin`                       | 16–32     | Küçük veride 8–16 |
| `azami_uzunluk`               | 128       | Kırpma uyarısı çıkarsa artırın (bellek ~doğrusal artar) |
| `dengesizlik`                 | `agirlikli-kayip` | En az sınıf, en çoğun ~1/10'undan azsa şart; `asiri-ornekleme` alternatif |
| `[esik] hedef_dogruluk`       | 0 (kapalı) | Örn. 0.95: altındaki kararlar "belirsiz" olur, insana kalır |

## Gömme

| Alan                    | Başlangıç | Not |
| ----------------------- | --------- | --- |
| `ogrenme_orani`         | 2e-5      | Büyük modelde (bge-m3) 1e-5 |
| `donem`                 | 1         | Gömme modelleri çabuk aşırı öğrenir; önce/sonra tablosuna bakın |
| `yigin`                 | 64–128    | MNRL'de yığın büyüdükçe olumsuz artar (daha iyi); bellek için `onbellekli-mnrl` |
| `mini_yigin`            | 4–16      | Önbellekli kayıpta bellekte aynı anda duran parça |
| `zor_olumsuz_kaz`       | 0–1       | 1: taban modelle zor olumsuz bulunur; yanlış olumsuz riski için `kaz_marj = 0.05` |

## Belirtiye göre ayar

| Belirti                                                        | Olası neden                 | Ne yapın |
| -------------------------------------------------------------- | --------------------------- | -------- |
| Eğitim kaybı düşüyor, doğrulama kaybı yükseliyor               | Aşırı öğrenme               | Dönemi azaltın, `dropout` artırın, veri ekleyin; en iyi denetim zaten seçiliyor |
| Kayıp hiç düşmüyor                                             | Öğrenme oranı düşük / maske yanlış | `dogrula` ile maskeyi görün; öğrenme oranını 2–3 kat artırın |
| Kayıp `nan` ya da zıplıyor                                     | Öğrenme oranı yüksek, fp16 taşması | Oranı yarıya; `isinma_orani` 0.1; bf16 destekleyen kartta `duyarlik = "bf16"` |
| Model cevabı bitirmiyor / tekrar ediyor                        | Bitiş belirteci öğrenilmemiş | `dogrula` maskesinde bitiş belirteci ⟦…⟧ içinde mi; `birlestir` sonrası `generation_config` |
| Model eski genel yeteneklerini kaybetti                        | Felaket unutma              | Öğrenme oranı/dönem azalt, r küçült, veriye genel örnek karıştır |
| Bellek hatası (CUDA OOM)                                       | Yığın/uzunluk büyük         | `--kuru` ile tahmini görün; yığın ↓ biriktirme ↑, `gradyan_denetimi = true`, uzunluk ↓, 4-bit |
| Sınıflandırmada doğruluk yüksek ama makro F1 düşük             | Dengesiz sınıflar           | `agirlikli-kayip`, eşik ayarı, az sınıfa veri |
| Gömmede "sonra" "önce"den kötü                                 | Aşırı öğrenme / gürültülü çift | Öğrenme oranı ↓, 1 dönem, çiftleri gözle denetleyin |

## Bellek tahmini (`egit --kuru`)

Toplam = ağırlıklar + eğitilenler + etkinleştirmeler + sabit pay; sonuç −%25 / +%30 aralıkla yazılır.

- **Ağırlıklar:** parametre × bayt (fp32 4, fp16/bf16 2; 4-bit'te doğrusal katmanlar ≈ 0,55 bayt). Parametre sayısı
  model ağırlıksız ("meta" aygıtında) kurularak **kesin** sayılır.
- **Eğitilenler:** eğitilen parametre × 16 bayt (ağırlık 4 + gradyan 4 + AdamW'nin iki momenti 8). LoRA'da LoRA
  parametreleri (kesin sayım), tam ince ayarda bütün parametreler.
- **Etkinleştirmeler:** dizi sayısı × uzunluk × gizli boyut × bayt × K; K = 8 + 3·(ara boyut / gizli boyut).
  Gradyan denetimi açıksa katman sayısı kadar ara kayıt + bir katmanın içi. Uzunluk olarak verideki en uzun örnek
  (azami uzunlukla sınırlı) alınır.
- **Sabit pay:** 1 GB (GPU'da CUDA bağlamı; CPU'da Python + kütüphaneler, ölçüm 0,88 GB).

Bu bir **tahmindir**: CPU'da bir kez ölçümle karşılaştırıldı (`docs/DENEME_KAYDI.md`), GPU'da doğrulanmadı.
Dikkat sınırındaysa önce `-D egitim.azami_adim=5` ile kısa bir koşu yapın.
