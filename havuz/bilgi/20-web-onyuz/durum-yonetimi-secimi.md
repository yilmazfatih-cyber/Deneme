---
baslik: Durum yönetimi seçimi
ozet: Durumu türüne göre (yerel arayüz, paylaşılan, sunucu verisi, URL, form, kalıcı yerel veri) doğru yere koymak; bağlamın performans tuzağı ve yerel-önce tek kaynak.
etiketler: [react, durum, mimari, baglam, yerel-once]
duzey: orta
guncellik: 2026-11
---

# Durum yönetimi seçimi

> Bu notu ne zaman okumalı: "global bir depo kuralım mı?" sorusu çıktığında, bir değerin hangi bileşende duracağına
> karar verirken, bağlam (context) yüzünden her şey yeniden render olduğunda ya da aynı veri iki yerde farklı
> göründüğünde.

## Temel fikir

"Durum yönetimi sorunu" çoğu zaman **yanlış sınıflandırılmış durumdur**. Sunucu verisi bir depoya kopyalanır ve
bayatlar; URL'de olması gereken süzgeç bellekte tutulur ve yenileyince kaybolur; türetilebilen değer saklanır ve
kaynağından kopar. Önce değerin **türünü** belirleyin; yeri türden çıkar.

Tipik bir PWA'da gereken: bileşen içi `useState` + 2-3 uygulama geneli değer için bağlam + sunucu/yerel veri için bir
veri katmanı + URL. Ayrı bir global depo kütüphanesi ancak sık değişen, çok bileşenin paylaştığı **istemci**
durumu (çizim editörü, sürükle-bırak panosu, çok adımlı yapılandırıcı) varsa gerekir.

Her değerin **tek bir doğruluk kaynağı** olur. Başka her yer ondan okur ya da türetir; kopya tutmaz.

## Karar tablosu: durum türü → yer

| Durum türü                    | Örnek                                          | Nerede tutulur                                       | Neden                                              |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Yerel arayüz                  | Menü açık mı, giriş taslağı, seçili sekme (paylaşılmıyorsa) | Bileşende `useState`                    | En kısa ömür, en az bağlantı                       |
| Paylaşılan arayüz (yakın)     | Liste + detay paneli aynı seçimi görüyor       | En yakın ortak ataya taşı, props ile ver             | Açık veri akışı; iki düzey prop geçirmek sorun değil |
| Uygulama geneli, seyrek değişen | Tema, dil, oturum, geçerli çalışma alanı     | Bağlam (+ kalıcıysa localStorage)                    | Her yerden okunur, nadiren yazılır                 |
| Sık değişen paylaşılan istemci durumu | Editördeki seçim, sürükleme konumu     | Dış depo + seçici (`useSyncExternalStore` ya da kütüphane) | Bağlam her değişimde bütün tüketicileri uyandırır |
| Sunucu verisi                 | Üyeler, davetler, arama sonuçları              | Veri katmanı (önbellek + tazelik)                    | Uzak gerçeğin önbelleğidir; ayrıntı [veri getirme](veri-getirme.md) |
| URL durumu                    | Süzgeç, sıralama, sayfa, sekme, seçili kayıt   | Adres (yol ya da sorgu parametresi)                  | Yenileme, geri düğmesi, paylaşım; [yönlendirme](yonlendirme-ve-url.md) |
| Form                          | Alan değerleri, dokunuldu mu, hatalar          | Formun kendi bileşeninde; büyükse form kütüphanesi   | Gönderilene dek kimseyi ilgilendirmez; [formlar](formlar.md) |
| Kalıcı yerel veri (yerel-önce) | Görevler, notlar, kayıtlar                    | IndexedDB (Dexie) + canlı sorgu                      | Cihazdaki veritabanı tek doğruluk kaynağı          |
| Cihaz tercihi                 | Yazı boyutu, yüksek karşıtlık                  | localStorage + `<html data-*>` + küçük dış depo      | Hesapla eşitlenmez; boyamadan önce uygulanmalı     |
| Türetilmiş                    | Toplam, süzülmüş liste, "kaydedilmemiş mi"     | Hiçbir yerde: render'da hesapla                      | Saklanan türetilmiş değer bayatlar                 |

## Yukarı taşıma ↔ bağlam ↔ depo

