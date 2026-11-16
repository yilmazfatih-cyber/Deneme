# Gerçek küçük modelle deneme (16 Kasım 2026)

Amaç: temelin onarım katmanlarını **gerçek bir küçük modelin gerçek çıktılarıyla** sınamak; neyin
tuttuğunu, neyin tutmadığını dürüstçe kaydetmek. Tek model, küçük örneklem — sonuçlar bu modele ve
bu görevlere özgüdür, genellenemez.

## Düzen

| | |
| --- | --- |
| Model | `Qwen/Qwen2.5-0.5B-Instruct`, Hugging Face sürümü `7ae5576` (API'den doğrulandı) |
| Lisans / boyut | Apache-2.0 (model kartı etiketi) · `model.safetensors` 988 MB |
| Sunucu | `araclar/hf_sunucu.py` (transformers 5.23, torch 2.15 CPU, float32), ayrı geçici sanal ortam |
| Donanım | Paylaşımlı makine, 4 çekirdekli Intel Xeon 2,1 GHz; torch 2 iş parçacığı |
| Çözümleme | Açgözlü (sıcaklık 0), çıktı sınırı çıkarımda 200, RAG'da 400, sınıflandırmada 10 belirteç |
| Sunucunun bilerek eksik bıraktığı | `response_format` → 400 (kısıtlı çözümleme yok); `/v1/embeddings` yok. Araçlar sohbet şablonuyla verilir, `<tool_call>` blokları `tool_calls`'a çevrilir |
| İstemci | Bu paketin `OpenAIUyumlu` sağlayıcısı (gerçek HTTP, SSE dahil) |

Hız (aynı makine): 120 belirteçlik serbest yanıt 17,8 sn (≈6,7 belirteç/sn); tek kelimelik
sınıflandırma p50 0,72 sn.

İlk bağlantı denemesinde model "Türkiye'nin başkenti neresidir?" sorusuna **"İstanbul"** dedi ve
serbest Türkçe paragrafta anlamsız tekrarlar üretti — bilgi ve uzun metin için bu modele güvenilmez.

## 1. Yapılı çıkarım

Girdiler: `gorevler/json_cikarim.jsonl` ilk 4 fatura (`Fatura` şeması, 6 alan + kalem listesi) ve
2 iletişim metni (`Iletisim` şeması). Ham çıktılar `tests/veri/gercek_ciktilar.jsonl`'da kayıtlı
ve regresyon testi olarak koşuyor (`tests/test_gercek_ciktilar.py`).

### 1a. İlk deneme: yalnız "istem" katmanı + onarım döngüsü (en çok 2 onarım turu)

| Örnek | Ham çıktı `json.loads` ile geçerli mi | Sağlam ayrıştırıcı sonrası | Sonuç |
| --- | --- | --- | --- |
| j01 | Hayır (```json çiti) | Geçerli JSON | **Başarısız** — tarih "15.03.2024"; 3 turda da aynı |
| j02 | Hayır (çit) | Geçerli | Başarılı (0 onarım) |
| j03 | Hayır (çit) | Geçerli | Başarılı (0 onarım) |
| j04 | Hayır (çit) | Geçerli | **Başarısız** — tarih "01.02.2025"; 3 turda da aynı |
| i01 | Hayır (çit) | Geçerli | Başarılı |
| i02 | Evet | Geçerli | Başarılı |

Gözlemler:
- **Kod çiti** çıktıların 5/6'sında vardı; düz `json.loads` yalnız 1/6'da işe yarardı. Sağlam
  ayrıştırıcı 6/6'yı kurtardı.
- **Onarım döngüsü bu modelde işe yaramadı**: modele geri verilen Pydantic iletisi İngilizceydi
  ("Input should be a valid date or datetime, invalid character in year"); model iki onarım
  turunda da aynı tarihi yazdı (kalem listesini boşaltarak!).

### 1b. Düzeltme ve ikinci deneme

Mühendislik düzeltmesi (`yz/yapili/sema_araclari.py`): (1) tarih alanında "GG.AA.YYYY",
"GG/AA/YYYY", "3 Ocak 2025" biçimleri ISO'ya çevrilir (not: `tarih_bicimi`); (2) modele geri
verilen hata iletileri Türkçe ve eyleme dönük ("tarih YYYY-AA-GG biçiminde olmalı, ör. 2024-03-15").

Sonuç: **6/6 ilk denemede** başarılı (önce 4/6). Notlar: `kod_citi` 5/6, `tarih_bicimi` 2/6.
Türkçe onarım iletisinin etkisini bu örneklerde ölçemedik (onarım turu gerekmedi).

### 1c. Biçim geçerli ama içerik doğru mu?

İkinci denemenin değerleri, metinle elle karşılaştırıldı:

| Örnek | Doğru alanlar | Yanlış / uydurma |
| --- | --- | --- |
| j01 | fatura_no, tarih, satıcı, toplam (70), para birimi | kalem adı "Kırtasiye Dünyası Ltd." (doğrusu "Kalem") |
| j02 | fatura_no, tarih, toplam (1240) | para birimi **TRY** ("$" vardı → USD); satıcı "Consulting services" (hizmet adı); uydurma kalem "John Doe" |
| j03 | fatura_no, toplam (1500) | tarih **2025-11-19** (metinde 3 Ocak 2025); para birimi **TRY** (EUR); uydurma kalem "Özür" |
| j04 | fatura_no, tarih, para birimi | toplam **850** (ara toplam; doğrusu 1020); uydurma kalem "Soyad" |
| i01 | ad, telefon, şehir | e-posta **null** (metinde vardı) |
| i02 | telefon, şehir ("Istanbul") | ad **"Murat"** (doğrusu "Murat Kaya") |

`json_cikarim.yaml` ölçütüyle (fatura no + toplam + para birimi) 4 faturadan yalnız **1'i** doğru —
biçim geçerliliği %100 iken. **Biçim geçerliliği doğruluk değildir**; ikisi ayrı ölçülmelidir.

### 1d. Bütün katmanlar (sema → araç → istem → alan), 1 fatura + 2 iletişim

| Örnek | Katman dökümü | Süre |
| --- | --- | --- |
| j01 | sema: desteklenmiyor (400) → araç: 0. tur `toplam`, `para_birimi` eksik; 1. tur JSON yok → **istem: başarılı** (kod_citi, tarih_bicimi) | 128 sn |
| i01 | sema: desteklenmiyor → **araç: ilk turda başarılı** | 18 sn |
| i02 | sema: desteklenmiyor → **araç: ilk turda başarılı** | 18 sn |

Geri çekilme zinciri gerçek sunucuyla beklendiği gibi çalıştı. Araç katmanı küçük (4 alanlı) şemada
işe yaradı, iç içe listeli fatura şemasında yaramadı.

## 2. Belgeye soru (RAG)

Belgeler: `gorevler/getirme/belgeler/` (4 kısa Markdown). Varsayılan karma arama, k=4.

| Soru | İlk koşu (ham) | Yankı temizlemeden sonra | Değerlendirme |
| --- | --- | --- | --- |
| Ürünü kaç gün içinde iade edebilirim? | Yanıtın başına kaynak başlığını (`[1] iade.md › …`), sonuna "Soru: …" ve "Yazım numarası: [1]" satırlarını kopyaladı | "Ürünler teslim tarihinden itibaren 14 gün içinde iade edilebilir. İade edilecek ürün kullanılmamış…" + otomatik atıf [1] | Doğru |
| Kargo ücreti ne kadar? | `[1] kargo.md › …` + `>>> 49,90 TL` + "SORU: …" | "49,90 TL" + otomatik atıf [1] | **Eksik**: 49,90 TL yalnız 500 TL altı siparişler için; model koşulu atladı. Dayanaksız ifade denetimi atlamayı yakalayamaz |
| Şirketin genel müdürü kimdir? | "Belgelerde bu bilgi yok." | aynı | Doğru; **model hiç çağrılmadı** (ilgili parça yok) |

Mühendislik düzeltmesi (`yz/rag/yanit.py`): kopyalanan başlık/ayraç/soru satırları atılır; model
atıf yazmadıysa cümleleri kaynakta birebir geçen kaynak otomatik atıf olur; ikisi de uyarı olarak
raporlanır.

## 3. Değerlendirme aracı gerçek modelle (`python -m yz degerlendir`)

| Görev kümesi | Örnek | Doğruluk | Biçim geçerliliği | Gecikme p50 / p95 | Gözlem |
| --- | --- | --- | --- | --- | --- |
| `siniflandirma` | 15 | **%40** | %100 | 0,72 / 1,23 sn | "kargo"ya eğilim (15 yanıtın 7'si "kargo", bunların 5'i yanlış); "İade" büyük harfle yazıldı (puanlayıcı Türkçe kuralla eşledi) |
| `ozet_denetimi` | 12 | **%50** | %100 | 3,44 / 6,53 sn | 12 örneğin **hepsine "Hayır"** dedi — yazı-tura düzeyi, görevi yapmıyor |
| `arac_kullanimi` | 10 | **%0** (ilk sayı) · %10 (son sayı) | %100 | 15,7 / 43,2 sn | Aritmetik sorularda 10 kez `tarih_ekle`, 2 kez `hesapla` çağırdı; doğru hesapladığı tek örnekte (a01, 225) yanıt soruyu tekrar ettiği için ilk sayıyı puanlayan ölçüt kaçırdı |

Bu koşudan çıkan düzeltme: `sayisal` puanlayıcıya `konum: ilk | son | herhangi` eklendi;
`arac_kullanimi.yaml` artık son sayıyı puanlar (kayıtlı çıktılar yeniden puanlandı: 1/10).

## 4. Onarım katmanları ne kadar iş gördü? (özet)

| Katman / düzeltme | Gerçek çıktılarda etkisi |
| --- | --- |
| Sağlam JSON ayrıştırıcı (kod çiti vb.) | 6/6 çıktının ayrıştırılması (düz `json.loads`: 1/6) |
| Türkçe tarih düzeltmesi | Çıkarım başarısını 4/6 → 6/6 yaptı |
| Onarım döngüsü (İngilizce hata iletisiyle) | 0 kurtarma (2 örnekte 3'er tur, ikisi de başarısız) |
| Araç katmanı | Küçük şemada 2/2 ilk turda; fatura şemasında 0/1 |
| Katman geri çekilmesi (sema → araç → istem) | Çalıştı; yapılı çıktısı olmayan sunucuda hiçbir örnek kaybolmadı |
| RAG yankı temizleme + otomatik atıf | 2/2 yanıtı kullanılabilir hâle getirdi |
| RAG "belgede yok" erken dönüşü | 1/1; model çağrısı ve uydurma riski yok |

## 5. Sonuç ve öneri

- Qwen2.5-0.5B, onarım katmanlarıyla birlikte **biçimi** güvenilir verir; ama **içerikte** (para
  birimi, toplam, ad) sık yanılır, sınıflandırmada ve özet denetiminde şans düzeyine yakındır,
  araç seçiminde başarısızdır. Bu görevler için tek başına uygun değildir.
- Sonraki adım (bu denemede YAPILMADI, sonuç bilinmiyor): aynı görev kümelerinde 1,5B–3B
  modelleri `python -m yz karsilastir ... --modeller ...` ile karşılaştırmak.
- Kısıtlı çözümleme (Ollama `format`, llama.cpp GBNF) olan bir sunucuyla "sema" katmanının
  gerçek etkisi ölçülmedi; bu geliştirme sunucusu bunu desteklemiyordu.

## Nasıl tekrarlanır

```bash
# 1) Geçici ortam ve model sunucusu (torch ağırdır; ayrı ortam önerilir)
uv venv /tmp/hf-venv && uv pip install --python /tmp/hf-venv/bin/python torch transformers fastapi uvicorn
/tmp/hf-venv/bin/python araclar/hf_sunucu.py --model Qwen/Qwen2.5-0.5B-Instruct --kapi 8422 --is-parcacigi 2

# 2) Bu klasörde (ayrı terminal)
.venv/bin/python araclar/gercek_deneme.py --asama cikarim --sinir 4
.venv/bin/python araclar/gercek_deneme.py --asama katmanlar --sinir 1
.venv/bin/python araclar/gercek_deneme.py --asama rag
YZ_TABAN_URL=http://127.0.0.1:8422/v1 YZ_MODEL=qwen25-05b .venv/bin/python -m yz degerlendir gorevler/siniflandirma.yaml --es-zamanlilik 1
```

Sınırlar: tek model, CPU, açgözlü çözümleme, küçük örneklem (6 + 3 + 3 + 15 + 12 + 10). Sayılar
bu koşuların çıktılarıdır; başka makinede süreler, başka modelde doğruluklar değişir.
