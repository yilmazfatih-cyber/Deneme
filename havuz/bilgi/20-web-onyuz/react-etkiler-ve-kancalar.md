---
baslik: React etkileri ve kancalar
ozet: Effect'e ne zaman gerek olduğu, bağımlılık dizisi, temizlik, bayat kapanım, geliştirmede çifte çalışma, veri getirmede yarış ve kanca kuralları.
etiketler: [react, kanca, effect, onyuz, eszamansiz]
duzey: orta
guncellik: 2026-11
---

# React etkileri ve kancalar

> Bu notu ne zaman okumalı: `useEffect` yazmadan önce; effect sonsuz döngüye girdiğinde, iki kez çalıştığında,
> eski değeri gördüğünde ya da arama kutusunda eski sonuçlar yenisinin üstüne yazıldığında.

## Temel fikir

Effect, bileşeni **React dışındaki bir sistemle eşitlemek** içindir: tarayıcı API'si (zamanlayıcı, olay dinleyici,
`IntersectionObserver`), ağ bağlantısı, React dışı bir kütüphane, belge başlığı. Effect "şu değişince şunu yap"
tetikleyicisi değildir. Bir işi kullanıcı yaptığı için yapıyorsanız yeri **olay işleyicidir**; bir değeri başka
değerlerden hesaplıyorsanız yeri **render**'dır.

Effect'in iki yarısı vardır: kurulum (abone ol, bağlan, başlat) ve temizlik (aboneliği bırak, bağlantıyı kapat,
iptal et). React, bağımlılıklar değiştikçe önce eski temizliği sonra yeni kurulumu çalıştırır; bileşen kalkınca son
temizliği çalıştırır. Temizliği yazılamayan effect çoğu zaman yanlış yerdedir.

## Karar tablosu: effect'e gerek var mı?

| Yapmak istediğiniz                                       | Doğru yer                                         | Neden effect değil                                |
| -------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Props/durumdan değer hesaplamak (süzme, toplam)          | Render'da hesapla; pahalıysa `useMemo`            | Effect bir kare bayat gösterir, fazladan render   |
| Tıklayınca istek göndermek, bildirim göstermek           | Olay işleyici                                     | Sebebi kullanıcı eylemi; render değil             |
| Prop değişince bütün durumu sıfırlamak                   | `key={id}`                                         | Effect'le sıfırlama önce yanlış veriyi çizer      |
| Ebeveyne "değişti" demek                                 | Aynı işleyicide ebeveynin işlevini çağır ya da durumu yukarı taşı | Zincirleme effect'ler sırasız ve yavaş |
| Tarayıcı olayına/dış depoya abone olmak (çevrimiçi, ekran genişliği) | `useSyncExternalStore`                 | Yırtılma ve bayat okuma olmaz                     |
| Uygulama açılışında bir kez kurulum                      | Modül düzeyi ya da `main.tsx`                     | Effect sıkı kipte iki kez çalışır                 |
| Sayfa açılınca veri getirmek                             | Veri kancası / kütüphane; el yazımıysa iptalli effect | Yarış, önbellek, yeniden deneme tekrar yazılmasın |
| Zamanlayıcı, olay dinleyici, gözlemci, WebSocket         | `useEffect` + temizlik                            | Bu tam effect'in işi                              |
| DOM'u ölçüp boyamadan önce konum düzeltmek (ipucu balonu) | `useLayoutEffect`                                | `useEffect` bir kare yanlış konumu gösterir       |
| React dışı bileşen (harita, grafik) kurmak               | `useEffect` + ref + temizlik                      | Dış sistemle eşitleme                             |

## Bağımlılık dizisi

Kural basit: effect içinde okunan her **reaktif değer** (props, durum, bunlardan türetilenler, bileşen gövdesinde
tanımlı işlevler ve nesneler) diziye girer. Lint kuralı (`react-hooks/exhaustive-deps`) bunu denetler; ona
yalan söylemeyin. Bir bağımlılığı çıkarmak istiyorsanız effect'in ona **gerek duymadığını kanıtlayın**:

| Bağımlılık yüzünden effect gereksiz çalışıyor     | Çıkarma yolu                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| Durumu yalnız güncellemek için okuyor             | Güncelleyici işlev: `setItems((list) => [...list, x])`               |
| Bileşende tanımlı nesne/işlev (her render yeni)   | Nesneyi/işlevi effect'in **içine** taşıyın ya da modül düzeyine      |
| Değeri okumalı ama değişince yeniden bağlanmamalı | `useEffectEvent` (aşağıda)                                           |
| Ebeveynden gelen işlev her render'da yeni         | Ebeveynde `useCallback` ya da işlevi effect olayına alın             |

React karşılaştırmayı `Object.is` ile yapar; bu yüzden nesne ve işlev bağımlılıkları her render'da "değişmiş"
sayılır:

```js calistir
import assert from 'node:assert/strict'

// React, bağımlılık dizisinin her öğesini öncekiyle Object.is ile karşılaştırır.
const depsChanged = (prev, next) => prev === undefined || next.some((value, i) => !Object.is(value, prev[i]))

function render(userId) {
  const options = { userId, includeDeleted: false } // her render'da YENİ nesne
  const onLoad = () => {} // her render'da YENİ işlev
  return { primitives: [userId, false], objects: [options, onLoad] }
}
const first = render(7)
const second = render(7) // aynı props ile yeniden render

assert.equal(depsChanged(first.primitives, second.primitives), false) // ilkel değer: effect çalışmaz
assert.equal(depsChanged(first.objects, second.objects), true) // nesne/işlev: HER render'da çalışır
assert.equal(Object.is(NaN, NaN), true) // === ile fark: NaN eşit sayılır
console.log('tamam')
```

```cikti
tamam
```

Effect durum ayarlıyor ve bağımlılığında her render'da yeni bir nesne varsa: render → effect → setState → render →
... sonsuz döngü. Çözüm, nesneyi effect'in içinde kurmak ya da yalnız ilkel alanlarını (`options.userId`) diziye
koymaktır.

## Temizlik

| Kurulum                                | Temizlik                                   | Temizlik unutulursa                              |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `setInterval` / `setTimeout`           | `clearInterval` / `clearTimeout`           | Kalkmış bileşene setState; zamanlayıcılar birikir |
| `addEventListener`                     | `removeEventListener` (aynı işlev başvurusuyla) | Her render'da bir dinleyici daha             |
| `fetch`                                | `AbortController.abort()` + yok say bayrağı | Eski yanıt yeni ekranı ezer (aşağıda)           |
| `IntersectionObserver` / `ResizeObserver` | `observer.disconnect()`                 | Bellek sızıntısı, hayalet geri çağrılar          |
| WebSocket / EventSource                | `close()`                                  | Çift bağlantı, çift ileti                        |
| `navigator.wakeLock.request`           | `lock.release()`                           | Ekran hiç kararmaz, pil biter                    |
| Mikrofon/kamera akışı                  | `track.stop()` her iz için                 | Kamera ışığı yanık kalır                         |

## Bayat kapanım (stale closure)

Bir işlev, oluşturulduğu render'ın değerlerini yakalar. Effect `[]` ile yalnız ilk render'da kurulduysa içindeki
işlev sonsuza dek ilk render'ın değerlerini görür:

```js calistir
import assert from 'node:assert/strict'

let state = 0
// Her render, o anki durumu yakalayan YENİ bir işlev üretir.
const render = () => {
  const count = state
  return { tick: () => { state = count + 1 }, tickWithUpdater: () => { state = ((c) => c + 1)(state) } }
}

// useEffect(() => setInterval(tick, 1000), []) → yalnız İLK render'ın tick'i kayıtlı kalır
const registered = render().tick
for (let i = 0; i < 5; i++) { registered(); render() }
assert.equal(state, 1) // YANLIŞ: hep "0 + 1"

state = 0
const registeredUpdater = render().tickWithUpdater
for (let i = 0; i < 5; i++) { registeredUpdater(); render() }
assert.equal(state, 5) // DOĞRU: güncelleyici işlev güncel değeri alır
console.log('tamam')
```

Gerçek React'te de aynısı denendi: `[]` bağımlılıklı aralıkta `setCount(count + 1)` sayacı 1'de bıraktı;
`setCount((c) => c + 1)` saymayı sürdürdü (React 19.3, jsdom).

Çözüm sırası: (1) güncelleyici işlev; (2) değeri bağımlılığa ekle (effect yeniden kurulur); (3) değeri okuyup
yeniden bağlanmak istemiyorsanız `useEffectEvent`:

```tsx
// Gösterim (React 19.2+ kararlı API; kurulu 19.3.1'de denendi).
function ChatRoom({ roomId, theme }: { roomId: string; theme: string }) {
  const onConnected = useEffectEvent(() => showToast(`Bağlandı: ${roomId}`, theme)) // en güncel theme'i okur
  useEffect(() => {
    const connection = connect(roomId)
    connection.on('connected', onConnected)
    return () => connection.close()
  }, [roomId]) // theme değişince YENİDEN BAĞLANMAZ; onConnected diziye yazılmaz
}
```

`useEffectEvent` ile üretilen işlev yalnız effect içinden çağrılır; render'da çağrılmaz, alt bileşene verilmez.

## Çifte çalışma (geliştirme kipi)

`<StrictMode>` geliştirmede her effect'i kur → temizle → kur sırasıyla çalıştırır (denendi). Üretimde olmaz.
Belirtiler: ağ sekmesinde iki istek, iki "bağlandı" iletisi, analitikte çift olay. Bu bir hata değil, temizliği
eksik effect'i gösteren bir sınamadır.

| Çifte çalışmada sorun çıkaran                 | Doğru düzeltme                                           | Yanlış düzeltme              |
| --------------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| Abonelik/bağlantı iki kez kuruluyor           | Temizlikte kapat                                         | `useRef(false)` "bir kez" kilidi |
| Veri iki kez isteniyor                        | Temizlikte iptal; ya da önbellekli veri kancası          | StrictMode'u kapatmak        |
| Analitik "sayfa görüntülendi" iki kez         | Kabul edin (yalnız geliştirmede) ya da rota olayında gönderin | Kilit ref'i              |
| Satın al / kaydet isteği iki kez              | Effect'te değil, **olay işleyicide** gönderin            | —                            |
| Uygulama açılışında bir kez yapılacak iş      | Modül düzeyi ya da `main.tsx`                            | —                            |

## Veri getirmede yarış

Kullanıcı "a" yazar, sonra "ab". "a" isteği yavaş, "ab" hızlıysa ve temizlik yoksa, eski yanıt sonradan gelip yeni
sonucu ezer:

```js calistir
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'

// Sahte arama: "a" yavaş (40 ms), "ab" hızlı (10 ms) yanıt verir; iptal sinyalini dinler.
async function search(query, signal) {
  await sleep(query === 'a' ? 40 : 10, undefined, { signal })
  return `${query} sonuçları`
}

// Effect benzetimi: sorgu değişince ÖNCEKİ effect'in temizliği çalışır.
async function typeQueries(withCleanup) {
  let shown = null
  let cleanup = () => {}
  const pending = []
  for (const query of ['a', 'ab']) {
    cleanup()
    let ignore = false
    const controller = new AbortController()
    pending.push(
      search(query, controller.signal).then(
        (result) => { if (!ignore) shown = result },
        (error) => { if (error.name !== 'AbortError') throw error },
      ),
    )
    cleanup = withCleanup ? () => { ignore = true; controller.abort() } : () => {}
  }
  await Promise.all(pending)
  return shown
}

assert.equal(await typeQueries(false), 'a sonuçları') // YANLIŞ: eski yanıt yenisini ezdi
assert.equal(await typeQueries(true), 'ab sonuçları') // DOĞRU: eski istek iptal edildi
console.log('tamam')
```

React'te karşılığı:

```tsx
// Gösterim: el yazımı veri effect'i; ignore bayrağı + AbortController ikisi birden.
useEffect(() => {
  let ignore = false
  const controller = new AbortController()
  setStatus('loading')
  fetchResults(query, controller.signal).then(
    (data) => { if (!ignore) { setResults(data); setStatus('done') } },
    (error) => { if (!ignore && error.name !== 'AbortError') setStatus('error') },
  )
  return () => { ignore = true; controller.abort() }
}, [query])
```

Bunu her ekranda yeniden yazmayın: önbellek, yeniden deneme, odakta tazeleme de gerekecek. Projede bir veri kancası
varsa onu kullanın (bkz. [veri getirme](veri-getirme.md); havuzda [`useRemote.ts`](../../uygulama/web/src/lib/useRemote.ts)).

