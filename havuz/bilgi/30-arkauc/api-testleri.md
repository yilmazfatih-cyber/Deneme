---
baslik: API testleri: ağsız uç testi, olumsuz durumlar ve kural testleri
ozet: Arka ucu sunucu açmadan, her testte yeni bir uygulama ve bellek içi veritabanıyla sınamak; olumsuz durum tablosu, oturumsuz uç yakalayan kural testi, sahte saat ve dış servis, yan etki ve günlük denetimi.
etiketler: [test, api, guvenlik, mimari, kalite]
duzey: orta
guncellik: 2026-11
---

# API testleri: ağsız uç testi, olumsuz durumlar ve kural testleri

> Bu notu ne zaman okumalı: yeni bir uç ya da modül yazıldığında; bir modelin yazdığı testler yalnız "mutlu yolu"
> sınadığında; testler yavaş, ağ isteyen ya da ara sıra düşen hâle geldiğinde; "testler geçiyordu ama yayında açık
> çıktı" dendiğinde.

## Temel fikir

Arka uç testinin en verimli düzeyi **uç düzeyidir**: istek, sunucunun kullandığı aynı işleyiciye ağ olmadan verilir;
yanıtın durumu, gövdesi ve yan etkileri (veritabanı satırı, giden e-posta, günlük satırı) denetlenir. Her test kendi
**yepyeni uygulamasını** kurar: bellek içi veritabanı (bütün göçler uygulanmış), ileri sarılabilen saat, göndermeyen
e-posta postacısı, belleğe yazan günlükçü. Testler bu yüzden hızlı, ağsız ve birbirinden bağımsızdır.

İkinci kural: güvenlik açıkları "olmaması gereken şeyin" sınanmadığı yerde doğar. Her korumalı uç için **olumsuz
durumlar** (oturumsuz, başka kullanıcı, yetkisiz rol, bozuk gövde) mutlu yoldan önce yazılır. Üçüncüsü: kod
tabanının kuralları (her uçta kimlik kapısı, her uç belgede, göç adları) **kural testleriyle** korunur; yeni eklenen
ve kuralı unutan kod kendiliğinden yakalanır.

## Karar tablosu: arka uçta ne, hangi düzeyde

| Ne sınanıyor                                    | Düzey                          | Nasıl                                                     |
| ----------------------------------------------- | ------------------------------ | --------------------------------------------------------- |
| Saf iş kuralı (fiyat, durum geçişi, katlama)    | Birim                          | İşlevi doğrudan çağır; tablo güdümlü                      |
| Uç: doğrulama, yetki, durum kodu, hata gövdesi  | Ağsız uç testi                 | `app.request(...)` / `handler(new Request(...))`          |
| SQL, göç, kısıtlar                              | Gerçek motor (bellek içi SQLite ya da test veritabanı) | Taklit (mock) yok                    |
| Yarış, kayıp güncelleme, idempotentlik          | Eşzamanlılık testi             | İki bağlantı + engel; aynı isteği iki kez gönder          |
| Dış servis (e-posta, ödeme)                     | Sahte istemci / sahte sunucu   | Gerçek servise asla; sınama ortamı ayrı ve isteğe bağlı   |
| Kod tabanı kuralları                            | Kural testi                    | Rota tablosu, dosya adları, belge ↔ kod karşılaştırması   |
| İstemci ile sunucu aynı protokolü mü konuşuyor  | Uygunluk testi                 | Aynı senaryolar başvuru gerçeklemesine ve gerçek API'ye   |
| Kritik kullanıcı yolculuğu                      | Uçtan uca (az sayıda)          | Tarayıcı + gerçek sunucu                                  |

Genel ilkeler (düzeyler, taklit ne zaman, özellik tabanlı test): [Test stratejisi](../00-yontem/test-stratejisi.md).

## Ağsız uç testi, olumsuz durum tablosu ve kural testi

Uygulama, `Request` alıp `Response` döndüren tek bir işlevse (Hono'nun `app.fetch`'i böyledir), test onu doğrudan
çağırır. Örnekte bir rotada kimlik kapısı bilerek unutuldu; kural testi bunu yakalar:

