---
baslik: Ön yüz güvenliği
ozet: XSS türleri ve React'in korumadığı yerler, güvenli bağlantı denetimi, içerik güvenlik politikası, üçüncü taraf betik riski, belirtecin nerede saklanacağı, tıklama kaçırma, target=_blank ve istemciye sır koymamak.
etiketler: [guvenlik, xss, csp, belirtec, react, onyuz]
duzey: ileri
guncellik: 2026-11
---

# Ön yüz güvenliği

> Bu notu ne zaman okumalı: kullanıcıdan gelen metni, bağlantıyı ya da HTML'i ekranda gösterirken; oturum belirtecini
> saklarken; üçüncü taraf betik (analitik, sohbet, reklam) eklemeden önce; yayın başlıklarını (CSP) ayarlarken; bir API
> anahtarını ön yüz koduna koymak aklınıza geldiğinde.

## Temel fikir

Tarayıcıdaki her şey kullanıcının ve sayfada çalışan **her betiğin** denetimindedir. Bu yüzden ön yüz güvenliğinin
dört kuralı vardır:

1. **Güvenilmeyen veri koda dönüşmesin** (XSS). Kullanıcı metni metin olarak, bağlantı izin listesinden geçerek,
   HTML ancak temizlenerek gösterilir.
2. **Sayfada çalışabilecek kodu sınırlayın** (CSP, az bağımlılık, üçüncü taraf betik yok).
3. **İstemciye sır koymayın.** Derlenmiş pakete giren her şey herkese açıktır.
4. **Yetki sunucunun işidir.** Ön yüzdeki "yönetici değilse düğmeyi gizle" yalnız görünümdür; sunucu her istekte
   yeniden denetler.

XSS bir kez olursa öteki önlemlerin çoğu boşa çıkar: saldırganın betiği sizin sayfanızda, sizin kullanıcınız olarak
istek atar. `HttpOnly` çerez belirtecin **çalınmasını** önler, sayfa açıkken **kötüye kullanılmasını** önlemez.

