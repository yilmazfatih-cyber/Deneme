# System Design Primer nasıl çalışılır — Türkçe rehber

> [System Design Primer dosyası](README.md) · [Mini uygulama](sifirdan/README.md) · [D09 dalı](../README.md)

Primer İngilizce, uzun ve bağlantı dolu. Baştan sona okumak yerine **oku → kodla → kartla tekrar et → yüksek sesle
anlat** döngüsüyle ilerle. Bu rehber o döngüyü haftalara böler ve Primer'in Anki destelerini (ve bizim Türkçe
destemizi) nasıl kullanacağını anlatır.

## 1. Önce takvimini seç

Primer'in kendi "Study guide" tablosu üç süre önerir. Somut karşılıkları:

| Süre      | Haftalık saat | Kapsam                                                                                |
| --------- | ------------- | ------------------------------------------------------------------------------------- |
| 4 hafta   | 10–12         | Tüm konuları bir kez oku; 3 çözüm (Pastebin, Twitter, web crawler); günlük Anki       |
| 8 hafta   | 7–8           | Aşağıdaki plan; 8 çözümün hepsi; 6 nesne yönelimli tasarım sorusu; mini'nin tamamı    |
| 12+ hafta | 5–6           | 8 haftalık plan + "Real world architectures" ve "Company engineering blogs" okumaları |

