---
baslik: Formlar
ozet: Denetimli/denetimsiz seçimi, doğrulama zamanlaması, erişilebilir hata gösterimi, çift gönderim, sunucu hatasını alana bağlama, adımlı form ve mobilde doğru klavye ile otomatik doldurma.
etiketler: [form, dogrulama, erisilebilirlik, mobil, react, onyuz]
duzey: orta
guncellik: 2026-11
---

# Formlar

> Bu notu ne zaman okumalı: kullanıcıdan bilgi alan her ekranda (giriş, kayıt, ayarlar, ödeme, iletişim);
> "hata mesajı çok erken çıkıyor", "çift kayıt oluştu", "telefonda yanlış klavye açılıyor", "şifre yöneticisi
> doldurmuyor" şikâyetlerinde.

## Temel fikir

Tarayıcı formda çok iş yapar; onu atlamayın. Gerçek bir `<form onSubmit>` + `<button type="submit">` şunları
bedavaya verir: Enter ile gönderme, telefon klavyesinde "Git" tuşu, şifre yöneticisinin formu tanıması, ekran
okuyucunun "form" bölgesi. Her alanın görünür bir `<label>`'ı, anlamlı bir `name`'i, doğru `type`/`inputmode`'u ve
`autocomplete` değeri olur.

Form bir konuşmadır: kullanıcı yazarken susun, alandan çıkınca ya da gönderince ne yanlışsa söyleyin, düzelttiği an
hatayı kaldırın. Hata metni suçlamaz, nasıl düzeltileceğini söyler. Gönderim sırasında düğme kilitlenir, hata olursa
yazılanlar **asla** silinmez.

## Karar tablosu: denetimli mi denetimsiz mi?

| Durum                                                                 | Seçim                                    | Neden                                                 |
| --------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| Her tuşta tepki gerekiyor (canlı biçimleme, karakter sayacı, koşullu alan) | Denetimli (`value` + `onChange`)    | Değer React durumunda; ekran ona göre değişir         |
| Basit gönder-ve-unut formu (iletişim, arama)                          | Denetimsiz + `FormData`                  | Daha az kod, her tuşta render yok                     |
| Çok alanlı, çok kurallı form (ödeme, uzun başvuru)                    | Form kütüphanesi + şema (Zod)            | Dokunuldu/kirli/doğrulama durumu hazır                |
| Değer başka bileşenleri de etkiliyor (önizleme)                       | Denetimli                                | Tek kaynak                                            |
| React 19 `<form action={fn}>` kullanılıyor                            | Hata dönebiliyorsa denetimli ya da değerleri durumdan geri yükleyin | Aşağıdaki sıfırlama tuzağı |

Doğrulama kuralları istemcide ve sunucuda **aynı şemadan** gelsin (havuzdaki uygulama temelinde ortak paket:
[`form.ts`](../../uygulama/web/src/lib/form.ts) şemayla doğrular, hatayı alan → ileti eşlemesine çevirir).

### React 19 form eylemleri: sıfırlama tuzağı

`<form action={fn}>` ile eylem tamamlanınca React **denetimsiz alanları sıfırlar**; eylem hata nesnesi döndürse
bile. React 19.3'te denendi: geçersiz e-posta için `{ error }` döndüren eylemden sonra alan boşaldı; denetimli
alan değerini korudu. Kullanıcının yazdıkları kaybolur.

```tsx
// Gösterim: eylem gönderilen değerleri de döndürür, alan defaultValue ile geri yüklenir (19.3'te denendi).
const [state, action, pending] = useActionState(
  async (_prev: State, formData: FormData) => {
    const email = String(formData.get('email') ?? '')
    const result = await register(email)
    return result.ok ? { error: null, values: { email: '' } } : { error: result.message, values: { email } }
  },
  { error: null, values: { email: '' } },
)
return (
  <form action={action}>
    <input name="email" type="email" autoComplete="email" defaultValue={state.values.email} />
    <button type="submit" disabled={pending}>{pending ? 'Kaydediliyor…' : 'Kaydol'}</button>
  </form>
)
```

## Doğrulama zamanlaması

