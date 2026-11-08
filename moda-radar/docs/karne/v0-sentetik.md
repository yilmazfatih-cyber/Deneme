# Karne: model v0 (sentetik veri)

> **Bu karne GERÇEK VERİ DEĞİLDİR.** `moda_radar/tahmin/sentetik.py` ile üretilmiş, gecikmesi ve yayılma eğrisi bilinen sentetik veriyle yöntemin mekaniği sınanmıştır. Gerçek isabet hakkında bilgi vermez; ileri tahmin raporu bu karneye dayanamaz.

- Model sürümü: `v0`
- Geriye test edilen sezon sayısı: 2
- **Rapor üretilebilir (ilke 5): hayır**
  - Neden: SS25 sezonunda en az bir taban geçilemedi.

| Sezon | Veri kadar | Segment | Ufuk | Gecikme               | n tahmin | n gerçek | Brier model | Brier (a) | Brier (c) | İlk-10 model | İlk-10 (a) | İlk-10 (c) | Geçti |
| ----- | ---------- | ------- | ---- | --------------------- | -------: | -------: | ----------: | --------: | --------: | -----------: | ---------: | ---------: | ----- |
| SS25  | 2024-09-30 | orta    | SS26 | 2,990 (olculen, n=48) |       44 |       20 |       0,240 |     0,312 |     0,391 |        0,500 |      0,800 |      0,200 | hayır |
| FW25  | 2025-03-15 | orta    | FW26 | 2,984 (olculen, n=53) |       44 |       17 |       0,222 |     0,246 |     0,386 |        0,600 |      0,600 |      0,300 | evet  |

Taban (b) Pantone sezon raporu: veri hattı henüz yok; karşılaştırmaya girmedi.

## SS25 · orta · kadin-ust

- Gecikme: 2,990 sezon, kaynak **olculen**; n=48, medyan 2,990, çeyrekler 2,946–3,073, önsel modu 3,000.
- Beklenen raf dönemi: SS26-Mart; eşik: raf payı ≥ 0,040.
- Kilit altında okunan kayıt: 272 sinyal, 172 gözlem.

| Yöntem                    | Brier | İlk-10 isabet | Doğruluk (p ≥ 0,5) |
| ------------------------- | ----: | ------------: | -----------------: |
| Model                     | 0,240 |         0,500 |              0,614 |
| (a) Önceki raf payı aynen | 0,312 |         0,800 |              0,636 |
| (c) Yalnız podyum payı    | 0,391 |         0,200 |              0,409 |

Kalibrasyon (model):

| Kova        |   n | Ortalama olasılık | Gerçekleşme oranı |
| ----------- | --: | ----------------: | ----------------: |
| 0,000–0,200 |   0 |                 — |                 — |
| 0,200–0,400 |  16 |             0,323 |             0,312 |
| 0,400–0,600 |  18 |             0,490 |             0,556 |
| 0,600–0,800 |  10 |             0,675 |             0,500 |
| 0,800–1,000 |   0 |                 — |                 — |

## FW25 · orta · kadin-ust

- Gecikme: 2,984 sezon, kaynak **olculen**; n=53, medyan 2,984, çeyrekler 2,946–3,066, önsel modu 3,000.
- Beklenen raf dönemi: FW26-Ağustos; eşik: raf payı ≥ 0,040.
- Kilit altında okunan kayıt: 316 sinyal, 193 gözlem.

| Yöntem                    | Brier | İlk-10 isabet | Doğruluk (p ≥ 0,5) |
| ------------------------- | ----: | ------------: | -----------------: |
| Model                     | 0,222 |         0,600 |              0,614 |
| (a) Önceki raf payı aynen | 0,246 |         0,600 |              0,750 |
| (c) Yalnız podyum payı    | 0,386 |         0,300 |              0,432 |

Kalibrasyon (model):

| Kova        |   n | Ortalama olasılık | Gerçekleşme oranı |
| ----------- | --: | ----------------: | ----------------: |
| 0,000–0,200 |   0 |                 — |                 — |
| 0,200–0,400 |  18 |             0,298 |             0,222 |
| 0,400–0,600 |  16 |             0,483 |             0,438 |
| 0,600–0,800 |  10 |             0,677 |             0,600 |
| 0,800–1,000 |   0 |                 — |                 — |

## Sağlamlık: 20 tohum × 2 sezon (orta, bilinen gecikme 3,0)

Yukarıdaki tablolar tek tohumdur (7: komutun önceden belirlenmiş varsayılanı, sonuca bakılarak seçilmedi). Aynı üretici 1–20 tohumlarıyla 40 geriye test verdi:

| Ölçüt                                      |       Değer |
| ------------------------------------------ | ----------: |
| Gecikme mutlak hatası, en büyük            | 0,035 sezon |
| Brier model, ortalama                      |       0,216 |
| Brier (a), ortalama                        |       0,386 |
| Brier (c), ortalama                        |       0,287 |
| Brier'de iki tabanı da geçen               |       40/40 |
| İlk-10'da iki tabana eşit ya da üstün      |       28/40 |
| Tüm geçme koşulları (rapor üretilebilir)   |       28/40 |
| Brier model > 0,25 (hep 0,5 demekten kötü) |        2/40 |

Birleşik kalibrasyon (40 test, model):

| Kova        |   n | Ortalama olasılık | Gerçekleşme oranı |
| ----------- | --: | ----------------: | ----------------: |
| 0,000–0,200 |  61 |             0,171 |             0,197 |
| 0,200–0,400 | 579 |             0,309 |             0,292 |
| 0,400–0,600 | 679 |             0,499 |             0,620 |
| 0,600–0,800 | 423 |             0,678 |             0,719 |
| 0,800–1,000 |  18 |             0,834 |             0,889 |

Okuma: ilk-10 isabeti 10 öğelik küçük örneklemde gürültülüdür ve geçme koşulunu en sık bozan ölçüttür; bu yüzden
tek tohumda "evet" çıkması yeterli kanıt sayılmaz. Sentetik veri σ(z) gürültüsüyle üretildiğinden ideal modelde bile
Brier 0,2 civarındadır. Gerçek veride bu sayıların tekrarlanacağı varsayılamaz.

## Segment gecikmesi geri bulma (tohum 7, SS25, veri 2024-09-30'a kadar)

| Segment | Bilinen gecikme | Ölçülen               | Ufuk | Brier model | Brier (a) | Brier (c) | Geçti |
| ------- | --------------: | --------------------- | ---- | ----------: | --------: | --------: | ----- |
| luks    |             1,0 | 0,988 (olculen, n=72) | SS25 |       0,261 |     0,360 |     0,371 | evet  |
| premium |             2,0 | 1,982 (olculen, n=57) | FW25 |       0,243 |     0,348 |     0,342 | hayır |
| orta    |             3,0 | 2,990 (olculen, n=48) | SS26 |       0,240 |     0,312 |     0,391 | hayır |
| deger   |             3,5 | 3,507 (olculen, n=36) | FW26 |       0,249 |     0,333 |     0,411 | hayır |

## Yeniden üretme

```bash
python -m moda_radar geriye-test --tahmin SS25 --veri-kadar 2024-09-30 --segment orta --kategori kadin-ust --sentetik
```

Sağlamlık ve segment tabloları aynı üreticiyle (`sentetik.uret`, sezonlar SS22–FW25) tohum döngüsüyle hesaplanmıştır.
