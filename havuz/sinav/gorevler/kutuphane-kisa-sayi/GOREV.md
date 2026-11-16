Kütüphaneye büyük sayıları kısaltarak yazan bir işlev eklemek istiyorum; panolarda kullanacağız. AGENTS.md'deki "Var olan modüle işlev ekle (iki dilde)" tarifini izle.

- Modül: sayi_yazi. Ad: TypeScript'te formatCompactTr, Python'da format_compact_tr.
- Girdi bir tam sayı. Çıktı Türkçe metin:
  - 1000'den küçük sayı olduğu gibi yazılır: 0 → "0", 999 → "999", -45 → "-45".
  - Daha büyükler bin, milyon, milyar ya da trilyon ile, en fazla bir ondalıkla ve virgülle yazılır: 1200 → "1,2 bin", 15000 → "15 bin" (",0" yazılmaz), 2500000 → "2,5 milyon", 7300000000 → "7,3 milyar", 1000000000000 → "1 trilyon".
  - Yuvarlama yarım yukarıdır (sıfırdan uzağa): 1250 → "1,3 bin", 1249 → "1,2 bin", -1250 → "-1,3 bin".
  - Yuvarlama bir üst basamağa taşarsa o basamakla yazılır: 999999 → "1 milyon" ("1000 bin" değil).
  - Trilyondan büyükler de trilyonla yazılır, binlik noktayla: 2500000000000000 → "2.500 trilyon".
  - Tam sayı olmayan girdi (ör. 1.5) modülün kendi hata türüyle hata versin.
- İki dil aynı girdiye aynı sonucu versin. Örnekleri ortak vektör dosyasına ekle.

İki denetim de yeşil olsun.
