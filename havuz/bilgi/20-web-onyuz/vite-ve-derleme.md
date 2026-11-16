---
baslik: Vite ve derleme
ozet: Geliştirme ile üretim derlemesinin farkı, istemciye sızan ortam değişkenleri, taban yolu ve alt klasörde yayın, varlık işleme, vekil, derleme çıktısını okuma ve yayından sonra görülen sık hatalar.
etiketler: [vite, derleme, ortam-degiskeni, yayin, onyuz, pwa]
duzey: orta
guncellik: 2026-11
---

# Vite ve derleme

> Bu notu ne zaman okumalı: uygulamayı ilk kez yayınlarken; "geliştirmede çalışıyor, yayında beyaz sayfa", "ortam
> değişkeni yayında yok", "GitHub Pages'te dosyalar 404", "yayından sonra açık sekmede hata" durumlarında; `.env`
> dosyasına bir anahtar yazmadan önce.

## Temel fikir

Vite iki ayrı iş yapar. **Geliştirmede** (`vite`) paket kurmaz: tarayıcı modülleri tek tek ister, Vite istenen
dosyayı anında dönüştürüp verir, değişiklik sayfayı yenilemeden yerine oturur (HMR). **Derlemede** (`vite build`)
her şeyi paketler, küçültür, adlara içerik özeti (hash) ekler, parçalara böler ve `dist/` klasörüne yazar. Kurulu
sürüm 8.3.8 paketleme için Rolldown, CSS için Lightning CSS kullanır (paketin bağımlılıklarında görüldü).

Hataların çoğu bu iki dünya arasındaki farktan çıkar. Kural: **yayından önce her zaman `build` + `preview` ile
deneyin**; PWA (servis çalışanı) zaten yalnız derlenmiş sürümde vardır.

Sürüme bağlı her ayrıntıyı ezberden değil kurulu paketten doğrulayın (`node_modules/vite/dist/node/…`). Bu notta
"doğrulandı" denenler vite 8.3.8 ve vite-plugin-pwa 2.0.0 içindir.

## Geliştirme ↔ üretim farkı

| Konu                      | Geliştirme (`vite`)                         | Üretim (`vite build` + `preview`/yayın)              |
| ------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Kod                       | Dosya dosya, dönüştürülmüş kaynak           | Paketlenmiş, küçültülmüş, özetli adlar               |
| Ortam                     | `import.meta.env.DEV === true`, `MODE` "development" | `PROD === true`, `MODE` "production"        |
| Servis çalışanı (PWA)     | Yok (vite-plugin-pwa varsayılanı)           | Var                                                  |
| `/api` vekili             | `server.proxy` çalışır                      | **Yok**: yayında API aynı kökende olmalı ya da CORS  |
| Dosya adı büyük/küçük harf | macOS/Windows'ta hoşgörülü                 | Linux'taki CI ve sunucuda kesin                      |
| Hata ayıklama             | Kaynak kodu görünür                         | Kaynak haritası (source map) yoksa küçültülmüş kod   |
| Döngüsel içe aktarma, üst düzey `await` | Çoğu zaman sorunsuz           | Paketlemede sıra hatası çıkabilir                    |
| CSS sırası                | İçe aktarma sırası                          | Paketleme sırası; farklı çıkabilir                   |

## Ortam değişkenleri: istemciye sızan sırlar

- İstemci koduna yalnız **`VITE_` önekli** değişkenler girer ve değerleri **derleme anında koda gömülür**. Paketi
  indiren herkes okur. Önek bir güvenlik önlemi değil, "bu açık bilgidir" işaretidir.
- Değer derlemede gömüldüğü için yayından sonra değiştirmek yeniden derleme ister. Çalışma anında değişecek ayar
  gerekiyorsa uygulama açılırken `config.json` okuyun.
- Dosya sırası (vite 8.3.8 `loadEnv` kaynağında doğrulandı): `.env` → `.env.local` → `.env.[kip]` →
  `.env.[kip].local`; sonraki öncekini ezer; derlemeyi başlatan ortamdaki (CI) önekli değişken hepsini ezer. Boş önek
  (`envPrefix: ''`) Vite tarafından reddedilir.

