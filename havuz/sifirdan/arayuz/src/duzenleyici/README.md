# duzenleyici — metin düzenleyici çekirdeği

## Ne yapar

Bir kod/metin düzenleyicisinin (VS Code, CodeMirror) arayüzden bağımsız çekirdeği: parça tablosu ile tutulan
belge, satır dizini, çoklu imleç ve seçim, gruplu geri al/yinele, düz metin ve düzenli ifadeyle bul/değiştir.
Unicode'a doğru davranır: imleç bir emoji ya da birleşik işaretli harfin ortasına düşmez; arama Türkçe
büyük/küçük harf kuralıyla yapılır (`istanbul` ↔ `İSTANBUL`, `ırmak` ↔ `IRMAK`).

```ts
import { Editor, single } from './index.ts'

const ed = new Editor({ text: 'kedi ve kedi' })
ed.setSelection(single(0))
ed.addNextOccurrence() // "kedi"yi seç
ed.addNextOccurrence() // ikinci "kedi"yi de seç (çoklu imleç)
ed.insertText('köpek') // "köpek ve köpek"
ed.undo() // tek adımda geri
ed.replaceAll({ text: 'KEDİ' }, 'kuş') // Türkçe duyarsız: 2 değişiklik
```

## Nasıl çalışır

**Parça tablosu (`piece_table.ts`).** Özgün metin hiç değişmez; yazılanlar "eklenenler" arabelleğinin sonuna
eklenir. Belge iki arabellekteki dilimlerin sırasıdır:

```
özgün   : "Merhaba dünya"          eklenen: " güzel"
parçalar: [özgün 0..7] [eklenen 0..6] [özgün 7..13]   →   "Merhaba güzel dünya"
```

Ekleme ve silme yalnız parça listesini böler; metin kopyalanmaz. Art arda yazılan harfler son parçayı uzatır
(parça sayısı artmaz; testli). Her parça kendi satır sonu konumlarını taşır; "kaçıncı satır?" ve "n. satır
nerede başlar?" parçalar üzerinde toplamayla yanıtlanır. Konumlar UTF-16 birimidir; CRLF girişte `\n` olur.

**Değişiklik kümesi (`changes.ts`).** Çoklu imleçle yazmak tek bir kümedir: sıralı, çakışmasız
`{ from, to, insert }` listesi (konumlar değişiklik öncesine göre). Küme sondan başa uygulanır; `invert` geri
alma kümesini, `mapPos` imleçlerin yeni konumunu verir.

**Seçimler (`selection.ts`).** Her seçimin çapası (anchor) ve başı (head, imleç) vardır. Seçimler sıralı ve
çakışmasız tutulur; aynı yere düşen imleçler birleşir. En son eklenen "birincil" seçimdir.

**Grafem kümeleri (`text_units.ts`).** `Intl.Segmenter` ile yalnız ilgili satır bölütlenir:

| Metin    | UTF-16 birimi | Kullanıcının gördüğü | İmleç adımı |
| -------- | ------------- | -------------------- | ----------- |
| `👍🏽`     | 4             | 1 karakter           | tek adım    |
| `🇹🇷`     | 4             | 1 bayrak             | tek adım    |
| `e` + `́` | 2             | `é`                  | tek adım    |

Silme, sağa/sola gitme ve dikey hareketin "hedef sütunu" grafem sayısıyla hesaplanır; dışarıdan verilen konum
(`setSelection`) kümenin başına çekilir.

**Geri al gruplama (`history.ts`).** Yeni işlem önceki adıma eklenir, eğer: aynı türdense (yazma/silme),
`groupDelayMs` (500 ms) içinde geldiyse, seçim arada atlamadıysa ve önceki adım yeni satırla "kapanmadıysa".
Böylece "merhaba" yazmak tek adımda geri alınır; yeni satır ve duraklama yeni adım başlatır. Saat dışarıdan
verilir (`now`) ve testlerde elle ilerletilir.

**Türkçe duyarsız arama (`search.ts`).** JS'nin `i` bayrağı Türkçeyi bilmez (`/i/i` "I" ile eşleşir, "İ" ile
eşleşmez). Bu yüzden desen dönüştürülür: her harf Türkçe büyük/küçük biçimlerinin sınıfına çevrilir
(`i` → `[iİ]`, `ı` → `[ıI]`, `a` → `[aA]`); karakter sınıflarına ve aralıklara (`[a-c]` → `[a-cABC]`) eşler
eklenir. Kaçış dizileri (`\d`, `ç`, `\p{L}`), adlı gruplar (`(?<ad>…)`, `\k<ad>`) ve niceleyiciler
(`{2,3}`) olduğu gibi kalır. Düz metin önce kaçışlanıp aynı yoldan geçer. Boş eşleşmeler (`^`) sonsuz döngüye
girmeden bir sonraki karaktere geçer. Değiştirmede `$1`, `$<ad>`, `$&`, `$$` desteklenir.

**Özellik testi.** Rastgele yazma/silme/imleç dizileri (emoji, birleşik işaret, yeni satır içeren) hem
düzenleyiciye hem düz bir dizgi modeline uygulanır; model grafem sınırını ayrı (bağımsız) bir yoldan bulur.
Her adımda metin ve imleç aynı olmalı; sonda tüm adımlar geri alınınca başlangıç metni geri gelmeli. Parça
tablosu da 25 tohum × 300 işlemle satır dizini dahil düz dizgiyle karşılaştırılır.

## Dosya haritası

| Dosya            | Sorumluluk                                                       |
| ---------------- | ---------------------------------------------------------------- |
| `piece_table.ts` | Belge: parçalar, ekleme/silme, satır dizini, konum ↔ satır/sütun |
| `changes.ts`     | Değişiklik kümesi: uygula, ters çevir, konum taşı                |
| `selection.ts`   | Seçim türleri, sıralama ve birleştirme                           |
| `text_units.ts`  | Grafem ve kelime sınırları                                       |
| `history.ts`     | Gruplu geri al/yinele                                            |
| `search.ts`      | Bul, Türkçe duyarsız desen dönüşümü, değiştirme şablonu          |
| `editor.ts`      | Komutlar: yaz, sil, hareket, çoklu imleç, Ctrl+D, değiştir       |

## Sınırlar

- Parça listesi düz bir dizidir: işlemler parça sayısıyla doğrusal. Birkaç MB'lık belgeler ve binlerce
  düzenleme için ölçülmedi; büyük belgeler için dengeli ağaç gerekir.
- Sözdizimi renklendirme, satır kaydırma (wrap), sekme genişliği, sağdan sola metin, IME bileşim durumu
  çekirdekte yoktur (gösterim tarayıcının `textarea` köprüsünü kullanır).
- Arama her seferinde tüm metni tarar; çok büyük belgelerde artımlı arama gerekir.
- Türkçe duyarsızlık yalnız harflerin büyük/küçük biçimlerini kapsar; aksan duyarsızlığı (`ç` ↔ `c`) yoktur.

## Buradan nereye

- Sözdizimi renklendirme: satır başına durum tutan küçük bir sözcük çözümleyici (`tablo/lexer.ts` örnek).
- Dengeli ağaçlı parça tablosu (kırmızı-siyah), satır sayılarını düğümlerde tutarak O(log n) sorgu.
- İşbirlikli düzenleme: iki `ChangeSet`'i birbirine göre dönüştüren `transform` (OT).
- Sütun (dikdörtgen) seçim: her satıra bir seçim üreterek mevcut çoklu seçimle.