Havuzdaki uygulama temelinin güvenlik tasarımı ayrıntılı yazılıdır: [`GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md);
yayın başlıkları: [`securityHeaders.ts`](../../uygulama/api/src/http/securityHeaders.ts).

## XSS türleri

| Tür                       | Nasıl olur                                                        | SPA'da tipik yer                                    |
| ------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| Saklanan (stored)         | Kötü içerik veritabanına yazılır, herkese gösterilir              | Görev başlığı, yorum, profil adı HTML olarak basılır |
| Yansıtılan (reflected)    | Adresteki parametre sayfaya kaçışsız basılır                      | Sunucu tarafı şablonlar; SPA'da daha az             |
| DOM tabanlı               | İstemci kodu adres/`postMessage`/depolamadan aldığını DOM'a yazar | `innerHTML`, `location = …`, `?next=` yönlendirmesi |

## React'in korumadığı yerler

React, JSX içindeki metni kendisi kaçışlar (`{user.name}` güvenlidir). Koruma şu noktalarda biter:

| Yer                                                   | Risk                                                        | Güvenli yol                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `dangerouslySetInnerHTML`                             | Verilen HTML olduğu gibi girer; `<img onerror=…>` çalışır (19.3'te denendi: öznitelik aynen yerleşti) | Kullanmayın; zorunluysa sıkı ayarlı bir temizleyiciden (DOMPurify gibi) geçirin |
| `href`/`src` içinde kullanıcı adresi                  | React 19 `javascript:` adreslerini engeller (denendi: büyük-küçük harf ve sekme karışık yazımda da) ama `data:` adresini **engellemez** | İzin listesi: yalnız `http`, `https`, `mailto`, `tel` (aşağıda) |
| `window.location = x`, `window.open(x)`, `navigate(x)` | React'in denetimi dışında                                   | Aynı izin listesi; yönlendirmede yalnız uygulama içi yol           |
| React dışı DOM (`el.innerHTML`, eski kütüphane)       | Hiç kaçış yok                                               | `textContent`; ya da kaçış işlevi                                  |
| Markdown gösterimi                                    | Ham HTML açık bırakılırsa XSS                               | Ham HTML kapalı + bağlantılar izin listesinden                     |
| Kullanıcının yüklediği SVG                            | `<object>`/satır içi SVG'de betik çalışır                   | `<img src>` olarak gösterin (betik çalışmaz) ya da rasterleştirin  |
| `eval`, `new Function`, dizgili `setTimeout`          | Metin kod olur                                              | Kullanmayın; CSP'de `unsafe-eval` olmasın                          |
| `postMessage` alıcısı                                 | Her köken ileti atabilir                                    | `event.origin` tam eşleşmeyle denetlenir (aşağıda)                 |

```js calistir
import assert from 'node:assert/strict'

// Kullanıcı bağlantısını href'e koymadan önce: izin listesi (allowlist), kara liste değil.
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
function safeHref(input, base = 'https://uygulama.ornek.com') {
  let url
  try { url = new URL(input, base) } catch { return null }
  return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null
}

assert.equal(safeHref('https://ornek.com/a?b=1'), 'https://ornek.com/a?b=1')
assert.equal(safeHref('/ayarlar'), 'https://uygulama.ornek.com/ayarlar')
assert.equal(safeHref('mailto:ayse@ornek.com'), 'mailto:ayse@ornek.com')
assert.equal(safeHref('javascript:alert(1)'), null)
assert.equal(safeHref('  JaVaScRiPt:alert(1)'), null)
assert.equal(safeHref('java\tscript:alert(1)'), null) // ayrıştırıcı sekmeyi siler → "javascript:"
assert.equal(safeHref('data:text/html,<script>alert(1)</script>'), null)

// YANLIŞ: kara liste düzenli ifadesi sekmeli yazımı kaçırır
const naive = (s) => (/^javascript:/i.test(s.trim()) ? null : s)
assert.equal(naive('java\tscript:alert(1)'), 'java\tscript:alert(1)') // geçti!
console.log('tamam')
```

```cikti
tamam
```

React dışında HTML dizgisi kuruyorsanız (e-posta şablonu, dışa aktarılan HTML rapor, `innerHTML`) kaçış işlevi
kullanın; ama kaçışın **bağlama göre** olduğunu unutmayın:

```js calistir
import assert from 'node:assert/strict'

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch])

const name = '<img src=x onerror="alert(1)">'
assert.equal(`<p>Merhaba ${escapeHtml(name)}</p>`, '<p>Merhaba &lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>')
// Tırnaksız öznitelikte kaçış YETMEZ: boşluk yeni öznitelik açar, kaçışlanacak karakter yok
assert.equal(escapeHtml('x onmouseover=alert(1)'), 'x onmouseover=alert(1)') // <a title=${…}> yazmayın; tırnak şart
// Kaçış bağlantıyı güvenli YAPMAZ
assert.equal(escapeHtml('javascript:alert(1)'), 'javascript:alert(1)')
console.log('tamam')
```

## İçerik güvenlik politikası (CSP)

CSP, sayfanın hangi kaynaktan betik, stil, görsel yükleyebileceğini ve nereye bağlanabileceğini tarayıcıya söyleyen
başlıktır. XSS'i önlemez; olursa **zararını** sınırlar (dışarıdan betik yükleyemez, veriyi başka sunucuya gönderemez).

```js calistir
import assert from 'node:assert/strict'

// Tek sayfalık uygulama için başlangıç politikası: kendi kökeni + API.
const policy = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'", 'https://api.ornek.com'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"], // tıklama kaçırmaya karşı; <meta> ile VERİLEMEZ, başlık olmalı
}
const serialize = (p) => Object.entries(p).map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
function weaknesses(p) {
  const problems = []
  for (const [name, sources] of Object.entries(p)) {
    if (sources.includes("'unsafe-eval'")) problems.push(`${name}: 'unsafe-eval'`)
    if (name === 'script-src' && sources.includes("'unsafe-inline'")) problems.push("script-src: 'unsafe-inline'")
    if (sources.includes('*') || sources.includes('https:')) problems.push(`${name}: her kökene açık`)
  }
  if (!p['object-src']) problems.push('object-src yok')
  return problems
}

