# Tarif: sitenin iletişim formu → uygulama API'si

## Amaç

`site` temelinin iletişim formunu bir dış form servisine değil, kendi `uygulama` API'nize bağlar. API'ye
**herkese açık** (oturumsuz) yeni bir uç eklenir: `POST /api/iletisim`. İleti yöneticiye e-postayla gider
(`MAIL_PROVIDER=console` iken `mail_outbox` tablosuna yazılır). Site ile API farklı kökenlerde çalışır
(ör. `ornek.com` ve `app.ornek.com`); tarif, bu bağlantının ince yerlerini doğru kurar:

```
ziyaretçi (ornek.com) ──JSON + CORS ön isteği──► app.ornek.com/api/iletisim ──► e-posta (yönetici)
JS kapalıysa ───────────düz form gönderimi──────► aynı uç → küçük HTML teşekkür sayfası
korumalar: köken izin listesi (CORS + Origin) · bal küpü · IP ve toplam hız sınırı · şema doğrulama
```

## Hangi temeller

| Temel | Ne değişir |
| --- | --- |
| `uygulama` | Yeni modül `api/src/modules/iletisim/`; ayrı, **çerezsiz** CORS (`http/cors.ts → publicFormCors`, genel `ALLOWED_ORIGINS`'ten önce ve ondan bağımsız); CSRF ara katmanında bu adrese muafiyet (köken denetimini uç kendisi yapar); düz form okuyucu `readForm`; ayarlar `CONTACT_TO`, `CONTACT_ORIGINS`; hız sınırı kuralları `contact` (IP başına saatte 5) ve `contactAll` (toplam saatte 100); e-posta şablonu `contactMail`; `docs/API.md`, `docs/GUVENLIK.md`, `docs/YAYINLAMA.md` satırları; 12 testlik `api/test/modules/iletisim.test.ts`; kural testindeki `PUBLIC_ROUTES`'a bilinçli ekleme |
| `site` | Kod değişmez (form zaten `PUBLIC_FORM_ENDPOINT`'e JSON gönderir). Eklenenler: iki sunuculu uçtan uca test (`tests/tarif/`) ve "İletişim formu" belgesine "Kendi API'nize bağlamak" bölümü |

## Ön koşullar

- Node 22.23.4+ (site Astro 7 için bunu ister).
- Uçtan uca test için Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE`).
- Yayında: sitenin ve API'nin kesin kökenleri (şema + alan adı + kapı, sonda `/` yok), iletilerin gideceği
  e-posta ve gerçek gönderim için bir e-posta sağlayıcısı (`MAIL_PROVIDER=http`, `docs/YAYINLAMA.md` §6).

## Adım adım

**1. Tarifi uygulayın** (~20 sn):

```bash
python havuz/tarifler/tarif.py kur site-iletisim-formu-api ~/projeler/iletisim
```

Beklenen son satır: `Toplam … sn. Hepsi geçti.`

**2. API'yi başlatın** (1. terminal). `CONTACT_ORIGINS` sitenin **tam kökenidir**; yerelde önizleme kapısı:

```bash
cd ~/projeler/iletisim/uygulama
CONTACT_TO=siz@ornek.com CONTACT_ORIGINS=http://localhost:4411 npm run dev -w @uygulama/api
```

Beklenen: `sunucu hazır … http://127.0.0.1:8310`. Ayarı yanlış yazarsanız sunucu açılmaz ve neyin
düzeltileceğini söyler (ör. `CONTACT_ORIGINS: "http://localhost:4411/" geçersiz. … sonda / olmadan`).

**3. Siteyi API adresiyle derleyip önizleyin** (2. terminal). Adres derleme anında sayfaya gömülür:

```bash
cd ~/projeler/iletisim/site
PUBLIC_FORM_ENDPOINT=http://127.0.0.1:8310/api/iletisim npm run build
npm run preview          # http://localhost:4411/iletisim/
```

Astro bir yapay zekâ ajanıyla çalıştığını sezerse önizlemeyi arka planda başlatır; durdurmak için
`npx astro preview stop` (site/AGENTS.md).

**4. Formu gönderin:** `http://localhost:4411/iletisim/` → alanları doldurun → **Gönder** → "Teşekkürler,
iletiniz bize ulaştı." API terminalinde (`NODE_ENV=development`) e-postanın içeriği basılır; veritabanında:

```bash
cd ~/projeler/iletisim/uygulama/api
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('.data/uygulama.db');console.log(d.prepare('SELECT to_address, subject FROM mail_outbox ORDER BY id DESC LIMIT 3').all())"
```

Beklenen: alıcısı `siz@ornek.com`, konusu `Web sitesinden ileti: <ad>` olan bir satır (Node nesneyi
`[Object: null prototype] { … }` diye basabilir).

**5. Yayında:** API ayarına (`/etc/uygulama/uygulama.env` ya da barındırıcının değişkenleri)
`CONTACT_TO=siz@ornek.com` ve `CONTACT_ORIGINS=https://ornek.com,https://www.ornek.com`; sitenin derleme
ortamına `PUBLIC_FORM_ENDPOINT=https://app.ornek.com/api/iletisim`. Siteyi `ALLOWED_ORIGINS`'e **eklemeyin**
(o liste çerezli istek izni verir; iletişim formunun buna ihtiyacı yoktur). API bir ters vekilin arkasındaysa
`TRUST_PROXY=1` şarttır: yoksa hız sınırı herkesi tek IP sayar.

## Nasıl doğrulanır

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium python havuz/tarifler/tarif.py dogrula site-iletisim-formu-api
```

(~3 dk.) Denetlenenler: (1) `uygulama` ve `site` kendi `npm run check`'leri; (2) API boş kapıda, hız sınırı
AÇIK, `CONTACT_ORIGINS` = sitenin kökeni; site `PUBLIC_FORM_ENDPOINT` ile derlenip kendi statik sunucusuyla
başka bir kapıda; (3) Playwright: JS açıkken JSON gönderim (sayfadan ayrılmadan teşekkür), JS **kapalıyken** düz
form → API'nin teşekkür sayfası → "Siteye dönün" bağlantısı, bal küpü doluysa API'ye hiç istek gitmemesi;
(4) `mail_outbox`'ta yalnız iki gerçek ileti; (5) kötüye kullanım: CORS ön isteği (site kökenine izin, yabancı
kökene başlık yok), yabancı kökenden gönderim **403**, JSON bal küpü 200 ama e-posta yok, IP sınırında **429**
+ `Retry-After`. Son koşu: `../docs/DOGRULAMA.md`.

## Sık sorunlar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Formda "İletiniz gönderilemedi"; tarayıcı konsolunda `CORS policy` | Sitenin kökeni `CONTACT_ORIGINS`'te yok ya da birebir değil (`www`, kapı, `https`, sondaki `/`) | Tarayıcının adres çubuğundaki kökeni aynen yazın; virgülle birden çok |
| API yanıtı `403 forbidden` "İstek başka bir siteden geldi…" | `Origin` izinli değil (CORS'u aşan düz form ya da yanlış köken) | Aynı düzeltme |
| `404` "İletişim formu bu sunucuda açık değil." | `CONTACT_TO` verilmedi | API ayarına ekleyin |
| Herkes birden `429` alıyor | API vekil arkasında ama `TRUST_PROXY=0`: herkes vekilin IP'si | `TRUST_PROXY=1` (`docs/GUVENLIK.md`) |
| Gönderim "başarılı" ama e-posta gelmiyor | `MAIL_PROVIDER=console`: e-posta yalnız `mail_outbox`'a yazılır | Üretimde `MAIL_PROVIDER=http` + sağlayıcı ayarları |
| Ziyaretçi teşekkür görüyor ama e-posta hiç yok | Bal küpü doldu (tarayıcının otomatik doldurması nadiren yapar) ya da e-posta sağlayıcısı hata verdi | API günlüğünde `bal küpü dolu` ya da `arka plan işi başarısız` satırına bakın |
| Sitede değişiklik etkisiz | `PUBLIC_FORM_ENDPOINT` derleme anında gömülür | Değişkenle yeniden derleyin |
| JS kapalıyken API JSON hata sayfası gösteriyor | Tarayıcı form doğrulamasını geçen ama şemaya uymayan değer (ör. 2000+ karakter) | Beklenen; site formu `maxlength`/`minlength` taşır |

## Küçük modele yaptırırken

- Önce `uygulama/AGENTS.md`, `uygulama/api/TARIFLER.md` ve `uygulama/docs/GUVENLIK.md` → "CSRF" ve "CORS".
- Alan eklemek (ör. telefon): "`shared/src/api.ts → contactRequestSchema`'ya isteğe bağlı alan, `contactMail`'e
  satır, `docs/API.md` örneği ve `iletisim.test.ts`'e test; sitede `ContactForm.astro`'ya alan ve sözlüğe metin
  (her iki dil); `npm run check` iki temelde de yeşil" deyin.
- **Dokundurmayın:** köken denetimi (`assertAllowedOrigin`), iki hız sınırı satırı, bal küpü dalı, CORS'un
  `credentials: false` oluşu, `csrfProtection → exemptPaths` listesinin yalnız bu uç olması. "CORS hatası
  veriyor, `*` yapayım" derse reddedin: ayar `*`'ı kabul etmez, doğrusu kökeni birebir yazmaktır.
- Yeni herkese açık form (ör. bülten) için: `modules/iletisim/` kopyalanır, adres `app.ts`'teki `publicForms`
  listesine ve `api/test/rules.test.ts → PUBLIC_ROUTES`'a eklenir, kendi hız sınırı kuralı yazılır.

## Bu tarif ne zaman YANLIŞ seçimdir

- Bir `uygulama` API'niz yoksa ya da yalnız tanıtım sitesi yayınlıyorsanız: tek bir form için sunucu işletmek
  pahalıdır; hazır bir form servisi (site belgesindeki yol) daha uygundur.
- Çok yüksek hacimde form (kampanya, kayıt) bekliyorsanız: e-postayla iletim ve bellek içi hız sınırı yetmez;
  kuyruk, veritabanı tablosu ve CAPTCHA gerekir.
- İletileri bir panelde listelemek, yanıtlamak, aramak istiyorsanız: bu tarif iletiyi saklamaz; önce
  `contact_messages` tablosu ve yönetici ekranı tasarlayın (KVKK saklama süresiyle).
- Formun kimlik doğrulamalı kullanıcıdan gelmesi gerekiyorsa: oturumlu bir uç yazın; herkese açık uç uygun değil.

## Sınırlar

- E-posta yalnız `console` sağlayıcısıyla (`mail_outbox`) doğrulandı; gerçek bir sağlayıcıyla gönderim
  **denenmedi** (uygulama temelinin kendi sınırı). E-postada `Reply-To` başlığı yok; gönderen adresi gövdededir.
- Hız sınırı bellek içidir ve sunucu yeniden başlayınca sıfırlanır; çok kopyada her kopya ayrı sayar.
- CAPTCHA yok; koruma bal küpü + sitenin süre tuzağı + hız sınırıdır. Kararlı bir saldırgan saatte 100 iletiyle
  yöneticinin kutusunu doldurabilir (bilinçli üst sınır).
- İleti saklanmaz; e-posta sağlayıcısı hata verirse ileti kaybolur (yalnız günlükte iz kalır).
- JS kapalı yolda doğrulama hataları JSON olarak döner (sitenin form öznitelikleri çoğunu önceden yakalar).
- Uçtan uca test yalnız Chromium ve 390×844'te koşar (hız sınırı bütçesi testler arasında paylaşıldığı için tek
  proje); sitenin kendi uçtan uca testleri değişmedi.