```js calistir
import assert from 'node:assert/strict'

// Vite'ın .env kuralının benzetimi: dosyalar sırayla, sonraki ezer; işlem ortamı en son; istemciye YALNIZ önekli.
function clientEnv(mode, files, processEnv = {}, prefix = 'VITE_') {
  if (prefix === '') throw new Error('boş önek bütün değişkenleri sızdırır')
  const order = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  const merged = { ...Object.assign({}, ...order.map((name) => files[name] ?? {})), ...processEnv }
  return Object.fromEntries(Object.entries(merged).filter(([key]) => key.startsWith(prefix)))
}

const files = {
  '.env': { VITE_API_URL: '', DATABASE_URL: 'postgres://gizli' },
  '.env.production': { VITE_API_URL: 'https://api.ornek.com' },
  '.env.production.local': { VITE_API_URL: 'https://deneme.ornek.com', VITE_OPENAI_KEY: 'sk-gizli' },
}
const env = clientEnv('production', files)
assert.equal(env.VITE_API_URL, 'https://deneme.ornek.com') // .local en son okunur, ezer
assert.equal('DATABASE_URL' in env, false) // öneksiz: istemciye gitmez
assert.equal(env.VITE_OPENAI_KEY, 'sk-gizli') // ÖNEKLİ SIR PAKETE GÖMÜLÜR: herkes okur
assert.equal(clientEnv('production', files, { VITE_API_URL: 'none' }).VITE_API_URL, 'none') // CI değişkeni hepsini ezer
assert.throws(() => clientEnv('production', files, {}, ''))
console.log('tamam')
```

```cikti
tamam
```

Uygulama temelinde: her `VITE_` değişkeninin tipi `vite-env.d.ts`'te, okunuşu ve doğrulaması tek dosyada
([`env.ts`](../../uygulama/web/src/lib/env.ts): geçersiz adres açık bir konsol iletisiyle "hesapsız kipe" düşer).
`.env.local` ve `.env.*.local` git'e girmez; depoda yalnız `.env.example` durur. `vite.config.ts` içinde
`import.meta.env` yoktur; orada `loadEnv(mode, process.cwd())` ya da `process.env` kullanılır.

## Taban yolu (`base`) ve alt klasörde yayın

Derlenmiş `index.html` varlıkları `base`'e göre yazar. `base: './'` (göreli) aynı derlemeyi alan adının kökünde de
alt klasörde de (GitHub Pages proje sitesi `kullanici.github.io/uygulama/`) çalıştırır; ama yalnız sayfa adresi hep
o klasörün kendisiyse. Hash yönlendirme bunu sağlar; history yönlendirme sağlamaz:

```js calistir
import assert from 'node:assert/strict'

const asset = (pageUrl, ref) => new URL(ref, pageUrl).pathname

// Hash yönlendirme + göreli taban: adres hep klasörün kendisi → doğru çözülür (kökte de alt klasörde de)
assert.equal(asset('https://ornek.github.io/uygulama/#/gorevler/42', './assets/index.js'), '/uygulama/assets/index.js')
assert.equal(asset('https://ornek.app/#/gorevler/42', './assets/index.js'), '/assets/index.js')

// History yönlendirme + göreli taban: derin adreste yenileyince varlık YANLIŞ klasörde aranır → beyaz sayfa
assert.equal(asset('https://ornek.app/gorevler/42', './assets/index.js'), '/gorevler/assets/index.js')
// History yönlendirmede mutlak taban gerekir: base: '/uygulama/'
assert.equal(asset('https://ornek.github.io/uygulama/gorevler/42', '/uygulama/assets/index.js'), '/uygulama/assets/index.js')
// Varsayılan "/" taban alt klasörde kökü arar → 404
assert.equal(asset('https://ornek.github.io/uygulama/', '/assets/index.js'), '/assets/index.js')
console.log('tamam')
```