assert.match(serialize(policy), /^default-src 'self'; script-src 'self'; /)
assert.deepEqual(weaknesses(policy), [])
assert.deepEqual(weaknesses({ ...policy, 'script-src': ["'self'", "'unsafe-inline'", 'https:'] }), [
  "script-src: 'unsafe-inline'",
  'script-src: her kökene açık',
])
console.log('tamam')
```

| Konu                                  | Bilmeniz gereken                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| Önce deneme                           | `Content-Security-Policy-Report-Only` ile bir süre yalnız raporlayın, sonra uygulayın |
| Geliştirme sunucusu                   | Vite geliştirmede satır içi betik kullanır; CSP'yi yalnız üretim yayınına koyun |
| Satır içi betik/stil                  | Sıkı CSP satır içi `<script>`'i engeller: servis çalışanı kaydı ayrı dosyayla yapılmalı (uygulama temeli `injectRegister: false` + modül içi kayıt kullanır) |
| React `style={{…}}`                   | İstemcide DOM üzerinden yazılır; `style-src 'self'` ile çalışır. Çalışma anında `<style>` ekleyen kütüphaneler ise `'unsafe-inline'` ister: seçmeden önce düşünün |
| Durağan barındırma (GitHub Pages)     | Başlık ayarlanamaz; yalnız `<meta http-equiv>` CSP verilebilir, `frame-ancestors` ve raporlama `<meta>`'da çalışmaz |
| Başka kökendeki API                   | `connect-src`'ye tam köken yazın, `https:` değil                                |

## Üçüncü taraf betik riski

Sayfaya eklenen her dış betik (analitik, sohbet balonu, reklam, "paylaş" düğmesi) sayfanızla **aynı yetkidedir**:
DOM'u okur, girilen şifreyi görür, depolamadaki belirteci alır, sizin adınıza istek atar. O betiğin sunucusu ele
geçirilirse sizin sayfanız da ele geçmiş olur.

- Varsayılan cevap "eklemeyin"dir; sahibin ürün ilkesi de reklamsız ve verinin telefonda kalmasıdır (Köprü ilke 9).
- Zorunluysa: sürümü sabit dosyayı kendi sunucunuzdan verin; CDN'den yüklüyorsanız `integrity` (SRI) + `crossorigin`.
- npm bağımlılıkları da üçüncü taraf koddur: kilit dosyası, `npm ci`, yeni bağımlılık için gerekçe (`KARARLAR.md`),
  az bağımlılık.
- Ödeme gibi hassas alanları üçüncü tarafın kendi çerçevesinde (iframe) barındırması, onları sayfanıza betikle
  eklemekten güvenlidir.

## Belirteci nerede saklamalı

| Yer                                              | XSS olursa                                  | CSRF riski                       | Ne zaman                                         |
| ------------------------------------------------ | ------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| `HttpOnly; Secure; SameSite` çerez               | Okunamaz (ama sayfa açıkken kullanılabilir) | Var: `SameSite` + köken denetimi | API aynı kökende (varsayılan seçim)              |
| localStorage / IndexedDB                         | Okunur ve çalınır                           | Yok (başlıkla gönderilir)        | API başka kökende ve çerez kullanılamıyorsa      |
| Yalnız bellekte (değişken)                       | Sayfa açıkken okunur                        | Yok                              | Kısa ömürlü erişim belirteci; yenileme çerezle   |

Uygulama temeli iki kipi de destekler ve ödünleşimi açıkça yazar: aynı kökende `HttpOnly` çerez, başka kökende
IndexedDB'de belirteç (`lib/session/store.ts` başlık yorumu; [`env.ts`](../../uygulama/web/src/lib/env.ts)).
Hangisi olursa olsun: çıkışta yerel belirteç ve kullanıcı verisi silinir, sunucu oturumu iptal edilir.

## Tıklama kaçırma, `target=_blank`, Referer

- **Tıklama kaçırma (clickjacking):** saldırgan sayfanızı görünmez bir çerçeveye koyup kullanıcıya tıklatır.
  Önlem: `Content-Security-Policy: frame-ancestors 'none'` (eski tarayıcılar için `X-Frame-Options: DENY`). Başlık
  gerektirir.
- **`target="_blank"`:** güncel tarayıcılar yeni sekmeye `noopener` davranışını varsayılan verir; yine de kullanıcı
  kaynaklı bağlantılarda `rel="noopener noreferrer"` yazın (eski tarayıcı + Referer sızıntısı).
- **Referer sızıntısı:** adreste belirteç taşıyan sayfalar (davet, şifre sıfırlama bağlantısı) dış bir bağlantıya
  tıklanınca adresi `Referer` başlığıyla sızdırır. `Referrer-Policy: no-referrer` (uygulama temelinde var) ya da en
  azından `strict-origin-when-cross-origin`; belirteci sayfa açılınca adresten silin (`history.replaceState`).

## Gizli bilgiyi istemciye koymayın

| Yanlış                                                        | Neden                                                 | Doğru                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `VITE_OPENAI_KEY=…` ile ücretli API anahtarı                  | `VITE_` önekli her değer pakete gömülür, herkes okur  | Anahtar sunucuda; ön yüz kendi sunucunuza konuşur (havuzda `yz` temelinin vekil sunucusu: [`vekil.py`](../../yz/yz/sunucu/vekil.py)) |
| Kaynak haritası (source map) yayında ve içinde yorumlu sırlar | Haritalar kaynağı olduğu gibi gösterir                | Kodda sır yok; haritayı yayınlamak bilinçli karar      |
| "Gizlemek" için kodu karıştırmak (obfuscation)                | Güvenlik değil, yalnız yavaşlatır                     | Sır sunucuda                                           |
| Ön yüzde rol denetimi (`if (user.isAdmin)`) ile koruma        | İstek elle atılabilir                                 | Sunucu her uçta yetki denetler; ön yüz yalnız gösterim |
| Fiyat, indirim, puan ön yüzde hesaplanıp sunucuya gönderiliyor | Kullanıcı değeri değiştirir                          | Sunucu yeniden hesaplar                                |

Yayınlanabilir (publishable) anahtarlar (harita, ödeme ön yüzü) istemcide durabilir; onları da alan adıyla
kısıtlayın. Paketi yayından önce sır kalıplarına karşı tarayın: [Vite ve derleme](vite-ve-derleme.md).

## `postMessage`

```js calistir
import assert from 'node:assert/strict'

