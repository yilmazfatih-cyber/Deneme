Kayma kıyası (sıralama yalnız train korelasyonuna göre; test sütunu seçimde kullanılmaz):
 kayma_dk  train_kor  train_islem train_ort_net test_ort_net(bilgi)
       45   0.177745            0          None                None
        0   0.138117            0          None                None
       30   0.113317            0          None                None
       15   0.097234            0          None                None

Kayma 0 dk, 39 hisse, eşik %0.50 (masraf sonrası)
[train] karar 102167, AL 0 (0.0%) | isabet - | AL başına net - | toplam net +0.00% | Sharpe - | al-tut -36.23% | tahmin-gerçek kor. 0.049
[test] karar 26722, AL 0 (0.0%) | isabet - | AL başına net - | toplam net +0.00% | Sharpe - | al-tut -22.15% | tahmin-gerçek kor. 0.002
Eşik taraması (yalnız train):
  esik  islem  ort_net  toplam_net
0.0000      0      NaN      0.0000
0.0025      0      NaN      0.0000
0.0050      0      NaN      0.0000
0.0075      0      NaN      0.0000
0.0100      0      NaN      0.0000
0.0150      0      NaN      0.0000
Model: veri/saatlik/model_bist_kayma0.json
Sonuç: test günlerinde eşiği geçen hiç karar yok. Model henüz işlem önermiyor.
