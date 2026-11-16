---
baslik: XSS ve içerik güvenlik politikası (CSP)
ozet: Saklanan, yansıyan ve DOM tabanlı XSS; HTML gövdesi, öznitelik, URL ve betik bağlamında doğru kaçış (çalışan örnekler), javascript: adresleri, CSP kurma adımları ve temizleyici seçimi.
etiketler: [guvenlik, xss, csp, html, kacis, tarayici]
duzey: orta
guncellik: 2026-11
---

# XSS ve içerik güvenlik politikası (CSP)

> Bu notu ne zaman okumalı: kullanıcının yazdığı bir metin (ad, yorum, başlık, dosya adı, model çıktısı) sayfaya,
> e-postaya ya da PDF'e basılırken; `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `|safe` görüldüğünde;
> kullanıcıdan alınan bir adres `href`/`src`'ye konurken; CSP başlığı eklenirken.

## Temel fikir

XSS (siteler arası betik, cross-site scripting), güvenilmeyen verinin tarayıcıda **kod** olarak yorumlanmasıdır.
Çalışan betik kullanıcının oturumuyla her şeyi yapabilir: verisini okur, onun adına istek atar, sayfayı sahte giriş
formuna çevirir. `HttpOnly` çerez çalınmasını önler, kullanıcı adına işlem yapılmasını önlemez.

| Tür      | Veri nerede durur                                    | Örnek                                               |
| -------- | ---------------------------------------------------- | --------------------------------------------------- |
| Saklanan | Veritabanında; her açan etkilenir                    | Görev başlığına yazılmış etiket                     |
| Yansıyan | İstekte; yanıt onu geri basar                        | Arama sayfası "`<q>` için sonuç yok" yazıyor        |
| DOM      | Hiç sunucuya gitmez; sayfadaki betik kendisi yazar   | `el.innerHTML = location.hash.slice(1)`             |

Savunma iki kattır: (1) **çıktıda bağlama göre kaçış**, mümkünse çerçevenin kendiliğinden kaçışıyla;
(2) **CSP**, ilk kat bir yerde unutulduğunda betiğin çalışmasını engeller. Girdide "tehlikeli etiketleri silmek"
savunma değildir: veriyi bozar ve başka bağlamları kaçırır. Veriyi olduğu gibi saklayın, **basarken** kaçışlayın.

## Karar tablosu: bağlama göre kaçış

| Değer nereye basılıyor                        | Doğru yol                                                                 | Yanlış                                         |
| --------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| HTML gövdesi (`<p>…</p>`)                     | HTML kaçışı: `& < > " '`; çerçevede düz metin bağlama (JSX `{x}`)         | `innerHTML`, `|safe`, `v-html`                 |
| Öznitelik değeri (`title="…"`)                | Değeri **tırnak içinde** + tırnakları da kaçışlayan HTML kaçışı           | Tırnaksız öznitelik; `quote=False`             |
| Adres (`href`, `src`, `action`)               | URL ayrıştırıcıyla şema izin listesi (`http`, `https`, `mailto`), sonra öznitelik kaçışı | `startsWith('javascript:')` kara listesi |
| Adres içindeki parametre (`?q=…`)             | `encodeURIComponent` / `urllib.parse.quote`, sonra öznitelik kaçışı        | Ham birleştirme                                |
| `<script>` içine veri                         | JSON + `<`, `>`, `&`, U+2028/9 kaçışı; daha iyisi `data-` özniteliği      | `JSON.stringify` olduğu gibi                   |
| Olay özniteliği (`onclick`), `style`, CSS     | Kullanıcı verisi hiç girmez                                               | "Kaçışladım" sanmak                            |
| Kullanıcının HTML'i gerçekten gerekiyor       | Bakımı süren bir temizleyici + CSP                                        | Kendi düzenli ifade temizleyiciniz             |

## HTML gövdesi ve öznitelik

```python calistir
import html

# Gövde: html.escape yeter
govde = "<img src=x onerror=alert(1)>"
assert html.escape(govde) == "&lt;img src=x onerror=alert(1)&gt;"

# YANLIŞ 1: öznitelikte tırnak kaçışı kapalı → değer tırnağı kapatır, yeni öznitelik başlar
ad = '" onmouseover="alert(1)'
assert f'<input value="{html.escape(ad, quote=False)}">' == '<input value="" onmouseover="alert(1)">'
# YANLIŞ 2: tırnaksız öznitelik → boşluk yeni öznitelik başlatır, kaçış işe yaramaz
deger = "x onmouseover=alert(1)"
assert f"<input value={html.escape(deger)}>" == "<input value=x onmouseover=alert(1)>"
# DOĞRU: tırnak içinde + tam kaçış (quote=True varsayılandır)
assert f'<input value="{html.escape(ad)}">' == '<input value="&quot; onmouseover=&quot;alert(1)">'
assert '"' not in html.escape(ad)  # TEST: değer tırnaktan çıkamaz
print("tamam")
```

