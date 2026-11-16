---
baslik: Yönlendirme ve URL
ozet: URL'yi durum olarak kullanmak (süzgeç, sekme, sayfa), hash ile history kipi ve durağan barındırma, derin bağlantı, geri düğmesi beklentisi, kaydırma konumu, korumalı rota ve girişten sonra güvenli geri dönüş.
etiketler: [yonlendirme, url, react-router, gezinme, onyuz, guvenlik]
duzey: orta
guncellik: 2026-11
---

# Yönlendirme ve URL

> Bu notu ne zaman okumalı: yeni bir ekran ya da süzgeç eklerken; "yenileyince süzgeç gidiyor", "geri tuşu
> uygulamadan çıkıyor", "geri dönünce liste başa sarıyor", "bağlantıyı paylaşınca boş sayfa açılıyor", "girişten
> sonra yanlış yere gidiyor" şikâyetlerinde.

## Temel fikir

URL, yenilemeden, geri tuşundan, paylaşmadan ve yer iminden **sağ çıkan** tek durumdur. Kullanıcının geri dönmeyi ya
da başkasına göndermeyi bekleyeceği her şey URL'de durur: hangi ekran, hangi kayıt, hangi süzgeç, hangi sayfa. URL'de
duran değer bellekte bir kopyayla tutulmaz; URL'den **türetilir**.

Her ekranın bir adresi vardır ve o adres tek başına açılabilir (derin bağlantı): ekran verisini adresteki kimlikten
kendisi yükler, "önceki ekrandan gelen" bir duruma güvenmez. Geri tuşu bir önceki **anlamlı** duruma döner; telefonda
(özellikle Android'de) kullanıcı bunu her ekranda dener.

Sahibin uygulamaları `HashRouter` kullanır (`https://ornek.app/#/gorevler`): durağan barındırmada (GitHub Pages)
yenileme 404 vermez ve göreli taban (`base: './'`) ile aynı derleme her klasörde çalışır.

## Karar tablosu: URL'de mi, başka yerde mi?

| Değer                                          | Nerede                                    | Neden                                                     |
| ---------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Hangi ekran, hangi kayıt (`/gorevler/42`)      | Yol (path)                                | Derin bağlantı, paylaşım                                  |
| Süzgeç, sıralama, arama metni, sayfa, sekme    | Sorgu parametresi (`?durum=bitti`)        | Yenileme ve geri tuşu korur; paylaşılır                   |
| Adımlı formun adımı                            | Sorgu ya da yol (`?adim=2`)               | Geri tuşu önceki adıma dönsün                             |
| Telefonda tam ekran açılan detay/alt sayfa     | Yol ya da sorgu (geçmişe girsin)          | Android geri tuşu onu kapatsın, uygulamadan çıkmasın      |
| Onay penceresi ("Silinsin mi?")                | Bileşen durumu                            | Geri tuşuyla açılması anlamsız                            |
| Form taslağı                                   | Yerel depolama                            | Uzun, kişisel; adrese sığmaz                              |
| Kaydırma konumu                                | Geçmiş girdisine bağlı bellek             | Adresin parçası değil                                     |
| Belirteç, şifre, kişisel veri                  | **Asla** (tek kullanımlık davet/sıfırlama bağlantısı hariç; açılınca adresten silinir) | Geçmişe, günlüklere, Referer'a sızar |

## URL'yi okuma ve yazma

Varsayılan değerleri adrese yazmayın (adres kısa kalsın); geçersiz değeri varsayılana döndürün (elle değiştirilmiş
adres uygulamayı çökertmesin); okuma ve yazmayı tek bir yerde toplayın:

```js calistir
import assert from 'node:assert/strict'

const DEFAULTS = { durum: 'acik', sirala: 'tarih', sayfa: 1 }
const ALLOWED = { durum: ['acik', 'bitti', 'hepsi'], sirala: ['tarih', 'baslik'] }

function readFilters(search) {
  const params = new URLSearchParams(search)
  const pick = (key) => (ALLOWED[key].includes(params.get(key)) ? params.get(key) : DEFAULTS[key])
  const page = Number.parseInt(params.get('sayfa') ?? '', 10)
  return {
    durum: pick('durum'),
    sirala: pick('sirala'),
    sayfa: Number.isInteger(page) && page > 0 ? page : 1,
    etiket: params.getAll('etiket'), // dizi: tekrarlı anahtar
    q: params.get('q') ?? '',
  }
}
function writeFilters(filters) {
  const params = new URLSearchParams()
  for (const key of ['q', 'durum', 'sirala', 'sayfa']) {
    if (filters[key] !== '' && filters[key] !== DEFAULTS[key]) params.set(key, String(filters[key]))
  }
  for (const tag of filters.etiket) params.append('etiket', tag)
  return params.toString()
}

const state = readFilters('?durum=bitti&sayfa=abc&etiket=ilaç&etiket=ev&q=süt')
assert.deepEqual(state, { durum: 'bitti', sirala: 'tarih', sayfa: 1, etiket: ['ilaç', 'ev'], q: 'süt' })
assert.equal(writeFilters(state), 'q=s%C3%BCt&durum=bitti&etiket=ila%C3%A7&etiket=ev') // Türkçe harfler kodlanır
assert.deepEqual(readFilters('?' + writeFilters(state)), state) // gidiş-dönüş kayıpsız
assert.equal(writeFilters(readFilters('')), '') // varsayılanlar adrese yazılmaz

// HashRouter tuzağı: sorgu # işaretinden SONRA durur; window.location.search BOŞ gelir
const url = new URL('https://ornek.app/#/gorevler?durum=bitti')
assert.equal(url.search, '')
assert.equal(new URLSearchParams(url.hash.split('?')[1]).get('durum'), 'bitti')
console.log('tamam')
```

```cikti
tamam
```

React Router'da sorgu parametreleri `useSearchParams` ile okunur/yazılır (HashRouter'da da doğru çalışır;
`window.location.search` çalışmaz). Arama kutusunda her tuşta yazarken `setSearchParams(next, { replace: true })`
kullanın; yoksa geçmiş her harf için bir girdiyle dolar.