| Yol                        | Ne zaman                                               | Bedeli                                                     |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| Yukarı taşıma (lifting)    | Paylaşan bileşenler yakın; 1-3 düzey                   | Ara bileşenler prop taşır (sorun değil, açık ve izlenebilir) |
| Bileşim (`children`)       | Ara bileşen veriyi kullanmıyor, yalnız geçiriyor       | Neredeyse yok; çoğu "prop delme" derdini çözer             |
| Bağlam (context)           | Çok derin ağaç, seyrek değişen değer                   | Değer değişince **bütün** tüketiciler render olur          |
| Dış depo + seçici          | Sık değişen, çok tüketicili istemci durumu             | Bir kavram daha; ama yalnız ilgili dilim değişince render  |
| Veri katmanı               | Sunucu verisi                                          | Önbellek kuralları öğrenilmeli                             |

Prop delmeden (prop drilling) kaçmak için ilk araç bağlam değil, **bileşimdir**: `<Layout sidebar={<UserMenu
user={user} />}>` yazınca `Layout` kullanıcıyı bilmek zorunda kalmaz.

## Bağlamın performans tuzağı

Sağlayıcı (provider) her render'da `value={{ user, theme, setTheme }}` gibi **yeni bir nesne** verirse, değer
içeriği aynı olsa bile her tüketici yeniden render olur; `memo` bunu durdurmaz. React 19.3'te denendi: sağlayıcının
alakasız bir durumu değişince `memo`'lu bağlam tüketicisi yeniden render oldu, `memo`'lu ama bağlam okumayan kardeşi
olmadı.

Çözümler (sırayla deneyin):

1. Değeri sabitleyin: `const value = useMemo(() => ({ user, theme }), [user, theme])`.
2. Bağlamı bölün: sık değişen ile seyrek değişeni, okuma ile yazmayı ayırın.
3. Durumu aşağı taşıyın: yalnız iki bileşenin gördüğü değer uygulama geneli bağlamda durmasın.
4. Sık değişen paylaşılan değer için seçicili dış depo kullanın.

```tsx
// Gösterim: okuma ve yazma ayrı bağlamlarda. setTheme hiç değişmediği için yazanlar yeniden render olmaz.
// React 19'da <Context value> doğrudan sağlayıcıdır (19.3.1'de denendi).
const ThemeContext = createContext<Theme>('light')
const SetThemeContext = createContext<(theme: Theme) => void>(() => {})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  return (
    <SetThemeContext value={setTheme}>
      <ThemeContext value={theme}>{children}</ThemeContext>
    </SetThemeContext>
  )
}
```

Seçicili depo, aboneyi yalnız **seçtiği dilim** değişince uyandırır:

```js calistir
import assert from 'node:assert/strict'

// Seçicili küçük depo (Zustand ve useSyncExternalStore'un ardındaki fikir).
function createStore(initial) {
  let state = initial
  const listeners = new Set()
  return {
    set(update) {
      state = { ...state, ...update(state) }
      for (const listener of listeners) listener()
    },
    subscribe(selector, onChange) {
      let selected = selector(state)
      listeners.add(() => {
        const next = selector(state)
        if (!Object.is(next, selected)) { selected = next; onChange(next) }
      })
    },
  }
}

const store = createStore({ theme: 'açık', cart: [], user: { ad: 'Ayşe' } })
const calls = { theme: 0, cartCount: 0, userObject: 0 }
store.subscribe((s) => s.theme, () => calls.theme++)
store.subscribe((s) => s.cart.length, () => calls.cartCount++)
store.subscribe((s) => ({ ad: s.user.ad }), () => calls.userObject++) // YANLIŞ: her seferinde yeni nesne

store.set((s) => ({ cart: [...s.cart, 'ekmek'] }))
store.set((s) => ({ cart: [...s.cart, 'süt'] }))

assert.equal(calls.theme, 0) // tema okuyan bileşen hiç uyanmadı
assert.equal(calls.cartCount, 2)
assert.equal(calls.userObject, 2) // ad değişmediği hâlde her güncellemede "değişti"
console.log('tamam')
```

```cikti
tamam
```

Son satır, seçicinin her çağrıda yeni nesne döndürmesinin bedelidir. `useSyncExternalStore`'da aynı hata "The
result of getSnapshot should be cached" uyarısı ve sonsuz döngüyle biter (19.3'te denendi). Seçici ilkel değer ya da
depodaki mevcut nesneyi döndürsün; birden çok alan gerekiyorsa sığ karşılaştırmalı seçici kullanın.