```cikti
tamam
```

Sunucuda HTML üreten Node kodunda (e-posta, basit sayfa) kaçışı **varsayılan** yapan küçük bir etiketli şablon,
"kaçışlamayı unutma" hatasını yapısal olarak kapatır:

```js calistir
import assert from 'node:assert/strict'

const KARSILIK = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const kacis = (deger) => String(deger).replace(/[&<>"']/g, (c) => KARSILIK[c])

class GuvenliHtml {
  constructor(metin) {
    this.metin = metin
  }
  toString() {
    return this.metin
  }
}

// Her ${…} kaçışlanır; yalnız html`` ile üretilmiş parça olduğu gibi girer
function html(parcalar, ...degerler) {
  let sonuc = parcalar[0]
  degerler.forEach((d, i) => {
    sonuc += (d instanceof GuvenliHtml ? d.metin : kacis(d)) + parcalar[i + 1]
  })
  return new GuvenliHtml(sonuc)
}

const ad = '<script>alert(1)</script>'
const kart = html`<p title="${ad}">Merhaba ${ad}</p>`
assert.equal(String(kart), '<p title="&lt;script&gt;alert(1)&lt;/script&gt;">Merhaba &lt;script&gt;alert(1)&lt;/script&gt;</p>')
assert.equal(String(html`<div>${kart}</div>`).startsWith('<div><p title='), true) // iç içe güvenli parça
console.log('tamam')
```

```cikti
tamam
```

Havuzdaki e-posta şablonları her değeri tek tek kaçışlar:
[`uygulama/api/src/mail/templates.ts`](../../uygulama/api/src/mail/templates.ts) → `escapeHtml`.

## Adresler ve `javascript:`

Neden açık: `<a href="javascript:…">` tıklanınca betik çalışır. HTML kaçışı bunu engellemez (içinde kaçışlanacak
karakter yoktur). Tarayıcı şemayı büyük/küçük harf duyarsız okur, baştaki boşluğu ve aradaki sekmeyi atar; bu
yüzden dizge karşılaştırması tutmaz. Adresi **tarayıcının kullandığı ayrıştırıcıyla** (WHATWG URL) çözüp şemaya
izin listesiyle bakın:

```js calistir
import assert from 'node:assert/strict'

// YANLIŞ: kara liste
const hrefYanlis = (girdi) => (girdi.startsWith('javascript:') ? null : girdi)

// DOĞRU: ayrıştır, şemaya izin listesiyle bak
const IZINLI_SEMALAR = new Set(['http:', 'https:', 'mailto:'])
function guvenliHref(girdi, taban = 'https://site.example/') {
  let adres
  try {
    adres = new URL(girdi, taban)
  } catch {
    return null
  }
  return IZINLI_SEMALAR.has(adres.protocol) ? adres.href : null
}

// TEST: tarayıcının "javascript:" saydığı yazılışlar
for (const kotu of [' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<b>x</b>']) {
  assert.notEqual(hrefYanlis(kotu), null) // kara liste geçirdi
  assert.equal(guvenliHref(kotu), null)
}
assert.equal(guvenliHref('/profil'), 'https://site.example/profil')
assert.equal(guvenliHref('https://ornek.com/a?b=1'), 'https://ornek.com/a?b=1')
console.log('tamam')
```

```cikti
tamam
```

- Denetimi **ham** değerde yapın, sonra öznitelik kaçışı uygulayın. Kaçışlanmamış değerde HTML varlıkları
  (`&#58;` → `:`) tarayıcıda çözülür ve denetiminizin görmediği bir şema oluşur.
- Python'da aynı denetim: `urllib.parse.urlsplit(girdi).scheme` (Python 3.13'te baştaki boşluğu ve sekmeyi
  tarayıcı gibi atar; eski sürümlerde atmayabilir — sürümünüzde sınayın).
