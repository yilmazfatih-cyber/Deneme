# Kararlar

Kısa kayıtlar: ne seçildi, neden, hangi seçenek elendi.

## K01 — Çalışma zamanında yalnız standart kitaplık

Brif "dış bağımlılık yok" diyor; amaç içeriyi göstermek. `dependencies = []`. Kriptoya ihtiyaç duyan üretim
yolları (oturum imzası, parola özeti) `hmac`, `hashlib.scrypt`, `secrets` kullanır; `kripto_egitim` yalnız öğretim.

## K02 — Tek proje, çok paket; sistemler arası bağımlılık tek yönlü

`ag/` tek bir Python projesidir (tek `pyproject.toml`, tek denetim). Her sistem ayrı bir üst düzey pakettir.
Kod yinelemesini önlemek için şu tek yönlü bağımlılıklara izin verildi: `websocket`, `web_catisi`, `hiz_ve_vekil`,
`http_istemci` → `http_sunucu` (başlık sınıfı, satır ayrıştırıcı, gövde okuyucu); `web_catisi/ornek` → `orm`.
Döngü yoktur. Elenen: her sistemde kendi başlık/ayrıştırıcı kopyası (aynı güvenlik kuralını iki yerde korumak
gerekirdi — istek kaçakçılığı kuralları tek yerde kalmalı).

## K03 — `cryptography` yalnız geliştirme bağımlılığı

Brifteki dev listesi (pytest, hypothesis, ruff, mypy) **bilinçli olarak** `cryptography` ile genişletildi:
(1) ChaCha20-Poly1305 için stdlib'de başvuru yok; RFC vektörlerine ek olarak rastgele girdilerle farksal test;
(2) TLS testleri için kendinden imzalı sertifikayı test içinde üretmek (`openssl` komutuna bağımlı kalmadan).
Hiçbir paket onu içe aktarmaz; testlerde `pytest.importorskip` / yerel içe aktarma ile kullanılır.

## K04 — Paket adları brifteki gibi

`dns`, `websocket`, `orm` adları PyPI'deki `dnspython` (`dns`), `websocket-client` (`websocket`) ve `orm`
paketleriyle aynı içe aktarma adını paylaşır. Brif adları açıkça verdiği için korundu; çakışma yalnız aynı sanal
ortama o paketler de kurulursa olur. Önlem: her zaman bu klasörün `.venv`'i (README ve Sınırlar'da yazılı).

## K05 — Sunucular asyncio, HTTP istemcisi eşzamanlı

Sunucular çok bağlantıyı tek iş parçacığında taşımak için `asyncio` akışlarıyla. `http_istemci` bilinçli olarak
eşzamanlı (requests benzeri, okuması en kolay model); vekil kendi asyncio iletimini kullanır (`hiz_ve_vekil/forward.py`).
Web çatısı WSGI gibi eşzamanlıdır; http_sunucu bağdaştırıcısı `asyncio.to_thread` ile çağırır.

## K06 — Sıkı HTTP ayrıştırma

RFC'nin "MAY" ile izin verdiği gevşeklikler reddedildi: çıplak LF, katlanmış başlık, iki `Content-Length`
(aynı değerde bile), `Transfer-Encoding` + `Content-Length`, `chunked` dışında aktarım kodlaması. Neden: istek
kaçakçılığı, iki ayrıştırıcının belirsiz durumları farklı yorumlamasından doğar. Bedeli: bazı özensiz istemciler
(ör. `nc` ile LF yazmak) 400 alır.

## K07 — Tarayıcı duman testi Playwright paketi olmadan

Python `playwright` paketi büyük bir sürücü indirir; ortamda hazır Chromium var. Test, Chromium'u doğrudan başsız
başlatır, doğrulamayı sunucu tarafında yapar (tarayıcının gönderdiği iletiler). `tarayici` işaretli; yalnız `--uzun`.

## K08 — Test düzeni

`--import-mode=importlib` (farklı klasörlerde aynı adlı test dosyaları), ortak yardımcılar `tests/` kökünde
(`destek.py`, `web_demo.py`). Hypothesis profili belirlenimci (`derandomize=True`, veritabanı yok, süre sınırı yok).
`filterwarnings = error`: kapatılmamış soket (`ResourceWarning`) testi düşürür. Oturum sonunda dinleyen soket,
iş parçacığı ve alt süreç denetlenir.

## K09 — SMTP yanıt metinleri ASCII

RFC 5321 yanıt metni için 7 bit önerir; Türkçe harfler yazılmadı ("Gule gule"). Kullanıcı arayüzü olmadığı için
STANDARTLAR'ın Türkçe karakter kuralına istisna sayıldı (README'de yazılı).

## K10 — İmzalı çerez oturumu + oturum sürümü

Sunucu tarafı oturum deposu yerine imzalı çerez (itsdangerous benzeri): durumsuz, kurulum gerektirmez. Zayıf yanı
(çalınan çerez süresi dolana dek geçerli) örnek uygulamada `oturum_surumu` ile kapatıldı: çıkışta artar, eski
çerezler geçersiz olur.

## K11 — Satır uzunluğu 100, yumuşak dosya sınırı 300 (kural testinde 330)

Brif "her dosya ~300 satırı aşmasın" diyor; kural testi 330'da keser (birkaç dosya 300'e yakın). Sistem başına
toplam brifteki "kabaca 300–900" aralığını bazılarında aşıyor (web_catisi örnek uygulamayla ~1860, http_sunucu
~1180): istenen özellik listesi bu boyutu gerektirdi; dosyalar küçük kaldı.

## K12 — İsteğe bağlı sistemlerden yalnız SSE yapıldı

"İYİ OLUR" listesinden `sunucu_olaylari` (SSE sunucusu + yeniden bağlanan istemci) yapıldı: http_sunucu'nun akış
gövdesini doğrudan kullandığı için en az kodla en çok değeri veriyordu. `tls_gozlem` ve `p2p` bu teslime girmedi:
bağlam/süre bütçesi önce zorunlu sistemlerin testlerine, belgelerine ve temiz kurulum doğrulamasına ayrıldı.
Yarım bırakmak yerine hiç eklenmedi (STANDARTLAR §6.9).
