# sifirdan/ag — ağ, web sunucusu ve güvenlik temelleri, sıfırdan

"Bir web sunucusu, WebSocket, oturum çerezi ya da iki aşamalı doğrulama kodu içeride nasıl çalışır?" sorusunu
yanıtlayan, **yalnız Python standart kitaplığıyla** yazılmış, baştan sona okunabilir mini sistemler. Her biri
tek klasör, kendi README'si, saldırı yüzeyi tablosu ve bol testiyle gelir; testler mümkün olan her yerde başvuru
gerçeklemesiyle (stdlib `http.client`, `hashlib`, `hmac`, `email`, `smtplib`, RFC sınama vektörleri) karşılaştırır.

## 5 dakikada çalıştırma

```bash
cd havuz/sifirdan/ag
uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev]"   # ya da: python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python scripts/check.py             # ruff + biçim + mypy + ~690 test (≈ 15–30 sn)
.venv/bin/python scripts/check.py --uzun      # + gerçek Chromium ile WebSocket duman testi
.venv/bin/python -m web_catisi.ornek          # not defteri örneği: http://127.0.0.1:8452/
```

## Sistemler

| Klasör           | Ne yapar                                                                   | Dene                                              | Kapı |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------------------------- | ---- |
| `http_sunucu/`   | asyncio HTTP/1.1 sunucusu: chunked, keep-alive, boru hattı, 100-continue, durağan dosya, TLS | `python -m http_sunucu sun`       | 8450 |
| `http_istemci/`  | soket istemcisi: havuz, yönlendirme, gzip, yeniden deneme, çerez kavanozu, TLS | `python -m http_istemci getir URL`            | —    |
| `websocket/`     | RFC 6455 sunucu + istemci, yayın odası, sohbet örneği                       | `python -m websocket sun`                         | 8451 |
| `web_catisi/`    | WSGI + http_sunucu çatısı: yönlendirme, oturum, CSRF, şablon; not defteri örneği | `python -m web_catisi.ornek`                 | 8452 |
| `dns/`           | DNS iletisi (sıkıştırma), yetkili sunucu (UDP+TCP), çözümleyici            | `python -m dns sun` / `python -m dns sor …`       | 8453 |
| `hiz_ve_vekil/`  | ters vekil: dengeleme, sağlık, jeton kovası, devre kesici, deneme bütçesi  | `python -m hiz_ve_vekil sun --arka …`             | 8456 |
| `eposta/`        | MIME kur/ayrıştır, RFC 2047, SMTP sunucu/istemci, posta yakalayıcı         | `python -m eposta yakala`                         | 8459 |
| `orm/`           | sqlite3 ORM: alanlar, migrasyon, `Q`, ilişkiler, N+1/ön yükleme            | (kitaplık; `orm/README.md`)                       | —    |
| `kripto_egitim/` | **eğitsel**: SHA-256/1, HMAC, PBKDF2, HKDF, TOTP, JWT, ChaCha20-Poly1305   | `python -m kripto_egitim totp --gizli …`          | —    |
| `kabuk/`         | mini kabuk: tırnak, açılım, glob, boru, yönlendirme, işler                  | `python -m kabuk`                                 | —    |
| `sunucu_olaylari/` | SSE: olay biçimi, yayıncı (geçmişli), yeniden bağlanan istemci (isteğe bağlı) | `python -m sunucu_olaylari sun`               | 8457 |

Kapılar STANDARTLAR §12'deki 8450–8469 aralığındandır; testler hep boş kapı (0) ve yalnız 127.0.0.1 kullanır.

## Sistemler arası bağımlılık

```
kripto_egitim   orm   dns   kabuk   eposta          (bağımsız; yalnız stdlib)
http_sunucu ◀── websocket
     ▲    ◀──── web_catisi ──▶ orm (yalnız ornek/)
     │    ◀──── hiz_ve_vekil, sunucu_olaylari
     └───────── http_istemci (başlık sınıfı ve satır ayrıştırıcı ortak)
```

Ayrıntı: `docs/MIMARI.md`. Neden böyle: `docs/KARARLAR.md`. Model talimatları: `AGENTS.md`.

## Sınırlar

- Bunlar **öğretim ve çekirdek** sistemleridir; başarım ölçülmedi, üretim yükü altında denenmedi. Üretimde
  olgun bileşenler (nginx/Caddy, uvicorn, SQLAlchemy, `cryptography`, Postfix…) kullanılmalıdır.
- `kripto_egitim` yalnız öğretim içindir (saf Python, yan kanallara açık); diğer sistemler kriptoyu stdlib'den alır.
- İsteğe bağlı sistemlerden yalnız `sunucu_olaylari` (SSE) var; `tls_gozlem` ve `p2p` **yok** (bkz. `docs/KARARLAR.md` K12).
- Paket adları `dns`, `websocket`, `orm` PyPI'deki bazı paketlerle çakışır; her zaman bu klasörün `.venv`'ini kullanın.
- Testler Linux'ta (Python 3.13) koşturuldu; macOS'ta denenmedi, Windows'ta kabuk yürütme testleri atlanır.
- Her sistemin kendi "Sınırlar" bölümü vardır.
