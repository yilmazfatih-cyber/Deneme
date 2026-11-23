---
baslik: React performansı: Profiler ile ölçme ve gereksiz yeniden çizimi bulma
ozet: React Profiler ve Performans paneliyle yavaşlığı ölçme, gereksiz yeniden çizimin kaynağını okuma, memo ve useMemo'nun gerçekten işe yaradığı yer, React Compiler kavramı, liste ve bağlam kaynaklı yavaşlık.
etiketler: [react, performans, profiler, memo, onyuz]
duzey: ileri
guncellik: 2026-11
---

# React performansı: Profiler ile ölçme ve gereksiz yeniden çizimi bulma

> Bu notu ne zaman okumalı: yazarken harfler gecikiyorsa, bir listeye dokununca ekran takılıyorsa, "her yere
> `useMemo` koyalım" önerisi geldiğinde ya da bir performans düzeltmesinin işe yaradığını kanıtlamak gerektiğinde.

## Temel fikir

Yeniden render olmak hata değildir; sorun, render'ın **süresi** ve gereksiz yere gezilen alt ağaçtır. Bu yüzden iş
her zaman ölçümle başlar: hangi etkileşim, hangi bileşen, kaç milisaniye, kaç kez.

Gereksiz render'ın dört kaynağı vardır: (1) ebeveyn render oldu (çocuk `memo`'suz), (2) her render'da **yeni nesne
ya da işlev** prop'u (`memo`'yu boşa çıkarır), (3) okunan bağlamın değeri değişti, (4) sık değişen durum ağacın çok
yukarısında duruyor. Düzeltme sırası ucuzdan pahalıya gider: durumu aşağı taşı → içeriği `children` ile yukarı
kaldır → pahalı hesabı `useMemo` → `memo` + sabit prop'lar → erteleme → sanallaştırma.

## Ölçme araçları

| Araç                                   | Ne gösterir                                                                   | Ne zaman                               |
| -------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| React DevTools Profiler (eklenti)      | Her işlemede (commit) hangi bileşen render oldu, süresi, neden render olduğu  | Gereksiz render avı                    |
| Chrome Performans paneli               | Ana iş parçacığının zaman çizelgesi; düzen, boyama, uzun görevler             | Sorun React dışında olabilir mi?       |
| `<Profiler onRender>`                  | Kodla ölçüm: `actualDuration`, `baseDuration`, `phase`                        | Gerileme testi, sahada ölçüm           |
| DevTools "Highlight updates"           | Render olan bileşeni ekranda yakıp söndürür                                   | Hızlı göz taraması                     |

Kurulu React 19.3.1'de doğrulananlar:

- `onRender(id, phase, actualDuration, baseDuration, startTime, commitTime)`; `phase` `"mount"`, `"update"` ya da
  `"nested-update"` olur (tip tanımından).
- **Üretim derlemesinde `onRender` hiç çağrılmaz** (denendi). Sahada ölçmek için `react-dom/profiling` girişi
  vardır; derleyicide `react-dom/client` bu girişe takma adla yönlendirilir. Profiling derlemesinde `onRender`
  çağrıldı (denendi).
- Geliştirme ve profiling derlemeleri Chrome Performans paneline **"Components ⚛"** ve **"Scheduler ⚛"** izlerini
  yazar (`console.timeStamp`; kaynakta doğrulandı); üretim derlemesi yazmaz.

`actualDuration` bu işlemede harcanan süredir (atlanan alt ağaçlar hariç); `baseDuration` hiçbir şey atlanmasaydı
bütün alt ağacın tahmini süresidir. `actual` ≈ `base` ise hiçbir şey atlanmıyordur; `memo` ya da durum taşıma işe
yararsa `actual` belirgin biçimde düşer.

## Profiler ile çalışma adımları

1. Koşulu gerçeğe yaklaştırın: üretim ya da profiling derlemesi, DevTools'ta CPU yavaşlatma (orta sınıf telefon için
   4× kaba bir yaklaşımdır). Geliştirme derlemesi belirgin biçimde yavaştır ve `StrictMode` bileşenleri iki kez
   çağırır; orada ölçülen süre yanıltır.
2. Profiler ayarlarında "her bileşenin neden render olduğunu kaydet" seçeneğini açın.
3. Kaydı başlatın, **tek bir etkileşimi** yapın ("arama kutusuna beş harf yaz"), durdurun.
4. Alev grafiğinde en geniş çubuğa, sıralı görünümde en pahalı bileşene bakın; bileşene tıklayıp "neden render
   oldu" satırını okuyun.
5. Tek bir şeyi değiştirin, **aynı** etkileşimi yeniden kaydedin, sayıları yan yana yazın
   ([Performans yöntemi](../00-yontem/performans-yontemi.md)).

