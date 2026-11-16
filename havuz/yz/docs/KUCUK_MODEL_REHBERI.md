# Küçük modellerle güvenilir iş yaptırma rehberi

Küçük model (≈0,5–8 milyar parametre; yerel ya da ucuz bulut) büyük modelin "anlayıp
toparladığı" işleri yapamaz: talimatı yarım uygular, biçimden çıkar, bilmediğini uydurur. Çözüm
modeli zorlamak değil, **işi küçük modele göre tasarlamak** ve **ölçmektir**. Bu belgedeki her
kural bu temelde bir araca karşılık gelir; gözlemler `docs/GERCEK_MODEL_DENEMESI.md`'den.

## 1. Önce ölç, sonra karar ver

| Soru | Araç |
| --- | --- |
| Bu model bu işi görür mü? | 10–20 örneklik görev kümesi + `python -m yz degerlendir` |
| Hangi model daha iyi/ucuz/hızlı? | `python -m yz karsilastir --modeller a b c` |
| Değişikliğim bir şeyi bozdu mu? | `degerlendir ... --onceki <eski koşu klasörü>` (gerileme) |
| Belge araması doğru parçayı buluyor mu? | `python -m yz sor --getirme-olc sorular.jsonl` (recall@k, MRR) |

Kural: **biçim geçerliliği ≠ doğruluk.** Gerçek denemede Qwen2.5-0.5B 6/6 şemaya uyan JSON
üretti ama bunların çoğunda para birimi, toplam ya da kalem yanlıştı. İkisini ayrı ölçün.

## 2. İstem kalıpları

| Yap | Yapma |
| --- | --- |
| Tek görev, kısa cümle, numaralı kurallar (`yz/istem/sablonlar.py`) | Bir istemde üç işi birden istemek |
| Çıktı biçimini **en sona** yaz ("Yalnızca JSON yaz.") | Biçim kuralını uzun metnin ortasına gömmek |
| Örnek iskelet ver (`{"toplam": 0.0, ...}`) — küçük model taklit eder | Yalnız JSON şemasını vermek (çoğu küçük model şemayı okuyamaz) |
| Alanları insan diliyle anlat (`- toplam (sayı): Genel toplam`) | Alan adını tahmine bırakmak (`t_amt`) |
| Az-örnek: soruya en benzeyen 2–3 örnek, en benzeri en sonda (`AzOrnekSecici`) | Bütün örnekleri her istemde göndermek |
| "Metinde yoksa null yaz" / "Belgelerde yoksa şunu yaz: …" | Bilinmeyeni tahmin etmesine izin vermek |
| Hata iletisini **Türkçe ve eyleme dönük** geri ver ("tarih YYYY-AA-GG olmalı, ör. 2024-03-15") | İngilizce teknik doğrulama iletisini olduğu gibi geri vermek (gerçek denemede model 3 turda da düzeltemedi) |
| Kaynaklı yanıtta kaynakları numaralı ve ayraçlı ver, atıfı zorunlu kıl | Kaynakları tek blok hâlinde yapıştırmak |

## 3. Sıcaklık ve çıktı uzunluğu

| İş | Sıcaklık | Çıktı sınırı |
| --- | --- | --- |
| Çıkarım, sınıflandırma, araç kullanımı, RAG | **0** (varsayılan) | Gereken kadar (sınıf: ~10, JSON: 200–400, yanıt: 300–500) |
| Yaratıcı metin, alternatif öneriler | 0,6–0,9 + `tohum` | İhtiyaca göre |
| Değerlendirme hakemi | 0 | ~5 (EVET/HAYIR) |

Uzun çıktı sınırı küçük modelde **zarar verir**: model tekrar döngüsüne girer ve süre uzar
(gerçek denemede 400 belirteç sınırıyla tek çıkarım dakikalar sürdü; 200 ile ~20 sn).

## 4. Şema tasarımı (yapılı çıktı)

1. En çok ~8 alan, düz yapı; iç içe en çok bir seviye.
2. Her alana `description` (modele gösterilir).
3. Serbest metin yerine `Literal["TRY", "USD", "EUR"]`.
4. Olmayabilecek alan `X | None = None` — model uydurmak yerine `null` yazar.
5. Sayılar sayı tipinde, birim/para birimi ayrı alanda; tarih `date` (biçim düzeltmesi otomatik).
6. Bir alan sürekli yanlışsa (ör. para birimi), onu **ayrı bir adımda** sorun (görev bölme).

