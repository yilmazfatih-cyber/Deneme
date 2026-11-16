# web_catisi — WSGI ve http_sunucu ile çalışan mini web çatısı

Flask/Django içeride ne yapar? Desenli yönlendirme, istek/yanıt nesneleri, ara katman zinciri, sorgu/form/JSON/
çok parçalı (dosya yükleme) ayrıştırma, **imzalı çerez oturumu**, CSRF belirteci, flash iletileri, hata
sayfaları, durağan dosyalar ve test istemcisi. Aynı uygulama hem WSGI sunucusunda (stdlib `wsgiref`, gunicorn)
hem bu temeldeki `http_sunucu` ile çalışır. Üstünde kayıt/giriş + not defteri örneği vardır (`ornek/`).

## 5 dakikada çalıştırma

```bash
python -m web_catisi.ornek --kapi 8452          # http://127.0.0.1:8452/  (http_sunucu ile)
python -m web_catisi.ornek --kapi 8452 --wsgi   # aynı uygulama, stdlib wsgiref ile
```

```python
import secrets
from web_catisi import App, Request, Response, render

app = App(secret_keys=[secrets.token_bytes(32)])


@app.route("/merhaba/<str:ad>")
def merhaba(istek: Request, ad: str) -> str:
    return render("<p>Merhaba {ad}!</p>", ad=ad)  # {ad} kaçışlanır


@app.route("/notlar/<int:id>", methods=("GET", "POST"), name="not")
def not_goster(istek: Request, id: int) -> Response:
    return Response.json({"id": id, "url": app.url_for("not", id=id)})
```

## Nasıl çalışır

```
WSGI environ ─┐                                       ┌─ güvenlik başlıkları (CSP, nosniff, DENY)
http_sunucu ──┼─▶ adapters → Request ─▶ App.handle ─▶ ├─ hata sınırı (abort/istisna → Türkçe sayfa)
TestClient ───┘                                       ├─ oturum (çerez → imza+süre doğrula → Session)
                                                      ├─ CSRF (POST/PUT/DELETE: köken + belirteç)
                                                      ├─ [app.use(...) ara katmanlarınız]
                                                      └─ Router.match → işleyici(istek, **parametreler)
oturum çerezi = b64url(JSON) . zaman . HMAC-SHA256(anahtar, "b64url(JSON).zaman")   (şifresiz, imzalı)
```

## Dosya haritası

| Dosya               | Sorumluluk                                                              |
| ------------------- | ----------------------------------------------------------------------- |
| `app.py`            | `App`: yollar, ara katman zinciri, hata sınırı/sayfaları, durağan dosyalar |
| `routing.py`        | `Router`: `<int:id>`, `<str:ad>`, `<slug:x>`, `<path:yol>`; 404/405; `url_for` |
| `request.py`        | `Request`: `query`, `form`, `files`, `json()`, `cookies` (tembel, sınırlı) |
| `multipart.py`      | multipart/form-data ayrıştırıcı, `UploadedFile`, dosya adı temizleme     |
| `response.py`       | `Response`, güvenli `set_cookie`, `safe_redirect_target`               |
| `sessions.py`       | `SessionSigner` (HMAC, süre, anahtar dönüşümü), `Session` (flash, CSRF) |
| `security.py`       | CSRF ve güvenlik başlığı ara katmanları, scrypt parola özeti            |
| `templates.py`      | `render` (kaçışlı), `Markup`, `render_each`, `safe_url`                 |
| `adapters.py`       | `wsgi_app(app)`, `http_handler(app)`                                     |
| `testing.py`        | `TestClient`, `extract_csrf`, `encode_multipart`                        |
| `texts.py`          | çatının Türkçe hata metinleri (tek sözlük)                              |
| `ornek/`            | not defteri: `uygulama.py`, `modeller.py` (orm), `sablonlar.py`, `metinler.py`, `statik/` |

## Saldırı yüzeyi ve alınan önlem

