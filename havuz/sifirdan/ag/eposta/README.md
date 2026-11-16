# eposta — MIME iletisi, SMTP sunucusu/istemcisi ve geliştirme posta yakalayıcısı

"Şifre sıfırlama" postası içeride nasıl görünür ve nasıl gönderilir? Bu klasör e-posta iletisini (MIME çok
parçalı, ekler, Türkçe başlıklar) sıfırdan kurar ve ayrıştırır; küçük bir SMTP sunucusu ve istemcisi içerir.
Sunucu bir **yakalayıcı** olarak çalışır: uygulamanızın gönderdiği postaları gerçekten göndermez, klasöre
`.eml` olarak yazar. Her parça stdlib `email`, `email.header`, `quopri` ve `smtplib` ile farksal sınanır.

## 5 dakikada çalıştırma

```bash
python -m eposta yakala --kapi 8459 --klasor yakalanan          # geliştirme yakalayıcısı
python -m eposta gonder --kapi 8459 --kime mehmet@ornek.test --konu "Toplantı özeti" --metin "Merhaba"
ls yakalanan/                                                   # .eml dosyası (e-posta programıyla açılır)
```

```python
from eposta import Attachment, build_message, parse_message, send_mail

ileti = build_message(
    sender=("Ayşe Yılmaz", "ayse@ornek.test"),
    to=[("Mehmet Öz", "mehmet@ornek.test")],
    subject="Toplantı özeti",
    text="Merhaba,\nNotlar ekte.\n",
    html="<p>Merhaba,<br>Notlar ekte.</p>",
    attachments=[Attachment("Şubat notları.pdf", pdf_baytlari, "application/pdf")],
)
await send_mail("127.0.0.1", 8459, "ayse@ornek.test", ["mehmet@ornek.test"], ileti)
parse_message(ileti).subject  # "Toplantı özeti"
```

## Nasıl çalışır

```
build_message
  Subject: =?utf-8?b?VG9wbGFudMSxIMO2emV0aQ==?=        ← RFC 2047 (≤ 75 karakterlik kodlu sözcükler, katlanır)
  multipart/mixed ─┬─ multipart/alternative ─┬─ text/plain (quoted-printable, satır ≤ 76)
                   │                         └─ text/html
                   └─ ek: filename*=utf-8''%C5%9Eubat%20notlar%C4%B1.pdf (RFC 2231), base64
SMTP oturumu (istemci → sunucu)
  220 karşılama → EHLO → 250-SIZE/8BITMIME/PIPELINING → MAIL FROM:<g> → RCPT TO:<a>… → DATA → 354
  → gövde ("." ile başlayan satır ".." yapılır) → "." → 250 → QUIT → 221
  sunucu: nokta doldurmayı geri al → Envelope(gönderen, alıcılar, baytlar) → işleyici (MailCatcher)
parse_message: başlıkları aç/çöz → sınır satırlarıyla parçalara böl (derinlik/parça sınırlı) → aktarım
  kodlamasını çöz → karakter kümesiyle metne çevir (utf-8, iso-8859-9, windows-1254…) → metin/HTML/ekler
```

## Dosya haritası

| Dosya             | Sorumluluk                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| `headers.py`      | `encode_word`/`decode_words` (RFC 2047), `format_address`, `fold`, enjeksiyon denetimi |
| `mime.py`         | `build_message`, `Attachment`, `qp_encode`/`qp_decode`, base64 satırları    |
| `parser.py`       | `parse_message` → `ParsedMessage` (başlıklar, metin, HTML, ekler), RFC 2231 parametreleri |
| `smtp_server.py`  | `SmtpServer` (asyncio, RFC 5321 alt kümesi), `MailCatcher`, `Envelope`      |
| `smtp_client.py`  | `send_mail`, `read_reply`, `dot_stuff`, `SmtpError`                         |

## Saldırı yüzeyi ve alınan önlem

| Saldırı / risk                                          | Önlem                                                      | Testi (`tests/eposta/`)                      |
| ------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Başlık enjeksiyonu (konuya `\r\nBcc: …`)               | CR/LF/NUL içeren değer `HeaderInjectionError`              | `test_baslik_enjeksiyonu_reddedilir`         |
| Geçersiz adresle başlık bozma                           | adres biçimi denetimi; özel karakterli ad tırnaklanır       | `test_adres_bicimleri`                       |
| DATA'da "." satırıyla iletiyi erken bitirme / kaçırma   | nokta doldurma (istemci) ve geri alma (sunucu)             | `test_nokta_doldurma`, `test_kendi_istemcimizle_gonderim_ve_yakalama` |
| Ek adıyla yol geçişi (`../../etc/passwd`)               | taban ada indirgeme                                        | `test_ek_adinda_yol_ve_sinirlar`             |
| İç içe çok parçalı bombası / binlerce parça             | derinlik (10) ve parça (100) sınırı                        | aynı                                         |
| Sınır ön eki karışıklığı (`--b1` ↔ `--b10`)             | sınır satırı RFC 2046'ya göre bağlanır                     | aynı                                         |
| Dev ileti, çok alıcı, uzun satır, boşta bağlantı        | SIZE + DATA boyutu (552), alıcı sınırı (452), 512/1000 bayt, zaman aşımı (421) | `test_protokol_sirasi_ve_hatalar`, `test_boyut_siniri_ve_boru_hatti`, `test_bosta_bekleyen_baglanti_kapanir` |
| Açık aktarıcı (spam için kötüye kullanım)               | sunucu iletmez; yalnız 127.0.0.1'e bağlanır                | (tasarım; README)                            |
| Kullanıcı adı keşfi (VRFY)                              | her zaman 252                                              | `test_stdlib_smtplib_ile_uyum`               |
| Bozuk/rastgele ileti baytları                           | yalnız `MessageFormatError`                                | `test_rastgele_ileti_cokertmez`              |

## Sınırlar

- STARTTLS, AUTH, SMTPUTF8 (UTF-8 adresler), DSN, BDAT/CHUNKING yok: yalnız yerel geliştirme aracıdır.
- Gönderim için MX araması yapılmaz (`dns/` ile eklenebilir); istemci verilen sunucuya bağlanır.
- Başlıklar yalnız B-kodlamayla üretilir (Q-kodlama yalnız çözülür). `Cc`/`Reply-To` alanları kurucuda yok.
- Ayrıştırıcı ilk `text/plain` ve ilk `text/html` parçayı alır; `multipart/related` satır içi resimler ek sayılır.
- SMTP yanıt metinleri protokol gereği ASCII'dir (Türkçe harfsiz yazılmıştır).

## Buradan nereye

- Web örneğine "parolamı unuttum": `web_catisi/ornek` → `build_message` + `send_mail` → yerel yakalayıcı.
- Gerçek gönderim: `smtplib.SMTP_SSL` ya da bir e-posta hizmetinin API'si; SPF/DKIM/DMARC ayarları gerekir.