```js calistir
import assert from 'node:assert/strict'

const json = (durum, govde) => Response.json(govde, { status: durum })
const hata = (durum, code) => json(durum, { error: { code } })

// Uygulama = Request alıp Response döndüren tek işlev; bağımlılıklar (oturumlar, veri) dışarıdan
function uygulamaKur(bag) {
  const kim = (istek) => bag.oturumlar.get((istek.headers.get('authorization') ?? '').replace(/^Bearer /, ''))
  const korumali = (isle) => (istek, p) => {
    const kullanici = kim(istek)
    return kullanici ? isle(istek, p, kullanici) : hata(401, 'unauthorized')
  }
  const rotalar = [
    ['GET', '/api/saglik', () => json(200, { ok: true })], // bilinçli olarak herkese açık
    ['GET', '/api/notlar/:id', korumali((_, p, k) => {
      const not = bag.notlar.get(p.id)
      return not?.sahip === k ? json(200, not) : hata(404, 'not_found') // başkasınınki de "yok"
    })],
    ['POST', '/api/notlar', korumali(async (istek, _, k) => {
      const govde = await istek.json().catch(() => null)
      if (typeof govde?.metin !== 'string' || !govde.metin.trim()) return hata(400, 'validation')
      const id = String(bag.notlar.size + 1)
      bag.notlar.set(id, { id, sahip: k, metin: govde.metin })
      return json(201, { id })
    })],
    ['GET', '/api/notlar/:id/disa-aktar', (_, p) => json(200, bag.notlar.get(p.id) ?? {})], // HATA: kapı unutuldu
  ]
  async function fetch(istek) {
    const yol = new URL(istek.url).pathname
    for (const [yontem, kalip, isle] of rotalar) {
      const eslesme = new RegExp(`^${kalip.replace(':id', '(?<id>[^/]+)')}$`).exec(yol)
      if (yontem === istek.method && eslesme) return isle(istek, eslesme.groups ?? {})
    }
    return hata(404, 'not_found')
  }
  return { rotalar, fetch }
}

const yeni = () => uygulamaKur({ oturumlar: new Map([['t-ayse', 'ayse'], ['t-burak', 'burak']]), notlar: new Map() })
const istek = (yontem, yol, { belirtec, govde } = {}) =>
  new Request(`http://test${yol}`, {
    method: yontem,
    headers: belirtec ? { authorization: `Bearer ${belirtec}` } : {},
    body: govde === undefined ? undefined : typeof govde === 'string' ? govde : JSON.stringify(govde),
  })

// 1) Olumsuz durum tablosu: sahibi / oturumsuz / başkası / bozuk gövde
const app = yeni()
const { id } = await (await app.fetch(istek('POST', '/api/notlar', { belirtec: 't-ayse', govde: { metin: 'Süt al' } }))).json()
for (const [ad, ist, beklenen] of [
  ['sahibi okur', istek('GET', `/api/notlar/${id}`, { belirtec: 't-ayse' }), 200],
  ['oturumsuz', istek('GET', `/api/notlar/${id}`), 401],
  ['başka kullanıcı', istek('GET', `/api/notlar/${id}`, { belirtec: 't-burak' }), 404],
  ['boş metin', istek('POST', '/api/notlar', { belirtec: 't-ayse', govde: { metin: '  ' } }), 400],
  ['JSON değil', istek('POST', '/api/notlar', { belirtec: 't-ayse', govde: 'metin=x' }), 400],
]) {
  assert.equal((await app.fetch(ist)).status, beklenen, ad)
}