// İleti alırken köken TAM eşleşmeyle denetlenir.
const ALLOWED = new Set(['https://odeme.ornek.com'])
const trusted = (event) => ALLOWED.has(event.origin)
const naive = (event) => event.origin.endsWith('ornek.com') // YANLIŞ

assert.equal(trusted({ origin: 'https://odeme.ornek.com' }), true)
assert.equal(trusted({ origin: 'https://kotuornek.com' }), false)
assert.equal(naive({ origin: 'https://kotuornek.com' }), true) // saldırgan "kotuornek.com" alan adını alır
assert.equal(naive({ origin: 'http://odeme.ornek.com' }), true) // şifresiz http de geçti
console.log('tamam')
```

Gönderirken de hedef kökeni yazın: `win.postMessage(veri, 'https://odeme.ornek.com')`, asla `'*'`. Gelen veriyi
şemayla doğrulayın.

## Tuzaklar

| Belirti                                                     | Neden                                                    | Çözüm                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Kullanıcı adında `<b>` yazınca ekranda kalın görünüyor      | Metin HTML olarak basılmış (`dangerouslySetInnerHTML`, `innerHTML`) | Metin olarak gösterin                            |
| Profil "web sitesi" bağlantısı tıklanınca betik çalışıyor   | Kullanıcı adresi doğrudan `href`/`window.open`'a gitmiş  | İzin listeli `safeHref`                                     |
| Girişten sonra başka siteye yönlendirme                     | `?next=` doğrulanmamış (açık yönlendirme)                | Yalnız uygulama içi yol (bkz. [yönlendirme](yonlendirme-ve-url.md)) |
| Ücretli API faturası bir gecede şişti                       | Anahtar ön yüz paketinde                                 | Anahtarı iptal edin; sunucu vekili                          |
| CSP açınca uygulama beyaz sayfa                             | Satır içi betik/stil ya da dış kaynak                    | Report-Only ile deneyin; satır içi kodu dosyaya taşıyın     |
| GitHub Pages'te `frame-ancestors` işe yaramıyor             | `<meta>` CSP bu yönergeyi desteklemez                    | Başlık ayarlanabilen barındırma                              |
| Davet bağlantısının belirteci analitik sunucusunda görünüyor | Referer ya da üçüncü taraf betik adresi okuyor           | `no-referrer`; adresten belirteci silin; dış betik yok      |
| Ön yüzde gizlenen yönetici düğmesine rağmen veri siliniyor  | Yetki yalnız ön yüzde                                    | Sunucu yetki denetimi                                       |

## Denetim listesi

- [ ] Kodda `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` yok; varsa her birinin yanında temizleyici ve gerekçe var.
- [ ] Kullanıcıdan gelen her adres izin listesinden geçiyor (`href`, `src`, `window.open`, yönlendirme).
- [ ] Üretim yayınında CSP, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` başlıkları var.
- [ ] Pakette sır yok: `VITE_` değişkenleri yalnız açık bilgiler; derleme çıktısı sır kalıplarına karşı tarandı.
- [ ] Üçüncü taraf betik yok; varsa gerekçesi yazılı ve SRI/kendi sunucusu kullanılıyor.
- [ ] Belirteç saklama kipi ve ödünleşimi `KARARLAR.md`'de yazılı; çıkışta yerel belirteç siliniyor.
- [ ] `postMessage` alıcıları kökeni tam eşleşmeyle denetliyor.
- [ ] Yetki gerektiren her işlem sunucuda da denetleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kullanıcı metnini yalnız JSX içinde metin olarak göster; `dangerouslySetInnerHTML` ve `innerHTML`
  kullanma. Kullanıcıdan gelen adresi `safeHref`'ten geçir. API anahtarını ön yüze koyma; `VITE_` değişkenine sır
  yazma. Yeni dış betik ya da CDN ekleme."
