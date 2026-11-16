---
baslik: Hata ve boş durumlar
ozet: Hata sınırı, ağ/doğrulama/yetki hatalarının ayrı gösterimi, yeniden deneme, boş durum türleri, yükleniyor ve çevrimdışı göstergesi; suçlamayan, yol gösteren metin kalıpları ve onları koruyan kural testi.
etiketler: [hata, bos-durum, ux, metin, react, onyuz]
duzey: temel
guncellik: 2026-11
---

# Hata ve boş durumlar

> Bu notu ne zaman okumalı: bir ekranın hata, boş, yükleniyor ya da çevrimdışı hâlini tasarlarken; hata iletisi
> yazarken; "uygulama beyaz sayfa oldu", "liste boş ama aslında hata vardı", "ileti kullanıcıyı suçluyor"
> şikâyetlerinde.

## Temel fikir

Hata ve boş ekran, tasarımın **parçasıdır**; mutlu yol bittikten sonra eklenen bir ayrıntı değil. Kullanıcı en çok
bu anlarda yardıma muhtaçtır. Her hata iletisi üç soruyu yanıtlar: **ne oldu**, **verim güvende mi**, **şimdi ne
yapabilirim**. Suçlamaz, teknik konuşmaz, bağırmaz; kırmızı çarpı ve puan kaybı gibi başarısızlık işaretleri
kullanmaz (Köprü ilke 5 ve 8).

Hatalar türe indirilir (ağ, doğrulama, oturum, izin, bulunamadı, çakışma, çok sık, sunucu, beklenmeyen); her tür
uygulamanın her yerinde **aynı biçimde** gösterilir. Bunu tek bir eşleme işlevi yapar; ekranlar kendi iletilerini
uydurmaz.

**Hata asla "boş" gösterilmez.** "Henüz görev yok" yazan ekran aslında veriyi okuyamamışsa kullanıcı verisini
kaybettiğini sanır.

## Hata sınırı (error boundary)