// 2) Kural testi: bilinçli herkese açık listesi dışındaki HER rota oturumsuz isteğe 401 vermeli
const HERKESE_ACIK = new Set(['GET /api/saglik'])
const acikKalan = []
for (const [yontem, kalip] of yeni().rotalar) {
  if (HERKESE_ACIK.has(`${yontem} ${kalip}`)) continue
  const durum = (await yeni().fetch(istek(yontem, kalip.replace(':id', 'x')))).status
  if (durum !== 401) acikKalan.push(`${yontem} ${kalip}`)
}
assert.deepEqual(acikKalan, ['GET /api/notlar/:id/disa-aktar']) // unutulan kapıyı test yakaladı
console.log('tamam')
```

```cikti
tamam
```

Gerçek projede kural testi rota listesini çerçeveden okur (havuzda Hono'nun `app.routes`'u) ve hata iletisi ne
yapılacağını söyler: "`GET /api/x` oturumsuz çağrılabiliyor: işleyicinin ilk satırına `requireUser(c)` ekleyin ya da
bilinçliyse `PUBLIC_ROUTES`'a yazın" ([`rules.test.ts`](../../uygulama/api/test/rules.test.ts)).

## Düzenek (harness)

Havuzdaki API düzeneği ([`test/support/harness.ts`](../../uygulama/api/test/support/harness.ts)) her test için:

| Parça                     | Testteki hâli                                         | Neden                                              |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Veritabanı                | `:memory:` + bütün göçler                             | Gerçek SQL, her testte temiz                       |
| Saat                      | Her okunuşta 1 ms ilerleyen, `advance` ile sarılan    | Süre dolumu, oturum uzatma, hız sınırı sınanır     |
| Parola özeti              | Ucuz parametreler (gerçekleri ayrı testte)            | Testler saniyeler değil milisaniyeler sürsün       |
| E-posta                   | Göndermez, `mail_outbox` tablosuna yazar              | Testte e-posta içeriği ve bağlantısı okunur        |
| Günlük                    | Belleğe yazar                                         | "Günlükte sır yok" denetlenir                      |
| İstemci yardımcıları      | `signUp`, oturumlu istek, çerez kavanozu ([`client.ts`](../../uygulama/api/test/support/client.ts)) | Testler kısa ve okunur |

Kurallar: testler birbirinin verisine güvenmez (her biri kendi kullanıcısını açar); sıra bağımlılığı yoktur;
bekleyen arka plan işleri `await t.idle()` ile beklenir; kapanışta sunucu ve veritabanı kapatılır.

## Yan etkileri denetle

Durum kodu yetmez; sonucu da denetleyin:

- **Veritabanı:** istekten sonra beklenen satır var mı, beklenmeyen satır yok mu (reddedilen istek hiçbir şey
  yazmadı mı)?
- **E-posta:** giden kutusunda konu, alıcı ve bağlantı; bağlantıdaki belirteç gerçekten çalışıyor mu.
- **Denetim kaydı:** güvenlik olayı yazıldı mı, içinde parola/e-posta yok mu.
- **Günlük:** bütün akıştan sonra günlükte parola, belirteç, çerez, e-posta geçmiyor mu
  ([`security.test.ts`](../../uygulama/api/test/security.test.ts)).
- **Anlık olaylar:** ilgili kullanıcıya dürtme gitti mi, gitmemesi gerekene gitmedi mi
  ([`test/support/sse.ts`](../../uygulama/api/test/support/sse.ts)).

## Zaman, rastgelelik ve dış servisler

- Saat ve rastgele kaynak dışarıdan verilir; "7 gün sonra davet geçersiz" testi 7 gün beklemez, saati sarar
  ([Zaman ve saat dilimi](zaman-ve-saat-dilimi.md)).
- Dış servis sahte bir istemciyle değiştirilir: e-posta postacısına sahte `fetch` verilir, gönderilen istek
  denetlenir, sağlayıcının hata yanıtları (401, 429, 500, zaman aşımı) tek tek denenir
  ([`mailer.test.ts`](../../uygulama/api/test/mailer.test.ts)).
- Gerçek servise giden test varsayılan olarak kapalıdır ve bir ortam değişkeniyle açılır.

## Eşzamanlılık, idempotentlik ve uygunluk

- Aynı isteği **iki kez** ve **aynı anda** gönderen testler: tek etki olmalı ([İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md),
  [API tasarımı](api-tasarimi.md)). Havuzda iki iş parçacığı aynı alana yazar ve sürüm numaralarının çakışmadığı
  denetlenir ([`concurrency.test.ts`](../../uygulama/api/test/concurrency.test.ts)).
- **Uygunluk testi:** bir protokolün davranışı bellek içi bir başvuru gerçeklemesiyle tanımlanır; aynı senaryolar hem
  başvuruya hem gerçek API'ye koşturulur. Havuzdaki eşitleme böyle korunur
  ([`sync.conformance.test.ts`](../../uygulama/api/test/sync.conformance.test.ts)).
- **Göç testi:** boş veritabanına bütün göçler sırayla; değiştirilmiş göç dosyası ve "veritabanı koddan yeni"
  durumları ([`migrate.test.ts`](../../uygulama/api/test/migrate.test.ts)).

## Tuzaklar

| Belirti                                                        | Neden                                                    | Çözüm                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Testler geçiyor, yayında başkasının kaydı okunabildi           | Yalnız mutlu yol sınandı                                 | Her korumalı uca olumsuz durum tablosu                      |
| Yeni eklenen uç oturumsuz çağrılabiliyor                       | Kimlik kapısı unutuldu, kimse fark etmedi                | Rota tablosunu tarayan kural testi                          |
| Testler sırayla geçiyor, tek başına çalıştırınca düşüyor       | Testler ortak veriye bağımlı                             | Her test kendi uygulamasını ve verisini kurar               |
| Test takımı dakikalar sürüyor                                  | Gerçek parola parametreleri, gerçek bekleme, ağ          | Ucuz parametre, sahte saat, ağsız istek                     |
| Gece yarısı ya da ay sonunda testler düşüyor                   | Gerçek saat                                              | Sahte saat; sınır anları ayrıca sınanır                     |
| Testler geçiyor, üretimde SQL hatası                           | Veritabanı taklit edildi                                 | Gerçek motor + göçler                                       |
| Test ara sıra 429 alıyor                                       | Hız sınırı açık, çok istek                               | Saati ilerletin ya da testte sınırı bilinçli kapatın        |
| Testte gerçek e-posta gitti                                    | Dış servis testte gerçek                                 | Göndermeyen postacı; gerçek servis testi bayrakla           |
| Belgedeki örnek istek çalışmıyor                               | Belge kodla birlikte güncellenmedi                       | Belge ↔ kod kural testi                                     |

## Denetim listesi

- [ ] Her test kendi uygulamasını kuruyor: bellek içi veritabanı + bütün göçler, sahte saat, göndermeyen postacı.
- [ ] Uç testleri ağsız; gerçek sunucu açılmıyor.
- [ ] Her korumalı uç için oturumsuz (401), başka kullanıcı/kiracı (404), yetkisiz rol (403), bozuk gövde (400) testi var.
- [ ] Rota tablosunu tarayan "oturumsuz uç yok" kural testi var; herkese açık uçlar bilinçli bir listede.
- [ ] Yan etkiler (satır, e-posta, denetim kaydı, olay) ve günlükte sır olmadığı denetleniyor.
- [ ] Süre ve tarih kuralları sahte saatle sınanıyor; sınır anları (gece yarısı, ay sonu) testli.
- [ ] Aynı isteği iki kez/aynı anda gönderen idempotentlik ve eşzamanlılık testleri var.
- [ ] Dış servisler sahte; gerçek servis testleri varsayılan kapalı.
- [ ] Test takımı tek komutla ve kısa sürede koşuyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu uç için önce olumsuz testleri yaz: oturumsuz 401, başka kullanıcı 404, yetkisiz rol 403,
  bozuk gövde 400; sonra mutlu yol. Düzenek olarak `createTestServer` ve `signUp` kullan; gerçek saat ve ağ kullanma.
  Yan etkiyi veritabanından ya da `t.outbox()`'tan denetle." Örnek test: [`account.test.ts`](../../uygulama/api/test/modules/account.test.ts).
- **Tipik hatalar:** yalnız 200'ü sınamak; veritabanını taklit etmek; `setTimeout` ile beklemek; testler arasında
  ortak kullanıcı; beklentiyi koda uydurmak (test kırmızıysa kodu değil testi değiştirmek); hız sınırını testte
  kalıcı kapatıp sınır kurallarını hiç sınamamak.
- **Çıktıda arayın:** her yeni uç için 401/403/404/400 beklentileri; `sleep`/`setTimeout`; `vi.mock`/`jest.mock` ile
  veritabanı taklidi; testte gerçek adres (`http://localhost:…`) ve gerçek dış servis.
- **Doğrulama:** modele bir uçta kimlik kapısını sildirip kural testinin düştüğünü gösterin; test gerçekten koruyor mu
  böyle anlaşılır.

## İlgili

- [Test stratejisi](../00-yontem/test-stratejisi.md) (genel ilkeler) · [Yetkilendirme](yetkilendirme.md) (olumsuz
  testler) · [Sunucu mimarisi](sunucu-mimarisi.md) (bağımlılıkları dışarıdan verme) ·
  [Hata yönetimi ve günlükleme](hata-yonetimi-ve-gunlukleme.md) (günlükte sır testi)
- Havuzdaki tarif: [`TARIFLER.md`](../../uygulama/api/TARIFLER.md) → "Yeni uç nokta ekle" (adım 8: mutlu yol +
  oturumsuz + yetkisiz + doğrulama hatası).
