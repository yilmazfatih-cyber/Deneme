ml-temel'e Matthews korelasyon katsayısı (MCC) ölçütünü eklemek istiyorum; dengesiz sınıflı verilerde doğruluktan daha dürüst. AGENTS.md'deki "Yeni ölçüt ekle" tarifini izle.

- Adı ve imzası scikit-learn'deki gibi olsun: matthews_corrcoef(y_true, y_pred) bir sayı (float) döndürsün. ml_temel.olcut paketinden içe aktarılabilsin.
- İki sınıfta da çok sınıfta da çalışsın; etiketler sayı ya da metin olabilir.
- Payda sıfır olursa (ör. bütün tahminler aynı sınıf) sonuç 0.0 olsun.
- Çapraz doğrulamada adıyla kullanılabilsin: scoring="matthews_corrcoef".
- scikit-learn ile karşılaştıran bir test yaz.

Denetim yeşil olsun.
