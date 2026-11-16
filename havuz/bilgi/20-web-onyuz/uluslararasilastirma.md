---
baslik: Uluslararasılaştırma
ozet: Arayüz metnini koddan ayırmak, değişkenli cümle ve sözcük sırası, Intl ile çoğul, tarih, sayı ve para biçimleme, metin uzaması, sağdan sola hazırlık, dil seçimi ve kalıcılığı.
etiketler: [i18n, intl, yerellestirme, metin, rtl, onyuz]
duzey: orta
guncellik: 2026-11
---

# Uluslararasılaştırma

> Bu notu ne zaman okumalı: arayüze yeni metin, sayı, tarih ya da para gösterimi eklerken; ikinci bir dil
> düşünülmeden önce bile (yalnız Türkçe uygulamada da metni koddan ayırmak ve `Intl` kullanmak gerekir); "dün 23:00'te
> eklenen kayıt bugün görünüyor", "3 görevler" gibi hatalarda.

## Temel fikir

Uluslararasılaştırma (i18n), uygulamayı **dile bağımsız** yazmaktır; yerelleştirme (l10n) belirli bir dil ve ülke
için içeriği doldurmaktır. Yalnız Türkçe bir uygulamada da i18n kuralları değerlidir: metin tek sözlükte durunca
yazım tutarlı olur, küçük model metni koda gömmez, metin yazarı kodu açmadan düzeltir.

Üç kural: (1) kullanıcının gördüğü **her** metin sözlükte, tam cümle ve adlandırılmış yer tutucuyla durur;
(2) sayı, para, tarih, liste, çoğul **elle biçimlenmez**, `Intl` ile biçimlenir; (3) zaman UTC olarak saklanır,
kullanıcının saat diliminde gösterilir; yalnız-tarih değerler (doğum günü) saat dilimine hiç sokulmaz.

Türkçeye özgü ayrıntılar (büyük/küçük harf, ekler, Türkiye biçimleri) ayrı kümede:
[Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md),
[yerelleştirme denetimi](../97-turkce/yerellestirme-denetimi.md).

## Metni koddan ayırma

- Sözlük dosyası (`tr.json`) + tipli `t('alan.anahtar', { degisken })` işlevi; anahtar sözlükte yoksa derleme hatası.
  Havuzdaki uygulama temeli böyle: [`i18n/index.ts`](../../uygulama/web/src/i18n/index.ts).
- Sözlüğe girenler yalnız görünen metin değildir: `aria-label`, `alt`, `title`, `placeholder`, belge başlığı,
  bildirimler, hata iletileri, manifest adı.
- Anahtar adı anlamı söyler (`tasks.empty.title`), metnin kendisini değil (`hic_gorev_yok`). Metin değişince anahtar
  değişmez.
- Sunucu hatası kod olarak gelir (`email_taken`), metin istemcinin sözlüğünden seçilir; sunucunun Türkçe iletisi
  yalnız yedektir.
- Kural testleri: kullanılan her anahtar sözlükte var mı, sözlükte kullanılmayan anahtar kaldı mı, `.tsx` içinde
  gömülü Türkçe metin var mı (uygulama temelinde `test/rules/i18n.test.ts` ve
  [`hardcoded-text.test.ts`](../../uygulama/web/test/rules/hardcoded-text.test.ts)).

## Değişkenli cümle ve sözcük sırası

Cümleyi parçalardan birleştirmeyin: sözcük sırası dilden dile değişir ve çevirmen parçaları göremez. Tam cümle +
adlandırılmış yer tutucu:

```js calistir
import assert from 'node:assert/strict'

const messages = {
  tr: { 'invite.sent': '{name} kişisine davet gönderildi.', 'list.moved': '{count} görev "{list}" listesine taşındı.' },
  en: { 'invite.sent': 'Invitation sent to {name}.', 'list.moved': 'Moved {count} tasks to "{list}".' },
}
function t(locale, key, vars = {}) {
  const template = messages[locale]?.[key] ?? messages.tr[key] // eksik çeviri: varsayılan dile düş
  if (template === undefined) throw new Error(`Sözlükte yok: ${key}`)
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in vars)) throw new Error(`${key}: {${name}} değeri verilmedi`)
    return String(vars[name])
  })
}

// Yer tutucunun cümledeki yeri dile göre değişir; kodda sıra yok
assert.equal(t('tr', 'invite.sent', { name: 'Ayşe' }), 'Ayşe kişisine davet gönderildi.')
assert.equal(t('en', 'invite.sent', { name: 'Ayşe' }), 'Invitation sent to Ayşe.')
assert.equal(t('tr', 'list.moved', { count: 3, list: 'Ev' }), '3 görev "Ev" listesine taşındı.')
assert.throws(() => t('tr', 'invite.sent', {}), /\{name\} değeri verilmedi/) // unutulan değer sessiz geçmesin
console.log('tamam')
```

```cikti
tamam
```

**Türkçe ek tuzağı:** `{name}'e davet gönderildi` yazılamaz; ek ada göre değişir (Ayşe'ye, Mehmet'e, Zonguldak'a).
İki yol: cümleyi eke gerek bırakmayacak biçimde kurmak ("{name} kişisine", "Alıcı: {name}", tırnak içinde liste adı +
"listesine") ya da eki hesaplayan yardımcı kullanmak ([`ek.ts`](../../kutuphane/ts/src/ek.ts): `addSuffix('Ankara',
'dative')` → "Ankara'ya"). Yer tutucunun yanına ek yapıştırmak yerine cümleyi yeniden kurmak hemen her zaman daha
sağlamdır.

Cinsiyet, sayı ve seçenek içeren karmaşık cümlelerde ICU ileti biçimi (`{count, plural, one {…} other {…}}`)
kullanan bir kütüphane düşünülür; tek dilli uygulamada yukarıdaki basit `t` yeter.

## Çoğul

Çoğul biçim dilin kuralıdır; `Intl.PluralRules` kategoriyi verir, sözlük her kategori için ayrı cümle tutar.
**Türkçede sayıdan sonra ad tekil kalır:** "3 görev", "3 görevler" değil. Bu yüzden `count === 1 ? 'görev' :
'görevler'` gibi İngilizceden taşınmış kod Türkçede hatadır.

```js calistir
import assert from 'node:assert/strict'

const plural = {
  tr: { other: '{n} görev' },
  en: { one: '{n} task', other: '{n} tasks' },
  ru: { one: '{n} задача', few: '{n} задачи', many: '{n} задач', other: '{n} задачи' },
}
function countLabel(locale, n) {
  const forms = plural[locale]
  const category = new Intl.PluralRules(locale).select(n) // 'one' | 'few' | 'many' | 'other' …
  return (forms[category] ?? forms.other).replace('{n}', new Intl.NumberFormat(locale).format(n))
}

assert.deepEqual([1, 3].map((n) => countLabel('tr', n)), ['1 görev', '3 görev'])
assert.deepEqual([1, 3].map((n) => countLabel('en', n)), ['1 task', '3 tasks'])
assert.deepEqual([1, 3, 5, 21].map((n) => countLabel('ru', n)), ['1 задача', '3 задачи', '5 задач', '21 задача'])
assert.equal(new Intl.PluralRules('ar').resolvedOptions().pluralCategories.length, 6) // Arapça: altı biçim
assert.equal(countLabel('tr', 1234), '1.234 görev') // sayı da yerel biçimde
console.log('tamam')
```

Sıfır için ayrı bir cümle çoğu zaman daha iyidir ("Görev yok"); bu çoğul kuralı değil, ürün metnidir.

## Tarih, sayı, para

```js calistir
import assert from 'node:assert/strict'

const at = new Date('2026-11-16T10:00:00Z')
const tz = 'Europe/Istanbul' // saat dilimini HER ZAMAN açıkça verin; sunucu ve test makinesi UTC olabilir

assert.equal(new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(1234.5), '₺1.234,50')
assert.equal(new Intl.NumberFormat('tr-TR', { style: 'percent' }).format(0.25), '%25') // yüzde işareti önde
assert.equal(new Intl.NumberFormat('tr-TR').format(1234567.891), '1.234.567,891')
assert.equal(new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full', timeZone: tz }).format(at), '16 Kasım 2026 Pazartesi')
assert.equal(new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeZone: tz }).format(at), '16.11.2026')
assert.equal(new Intl.DateTimeFormat('tr-TR', { timeStyle: 'short', timeZone: tz }).format(at), '13:00')
assert.equal(new Intl.RelativeTimeFormat('tr', { numeric: 'auto' }).format(-1, 'day'), 'dün')
assert.equal(new Intl.RelativeTimeFormat('tr', { numeric: 'auto' }).format(-3, 'day'), '3 gün önce')
assert.equal(new Intl.ListFormat('tr', { type: 'conjunction' }).format(['elma', 'armut', 'kiraz']), 'elma, armut ve kiraz')
console.log('tamam')
```

Bu çıktılar Node 22.23.4 (ICU 78.3) ile denendi. `Intl` çıktısı tarayıcıya ve ICU sürümüne göre değişebilir
(para simgesinin yeri, bölünmez boşluk); testlerde biçimlenmiş dizgiyi birebir karşılaştırmak yerine aynı biçimleyiciyi
kullanın ya da sürümü sabitleyin. Biçimleyicileri modül düzeyinde bir kez oluşturun; her render'da `new
Intl.NumberFormat` pahalıdır.

| Kural                                                         | Neden                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| Zamanı UTC ISO dizgisi olarak saklayın, gösterirken `timeZone` verin | Cihazlar ve sunucu farklı dilimlerde                |
| Yalnız-tarihi (doğum günü, son gün) `YYYY-AA-GG` metni olarak saklayın | Saat dilimine sokulunca gün kayar (aşağıda)       |
| Parayı kuruş cinsinden tam sayı tutun                         | Kayan nokta toplamı yuvarlama hatası yapar ([`para.ts`](../../kutuphane/ts/src/para.ts)) |
| `toFixed`, elle nokta/virgül değiştirme yok                   | Yerel kurallar sizin tahmininizden karmaşık              |
| Kullanıcının girdiği sayıyı yerel kurala göre ayrıştırın      | `parseFloat('1.234,56')` 1.234 verir ([formlar](formlar.md)) |

```js calistir
import assert from 'node:assert/strict'

const fmt = (date, timeZone) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone }).format(date)