- React `href={kullaniciAdresi}` için de geçerlidir; çerçevenin uyarısına güvenmeyin, şemayı siz denetleyin.
- Kullanıcıyı başka adrese **yönlendiren** parametreler ayrı konudur: [OWASP özeti → açık yönlendirme](owasp-ozet.md).

## `<script>` içine veri

Sunucuda üretilen sayfaya başlangıç verisi gömülürken (`window.__DURUM__ = …`) JSON tek başına güvenli değildir:
HTML ayrıştırıcı betiği ilk `</script>` görünce kapatır.

```python calistir
import json

durum = {"baslik": "</script><script>alert(1)</script>", "not": "satır ayırıcı"}

# YANLIŞ: JSON geçerli ama HTML ayrıştırıcısı için betik burada bitiyor
assert "</script>" in json.dumps(durum)


# DOĞRU: <, >, & ve U+2028/2029 JSON kaçışıyla yazılır; JSON anlamı değişmez
def betik_icin_json(veri: object) -> str:
    metin = json.dumps(veri, ensure_ascii=False)
    for karakter, kacis in (("&", "\\u0026"), ("<", "\\u003c"), (">", "\\u003e"), (" ", "\\u2028"), (" ", "\\u2029")):
        metin = metin.replace(karakter, kacis)
    return metin


gomulu = betik_icin_json(durum)
assert "<" not in gomulu and json.loads(gomulu) == durum  # TEST: kapanış etiketi yok, veri aynı
print("tamam")
```

```cikti
tamam
```

Daha basit yol: veriyi `<script type="application/json" id="durum">` içine (yine kaçışlı) ya da bir `data-`
özniteliğine (öznitelik kaçışıyla) koyup betikte `JSON.parse` ile okumak; böylece CSP'de satır içi betik de
gerekmez.

## DOM XSS: kaynaklar ve havuzlar

| Kaynak (saldırganın yazabildiği)                                             | Havuz (kod olarak yorumlayan)                                                      | Güvenli karşılık                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| `location.hash`, `location.search`, `document.referrer`, `postMessage` verisi | `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`                   | `textContent`, `createElement` + `append`        |
| API yanıtı, `localStorage`, model çıktısı                                    | `eval`, `setTimeout("metin")`, `new Function`                                      | Fonksiyon geçin; metinden kod üretmeyin          |
| URL parametresinden gelen adres                                              | `a.href = …`, `iframe.src = …`, `location = …`                                     | Şema izin listesi (yukarıda)                     |
| Her şey                                                                      | React `dangerouslySetInnerHTML`, Vue `v-html`, Svelte `{@html}`, jQuery `$(metin)` | Düz bağlama; gerekiyorsa temizleyici             |

`postMessage` dinleyicisi `event.origin`'i izin listesine göre denetlemeden veriyi kullanmamalıdır.

## Kullanıcının HTML'i gerekiyorsa

- **Önce gerekip gerekmediğini sorun.** Çoğu zaman kalın, liste ve bağlantı yeter: metni önce **tamamen**
  kaçışlayın, sonra bilinen küçük bir sözdizimini etikete çevirin:

```python calistir
import html
import re


def mini_bicim(metin: str) -> str:
    guvenli = html.escape(metin)  # 1) her şey kaçışlanır
    guvenli = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", guvenli)  # 2) yalnız bilinen biçim etikete döner
    return guvenli.replace("\n", "<br>")


assert mini_bicim("**Toplantı** saat 3'te\n<script>x</script>") == (
    "<strong>Toplantı</strong> saat 3&#x27;te<br>&lt;script&gt;x&lt;/script&gt;"
)
print("tamam")
```

```cikti
tamam
```

- Zengin metin şartsa bakımı süren bir temizleyici kullanın: tarayıcıda DOMPurify, Python'da nh3 gibi (adlar
  ve bakım durumu doğrulanmadı; kurmadan önce bakın). Temizleyici izin listesiyle çalışır: izinli etiketler ve
  öznitelikler; `href` için şema denetimi; `style`, `on*`, `<svg>`, `<iframe>`, `<form>` kapalı.
- Markdown işleyicisinde ham HTML'i kapatın; işleyicinin ürettiği HTML'i de temizleyiciden geçirin.
- Temizlenmiş HTML'i bir kez daha işlemeyin (ör. temizledikten sonra metin değiştirme): temizleyicinin gördüğü
  ile tarayıcının gördüğü farklılaşır.