## Birbirine bağlı durum: reducer

Birlikte değişen alanlar (adım, seçim, hata, gönderiliyor mu) ayrı ayrı `useState` ile tutulunca geçersiz
birleşimler oluşur ("hem gönderiliyor hem hata"). Tek reducer'da toplayın: geçişler tek yerde ve sınanabilir olur.

```js calistir
import assert from 'node:assert/strict'

function checkoutReducer(state, action) {
  switch (action.type) {
    case 'select-address':
      return { ...state, addressId: action.id, error: null }
    case 'next':
      if (state.step === 'adres' && !state.addressId) return { ...state, error: 'Bir adres seçin.' }
      return { ...state, step: state.step === 'adres' ? 'odeme' : 'onay', error: null }
    case 'back':
      return { ...state, step: state.step === 'onay' ? 'odeme' : 'adres', error: null }
    default:
      throw new Error(`Bilinmeyen eylem: ${action.type}`)
  }
}

const start = Object.freeze({ step: 'adres', addressId: null, error: null })
let state = checkoutReducer(start, { type: 'next' })
assert.deepEqual(state, { step: 'adres', addressId: null, error: 'Bir adres seçin.' })
state = checkoutReducer(state, { type: 'select-address', id: 'ev' })
state = checkoutReducer(state, { type: 'next' })
assert.deepEqual(state, { step: 'odeme', addressId: 'ev', error: null })
assert.equal(start.step, 'adres') // saf: girdi değişmedi
console.log('tamam')
```

Reducer saf olur: ağ isteği, `Date.now()`, rastgele kimlik içermez. Bunlar eylemle birlikte gelir
(`{ type: 'add', id, createdAt }`).

## Yerel-önce uygulamada tek doğruluk kaynağı

İnternetsiz çalışan uygulamada kullanıcı verisinin kaynağı **cihazdaki veritabanıdır** (IndexedDB). Arayüz oradan
**canlı sorguyla** okur; yazma oraya gider; eşitleme motoru arka planda sunucuyla uzlaşır. Kural:

- Veritabanı satırlarını `useState`'e, bağlama ya da başka bir depoya **kopyalamayın**.
- Yazma işlemi veritabanına yazar ve biter; arayüz canlı sorgu sayesinde kendiliğinden güncellenir. Bu, "iyimser
  güncelleme"yi bedavaya verir: yerel yazım anında görünür, sunucu sonra gelir.
- Sunucuya gidecek değişiklikler bir giden kutusunda (outbox) bekler; çakışma çözümü eşitlemenin işidir, arayüzün değil.

```js calistir
import assert from 'node:assert/strict'

// Canlı sorgulu küçük veritabanı benzetimi (Dexie'de liveQuery / useLiveQuery).
function createDb() {
  const rows = new Map()
  const listeners = new Set()
  return {
    put(row) { rows.set(row.id, row); listeners.forEach((listener) => listener()) },
    all: () => [...rows.values()],
    live(query, onResult) { const run = () => onResult(query()); listeners.add(run); run() },
  }
}

const db = createDb()
db.put({ id: 1, title: 'Süt al', done: false })

const copied = db.all() // YANLIŞ: bir kez okuyup bileşen durumuna kopyalamak
let live = []
db.live(() => db.all().filter((task) => !task.done), (result) => { live = result }) // DOĞRU

// Eşitleme motoru (ya da başka bir ekran) kayıtları güncelledi
db.put({ id: 1, title: 'Süt al', done: true })
db.put({ id: 2, title: 'İlaç saati', done: false })

assert.equal(copied[0].done, false) // kopya bayat: tamamlanan görev hâlâ açık görünüyor
assert.deepEqual(live.map((task) => task.title), ['İlaç saati']) // canlı sorgu güncel
console.log('tamam')
```

Havuzdaki uygulama temeli bu kuralla yazılmıştır: okuma [`hooks.ts`](../../uygulama/web/src/lib/store/hooks.ts)
(`useRecords`, `useRecord`), yazma aynı dosyadaki `useWrite`, eşitleme tasarımı
[`ESITLEME.md`](../../uygulama/docs/ESITLEME.md). Eşitlenmeyen sunucu verisi (üye listesi, davet önizlemesi) ise ayrı
bir kanca ile okunur: [`useRemote.ts`](../../uygulama/web/src/lib/useRemote.ts).