| Yakalar                                             | Yakalamaz                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| Alt bileşenlerin render sırasında fırlattığı hata   | Olay işleyicideki hata (React 19.3'te denendi: sınıra gitmedi)   |
| Yaşam döngüsü ve kurucu hataları                    | Eşzamansız kod (`setTimeout`, söz, effect içindeki `await` sonrası) |
|                                                     | Sınırın kendi hatası                                             |

- Kök sınırı (bütün uygulama) + **rota sınırı** (bir sayfa çökünce kabuk ve gezinme yaşasın) + riskli parçalar
  (grafik, üçüncü taraf bileşen) için ayrı sınır.
- Rota sınırı yol değişince sıfırlanmalı: `<ErrorBoundary key={location.pathname}>`.
- Olay işleyici ve eşzamansız hatalar `try/catch` + durumla gösterilir (ör. onay penceresinde ileti).
- Raporlama: `createRoot(el, { onCaughtError, onUncaughtError })` (React 19; `onCaughtError` 19.3'te denendi).
  Rapora kişisel veri koymayın.
- Kullanıcı yığın izini (stack trace) görmez; yalnız geliştirmede görünür. Yerel-önce uygulamada iletinin söylemesi
  gereken: "Verileriniz bu cihazda güvende. Sayfayı yenileyip devam edebilirsiniz." Çalışan örnek:
  [`ErrorBoundary.tsx`](../../uygulama/web/src/app/ErrorBoundary.tsx).

## Hata türleri ve gösterimi

| Tür (kaynak)                       | Gösterim                                       | Eylem                                    | Girilen veri |
| ---------------------------------- | ---------------------------------------------- | ---------------------------------------- | ------------ |
| Ağ / zaman aşımı                   | Ekranda ya da bildirimde; eldeki veri yerinde  | "Yeniden dene"; çevrimiçi olunca kendiliğinden | Korunur |
| Doğrulama (400/422)                | Alanın altında, alan alan                      | Alanı düzeltmek; odak ilk hatalı alana   | Korunur      |
| Oturum düştü (401)                 | Pencere ya da şerit: "Oturumunuz kapandı"      | Yeniden giriş; sonra aynı yere dönüş     | Korunur      |
| İzin yok (403)                     | Sayfa içinde sakin açıklama                    | Geri dön / yetkiliye sor                 | Korunur      |
| Bulunamadı (404)                   | "Bu kayıt artık yok" ekranı                    | Listeye dön                              | —            |
| Çakışma (409)                      | "Bu kayıt başka bir yerde değişti"             | Yenile ve karşılaştır / üzerine yaz      | Korunur      |
| Çok sık (429)                      | "Biraz bekleyip yeniden deneyin" + süre        | Bekle (düğme süre bitince açılır)        | Korunur      |
| Sunucu (5xx)                       | "Bizden kaynaklı bir sorun"                    | Yeniden dene                             | Korunur      |
| Beklenmeyen                        | Genel ileti                                    | Yenile                                   | Korunur      |
| Kullanıcının iptali (`AbortError`) | **Hiçbir şey**                                 | —                                        | —            |

```js calistir
import assert from 'node:assert/strict'

// Her hatayı bir türe indir; tür, iletiyi ve sunulacak eylemi belirler. Ekranlar bunu kendileri uydurmaz.
function classifyError(error) {
  if (error?.name === 'AbortError') return { kind: 'iptal', show: false }
  if (error?.name === 'NetworkError' || error?.name === 'TimeoutError') return { kind: 'ag', action: 'yeniden-dene', show: true }
  const status = error?.status
  if (status === 400 || status === 422) return { kind: 'dogrulama', action: 'alanlari-duzelt', show: true }
  if (status === 401) return { kind: 'oturum', action: 'yeniden-giris', show: true }
  if (status === 403) return { kind: 'izin', action: 'geri-don', show: true }
  if (status === 404) return { kind: 'bulunamadi', action: 'listeye-don', show: true }
  if (status === 409) return { kind: 'cakisma', action: 'yenile-ve-karsilastir', show: true }
  if (status === 429) return { kind: 'cok-sik', action: 'bekle', show: true }
  if (status >= 500) return { kind: 'sunucu', action: 'yeniden-dene', show: true }
  return { kind: 'beklenmeyen', action: 'yenile', show: true }
}

assert.equal(classifyError({ name: 'AbortError' }).show, false) // kullanıcı vazgeçti: ileti yok
assert.equal(classifyError({ name: 'NetworkError' }).action, 'yeniden-dene')
assert.equal(classifyError({ status: 422 }).kind, 'dogrulama')
assert.equal(classifyError({ status: 401 }).action, 'yeniden-giris')
assert.equal(classifyError({ status: 503 }).kind, 'sunucu')
assert.equal(classifyError(new TypeError('x is undefined')).kind, 'beklenmeyen')
console.log('tamam')
```

```cikti
tamam
```

Uygulama temelindeki karşılığı: [`errors.ts`](../../uygulama/web/src/lib/errors.ts) (`NetworkError`, `errorMessage`,
`fieldErrors`); sunucu hatalarının kodları ortak pakette ([`errors.ts`](../../uygulama/shared/src/errors.ts)).

## Yeniden dene

- "Yeniden dene" düğmesi eldeki veriyi silmez; basınca düğmenin içinde gösterge döner, sonuç gelince ya kaybolur ya
  da ileti güncellenir ("Yine olmadı. İnternet gelince kendiliğinden deneyeceğiz.").
- Çevrimdışı hatası için çoğu zaman düğmeye bile gerek yoktur: `online` olayında kendiliğinden yeniden deneyin.
- İki-üç başarısız elle denemeden sonra başka bir yol önerin (sonra dene, veriyi dışa aktar, destekle iletişim).
- Otomatik yeniden deneme kuralları (hangi hata, kaç kez, ne aralıkla): [veri getirme](veri-getirme.md#yeniden-deneme).

## Boş durum tasarımı

| Boşluğun nedeni                      | Başlık örneği                     | Tek eylem                    | Ton                        |
| ------------------------------------ | --------------------------------- | ---------------------------- | -------------------------- |
| İlk kullanım (hiç kayıt yok)         | "İlk görevinizi ekleyin"          | Görev ekle                   | Yol gösteren               |
| Arama sonuç vermedi                  | "\"süt\" için sonuç yok"          | Aramayı temizle              | Aranan sözcüğü gösteren    |
| Süzgeç her şeyi gizledi              | "Bu süzgeçte görev yok"           | Süzgeçleri kaldır            | Nedenini söyleyen          |
| Her şey bitti (açık görev kalmadı)   | "Hepsi tamam"                     | (yok ya da "Yeni görev")     | Sakin, olumlu              |
| Veri gelemedi (hata)                 | **Boş durum değil**: hata gösterimi | Yeniden dene               | —                          |
| Çevrimdışı ve önbellekte hiç yok     | "İnternet gelince burada görünecek" | —                          | Bilgi veren                |

```js calistir
import assert from 'node:assert/strict'

function emptyState({ status, total, visible, query, filtersActive }) {
  if (status === 'error') return null // hata ekranı ayrı: boş değil!
  if (visible > 0) return null
  if (total === 0) return { title: 'İlk görevinizi ekleyin', action: 'Görev ekle' }
  if (query) return { title: `"${query}" için sonuç yok`, action: 'Aramayı temizle' }
  if (filtersActive) return { title: 'Bu süzgeçte görev yok', action: 'Süzgeçleri kaldır' }
  return { title: 'Hepsi tamam', action: null }
}

assert.equal(emptyState({ status: 'error', total: 0, visible: 0 }), null)
assert.equal(emptyState({ status: 'success', total: 0, visible: 0 }).action, 'Görev ekle')
assert.equal(emptyState({ status: 'success', total: 12, visible: 0, query: 'süt' }).title, '"süt" için sonuç yok')
assert.equal(emptyState({ status: 'success', total: 12, visible: 0, filtersActive: true }).action, 'Süzgeçleri kaldır')
assert.deepEqual(emptyState({ status: 'success', total: 12, visible: 0 }), { title: 'Hepsi tamam', action: null })
console.log('tamam')
```

Boş durumun yapısı: sakin bir simge (çocuksu çizim değil) + kısa başlık + bir cümle + **tek** birincil eylem.
Hazır bileşen: uygulama temelinde `EmptyState` ([`Surface.tsx`](../../uygulama/web/src/ui/Surface.tsx)).

## Yükleniyor ve çevrimdışı

- Yükleniyor: düzen biliniyorsa iskelet, değilse 300 ms gecikmeli gösterge; tazelerken veri yerinde kalır. Ayrıntı:
  [animasyon ve etkileşim](animasyon-ve-etkilesim.md#iskelet--döndürücü).
- Çevrimdışı göstergesi küçük ve sürekli görünür bir durum işaretidir (üst çubukta "Çevrimdışı" ya da eşitleme
  simgesi), okumayı engelleyen bir pencere değildir. Yanında bekleyen değişiklik sayısı ve son eşitleme zamanı:
  "Çevrimdışı, 3 değişiklik bekliyor". Çalışan örnek:
  [`SyncIndicator.tsx`](../../uygulama/web/src/features/sync/SyncIndicator.tsx).
- `navigator.onLine === false` kesin bilgidir; `true` internet olduğunu kanıtlamaz (bkz. [veri getirme](veri-getirme.md)).

## Metin kalıpları

Kalıp: **[Ne oldu.] [Ne yapılabilir.]** Gerekiyorsa üçüncü cümle: [Verin güvende.]

| Yazmayın                                        | Yazın                                                          | Neden                                   |
| ----------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| "Hata 500"                                      | "Kaydedilemedi. Biraz sonra yeniden deneyin."                  | Teknik kod kullanıcıya bir şey söylemez |
| "Geçersiz giriş!"                               | "E-posta adresinde @ işareti olmalı."                          | Neyin nasıl düzeleceğini söyle          |
| "Yanlış şifre girdiniz."                        | "E-posta ya da şifre eşleşmedi."                               | Suçlamaz; hesap varlığını da sızdırmaz  |
| "İşlem başarısız oldu."                         | "Davet gönderilemedi. İnternet gelince yeniden deneyin."       | Hangi işlem, ne yapmalı                 |
| "Network error: Failed to fetch"                | "Bağlantı yok. Değişiklikleriniz bu cihazda bekliyor."         | Veri güvende mi sorusunu yanıtlar       |
| "Bu sayfaya erişim yetkiniz yok!"               | "Bu listeyi yalnız sahibi düzenleyebilir."                     | Nedenini sakin söyler                   |
| "Emin misiniz?"                                 | "Görev silinsin mi? Çöp kutusundan geri alabilirsiniz."        | Ne olacağını ve geri dönüşü söyler      |
| "Veri yok"                                      | "Henüz görev yok. Yukarıdaki kutuya ilkini yazın."             | Boşluğu bir sonraki adıma çevirir       |

Kurallar: etken ve kısa cümle (Köprü'de en çok 6 sözcük); "siz yaptınız" kalıbı yok; ünlem yok; teknik terim yok;
düğme metni eylem fiili ("Yeniden dene", "Giriş yap"), "Tamam" değil. Metinler sözlükte durduğu için kural testiyle
korunur:

```js calistir
import assert from 'node:assert/strict'

// Kural testi: hata/boş durum metinlerinde suçlayan ya da teknik sözcük, ünlem ve uzun cümle yok.
const BANNED = new Map([
  ['geçersiz', 'suçlayan sözcük'], ['hatalı', 'suçlayan sözcük'], ['yanlış', 'suçlayan sözcük'],
  ['başarısız', 'olumsuz sözcük'], ['exception', 'teknik sözcük'], ['null', 'teknik sözcük'], ['undefined', 'teknik sözcük'],
])
// Türkçe sözcük sınırı: JavaScript'in \b'si ş, ı, ğ harflerini sözcük harfi saymaz; \p{L} ile bölün.
const words = (text) => text.toLocaleLowerCase('tr-TR').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
function lint(messages, maxWords) {
  const problems = []
  for (const [key, text] of Object.entries(messages)) {
    for (const word of new Set(words(text))) if (BANNED.has(word)) problems.push(`${key}: "${word}" (${BANNED.get(word)})`)
    if (text.includes('!')) problems.push(`${key}: ünlem`)
    for (const sentence of text.split(/[.?]/).map((s) => s.trim()).filter(Boolean)) {
      const count = sentence.split(/\s+/).length
      if (count > maxWords) problems.push(`${key}: ${count} sözcüklük cümle`)
    }
  }
  return problems
}

const good = { 'error.network': 'Bağlantı yok. İnternet gelince yeniden deneyin.', 'error.save': 'Kaydedilemedi. Bir daha deneyin.' }
const bad = {
  'error.email': 'Geçersiz e-posta girdiniz!',
  'error.server': 'Exception: null',
  'error.long': 'Sunucuyla bağlantı kurulamadığı için yaptığınız son değişiklikler şu anda kaydedilemiyor.',
}
assert.deepEqual(lint(good, 6), [])
assert.deepEqual(lint(bad, 6), [
  'error.email: "geçersiz" (suçlayan sözcük)',
  'error.email: ünlem',
  'error.server: "exception" (teknik sözcük)',
  'error.server: "null" (teknik sözcük)',
  'error.long: 10 sözcüklük cümle',
])
assert.equal(/\byanlış\b/.test('yanlış şifre'), false) // \b tuzağı: Türkçe harfle biten sözcüğü kaçırır
console.log('tamam')
```

## Tuzaklar

| Belirti                                                   | Neden                                                      | Çözüm                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| Bir bileşen çökünce bütün uygulama beyaz sayfa            | Hata sınırı yok ya da yalnız kökte                         | Kök + rota sınırı; rota sınırı yol değişince sıfırlanır     |
| Düğmeye basınca hata oldu ama ekranda hiçbir şey yok      | Olay işleyici hatası sınıra gitmez, `catch` yok            | `try/catch` + durum ile ileti                               |
| "Henüz görev yok" yazıyor ama görevler var                | Okuma hatası boş liste olarak gösterilmiş                  | Hata ayrı durum                                             |
| Her ekranda farklı hata metni                             | İletiler ekranlarda uydurulmuş                             | Tek `classifyError`/`errorMessage` eşlemesi                 |
| Kullanıcı paylaşımı kapatınca "Hata oluştu"               | `AbortError` hata sayılmış                                 | İptali sessiz geçin                                         |
| Doğrulama hatasında form boşaldı                          | Hata dalında form sıfırlandı                               | Veri korunur ([formlar](formlar.md))                        |
| Oturum düşünce kullanıcı yazdığını kaybetti               | 401'de doğrudan giriş sayfasına yönlendirme                | Pencereyle yeniden giriş; taslak yerinde                    |
| Çevrimdışıyken tam ekran engelleyici pencere              | Çevrimdışı hata gibi ele alınmış                           | Küçük durum göstergesi; okuma serbest                       |
| İleti teknik ya da suçlayıcı                              | Metin yazımına kural yok                                   | Kalıp + kural testi                                         |

## Denetim listesi

- [ ] Kök ve rota düzeyinde hata sınırı var; rota sınırı yol değişince sıfırlanıyor; yığın izi yalnız geliştirmede.
- [ ] Olay işleyici ve eşzamansız işlerin hataları yakalanıp ekranda gösteriliyor.
- [ ] Bütün hatalar tek eşleme işlevinden geçiyor; `AbortError` sessiz.
- [ ] Her listenin dört boş durumu (ilk kullanım, arama, süzgeç, bitti) ayrı ve hata boş gösterilmiyor.
- [ ] Hata iletileri "ne oldu + ne yapılabilir" kalıbında; ünlem, suçlama, teknik terim yok (kural testi var).
- [ ] Hatada girilen veri korunuyor; 401'de yeniden girişten sonra aynı yere dönülüyor.
- [ ] Çevrimdışı göstergesi ve bekleyen değişiklik sayısı görünür; okuma engellenmiyor.
- [ ] Hata, boş ve çevrimdışı hâllerin ekran görüntüsü 360 px'te alındı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu ekranın hata, boş (ilk kullanım/arama/süzgeç), yükleniyor ve çevrimdışı hâllerini yaz. Hata
  iletisini `errorMessage`/`classifyError`'dan al; kendin ileti uydurma. Metinler sözlükte, 'ne oldu + ne yapılabilir'
  kalıbında, ünlemsiz. Hatada girilen veriyi silme."
- **Modelin tipik hatası:** Yalnız mutlu yolu yazar; `catch` bloğunda `console.error` ile yetinir ya da boş listeye
  çevirir; "Bir hata oluştu!" gibi genel ve ünlemli ileti yazar; `AbortError`'ı hata olarak gösterir; boş durumu tek
  bir "Veri yok" ile geçer.
- **Çıktıda arayın:** boş ya da yalnız `console` içeren `catch`; `catch` içinde `set…([])`; `!` ile biten sözlük
  metinleri; "hata oluştu", "geçersiz", "başarısız" sözcükleri; `ErrorBoundary` olmayan rota.
- **Test isteyin:** sahte API ile 500, 401, ağ hatası ve boş yanıt; her biri için doğru ileti ve eylemin göründüğünü
  sınayan bileşen testi.

## İlgili

- [Veri getirme](veri-getirme.md) — dört durum, yeniden deneme, çevrimdışı
- [Formlar](formlar.md) — doğrulama hatalarının gösterimi
- [Animasyon ve etkileşim](animasyon-ve-etkilesim.md) — yükleniyor göstergeleri
- [Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md) — canlı bölgelerle duyurma
- Sözlükteki gerçek iletiler: [`tr.json`](../../uygulama/web/src/i18n/tr.json)
- Başka kümelerde: [Hata yönetimi ve günlükleme](../30-arkauc/hata-yonetimi-ve-gunlukleme.md) (sunucu tarafı), [UX temelleri](../95-urun/ux-temelleri.md) (boş ve ilk durum)
