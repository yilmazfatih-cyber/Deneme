Metin üretimine "min-p" örneklemesini eklemek istiyorum. AGENTS.md'deki "Yeni örnekleme yöntemi ekle (ör. min-p)" tarifini izle. Yalnız Python tarafı ve komut satırı yeterli; tarayıcı (JS) tarafı bu görevde gerekmiyor.

Min-p kuralı: en olası belirtecin olasılığı p_max ise, olasılığı min_p × p_max'tan küçük olan belirteçler elenir. En olası belirteç her zaman kalır.

- SamplingConfig'e min_p alanı ekle: 0 ile 1 arasında, varsayılanı 0 (kapalı). Aralık dışı değer hata versin.
- dil_modeli/sampling.py içine logit alıp logit döndüren min_p_filter(logits, p) işlevi yaz (top_p_filter gibi). Toplu girdide (B, sözlük) her satır kendi içinde süzülsün.
- Üretimde sıcaklık uygulandıktan sonra çalışsın.
- uret ve sohbet komutlarına --min-p seçeneği ekle (varsayılanı 0).
- Elle hesaplanmış küçük bir dağılımla test yaz.

Denetim yeşil olsun.
