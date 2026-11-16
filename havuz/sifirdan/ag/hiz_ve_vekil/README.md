# hiz_ve_vekil — ters vekil, yük dengeleme ve dayanıklılık kalıpları

nginx/Envoy gibi bir ters vekil ne yapar? İstemciden gelen isteği bir arka uç havuzuna dağıtır, hasta arka uçları
ayıklar, çöken arka uca yüklenmeyi keser, aşırı istemciyi yavaşlatır ve hataları yükü katlamadan yeniden dener.
Bu klasör bunları `http_sunucu` üstünde, okunaklı parçalar hâlinde gerçekler.

## 5 dakikada çalıştırma

```bash
python -m http_sunucu sun --kapi 9001 &        # iki örnek arka uç
python -m http_sunucu sun --kapi 9002 &
python -m hiz_ve_vekil sun --arka 127.0.0.1:9001 --arka 127.0.0.1:9002 --kapi 8456 --strateji en-az
curl -i http://127.0.0.1:8456/                # Via ve X-Request-Id başlıklarına bakın
```

## Nasıl çalışır

```
istemci ─▶ ReverseProxy.__call__
             1. X-Request-Id: geçerliyse koru, değilse üret
             2. hız sınırı: istemci IP'si başına jeton kovası ──yok──▶ 429 + Retry-After
             3. başlıklar: hop-by-hop at; X-Forwarded-For'u GERÇEK adresle YAZ (güvenilen vekilden geldiyse ekle)
             4. aday = sağlıklı ∧ devre uygun ∧ henüz denenmemiş → strateji seçer (sıralı/en az/tutarlı karma)
             5. forward(): bağlan (connect_timeout) → yaz → yanıt başlığı (response_timeout)
                  bağlanamadı / yanıtsız koptu → devre.failure → (GET ve bütçe uygunsa) başka arka uç
                  zaman aşımı → 504 (yavaş arka uca yeniden yüklenilmez)
                  502/503/504 → (GET ise) başka arka uç
             6. yanıt gövdesi AKIŞLA istemciye; Via + X-Request-Id eklenir
HealthChecker: her arka uca GET /saglik; üst üste 2 hata → hasta, üst üste 2 başarı → sağlıklı
```

## Dosya haritası

| Dosya         | Sorumluluk                                                                       |
| ------------- | -------------------------------------------------------------------------------- |
| `policies.py` | `TokenBucket`, `RateLimiter` (anahtar başına, sınırlı bellek), `CircuitBreaker`, `RetryBudget` |
| `balancer.py` | `Backend`, `RoundRobin`, `LeastConnections`, `ConsistentHash`, `make_strategy`   |
| `forward.py`  | `forward` (asyncio iletim, akış), `strip_hop_by_hop`, `BackendError`             |
| `proxy.py`    | `ReverseProxy`, `ProxyConfig`, `forwarded_headers`                                |
| `health.py`   | `HealthChecker` (`check_once`, `start`/`stop`)                                    |

## Saldırı yüzeyi ve alınan önlem

| Saldırı / risk                                         | Önlem                                                            | Testi (`tests/hiz_ve_vekil/`)                        |
| ------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------- |
| Sahte `X-Forwarded-For` ile IP kısıtlamasını atlatma   | değer gerçek bağlantı adresiyle EZİLİR; ekleme yalnız güvenilen vekilden | `test_basliklar_xff_istek_kimligi_hop_by_hop`, `test_guvenilen_vekil_zinciri` |
| `Connection: X-Yetki` ile vekil başlığını sildirme     | Connection'da adı geçen ve hop-by-hop başlıklar iletilmez        | aynı + `test_hop_by_hop_basliklar_atilir`            |
| İstek kimliğiyle günlük enjeksiyonu                    | `[A-Za-z0-9._-]{1,64}` dışı kimlik yenisiyle değiştirilir         | aynı                                                 |
| İstek seli                                             | IP başına jeton kovası → 429 + Retry-After                       | `test_hiz_siniri_429`                                |
| Sahte IP'lerle limiter belleğini doldurma              | `max_keys` (en eski anahtar unutulur)                            | `test_istemci_basina_sinir_ve_bellek_siniri`         |
| Çöken arka uca istek yağdırma                          | devre kesici (eşik → açık → yarı-açık tek deneme)                | `test_devre_kesici_coken_arka_uca_yuklenmeyi_keser`, `test_devre_kesici_durumlari` |
| Yeniden deneme fırtınası                               | bütçe (son pencerenin %20'si + taban); zaman aşımında deneme yok | `test_yeniden_deneme_butcesi`, `test_yavas_arka_uc_504` |
| POST'un iki kez işlenmesi                              | yalnız güvenli/eş-güçlü yöntemler yeniden denenir                | `test_coken_arka_uc_atlanir_post_yeniden_denenmez`   |
| Hasta arka uca yönlendirme                             | etkin sağlık denetimi (rise/fall eşikleri)                       | `test_saglik_denetimi`                               |

## Sınırlar

- Arka uçlara her istekte yeni bağlantı açılır (bağlantı havuzu yok); `Connection: close` ile konuşulur.
- İstek gövdesi belleğe alınır (yeniden deneme için); `max_body` (10 MB) ile sınırlı. Akışlı yükleme yok.
- WebSocket/`Upgrade` iletimi yok; TLS sonlandırma `HttpServer(ssl_context=…)` ile yapılabilir ama arka uca TLS yok.
- Hız sınırı ve devre durumu süreç içindedir; birden çok vekil örneği arasında paylaşılmaz.
- Başarım ölçülmedi; amaç kalıpları göstermektir. Üretimde nginx, HAProxy, Envoy ya da Caddy kullanın.

## Buradan nereye

- Yol bazlı yönlendirme (`/api` → A havuzu, `/` → B havuzu): `ReverseProxy.__call__` başında havuz seçimi.
- Bağlantı havuzu: `http_istemci/pool.py` kalıbını asyncio'ya uyarlayın; bayat bağlantı denetimini unutmayın.
