# Tarif: uygulamaya "Sor" sayfası (belgeye soru, yz vekilliği)

## Amaç

`uygulama` temeline belgelere soru sorma özelliği ekler: kullanıcı **Sor** sayfasında sorusunu yazar, yanıt
kaynak numaralarıyla ve alıntılarıyla gelir. Tarayıcı yalnız kendi API'sine konuşur; API soruyu aynı makinedeki
**yz** sunucusunun RAG ucuna, anahtarla iletir. Böylece anahtar tarayıcıya hiç inmez, yz internete açılmaz,
oturum, hız sınırı ve doğrulama uygulamanın kendi kurallarıyla işler.

```
tarayıcı ──(çerez)──► uygulama API  POST /api/sor ──(Bearer anahtar)──► yz  POST /api/sor ──► belgeler + model
            oturum · hız sınırı · gövde doğrulama · yanıt şeması · anlaşılır hata
```

## Hangi temeller

| Temel | Ne değişir |
| --- | --- |
| `uygulama` | Yeni uç `POST /api/sor` (`api/src/modules/sor/`), ayarlar `YZ_URL`, `YZ_API_KEY`, `YZ_TIMEOUT_SECONDS`, hız sınırı kuralı `ask` (kullanıcı başına 10 dakikada 20), ortak sözleşmede `askRequestSchema` / `askResponseSchema`, web'de **Sor** sayfası (`web/src/features/sor/`), birim + ekran + uçtan uca testler, `docs/API.md` ve `docs/YAYINLAMA.md` satırları |
| `yz` | Değişmez; `python -m yz sun` RAG sunucusu olarak kullanılır |
| `belgeler/` (yeni klasör) | İki küçük örnek belge (`iade.md`, `kargo.md`); kendi belgelerinizle değiştirin |

Tarifin dosyaları: `dosyalar/` (yeni dosyalar tam hâliyle, değişiklikler `.patch` olarak; 25 dosya).

## Ön koşullar

- Node 22.18+ (bu ortamda 22.23.4), Python 3.11+ (3.13.18), `uv` (yoksa `pip` kullanılır).
- Uçtan uca test için Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chrome` (bu makinede `/opt/pw-browsers/chromium`).
- Gerçek bir model için: yz'nin desteklediği bir sağlayıcı (Ollama, llama.cpp…; `havuz/yz/README.md`). Model
  olmadan da çalışır: `--saglayici sahte` belgeden bir cümle seçip atıfla döndürür (gösterim, zekâ yok).

## Adım adım

Komutlar depo kökünden; `~/projeler/sor` yerine kendi klasörünüzü yazın.

**1. Tarifi uygulayın** (temelleri kopyalar, dosyaları yerleştirir, `npm ci` + yz ortamı; ~20 sn):

```bash
python havuz/tarifler/tarif.py kur belgeye-soru-uygulamasi ~/projeler/sor
```

Beklenen son satırlar: `GEÇTİ … uygulama: npm ci` ve `Toplam … sn. Hepsi geçti.`

**2. Belgeleri dizinleyin** (txt, md, html, pdf; modelsiz çalışır):

```bash
cd ~/projeler/sor/yz
.venv/bin/python -m yz indeksle ../belgeler
```

Beklenen: `2 belge okundu, 3 yeni parça eklendi. Dizin: …/yz/.yz/dizin (toplam 3 parça, 2 belge)`.
Belgeleri değiştirince `--sifirla` ile yeniden dizinleyin.

**3. Bir anahtar üretin** (iki sunucu da aynı değeri kullanır; depoya ve sohbete yazmayın):

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

**4. yz sunucusunu başlatın** (1. terminal, `yz/` klasöründe — dizini `.yz/dizin`'den okur):

```bash
YZ_SUNUCU_ANAHTARI='<anahtar>' .venv/bin/python -m yz sun --saglayici sahte
```

Beklenen: `Sohbet arayüzü: http://127.0.0.1:8420/`. Gerçek model için `--saglayici <profil>` (yz.yaml).

**5. Uygulamayı başlatın** (2. terminal):

```bash
cd ~/projeler/sor/uygulama
YZ_URL=http://127.0.0.1:8420 YZ_API_KEY='<anahtar>' npm run dev
```