## Hash ↔ history kipi ve durağan barındırma

| Kip                               | Adres                        | Yenileyince                                  | Ne zaman                                          |
| --------------------------------- | ---------------------------- | -------------------------------------------- | ------------------------------------------------- |
| Hash (`HashRouter`)               | `https://ornek.app/#/gorevler` | Sunucu hep `index.html` verir (# sonrası sunucuya gitmez) | Durağan barındırma, alt klasör, PWA, arama motoru gerekmeyen uygulama |
| History (`BrowserRouter`)         | `https://ornek.app/gorevler` | Sunucu bu yolu bilmiyorsa **404**            | Sunucuda "bilinmeyen yol → index.html" kuralı varsa; arama motorunda görünmesi gereken sayfalar |
| Sunucuda çizilen sayfalar (site)  | Gerçek yollar                | Her yol gerçek dosya                         | İçerik sitesi (havuzdaki `site` temeli, Astro)    |

```js calistir
import assert from 'node:assert/strict'

// Durağan barındırıcı yalnız var olan dosyayı verir. Adresin # sonrası sunucuya HİÇ gönderilmez.
function staticHost(files, href, { spaFallback = false } = {}) {
  const { pathname } = new URL(href)
  const path = pathname.endsWith('/') ? `${pathname}index.html` : pathname
  if (files.has(path)) return 200
  return spaFallback ? 200 : 404
}

const files = new Set(['/uygulama/index.html', '/uygulama/assets/index-abc.js'])
assert.equal(staticHost(files, 'https://ornek.github.io/uygulama/#/gorevler/42'), 200) // hash: hep index.html
assert.equal(staticHost(files, 'https://ornek.github.io/uygulama/gorevler/42'), 404) // history: yenileyince 404
assert.equal(staticHost(files, 'https://ornek.github.io/uygulama/gorevler/42', { spaFallback: true }), 200)
console.log('tamam')
```

History kipine geçilecekse üç şey birlikte değişir: sunucuda geri dönüş kuralı, mutlak taban (`base: '/uygulama/'`
— göreli taban iç içe yolda varlıkları yanlış yerde arar; bkz. [Vite ve derleme](vite-ve-derleme.md)) ve servis
çalışanının gezinme yedeği. Hash kipinde sayfa içi çapa (`#bolum`) kullanılamaz; başlığa kaydırmayı kodla yapın.

## Derin bağlantı

- Her ekran verisini adresteki kimlikten yükler; kayıt yoksa "Bulunamadı" ekranı (çökme değil, boş ekran değil) ve
  ana sayfaya dönüş bağlantısı.
- Giriş gerektiren derin bağlantı: giriş sayfasına `?next=` ile gidilir, girişten sonra o adrese dönülür (aşağıda).
- Yerel-önce uygulamada derin bağlantı başka bir cihazda açılırsa kayıt henüz eşitlenmemiş olabilir: "Bu kayıt bu
  cihazda yok; eşitleme bitince görünecek" gibi bir ara durum gösterin.
- Paylaşılan bağlantı herkese açık adres olmalı (`localhost` değil); hash kipinde `#/` kısmı da kopyalanır.
- Kurulu PWA'da kapsam (`scope`) içindeki bağlantılar Android'de uygulamada açılabilir; kapsam dışı olanlar
  tarayıcıda açılır.

## Geri düğmesi beklentisi

Soru: "Kullanıcı geri tuşuna basınca **bu** duruma dönmek ister mi?" Evetse `push`, hayırsa `replace`.

| Gezinme                                              | `push` / `replace` | Neden                                                  |
| ---------------------------------------------------- | ------------------ | ------------------------------------------------------ |
| Listeden detaya, menüden başka ekrana                | push               | Geri tuşu listeye dönsün                               |
| Arama kutusuna yazmak                                | replace            | Her harf için geri basmak istenmez                     |
| Süzgeç/sekme değiştirmek                             | Ekran içinde: replace; ayrı "sayfa" gibi duran sekme: push | Tutarlı seçin, her yerde aynı kalsın |
| Form başarıyla gönderildi → sonuç/liste              | replace            | Geri tuşu gönderilmiş forma dönmesin                   |
| Giriş sonrası `next`'e, korumalı rotadan girişe      | replace            | Giriş sayfası geçmişte kalmasın                        |
| Telefonda alt sayfa/detay paneli açmak               | push               | Android geri tuşu paneli kapatsın                      |
| Adımlı formda sonraki adım                           | push               | Geri tuşu önceki adım                                  |
| Kayıt silindi, detay ekranından çıkılıyor            | replace            | Geri tuşu silinmiş kayda dönmesin                      |

Kaydedilmemiş değişiklik varken çıkış: önce otomatik taslak; gerçekten gerekiyorsa React Router'ın `useBlocker`'ı
(kurulu sürümde var) ile "Değişiklikler kaydedilmedi" onayı. Tarayıcının `beforeunload` uyarısı telefonda güvenilir
değildir.

## Kaydırma konumu

Tek sayfalık uygulamada tarayıcı kaydırmayı kendiliğinden geri getiremez: liste yeniden çizilirken yükseklik henüz
yoktur. Kural: **yeni sayfaya (push) gelince başa, geri/ileri (pop) gelince eski yere.** Konum adres başına değil
**geçmiş girdisi** başına saklanır (aynı listeye menüden yeniden gitmek yeni bir girdidir, başta açılır):

```js calistir
import assert from 'node:assert/strict'

function createScrollMemory() {
  const positions = new Map() // geçmiş girdisi anahtarı (location.key) → kaydırma
  return {
    leave(entryKey, scrollY) { positions.set(entryKey, scrollY) },
    arrive(entryKey, navigationType) { return navigationType === 'POP' ? (positions.get(entryKey) ?? 0) : 0 },
  }
}

const memory = createScrollMemory()
memory.leave('k1', 1840) // listede aşağı inildi, bir göreve dokunuldu
assert.equal(memory.arrive('k2', 'PUSH'), 0) // detay başta açılır
memory.leave('k2', 300)
assert.equal(memory.arrive('k1', 'POP'), 1840) // geri: listede kalınan yer
assert.equal(memory.arrive('k3', 'PUSH'), 0) // aynı listeye menüden yeniden gidiş: başta
console.log('tamam')
```

Uygulamada: `useNavigationType()` POP/PUSH/REPLACE verir, `useLocation().key` girdi anahtarıdır; kaydırmayı veri
**çizildikten sonra** geri yükleyin (önce liste, sonra `scrollTo`). Yüklenen sayfalar önbellekte durmalı ki geri
gelince liste aynı uzunlukta çizilsin. React Router'ın `<ScrollRestoration>` bileşeni veri yönlendiricisi
(`createHashRouter` + `RouterProvider`) ister; bildirimsel `<HashRouter>` ile çalışmaz (kurulu 8.5.1 kaynağında
veri yönlendiricisi bağlamı istediği görüldü). Uygulama temelindeki
[`useRouteFocus.ts`](../../uygulama/web/src/app/useRouteFocus.ts) yol değişiminde odağı başlığa alıp başa kaydırır;
geri dönüşte eski yere dönmek istenirse yukarıdaki ayrım eklenir.

## Korumalı rotalar ve girişten sonra geri dönme

- İstemcideki koruma **görünümdür**; veri sunucuda korunur. Korumalı ekran, oturum yokken giriş sayfasına
  `replace` ile yönlendirir ve gelinen adresi `?next=` ile taşır.
- Oturum durumu yüklenirken ne giriş sayfası ne içerik gösterilir (kısa bir iskelet); yoksa giriş ekranı bir an
  parlar ve kullanıcı yanlış yere tıklar.
- Oturum ortada düşerse (401) veriyi ve ekranı korumak, yeniden giriş istemek; yerel-önce uygulamada yerel veri
  çalışmaya devam eder (uygulama temelinde oturum "süresi doldu" olarak işaretlenir).
- `next` değeri yalnız **kendi kökeninizdeki bir yol** olabilir; aksi hâlde giriş sayfanız saldırganın oltalama
  sayfasına yönlendiren bir araca döner (açık yönlendirme, open redirect):

```js calistir
import assert from 'node:assert/strict'

function safeNext(value, origin = 'https://ornek.app', fallback = '/gorevler') {
  if (!value) return fallback
  let url
  try { url = new URL(value, origin) } catch { return fallback }
  if (url.origin !== origin) return fallback
  return url.pathname + url.search + url.hash
}

assert.equal(safeNext('/gorevler/42?sekme=notlar'), '/gorevler/42?sekme=notlar')
assert.equal(safeNext('https://kotu.example/giris'), '/gorevler')
assert.equal(safeNext('//kotu.example'), '/gorevler') // protokolsüz adres: başka site
assert.equal(safeNext('/\\kotu.example'), '/gorevler') // ters eğik çizgi / sayılır
assert.equal(safeNext('/\t/kotu.example'), '/gorevler') // sekme silinince "//kotu.example" olur
assert.equal(safeNext('javascript:alert(1)'), '/gorevler')

// Yalnız "/ ile başlıyor mu" denetimi sekmeli yazımı kaçırır:
const startsWithSlash = (v) => v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')
assert.equal(startsWithSlash('/\t/kotu.example'), true) // location.href'e verilirse dışarı çıkar
console.log('tamam')
```

Uygulama temelindeki `safeNext` ([`afterLogin.ts`](../../uygulama/web/src/features/auth/afterLogin.ts)) önek
denetimi yapar ve sonucu yalnız yönlendiricinin `navigate()` işlevine verir; bu, uygulama içinde kalan bir gezinme
olduğu için güvenlidir. Değeri `location.href`'e ya da sunucu yönlendirmesine verecekseniz yukarıdaki URL
ayrıştırmalı denetimi kullanın.

## Tuzaklar

| Belirti                                                        | Neden                                                        | Çözüm                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| Yenileyince süzgeç/sekme kayboluyor                            | Durum bellekte                                               | Sorgu parametresi                                         |
| Yayında yenileyince 404                                        | History kipi + sunucuda geri dönüş kuralı yok                | Hash kipi ya da sunucu kuralı                             |
| Paylaşılan bağlantı boş sayfa açıyor                           | Ekran veriyi önceki ekrandan bekliyor (`location.state`)     | Veriyi adresteki kimlikten yükleyin                       |
| `window.location.search` boş                                   | HashRouter: sorgu hash'in içinde                             | `useSearchParams`                                         |
| Geri tuşuna basınca uygulamadan çıkılıyor                      | Panel/adım geçmişe yazılmamış                                | Alt sayfa ve adımları `push`                              |
| Geri tuşu her harfi tek tek geri alıyor                        | Arama yazımı `push` ile                                      | `replace`                                                 |
| Geri gelince liste başa sarıyor                                | Kaydırma geri yüklenmiyor ya da liste yeniden yükleniyor     | Girdi başına konum + önbellekli liste                     |
| Girişten sonra başka siteye gidildi                            | `next` doğrulanmadı                                          | Kökeni denetleyen `safeNext`                              |
| Giriş ekranı bir an görünüp kayboluyor                         | Oturum yüklenmeden koruma karar veriyor                      | Yüklenirken iskelet                                       |
| Elle bozulmuş adres (`?sayfa=abc`) uygulamayı çökertiyor       | Parametre doğrulanmadan kullanılıyor                         | Okurken doğrulayın, varsayılana dönün                     |

## Denetim listesi

- [ ] Her ekranın bir adresi var ve adres yeni sekmede tek başına açılıyor.
- [ ] Süzgeç, sıralama, arama, sayfa, sekme URL'de; varsayılanlar adrese yazılmıyor; geçersiz değer varsayılana dönüyor.
- [ ] URL'deki değer bellekte kopyalanmıyor, URL'den türetiliyor.
- [ ] `push`/`replace` seçimi tabloya uygun; arama yazımı `replace`.
- [ ] Android geri tuşu panelleri ve adımları kapatıyor, uygulamadan erken çıkmıyor.
- [ ] Geri gelince liste kalınan yerden devam ediyor.
- [ ] Olmayan kayıt adresi "Bulunamadı" ekranı gösteriyor.
- [ ] Korumalı rotada `next` ile dönülüyor ve `next` kökeni denetleniyor.
- [ ] Adreste belirteç ya da kişisel veri kalmıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu ekranın süzgeçlerini `useSearchParams` ile URL'de tut; varsayılanları yazma, geçersiz değeri
  varsayılana döndür. Yeni sayfayı rota kaydına (`routes.tsx`) ekle. Form başarıyla gönderilince `replace` ile
  yönlendir. `window.location`'ı doğrudan kullanma."
- **Modelin tipik hatası:** Süzgeci `useState`'te tutar; detay ekranına veriyi `location.state` ile taşır (derin
  bağlantı bozulur); `window.location.search` okur (HashRouter'da boş); her gezinmeyi `push` yapar; `next`'i
  doğrulamadan kullanır.
- **Çıktıda arayın:** `location.state`, `window.location`, `useState` ile tutulan süzgeçler, `navigate(` çağrılarında
  `replace` eksikliği (form gönderimi, giriş), `next` parametresinin doğrudan kullanımı.
- **Test isteyin:** "Süzgeç seçip yenileyince süzgeç duruyor", "detay adresi yeni sekmede açılıyor", "geri tuşu
  listeye kaldığı yerden dönüyor".

## İlgili

- [Durum yönetimi seçimi](durum-yonetimi-secimi.md) — URL durumunun yeri
- [Ön yüz güvenliği](onyuz-guvenligi.md) — açık yönlendirme, adreste belirteç
- [Vite ve derleme](vite-ve-derleme.md) — `base` ve alt klasörde yayın
- [PWA ve çevrimdışı](pwa-ve-cevrimdisi.md) — `start_url`, `scope`, gezinme yedeği
- Çalışan örnek: tek dosyada rota kaydı [`routes.tsx`](../../uygulama/web/src/app/routes.tsx)
- Başka kümelerde: [SEO temelleri](../95-urun/seo-temelleri.md) (arama motorunda görünmesi gereken sayfalar), [Bilgi mimarisi ve akış](../95-urun/bilgi-mimarisi-ve-akis.md)