## Kanca kuralları ve nedenleri

1. Kancalar yalnız bileşenin ya da başka bir kancanın **en üst düzeyinde** çağrılır: koşul, döngü, erken `return`
   sonrası, iç işlev içinde değil.
2. Yalnız React bileşenlerinden ve `use` ile başlayan özel kancalardan çağrılır.

Neden: React kanca durumlarını adla değil **çağrı sırasıyla** saklar. Sıra değişirse durum yanlış kancaya gider:

```js calistir
import assert from 'node:assert/strict'

// React'in kanca yuvalarının küçük benzetimi: durum, çağrı SIRASINA göre saklanır.
function createComponent(body) {
  const slots = []
  return (props) => {
    let index = 0
    const useState = (initial) => {
      const i = index++
      if (!(i in slots)) slots[i] = initial
      return [slots[i]]
    }
    return body(props, useState)
  }
}

// YANLIŞ: iki dalda farklı amaçlı kanca, aynı sırada
const Form = createComponent(({ mode }, useState) => {
  if (mode === 'eposta') return { email: useState('ayse@ornek.com')[0] }
  return { phone: useState('0532 000 00 00')[0] }
})
assert.deepEqual(Form({ mode: 'eposta' }), { email: 'ayse@ornek.com' })
assert.deepEqual(Form({ mode: 'telefon' }), { phone: 'ayse@ornek.com' }) // telefon alanında e-posta!
console.log('tamam')
```

Aynı bileşen gerçek React 19.3'te de `phone=ayse@ornek.com` gösterdi. Kanca **sayısı** değişirse React hata verir
("Rendered more hooks than during the previous render"); sayı aynı kalıp anlam değişirse **sessizce** yanlış durum
okunur. Çözüm: iki ayrı bileşen (`<EmailForm />`, `<PhoneForm />`) ya da kancaları koşulsuz çağırıp değeri koşulla
kullanmak.

## `useMemo` / `useCallback` ne zaman gereksiz

| Durum                                                             | Gerekli mi?                      |
| ----------------------------------------------------------------- | -------------------------------- |
| Ucuz hesap (birkaç yüz öğeyi süzmek, metin birleştirmek)          | Hayır                            |
| Değer yalnız aynı bileşende kullanılıyor                          | Hayır                            |
| `memo`'lu bir alt bileşene prop olarak gidiyor                    | Evet (yoksa `memo` boşa çıkar)   |
| Bir effect'in ya da başka kancanın bağımlılığı                    | Evet ya da effect içine taşıyın  |
| Ölçülmüş pahalı hesap (`console.time` ile > 1 ms)                 | Evet                             |
| Bağlam (context) değeri olarak veriliyor                          | Evet (bkz. durum yönetimi notu)  |
| Proje React Compiler kullanıyor                                   | Çoğunlukla hayır: derleyici ekler |

React Compiler kurulu mu bilmiyorsanız `package.json`'da `babel-plugin-react-compiler` ya da benzerini arayın; yoksa
kural yukarıdaki tablodur. `useMemo` anlamsal bir garanti değildir; doğruluğunuz ona dayanmamalı.

## `useRef`

| Kullanım                                    | Örnek                                                        |
| ------------------------------------------- | ------------------------------------------------------------ |
| DOM düğümüne erişim                         | Odak vermek, ölçmek, `<dialog>.showModal()`                  |
| Render'ı etkilemeyen değişken değer         | Zamanlayıcı kimliği, önceki değer, "istek sürüyor" bayrağı   |
| Çift gönderimi aynı karede engellemek       | `if (busyRef.current) return; busyRef.current = true`        |

Kurallar: `ref.current`'i render sırasında okumayın/yazmayın (tembel ilk değer dışında); ekranda görünecek değer
ref'te durmaz. React 19'da işlev bileşeni `ref`'i düz prop olarak alır (`forwardRef` gerekmez) ve ref geri
çağırması temizlik işlevi döndürebilir; ikisi de kurulu 19.3.1'de denendi.

## Tuzaklar

