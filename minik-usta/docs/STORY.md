# Hikaye ve karakterler — Minik Usta

Sahip: design-lead · Durum: Faz 1 taslağı (2026-10-04) · Kaynak: `docs/BRIEF.md` §9 · Görünüm: `docs/ART_DIRECTION.md`
§11 · Öğretici yerleşimi: `docs/UX_FLOWS.md` §13

---

## 0. Ton kuralları

1. **Sıcak ve komik.** Mizah durumdan ve karakterden gelir (Kepçe'nin un burnu, Gribeton'un "kalite kontrolü"); kimse
   alay konusu edilmez.
2. **Şiddet yok, kötü adam yok.** Bay Gribeton "karşı görüş"tür: hızlı, ucuz, dayanıklı gri yapıları savunur. Haklı
   olduğu anlar vardır (bölüm 5'te gri temel). Asla tuzak kurmaz, sabote etmez, cezalandırılmaz.
3. **Çocuk karakter ≠ çocuk dili.** Hedef kitle yetişkin casual oyuncu (brif §15-8); cümleler kısa ve esprili, bebeksi
   değil.
4. **Kısa:** konuşma balonu en fazla 2 satır (TR ≤ 12 kelime); Usta Dede ipucu TR ≤ 8 kelime.
5. **Cinsiyet nötr Tuna:** TR'de sorun yok. EN metinlerde Tuna için **he/she/his/her kullanılmaz**; isim, "you" ya da
   "they" kullanılır. Dede Tuna'ya "evlat" (EN "kiddo") der.
6. **EN adlandırma (BUSINESS P-6 ile uyumlu):** "Little Builder" ve "Scoop" EN metinde **kullanılmaz** (Bob the
   Builder'ın kazıcısı Scoop; "LITTLE BUILDER" ABD'de oyuncak bloklar için tescilli — NAMING A7). Firma adı EN'de
   `{company}` yer tutucusudur; NAMING kararına kadar varsayılan değer **"Tuna & Co."**. Tuna'nın TR lakabı "Minik Usta"
   kalır; EN'de lakap yerine isim ("Tuna") kullanılır. Kepçe'nin EN adı **"Kepche"** (telaffuz: KEP-cheh; karakter
   kimliği diller arasında aynı kalsın diye çeviri değil, harf çevirisi).
7. **Yazı görsellerin içinde değil:** tabela, kitap kapağı gibi yazılar çizime gömülmez; gerekirse i18n metin katmanı
   olarak üstüne basılır.

---

## 1. Dünya

- **Renkli Tepe:** Tepe yamacına kurulmuş küçük bir kasaba: ağaçlı arka bahçeler, mahalle fırını, okul, kıyıda fener
  ve balıkçı iskelesi, tepede festival meydanı. Kasaba eskiden renkliymiş; son yıllarda Gribeton A.Ş.'nin gri yapıları
  çoğalmış.
- **Firma:** Minik Usta İnşaat. Tuna, dedesinin tavan arasında unutulmuş "Usta Dede Yapı" tabelasını bulur, boyar ve
  firmayı yeniden açar.
- **Tema:** Küçük adımlarla büyük işler; farklı görüşler birleşince daha sağlam yapılar ("gri ile renk, en sağlam
  harç").

---

## 2. Karakterler

| Karakter | Hikayedeki rolü | Konuşma biçimi | İmza söz (TR / EN) |
| -------- | --------------- | -------------- | ------------------ |
| **Tuna** (8) | Kahraman, "Minik Usta". Meraklı, enerjik, vazgeçmez. Her bölümde bir sorunu renkli bir yapıyla çözer. | Ünlemli, kısa, plan kuran cümleler. | "Plan hazır, kask tamam!" / "Plan ready, helmet on!" |
| **Usta Dede** | Emekli usta, firmanın kurucusu. Öğretmen; oyuncuya ipuçlarını o verir. Katlanır metresiyle işaret eder. | Sakin, atasözü tadında, kısa. | "Önce temeli düşün, evlat!" / "Think of the foundation first, kiddo!" |
| **Kepçe** (EN: Kepche) | Sosis köpek, kazı maskotu. Kaskı kulaklarına büyük. Komik rahatlama. | Yalnız "Hav!" ve ses efektleri; duygusu yüzünden okunur. | "Hav!" / "Woof!" |
| **Bay Gribeton** | Gribeton A.Ş.'nin patronu. Her şeyi gri betondan yapar; verimlilik takıntılı, kibirli ama komik ve iyi kalpli. Hikaye boyunca Tuna'ya ısınır. | Resmî, kendinden emin, "verimli", "maliyet", "dayanıklılık" kelimelerini sever. | "Gri, her renge yakışır." / "Gray goes with everything." |
| **Fırıncı Ayşe Teyze** | Bölüm 2'nin müşterisi, Tuna'nın ilk gerçek müşterisi. | Sıcak, telaşlı, yemekle sever. | "Karnın aç mı, usta?" / "Hungry, builder?" |
| **Öğretmen Selin** | Bölüm 3'ün müşterisi; desen ve simetri ipuçları. | Meraklı, soru soran. | "Her desen bir kuraldır!" / "Every pattern is a rule!" |
| **Balıkçı Rıza Kaptan** | Bölüm 4'ün müşterisi; fırtınada mahsur kalan balıkçılar. | Deniz deyimleri, gür ses. | "Rüzgâr dönerse biz de döneriz!" / "When the wind turns, so do we!" |
| **Belediye Başkanı Bay Kurdele** | Açılışların kurdele kesicisi; bölüm 5'in müşterisi. | Nutuk atar, abartılı. | "Bu kurdele kesilmeli!" / "This ribbon must be cut!" |

---

## 3. Bölüm haritası

| Hikaye bölümü | Bölümler | Sorun | Duygusal vuruş | Başlangıç sahnesi tetikleyicisi | Bitiş sahnesi tetikleyicisi |
| ------------- | -------- | ----- | -------------- | ------------------------------- | --------------------------- |
| 0 Giriş | — | Firma kapalı | Tuna tabelayı bulur | ilk açılış (FTUE) | — |
| 1 Ağaç Ev | 1–10 | Kimse küçük bir çocuğa iş vermez; Gribeton güler | İlk yapı; kasaba fark eder | Bölüm 1 kasaba görevi 1 tamamlanınca | Bölüm 1'in son görevi tamamlanınca |
| 2 Mahalle Fırını | 11–20 | Ayşe Teyze'nin bacası çöktü; Gribeton gri kutu önerir | Renkli fırın açılır; ilk gerçek müşteri | Bölüm 2 görev 1 | Bölüm 2 son görev |
| 3 Okul Kütüphanesi | 21–30 | Kütüphaneyi su bastı | Mozaik duvarlı kütüphane; Selin'in desen ipuçları | Bölüm 3 görev 1 | Bölüm 3 son görev |
| 4 Fener ve Köprü | 31–40 | Gribeton'un gri köprüsü çatladı; balıkçılar mahsur | Fener yanar, asma köprü kurulur; Gribeton ilk kez teşekkür eder | Bölüm 4 görev 1 | Bölüm 4 son görev |
| 5 Festival Şatosu | 41–50 | Festivale şato lazım | Gribeton gri temeli getirir; birlikte inşa; "Yılın Firması" | Bölüm 5 görev 1 | Bölüm 5 son görev |

Görevler bölümleri kilitlemez; yalnız ara sahneleri açar (brif §10). Görev yıldız maliyetleri aşağıda **öneridir**;
kesin değerler product-lead'in `META.md` dosyasındadır.

i18n anahtarları: `story.<sahne>.p<n>.<konuşan>` (ör. `story.ch1.start.p2.gribeton`); görevler
`town.ch<n>.t<m>.name` ve `town.ch<n>.t<m>.scene`; ipuçları `tut.*`.

---

## 4. Ara sahne senaryoları

Biçim: **Panel n** — sahne tarifi (çizer için) · konuşma balonları `Konuşan: TR / EN`.

### 4.0 Giriş (FTUE, 3 panel, otomatik ilerler — `story.prologue`)

**Panel 1** — Tozlu tavan arası, çatı penceresinden ışık huzmesi. Tuna eski bir ahşap sandığın kapağını kaldırmış;
içinde soluk, kırık köşeli bir tabela. Kepçe sandığın kenarından burnunu uzatmış.
- Tuna: "Bu eski tabela da ne?" / "What's this old sign?"

**Panel 2** — Arka avlu. Tabela iki sehpanın üstünde; Tuna rengârenk boyuyor, Kepçe'nin kuyruğu boyalı. Usta Dede
gözlüğünü burnuna itmiş, gülümsüyor.
- Usta Dede: "Bizim firma! Yıllardır kapalıydı." / "Our old company! Closed for years."

**Panel 3** — Evin önü. Boyanmış tabela kapının üstünde (yazı i18n katmanı: "MİNİK USTA İNŞAAT" / EN `{company}`). Tuna kaskını iki eliyle düzeltiyor, Kepçe zıplıyor.
- Tuna: "Minik Usta İnşaat yeniden açıldı!" / "{company} is open again!"
- Kepçe: "Hav!" / "Woof!"

### 4.1 Hikaye Bölümü 1 — Ağaç Ev

**Başlangıç (`story.ch1.start`, 4 panel)**

**Panel 1** — Kasaba meydanı, ilan panosu. Tuna parlak bir "İş arıyoruz" ilanı asıyor. Ayşe Teyze elinde file, eğilmiş
bakıyor.
- Ayşe Teyze: "Çok tatlısın ama… sen kaç yaşındasın?" / "You're very sweet, but… how old are you?"
- Tuna: "Sekiz buçuk! Buçuk önemli." / "Eight and a half! The half matters."

**Panel 2** — Gri bir kamyonetten Bay Gribeton iniyor, klasörü göğsünde, burnu havada.
- Gribeton: "Çocuk oyuncağı! Gerçek işler gri betondan yapılır." / "Child's play! Real work is made of gray concrete."

**Panel 3** — Tuna'nın omzu düşük; Usta Dede katlanır metresiyle Tuna'nın kaskına hafifçe dokunuyor.
- Usta Dede: "Önce temeli düşün, evlat. Küçükten başla." / "Think of the foundation first, kiddo. Start small."

**Panel 4** — Arka bahçede kocaman bir çınar. Tuna metreyi çınara doğru uzatmış, gözleri parlıyor; Kepçe ağacın dibini
kazmaya başlamış.
- Tuna: "Arka bahçeye bir ağaç ev! Herkes görecek." / "A tree house out back! Everyone will see it."
- Kepçe: "Hav hav!" / "Woof woof!"

**Bitiş (`story.ch1.end`, 4 panel)**

**Panel 1** — Renkli ağaç ev tamam; bayrağı dalgalanıyor. Çitin üstünden kasabanın çocukları ve birkaç yetişkin bakıyor.
- Çocuk: "Vay! Bunu bir çocuk mu yaptı?" / "Whoa! A kid built that?"

**Panel 2** — Tuna ağaç evin penceresinden el sallıyor; Kepçe ip merdivenin ortasında asılı kalmış, kask gözüne düşmüş.
- Tuna: "Minik Usta İnşaat, hizmetinizde!" / "{company}, at your service!"

**Panel 3** — Arka planda Gribeton, gözlerini kısmış, klasörüne bir not yazıyor; ön planda Ayşe Teyze telaşla koşuyor,
önlüğü unlu.
- Gribeton: "Hımm. Verimsiz… ama ilginç." / "Hmm. Inefficient… but interesting."
- Ayşe Teyze: "Tuna! Fırınımın bacası çöktü!" / "Tuna! My bakery chimney collapsed!"

**Panel 4** — Albüm kartı: ağaç ev, kenarında "Ağaç Ev" etiketi. Tuna, Dede ve Kepçe beşlik çakıyor (Kepçe patisiyle).
- Usta Dede: "İlk iş bitti. Sıradaki seni bekliyor." / "First job done. The next one awaits."

### 4.2 Hikaye Bölümü 2 — Mahalle Fırını

**Başlangıç (`story.ch2.start`, 4 panel)**

**Panel 1** — Fırının önü; bacası yıkılmış, tuğlalar kaldırımda, kıvrık duman fırın kapısından çıkıyor. Ayşe Teyze
elleri yanaklarında.
- Ayşe Teyze: "Bacam çöktü! Ekmekler soğuyacak!" / "My chimney's down! The bread will go cold!"

**Panel 2** — Gribeton, gri bir kutunun maketini gururla sunuyor (pencereleri bile gri).
- Gribeton: "Gri kutu: ucuz, hızlı, verimli." / "The gray box: cheap, fast, efficient."

**Panel 3** — Tuna parmağını kaldırmış, arkasında hayal balonunda kiremit çatılı turuncu bir fırın.
- Tuna: "Kiremitli, sıcacık, turuncu bir fırın yapalım!" / "Let's build a warm bakery with an orange tile roof!"

**Panel 4** — Gribeton kaşını kaldırmış; Kepçe un çuvalına burnunu sokmuş, burnu bembeyaz çıkmış.
- Gribeton: "Göreceğiz, Minik Usta." / "We'll see, junior."
- Kepçe: "Hapşu!" / "Achoo!"

**Bitiş (`story.ch2.end`, 4 panel)**

**Panel 1** — Renkli fırının açılışı. Bay Kurdele dev makasıyla kurdeleyi kesiyor, kalabalık alkışlıyor.
- Bay Kurdele: "Mahalle Fırını yeniden açıldı!" / "The Neighborhood Bakery is open again!"

**Panel 2** — Kasabanın üstünde dalga dalga ekmek kokusu çizgileri; insanlar burunlarıyla izi takip ediyor, Kepçe
kokunun üstünde neredeyse süzülüyor.
- Ayşe Teyze: "İlk müşterin benim! Ücretin ve bir simit." / "I'm your first customer! Your pay, and a simit."

**Panel 3** — Köşede Gribeton gizlice bir ekmek ısırırken Tuna'ya yakalanmış.
- Gribeton: "Ehem. Kalite kontrol." / "Ahem. Quality control."

**Panel 4** — Tuna firmanın tabelasına "ilk müşteri" yıldızını yapıştırıyor; Dede kollarını kavuşturmuş gülümsüyor.
- Usta Dede: "Tuğla tuğla… işte firma böyle büyür." / "Brick by brick… that's how a company grows."

### 4.3 Hikaye Bölümü 3 — Okul Kütüphanesi

**Başlangıç (`story.ch3.start`, 4 panel)**

**Panel 1** — Yağmurlu gün. Kütüphanenin içinde su birikintileri, raflardan damlalar; kitaplar şemsiyelerin altında.
Öğretmen Selin kucağında ıslak kitaplarla.
- Selin: "Kütüphaneyi su bastı. Kitaplar sırılsıklam." / "The library flooded. The books are soaked."

**Panel 2** — Okul bahçesinde çocuklar kitapları mandallarla ipe asıyor.
- Çocuk: "Artık nerede okuyacağız?" / "Where will we read now?"

**Panel 3** — Selin karatahtaya bir mozaik deseni çizmiş; Tuna'nın gözleri parlıyor.
- Selin: "Desenleri seversin, değil mi Tuna?" / "You like patterns, don't you, Tuna?"
- Tuna: "Mozaik duvarlı bir kütüphane!" / "A library with a mosaic wall!"

**Panel 4** — Kapıda Gribeton yağmurluğuyla; Dede şemsiyesini Kepçe'ye tutuyor.
- Gribeton: "Islanmayan tek şey betondur." / "Only concrete stays dry."
- Usta Dede: "Su geçirmez olan renkli de olur." / "Waterproof can be colorful too."

**Bitiş (`story.ch3.end`, 4 panel)**

**Panel 1** — Güneşli gün; mozaik duvar mor-mavi parlıyor, çocuklar içeri koşuyor.
- Selin: "Bakın, her desen bir kural!" / "Look, every pattern is a rule!"

**Panel 2** — Kepçe ağzında kemik resimli bir kitapla okuma köşesine kıvrılmış; Tuna gülüyor.
- Tuna: "Kepçe de üye oldu!" / "Kepche got a library card too!"

**Panel 3** — Gribeton kapı eşiğinde, mozaiğe istemeden hayran bakıyor.
- Gribeton: "Fena değil. Biraz gri olsa kusursuzdu." / "Not bad. A bit of gray and it'd be perfect."

**Panel 4** — Selin ve Tuna beşlik çakıyor; Dede gözlüğünü düzeltiyor.
- Usta Dede: "Desen düzen ister, düzen sabır." / "Patterns need order; order needs patience."

### 4.4 Hikaye Bölümü 4 — Deniz Feneri ve Köprü

**Başlangıç (`story.ch4.start`, 5 panel)**

**Panel 1** — Fırtına sonrası gri gökyüzü. Gri köprü ortadan çatlamış; karşı kıyıda tekneler ve balıkçılar. Rıza
Kaptan avuçlarını ağzına koymuş bağırıyor.
- Rıza Kaptan: "Köprü çatladı! Karşıda kaldık!" / "The bridge cracked! We're stuck over here!"

**Panel 2** — Gribeton çatlağın önünde, iki eli başında, klasörü yere düşmüş.
- Gribeton: "Benim köprüm… Beton çatlamaz demiştim." / "My bridge… I said concrete never cracks."

**Panel 3** — Uzakta sönük fener, kararan deniz.
- Rıza Kaptan: "Fener de söndü. Gece dönemeyiz." / "And the lighthouse is out. We can't sail home tonight."

**Panel 4** — Tuna Gribeton'un klasörünü yerden alıp uzatıyor; Gribeton şaşkın.
- Tuna: "Önce feneri yakalım, sonra köprüyü kuralım!" / "First we light the lighthouse, then we build the bridge!"

**Panel 5** — Dede rüzgârda kasketini tutuyor, metresiyle denizi gösteriyor; Kepçe'nin kulakları rüzgârda uçuyor.
- Usta Dede: "Rüzgârı hesaba kat, evlat." / "Mind the wind, kiddo."

**Bitiş (`story.ch4.end`, 5 panel)**

**Panel 1** — Gece; fenerin ışığı denizi süpürüyor, tekneler eve dönüyor. Rıza Kaptan beresini sallıyor.
- Rıza Kaptan: "Işık var! Eve dönüyoruz!" / "We've got light! We're heading home!"

**Panel 2** — Renkli asma köprü; halatlarda balonlu bayraklar. Balıkçılar köprüden geçerken Tuna'ya el sallıyor.
- Balıkçılar: "Yaşa Minik Usta!" / "Hooray for Tuna!"

**Panel 3** — Köprü başında Gribeton, klasörünü kucağına bastırmış, gözleri yerde, yanakları pembe.
- Gribeton: "Ben… şey… teşekkür ederim, Minik Usta." / "I… um… thank you, Tuna."

**Panel 4** — Tuna elini uzatıyor; Gribeton bir an tereddüt ediyor, sonra küçük bir gülümseme.
- Tuna: "Bir dahakini birlikte yapalım mı?" / "Shall we build the next one together?"

**Panel 5** — Kepçe Gribeton'un cilalı ayakkabısını yalıyor; Gribeton tek ayak üstünde zıplıyor.
- Gribeton: "Hey! Onlar cilalı!" / "Hey! Those are polished!"

### 4.5 Hikaye Bölümü 5 — Festival Şatosu

**Başlangıç (`story.ch5.start`, 4 panel)**

**Panel 1** — Belediye meydanı; Bay Kurdele kürsüde, dev makası havada.
- Bay Kurdele: "Renkli Tepe Festivali'ne bir şato lazım!" / "The Colorful Hill Festival needs a castle!"

**Panel 2** — Ayşe Teyze, Selin ve Rıza Kaptan aynı anda Tuna'yı gösteriyor; Tuna kızarmış.
- Hep birlikte: "Minik Usta yapar!" / "Tuna can do it!"

**Panel 3** — Kalabalık ikiye ayrılıyor; Gribeton gri kamyonlarıyla geliyor, kasalarda gri bloklar.
- Gribeton: "Gri bloklarım temel olsun. Üstü… renkli." / "Let my gray blocks be the foundation. The top… colorful."

**Panel 4** — Tuna ve Gribeton el sıkışıyor; Dede mendiliyle gözlüğünü siliyor (duygulanmış).
- Usta Dede: "Gri ile renk, en sağlam harç." / "Gray and color make the strongest mortar."

**Bitiş — büyük final (`story.ch5.end`, 6 panel)**

**Panel 1** — Festival gecesi, ışıklı şato. Bay Kurdele kurdeleyi kesiyor, konfeti.
- Bay Kurdele: "Festival açıldı!" / "Let the festival begin!"

**Panel 2** — Gökyüzünde blok biçimli havai fişekler (kare, L, T). Kepçe kasklı kafasını kaldırmış havlıyor.
- Kepçe: "Hav! Hav!" / "Woof! Woof!"

**Panel 3** — Bay Kurdele Tuna'ya mala biçimli altın kupayı veriyor.
- Bay Kurdele: "Yılın Firması: Minik Usta İnşaat!" / "Company of the Year: {company}!"

**Panel 4** — Tuna kupayı Gribeton'la birlikte tutuyor; Gribeton'un kravatında küçük renkli bir mozaik iğne.
- Gribeton: "Gri… renkle güzelmiş." / "Gray… looks good with color."

**Panel 5** — Tavan arası, ilk sahnedeki pencere. Dede ve Tuna yeni tabelayı duvara asıyor (i18n: "USTA DEDE & MİNİK
USTA").
- Usta Dede: "Firma artık senin, usta." / "The company is yours now, master builder."
- Tuna: "Bizim, Dede. Hep birlikte!" / "Ours, Grandpa. All together!"

**Panel 6** — Bahçede Kepçe topraktan eski, katlanmış bir harita çıkarmış, kafasını eğmiş.
- Kepçe: "Hav?" / "Woof?"
- (alt yazı) "Devamı yolda…" / "To be continued…"

---

## 5. Kasaba görevleri — mini sahneler

Her görev kısa bir sahne oynatır (≤ 2 s yapı animasyonu + tek satır). Maliyetler öneri (bölüm başına toplam 10 ★ =
10 bölümün yıldızı).

### Bölüm 1 — Ağaç Ev

| # | Görev (TR / EN) | ★ | Mini sahne satırı (TR / EN) |
| - | --------------- | - | --------------------------- |
| 1 | Ağaç basamakları / Tree steps | 1 | Kepçe ilk basamağa zıplar: "Hav!" / Kepche hops on the first step: "Woof!" |
| 2 | Platform / Platform | 1 | Tuna platformda zıplar: "Sağlam!" / Tuna bounces on it: "Solid!" |
| 3 | Duvarlar / Walls | 1 | Dede tıklatır: "Tok ses, iyi duvar." / Grandpa knocks: "Good wall, good sound." |
| 4 | Pencere ve perde / Window and curtain | 2 | Kepçe pencereden bakar, perde kafasına düşer. / Kepche peeks out; the curtain flops onto its head. |
| 5 | Çatı / Roof | 2 | Yağmur başlar, ağaç ev kuru kalır: "Tam zamanında!" / Rain starts, the house stays dry: "Just in time!" |
| 6 | İp merdiven ve makara / Rope ladder and pulley | 1 | Makarayla bir sepet kurabiye yukarı çıkar. / A basket of cookies rises on the pulley. |
| 7 | Bayrak ve tabela / Flag and sign | 2 | Bayrak dalgalanır; çitin üstünden ilk meraklılar bakar. → Bitiş sahnesi / The flag waves; the first curious faces appear. → End scene |

### Bölüm 2 — Mahalle Fırını

| # | Görev | ★ | Mini sahne satırı |
| - | ----- | - | ----------------- |
| 1 | Fırın temeli / Bakery foundation | 1 | Ayşe Teyze temeli kutsar gibi un serper. / Ayşe sprinkles flour on it like a blessing. |
| 2 | Fırın ağzı / Oven mouth | 1 | İlk ateş yanar: "Çıtır çıtır!" / The first fire crackles: "Crackle crackle!" |
| 3 | Tezgâh / Counter | 1 | Ekmekler sıraya dizilir, Kepçe bir tanesini koklar. / Loaves line up; Kepche sniffs one. |
| 4 | Vitrin / Shop window | 2 | Çocuklar burunlarını cama yapıştırır. / Kids press their noses to the glass. |
| 5 | Kiremit çatı / Tile roof | 2 | Gribeton geçerken durur, bir kiremidi tıklatır. / Gribeton stops to tap a tile. |
| 6 | Baca / Chimney | 1 | Bacadan ekmek biçimli duman çıkar. / Bread-shaped smoke puffs out. |
| 7 | Bahçe masaları / Garden tables | 2 | Kasaba halkı oturur, çay gelir. → Bitiş sahnesi / Townsfolk sit, tea arrives. → End scene |

### Bölüm 3 — Okul Kütüphanesi

| # | Görev | ★ | Mini sahne satırı |
| - | ----- | - | ----------------- |
| 1 | Kurutma rafları / Drying racks | 1 | Kitaplar sıra sıra kurur. / Books dry in neat rows. |
| 2 | Okuma minderleri / Reading cushions | 1 | Kepçe mindere kıvrılır, uyuyakalır. / Kepche curls up and dozes off. |
| 3 | Mozaik duvar / Mosaic wall | 2 | Selin desenin eksik taşını gösterir: "Tam burası!" / Selin points at the missing tile: "Right there!" |
| 4 | Saat kulesi / Clock tower | 1 | Saat ilk kez çalar, güvercinler havalanır. / The clock chimes; pigeons take off. |
| 5 | Büyük pencereler / Big windows | 2 | Güneş içeri dolar, raflar parlar. / Sunlight pours in. |
| 6 | Bahçe duvarı / Garden wall | 1 | Çocuklar duvara tebeşirle desen çizer. / Kids chalk patterns on it. |
| 7 | Açılış kapısı / Grand door | 2 | Selin kapıyı açar, çocuklar koşar. → Bitiş sahnesi / Selin opens the door; kids rush in. → End scene |

### Bölüm 4 — Deniz Feneri ve Köprü

| # | Görev | ★ | Mini sahne satırı |
| - | ----- | - | ----------------- |
| 1 | Balıkçı iskelesi / Fishing pier | 1 | Rıza Kaptan halatı bağlar: "Sağlam düğüm!" / Captain Rıza ties up: "Solid knot!" |
| 2 | Fener gövdesi / Lighthouse tower | 2 | Martılar gövdenin etrafında döner. / Gulls circle the tower. |
| 3 | Fener lambası / Lighthouse lamp | 2 | Lamba ilk kez yanar, deniz ışıldar. / The lamp lights up for the first time. |
| 4 | Martı yuvaları / Gull nests | 1 | Bir martı Tuna'nın kaskına konar. / A gull lands on Tuna's helmet. |
| 5 | Köprü halatları / Bridge ropes | 1 | Halatlar gerilir, balonlu bayraklar çıkar. / The ropes go taut; balloon flags rise. |
| 6 | Köprü tabliyesi / Bridge deck | 2 | Gribeton ilk adımı atar, köprü hafifçe sallanır. / Gribeton takes the first step; it sways gently. |
| 7 | Balıkçı kulübesi / Fisher's hut | 1 | Balıkçılar içeri girer, sıcak çorba. → Bitiş sahnesi / The fishers head in for hot soup. → End scene |

### Bölüm 5 — Festival Şatosu

| # | Görev | ★ | Mini sahne satırı |
| - | ----- | - | ----------------- |
| 1 | Hendek köprüsü / Moat bridge | 1 | Kepçe hendeğe bakar, kendi yansımasına havlar. / Kepche barks at its reflection. |
| 2 | Sol kule / Left tower | 2 | Gri temelin üstünde renkli katlar yükselir. / Colorful floors rise on the gray base. |
| 3 | Büyük kapı / Great gate | 1 | Kapı açılır; Bay Kurdele makasını hazırlar. / The gate opens; the mayor readies the scissors. |
| 4 | Sağ kule / Right tower | 2 | Sol kulenin aynası; Selin alkışlar: "Simetri!" / A mirror of the left; Selin cheers: "Symmetry!" |
| 5 | Bayraklar / Flags | 1 | Bayraklar rüzgârda; Rıza Kaptan selam verir. / Flags snap in the wind; Rıza salutes. |
| 6 | Avlu ve sahne / Courtyard and stage | 1 | Ayşe Teyze'nin tezgâhı kurulur, simit kokusu. / Ayşe's stall opens; the smell of simit. |
| 7 | Festival ışıkları / Festival lights | 2 | Bütün ışıklar yanar. → Büyük final sahnesi / All the lights come on. → Grand finale |

---

## 6. Usta Dede'nin ipucu satırları

TR ≤ 8 kelime. Kimlikler `UX_FLOWS.md` §13 ile birebir.

| Kimlik | TR | EN |
| ------ | -- | -- |
| `tut.l1.lift` | Bloğu tut, duvarın üstünden kaldır! | Grab a block and lift it over the wall! |
| `tut.l1.drop` | Şantiyenin üstünde bırak, kendisi düşer. | Let go above the site and it drops. |
| `tut.l1.match` | Plandaki renge uyan bloğu seç. | Pick the block that matches the plan. |
| `tut.l2.pattern` | Plana bak: renkler şerit şerit. | Look at the plan: colors come in stripes. |
| `tut.l2.shadow` | Gölge, bloğun nereye düşeceğini gösterir. | The shadow shows where it will land. |
| `tut.l3.gap` | Duvarda geçit var! Bloğu içinden geçir. | There's a gap! Slide the block through. |
| `tut.l3.rail` | Geçitten giren blok rayda kalır, düşmez. | Through a gap, it rides the rail. No drop. |
| `tut.l4.window` | Taralı yerler boş kalacak: pencere! | Hatched cells stay empty: it's a window! |
| `tut.l4.above` | Pencerenin üstünü geçitten doldur. | Fill above the window through the gap. |
| `tut.l5.segments` | Bu parça bitince şantiye kayar. | Finish this part and the site moves on. |
| `tut.l5.truck` | Kamyon yeni malzeme getirdi! | The truck brought new materials! |
| `tut.l6.crane` | Duvar yüksek. Bloğu en tepeye kaldır! | High wall! Lift the block all the way up! |
| `tut.l7.dig` | Lazım olan altta. Üsttekini kenara koy. | What you need is below. Move the top one aside. |
| `tut.l7.free` | İşte! Artık alabilirsin. | There! Now you can take it. |
| `tut.l8.heavy` | Bu çok geniş, şantiyeye sığmaz. | Too wide. It won't fit on the site. |
| `tut.l8.hammer` | Çekiçle kır, yol açılsın! | Smash it with the hammer! |
| `tut.l9.narrow` | Dar geçitten yalnız tek sıra geçer. | Only one-row blocks fit a narrow gap. |
| `tut.l10.crane` | Vinç her şeyi taşır, döndürür de! | The crane carries anything, and rotates it too! |
| `tut.l11.crate` | Yanındaki bloğu oynat, kasa çatlar. | Move a block next to it to crack the crate. |
| `tut.l12.clear` | Hedef: bütün kasaları kır! | Goal: break every crate! |
| `tut.l12.thermos` | Termos: başlarken üç hamle daha. | Thermos: three extra moves at the start. |
| `tut.l13.shutter` | Kepenk hamle sayar. Açıkken geçir! | The shutter counts moves. Pass while it's open! |
| `tut.l13.undo` | Yanlış mı oldu? Geri Al kurtarır. | Oops? Undo saves the day. |
| `tut.l14.gravity` | Dikkat! Alttakini alırsan üsttekiler düşer. | Careful! Take the bottom one and the rest fall. |
| `tut.l15.heavyfall` | Ağır yük! Şantiyede uzun tutamazsın. | Heavy load! You can't hold it long up there. |
| `tut.l16.slider` | Bu kapı her hamlede kayar. | This gate slides after every move. |
| `tut.l16.trowel` | Mala Başlangıcı: Altın Mala'yla başla. | Trowel Start: begin with a Golden Trowel. |
| `tut.l17.debris` | Moloz yanlış yerde. Sahaya taşı. | That debris doesn't belong. Carry it back. |
| `tut.l18.bag` | Yanında oynarsan çimento torbası yırtılır. | Move next to the cement bag to tear it. |
| `tut.l19.screw` | Altın vidalar blokların altında. Kaz! | Golden screws hide under blocks. Dig! |
| `tut.l20.openshutter` | Açık Kepenk: beş hamle geçitler açık. | Open Shutter: all gaps open for five moves. |
| `tut.l21.glass` | Cam kırılır! Çok yüksekten bırakma. | Glass breaks! Don't drop it from too high. |
| `tut.l22.paint` | Boya kapısı bloğu kendi rengine boyar. | The paint gate recolors the block. |
| `tut.l22.brush` | Boya Fırçası bir bloğun rengini değiştirir. | The Paint Brush changes a block's color. |
| `tut.l23.steer` | Hafif blok süzülür. Dokun, yana kaysın. | Light blocks float. Tap to nudge them. |
| `tut.l24.chain` | Zincirli blok bekler. Önce yanındakini oynat. | Chained! Move its neighbor first. |
| `tut.l26.key` | Anahtar bir bloğun altında. Bul, kilit açılsın! | The key is under a block. Find it to unlock! |
| `tut.l27.repeat` | Soru işareti mi? Desen tekrar ediyor. | Question marks? The pattern repeats. |
| `tut.l28.wet` | Islak beton kurumadan oynamaz. Sayaca bak. | Wet concrete can't move yet. Watch the count. |
| `tut.l29.mirror` | Bu taraf, öbür tarafın aynası. | This side mirrors the other one. |
| `tut.l31.carousel` | Platform dönüyor! Öndekine yerleştir. | The platform turns! Build on the front one. |
| `tut.l32.wind` | Rüzgâr ince blokları yana iter. | Wind pushes thin blocks sideways. |
| `tut.l35.mortar` | Harçlı blok nereye düşerse yapışır. Dikkat! | Mortar blocks stick wherever they land! |
| `tut.l37.elevator` | İskele iner çıkar. Geçide göre ayarla. | The scaffold moves. Time it with the gap. |
| `tut.l38.balloon` | Balonlu blok düşmez, yükselir! | Balloon blocks don't fall. They rise! |
| `tut.ctx.streak` | Hatasız dört doğru, Altın Mala getirir! | Four right in a row earns a Golden Trowel! |
| `tut.ctx.goldtrowel` | Altın Mala'yla boş bir plan hücresine dokun. | Tap any empty plan cell with the Golden Trowel. |
| `tut.ctx.bounce` | Renk uymadı, blok geri döndü. | Wrong color, so it bounced back. |
| `tut.ctx.lastmoves` | Son beş hamle! Acele etme, düşün. | Five moves left! Think, don't rush. |
| `tut.ctx.queue` | Sahada yer aç, kamyon boşaltsın. | Make room so the truck can unload. |
| `tut.ctx.reshuffle` | Sıkıştık! Kamyon Yardımı geliyor. | We're stuck! Truck Help is on the way. |
| `tut.ctx.blocked` | Bu blok şimdi kımıldamaz. Çevresine bak. | That one can't move yet. Look around it. |
| `tut.meta.bridge` | Yedi bölümü art arda kazan, köprüyü geç! | Win seven in a row to cross the bridge! |
| `tut.meta.league` | Usta Ligi: her hafta en iyiler yükselir. | Builder League: the best move up each week. |
| `tut.meta.chest` | On bölüm tamam! Sandığı aç. | Ten levels done! Open the chest. |
| `tut.meta.daily` | Her gün uğra, hediyen hazır. | Drop by every day for a gift. |
| `tut.meta.shop` | Mağazada altın ve paketler var. | The shop has coins and bundles. |
| `tut.meta.piggy` | Kazandıkça kumbara dolar. | Your brick bank fills as you win. |

---

## 7. Diğer kısa metinler

### 7.1 Tuna ve Kepçe tepki balonları (isteğe bağlı, oyun ekranı, 1 s)

| Kimlik | Durum | TR | EN |
| ------ | ----- | -- | -- |
| `react.tuna.combo` | Altın Mala | Usta işi! | Pro move! |
| `react.tuna.segment` | Dilim tamam | Bir kat daha! | One more floor! |
| `react.tuna.bad` | Hatalı yerleşim | Hımm, olmadı. | Hmm, not that one. |
| `react.tuna.last` | Son 5 hamle | Az kaldı! | Almost there! |
| `react.kepce.dig` | Kazı (K-10) | Hav! | Woof! |

### 7.2 Etkinlik metinleri

| Kimlik | TR | EN |
| ------ | -- | -- |
| `bridge.title` | Sallanan Köprü | Wobbly Bridge |
| `bridge.rule` | Yedi bölümü art arda kazan, ödülü paylaş! | Win seven in a row and share the prize! |
| `bridge.remaining` | Köprüde kalan: {n}/100 | Still on the bridge: {n}/100 |
| `bridge.fell` | Köprüden düştün ama simit seni kurtardı! | You fell off, but the ring buoy saved you! |
| `bridge.won` | Karşı kıyıdasın! Ödülün hazır. | You made it across! Your prize is ready. |
| `league.title` | Usta Ligi | Builder League |
| `league.promote` | Terfi çizgisi | Promotion line |
| `league.demote` | Düşme çizgisi | Relegation line |
| `league.result.up` | Bir üst lige çıktın! | You moved up a league! |
| `league.result.stay` | Ligini korudun. | You held your league. |
| `league.result.down` | Bir alt lige indin. Hafta yeni! | You moved down. New week, new start! |

### 7.3 Kaybetme ve teklif metinleri

| Kimlik | TR | EN |
| ------ | -- | -- |
| `lose.title` | Hamleler bitti! | Out of moves! |
| `lose.left` | {n} hücre kaldı | {n} cells to go |
| `lose.tuna` | Az kaldı! | So close! |
| `lose.offer` | +5 hamle | +5 moves |
| `lose.giveup` | Vazgeç | Give up |
| `lose.life` | Bir can gitti. | You lost a life. |
| `lose.retry` | Tekrar dene | Try again |
| `lose.streak` | Galibiyet serin sıfırlandı. | Your win streak was reset. |