Beklenen: API `http://127.0.0.1:8310`, web `http://localhost:5310`. Değişkenleri her seferinde yazmamak için
`uygulama/.env` dosyasına da konabilir (`.gitignore`'dadır; `docs/YAYINLAMA.md` §6).

**6. Deneyin:** `http://localhost:5310` → "Hesap oluştur" → kenar çubuğunda **Sor** (telefonda adres:
`http://localhost:5310/#/sor`) → "Ürünü kaç gün içinde iade edebilirim?" → yanıt `… 14 gün … [1]`,
altında **Kaynaklar**: `[1] iade.md › İade politikası` (tıklayınca alıntı açılır). "Şirketin genel müdürü
kimdir?" sorusunda "Bu sorunun yanıtı belgelerde bulunamadı." görünür.

**7. Komut satırından** (isteğe bağlı; `docs/API.md` → "POST /api/sor"):

```bash
API=http://127.0.0.1:8310
curl -s -c cerez.txt -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"ayse@ornek.com","password":"mavi-deniz-kenari-42","name":"Ayşe"}'
curl -s -b cerez.txt -X POST $API/api/sor -H 'Content-Type: application/json' -d '{"question":"İade süresi kaç gün?"}'
```

**8. Yayında:** yz'yi aynı makinede `127.0.0.1`'de, anahtarla çalıştırın (systemd birimi
`tek-sunucuda-yayin` tarifindeki `uygulama.service` örnek alınarak yazılır); API ayarına `YZ_URL` ve
`YZ_API_KEY` girer. Üretimde `YZ_URL` ya `https` ya da yerel adres olmalıdır (sunucu başka bir şeyi kabul etmez).
CPU'da gerçek model yavaşsa `YZ_TIMEOUT_SECONDS=300`.

## Nasıl doğrulanır

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium python havuz/tarifler/tarif.py dogrula belgeye-soru-uygulamasi
```

Geçici klasörde kurar, doğrular, siler (~1,5 dk; son satır `✓ belgeye-soru-uygulamasi`). Kurulu bir projede:
`python havuz/tarifler/belgeye-soru-uygulamasi/dogrula.py ~/projeler/sor`. Denetlenenler:

1. `npm run check` (yeni uç, sayfa ve kural testleri dahil: 200 API, 128 web testi) ve web derlemesi.
2. Gerçek yz sunucusu (sahte sağlayıcı, örnek belgeler, geçici anahtar): anahtarsız istek **401**, anahtarlı 200.
3. Gerçek API (derlenmiş web'i sunar): oturumsuz soru **401**; kayıt → soru → yanıtta "14 gün" ve kaynak.
4. Playwright, telefon 390×844 ve 360×800: kayıt → Sor → yanıt + kaynak alıntısı, belgede olmayan soru,
   çevrimdışı ileti (düğme kapalı, bağlantı gelince açılır); her durumda axe taraması, 360 px'te yatay kaydırma yok.
5. yz kapatılınca API'nin **500** ve "Yapay zekâ hizmetine şu an ulaşılamıyor…" iletisi verdiği.

Son koşunun sonucu: `../docs/DOGRULAMA.md`.

## Sık sorunlar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Sor sayfasında "Belgeye soru özelliği bu sunucuda açık değil." | API'ye `YZ_URL` / `YZ_API_KEY` verilmedi | 5. adımdaki değişkenlerle başlatın |
| API açılmıyor: `YZ_API_KEY: YZ_URL verildiğinde zorunludur` | Adres var, anahtar yok (ya da 16 karakterden kısa) | Aynı anahtarı iki tarafa verin |
| "Yapay zekâ hizmetine şu an ulaşılamıyor"; API günlüğünde `yz hata döndürdü … status 401` | `YZ_API_KEY` ile yz'nin `YZ_SUNUCU_ANAHTARI` farklı | İkisine aynı değeri yazın, ikisini de yeniden başlatın |
| Aynı ileti; günlükte `yz sunucusuna ulaşılamadı` | yz kapalı, kapı farklı ya da `localhost` IPv6'ya (`::1`) çözülüyor | yz'yi başlatın; `YZ_URL=http://127.0.0.1:8420` yazın |
| "Yanıt çok uzun sürdü…" | Gerçek model CPU'da yavaş (varsayılan bekleme 60 sn) | `YZ_TIMEOUT_SECONDS=300` |
| "Şu an çok soru soruluyor…" (429) | Aynı anda 2'den çok soru (model sunucusu boğulmasın diye) | Bekleyin; sınır `api/src/config.ts → buildAi → maxConcurrent` |
| Her soruya "Bu sorunun yanıtı belgelerde bulunamadı." | Dizin boş: `yz sun` başka klasörden çalışıyor ya da dizinleme yapılmadı | `indeksle` ve `sun`'u aynı `yz/` klasöründe çalıştırın (ya da `YZ_VERI_DIZINI`) |
| Sahte sağlayıcının yanıtı hep "Belgelere göre: …" | `sahte` gösterimdir: en ilgili parçadan bir cümle seçer | Gerçek model profili (yz.yaml) |
| Telefonda menüde **Sor** yok | Alt çubuk en çok 5 öğe (kural testi) | `web/src/app/routes.tsx`'te başka bir öğenin `mobile: true`'sunu kaldırıp Sor'a verin |
| yz'yi tarayıcıdan açınca 403 "yerel kipte" | Anahtarsız yz yalnız `127.0.0.1`/`localhost` adıyla açılır | Anahtarla başlatın ya da `127.0.0.1` adıyla açın |

## Küçük modele yaptırırken

- Önce `uygulama/AGENTS.md`'yi ve `uygulama/api/TARIFLER.md` → "Yeni uç nokta ekle"yi okutun; değişiklik
  yalnız `api/src/modules/sor/`, `web/src/features/sor/` ve bunların testlerinde kalsın.
- Yanıta alan eklemek (ör. yanıt süresi): "`shared/src/api.ts → askResponseSchema`'ya `.default(...)`'lı alan ekle,
  `service.ts → toAskResponse`'ta doldur, `docs/API.md`'deki `json askResponseSchema` örneğini güncelle,
  `api/test/modules/sor.test.ts`'e beklenti yaz, `npm run check` yeşil olsun" deyin.
- Sayfa metinleri yalnız `web/src/i18n/tr.json`'daki `ask.*` anahtarları; koda Türkçe metin yazdırmayın
  (kural testi yakalar). Renk yalnız belirteçlerle (`bg-warn-soft`, `text-danger`…).
- **Dokundurmayın:** `requireUser` satırı, hız sınırı satırı, anahtar başlığı (`Authorization: Bearer`) ve
  `yzAnswerSchema` doğrulaması. "Basitleştirmek için" bunlardan birini silmek isterse durun.
- Bittiğinde: `npm run check` ve `python havuz/tarifler/belgeye-soru-uygulamasi/dogrula.py <proje>` çıktısını isteyin.

## Bu tarif ne zaman YANLIŞ seçimdir

- Uygulamanız **hesapsız (yalnız cihazda)** kipte yayınlanıyorsa: soru sunucuya gider; çevrimdışı ve sunucusuz
  çalışamaz.
- Belgeler gizliyse ve yz'de **bulut** bir model profili kullanacaksanız: soru ve ilgili belge parçaları o
  sağlayıcıya gider (KVKK); yerel model kullanın ya da bu özelliği açmayın.
- Kullanıcıların kendi belgesini yükleyip sorması gerekiyorsa: bu tarif yükleme arayüzü içermez (dizin komut
  satırından kurulur); önce yz'nin `/api/belge` ucunu uygulamaya bağlayan bir uç tasarlayın.
- Yüksek trafik bekleniyorsa: tek yz süreci ve aynı anda en çok 2 soru; ayrı bir çıkarım hizmeti gerekir.
- Yalnız serbest sohbet (belgesiz) istiyorsanız: RAG gereksiz; yz'nin OpenAI uyumlu vekili daha uygundur.

## Sınırlar

- Yalnız yz'nin **sahte** sağlayıcısıyla uçtan uca doğrulandı; gerçek bir modelle (Ollama, llama.cpp, bulut)
  bu zincir **denenmedi**. Yanıt kalitesi tamamen seçilen modele ve belgelere bağlıdır.
- Yanıt akışlı (parça parça) gelmez; tamamlanınca gösterilir. Soru ve yanıt saklanmaz, geçmiş yok.
- Hız sınırı ve "aynı anda en çok 2 soru" sayacı bellek içi ve tek süreçliktir (çok kopyada her biri ayrı sayar).
- Kaynak alıntısı 1200 karakterde kesilir. Yanıttaki "[n]" işaretleri metin olarak gösterilir, bağlantı değildir.
- Telefonda alt gezinme çubuğunda yer yok (en çok 5 öğe); sayfaya adresle ya da masaüstü menüsünden gidilir.
- Başka alan adından (belirteç kipi) kullanım bu tarifte denenmedi; aynı köken (tek servis) denendi.
- Yalnız Chromium ile test edildi (havuz geneliyle aynı sınır).
