# Perde — senaryo editörü

Türkçe öncelikli, yapay zekâ destekli bir senaryo editörü (web uygulaması). Sahne başlığı, aksiyon, karakter, parantez, diyalog
ve geçiş öğeleriyle yazarsınız; sağdaki panel sahneyi **devam ettirir**, seçimi **yeniden yazar**, senaryoyu **analiz eder** ve
sahne için **çekim listesi** çıkarır. Hiçbir yapay zekâ çıktısı kendiliğinden eklenmez: önce önizlersiniz, sonra Ekle / Değiştir dersiniz.

## Çalıştırma

```
npm install
PERDE_MOCK=1 npm start                  # örnek kip: yapay zekâ çağrılmaz, sabit Türkçe çıktı akar
ANTHROPIC_API_KEY=sk-... npm start      # gerçek Claude çağrısı
```

Ardından http://127.0.0.1:3000 adresini açın. Örnek kip yalnızca `PERDE_MOCK=1` ile açılır; anahtar yoksa sessizce sahteye düşülmez,
arayüz "API anahtarı yok veya geçersiz" der.

| Değişken            | Anlamı                  | Varsayılan           |
| ------------------- | ----------------------- | -------------------- |
| `ANTHROPIC_API_KEY` | Claude API anahtarı     | —                    |
| `PERDE_MODEL`       | Kullanılacak model      | `claude-opus-5-5`    |
| `PERDE_MOCK`        | `1` ise örnek kip       | kapalı               |
| `HOST` / `PORT`     | Bağlanılan adres / port | `127.0.0.1` / `3000` |

`PERDE_MODEL` güncel kuşak modeller içindir (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-2`).
Sunucu tarafı yedek model yalnızca destekleyen modellerde istenir; Haiku 5.5'te gönderilmez.

Komutlar: `npm test` (birim + sunucu testleri), `npm run typecheck` (SDK çağrısının tip denetimi), `npm run check` (ikisi),
`npm run e2e` (Playwright, örnek kipte; `SHOTS_DIR=klasör` ekran görüntüleri alır).

## Mimari

- `public/senaryo.mjs` — saf çekirdek (DOM yok): öğe türleri, Enter/Tab kuralları, Fountain yazma/okuma (Türkçe metinde `.`/`@`/`>`/`!` zorlayıcı işaretleriyle), istatistik. Tarayıcı, sunucu ve testler aynı dosyayı kullanır.
- `public/app.mjs` + `index.html` + `style.css` — editör: tek `contenteditable` kök, öğe başına bir `div[data-type]`; kendi geri al/yinele geçmişi; projeler, otomatik kayıt, sürümler (`depo.mjs`, localStorage); `.fountain` içe/dışa aktarma; yazdırma stili.
- `server.mjs` — `node:http`: `public/` sunar, `POST /api/ai` ile SSE akışı verir. `lib/prompts.mjs` (saf istem kurucular), `lib/claude.mjs` (resmî SDK, akış, hata zinciri), `lib/mock.mjs`, `lib/request.mjs` (doğrulama, 2 MB sınır).
- İstek: sistem istemi donmuş tek blok; kullanıcı içeriği 1. blok senaryo (önbellekli), 2. blok eyleme özgü talimat.

## Bilerek yapılmayanlar

Hesaplar ve giriş, faturalama, gerçek zamanlı ortak çalışma, storyboard görselleri. Veriler yalnızca tarayıcıda (localStorage) tutulur; yedek için `.fountain` indirin.

## Uyarı

Sunucuda **kimlik doğrulama ve istek sınırı yoktur**. Bu yüzden yalnızca `127.0.0.1`'e bağlanır; `HOST` ile dışa açarsanız
ücretli API anahtarınız herkese açılır. Herkese açık yayından önce kimlik doğrulama ve kullanıcı/IP başına istek sınırı eklenmelidir.