Önkoşul: [G6 Ağ ve web temelleri](../../../govde/README.md#g6) (DNS, TCP, HTTP) ve
[G5](../../../govde/README.md#g5)'ten hash tablosu, kuyruk, ağaç. Bunlar eksikse önce onları bitir; aksi hâlde Primer
bir terim listesine dönüşür.

## 2. Her bölümü üç soruyla oku

Primer'in her konu bölümü aynı kalıptadır: tanım, diyagram, alt türler, **Disadvantage(s)**, ileri okuma. Her bölümden
sonra defterine (Türkçe, kendi cümlelerinle) üç satır yaz:

1. **Neyi çözüyor?** (ör. CDN: kullanıcıya yakın sunucudan statik içerik → gecikme ve köken sunucu yükü düşer)
2. **Bedeli ne?** (maliyet, bayat içerik, TTL yönetimi)
3. **Ne zaman kullanmam?** (az trafik, kişiye özel dinamik içerik)

Terimleri İngilizce bırak, açıklamayı Türkçe yaz: mülakat İngilizce olabilir, anlayış senin dilinde kalıcı olur.

## 3. Sekiz haftalık plan

| Hafta | Primer bölümleri                                                                                      | Kodla (mini)                          | Pratik                                            |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------- |
| 1     | Start here (Harvard dersi + makale), Performance vs scalability, Latency vs throughput, CAP, desenler | `lru_cache.py`                        | "Availability in numbers" hesapları               |
| 2     | DNS, CDN, Load balancer, Reverse proxy, Application layer                                             | `load_balancer.py`                    | Kendi sitenin isteğini `dig` + `curl -v` ile izle |
| 3     | Database: RDBMS, replikasyon, federasyon, sharding, denormalizasyon, SQL tuning                       | `consistent_hashing.py`               | Bir tabloyu iki şekilde böl, ödünleşimi yaz       |
| 4     | NoSQL türleri, SQL or NoSQL, Cache (konumlar ve güncelleme stratejileri)                              | `cache_strategies.py`                 | Yarış testini oku, TTL ekle                       |
| 5     | Asynchronism (kuyruk, back pressure), Communication (HTTP, TCP, UDP, RPC, REST), Security             | `rate_limiter.py`                     | 429 + Retry-After yanıtı tasarla                  |
| 6     | 4 adımlı yaklaşım + Pastebin/Bit.ly çözümü                                                            | `url_shortener.py`                    | Kâğıtta 45 dakikalık prova                        |
| 7     | Twitter zaman tüneli, web crawler, query cache çözümleri                                              | Mini'leri birleştir (bitirme taslağı) | Bir arkadaşa anlat, soru sorsun                   |
| 8     | Mint, social graph, sales rank, AWS'te milyonlarca kullanıcı + 6 OO tasarım sorusu                    | OO sorularından ikisini kodla         | İki tam prova, zaman tutarak                      |

Web crawler sorusunu çalışırken [firecrawl dosyasına](../../04-veri-araclari-otomasyon/firecrawl/README.md) bak:
gerçek bir tarayıcının kuyruk, ziyaret kümesi ve robots.txt yönetimi orada.

## 4. Anki ile tekrar

### Primer'in desteleri

`resources/flash_cards/` altında üç `.apkg` var (commit `ae9bbd7`'de saydık):

| Deste                   | Kart | İçerik                                                        |
| ----------------------- | ---- | ------------------------------------------------------------- |
| System Design           | 42   | Konu başlıkları (Load balancer, Sharding, Cache-aside…)       |
| System Design Exercises | 8    | Sekiz tasarım sorusu (Pastebin, Twitter, web crawler…)        |
| OO Design               | 6    | Altı nesne yönelimli tasarım sorusu (LRU cache, parking lot…) |

Kurulum: Anki'yi indir (masaüstü ve Android ücretsiz; iOS sürümü ücretli — CIU README'si de böyle not düşer), GitHub'dan
`.apkg` dosyasını indir, **Dosya → İçe Aktar**. Kartlar "Basic" türündedir: ön yüzde yalnızca başlık, arka yüzde
Primer'in ilgili bölümünün HTML kopyası. Bu yüzden kartlar uzundur; önerimiz:

- Yeni kart sınırını günde **10**'a indir; 56 kartın hepsi altı günde önüne gelir, sonraki tekrarlar günde 10–15
  dakikayı geçmez.
- Bir kartı cevaplarken arka yüzü okumadan önce **yüksek sesle** iki cümle kur; sonra karşılaştır.
- Kartın arka yüzünü kendi Türkçe özetinle değiştirmekten çekinme (kartı düzenle → arka alan).

### Bizim Türkçe destemiz

[`sifirdan/anki/sistem-tasarimi-tr.tsv`](sifirdan/anki/sistem-tasarimi-tr.tsv): 40 özgün kart, her biri tek bir
soruya tek cevap (ör. "%99,9 ve %99,99 erişilebilirlik yılda ne kadar kesintiye izin verir?"). İçe aktarma:
**Dosya → İçe Aktar** → dosyayı seç. Dosyanın ilk satırlarındaki `#separator:tab`, `#deck:…`, `#tags column:3`
başlıkları Anki 2.1.55 ve sonrasında ayarları kendiliğinden yapar (doğrulanmadı); daha eski sürümde bu satırları sil ve ayırıcı olarak
"Sekme"yi seç. Etiketler (`onbellek`, `veritabani`, `sayilar`…) ile tek konuyu çalışabilirsin.

İyi kart yazmanın üç kuralı: bir kartta bir bilgi; soruyu kendi cümlenle yaz; sayıları (gecikme, erişilebilirlik)
ayrı kartlara koy.

## 5. Kodla pekiştir

Okuduğun her yapı taşını mini'deki modülle eşleştir ve testleri oku: "least-connections neden daha iyi?" sorusunun
cevabı `tests/test_load_balancer.py`'de bir sayı olarak duruyor. Testi değiştirip (ör. ağır iş oranını %0 yap) sonucun
nasıl değiştiğini gör.

| Primer konusu                   | Mini modülü             | Bakılacak test                                      |
| ------------------------------- | ----------------------- | --------------------------------------------------- |
| Cache, LRU                      | `lru_cache.py`          | `test_lru_cache.py`                                 |
| Sharding, tutarlı hash          | `consistent_hashing.py` | `test_adding_a_node_moves_about_one_over_n_keys`    |
| API rate limiter, back pressure | `rate_limiter.py`       | `test_fixed_window_allows_double_burst_at_boundary` |
| Pastebin / Bit.ly               | `url_shortener.py`      | `test_collision_is_resolved_with_next_attempt`      |
| Load balancer                   | `load_balancer.py`      | `test_mixed_workload_least_connections_wins_p95`    |
| Cache update strategies         | `cache_strategies.py`   | `test_cache_aside_race_leaves_stale_value`          |

## 6. 45 dakikalık prova şablonu

1. **5 dk — gereksinim:** kim kullanıyor, kaç kullanıcı, okuma/yazma oranı, kapsam dışı ne?
2. **5 dk — tahmin:** saniyedeki istek, depolama, bant genişliği (bir ay ≈ 2,5 milyon saniye).
3. **10 dk — yüksek seviye:** istemci → DNS/CDN → yük dengeleyici → web → uygulama → önbellek/DB/kuyruk.
4. **15 dk — derinleşme:** API, şema, anahtar algoritma (base62, fan-out, sıralama).
5. **10 dk — ölçekleme:** darboğaz, replikasyon, sharding, önbellek, eşzamansızlık; her kararın bedeli.

Türkiye ölçeğinde bir alıştırma: "Günde 2 milyon siparişli bir yemek siparişi uygulamasında sipariş durumu bildirimi."
Önce sayıları hesapla (2 milyon / 86.400 ≈ saniyede 23 sipariş; akşam tepesinde 5–10 katı), sonra kuyruk ve bildirim
servisini tasarla.

## 7. Türkçe kaynak durumu

- Primer'in Türkçe çevirisi **yok**: `TRANSLATIONS.md`'ye göre Türkçe "Stalled", bakımcı aranıyor (tartışma: issue #39).
  Katkı vermek istersen kurallar `CONTRIBUTING.md`'de: dil bakımcısı ol, README'nin tamamını çevir, PR başlıklarına
  `tr:` öneki koy; Primer'in lisansı (CC BY 4.0) çeviriye izin verir.
- Tamamlayıcı okumalar: [CS-Notes](../cs-notes/README.md) (Çince; 缓存/分布式/系统设计基础 notları, çeviri iş akışı
  dosyasında) ve [coding-interview-university](../coding-interview-university/README.md)'nin isteğe bağlı "System
  Design, Scalability, Data Handling" bölümü (Türkçe çevirisi bu bölümde İngilizceye döner).

## 8. Sık yapılan hatalar

- Konuları ezberleyip **sayı** çalışmamak: gecikme ve erişilebilirlik sayıları olmadan tahmin adımı boş kalır.
- Her soruya aynı mimariyi çizmek: önce gereksinim ve okuma/yazma oranı, sonra kutular.
- Ödünleşimi söylememek: "Redis koyarız" yetmez; "bayatlık TTL ile sınırlı, ıskalamada DB'ye üç adım" demek gerekir.
- Yalnızca okumak: her hafta en az bir modülü kodla ve bir provayı yüksek sesle yap.
