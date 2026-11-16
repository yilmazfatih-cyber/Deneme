# sanal_dom — küçük bir React benzeri çatı

## Ne yapar

Arayüzü "şu an nasıl görünmeli?" sorusunun yanıtı olarak tarif edersiniz (`h('ul', null, …)` ya da JSX);
çatı eski tarifle yenisini karşılaştırır ve DOM'u **en az işlemle** günceller. İşlev bileşenleri, kancalar
(`useState`, `useEffect`, `useMemo`, `useRef`, `useContext`…), olay yetkilendirme, toplu güncelleme ve hata
sınırı vardır.

```tsx
import { h, Fragment, render, useState } from './index.ts'

function Sayac(props: { ad: string }) {
  const [n, setN] = useState(0)
  return (
    <button onClick={() => setN(n + 1)}>
      {props.ad}: {n}
    </button>
  )
}
render(<Sayac ad="Tıklama" />, document.getElementById('app')!)
```

JSX için `tsconfig.json`'da `"jsx": "react"`, `"jsxFactory": "h"`, `"jsxFragmentFactory": "Fragment"`; Vite'ta
`oxc: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } }` ayarı vardır. `.tsx` dosyası `h`
ve `Fragment`'i içe aktarmalıdır.

## Nasıl çalışır

```
 h()/JSX ──► VNode ağacı (değişmez tarif)
                 │  render / setState
                 ▼
     reconcile.ts: eski "yerleşik ağaç" ile karşılaştır ──► DOM işlemleri (yalnız farklar)
                 │
                 ▼
     scheduler.ts: etkiler (önce temizlikler, sonra yeni etkiler; çocuklar önce)
```

**İki ağaç.** VNode yalnız tariftir. DOM düğümü, bileşen durumu ve kancalar ayrı bir **yerleşik ağaçta**
(`mounted.ts`) durur. Böylece aynı VNode iki yerde kullanılabilir ve karşılaştırma "eski yerleşik düğüm + yeni
tarif" biçiminde yapılır.

**Her düğümün bir başlangıcı vardır.** Parça (`<>…</>`) iki boş metin düğümü (çapa) arasına yerleşir; `null`
döndüren bileşen boş bir metin düğümü bırakır. "Bu düğüm DOM'da nerede başlıyor?" sorusunun hep yanıtı olduğu
için taşıma ve araya ekleme tek bir kuralla yapılır: _"şunun önüne koy"_.

**Anahtarlı liste uzlaştırma (`reconcileChildren`).**