// YANLIŞ: "2026-11-16" new Date ile UTC GECE YARISI olur; UTC'nin gerisindeki kullanıcıda bir önceki gün görünür
const birthday = new Date('2026-11-16')
assert.equal(fmt(birthday, 'Europe/Istanbul'), '16 Kasım 2026')
assert.equal(fmt(birthday, 'America/New_York'), '15 Kasım 2026') // yanlış gün

// DOĞRU: yalnız-tarih metin olarak kalır; gösterirken UTC'de biçimlenir, gün hiç kaymaz
const formatDateOnly = (iso) => fmt(new Date(`${iso}T00:00:00Z`), 'UTC')
assert.equal(formatDateOnly('2026-11-16'), '16 Kasım 2026')
console.log('tamam')
```

Türkiye'ye özgü tarih hesapları (iş günü, resmî tatil, göreli zaman) için hazır ve sınanmış yardımcı:
[`tarih.ts`](../../kutuphane/ts/src/tarih.ts).

## Metin uzaması

- Türkçe sondan eklemeli bir dildir; tek sözcük uzun olabilir: "Güncelleştirilemiyor", "Kaydedilemedi",
  "Bildirimlerinizi". Almanca İngilizceden ~%30 uzundur. Düğmeye sabit genişlik vermeyin; metin iki satıra
  inebilsin; kesme (`truncate`) yalnız tam metnin başka yerde göründüğü durumlarda.
- Dar ekranda (360 px) en uzun gerçek metinle deneyin. `hyphens: auto` doğru `lang` ister; Türkçe heceleme desteği
  tarayıcıya göre değişir, güvenmeyin.
- Sahte yerelleştirme (pseudo-localization): bütün metinleri ~%40 uzatıp işaretleyen bir geliştirme kipi; kesilen,
  taşan ve sözlüğe girmemiş (dönüşmeden kalan) metni hemen gösterir.

## Sağdan sola (RTL) hazırlık

Bugün sağdan sola dil yoksa bile mantıksal özellikler kullanmak ucuzdur ve Köprü'deki "sol el modu" gibi
aynalamaları da kolaylaştırır.

| Fiziksel (kaçının)                 | Mantıksal (kullanın)                       | Tailwind                      |
| ---------------------------------- | ------------------------------------------ | ----------------------------- |
| `margin-left`, `padding-right`     | `margin-inline-start`, `padding-inline-end` | `ms-4`, `pe-4`               |
| `left: 0`, `right: 0`              | `inset-inline-start: 0`, `inset-inline-end: 0` | `start-0`, `end-0`        |
| `text-align: left`                 | `text-align: start`                        | `text-start`                  |
| `border-left`                      | `border-inline-start`                      | `border-s`                    |

- `<html dir="rtl">` ile düzen aynalanır; yön anlatan simgeler (geri oku, "ileri") aynalanır, saat, oynat düğmesi,
  marka logosu aynalanmaz.
- Kullanıcının yazdığı metin için `dir="auto"`; cümle içinde kullanıcı adı gibi yönü bilinmeyen parçalar `<bdi>`
  içinde.
- Klavye ok tuşlarının anlamı da yönle değişir ([erişilebilirlik](erisilebilirlik-uygulama.md#klavye-etkileşim-kalıpları)).

## Dil seçimi ve kalıcılığı

```js calistir
import assert from 'node:assert/strict'