| Ne zaman             | Ne yapılır                                                        | Neden                                                 |
| -------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Yazarken             | Hata gösterilmez; yalnız olumlu ipucu (şifre gücü, kalan karakter) | Daha bitmemiş "ayse@" için kırmızı uyarı saldırgandır |
| Alandan çıkınca (blur) | Alan doluysa ilk kez denetlenir, hata gösterilir                | Kullanıcı "bitti" demiştir                            |
| Hata görünürken yazınca | Her tuşta yeniden denetlenir                                   | Düzeldiği an hata kalkmalı                            |
| Gönderince           | Bütün alanlar denetlenir, ilk hatalı alana odak gider            | Boş geçilen zorunlu alanlar ancak burada yakalanır    |
| Sunucu yanıtınca     | Sunucu hataları ilgili alanlara dağıtılır                        | E-posta zaten kayıtlı gibi yalnız sunucunun bildiği şeyler |

Kısaca: **erken ödüllendir, geç cezalandır.** Görünen hata saklanmaz, değerden ve "dokunuldu/gönderildi"
bilgisinden **türetilir**:

```js calistir
import assert from 'node:assert/strict'

const validateEmail = (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'E-posta ad@ornek.com gibi olmalı.')

function reduce(state, event) {
  switch (event.type) {
    case 'change': return { ...state, value: event.value }
    case 'blur': return { ...state, touched: state.touched || state.value !== '' } // boşken geçip gitmek hata değil
    case 'submit': return { ...state, submitted: true }
  }
}
const visibleError = (s) => (s.touched || s.submitted ? validateEmail(s.value) : null)

let s = { value: '', touched: false, submitted: false }
s = reduce(s, { type: 'change', value: 'ayse@' })
assert.equal(visibleError(s), null) // yazarken bağırma
s = reduce(s, { type: 'blur' })
assert.match(visibleError(s), /ad@ornek\.com/) // alandan çıkınca göster
s = reduce(s, { type: 'change', value: 'ayse@ornek.com' })
assert.equal(visibleError(s), null) // düzeldiği AN kalkar; blur beklenmez

let empty = reduce({ value: '', touched: false, submitted: false }, { type: 'blur' })
assert.equal(visibleError(empty), null) // Tab ile geçmek hata saymaz
empty = reduce(empty, { type: 'submit' })
assert.notEqual(visibleError(empty), null) // gönderince görünür
console.log('tamam')
```

```cikti
tamam
```

Tarayıcının yerleşik doğrulama balonları (`required`, `type="email"`) tarayıcı diline göre değişir, biçimlenemez ve
ekran okuyucularda tutarsızdır. Önerilen: `<form noValidate>` ile balonları kapatın ama `required`, `type`,
`minLength` özniteliklerini **bırakın** (anlam ve klavye türü için); iletileri kendiniz gösterin.

## Hata gösterimi ve erişilebilirlik

| Yapın                                                                 | Yapmayın                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------- |
| Görünür `<label htmlFor>`; yer tutucu yalnız örnek için               | Yer tutucuyu etiket yerine kullanmak (yazınca kaybolur) |
| Hata metni alanın **altında**, `aria-describedby` ile alana bağlı     | Hatayı yalnız kırmızı kenarla belirtmek                 |
| Hatalı alanda `aria-invalid="true"`                                   | Hatayı sayfanın en üstünde tek satırla vermek           |
| Gönderince odak ilk hatalı alana; uzun formda üstte bağlantılı hata özeti | Odağı yerinde bırakıp kullanıcıyı aramaya zorlamak  |
| Simge + metin + renk birlikte                                         | Yalnız renk (renk körlüğü, yüksek karşıtlık kipi)       |
| Form düzeyi sonuç için `role="alert"` ya da `role="status"`           | Her alan hatasını ayrı ayrı yüksek sesle okutmak        |
| Zorunlu alanları metinle belirtin ya da isteğe bağlıları işaretleyin  | Yalnız `*` (ne anlama geldiği yazmıyorsa)               |
| Gönder düğmesi her zaman basılabilir; basınca hataları gösterir       | Form geçersizken düğmeyi gri yapıp nedenini söylememek  |

Hazır bileşen: [`Field.tsx`](../../uygulama/web/src/ui/Field.tsx) (etiket, ipucu, hata `aria-describedby` ile bağlı;
`aria-invalid`), ilk hatalı alana odak: `form.ts` içindeki `focusFirstInvalid`.

## Gönderim durumları ve çift gönderim