| Profiler'ın söylediği                      | Anlamı                                              | Düzeltme                                                  |
| ------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------- |
| "The parent component rendered"            | Bileşen `memo`'suz; ebeveyn render olunca o da olur | Durumu aşağı taşıyın ya da (pahalıysa) `memo`             |
| "Props changed: (style, onPick)"           | Prop'lar her render'da yeni nesne/işlev             | Modül düzeyi sabit, `useMemo`/`useCallback`               |
| "Context changed"                          | Sağlayıcının değeri değişti (belki her render'da yeni nesne) | Değeri sabitle, bağlamı böl ([Durum yönetimi](durum-yonetimi-secimi.md)) |
| "Hooks changed"                            | Bileşenin kendi durumu değişti                      | Beklenen; durum gerçekten burada mı durmalı?              |
| Her güncellemede `mount` fazı              | Kararsız `key` ya da bileşen içinde tanımlı bileşen | Kalıcı kimlik; bileşeni modül düzeyine taşıyın            |

## Ölçülmüş deney: hangi düzeltme gerçekten işe yarar

React 19.3.1 + jsdom'da bir arama kutusu ve iki satırlık liste; kutuya iki harf yazıldı, her bileşenin render
sayısı sayıldı:

| Bileşen                                                  | Açılışta | İki tuştan sonra |
| -------------------------------------------------------- | -------- | ---------------- |
| `memo`'lu satır, prop'larda satır içi `style={{…}}` ve `onPick={() => …}` | 2 | **6** |
| `memo`'lu satır, sabit prop'lar                          | 2        | 2                |
| `memo`'suz ağır bileşen, durumu tutan bileşenin içinde   | 1        | 3                |
| Aynı ağır bileşen dışarıdan `children` olarak verilmiş   | 1        | **1**            |

İlk satır en sık yapılan hatadır: `memo` eklenmiş ama satır içi nesne onu her seferinde boşa çıkarmıştır; `memo`
yalnız karşılaştırma maliyeti eklemiştir. Son satır en ucuz düzeltmedir: hiçbir kanca gerekmez. Nedeni,
`memo`'nun prop'ları sığ karşılaştırmasıdır:

```js calistir
import assert from 'node:assert/strict'

// memo'nun varsayılan karşılaştırması: her prop Object.is ile (sığ). Yeni nesne ya da işlev her seferinde "değişti".
function propsEqual(prev, next) {
  const keys = Object.keys(next)
  return keys.length === Object.keys(prev).length && keys.every((k) => Object.is(prev[k], next[k]))
}

const STYLE = { color: 'var(--ink)' } // modül düzeyi sabit
const onPick = () => {} // useCallback ile sabitlenmiş gibi
const item = { id: 1, ad: 'çay' }
const propsOf = (inline) =>
  inline ? { item, style: { color: 'var(--ink)' }, onPick: () => {} } : { item, style: STYLE, onPick }

assert.equal(propsEqual(propsOf(true), propsOf(true)), false) // içerik aynı, başvuru yeni: memo boşa çıkar
assert.equal(propsEqual(propsOf(false), propsOf(false)), true) // sabit başvurular: render atlanır
assert.equal(propsEqual({ item }, { item: { ...item } }), false) // kopyalanmış kayıt da "yeni"dir
assert.equal(propsEqual({ n: NaN }, { n: NaN }), true) // Object.is: NaN kendine eşittir
console.log('tamam')
```

## Düzeltme kalıpları (ucuzdan pahalıya)

```tsx
// Gösterim. 1) Durumu aşağı taşı: arama metni yalnız onu kullanan bileşende; sayfa her tuşta render olmaz.
function SearchBox({ onSearch }: { onSearch: (q: string) => void }) {
  const [text, setText] = useState('')
  return <input value={text} onChange={(e) => { setText(e.target.value); onSearch(e.target.value) }} />
}

// 2) İçeriği yukarı kaldır: ağır parça children olarak gelir; Panel'in durumu değişince yeniden oluşturulmaz.
function Panel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return <section>{open && children}<button onClick={() => setOpen(!open)}>Aç/kapa</button></section>
}
// <Panel><HeavyChart data={data} /></Panel>

// 3) Ertele: yazma hemen, liste geriden gelir. Liste satırları memo'lu ve prop'ları sabit olmalı.
function Results({ query, items }: { query: string; items: Item[] }) {
  const deferred = useDeferredValue(query)
  const visible = useMemo(() => filterItems(items, deferred), [items, deferred]) // ölçülmüş pahalı süzme
  return <ResultList items={visible} stale={deferred !== query} />
}
```

`useMemo`/`useCallback`'in ne zaman gereksiz olduğu (ucuz hesap, yalnız aynı bileşende kullanılan değer):
[React etkileri ve kancalar](react-etkiler-ve-kancalar.md). `useTransition` ile acil olmayan güncellemeyi
(sekme değiştirme, büyük süzme) ikinci plana alın; acil olan (yazılan harf) hemen görünür.

## Liste kaynaklı yavaşlık

```js calistir
import assert from 'node:assert/strict'

// Bütçe: bir etkileşimin render süresi ≈ satır sayısı × satır başına süre.
const frameMs = 1000 / 60 // 60 Hz ekranda bir kare
const interactionBudgetMs = 200 // INP için "iyi" eşiği (bkz. Web performansı)
const renderMs = (rows, msPerRow) => rows * msPerRow

assert.equal(Math.round(frameMs * 10) / 10, 16.7)
assert.ok(renderMs(50, 0.2) < frameMs) // 50 satır: bir karede biter
assert.ok(renderMs(500, 0.2) < interactionBudgetMs) // 500 satır: 100 ms; eşiğin altında ama kareler kaçar
assert.ok(renderMs(2000, 0.2) > interactionBudgetMs) // 2000 satır: 400 ms → sanallaştırma ya da sayfalama
assert.ok(renderMs(500, 0.2 * 4) > interactionBudgetMs) // aynı liste 4 kat yavaş telefonda eşiği aşar
console.log('tamam')
```

- Satır başına süreyi Profiler'dan okuyun, sonra bu hesabı yapın; tahminle sanallaştırmaya geçmeyin.
- **Kararsız anahtar** (`key={Math.random()}`, sıralanan listede `key={index}`) her güncellemede satırları söküp
  yeniden kurar: Profiler'da `update` yerine `mount` görürsünüz ([React zihinsel modeli](react-zihinsel-model.md)).
- **Bileşen içinde bileşen tanımı** (`function Row()` sayfanın gövdesinde) her render'da yeni bir tür üretir; satırlar
  ve odak her seferinde kaybolur.
- Süzme/sıralama render'da her seferinde yapılıyorsa ve ölçülmüş olarak pahalıysa `useMemo`'ya alın.
- Satır sayısı yüzlerle binler arasındaysa: [Liste sanallaştırma](liste-sanallastirma.md) ya da sayfalama.

## Bağlam kaynaklı yavaşlık

Kök düzeyde sık değişen bir değer (her saniye ilerleyen saat, kaydırma konumu, fare konumu, bütün form durumu)
bağlamla dağıtılırsa her tüketici her değişimde render olur; `memo` bunu durdurmaz. Profiler'da "Context changed"
görürsünüz. Çare: değeri yaprak bileşene taşımak, bağlamı sık/seyrek değişen diye bölmek ya da seçicili dış depo
(ayrıntı ve ölçülmüş örnek: [Durum yönetimi seçimi](durum-yonetimi-secimi.md)).

## React Compiler (derleyici) kavramı

- Derleme sırasında bileşenleri çözümleyip `memo`/`useMemo`/`useCallback` eşdeğerini **kendisi ekleyen** bir Babel
  eklentisidir (paket adı `babel-plugin-react-compiler`). Elle sabitleme ihtiyacını azaltır; ama yalnız "React
  kurallarına" uyan bileşenleri dönüştürür (render saf, prop ve durum yerinde değiştirilmez, ref render'da
  okunmaz); uymayanı atlar.
