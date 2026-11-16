# crdt — çakışmasız çoğaltılan veri türleri

Telefon ve dizüstü ikisi de çevrimdışıyken aynı veriyi değiştirirse, sonra buluştuklarında **sunucu
sormadan, kimse kaybetmeden** aynı sonuca nasıl varırlar? CRDT (Conflict-free Replicated Data Type):
birleşimi matematiksel olarak "sıra fark etmez" olan veri türleri. Burada altı tür, her biri iki
yoldan çoğaltılabilir:

- **Durum tabanlı:** bütün durumu gönder, `merge` et. Birleşim değişmeli (a⊔b = b⊔a), birleşmeli
  ((a⊔b)⊔c = a⊔(b⊔c)) ve yinelemesizdir (a⊔a = a) → mesaj kaybolsa, yinelense, sırası bozulsa da olur.
- **İşlem tabanlı:** yalnız işlemi (`("inc", "a", 5)`) gönder, `apply` et. İşlemler küçüktür ama
  "tam bir kez ve nedenleri önce" teslim edilmelidir → bunu `causal.Replica` sağlar.

Yalnız standart kitaplık.

```python
import copy
from crdt import RGA, PNCounter, Replica

a, b = RGA("a"), RGA("b")
a.insert_text(0, "Merhaba")
b.merge(copy.deepcopy(a))  # durum tabanlı eşitleme
a.insert_text(7, " dünya")  # ikisi de çevrimdışı ve eşzamanlı
b.insert_text(7, " Ankara")
a.merge(copy.deepcopy(b))
b.merge(copy.deepcopy(a))
a.text() == b.text() == "Merhaba Ankara dünya"  # harf harf karışmaz, ikisi de kalır

ra, rb = Replica("a", PNCounter("a")), Replica("b", PNCounter("b"))
mesaj = ra.record(ra.crdt.increment(5))  # işlem tabanlı: mesajı ağa ver
rb.receive(mesaj)
rb.receive(mesaj)  # yineleme zararsız
rb.crdt.value() == 5
```

## Türler

| Tür           | Durum                                    | Birleşim                       | Eşzamanlı çatışmada              |
| ------------- | ---------------------------------------- | ------------------------------ | -------------------------------- |
| `GCounter`    | kopya → sayı                              | hücre başına en büyük          | hiçbir artış kaybolmaz           |
| `PNCounter`   | iki G-Counter (artış, azalış)            | ikisinin birleşimi             | değer = P − N                    |
| `LWWRegister` | (Lamport damgası, değer)                 | büyük damga kalır              | biri kazanır, öteki KAYBOLUR     |
| `LWWMap`      | anahtar → (damga, canlı mı, değer)       | anahtar başına büyük damga     | silme de damgalıdır              |
| `ORSet`       | öğe → ekleme etiketleri, ölü etiketler    | iki kümenin birleşimi          | ekleme kazanır                   |
| `RGA`         | karakter → (ref, harf), mezar taşları    | düğüm ve mezar birleşimi       | aynı yere yazılanlar sırayla, karışmadan |

**Lamport damgası** `(sayaç, kopya)`: yerel her işlemde sayaç = görülen en büyük + 1; eşitlikte
kopya adı karar verir → bütün kopyalar aynı "son yazanı" seçer, duvar saatine gerek yok.

**OR-Set "ekleme kazanır":** her ekleme benzersiz etiket alır; silme yalnız GÖRDÜĞÜ etiketleri öldürür.
Silmeyle eşzamanlı bir ekleme, silmenin görmediği bir etiket taşır → öğe kalır.

**RGA (metin):** her karakterin kimliği ve "kimden sonra eklendim" (ref) bilgisi vardır; karakterler
bir ağaç oluşturur. Sıra = ağacın önce-kök gezilmesi, kardeşler kimliğe göre büyükten küçüğe:

```
"Hi" yazılmış: BAŞ → H(1,a) → i(2,a)
a, H'den sonra "!" (3,a) yazar; b aynı anda H'den sonra "?" (3,b) yazar
H'nin çocukları: (3,b) > (3,a) > (2,a)   →   "H?!i"   (her kopyada aynı)
```

Bir oturumda arka arkaya yazılan harfler zincir oluşturur (her biri bir öncekinden sonra), bu yüzden
eşzamanlı iki oturumun metinleri harf harf iç içe geçmez. Silinen karakter mezar taşı olarak kalır
(ona başvuran eklemeler yerini bulsun diye).

**Nedensel teslim (`causal.py`):** her mesaj (kaynak, sıra no, bağımlılık sürüm vektörü) taşır. Alıcı
ancak kaynağın önceki mesajını ve bütün bağımlılıkları gördüyse uygular; değilse tamponda bekletir;
görülmüş mesajı atar. Örnek: "y, x'ten sonra" eklemesi x'ten önce gelirse bekler.

## `havuz/uygulama`'nın eşitlemesiyle farkı — hangisi ne zaman?

Kardeş temel `havuz/uygulama` **alan düzeyinde son-yazan-kazanır** kullanır: istemciler değişiklikleri
sunucuya yollar, sunucu **varış sırasıyla** uygular, her alan için son gelen kalır; silme bir mezar
taşıdır (`uygulama/docs/ESITLEME.md`).