## İçerik güvenlik politikası (CSP) kurma adımları

1. **Envanter:** sayfanın yüklediği betik, stil, görsel, yazı tipi ve bağlantı kökenlerini çıkarın (geliştirici
   araçları → Ağ).
2. **Satır içini temizleyin:** satır içi `<script>` ve `<style>`'ı dosyaya taşıyın; `onclick=` gibi olay
   özniteliklerini ve `javascript:` bağlantılarını kaldırın.
3. **Rapor kipi:** politikayı önce `Content-Security-Policy-Report-Only` başlığıyla yayınlayın; ihlalleri konsoldan
   ya da rapor ucundan toplayın.
4. **Uygulama kipi:** ihlal kalmayınca aynı politikayı `Content-Security-Policy` olarak yayınlayın.
5. **Kaçınılmaz satır içi:** içerik sabitse **karma** (hash), sunucu her yanıtta üretiyorsa **tek kullanımlık
   rastgele değer** (nonce; her yanıtta yeni, en az 128 bit). Dinamik betik yükleyen uygulamada nonce +
   `'strict-dynamic'`.
6. **Test:** uçtan uca testte başlığın varlığını ve konsolda CSP ihlali olmadığını denetleyin.

Tek sayfalık uygulama için başlangıç (havuzdaki `WEB_CSP` ile aynı çizgi):

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Satır içi sabit bir betiğin (ör. sayfa boyanmadan önce temayı seçen betik) karması şöyle hesaplanır; betikte tek
boşluk değişse karma değişir, bu yüzden hesabı derleme adımına koyun:

```python calistir
import base64
import hashlib


def csp_karmasi(betik: str) -> str:
    return "'sha256-" + base64.b64encode(hashlib.sha256(betik.encode("utf-8")).digest()).decode() + "'"


betik = "document.documentElement.dataset.tema = localStorage.getItem('tema') ?? 'acik'"
karma = csp_karmasi(betik)
assert karma.startswith("'sha256-") and karma.endswith("='")
assert csp_karmasi(betik + " ") != karma  # TEST: tek boşluk bile karmayı değiştirir
print(f"script-src 'self' {karma}")
```

```cikti
script-src 'self' 'sha256-gev/rkjVJnpkwY/qxmHhxGaiDmOekMherag4S+nog7Q='
```

| Yönerge değeri                         | Sonuç                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `'unsafe-inline'` (script-src)         | XSS korumasını fiilen kapatır                                            |
| `'unsafe-eval'`                        | `eval` ve metinden kod üretimi serbest kalır                             |
| `*`, `https:`, `data:` (script-src)    | Her kökenden/her adresten betik                                          |
| Geniş CDN kökeni                       | O CDN'deki **her** dosya izinli olur, yalnız sizinki değil              |
| `object-src` yok                       | Eski eklenti içerikleri için kapı açık kalır; `'none'` yazın             |
| `base-uri` yok                         | Enjekte edilen `<base>` göreli betik adreslerini başka yere çevirebilir  |

Statik barındırmada (Netlify, Cloudflare Pages) başlık `_headers` dosyasıyla verilir: örnek
[`site/docs/yayin/_headers`](../../site/docs/yayin/_headers); sitenin satır içi tema betiği yüzünden CSP'nin
henüz tanımlı olmadığı [`site/README.md`](../../site/README.md) → "Sınırlar"da yazar (karma ile çözülür).
Tarayıcıda DOM havuzlarını kilitleyen Trusted Types (`require-trusted-types-for 'script'`) güçlü bir ek
kattır; tarayıcı desteği değişkendir, doğrulayın.

## Tuzaklar

