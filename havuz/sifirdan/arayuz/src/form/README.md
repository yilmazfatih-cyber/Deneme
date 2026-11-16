# form — form durum yöneticisi ve şema doğrulama

## Ne yapar

Bir formun bütün "dertlerini" tek yerde çözer: değerler, alan durumu (dokunuldu / kirli / hata /
doğrulanıyor), bağımlılıksız şema doğrulama, sunucuya soran eşzamansız doğrulama (yarışa dayanıklı), alan
dizileri (telefon listesi gibi), gönderim ve **erişilebilir** hata gösterimi. Çatıdan bağımsızdır; düz DOM için
`bindForm` köprüsü vardır.

```ts
import { createForm, bindForm, s } from './index.ts'

const sema = s.object({
  ad: s.string().min(2),
  eposta: s.string().email(),
  yas: s.number().int().min(18).optional(),
  telefonlar: s.array(s.object({ numara: s.string().pattern(/^\d{10}$/, '10 haneli numara girin.') })).min(1),
})
const form = createForm({
  schema: sema,
  initialValues: { ad: '', eposta: '', yas: '', telefonlar: [{ numara: '' }] },
  asyncValidators: { eposta: async (deger, { signal }) => ((await kayitliMi(deger, signal)) ? 'Bu adres kayıtlı.' : undefined) },
  onSubmit: async (deger) => kaydet(deger),
})
bindForm(form, document.querySelector('form')!)
```

## Nasıl çalışır

**Şema (`schema.ts`).** `s.string()`, `s.number()`, `s.boolean()`, `s.enumOf([...])`, `s.object({...})`,
`s.array(öğe)`; her birinde kurallar zincirlenir (`.min(2).max(50)`), `.optional()` ve `.refine(...)` vardır.
`parse` ya `{ ok: true, value }` ya da `{ ok: false, issues: [{ path, code, message }] }` döndürür.
Form girdisi dizgi olduğu için:

- `s.string()` kırpar; boş/boşluk dizgi "zorunlu" hatasıdır; uzunluk **grafem** (kullanıcının gördüğü
  karakter) sayısıyla ölçülür: `"👍🏽"` bir karakterdir.
- `s.number()` `"3,5"` ve `"3.5"` yazımlarını kabul eder; `"1.000,5"` gibi belirsiz yazımı reddeder.
- Her alan için **tek ileti** üretilir (ilk bozulan kural).
- Nesne düzeyinde çapraz kural: `.refine(v => v.sifre === v.sifreTekrar, 'Şifreler aynı değil.', ['sifreTekrar'])`.

**Türkçe iletiler (`messages.ts`).** Doğrulayıcı yalnız kod (`too_short`) üretir; metin tek sözlükte durur.
Sayı eklerindeki ses uyumu tuzağına (18'**den**, 40'**tan**, 6'**dan**) düşmemek için iletiler ek almayan
kalıplarla yazıldı: "En az 18 olmalı." Sayılar Türkçe biçimlenir: "En fazla 1.000 olabilir."

**Hata ne zaman görünür?** "Geç uyar, erken ödüllendir": alan dokunulmadan (odaktan çıkılmadan) ya da form bir
kez gönderilmeden hata gösterilmez; sonra her tuşta canlı güncellenir. Hata düzelince hemen kaybolur.

**Eşzamansız doğrulama ve yarış.**

```
yaz "ali"  ─► istek#1 başladı ───────────────────────────► "alınmış" döner → ATILIR (token eski)
yaz "ali2" ─► istek#1 iptal (signal.abort) ─► istek#2 ─► "uygun" döner → yazılır
```

Her yol için tek bir bekleyen istek vardır; yenisi başlayınca eskisinin `AbortSignal`'i iptal edilir ve geç
dönen eski yanıt sıra numarası (token) tutmadığı için atılır. Eşzamanlı (şema) hata varken sunucuya hiç
sorulmaz. Yazarken istekler `asyncDelayMs` (300 ms) gecikmeyle birleşir; odaktan çıkınca ve gönderimde hemen
çalışır. Doğrulayıcı çökerse kullanıcıya "şu an denetlenemedi, yeniden deneyin" denir.

**Alan dizileri (`field_array.ts`).** `arrayAppend`, `arrayRemove`, `arrayMove`. Silme/taşıma sonrasında
"telefonlar.2.numara"nın dokunuldu/hata/bekleyen istek bilgisi yeni indisine kaydırılır; silinen öğenin
bekleyen isteği iptal edilir. Her öğenin kalıcı bir anahtarı vardır (`arrayKeys`): liste yeniden çizilirken
giriş kutuları karışmaz.

**Erişilebilir DOM köprüsü (`dom.ts`).** `name` özniteliği alan yoludur. Hata metni
`[data-error-for="ad"]` öğesine (yoksa alanın arkasına açılan `<p>`'ye) yazılır; alan `aria-invalid="true"`
alır ve hata öğesinin kimliği `aria-describedby` listesine **eklenir** (alandaki ipucu kimlikleri korunur).
Geçersiz gönderimde DOM sırasındaki ilk hatalı alana odaklanılır. `novalidate` açılır: tarayıcının kendi
(İngilizce olabilen) baloncukları yerine bu iletiler kullanılır.

## Dosya haritası

| Dosya            | Sorumluluk                                                          |
| ---------------- | ------------------------------------------------------------------- |
| `schema.ts`      | Şema türleri ve kuralları, `parse`, grafem uzunluğu, sayı çözümleme |
| `messages.ts`    | Türkçe ileti sözlüğü (tek yer)                                      |
| `form.ts`        | Form denetleyicisi: değer, alan durumu, eşzamansız doğrulama, gönder |
| `field_array.ts` | Dizi işlemlerinde yol kaydırma, yol deseni eşleme (`*`)             |
| `path.ts`        | "a.b.0" yolları, değişmez okuma/yazma, derin eşitlik                |
| `dom.ts`         | `bindForm`, `renderForm`, `focusFirstError`                         |

## Sınırlar

- Şemada birleşim (`union`), ayrıştırılmış birleşim ve tarih türü yoktur; gerekirse `makeSchema` ile yazılır.
- Her değişiklikte şemanın tamamı yeniden çalışır (yüzlerce alanlı formlar için ölçülmedi).
- Dosya girdisi (`type="file"`) okunmaz.
- `bindForm` alan dizisinin satırlarını kendisi çizmez; satırları uygulama çizer (gösterimde örnek var).

## Buradan nereye

- `s.date()` ve `s.union()` şemaları; `s.string().tckn()` gibi Türkiye'ye özgü denetimler (kurallarıyla).
- `sanal_dom` için `useForm` kancası: `subscribe` ile bileşeni yeniden çizmek.
- Sunucudan dönen alan hatalarını (`{ eposta: '…' }`) forma yazan `setServerErrors`.