## Tuzaklar

| Belirti                                                        | Neden                                                     | Çözüm                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Aynı kayıt iki ekranda farklı görünüyor                        | Veri iki yerde (depo + bileşen durumu) kopyalanmış         | Tek kaynak; diğerleri canlı okusun                         |
| Sayfa yenilenince süzgeç/sekme kayboluyor                      | URL durumu bellekte tutulmuş                              | Sorgu parametresine taşıyın                                |
| Tema düğmesine basınca bütün uygulama yeniden render oluyor    | Bağlam değeri her render'da yeni nesne; her şey tek bağlamda | `useMemo`, bağlamı bölün, durumu aşağı taşıyın          |
| Global depo sunucu verisiyle dolu, "yenile" mantığı her yerde  | Sunucu verisi istemci durumu sanılmış                     | Veri katmanı (önbellek + tazelik)                          |
| Her tuş vuruşunda büyük bir ağaç render oluyor                 | Form değeri uygulama geneli depoda                        | Form durumu formun içinde                                  |
| Çıkış yapıp başka hesapla girince eski kullanıcının verisi görünüyor | Bellekte/bağlamda kullanıcıya bağlı önbellek kalmış | Oturum değişince sağlayıcıyı `key={userId}` ile sıfırlayın; kullanıcı başına ayrı veritabanı |
| Tercih (koyu tema) açılışta bir an yanlış görünüyor            | Tercih React yüklendikten sonra uygulanıyor               | `<head>` içindeki küçük betik ya da modül düzeyinde, boyamadan önce uygulayın |
| "Hem yükleniyor hem hata" gibi olanaksız ekran                 | Bağlı alanlar ayrı `useState`'lerde                       | Reducer ya da ayrık birleşim (discriminated union)         |

## Denetim listesi

- [ ] Her yeni durum için türü yazıldı (yerel / paylaşılan / sunucu / URL / form / kalıcı / türetilmiş).
- [ ] Türetilebilen hiçbir değer saklanmıyor.
- [ ] Sunucu verisi bir depoya ya da `useState`'e elle kopyalanmıyor; veri katmanından okunuyor.
- [ ] Yerel-önce veride arayüz veritabanından canlı sorguyla okuyor.
- [ ] Bağlam değerleri `useMemo` ile sabit ya da ilkel; sık değişen değer ayrı bağlamda.
- [ ] Süzgeç, sıralama, sayfa, sekme URL'de; yenileme ve geri düğmesi onları koruyor.
- [ ] Oturum değişince kullanıcıya bağlı bütün durum sıfırlanıyor.
- [ ] Yeni bir global depo kütüphanesi eklenmişse gerekçesi `docs/KARARLAR.md`'de yazıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu değerin türünü önce belirle (yerel arayüz / sunucu verisi / URL / kalıcı yerel veri /
  türetilmiş) ve tablodaki yere koy. Yeni global depo ya da bağlam ekleme; projedeki `useRecords`/`useRemote`
  kancalarını kullan."
- **Modelin tipik hatası:** Her yeni özellik için bir bağlam ya da Redux/Zustand dilimi açar; API yanıtını depoya
  yazar ve "yenile" eylemleri ekler; veritabanı satırlarını `useState`'e kopyalar.
- **Çıktıda arayın:** yeni `createContext(` çağrıları; `value={{` (sabitlenmemiş bağlam değeri); `useState(` ile
  başlatılan ve sonra effect'te güncellenen sunucu verisi; `useLiveQuery` sonucunun `setState` ile kopyalanması.
- **Test isteyin:** "Başka bir yerden kayıt güncellenince bu ekran da güncelleniyor" ve "sayfa yenilenince süzgeç
  korunuyor".

## İlgili

- [React zihinsel modeli](react-zihinsel-model.md) — türetilmiş durum, anahtarla sıfırlama
- [Veri getirme](veri-getirme.md) — sunucu verisi önbelleği
- [Yönlendirme ve URL](yonlendirme-ve-url.md) — URL'deki durum
- [PWA ve çevrimdışı](pwa-ve-cevrimdisi.md) — IndexedDB ve şema yükseltme
- Çalışan örnek: cihaz tercihi deposu [`appearance.ts`](../../uygulama/web/src/lib/appearance.ts)
  (`useSyncExternalStore` + şemalı localStorage)