- Kurulu mu: `package.json`'da eklenti ve Vite'ın React eklentisindeki Babel ayarı. Havuzdaki uygulamada kurulu
  değil. Olgunluk ve sürüm iddiasını ezberden yazmayın; kurulu paketin README'sinden okuyun.
- Derleyici kurulmadan da hazırlık yapılabilir: kurulu `eslint-plugin-react-hooks` 7.1.1'in README'si "React
  Compiler rules" başlığı altında `purity`, `immutability`, `refs`, `set-state-in-render`, `static-components`,
  `preserve-manual-memoization` gibi kurallar listeler (kurulu pakette doğrulandı). Bu kuralları açmak kodu hem
  derleyiciye hem doğru render'a hazırlar.
- Derleyici açıkken de ölçün: gereksiz render'ı azaltır, **pahalı render'ı hızlandırmaz** (2000 satırlık liste
  yine yavaştır).

## Performansı testle korumak

jsdom'da milisaniye ölçmek anlamsızdır; **render sayısını** sayın. Profiler'ı testte kullanıp "tek tuş vuruşunda
liste satırları render olmamalı" gibi bir kural yazın:

```tsx
// Gösterim (Vitest + Testing Library, geliştirme derlemesi)
const commits: string[] = []
render(<Profiler id="liste" onRender={(_, phase) => commits.push(phase)}><TaskList items={items} /></Profiler>)
await user.type(screen.getByRole('searchbox'), 'a')
expect(rowRenderCount()).toBe(items.length) // açılıştaki kadar: yazmak satırları yeniden çizmedi
```