| Saldırı                                        | Önlem                                                            | Testi (`tests/web_catisi/`)                         |
| ---------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| XSS (metin, öznitelik)                         | `render` her değeri `html.escape(quote=True)`; CSP               | `test_xss_kacisi`, `test_kayit_not_ekleme_ve_xss_kacisi` |
| `javascript:` bağlantısı                       | `safe_url`                                                       | `test_guvenli_baglanti`                             |
| Biçim dizgisiyle nesneye uzanma (`{x.__class__}`) | şablonda yalnız düz ad                                        | `test_bicim_dizgisiyle_nesneye_uzanilamaz`          |
| CSRF                                           | SameSite=Lax + Sec-Fetch-Site/Origin + eşzamanlayıcı belirteç    | `test_csrf_korumasi`, `test_csrf_olmadan_islem_yapilamaz` |
| Oturum çerezini kurcalama / süresini uzatma    | HMAC-SHA256 + zaman damgası imzanın içinde + `compare_digest`    | `test_imzali_oturum_kurcalama_sure_ve_anahtar_donusumu` |
| Oturum sabitleme                               | girişte `session.regenerate()` (yeni kimlik + CSRF belirteci)    | `test_oturum_sabitleme_engellenir`, `test_oturum_sabitleme_ve_acik_yonlendirme` |
| Çalınan çerezle çıkıştan sonra giriş           | `oturum_surumu` (örnek): çıkışta artar, eski çerez geçersiz      | `test_cikis_eski_cerezleri_gecersiz_kilar`          |
| Açık yönlendirme (`//kotu.site`, `/\kotu`)     | `safe_redirect_target`                                           | `test_acik_yonlendirme_engellenir`                  |
| Yol geçişi (durağan dosyalar, yüklenen dosya adı) | http_sunucu çözümleyicisi; `safe_filename`                    | `test_durgun_dosyalar_ve_yol_gecisi`, `test_dosya_adi_temizleme` |
| Başkasının kaydına erişim (IDOR)               | sorgu hep `sahip=kullanıcı` ile; yoksa 404                       | `test_baskasinin_notu_gorulemez_silinemez`          |
| Parola tahmini / kullanıcı adı sızması         | scrypt; 15 dk'da 5 deneme; aynı hata iletisi; sahte özetle eşit süre | `test_giris_hatalari_ve_deneme_siniri`          |
| Çerez enjeksiyonu (`;`, CRLF)                  | `set_cookie` değer denetimi                                      | `test_cerez_enjeksiyonu_reddedilir`                 |
| Clickjacking, MIME koklama                     | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`     | `test_guvenlik_basliklari`                          |
| Hata ayrıntısı sızması                         | hata sınırı yalnız günlüğe yazar                                 | `test_uygulama_yollari_ve_hata_sayfalari`           |
| Dev/bozuk gövde                                | `max_body`; bozuk UTF-8/multipart/JSON → 400                     | `test_bozuk_cok_parcali`, `test_sorgu_form_ve_json` |

## Sınırlar

- Eşzamanlıdır (WSGI modeli); http_sunucu bağdaştırıcısı işleyiciyi iş parçacığında çalıştırır. ASGI yok.
- Oturum verisi **şifrelenmez** (yalnız imzalanır); 4 KB'ı aşamaz. Sunucu tarafı oturum deposu yok.
- Giriş deneme sınırı bellektedir: süreç yeniden başlayınca sıfırlanır, çok süreçte paylaşılmaz.
- Şablon dili yoktur (döngü/koşul Python'da kurulur); bilerek küçük tutuldu.
- Çok parçalı gövde tamamen belleğe alınır (`max_body` = 256 KB örnekte); büyük dosya yükleme için akışlı
  ayrıştırıcı gerekir.
- `Content-Security-Policy` varsayılanı satır içi betik/biçime izin vermez; satır içi gerekiyorsa `App(csp=…)`.

## Buradan nereye

- Yeni sayfa: `ornek/sablonlar.py` + `ornek/metinler.py` + `@app.route` + `tests/web_catisi/test_ornek.py`'de test.
- Kalıcı oturum iptali, e-posta doğrulama: `eposta/` ile yerel SMTP yakalayıcıya posta gönderin.
- Gerçek dağıtım: aynı `wsgi_app(app)` gunicorn/uwsgi ile çalışır; önüne `hiz_ve_vekil` benzeri bir vekil koyun.