| Soru                                     | Alan düzeyinde LWW (uygulama)          | CRDT (bu klasör)                        |
| ---------------------------------------- | -------------------------------------- | --------------------------------------- |
| Merkez gerekir mi?                       | Evet: sıra sunucuda belirlenir          | Hayır: eşler doğrudan birleşir          |
| Aynı alana eşzamanlı iki yazma            | biri kalır (öteki kaybolur)             | türe göre: sayaçta ikisi de kalır, metinde ikisi de kalır, LWW'de biri |
| "Okunan + 1" sayaç                        | artış kaybolabilir (testli örnek)       | `PNCounter` hiç kaybetmez                |
| Ortak metin düzenleme                    | uygun değil (bütün metin üzerine yazılır) | `RGA` karakter düzeyinde birleştirir     |
| Basitlik, sorgulanabilirlik, şema        | çok basit; sunucu tek doğru kaynak     | daha karmaşık; meta veri (etiket, mezar) birikir |

**Seçim kuralı:** Form/kayıt düzenleme, ayarlar, "en son ne dendiyse o" verisi → alan düzeyinde LWW
(uygulama'nın yolu) yeterli ve daha basittir. Çevrimdışı **birlikte artırılan** sayılar (beğeni, stok
hareketi), birlikte düzenlenen **kümeler** (etiketler, alışveriş listesi) ve **ortak metin** → CRDT.
İkisi bir arada da kullanılabilir: kaydın çoğu alanı LWW, "sayaç" alanı PN-Counter, "notlar" alanı RGA.

## Dosya haritası

| Dosya          | Sorumluluk                                                         |
| -------------- | ------------------------------------------------------------------ |
| `clock.py`     | Lamport saati, damga ve değer doğrulayıcıları                       |
| `counters.py`  | `GCounter`, `PNCounter`                                             |
| `registers.py` | `LWWRegister`, `LWWMap`                                             |
| `orset.py`     | `ORSet`                                                             |
| `rga.py`       | `RGA` (metin)                                                       |
| `causal.py`    | `Replica`, `Message`: nedensel, tam bir kez teslim                 |

## Güvenceler (testle kanıtlanan)

- **Yasalar:** her tür için rastgele geçmişlerde birleşim değişmeli, birleşmeli, yinelemesiz.
- **Durum tabanlı yakınsama:** 3 kopya, rastgele yerel işlemler ve rastgele tek yönlü birleşimler; son
  turdan sonra bütün durumlar aynı ve değer işlem günlüğünden beklenenle aynı (sayaçlarda toplam,
  LWW'de en büyük damgalı yazma, OR-Set'te "görülmemiş etiketi kalan" öğeler).
- **İşlem tabanlı yakınsama:** mesajlar rastgele sırayla, 1–3 kez yinelenerek ve gecikerek teslim
  edilir; sonunda tampon boş, durumlar aynı, değer beklenenle aynı.
- **Somut senaryolar:** "H?!i", oturumların karışmaması, silinen karaktere başvuran ekleme, ekleme
  kazanır, LWW eşitliğinde kopya adı, LWW'nin artış kaybettiği ama sayacın kaybetmediği örnek.
- **Testin dişleri:** 6 bilerek bozulmuş sürüm (G-Counter'da toplama, OR-Set'te görülmeyen etiketi
  silme, RGA'da ters kardeş sırası, nedensel katmanda bağımlılık denetimi ya da yineleme atma yok,
  LWW'de eski damgayı kabul) yakalandı.

## Sağlamadıkları (dürüst sınırlar)

- **Meta veri birikir:** OR-Set ölü etiketleri ve RGA mezar taşları hiç silinmez (çöp toplama yok).
- **RGA yavaştır:** her işlemde ağaç yeniden dizilir (O(n log n)); uzun belgeler için değil.
- **LWW gerçek saati bilmez:** Lamport damgası "nedensel olarak sonra"yı doğru sıralar ama eşzamanlı
  yazmalarda kazananı kopya adı belirler (kullanıcı için "son" olmayabilir).
- **Güvenlik yok:** kötü niyetli kopya (sahte damga, başkası adına işlem) önlenmez; mesajlar
  doğrulanır ama imzalanmaz. Ağ ve kalıcılık bu klasörün işi değildir (testlerde benzetilir).
- Seçim/biçim (kalın, italik), imleç konumu, geri al (undo) yok.

## Buradan nereye

1. **Delta-CRDT:** bütün durum yerine yalnız son değişikliğin "delta"sını gönder (OR-Set için nedensel
   bağlamla ölü etiketsiz silme).
2. **MV-Register:** eşzamanlı yazmaların hepsini tut, kullanıcıya seçtir (LWW'nin kaybettiğini kurtarır).
3. **Mezar taşı toplama:** bütün kopyaların gördüğü (kararlı) silmeleri sürüm vektörüyle belirleyip at.
4. **Hızlı metin:** sırayı dizi + ekleme noktası kuralıyla tut, dizin için ip (rope) ağacı; karakter
   yerine parça sakla (Yjs/Automerge yaklaşımı).
5. **Karma mantıksal saat (HLC):** LWW kazananını duvar saatine yakın seç.
6. **Kalıcı ve ağlı kopya:** `Replica`'nın tamponunu ve sürüm vektörünü diske yaz; mesajları HTTP/
   WebSocket ile taşı.
