---
name: toplanti-notu
description: Toplantı dökümünü karar, sorumlu ve tarih içeren kısa bir nota çevirir.
disable-model-invocation: true
argument-hint: 'Toplantı dökümünün dosya yolu'
---

# Toplantı notu

Bu beceri yalnızca insan `/toplanti-notu` yazınca çalışır (`disable-model-invocation: true`).
Model onu kendi başına seçemez; bu yüzden açıklaması tetik listesi değil, insanın okuyacağı tek satırdır.

1. Dökümü oku.
2. Üç başlık yaz: Kararlar, Yapılacaklar (sorumlu + tarih), Açık sorular.
3. Dökümde olmayan bir kararı ekleme.
