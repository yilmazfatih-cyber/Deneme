# sinyal — ince taneli tepkisellik

## Ne yapar

Bir değeri (`signal`) okuyan her hesabı (`computed`) ve yan etkiyi (`effect`) otomatik olarak izler; değer
değişince **yalnız etkilenenleri**, **bir kez** ve **tutarlı girdilerle** yeniden çalıştırır. Solid, Preact
Signals, Vue ve Angular'ın tepkisellik çekirdeği bu fikrin üzerine kuruludur.

```ts
import { signal, computed, effect, batch } from './index.ts'

const fiyat = signal(100)
const adet = signal(2)
const toplam = computed(() => fiyat.value * adet.value)
const kapat = effect(() => console.log(`Toplam: ${toplam.value}`)) // hemen "Toplam: 200"

batch(() => {
  fiyat.value = 120
  adet.value = 3
}) // tek satır: "Toplam: 360"
kapat()
```

## Nasıl çalışır

Çizge üç tür düğümden oluşur. Oklar "okur" yönündedir: etki hesaplanmışı, hesaplanmış sinyali okur.

```
  signal (S)  ──►  computed (B = S*2) ──┐
       │                                ├──►  computed (D = B + C)  ──►  effect (ekrana yaz)
       └──────►  computed (C = S*3) ──┘
```

**İt-çek (push-pull) düzeni:**

1. **İtme (yazma anı).** `S.value = 2` → S'nin sürümü artar, gözlemcilerine `notify()` gider. Hesaplanmışlar
   kendini "eskimiş olabilir" diye işaretleyip haberi aşağı iletir; etkiler kuyruğa girer. Bu aşamada **hiçbir
   şey hesaplanmaz** — yalnız işaret konur. D'ye haber iki yoldan (B ve C) gelir ama aynı yazma için bir kez
   iletilir (`notifiedEpoch`).
2. **Çekme (okuma anı).** Kuyruktaki etki, kaynaklarının sürümünü okuma sırasıyla doğrular (`sourcesChanged`).
   D'nin `refresh()`'i önce B'yi, sonra C'yi tazeler; yalnız sürümü değişen bir kaynak varsa D'yi yeniden hesaplar.
   Böylece D asla "yeni B + eski C" görmez (glitch yok) ve her düğüm bir kez hesaplanır.
3. **Eşitlik kesmesi.** Bir hesaplanmış yeniden hesaplanıp **aynı** değeri verirse sürümü artmaz; alt düğümler
   ve etkiler hiç çalışmaz (test: "ara değer değişmezse…").

**Canlı / canlı olmayan hesaplanmış.** Bir etkiye (dolaylı da olsa) bağlı hesaplanmış "canlıdır": kaynaklarına
abonedir ve bildirim alır. Kimse izlemiyorsa abone değildir; böylece unutulan bir `computed` bellekte kalmaz.
Canlı olmayan düğüm okunduğunda genel **dönem sayacına** (`epoch`, her yazmada artar) bakar: son
doğrulamadan beri hiç yazma olmadıysa önbellekteki değeri verir, olduysa kaynak sürümlerini karşılaştırır.

**Hatalar.** `computed` içindeki işlev hata atarsa hata da bir "sonuç" olarak saklanır, okuyana yeniden atılır,
kaynak değişince yeniden denenir. Etki hata atarsa aynı turdaki diğer etkiler yine çalışır; ilk hata sonda atılır.

**Döngüler.** Hesaplanırken kendi değerine ulaşan hesaplanmış `CycleError` atar (`running` bayrağı). Birbirini
sonsuza dek tetikleyen etkiler `MAX_FLUSH_ROUNDS` (100) turdan sonra "Etki döngüsü" hatasıyla durdurulur ve
kuyruk temizlenir; sistem kullanılabilir kalır.

**Sahiplik ve temizlik.** Etkinin döndürdüğü işlev ve `onCleanup` ile kaydedilenler, bir sonraki çalışmadan ya da
`kapat()`tan önce çalışır. Bir etkinin içinde yaratılan etki ona aittir: üst etki yeniden çalışınca iç etki
kapanır. Kuyruk, etkileri oluşturulma sırasıyla çalıştırır; böylece üst etki çocuğundan önce çalışır ve eski
çocuk boşuna bir kez daha çalışmaz.

## Dosya haritası

| Dosya         | Sorumluluk                                                                   |
| ------------- | ---------------------------------------------------------------------------- |
| `graph.ts`    | Arayüzler, izleme (`track`/`collect`), dönem sayacı, `batch`, etki kuyruğu   |
| `signal.ts`   | Yazılabilir değer, eşitlik denetimi, bildirim                                |
| `computed.ts` | Tembel + önbellekli hesap, canlı/canlı olmayan geçişi, hata önbelleği, döngü |
| `effect.ts`   | Yan etki, temizlik, iç içe sahiplik, `onCleanup`                             |
| `watch.ts`    | `watch(okuyucu, geriÇağır)` — yalnız değişimde çağıran küçük yardımcı        |
| `index.ts`    | Dışa açılan tek giriş noktası                                                |

## Sınırlar

- Tek iş parçacıklıdır; etkiler eşzamanlı (senkron) olarak toplu işin sonunda çalışır. `requestAnimationFrame`
  ya da mikro görev ile zamanlanmış etki yoktur.
- Eşzamansız kaynak (`resource`, `Suspense` benzeri) yoktur.
- Dizi/nesne içindeki değişiklik izlenmez (derin tepkisellik yok): yeni dizi yazın ya da `equals: () => false`
  verin.
- Hesaplanmış içinden sinyal yazmak bilerek yasaktır (tutarsız ara durum doğurur).
- Kuyruk her turda `id`'ye göre sıralanır (O(k log k)); binlerce etkinin aynı anda tetiklendiği durumlar
  ölçülmedi.

## Buradan nereye

- `resource(async () => …)`: yükleniyor/hata/değer üçlüsünü sinyal olarak veren eşzamansız kaynak.
- Derin tepkisel nesne: `Proxy` ile her özelliği bir sinyale bağlayan `store()`.
- Zamanlanmış etkiler: `notify()` içinde `queueMicrotask` ya da `requestAnimationFrame` ile toplama.
- Geliştirici aracı: `sources`/`observers` kümelerinden çizgeyi çizdiren bir görselleştirici.
