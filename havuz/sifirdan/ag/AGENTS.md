# sifirdan/ag — model talimatları

## Bu temel ne yapar

Yalnız Python standart kitaplığıyla yazılmış ağ/web/güvenlik mini sistemleri: HTTP sunucusu ve istemcisi,
WebSocket, web çatısı (+ not defteri örneği), ORM, eğitsel kripto, DNS, kabuk, ters vekil, e-posta. Her sistem tek
klasördür; `tests/<sistem>/` altında testleri, klasöründe README'si vardır. Çalışma zamanı bağımlılığı YOKTUR.

## Komutlar (hepsi bu klasörden)

| Komut                                              | Ne yapar                                                   |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev]"` | kurulum                          |
| `.venv/bin/python scripts/check.py`                | ruff + biçim + mypy + hızlı testler (yeşil değilse iş bitmedi) |
| `.venv/bin/python scripts/check.py --duzelt`       | önce biçim/lint düzeltmeleri                                |
| `.venv/bin/python scripts/check.py --yalniz dns`   | yalnız bir sistemin testleri                                |
| `.venv/bin/python scripts/check.py --uzun`         | + tarayıcı duman testi (Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE`) |
| `.venv/bin/python -m <sistem> --help`              | her sistemin komut satırı (`web_catisi.ornek` dahil)        |

## Harita

| Şunu değiştireceksen…                          | Şuraya bak                                              |
| ---------------------------------------------- | ------------------------------------------------------- |
| HTTP ayrıştırma kuralı / sınır                 | `http_sunucu/parser.py` (`Limits`), `body.py`           |
| Yanıt yazma, keep-alive, kapanış               | `http_sunucu/server.py`                                 |
| Hata sayfası metni (sunucu / çatı / örnek)     | `http_sunucu/texts.py`, `web_catisi/texts.py`, `web_catisi/ornek/metinler.py` |
| Yeni sayfa / form (örnek uygulama)             | `web_catisi/ornek/uygulama.py` + `sablonlar.py` + `metinler.py` |
| Oturum, CSRF, güvenlik başlıkları              | `web_catisi/sessions.py`, `security.py`                 |
| Model / alan / migrasyon                       | `orm/fields.py`, `orm/schema.py`, `web_catisi/ornek/modeller.py` |
| WebSocket çerçeve kuralı                       | `websocket/frames.py`, `connection.py`                  |
| İstemci yönlendirme/yeniden deneme             | `http_istemci/client.py` (`Retry`)                      |
| Vekil politikası                               | `hiz_ve_vekil/policies.py`, `proxy.py`                  |
| DNS kayıt türü                                 | `dns/message.py` + `dns/zone.py`                        |
| Kabuk yerleşiği                                | `kabuk/executor.py` (`_builtin_<ad>`, `BUILTINS`)       |
| E-posta başlık/MIME                            | `eposta/headers.py`, `mime.py`, `parser.py`             |
| SSE olay biçimi / yayıncı                      | `sunucu_olaylari/events.py`, `broker.py`, `client.py`   |
| Ortak test yardımcıları                        | `tests/destek.py` (arka plan döngüsü, ham soket, sertifika), `tests/conftest.py` |

## Değişmez kurallar

1. Çalışma zamanında yalnız stdlib (`dependencies = []`). Dev bağımlılığı yalnız denetim/test içindir. — `pyproject.toml`, gözden geçirme
2. Her kaynak dosya Türkçe başlık yorumuyla ve `Genişletme:` satırıyla açılır; ~300 satırı aşmaz (en çok 330). — `tests/test_kurallar.py`
3. Her sistemin README'sinde "Nasıl çalışır", "Dosya haritası", "Saldırı yüzeyi", "Sınırlar", "Buradan nereye" bölümleri. — `test_her_sistemin_readme_bolumleri_var`
4. Kullanıcıya görünen metin tek sözlükte; kullanılan her anahtar sözlükte, sözlükteki her anahtar kullanılıyor. — `test_*_metin*`
5. SQL her zaman parametreli (`?`); alan adları modelden doğrulanır. — `tests/orm/test_orm.py::test_sql_enjeksiyonu_ve_like_kacisi`
6. HTML çıktısı `render` ile kaçışlanır; `Markup` yalnız kendi ürettiğiniz HTML için. — `tests/web_catisi/test_guvenlik.py`
7. Ayrıştırıcılar bozuk girdide yalnız kendi hata türünü fırlatır (hypothesis rastgele bayt testleri). — her sistemin `test_rastgele_*` testleri
8. Testler sabit kapı kullanmaz (0), yalnız 127.0.0.1; başlatılan her sunucu kapatılır; oturum sonunda dinleyen soket/iş parçacığı/süreç kalmaz. — `tests/conftest.py::no_leftovers`, `test_testler_sabit_kapi_kullanmaz`
9. Saat ve rastgelelik dışarıdan verilir (`clock=`, `randbytes=`, `sleep=`); testte gerçek bekleme yerine sahte saat. — ilgili birim testler
10. `kripto_egitim` üretim kodundan içe aktarılmaz; üretim kriptosu `hashlib`/`hmac`/`secrets`. — gözden geçirme
11. Türkçe büyük/küçük harf `orm.turkish.lower_tr/upper_tr` ile (`str.lower()` İ/I'yı bozar). — `test_turkce_buyuk_kucuk_harf_arama`

## Tarifler

**1. Örnek uygulamaya yeni sayfa** — dosyalar: `web_catisi/ornek/{sablonlar,metinler,uygulama}.py`, `tests/web_catisi/test_ornek.py`
1. `metinler.py`'ye metinleri, `sablonlar.py`'ye şablonu (`{yer_tutucu}`, formda `{csrf_alani}`) ekleyin.
2. `uygulama.py`'de `@app.route("/yol", methods=("GET", "POST"))`; giriş gerekiyorsa `require_user(request)`.
3. Testte `submit(client, "/yol", "/yol", alan="değer")` ile akışı sınayın. Doğrulama: `scripts/check.py --yalniz web_catisi`.

**2. Yeni model alanı** — `web_catisi/ornek/modeller.py` (ya da kendi modeliniz)
1. Alanı `null=True` ya da sabit `default=` ile ekleyin (yoksa `MigrationError` açıklar).
2. `db.migrate([...])` başlangıçta sütunu ekler; `plan_migration` ile önce planı görebilirsiniz.

**3. Yeni HTTP sınırı** — `http_sunucu/parser.py`
1. `Limits`'e alan ekleyin; ilgili yerde `HttpError(4xx)` fırlatın.
2. `tests/http_sunucu/test_ayristirici.py`'ye hem geçerli hem sınırı aşan girdi testi yazın.

**4. Yeni DNS kayıt türü** — `dns/message.py` (`TYPES`, `_encode_rdata`, `_decode_rdata`), `dns/zone.py` (`_parse_rdata`)
1. Kodla/çöz dallarını yazın; 2. bölge dosyası ayrıştırması; 3. `tests/dns/test_ileti.py`'ye gidiş-dönüş testi.

**5. Yeni kabuk yerleşiği** — `kabuk/executor.py`: `_builtin_<ad>(args, out, err) -> int` + `BUILTINS`; test `tests/kabuk/test_yurutme.py`.

**6. Yeni vekil politikası** — `hiz_ve_vekil/policies.py`'de saat alan küçük bir sınıf; `proxy.py`'de kullanın; önce birim test (sahte saat).

**7. Yeni mini sistem** — klasör + `__init__.py` + `README.md` (dns/README.md'yi kopyalayın) + `tests/<ad>/`;
`pyproject.toml` (paket, isort, mypy listeleri) ve `tests/test_kurallar.py` `SYSTEMS` listesi.

## Sık yapılan hatalar

| Belirti                                              | Neden                                              | Çözüm                                             |
| ---------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| `Testlerden sonra hâlâ dinleyen soket var`            | testte başlatılan sunucu kapatılmadı              | fikstürde `yield` sonrası `close()`; `Rig`/`serve` kalıbı |
| `Test bittiğinde hâlâ çalışan görevler var`           | asyncio görevi iptal edilmedi                      | sunucuyu `await server.close()` ile kapatın       |
| `ModuleNotFoundError: web_demo / destek`             | test yardımcısı alt klasörde                       | ortak yardımcılar `tests/` kökünde durur          |
| pytest `PytestCollectionWarning` hata oldu           | `Test…` adlı yardımcı sınıf                        | sınıfa `__test__ = False`                         |
| CSRF 403 (testte)                                    | formdaki `_csrf` gönderilmedi                      | `extract_csrf(sayfa.text)` ile alıp gönderin      |
| `ValueError: Başlık değeri … Latin-1`                | başlığa Türkçe harf                                | RFC 8187/2047 ile kodlayın (`eposta.headers.encode_word`) |
| `MigrationError: NOT NULL ve varsayılansız`          | yeni zorunlu alan                                  | `null=True` ya da sabit `default`                 |
| `E501 Line too long`                                 | satır > 100                                        | `scripts/check.py --duzelt`; yorumu elle bölün    |

## Bitti tanımı

- [ ] `python scripts/check.py` yeşil (lint, biçim, mypy, testler)
- [ ] Yeni davranışın testi var; ayrıştırıcıysa rastgele bayt testi de var
- [ ] Güvenlikle ilgili her değişiklik ilgili README'nin "Saldırı yüzeyi" tablosunda ve testte
- [ ] README "Sınırlar" güncel; yarım özellik yok (yetişmeyen şey Sınırlar'a yazıldı)
- [ ] Kullanıcı metni sözlükte, Türkçe karakterler doğru; dinleyen soket/süreç bırakılmadı
