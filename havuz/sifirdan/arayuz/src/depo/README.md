# depo — öngörülebilir durum deposu

## Ne yapar

Uygulama durumunu tek bir yerde tutar. Durum yalnız **eylem** göndererek (`dispatch({ type: 'ekle', … })`)
değişir; yeni durumu **saf** bir indirgeyici hesaplar: `(eskiDurum, eylem) → yeniDurum`. Bu tek kural
sayesinde şunlar "bedavaya" gelir: geri al / yinele, zaman yolculuğu, kalıcılık, sekmeler arası eşitleme ve
hata ayıklama günlüğü.

```ts
import { createStore, combineReducers, undoable, undo, persist, loadPersisted, createTabSync } from './index.ts'

const kok = combineReducers({ gorevler, filtre })
const depo = createStore(undoable(kok), undefined, { middleware: [thunk()] })
depo.subscribe(() => ciz(depo.getState().present))
depo.dispatch({ type: 'ekle', payload: { id: 1, metin: 'süt al' } })
depo.dispatch(undo())
```

## Nasıl çalışır

```
           ┌──────────── ara katmanlar (sırayla) ────────────┐
dispatch ─►│ thunk ─► günlük ─► eşitleme ─► …                 │─► indirgeyici ─► yeni durum ─► aboneler
           └─────────────────────────────────────────────────┘
```

**İndirgeyici ve `combineReducers`.** Her dilimin kendi indirgeyicisi olur; birleştirici hiçbir dilim
değişmediyse **aynı kök nesneyi** döndürür. Aboneler "değişti mi?" sorusunu `===` ile ucuza yanıtlar.

**Ara katman** üç katlı bir işlevdir: `(api) => (next) => (eylem) => …`. `next` zincirde bir sonrakine iletir.
`thunk` işlev gönderilmesine izin verir (eşzamansız akış), `logger` önce/sonra durumunu yazar.

**Yapısal paylaşım (`immutable.ts`, `produce.ts`).** Değişmez güncellemede yalnız değişen yol kopyalanır:

```
setIn(durum, ['kullanici','adres','il'], 'Iğdır')
  durum ─┬─ kullanici ─── adres ─── il: 'İzmir'        yeni ─┬─ kullanici' ─── adres' ─── il: 'Iğdır'
         └─ ayarlar  (aynı nesne, paylaşılır) ◄──────────────┘
```

`produce(durum, taslak => { taslak.gorevler[2].bitti = true })` aynı sonucu "değiştirilebilir gibi" yazdırır:
taslak bir `Proxy`'dir; dokunulan her nesnenin sığ kopyası alınır, değişmeyenlerin eski referansı döner. İş
bitince taslaklar iptal edilir (dışarı sızan taslağa erişim `TypeError`). Geliştirmede
`createStore(…, { freeze: true })` her durumu dondurur; yanlışlıkla yerinde değiştirme hemen hata verir.

**Ezberlemeli seçici.** `createSelector([s => s.gorevler], liste => liste.filter(…).length)` yalnız girdi
referansı değişince yeniden hesaplar (`recomputations()` sayacı testte kullanılır).

**Geri al / yinele (`undo.ts`).** `undoable(indirgeyici)` durumu `{ past, present, future }` üçlüsüne çevirir.
Kayda değer her eylem `present`'ı geçmişe iter ve geleceği siler. Seçenekler: `limit` (en çok adım), `filter`
(geçmişe yazılmayacak eylemler), `groupBy` (aynı grup art arda gelirse tek adım — ör. yazılan harfler).
`timeline()` tüm anları, `jumpTo(i)` herhangi bir ana gitmeyi (zaman yolculuğu) sağlar.

**Kalıcılık (`persist.ts`).** Kayıt biçimi `{ "v": sürüm, "durum": … }`. Açılışta okunan veri **dış veridir**:

| Durum                      | Sonuç                                                       |
| -------------------------- | ----------------------------------------------------------- |
| Kayıt yok / JSON bozuk     | `{ ok: false, reason: 'yok' / 'bozuk' }` → varsayılan durum |
| Eski sürüm                 | `migrations[v+1] … migrations[sürüm]` sırayla uygulanır     |
| Göç eksik                  | `goc-eksik` (veri silinmez)                                 |
| Yeni bir uygulamanın kaydı | `gelecek-surum`; **üstüne yazılmaz** (veri kaybı olmasın)   |
| Biçim doğrulamayı geçemedi | `gecersiz`                                                  |
| Depolama yok / kota dolu   | `erisilemiyor` / `onError` çağrılır; uygulama çökmez        |

Yazma gecikmelidir (varsayılan 100 ms): art arda değişiklikler tek yazmada birleşir; `flush()` hemen yazar.

**Sekmeler arası eşitleme (`sync.ts`).** `createTabSync` bir ara katman ve bir `connect` verir. Yerel eylem
`BroadcastChannel` ile yayınlanır; öteki sekme onu `meta.remote = true` ile kendi indirgeyicisinden geçirir
(yankı olmaz). Yeni açılan sekme "durum isteği" yollar; açık sekmelerden gelen ilk tam durum
`REPLACE_STATE` ile alınır (kök indirgeyiciyi `replaceable(…)` ile sarın). Gelen ileti biçimi doğrulanır.

## Dosya haritası

| Dosya           | Sorumluluk                                                       |
| --------------- | ---------------------------------------------------------------- |
| `store.ts`      | `createStore`, `combineReducers`, `replaceable`, eylem doğrulama |
| `middleware.ts` | `thunk`, `logger`                                                |
| `selector.ts`   | `createSelector` (son girdiye göre ezberleme)                    |
| `immutable.ts`  | `getIn`, `setIn`, `updateIn`, `removeIn`, `deepFreeze`           |
| `produce.ts`    | Proxy taslakla değişmez güncelleme                               |
| `undo.ts`       | `undoable`, `undo`/`redo`/`jumpTo`/`clearHistory`, `timeline`    |
| `persist.ts`    | Sürümlü kayıt, göç, doğrulama, gecikmeli yazma                   |
| `sync.ts`       | `BroadcastChannel` ile sekmeler arası eylem ve durum eşitleme    |

## Sınırlar

- Eşitleme "eylem yeniden oynatma"dır: iki sekme **aynı anda** çakışan eylem gönderirse sıraları farklı
  olabilir ve durumlar ayrışabilir (CRDT/sürüm vektörü yok). Tek kullanıcılı tipik kullanımda yeterlidir.
- `produce` yalnız düz nesne ve dizileri taslaklar; `Map`, `Set`, sınıf örnekleri olduğu gibi kalır.
- Seçici yalnız **son** girdiyi hatırlar (tek girişli önbellek).
- Kalıcılık JSON'dur: `Date`, `Map`, `undefined` alanlar yazılırken kaybolur ya da dönüşür.

## Buradan nereye

- Geliştirici aracı: `timeline()` ve `jumpTo` ile kaydırıcılı bir "zaman yolculuğu" paneli (gösterimde var).
- Eylem yaratıcı üreteci: `createSlice({ ad, başlangıç, indirgeyiciler })` ile tip ve eylem adlarını
  otomatik üretmek.
- Kalıcılığa şifreleme ya da sıkıştırma katmanı (`StorageLike` sarmalayıcısı olarak).
- `sinyal` köprüsü: `select(store, seçici)` → yalnız seçilen değer değişince güncellenen bir sinyal.