| Durum         | Düğme                                     | Alanlar                    | Sonra                                          |
| ------------- | ----------------------------------------- | -------------------------- | ---------------------------------------------- |
| Boşta         | Etkin                                      | Düzenlenebilir             | —                                              |
| Gönderiliyor  | "Kaydediliyor…", kilitli, genişliği sabit | Değerler korunur           | Ağ yavaşsa iptal edilebilir                    |
| Başarılı      | —                                          | Formdan çıkılır ya da temizlenir | Yönlendirme `replace` ile (geri tuşu formu yeniden göndermesin) ya da onay iletisi |
| Hata          | Yeniden etkin                              | Değerler **korunur**       | İleti + odak; sunucu hatası ilgili alanda      |

Çift tıklamayı `useState` bayrağıyla engelleyemezsiniz: `setBusy(true)` hemen uygulanmaz, aynı kare içindeki ikinci
tıklama hâlâ `busy === false` görür. Eşzamanlı bir kilit (ref ya da süren söz) kullanın:

```js calistir
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'

// Süren gönderim varken yeni çağrı aynı sözü alır; yeni istek açılmaz.
function singleFlight(task) {
  let running = null
  return (...args) => (running ??= task(...args).finally(() => { running = null }))
}

let requests = 0
const submit = singleFlight(async (order) => { requests++; await sleep(20); return `${order} kaydedildi` })
const [a, b] = await Promise.all([submit('sipariş-1'), submit('sipariş-1')]) // çift tıklama
assert.equal(requests, 1)
assert.equal(a, b)
await submit('sipariş-2') // ilki bitince yeni gönderim serbest
assert.equal(requests, 2)
console.log('tamam')
```

İstemci kilidi yetmez: ağ kesilip kullanıcı sayfayı yenileyerek yeniden gönderebilir. Para, sipariş, davet gibi
işlemlerde istemci her gönderim için bir **idempotency anahtarı** üretir, sunucu aynı anahtarı ikinci kez işlemez.

## Sunucu hatasını alana bağlama

Sunucu doğrulama hatasını alan yoluyla döndürmeli (`{ code: 'validation', details: [{ path, message }] }`). İstemci
bunları alanlara dağıtır; formda karşılığı olmayanı form düzeyinde gösterir:

```ts calistir
import assert from 'node:assert/strict'

type ApiError = { code: string; message: string; details?: { path: string; message: string }[] }

function mapServerErrors(error: ApiError, fieldNames: readonly string[]) {
  const fields: Record<string, string> = {}
  const formLevel: string[] = []
  for (const detail of error.details ?? []) {
    if (fieldNames.includes(detail.path)) fields[detail.path] ??= detail.message // alan başına ilk ileti
    else formLevel.push(detail.message) // formda karşılığı yok: kaybolmasın
  }
  if (Object.keys(fields).length === 0 && formLevel.length === 0) formLevel.push(error.message)
  return { fields, formLevel }
}

const mapped = mapServerErrors(
  {
    code: 'validation',
    message: 'Bazı bilgiler eksik.',
    details: [
      { path: 'email', message: 'Bu e-postayla bir hesap zaten var.' },
      { path: 'email', message: 'İkinci ileti gösterilmez.' },
      { path: 'plan', message: 'Seçtiğiniz paket artık yok.' },
    ],
  },
  ['name', 'email', 'password'],
)
assert.deepEqual(mapped.fields, { email: 'Bu e-postayla bir hesap zaten var.' })
assert.deepEqual(mapped.formLevel, ['Seçtiğiniz paket artık yok.'])
const limited = mapServerErrors({ code: 'rate_limited', message: 'Çok sık denendi. Bir dakika sonra yeniden deneyin.' }, ['email'])
assert.deepEqual(limited.formLevel, ['Çok sık denendi. Bir dakika sonra yeniden deneyin.'])
console.log('tamam')
```

Havuzdaki karşılığı: [`errors.ts`](../../uygulama/web/src/lib/errors.ts) içindeki `fieldErrors`. Güvenlik notu: giriş
formunda "bu e-posta kayıtlı değil" ile "şifre yanlış" ayrımı hesap varlığını sızdırır; tek ileti kullanın
("E-posta ya da şifre eşleşmedi").

## Uzun ve adımlı form

- Bölmek için gerçek bir neden olsun (konu değişiyor, önceki yanıta göre sonraki soru değişiyor). Beş alanlık formu
  üç adıma bölmek işi uzatır.