| Yayın                                         | `base`              | Yönlendirme      | Ek iş                                              |
| --------------------------------------------- | ------------------- | ---------------- | -------------------------------------------------- |
| Herhangi bir durağan barındırıcı, kök ya da alt klasör | `'./'`      | `HashRouter`     | Manifest `start_url`/`scope`: `'./'` (uygulama, Köprü) |
| Alt klasör, temiz adresler                    | `'/uygulama/'`      | `BrowserRouter` + `basename` | Sunucuda bilinmeyen yol → `index.html`  |
| Kendi sunucusu, kök                           | `'/'`               | Her ikisi        | API ile aynı kökten sunulabilir                    |

Kodda `public/` dosyasına giden adres yazarken `'/icon.svg'` değil `import.meta.env.BASE_URL + 'icon.svg'` ya da
göreli yol kullanın; `index.html`'de göreli yazın (`./icon.svg`). Yayın yolları ve barındırma seçimi:
[`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md).

## Varlık işleme

| Varlık                                          | Nereye                         | Sonuç                                                  |
| ----------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| Kodda kullanılan görsel, ses, yazı tipi          | `src/` altına koyup `import`   | Adı özetlenir; uzun önbellek; küçükse koda gömülür     |
| Adı sabit kalması gereken dosya (`robots.txt`, manifest simgeleri, `.well-known`) | `public/` | Olduğu gibi kopyalanır, özet yok |
| Metin olarak içerik                             | `import x from './a.md?raw'`   | Dizgi olarak pakete girer                              |
| Yalnız adresi gereken                           | `import url from './a.png?url'` ya da `new URL('./a.png', import.meta.url)` | Özetli adres |
| Adı çalışma anında belli olan çok dosya         | `import.meta.glob('./simgeler/*.svg')` | Derlemenin görebileceği biçimde                  |

`build.assetsInlineLimit` varsayılanı 4096 bayttır (kaynakta `DEFAULT_ASSETS_INLINE_LIMIT = 4096` doğrulandı):
bundan küçük içe aktarılan dosya base64 olarak koda gömülür. Değişken içeren yol (`import(`./${ad}.js`)`) yalnız
derlemenin önceden görebileceği kalıplarda çalışır.

## Vekil (proxy)

`server.proxy` (ve `preview.proxy`) yalnız Vite'ın kendi sunucusunda vardır; derlenmiş `dist/` klasöründe vekil
yoktur. Geliştirmede `/api` istekleri API'ye aktarıldığı için "çalışıyor"; yayında aynı istek ya aynı kökte bir
API'ye gitmeli ya da başka köken için CORS ve kimlik ayarı (çerez yerine belirteç) gerekir. Uygulama temeli iki yolu
da destekler: API derlenmiş web'i aynı kökten sunar ([`static.ts`](../../uygulama/api/src/http/static.ts)) ya da
`VITE_API_URL` ile başka kökendeki API'ye belirteçle bağlanır.

## Derleme çıktısını okuma

- `vite build` her dosyanın ham ve gzip boyutunu yazar; ilk yüklenen giriş parçası ve CSS'e bakın. Uyarı sınırı
  `build.chunkSizeWarningLimit` ile ayarlanır (uygulama temelinde 900 KB); uyarıyı susturmak yerine nedenini anlayın
  ([web performansı](web-performansi.md)).
- `dist/assets/*-<özet>.js` adları içerik değişince değişir: bu dosyalar bir yıl önbellekte tutulabilir. `index.html`,
  `sw.js`, `manifest.webmanifest` ise **her açılışta tazelik sorulacak** biçimde (no-cache) sunulmalı; uygulama
  temelinin statik sunucusu böyle yapar.
- PWA derlemesinde `dist/sw.js` ve önbellek listesi oluşur; büyük dosyalar varsayılan boyut sınırını aşarsa önbellek
  listesine girmez (Köprü bu yüzden `maximumFileSizeToCacheInBytes`'ı yükseltmiştir).
- Kaynak haritası (`build.sourcemap`) yayına konursa kaynak kodunuz okunur; sır içermediği sürece bu bir tercih
  meselesidir. Hata izleme için haritayı yalnız izleme servisine yüklemek de bir seçenektir.
- Yayın öncesi derleme çıktısını sır kalıplarına karşı tarayın:

```js calistir
import assert from 'node:assert/strict'

// CI adımı: dist/ içindeki metin dosyalarında sır kalıbı ara. Kalıplar örnektir; projenize göre genişletin.
const PATTERNS = [
  { name: 'özel anahtar', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'AWS erişim anahtarı', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'gizli API anahtarı (sk-…)', re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'parolalı veritabanı adresi', re: /\b(?:postgres|mysql|mongodb)(?:\+srv)?:\/\/[^\s"':]+:[^\s"'@]+@/ },
]
function scanBundle(files) {
  return Object.entries(files).flatMap(([file, content]) =>
    PATTERNS.filter(({ re }) => re.test(content)).map(({ name }) => `${file}: ${name}`),
  )
}

const dist = {
  'assets/index-a1b2.js': 'const api="https://api.ornek.com";const k="sk-proj-AbCdEfGhIjKlMnOpQrStUv12";',
  'assets/vendor-c3d4.js': 'function x(){return 1}',
}
assert.deepEqual(scanBundle(dist), ['assets/index-a1b2.js: gizli API anahtarı (sk-…)'])
assert.deepEqual(scanBundle({ 'a.js': 'const db="postgres://kullanici:parola@db.ornek.com/app"' }), ['a.js: parolalı veritabanı adresi'])
console.log('tamam')
```

## Yayından sonra eski parça hatası

Yeni sürüm yayınlanınca eski sürümün özetli parçaları sunucudan kalkar. Eski sayfayı açık tutan kullanıcı tembel
yüklenen bir ekrana geçince "Failed to fetch dynamically imported module" alır. Sunucu eksik `.js` için
`index.html` döndürüyorsa hata daha da şaşırtıcıdır: "Expected a JavaScript module script but the server responded
with a MIME type of text/html" (uygulama temelinin statik sunucusu bu yüzden uzantılı eksik dosyaya 404 verir).
Vite bu durumda pencereye `vite:preloadError` olayı gönderir (8.3.8 kaynağında doğrulandı; olay engellenmezse hata
fırlatılır):

```js
// Gösterim (main.tsx): eski parça yüklenemezse bir kez yeniden yükle; döngüye girme.
window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem('parca-yenilendi')) return // ikinci kez: hatayı göster, yenileme döngüsü kurma
  sessionStorage.setItem('parca-yenilendi', '1')
  event.preventDefault()
  location.reload()
})
```

Servis çalışanı `prompt` kipindeyse eski parçalar kullanıcı güncellemeyi onaylayana dek önbellekten gelir; bu hata
çoğunlukla servis çalışanı olmayan ilk ziyaretlerde görülür ([PWA ve çevrimdışı](pwa-ve-cevrimdisi.md)).

## Tuzaklar

| Belirti                                                     | Neden                                                        | Çözüm                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Yayında beyaz sayfa, konsolda `assets/…` 404                | `base` yanlış (alt klasörde `/`)                             | `base: './'` + hash yönlendirme ya da doğru mutlak taban    |
| Derin adreste yenileyince beyaz sayfa                       | History yönlendirme + göreli taban ya da sunucu yedeği yok   | Hash yönlendirme ya da mutlak taban + sunucu kuralı         |
| Ortam değişkeni yayında `undefined`                         | Öneksiz ad ya da CI derlemesinde değişken verilmemiş         | `VITE_` önek; CI'da derleme adımına verin                   |
| Ortam değişkenini değiştirdim, yayında eski                 | Değer derlemede gömüldü                                      | Yeniden derleyin; çalışma anı ayarı için `config.json`      |
| `process is not defined`                                    | Tarayıcıda `process.env` yok                                 | `import.meta.env`; zorunluysa `define`                      |
| Geliştirmede API çalışıyor, yayında CORS hatası             | Vekil yalnız geliştirmede                                    | Aynı kökten sunma ya da CORS + belirteç                     |
| Yalnız CI'da "modül bulunamadı"                             | Dosya adı büyük/küçük harf farkı                             | İçe aktarmayı dosya adıyla birebir yazın                    |
| Görsel `public/`'te ama alt klasörde görünmüyor             | Kodda `/resim.png` mutlak yol                                | `BASE_URL` ya da `src/` içinden içe aktarma                 |
| Yayından sonra açık sekmede ekran açılmıyor                 | Eski parça silindi                                           | `vite:preloadError` ile bir kez yenileme                    |
| API anahtarı paketten okunmuş                               | `VITE_` önekli sır                                           | Anahtarı iptal edin; sunucu vekili                          |

## Denetim listesi

- [ ] `npm run build` uyarısız ve `preview` ile 390/360 px'te, uçak modunda denendi.
- [ ] `base`, yönlendirme kipi ve manifest `start_url`/`scope` birbiriyle uyumlu; alt klasörde de denendi.
- [ ] Her `VITE_` değişkeni açık bilgi; tipi `vite-env.d.ts`'te, okunuşu ve doğrulaması tek dosyada; `.env.example` güncel.
- [ ] Derleme çıktısı sır kalıplarına karşı tarandı.
- [ ] `index.html`, `sw.js`, manifest no-cache; özetli varlıklar uzun önbellekli sunuluyor.
- [ ] `vite:preloadError` (ya da eşdeğeri) ele alınıyor.
- [ ] İlk yüklenen JS/CSS boyutu bütçe içinde.

## Küçük modele yaptırırken

- **İsteme yazın:** "`vite.config.ts`'teki `base: './'` ve `HashRouter`'ı değiştirme. Yeni ortam değişkeni gerekiyorsa
  `VITE_` önekli, yalnız açık bilgi olsun; tipini `vite-env.d.ts`'e, okunuşunu `lib/env.ts`'e yaz. Sır, anahtar,
  parola ön yüze girmez. İşi bitirince `npm run build` ve `preview` ile dene, çıktıdaki boyutları yaz."
- **Modelin tipik hatası:** API anahtarını `VITE_` değişkenine koyar; `process.env` kullanır; yayın sorunu için
  `base`'i `'/'` yapar ve alt klasörü bozar; vekili üretimde de çalışır sanır; Vite/Rolldown seçeneklerini eski
  sürümden ezbere yazar.
- **Çıktıda arayın:** `process.env` (istemci kodunda), `VITE_.*(KEY|SECRET|TOKEN)`, `base:` değişiklikleri, mutlak
  `'/…'` varlık yolları, `vite.config.ts`'te belgelenmemiş seçenekler (kurulu sürümün tiplerinde var mı?).
- **Doğrulama isteyin:** `npm run build` çıktısı + `preview` adresinde uçak modunda ekran görüntüsü.

## İlgili

- [PWA ve çevrimdışı](pwa-ve-cevrimdisi.md) — servis çalışanı, güncelleme
- [Yönlendirme ve URL](yonlendirme-ve-url.md) — hash ↔ history
- [Ön yüz güvenliği](onyuz-guvenligi.md) — istemciye sır koymamak
- [Web performansı](web-performansi.md) — paket boyutu, kod bölme
- Çalışan örnek: [`vite.config.ts`](../../uygulama/web/vite.config.ts) (göreli taban, PWA, vekil, ayrı çıktı klasörü)
- Başka kümelerde: [Yayın yolu seçimi](../60-devops/yayin-yolu-secimi.md), [CI/CD](../60-devops/ci-cd.md), [Yapılandırma ve sırlar](../30-arkauc/yapilandirma-ve-sirlar.md), [Sır yönetimi](../50-guvenlik/sir-yonetimi.md)