1. Yeni çocuklar eskilerle eşleştirilir: `key` varsa anahtarla, yoksa anahtarsızlar kendi aralarında sırayla.
2. Eşi kalmayan eski çocuklar sökülür (etkileri temizlenir, DOM'dan çıkar).
3. Eşleşenler yamalanır, yeniler kurulur.
4. Eşleşenlerin eski konumlarından **en uzun artan alt dizi** (LIS) bulunur: bunlar zaten doğru sıradadır, hiç
   taşınmaz. Sağdan sola yürünür; LIS dışındaki her düğüm sağındakinin önüne konur.

Örnek: `A B C D E` → `E A B C D`. LIS = `A B C D`; yalnız `E` taşınır (**1 DOM işlemi**, test bunu sayar).
Taşınan öğe odaktaysa tarayıcı odağı düşürür; `focus.ts` odağı ve imleç konumunu geri verir.

**Kancalar neden "kurallı"?** Bileşen bir işlevdir; her çizimde baştan çalışır ve yerel değişkenleri kaybolur.
Durum, bileşen örneğindeki bir **diziye** (`instance.hooks`) yazılır ve kancalar bu dizideki yuvalara **çağrı
sırasıyla** bağlanır: 1. `useState` → yuva 0, 2. `useEffect` → yuva 1… Bu yüzden:

- **Kancayı koşul, döngü ya da erken `return` sonrasına koymayın.** Bir çizimde fazladan ya da eksik çağrılan
  kanca, sonraki tüm yuvaları kaydırır ve durumlar karışır. `instance.ts` sırayı ve türü her çizimde denetler;
  çiğnenirse "Kanca sırası değişti…" hatası verir.
- **Kancayı yalnız bileşen gövdesinde çağırın.** Olay işleyicisinin ya da etkinin içinde "şu an hangi bileşen
  çiziliyor" bilgisi yoktur.
- `useEffect(fn, deps)`: `deps` yoksa her çizimden sonra, `[]` ise yalnız ilk çizimden sonra, `[a, b]` ise
  `a`/`b` değişince çalışır. Döndürülen temizlik bir sonraki çalışmadan ya da sökülmeden önce çağrılır.
- `useMemo`/`useCallback` aynı bağımlılık karşılaştırmasını (`Object.is`) kullanır.

**Etki sırası (testle sabit):** ilk çizimde çocuğun etkisi üstünkinden önce; güncellemede değişen etkilerin
**tüm temizlikleri** yeni etkilerden önce; sökmede önce çocukların, sonra üstün temizliği.

**Toplu güncelleme.** `setState` hemen çizmez: bileşeni kirli işaretler ve bir mikro görev planlar. Aynı olay
içindeki tüm değişiklikler tek çizimde birleşir. Boşaltmada kirli bileşenler derinliğe göre (önce üst) çizilir;
üst çizilince alt zaten güncellenir. Testlerde `flush()` bekleyen işi hemen bitirir.

**Olay yetkilendirme.** `onClick` gibi her olay türü için köke **tek** dinleyici bağlanır; işleyiciler DOM
düğümünde bir tabloda durur. Olay gelince hedeften köke yürünür. `onFocus`/`onBlur` kabaran
`focusin`/`focusout` ile çalışır; `onChange` DOM anlamındadır (her tuş için `onInput` kullanın).

**Hata sınırı.** `ErrorBoundary` alt ağaçtaki çizim ve etki hatalarını yakalayıp `fallback` çizer; `reset()`
yeniden dener. Olay işleyicisindeki hatalar sınıra gelmez.

**Güvenlik.** Metin her zaman `createTextNode` ile yazılır (HTML olarak yorumlanmaz). `href`/`src` gibi
adreslerde `javascript:` engellenir. `dangerouslySetInnerHTML` bilerek desteklenmez.

## Dosya haritası

| Dosya          | Sorumluluk                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| `vnode.ts`     | VNode türü, `h()`, `Fragment`, çocuk normalleştirme, JSX türleri            |
| `mounted.ts`   | Yerleşik ağaç türleri, DOM yardımcıları (`firstDom`, taşıma), DOM sayaçları |
| `reconcile.ts` | `mount`, `patch`, anahtarlı çocuk uzlaştırma (LIS), sökme                   |
| `component.ts` | Bileşeni çizme, hata yönlendirme, etkileri kuyruğa alma                     |
| `instance.ts`  | Bileşen örneği, kanca yuvaları, kanca kuralı denetimi                       |
| `hooks.ts`     | `useState`, `useReducer`, `useEffect`, `useMemo`, `useRef`, bağlam          |
| `scheduler.ts` | Toplu güncelleme (mikro görev), etki işleme, sonsuz çizim koruması          |
| `events.ts`    | Olay yetkilendirme, olay adı eşleme                                         |
| `props.ts`     | Öznitelik/özellik/stil yazma, `javascript:` engeli, ref                     |
| `focus.ts`     | Taşıma sırasında odak ve imleç konumunu koruma                              |
| `boundary.ts`  | `ErrorBoundary`                                                             |
| `render.ts`    | `render`, `unmountRoot`                                                     |
| `root.ts`      | Kök kaydı: yerleşik ağaç, kirli bileşenler, etki kuyruğu, dinleyiciler      |
| `index.ts`     | Dışa açılan tek giriş noktası                                               |

## Sınırlar

- Eşzamanlı (concurrent) çizim, `Suspense`, `startTransition`, sunucu bileşenleri yoktur.
- "Özellikler aynıysa çizme" (`memo`) yoktur: üst bileşen çizilince tüm alt ağaç çizilir.
- `useLayoutEffect` yoktur; tüm etkiler DOM güncellendikten sonra, aynı boşaltmada çalışır.
- Stil nesnesinde sayılara birim eklenmez: `{ width: '10px' }` yazın.
- Ref'ler DOM'a eklenmeden önce (kurulumda) atanır.
- Portal ve sunucuda HTML üretimi yoktur.

## Buradan nereye

- `memo(Bileşen)`: önceki ve yeni özellikleri sığ karşılaştırıp çizimi atlamak (`component.ts` başında).
- `renderToString`: aynı VNode ağacını HTML dizgisine çeviren sunucu çizimi (metni kaçışlamayı unutmayın).
- `sinyal` ile birleşim: `useSignal` kancası — sinyal değişince bileşeni kirli işaretleyen bir etki.
- Öncelikli zamanlayıcı: kullanıcı girdisini liste güncellemesinden önce çizmek.