| Belirti                                                             | Neden                                                          | Çözüm                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Ekranda `&amp;lt;` görünüyor                                        | Çift kaçış (girdide bir kez, çıktıda bir kez)                  | Girdide kaçışlamayın; yalnız çıktıda, bir kez                      |
| Yorumlar React'te güvenliydi, "biçim için" `dangerouslySetInnerHTML` eklenince açık çıktı | Kaçış yolu temizleyicisiz kullanıldı      | Temizleyici ya da `mini_bicim` yaklaşımı                          |
| Profil bağlantısına tıklayınca betik çalışıyor                       | `href` şeması denetlenmemiş                                    | URL ayrıştırıcı + şema izin listesi                                |
| Sunucu tarafı başlangıç verisinde `</script>` sayfayı bozuyor        | JSON betik içine kaçışsız gömülmüş                             | `betik_icin_json` ya da `data-` özniteliği                         |
| API hata yanıtı tarayıcıda HTML olarak açılıp betik çalıştırıyor     | Yanıt `text/html`; girdi iletiye yansıyor                      | `application/json; charset=utf-8` + `nosniff`                      |
| CSP var ama XSS yine çalışıyor                                      | `'unsafe-inline'` bırakılmış ya da geniş köken izni           | Yönerge tablosuna göre daraltın                                    |
| Nonce her yanıtta aynı                                              | Derlemede bir kez üretilmiş                                    | Her yanıtta yeni rastgele değer                                    |
| Rapor kipinde unutulmuş CSP üretimde hiçbir şey engellemiyor         | `-Report-Only` başlığı kalmış                                  | Yayın öncesi denetimde başlık adını sınayın                         |
| Yüklenen SVG/HTML dosyası açılınca betik çalışıyor                   | Kullanıcı dosyası kendi kökenimizden sunuluyor                 | Ayrı alan adı, `attachment` ([Dosya yükleme](dosya-yukleme-guvenligi.md)) |
| Model çıktısındaki Markdown görseli veri sızdırıyor                  | Çıktı güvenilir sayılıp işlenmiş                               | [YZ uygulama güvenliği](yapay-zeka-uygulama-guvenligi.md)          |

## Denetim listesi

- [ ] `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `dangerouslySetInnerHTML`, `v-html`,
      `|safe`, `eval`, `new Function` kullanımlarının her biri ya kaldırıldı ya da yanında gerekçe ve temizleyici var.
- [ ] Bütün öznitelik değerleri tırnak içinde; sunucu tarafı HTML kaçışı varsayılan (şablon motoru ya da yukarıdaki
      `html` etiketli şablonu).
- [ ] Kullanıcıdan gelen her adres şema izin listesinden geçiyor.
- [ ] Betik içine gömülen veri `<` ve U+2028/9 kaçışlı ya da `data-` özniteliğinde.
- [ ] API yanıtları `application/json; charset=utf-8` ve `X-Content-Type-Options: nosniff` taşıyor.
- [ ] CSP uygulama kipinde; `script-src`'de `'unsafe-inline'`, `'unsafe-eval'`, `*` yok; `object-src 'none'`,
      `base-uri`, `frame-ancestors` var.
- [ ] Testlerde saklanan bir yük (`<img src=x onerror=…>`) gösterilip öğe oluşmadığı ve konsolda CSP ihlali
      olmadığı denetleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kullanıcı verisini yalnız düz metin olarak bas (JSX `{x}`, `textContent`). `innerHTML`,
  `dangerouslySetInnerHTML` kullanma. Kullanıcı adresini `href`'e koymadan `guvenliHref` ile denetle. Satır içi
  betik/stil ve `onclick=` yazma (CSP var)."
- **Modelin tipik hatası:** biçimli metin için `dangerouslySetInnerHTML`'e geçmek; "XSS'e karşı" girdiden `<`
  ve `>` silmek; `javascript:` için `startsWith` denetimi; JSON'u `<script>` içine olduğu gibi gömmek; CSP
  ihlalini "çözmek" için `'unsafe-inline'` eklemek.
- **Çıktıda denetleyin:** yukarıdaki havuz adlarını arayın; CSP başlığında `unsafe` geçiyor mu; yeni bileşende
  kullanıcı adresi `href`'e doğrudan mı gidiyor.
- **Test isteyin:** "Başlığı `<img src=x onerror=window.__xss=1>` olan bir kayıt oluştur, sayfayı aç,
  `window.__xss` tanımsız ve sayfada `img` öğesi yok" uçtan uca testi; `guvenliHref` için yukarıdaki tablo testi.

## İlgili

- Başlık ayarlarının tamamı: [Başlıklar ve HTTPS](guvenlik-basliklari-ve-https.md) · Çerez ve belirteç saklama:
  [Oturum güvenliği](oturum-guvenligi.md)
- Çalışan politika: [`uygulama/api/src/http/securityHeaders.ts`](../../uygulama/api/src/http/securityHeaders.ts)
  (`WEB_CSP`, `API_CSP`) ve testi [`security.test.ts`](../../uygulama/api/test/security.test.ts)
- HTML kaçışı yardımcısı (iki dilde): [`kutuphane/py/kutuphane/metin.py`](../../kutuphane/py/kutuphane/metin.py)
