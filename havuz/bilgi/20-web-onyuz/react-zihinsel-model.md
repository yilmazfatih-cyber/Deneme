---
baslik: React zihinsel modeli
ozet: Render'ın saf bir hesap, durumun anlık görüntü olduğu model; yeniden render'ı ne tetikler, anahtar ve kimlik, türetilmiş durum ve bayat değer hatası.
etiketler: [react, durum, render, anahtar, onyuz]
duzey: orta
guncellik: 2026-11
---

# React zihinsel modeli

> Bu notu ne zaman okumalı: bir React bileşeni "bir adım geriden" geliyorsa, liste öğeleri birbirinin verisini
> alıyorsa, ekran güncellenmiyorsa ya da gereksiz yere çok render oluyorsa; yeni bir bileşen yazmadan önce de.

## Temel fikir

- **Ekran = f(durum, props).** Bileşen bir işlevdir; React onu çağırır (render), dönen ağacı öncekiyle karşılaştırır
  ve yalnız farkı DOM'a yazar (commit). Render bir **hesaptır**: aynı girdiye aynı çıktı, yan etki yok.
- **Durum bir anlık görüntüdür.** Bir render içinde `count` sabittir. `setCount` o değişkeni değiştirmez; yeni bir
  render ister. Olay işleyici, kendisini oluşturan render'ın değerlerini görür.
- **Güncellemeler kuyruğa girer ve toplanır.** Bir olay işleyicide, zamanlayıcı geri çağrısında ya da söz (Promise)
  devamında art arda yapılan bütün `set` çağrıları tek render'da uygulanır (19.3'te `setTimeout` içinde de denendi).
- **Kimlik = ağaçtaki yer + tür + `key`.** React durumu bileşen işlevine değil, ağaçtaki konuma bağlar. Konum ya da
  anahtar değişirse durum sıfırlanır; aynı kalırsa durum korunur (istemeseniz bile).
- **Hesaplanabilen şey durum değildir.** Props'tan ya da başka durumdan türetilebilen değer render sırasında hesaplanır.

## Karar tablosu: bu değer nerede durmalı?

| Durum                                                         | Seçim                                    | Neden                                                    |
| ------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Props'tan ya da başka durumdan hesaplanabiliyor               | Render'da hesapla (pahalıysa `useMemo`)  | İki kaynak birbirinden kopar; fazladan render            |
| Değişince ekran değişmeli                                     | `useState` / `useReducer`                | Render'ı yalnız durum tetikler                           |
| Değişince ekran değişmemeli (zamanlayıcı kimliği, DOM düğümü) | `useRef`                                 | Ref değişimi render tetiklemez                           |
| Birden çok bileşen okuyor/yazıyor                             | En yakın ortak ataya taşı                | Tek kaynak; ayrıntı: [durum yönetimi](durum-yonetimi-secimi.md) |
| Sunucudan geliyor                                             | Veri katmanı / önbellek                  | Kopyası bayatlar; ayrıntı: [veri getirme](veri-getirme.md) |
| Yenileyince, paylaşınca korunmalı (süzgeç, sekme, sayfa)      | URL                                      | Ayrıntı: [yönlendirme](yonlendirme-ve-url.md)            |
| Cihazda kalıcı kullanıcı verisi                               | IndexedDB + canlı sorgu                  | Tek doğruluk kaynağı yerel veritabanıdır                 |
| Liste içinde seçili öğe                                       | Yalnız `selectedId`                      | Nesnenin kopyası düzenlemede bayatlar (aşağıda)          |

## Yeniden render'ı ne tetikler