## Tuzaklar

| Belirti                                                      | Neden                                                         | Çözüm                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `memo` eklendi, hiçbir şey değişmedi                         | Prop'larda satır içi nesne/işlev ya da bağlam değişiyor       | "Neden render oldu" satırını okuyun; prop'ları sabitleyin   |
| Her yerde `useMemo`, kod okunmuyor, hız aynı                 | Ölçmeden en iyileme                                           | Ölçün; ucuz hesaplardan kaldırın                            |
| Geliştirmede çok yavaş, üretimde hızlı                       | Geliştirme derlemesi + `StrictMode` çifte çağrı               | Profiling ya da üretim derlemesinde ölçün                   |
| Sahada `onRender` hiç çağrılmıyor                            | Üretim derlemesinde Profiler kapalı                           | `react-dom/profiling` takma adı                             |
| Her tuşta bütün sayfa render oluyor                           | Arama durumu sayfanın tepesinde                               | Durumu aşağı taşıyın; `useDeferredValue`                    |
| Liste her güncellemede `mount` oluyor                        | Kararsız `key` ya da bileşen içinde bileşen tanımı            | Kalıcı kimlik; modül düzeyi bileşen                         |
| Saat her saniye bütün uygulamayı render ediyor               | Tik tak eden değer kök bağlamda                               | Saati onu gösteren bileşene taşıyın                         |
| Profiler süresi küçük ama ekran takılıyor                    | Sorun React dışında: düzen, boyama, büyük DOM, görsel çözme   | Performans panelinde uzun görevlere bakın                   |
| Derleyici açıldı, bazı bileşenler hâlâ render oluyor         | Kurala uymayan bileşen atlandı ya da render gerçekten pahalı  | ESLint derleyici kuralları; Profiler                        |

## Denetim listesi

- [ ] Yavaşlık tek bir etkileşimle tarif edildi; önce ve sonra sayıları (süre, render sayısı) yazılı.
- [ ] Ölçüm profiling ya da üretim derlemesinde, CPU yavaşlatmayla yapıldı.
- [ ] Gereksiz render'ın nedeni Profiler'ın "neden render oldu" bilgisiyle belirlendi.
- [ ] `memo`'lu her bileşene giden prop'lar sabit; satır içi nesne/işlev yok (yoksa `memo` kaldırıldı).
- [ ] Sık değişen durum onu kullanan yaprakta; kök bağlamda tik tak eden değer yok.
- [ ] Liste anahtarları kalıcı kimlik; bileşen gövdesinde bileşen tanımı yok.
- [ ] Uzun liste için sanallaştırma ya da sayfalama kararı ölçümle verildi.
- [ ] Kritik etkileşim için render sayısını sayan bir test var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce ölç: Profiler'la hangi bileşenin hangi nedenle render olduğunu yaz. Önce durumu aşağı
  taşımayı ve `children` kalıbını dene. `memo`/`useMemo`'yu yalnız ölçülmüş darboğaza ekle ve eklediğin her
  `memo`'nun prop'larının sabit olduğunu göster. Sonuçta önce/sonra sayılarını ver."
- **Modelin tipik hatası:** Her bileşeni `memo`'ya, her işlevi `useCallback`'e sarar; ardından `style={{…}}` ile
  hepsini boşa çıkarır; ölçmeden "hızlandı" der; derleyici kuruluyken elle `useMemo` ekler.
- **Çıktıda arayın:** `memo(` ile sarılı bileşenlere giden `style={{`, `options={{`, `onX={() =>` prop'ları;
  bağımlılığı her render'da yeni nesne olan `useMemo`; `key={index}` ya da `key={Math.random()}`; bileşen
  gövdesinde `function …()` ile tanımlanan bileşenler.
- **Kanıt isteyin:** "Değişiklikten önce ve sonra Profiler'daki render sayısı ve süre" ya da render sayan test.

## İlgili

- [React zihinsel modeli](react-zihinsel-model.md) — render'ı ne tetikler, anahtar ve kimlik
- [React etkileri ve kancalar](react-etkiler-ve-kancalar.md) — `useMemo`/`useCallback` ne zaman gereksiz
- [Durum yönetimi seçimi](durum-yonetimi-secimi.md) — bağlamın performans tuzağı, seçicili depo
- [Web performansı](web-performansi.md) — INP, uzun görevler, paket boyutu
- [Liste sanallaştırma](liste-sanallastirma.md) — binlerce satırı yalnız görüneni çizerek göstermek
- [Performans yöntemi](../00-yontem/performans-yontemi.md) — ölç, tek şeyi değiştir, yeniden ölç
- Havuzdaki lint ayarı: [`eslint.config.js`](../../uygulama/eslint.config.js)