- **Modelin tipik hatası:** Zengin metin göstermek için `dangerouslySetInnerHTML` kullanır; `?next=`'i doğrudan
  yönlendirmede kullanır; "çalışsın diye" API anahtarını `.env`'e `VITE_` önekiyle koyar; CSP hatasını
  `'unsafe-inline'`/`'unsafe-eval'` ekleyerek "çözer".
- **Çıktıda arayın:** `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `window.open(`, `location.href =`, `VITE_.*KEY`,
  `VITE_.*SECRET`, `'unsafe-`, `postMessage(` ile `'*'`, `target="_blank"` olup `rel` olmayan bağlantılar.
- **Test isteyin:** `safeHref` için `javascript:`, sekmeli yazım ve `data:` vakalarını içeren birim testi.

## İlgili

- [Yönlendirme ve URL](yonlendirme-ve-url.md) — açık yönlendirme ve güvenli `next`
- [Vite ve derleme](vite-ve-derleme.md) — ortam değişkenleri ve pakete sızan sırlar
- [Tarayıcı API'leri](tarayici-apileri.md) — depolama seçenekleri
- Uygulama temelinde: [`GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) (oturum, CSRF, CORS, başlıklar),
  [`afterLogin.ts`](../../uygulama/web/src/features/auth/afterLogin.ts) (`safeNext`)
- Başka kümelerde: [XSS ve CSP](../50-guvenlik/xss-ve-csp.md), [CSRF ve CORS](../50-guvenlik/csrf-ve-cors.md), [Oturum güvenliği](../50-guvenlik/oturum-guvenligi.md), [Yapılandırma ve sırlar](../30-arkauc/yapilandirma-ve-sirlar.md), [Sır yönetimi](../50-guvenlik/sir-yonetimi.md)