// Sıra: kullanıcının kayıtlı seçimi → tarayıcı dilleri (sırasıyla, önce tam etiket sonra temel dil) → varsayılan.
function pickLocale({ saved, browser, supported, fallback = 'tr' }) {
  if (saved && supported.includes(saved)) return saved
  for (const tag of browser) {
    if (supported.includes(tag)) return tag
    const base = new Intl.Locale(tag).language // "tr-TR" → "tr"
    if (supported.includes(base)) return base
  }
  return fallback
}
const supported = ['tr', 'en']
assert.equal(pickLocale({ browser: ['tr-TR', 'en-US'], supported }), 'tr')
assert.equal(pickLocale({ browser: ['de-DE', 'en-GB'], supported }), 'en')
assert.equal(pickLocale({ browser: ['de-DE'], supported }), 'tr')
assert.equal(pickLocale({ saved: 'en', browser: ['tr-TR'], supported }), 'en') // açık seçim kazanır
console.log('tamam')
```

- Seçim kalıcıdır (localStorage ya da hesap ayarı) ve dil menüsünde her dil **kendi adıyla** yazılır ("English",
  "Türkçe"), bayrakla değil (bayrak ülkedir, dil değil).
- Dil değişince `<html lang>` de değişmeli: ekran okuyucunun telaffuzu, CSS `text-transform` (Türkçe i/İ), yazım
  denetimi ve heceleme buna bakar.
- İçerik sitesinde dil adreste durur (`/en/…`); arama motoru her dili ayrı sayfa olarak görür. Uygulamada adres
  gerekmez. Site temelinin yaklaşımı: [`cok-dillilik.md`](../../site/src/content/belgeler/tr/cok-dillilik.md).

## Tuzaklar

| Belirti                                                    | Neden                                                      | Çözüm                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| "3 görevler", "1 görevler"                                 | İngilizce çoğul mantığı Türkçeye uygulanmış                | Türkçede sayıdan sonra tekil; `PluralRules` + sözlük      |
| "Mehmet'ye davet gönderildi"                               | Ek yer tutucuya sabit yapıştırılmış                        | Cümleyi yeniden kurun ya da ek yardımcısı                 |
| Doğum günü bir gün önce görünüyor                          | Yalnız-tarih UTC'ye çevrilmiş                              | Metin olarak saklayın, UTC'de biçimleyin                  |
| Gece 23:30'da eklenen kayıt "yarın" görünüyor              | Saat dilimi verilmeden biçimleme (sunucu/test UTC)         | `timeZone` açıkça                                         |
| "1,234.50 TL" ya da "%25" yerine "25%"                     | Elle biçimleme ya da yanlış yerel ayar                     | `Intl` + `'tr-TR'`                                        |
| Testler yerelde geçiyor, CI'da biçim farkı                 | ICU sürümü/saat dilimi farklı                              | Saat dilimini ve yereli testte sabitleyin                 |
| Arayüzde İngilizce ya da çevrilmemiş anahtar görünüyor     | Metin koda gömülü ya da anahtar eksik                      | Kural testi: eksik/kullanılmayan anahtar, gömülü metin    |
| Uzun Türkçe sözcük düğmeden taşıyor                        | Sabit genişlik, `whitespace-nowrap`                        | Esnek genişlik, iki satıra izin                           |
| Ekran okuyucu Türkçe metni İngilizce aksanla okuyor        | `<html lang>` yanlış                                       | `lang="tr"`; dil değişince güncelleyin                    |

## Denetim listesi

- [ ] Kullanıcının gördüğü her metin (öznitelikler dahil) sözlükte; gömülü metin kural testi yeşil.
- [ ] Cümleler tam ve adlandırılmış yer tutuculu; parça birleştirme yok; değişkene ek yapıştırılmamış.
- [ ] Sayı, para, yüzde, tarih, liste `Intl` ile; biçimleyiciler bir kez oluşturuluyor.
- [ ] Zaman UTC saklanıyor, gösterimde `timeZone` açık; yalnız-tarih metin olarak saklanıyor.
- [ ] Çoğul `PluralRules` ile; Türkçede sayıdan sonra tekil.
- [ ] En uzun gerçek metinle 360 px'te taşma yok.
- [ ] Mantıksal CSS özellikleri kullanılıyor (`ms-`, `pe-`, `text-start`).
- [ ] `<html lang>` doğru; dil seçimi kalıcı ve menüde diller kendi adlarıyla.

## Küçük modele yaptırırken

- **İsteme yazın:** "Görünen her metni `tr.json`'a ekle ve `t()` ile oku. Cümleyi parçalardan birleştirme; yer
  tutucuya ek yapıştırma, cümleyi yeniden kur. Sayı/para/tarih için `Intl` kullan, `timeZone` ver. Türkçede sayıdan
  sonra ad tekil."
- **Modelin tipik hatası:** Metni JSX'e gömer; `count === 1 ? '' : 'ler'` yazar; `toLocaleDateString()`'i yerel ve
  saat dilimi vermeden çağırır; `new Date('2026-11-16')` ile doğum günü işler; `{name}'e` kalıbı kurar; `margin-left`
  kullanır.
- **Çıktıda arayın:** JSX içinde Türkçe karakterli düz metin; `+ ' '` ile cümle birleştirme; `toFixed(`,
  `toLocaleString()` (argümansız), `new Date('YYYY-AA-GG')`; `'ler'`/`'lar'` ekleme; `ml-`/`mr-`/`left-` sınıfları.
- **Test isteyin:** Gece yarısına yakın bir zamanla (UTC 21:30 = TR 00:30) tarih biçimleme testi ve uzun metinli
  360 px ekran görüntüsü.

## İlgili

- [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md) ve [yerelleştirme denetimi](../97-turkce/yerellestirme-denetimi.md)
- [Formlar](formlar.md) — yerel sayı girişi
- [Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md) — `lang`, yön ve klavye
- Çalışan örnekler: [`i18n/index.ts`](../../uygulama/web/src/i18n/index.ts), [`date.ts`](../../uygulama/web/src/lib/date.ts)
- Başka kümelerde: [Zaman ve saat dilimi](../30-arkauc/zaman-ve-saat-dilimi.md) (an, duvar saati, takvim günü), [JavaScript çalışma zamanı](../10-diller/javascript-calisma-zamani.md) (Date tuzakları)