- Her adım kendi alanlarını doğrular; "Geri" hiçbir veriyi silmez; "Adım 2/4" ilerlemesi görünür.
- Her adımın kendi URL'i olsun (`?adim=2`): telefonun geri tuşu bir önceki adıma dönsün, uygulamadan çıkmasın.
- Taslağı yerelde saklayın (yazmayı 500 ms kadar bekletip IndexedDB/localStorage'a); geri dönen kullanıcıya
  "Yarım kalan başvurunuz geri yüklendi · Temizle" deyin. Şifre ve kart bilgisi taslağa **yazılmaz**.
- Son adımda özet ve "Düzenle" bağlantıları; gönderim yalnız orada.
- `beforeunload` uyarısı mobilde güvenilir değildir; asıl koruma otomatik taslaktır.

## Mobilde giriş türleri ve otomatik doldurma

| Alan                     | `type` / `inputmode`                      | `autocomplete`                         | Not                                                      |
| ------------------------ | ----------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| Ad soyad                 | `text`                                    | `name`                                 | `autoCapitalize="words"`                                 |
| E-posta                  | `type="email"`                            | `email`                                | `spellCheck={false}`; Türkçe büyük harf dönüşümü yapmayın |
| Telefon                  | `type="tel"`                              | `tel`                                  | Biçimi zorlamayın; boşluk/tireyi siz temizleyin          |
| Tek kullanımlık kod (SMS) | `inputMode="numeric"`                    | `one-time-code`                        | `type="number"` değil                                    |
| Posta kodu, TC kimlik no | `inputMode="numeric"`                     | `postal-code` / `off`                  | Metin olarak saklanır (baştaki sıfır)                    |
| Para tutarı              | `inputMode="decimal"`                     | `transaction-amount`                   | Türkçe virgülü siz ayrıştırın (aşağıda)                  |
| Kullanıcı adı            | `text`                                    | `username`                             | Giriş formunda şifreden önce                             |
| Mevcut şifre             | `password`                                | `current-password`                     | Göster/gizle düğmesi; yapıştırmayı engellemeyin          |
| Yeni şifre               | `password`                                | `new-password`                         | Şifre yöneticisi güçlü şifre önerir                      |
| Adres                    | `text`                                    | `street-address`, `address-level2` (ilçe), `address-level1` (il) | Tek kutu çoğu zaman yeter          |
| Arama                    | `type="search"`                           | `off`                                  | `enterKeyHint="search"`                                  |

Ek kurallar: alan yazı boyutu en az 16 px (iOS daha küçükte odakta sayfayı yakınlaştırır; bkz.
[duyarlı tasarım](duyarli-tasarim-ve-mobil.md)); "e-postayı yeniden yazın" alanı koymayın; `enterKeyHint` ile
klavyedeki tuşu adlandırın (`next`, `done`, `send`).

Kod, telefon ve kimlik numarası **sayı değildir**; `type="number"` kullanmayın:

```js calistir
import assert from 'node:assert/strict'

assert.equal(String(Number('05321234567')), '5321234567') // baştaki 0 gitti
assert.equal(Number('1e3'), 1000) // type=number "e" harfini kabul eder
assert.equal(parseFloat('1.234,56'), 1.234) // Türkçe yazım parseFloat ile YANLIŞ okunur

// Türkçe ondalık giriş: binlik nokta, ondalık virgül. Geçersizse null; sessizce 0 yapmayın.
function parseTrDecimal(text) {
  const cleaned = text.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null
}
assert.equal(parseTrDecimal('1.234,56'), 1234.56)
assert.equal(parseTrDecimal(' 12,5 '), 12.5)
assert.equal(parseTrDecimal('12,5,0'), null)
assert.equal(parseTrDecimal(''), null)
console.log('tamam')
```

Para tutarını kayan noktayla toplamayın; kuruş olarak tam sayı tutun (hazır: [`para.ts`](../../kutuphane/ts/src/para.ts)).
`type="number"` ayrıca fare tekerleği ve ok tuşlarıyla değeri sessizce değiştirir.

## Tuzaklar

| Belirti                                                      | Neden                                                      | Çözüm                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Kullanıcı daha yazarken kırmızı hata çıkıyor                 | Doğrulama her tuşta, dokunulmadan gösteriliyor             | Blur/gönderimde göster; görünür olduktan sonra her tuşta denetle |
| Hata verince yazılanlar silindi                              | React 19 form eylemi denetimsiz alanları sıfırladı; ya da hata dalında `reset()` | Değerleri durumdan geri yükleyin ya da denetimli alan |
| Çift sipariş                                                 | Çift tıklama; kilit `useState`'teydi                       | Eşzamanlı kilit + idempotency anahtarı                     |
| Enter'a basınca bir şey olmuyor                              | `<form>` yok; düğme `onClick` ile çalışıyor                | Gerçek `<form onSubmit>` ve `type="submit"`                |
| Formdaki başka bir düğme formu gönderiyor                    | `<button>`'ın varsayılan türü `submit`                     | Gönderme dışındaki düğmelere `type="button"`               |
| Şifre yöneticisi doldurmuyor/kaydetmiyor                     | `autocomplete` yok, alanlar `<form>` dışında, `name` yok   | Doğru `autocomplete` + `name` + form                       |
| Telefonda harf klavyesi açılıyor                             | `inputmode`/`type` yok                                     | Tablodaki türler                                           |
| Kod alanında baştaki sıfır kayboluyor                        | `type="number"`, sayıya çevirme                            | `inputMode="numeric"`, metin olarak saklayın               |
| iPhone'da alana dokununca sayfa büyüyor                      | Yazı boyutu 16 px'ten küçük                                | 16 px ya da üstü                                           |
| Ekran okuyucu hatayı okumuyor                                | Hata metni alana bağlı değil                               | `aria-describedby` + `aria-invalid`                        |
| Sunucunun "e-posta kayıtlı" hatası görünmüyor                | Yalnız genel ileti gösteriliyor                            | Ayrıntıyı alana dağıtın                                    |
| E-posta "ayse@ornek.com" yerine "AYSE@..." ya da "ayşe" oldu | Makine alanına Türkçe dönüşüm/otomatik büyük harf          | `autoCapitalize="none"`, dönüşüm yok (bkz. [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)) |

## Denetim listesi

- [ ] Her alanın görünür etiketi, `name`'i, doğru `type`/`inputMode`'u ve `autocomplete`'i var.
- [ ] Gönderim `<form onSubmit>` ile; formdaki diğer düğmeler `type="button"`.
- [ ] Hata alan altında, `aria-describedby` + `aria-invalid` ile bağlı; yalnız renge dayanmıyor.
- [ ] Hatalar blur ya da gönderimde çıkıyor, düzelince hemen kalkıyor.
- [ ] Gönderince odak ilk hatalı alana gidiyor.
- [ ] Gönderim sırasında düğme kilitli, metni değişiyor, genişliği sabit.
- [ ] Sunucu hatasında bütün girilen değerler yerinde duruyor.
- [ ] Sunucunun alan hataları ilgili alanda, kalanları form düzeyinde görünüyor.
- [ ] Telefonda (390 px ve 360 px) her alan doğru klavyeyi açıyor; yazı boyutu ≥ 16 px.
- [ ] Şifre alanlarında yapıştırma serbest; göster/gizle düğmesinin erişilebilir adı var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Projedeki `TextField`/`Field` bileşenlerini ve `validate` yardımcısını kullan. Her alana
  `autocomplete` ve doğru `type`/`inputMode` ver. Hataları blur ve gönderimde göster. Gönderimde düğmeyi kilitle;
  sunucu hatasını `fieldErrors` ile alanlara dağıt; hata olunca değerleri silme."
- **Modelin tipik hatası:** `<div>` + `onClick` ile form kurar; yer tutucuyu etiket yapar; her tuşta hata gösterir;
  `catch` içinde formu sıfırlar; kod/telefon için `type="number"` yazar; `autocomplete` hiç koymaz.
- **Çıktıda arayın:** `placeholder=` olup `label` olmayan alanlar; `type="number"`; `<button` olup `type`'ı olmayanlar;
  `aria-describedby` olmayan hata metni; `reset()` ya da `setValues(initial)` çağrısının hata dalında olması.
- **Test isteyin:** "Boş gönderimde ilk hatalı alana odak gider", "sunucu 422 dönünce değerler korunur ve hata alanın
  altında görünür", "çift tıklamada tek istek gider".

## İlgili

- [Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md) — erişilebilir ad, canlı bölgeler, odak
- [Hata ve boş durumlar](hata-ve-bos-durumlar.md) — hata metni kalıpları
- [Duyarlı tasarım ve mobil](duyarli-tasarim-ve-mobil.md) — ekran klavyesi, odakta yakınlaştırma
- Çalışan örnekler: [`Field.tsx`](../../uygulama/web/src/ui/Field.tsx), [`form.ts`](../../uygulama/web/src/lib/form.ts),
  site temelindeki iletişim formu [`contact-form.ts`](../../site/src/scripts/contact-form.ts)