| Belirti                                                   | Neden                                                         | Çözüm                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| "Maximum update depth exceeded"                           | Effect durum ayarlıyor, bağımlılıkta her render yeni nesne    | Nesneyi effect içine alın; ilkel alanları bağımlılık yapın    |
| Aralık/dinleyici hep ilk değeri görüyor                   | Bayat kapanım: `[]` ile kurulmuş işlev                        | Güncelleyici işlev, bağımlılık ya da `useEffectEvent`         |
| Geliştirmede iki istek, üretimde bir                      | StrictMode çifte çalışması; temizlik yok                      | İptal/temizlik yazın; kilit ref'i değil                        |
| Arama kutusunda eski sonuç yenisinin üstüne geliyor       | Yarış; temizlikte yok sayma/iptal yok                         | `ignore` bayrağı + `AbortController`                          |
| Kalkmış bileşene setState uyarısı, sızıntı                | Zamanlayıcı/dinleyici temizlenmemiş                           | Temizlik işlevi                                               |
| `removeEventListener` çalışmıyor                          | Farklı işlev başvurusu verildi                                | Aynı işlevi değişkende tutun                                  |
| İpucu balonu bir kare yanlış yerde                        | Ölçüm `useEffect`'te                                          | `useLayoutEffect`                                             |
| Koşul değişince alan başka alanın değerini gösteriyor     | Koşullu kanca                                                 | Ayrı bileşenler                                               |
| Lint uyarısını susturunca hata başladı                    | Bağımlılık eksik; bayat değer                                 | Uyarıyı susturmayın, effect'i yeniden yapılandırın            |
| `getSnapshot` sonsuz döngü hatası                         | `useSyncExternalStore` her çağrıda yeni nesne döndürüyor      | Anlık görüntüyü önbellekleyin (değişince yeni nesne)          |

## Denetim listesi

- [ ] Her `useEffect` bir dış sistemle eşitleme yapıyor; hesap ve kullanıcı eylemi effect'te değil.
- [ ] Her effect'in temizliği var (ya da neden gerekmediği bir satır yorumda yazıyor).
- [ ] `react-hooks/exhaustive-deps` uyarısı yok; `eslint-disable` ile susturulmuş bağımlılık yok.
- [ ] Veri getiren effect'te `ignore`/`AbortController` var ya da ortak veri kancası kullanılıyor.
- [ ] Bağımlılık dizilerinde render'da oluşturulan nesne/işlev yok.
- [ ] Kancalar koşulsuz, en üst düzeyde çağrılıyor.
- [ ] Geliştirmede StrictMode açık ve çift çalışma bir hata üretmiyor.
- [ ] Gönderim/ödeme gibi tek seferlik işler olay işleyicide.

## Küçük modele yaptırırken

- **İsteme yazın:** "Effect yalnız dış sistemle eşitleme içindir. Hesaplanan değeri render'da hesapla, kullanıcı
  eylemini olay işleyicide yap. Her effect'e temizlik yaz. Bağımlılık uyarısını susturma. Veri için projedeki
  `useRemote`/veri kancasını kullan."
- **Modelin tipik hatası:** Lint uyarısını `// eslint-disable-next-line` ile susturur ya da diziyi `[]` yapar;
  çifte çalışmayı `useRef(false)` kilidiyle "düzeltir"; veri effect'ine iptal yazmaz.
- **Çıktıda arayın:** `eslint-disable` + `exhaustive-deps`; `useEffect` içinde `set…` ile yalnız türetilmiş değer
  hesaplanması; `return` içermeyen ama `addEventListener`/`setInterval`/`subscribe` içeren effect'ler; `if` içinde
  `use…(` çağrısı.
- **Test isteyin:** "Hızlı yazınca yalnız son sorgunun sonucu görünür" (sahte gecikmeli API ile) ve "bileşen kalkınca
  dinleyici kaldırılır".

## İlgili

- [React zihinsel modeli](react-zihinsel-model.md) — anlık görüntü, anahtar, türetilmiş durum
- [Veri getirme](veri-getirme.md) — yükleniyor/hata/boş, önbellek, yeniden deneme
- [Durum yönetimi seçimi](durum-yonetimi-secimi.md) — `useSyncExternalStore` ile dış depo
- Çalışan örnekler: [`useRemote.ts`](../../uygulama/web/src/lib/useRemote.ts) (iptal bayrağı + `useEffectEvent`),
  [`useRouteFocus.ts`](../../uygulama/web/src/app/useRouteFocus.ts) (temizlikli `requestAnimationFrame`)