| Olay                                                      | Render olur mu?                  | Not                                                  |
| --------------------------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| Bileşenin kendi durumu `Object.is` ile farklı bir değere geçti | Evet                        | Aynı değer verilirse çoğunlukla atlanır              |
| Ebeveyn render oldu                                       | Evet (props aynı olsa bile)      | `memo` ile sarılı ve props'u sığ eşitse atlanır      |
| Okunan bağlamın (context) değeri değişti                  | Evet, `memo` olsa bile           | Her render'da yeni nesne verilirse hep değişir       |
| `ref.current` değişti                                     | Hayır                            | Ekranda görünecekse durum olmalı                     |
| Dış depo (`useSyncExternalStore`) yeni anlık görüntü verdi | Evet                            | Anlık görüntü önbellekli olmalı, yoksa sonsuz döngü  |
| Yerinde değiştirilmiş (mutate) dizi/nesne aynı başvuruyla verildi | Hayır                    | Klasik "ekran güncellenmiyor" hatası                 |

Render olması kötü değildir; yavaş olan, gereksiz render'ın pahalı alt ağacı da gezmesidir. Önce ölçün (React
DevTools Profiler), sonra `memo` düşünün.

## Durum anlık görüntüdür: kuyruk nasıl işler

Aşağıdaki benzetim React'in kuyruk kuralını gösterir. Dört sonuç gerçek React 19.3 ile jsdom'da da denendi
(`setCount(count + 1)` üç kez → 1; güncelleyici işlevle → 3; karışık → 6 ve 42).

```js calistir
import assert from 'node:assert/strict'

// React'in durum kuyruğunun küçük benzetimi (gerçek React değil; kuralı göstermek için).
// İşleyici, render anındaki değeri (anlık görüntü) görür; set yalnız kuyruğa ekler.
function runHandler(snapshot, handler) {
  const queue = []
  handler(snapshot, (action) => queue.push(action))
  return queue.reduce((state, action) => (typeof action === 'function' ? action(state) : action), snapshot)
}

// YANLIŞ: üç kez "count + 1" → üçü de "0 + 1" der
assert.equal(runHandler(0, (count, set) => { set(count + 1); set(count + 1); set(count + 1) }), 1)
// DOĞRU: güncelleyici işlev bir öncekinin sonucunu alır
assert.equal(runHandler(0, (_, set) => { set((c) => c + 1); set((c) => c + 1); set((c) => c + 1) }), 3)
// Değer "şununla değiştir", işlev "öncekine uygula" demektir
assert.equal(runHandler(0, (n, set) => { set(n + 5); set((x) => x + 1) }), 6)
assert.equal(runHandler(0, (_, set) => { set((x) => x + 1); set(42) }), 42)
// set'ten hemen sonra okunan değer ESKİDİR (bu render'ın anlık görüntüsü)
runHandler(0, (count, set) => { set(count + 1); assert.equal(count, 0) })
console.log('tamam')
```

```cikti
tamam
```

Kural: yeni değer öncekine dayanıyorsa **her zaman** güncelleyici işlev yazın: `setCount((c) => c + 1)`,
`setItems((list) => [...list, item])`. Değeri hemen kullanmanız gerekiyorsa bir değişkende hesaplayın, hem
`set`'e hem de sonraki koda o değişkeni verin.

## Anahtarlar ve kimlik

React liste öğesinin yerel durumunu (yazılmış taslak, açık/kapalı, odak) **anahtara** bağlar.

```js calistir
import assert from 'node:assert/strict'

// Yerel durum anahtara göre taşınır; yeni anahtar yeni (boş) bileşen demektir.
function carryState(oldKeys, oldStates, newKeys) {
  const byKey = new Map(oldKeys.map((key, i) => [key, oldStates[i]]))
  return newKeys.map((key) => byKey.get(key) ?? '')
}

const items = [{ id: 'a', ad: 'Ayşe' }, { id: 'b', ad: 'Bora' }, { id: 'c', ad: 'Cem' }]
const drafts = ['Ayşe notu', 'Bora notu', 'Cem notu']
const afterDelete = items.slice(1) // Ayşe silindi

// YANLIŞ: key={index} → Bora'nın satırı Ayşe'nin taslağını alır, Cem'inki Bora'nınkini
const byIndex = carryState(items.map((_, i) => i), drafts, afterDelete.map((_, i) => i))
assert.deepEqual(byIndex, ['Ayşe notu', 'Bora notu'])

// DOĞRU: key={item.id} → her taslak kendi satırında kalır
const byId = carryState(items.map((x) => x.id), drafts, afterDelete.map((x) => x.id))
assert.deepEqual(byId, ['Bora notu', 'Cem notu'])
console.log('tamam')
```

