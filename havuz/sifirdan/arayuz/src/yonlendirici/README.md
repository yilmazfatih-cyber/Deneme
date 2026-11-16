# yonlendirici — istemci yönlendiricisi

## Ne yapar

Tek sayfalık uygulamada adres (`/kullanici/7`) değişince sayfayı yenilemeden doğru görünümü seçer. Desen
eşleme, iç içe rotalar, üç geçmiş kipi (History API, `#` ve bellek), korumalar (giriş izni / yönlendirme),
veri yükleyicileri, kaydırma konumunu hatırlama ve `<a>` tıklamalarını yakalama içerir. Hem düz DOM
(`renderRoutes`) hem `sinyal` (`routerSignal`) ile kullanılır.

```ts
import { createRouter, createHashHistory, interceptLinks, windowScroll } from './index.ts'

const router = createRouter({
  history: createHashHistory(),
  scroll: windowScroll(),
  routes: [
    { path: '/', name: 'ana' },
    { path: '/kullanici/:id', name: 'kullanici', loader: ({ params, signal }) => getir(params.id, signal) },
    { path: '/yonetim', name: 'yonetim', guard: () => (girisYapti() ? true : '/giris') },
    { path: '*', name: 'bulunamadi' },
  ],
})
router.subscribe((durum) => ciz(durum))
interceptLinks(router)
await router.start()
```

## Nasıl çalışır

**1. Desenler ve puan (`pattern.ts`, `routes.ts`).** Her desen parçalara ayrılır: sabit (`kullanici`),
parametre (`:id`), joker (`*`). İsteğe bağlı parça (`:sorgu?`) iki çeşitlemeye açılır (`/arama/:sorgu` ve
`/arama`). İç içe rotalar kökten yaprağa **dallara** açılır ve her dal puanlanır:

```
puan = parça sayısı + 10 × sabit + 3 × parametre − 2 × joker
/kullanici/yeni → 2 + 20     = 22   ← kazanır
/kullanici/:id  → 2 + 10 + 3 = 15
*               → 1 − 2      = −1   ← en son
```

Eşitlikte tanım sırası kazanır; alt rotalar üst rotadan önce denenir, böylece `path: ''` olan alt rota
"dizin sayfası" olur. Eşleşme kökten yaprağa bir zincirdir: `/ayarlar/profil` → `[ayarlar, profil]`; üst rota
çerçeveyi, alt rota içeriği çizer (`renderRoutes`'taki `outlet`).

**2. Geçiş hattı (`router.ts`).**

```
navigate(to) ─► eşleştir ─► korumalar (sırayla) ─► yükleyiciler (paralel) ─► adresi yaz ─► yayınla ─► kaydır
                               │ false → iptal          │ hata → state.error
                               │ '/giris' → yönlendir   │
                               └── yeni geçiş başladıysa her "await" sonrası: sonucu at ("superseded")
```

- **Yarış koruması.** Her geçiş bir numara ve kendi `AbortController`'ını alır. Yeni geçiş başlayınca öncekinin
  sinyali iptal edilir (yükleyici `fetch(url, { signal })` ile ağ isteğini de kesebilir); eski geçiş her
  `await`'ten sonra numarasını denetler ve geride kaldıysa hiçbir şey yazmadan çıkar. Test: yavaş yükleyici,
  sonradan tıklanan sayfanın üstüne yazamaz.
- **Yönlendirme döngüsü** `MAX_REDIRECTS` (10) adımda kesilir ve açıklayıcı hata atılır.
- **Durum** (`RouterState`): `location`, `matches`, `params`, `data` (rota adı → yükleyici sonucu), `error`,
  `status` (`idle`/`loading`), `pending`. Eşleşme yoksa `matches` boştur (bulunamadı sayfası).

**3. Geçmiş kipleri (`history.ts`).** Üçü aynı arayüzü uygular. Her kayıt bir `key` taşır; yönlendirici
ayrılmadan önce kaydırma konumunu bu anahtarla saklar, geri/ileri (POP) gelince geri yükler. Yeni sayfada en
üste, adreste `#bolum` varsa o öğeye kaydırır. Tarayıcının kendi geri yüklemesi kapatılır
(`scrollRestoration = 'manual'`).

| Kip       | Adres örneği       | Ne zaman                                                     |
| --------- | ------------------ | ------------------------------------------------------------ |
| `hash`    | `/#/kullanici/7`   | Statik barındırma (GitHub Pages); yenilemede 404 olmaz       |
| `browser` | `/kullanici/7`     | Sunucu her yola `index.html` döndürüyorsa; `base` alt klasör |
| `memory`  | (adres çubuğu yok) | Testler, Node, gömülü pencereler                             |

**4. Bağlantı yakalama (`links.ts`).** Aynı kökenli, sol tık, değiştirici tuşsuz, `target`/`download`
içermeyen bağlantılar yakalanır; diğerleri tarayıcıya bırakılır. Hash kipinde yalnız `#/…` bağlantıları
yakalanır; `#bolum` gibi sayfa içi çapalar normal çalışır. `data-router-ignore` ile kapatılır.

## Dosya haritası

| Dosya               | Sorumluluk                                                     |
| ------------------- | -------------------------------------------------------------- |
| `pattern.ts`        | Deseni çözümleme, eşleme, puanlama, `buildPath`                |
| `routes.ts`         | Rota türü, ağacı dallara açma, en iyi dalı bulma               |
| `history.ts`        | Bellek / History API / hash geçmişi, adres ayrıştırma          |
| `router.ts`         | Geçiş hattı, korumalar, yükleyiciler, yarış koruması, kaydırma |
| `scroll.ts`         | Kaydırma bağdaştırıcısı (pencere ya da sahte)                  |
| `links.ts`          | `<a>` tıklamalarını yakalama                                   |
| `dom_view.ts`       | İç içe görünümleri düz DOM ile çizme (`outlet`)                |
| `signal_adapter.ts` | Durumu `sinyal` sistemine köprüleme (tek sinyal bağımlılığı)   |

## Sınırlar

- Geri/ileri (POP) bir koruma tarafından reddedilirse adres `replace` ile eski sayfaya döndürülür; tarayıcı
  geçmişinde o kayıt eski adresle kalır (tam geri alma yapılmaz).
- Kaydırma konumları bellekte tutulur; sayfa yenilenince unutulur.
- Parametre kısıtları (`:id(\d+)`), sorgu dizgisi şeması ve tembel yüklenen rota modülleri yoktur.
- Göreli bağlantılar (`../x`) kök `/`'a göre çözülür.

## Buradan nereye

- Önceden yükleme: bağlantının üstüne gelince (`pointerenter`) yükleyiciyi başlatıp sonucu önbelleğe almak.
- Kaydırma konumunu `sessionStorage`'a yazıp yenilemeden sonra da geri yüklemek.
- Sayfadan ayrılma uyarısı: kaydedilmemiş form varken `guard` ile onay istemek.
- `sanal_dom` için `<Link>` bileşeni ve `useRouter()` kancası.
