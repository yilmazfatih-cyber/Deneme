Kayma kıyası (sıralama yalnız train korelasyonuna göre; test sütunu seçimde kullanılmaz):
 kayma_dk  train_kor  train_islem train_ort_net  test_ort_net(bilgi)
       45   0.222539            0          None                  NaN
        0   0.162107            0          None                  NaN
       30   0.141466            0          None            -0.021555
       15   0.114155            0          None                  NaN

Kayma 0 dk, 39 hisse, eşik %0.50 (masraf sonrası)
[train] karar 100291, AL 0 (0.0%) | isabet - | AL başına net - | toplam net +0.00% | Sharpe - | al-tut -32.63% | tahmin-gerçek kor. 0.050
[test] karar 26186, AL 0 (0.0%) | isabet - | AL başına net - | toplam net +0.00% | Sharpe - | al-tut -21.02% | tahmin-gerçek kor. -0.001
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