| Anahtar seçimi                     | Ne zaman                                                    |
| ---------------------------------- | ----------------------------------------------------------- |
| Kaydın kalıcı kimliği (`item.id`)  | Neredeyse her zaman                                         |
| Dizin (`index`)                    | Yalnız liste hiç sıralanmıyor, silinmiyor, araya eklenmiyorsa ve öğelerin yerel durumu yoksa |
| Render'da üretilen (`Math.random()`, `crypto.randomUUID()`) | **Asla**: her render'da yeni bileşen; odak ve yazı kaybolur |
| Yeni kayıt için geçici kimlik      | Oluştururken bir kez üretip kayda yazın (render'da değil)   |

**Anahtar bir sıfırlama aracıdır.** Kişi değişince taslağın boşalması gerekiyorsa `<Draft key={personId} />` yazın;
anahtar değişince React eski bileşeni atıp yenisini kurar. Anahtarsız denemede, kişi değişse de taslak eski
kişinin yazısıyla kaldı; anahtarla boşaldı (React 19.3, jsdom'da denendi). Bunu `useEffect` ile durumu sıfırlayarak
yapmayın: bir kare boyunca yanlış veri görünür ve fazladan render olur.

Aynı kural yer için de geçerlidir: `{isAdmin ? <Form /> : <Form />}` iki dalda aynı türü aynı yerde render ettiği
için durum korunur. Sıfırlanması gerekiyorsa farklı `key` verin.

## Türetilmiş durumu saklamayın

```js calistir
import assert from 'node:assert/strict'

let items = [{ id: 1, title: 'Süt al' }, { id: 2, title: 'İlaç saati' }]

// YANLIŞ: seçili NESNEYİ ayrı durumda tutmak (bir kopya)
const selectedItem = items[0]
// DOĞRU: yalnız kimliği tut, nesneyi her render'da türet
const selectedId = 1
const selected = () => items.find((item) => item.id === selectedId)

// Kullanıcı başlığı düzenledi (değişmez güncelleme: yeni dizi, yeni nesne)
items = items.map((item) => (item.id === 1 ? { ...item, title: 'Süt ve ekmek al' } : item))

assert.equal(selectedItem.title, 'Süt al') // bayat kopya: ekranda eski başlık
assert.equal(selected().title, 'Süt ve ekmek al') // türetilen: her zaman güncel
console.log('tamam')
```

Sık görülen türetilmiş durumlar: `fullName` (ad + soyad), süzülmüş liste, toplam tutar, "form geçerli mi",
"seçili öğe", "kaydedilmemiş değişiklik var mı" (taslak ≠ kayıtlı hâl). Hepsi render'da hesaplanır. Hesap pahalıysa
(binlerce öğe, ölçülmüş) `useMemo` ile sarılır; yine de durum olmaz.

Props değişince durumun bir **parçasını** ayarlamak gerekiyorsa (tamamını değil): önce yeniden tasarlamayı deneyin
(çoğu zaman kimlik saklayıp türetmek çözer). Olmuyorsa render sırasında önceki değeri karşılaştırın:

```tsx
// Gösterim: liste değişince seçimi temizle. Effect yok; React aynı render'da yeniden hesaplar.
const [prevItems, setPrevItems] = useState(items)
if (items !== prevItems) {
  setPrevItems(items)
  setSelection(null)
}
```

## Değişmezlik: yerinde değiştirmeyin

```js calistir
import assert from 'node:assert/strict'

// React yeni durumu eskisiyle Object.is ile karşılaştırır; aynıysa render'ı atlayabilir.
const willRender = (prev, next) => !Object.is(prev, next)

const list = ['süt']
list.push('ekmek') // YANLIŞ: yerinde değişti, başvuru aynı
assert.equal(willRender(list, list), false) // "değişmedi" sanılır, ekran güncellenmez

const prev = ['süt']
assert.equal(willRender(prev, [...prev, 'ekmek']), true) // DOĞRU: yeni dizi

const user = { ad: 'Ayşe', adres: { il: 'İzmir' } }
const moved = { ...user, adres: { ...user.adres, il: 'Muğla' } } // iç nesne de kopyalandı
assert.equal(user.adres.il, 'İzmir')
assert.equal(moved.adres.il, 'Muğla')

const shallow = { ...user } // YANLIŞ: yalnız dış kopya
shallow.adres.il = 'Bursa'
assert.equal(user.adres.il, 'Bursa') // eski anlık görüntü de bozuldu
console.log('tamam')
```

Dizi işlemleri: ekle `[...a, x]`; sil `a.filter(...)`; değiştir `a.map(...)`; sırala `a.toSorted(...)` (`sort` yerinde
sıralar); ters çevir `a.toReversed()`; araya ekle `a.toSpliced(i, 0, x)`.

## Render saf olmalı: render içinde yapılmayacaklar

| Render içinde yapılan                                  | Sonuç                                              | Yeri                                   |
| ------------------------------------------------------ | -------------------------------------------------- | -------------------------------------- |
| `fetch`, `localStorage.setItem`, analitik olayı        | Sıkı kipte iki kez çalışır; her render'da tekrar   | Olay işleyici ya da effect             |
| Props/durum nesnesini değiştirmek                      | Eski anlık görüntü bozulur, hata izlenemez         | Kopyalayarak yeni değer üret           |
| `Math.random()`, `Date.now()` ile kimlik/değer         | Her render farklı; sunucu-istemci uyuşmaz          | Olay anında üretip duruma yaz; saat parametreyle verilir |
| Koşulsuz `setState`                                    | Sonsuz döngü ("Too many re-renders")               | Olay işleyici; ya da yukarıdaki karşılaştırmalı kalıp |
| `ref.current` okuyup ekrana basmak                     | Ekran güncellenmez                                 | Durum kullanın                         |

Geliştirmede `<StrictMode>` bileşenleri iki kez render eder ve effect'leri kur → temizle → kur sırasıyla çalıştırır
(React 19.3'te denendi). Amaç saf olmayan render'ı ortaya çıkarmaktır; üretimde olmaz. "İki kez çalışıyor" şikâyetinin
çözümü StrictMode'u kapatmak değil, işi doğru yere taşımaktır.

## Tuzaklar

| Belirti                                                       | Neden                                                          | Çözüm                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| Sayaç üç kez artırılınca bir artıyor                          | `set(count + 1)` aynı anlık görüntüyü üç kez kullanıyor        | `set((c) => c + 1)`                                          |
| `setX(v)` sonrası `console.log(x)` eski değeri yazıyor        | Durum anlık görüntü; değişken bu render'da değişmez            | Yeni değeri değişkende hesaplayıp onu kullanın               |
| Satır silince yanındaki satırın yazısı/onay kutusu kayıyor    | `key={index}`                                                  | `key={item.id}`                                              |
| Her tuşta giriş alanı odağı kaybediyor                        | Anahtar render'da üretiliyor ya da bileşen başka bileşenin içinde tanımlı | Kalıcı anahtar; bileşeni modül düzeyinde tanımlayın |
| Kişi/sayfa değişince eski form verisi kalıyor                 | Aynı yer + aynı tür → durum korunur                            | `key={personId}`                                             |
| Düzenlenen kayıt detay panelinde eski görünüyor               | Seçili nesnenin kopyası durumda                                | `selectedId` saklayıp türetin                                |
| `push` sonrası ekran değişmiyor                               | Aynı başvuru; `Object.is` eşit                                 | Yeni dizi/nesne üretin                                       |
| Önceki durum da "değişmiş" görünüyor                          | Sığ kopya; iç nesne paylaşılıyor                               | Değişen her düzeyi kopyalayın                                |
| Effect içinde durum eşitleniyor, ekran bir kare yanlış        | Türetilmiş durum effect'le senkronlanıyor                      | Render'da hesaplayın                                         |
| `memo`'lu bileşen yine de render oluyor                       | Props'ta her render'da yeni nesne/işlev ya da bağlam değişiyor | Değeri sabitleyin ya da `memo`'yu kaldırın (ölçün)           |

## Denetim listesi

- [ ] Her liste öğesinin anahtarı kaydın kalıcı kimliği; render'da üretilen anahtar yok.
- [ ] Önceki değere dayanan her `set` güncelleyici işlev kullanıyor.
- [ ] Props'tan/durumdan hesaplanabilen hiçbir değer `useState`'te tutulmuyor.
- [ ] Seçim, düzenleme gibi yerlerde nesne değil kimlik saklanıyor.
- [ ] Durum güncellemeleri yeni dizi/nesne üretiyor; `push`, `splice`, `sort`, doğrudan atama yok.
- [ ] Render içinde ağ isteği, depolama yazımı, rastgele kimlik üretimi yok.
- [ ] "Sıfırlanmalı" durumlar `key` ile sıfırlanıyor, effect ile değil.
- [ ] Bileşenler modül düzeyinde tanımlı (başka bileşenin gövdesinde bileşen tanımı yok).
- [ ] Uygulama geliştirmede `<StrictMode>` içinde çalışıyor ve konsolda uyarı yok.

## Küçük modele yaptırırken

- **İsteme yazın:** "Türetilebilen değeri durumda tutma, render'da hesapla. Liste anahtarı `id` olsun. Önceki değere
  dayanan güncellemede güncelleyici işlev kullan. Effect'i yalnız dış sistemle eşitlemek için kullan."
- **Modelin tipik hatası:** Her şeyi `useState` + `useEffect` ile eşitler ("`filtered` durumu, `items` değişince
  effect'te güncellenir"). Bu hem fazladan render hem bir kare bayat ekran demektir.
- **İkinci tipik hata:** `key={index}` ya da `key={Math.random()}` yazar; silme/sıralama olan listede ikisi de hatadır.
- **Çıktıda arayın:** `useEffect(() => { set…(` kalıbı (çoğu türetilmiş durumdur); `key={i}`, `key={index}`;
  `.push(`, `.sort(`, `.splice(` ile durum değişimi; `setX(x + 1)` gibi aynı olayda tekrarlanan güncellemeler.
- **Test isteyin:** "Ortadaki öğeyi silince komşu satırın yazısı yerinde kalıyor" ve "kişi değişince taslak boşalıyor"
  davranışlarını sınayan bileşen testi.

## İlgili

- [React etkileri ve kancalar](react-etkiler-ve-kancalar.md) — effect'e gerçekten ne zaman gerek var
- [Durum yönetimi seçimi](durum-yonetimi-secimi.md) — durum türüne göre yer seçimi
- [Veri getirme](veri-getirme.md) — sunucu verisi neden "durum" değil "önbellek"
- Çalışan örnek, yerel veritabanından canlı okuma (durum kopyası yok): [`hooks.ts`](../../uygulama/web/src/lib/store/hooks.ts)
- Dış depoya `useSyncExternalStore` ile abone olma: [`pwa.ts`](../../uygulama/web/src/lib/pwa.ts)
- Başka kümelerde: [JavaScript çalışma zamanı](../10-diller/javascript-calisma-zamani.md) (kapanım, `Object.is`, sığ/derin kopya), [TypeScript tip sistemi](../10-diller/typescript-tip-sistemi.md) (ayrık birleşim)