Katmanlar (`yz/yapili/cikar.py`): sunucu şema destekliyorsa (`json_schema`, Ollama `format`,
llama.cpp GBNF) en güvenilir yol odur; yoksa araç çağrısı; o da yoksa istem + sağlam ayrıştırıcı
+ onarım döngüsü; son çare alan alan soru. `sonuc.rapor()` hangisinin işe yaradığını söyler.

## 5. Görev bölme

| Durum | Yapın |
| --- | --- |
| Tek istem hem anlama hem biçim istiyor ve biçim tutmuyor | Önce serbest yanıt, sonra ayrı bir çıkarım adımı |
| Çok alanlı çıkarımda bazı alanlar hep yanlış | O alanları ayrı adımda ya da `alan` katmanıyla sorun |
| Hesap, tarih, sayım var | Modele yaptırmayın: araç (`hesapla`, `tarih_farki`) |
| Uzun belge özetlenecek | Parça parça özet + özetlerin özeti (`IsAkisi` adımları, her adımda doğrulama) |
| Çok adımlı görev (planla-yap-denetle) | `IsAkisi`; ama önce ölçün — `ornekler/coklu_ajan.py` notu: tek adımlık işte 3–6 kat maliyet |

## 6. Araç kullanımı

- Araç adı ve ilk açıklama cümlesi net olsun; parametre az ve tipli.
- Sunucu araç çağrısını desteklemiyorsa ajan metin (ReAct) kipine geçer; ayrıştırıcı
  `Eylem:/Action:`, `<tool_call>`, `hesapla("2+2")`, düz JSON biçimlerini tanır.
- Döngü (aynı aracı aynı argümanla tekrar çağırma) küçük modelde sık görülür: ajan uyarır, sürerse durdurur.
- Dünyayı değiştiren araç `tehlikeli=True`; onay kancası olmadan çalışmaz.

## 7. RAG mi, ince ayar mı, ikisi mi?

| İhtiyaç | RAG | İnce ayar (`havuz/ince-ayar`) |
| --- | --- | --- |
| Model belgelerinizdeki **bilgiyi** bilsin (fiyat, politika, süre) | **Evet** — güncellenir, kaynak gösterir, "belgede yok" diyebilir | Hayır — bilgi ezberletmek uydurmayı artırır, güncellemesi zordur |
| Model belli bir **biçimi/üslubu** hep tutsun (JSON, sınıf etiketleri, kurum dili) | Kısmen (örnekler + şema) | **Evet** — yüzlerce iyi örnek varsa |
| Dar bir sınıflandırma görevi, çok sayıda etiketli örnek var | — | **Evet** (ya da klasik ML) |
| Veri sık değişiyor | **Evet** | Hayır |
| Kaynak gösterme / denetlenebilirlik şart | **Evet** | Hayır |
| Önce hangisi? | **Her zaman önce istem + şema + RAG'ı deneyip ölçün**; yetmezse ince ayar | Ölçülmüş bir açık varsa |

İnce ayar için eğitim verisini elle uydurmayın: gerçek (anonimleştirilmiş) örnekler ya da açık
lisanslı kaynak kullanın; değerlendirme kümesini eğitimde **kullanmayın**.

## 8. Uydurmaya karşı

- RAG'da ilgili parça yoksa model hiç çağrılmaz ("belgede yok").
- Yanıttaki rakam ve özel adlar kaynakta aranır; bulunamayanlar uyarı olur (`dayanaksiz`).
- Küçük model istem biçimini yanıta kopyalayabilir (gerçek denemede kaynak başlığı ve "SORU:"
  satırı kopyalandı); yankı temizlenir, atıf yoksa birebir cümle eşleşmesiyle kaynak bulunur.
- Belgeye gömülü talimatlar ("önceki talimatları yok say") işaretlenir; istenirse modele hiç gösterilmez.
- Bilgi sorusunda küçük modelin kendi bilgisine güvenmeyin (gerçek denemede "Türkiye'nin
  başkenti" sorusuna "İstanbul" dedi): bilgi belge ya da araçtan gelmeli.

## 9. Model seçimi kontrol listesi

1. İşinizi temsil eden 10–20 örnek yazın (gerçek, anonimleştirilmiş).
2. 2–4 aday modeli `karsilastir` ile koşun (önbellek açık, sıcaklık 0).
3. Doğruluk yetmiyorsa sırayla: istemi sadeleştirin → şemayı küçültün → görevi bölün → az-örnek
   ekleyin → daha büyük modele geçin → (bilgi değil biçim sorunuysa) ince ayar.
4. Gecikme ve maliyeti doğrulukla birlikte okuyun: %2 daha doğru ama 5 kat yavaş model çoğu iş
   için yanlış seçimdir.
