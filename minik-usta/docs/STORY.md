# Hikaye ve karakterler — Minik Usta

Sahip: design-lead · Durum: Faz 1 revizyonu (2026-10-04; R-07, R-08, R-09, R-14, R-15, R-19, R-24 işlendi); Faz 2
metin satırları (2026-10-06; §7.3 `lose.adToday`, §7.5 `exit.*` / `resume.strip`, yeni §7.6) · Kaynak:
`docs/BRIEF.md` §9 · Görünüm: `docs/ART_DIRECTION.md` §11 · Öğretici yerleşimi: `docs/UX_FLOWS.md` §13

**Kapsam:** ara sahneler, görev satırları, ipuçları, etkinlik ve teklif metinleri **[MVP]**; §7.1 tepki balonları
**[Sonra]**; "Devamı yolda…" sahnesi **[MVP]**.

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
8. **Tuna'nın yaşı oyunda geçmez** (BUSINESS S15): oyun içi metinde, mağaza materyalinde ve reklam kreatifinde yaş ya da
   Tuna'yı küçük gösteren espri yok. Brifteki "8" yalnız iç belge bilgisidir. Sahnelerde yetişkin kasaba halkı en az
   çocuklar kadar yer alır (esnaf, emekliler, veliler); espriler iş hayatından (referans, kartvizit, kalite kontrol).
9. **İpucu dili (R-08):** oyuncuya görünen terim **"blok" / "block"** ("parça/piece" yok); öğretici ve ipucu
   metninde **renk adı geçmez** (renk körü oyuncu); değişken sayılar `{n}` ile yazılır (ör. döner platform periyodu).
   Ekranda görünen öğretici metnin tek kaynağı bu belgedir (§6); OBSTACLES'taki metinler engel bilgi kartıdır
   (`obs.{id}.desc`, product-lead). TR'de sayı yer tutucusuna (`{n}`, `{coin}{n}`, `{max}`…) **ek bağlanmaz**: ek
   sayının okunuşuna göre değişir (900'ü, 40'ı, 1040'ta), metin bunu garanti edemez; cümle eksiz kurulur ("Eksik {coin}{n}
   için yeterli", "Kırma eşiği: {coin}{n}", "{n}. bölümde açılır").
10. **Ad ve firma (R-24):** "Kepche", `{company}` (varsayılan "Tuna & Co."; yalnız oyun içi firma adı, mağaza adı
    değil). Oyun adı `app.title` anahtarından gelir; "Minik Usta" TR'de Tuna'nın lakabı olarak kalır. `app.title`
    çalışma değeri iki dilde de **"Lift & Land"**dir (§7.6; D-068 aday sırası 1 ve "tek global EN marka" önerisi, NAMING
    §5): marka araması (NAMING §6 adım 2) bitene kadar yer tutucudur, proje sahibi başka aday seçerse yalnız bu anahtar
    ve `logo_wordmark` değişir. Oyun adı büyük harfe **çevrilmez**, yazıldığı biçimde çizilir (TR yerelinde
    `toLocaleUpperCase` "LİFT" yazardı; ART §8). Kasaba adı
    oyuncuya görünen her metinde (TR ve EN) `{town}` yer tutucusudur; değeri tek kaynaktan, `town.name` anahtarından
    gelir (TR "Renkli Tepe", EN "Hue Hill" çalışma çevirisi; NAMING kararıyla yalnız bu anahtar değişir). Ek, yer
    tutucudan sonraki kelimeye bağlanır ("{town} Festivali'ne", "{town} çırakları"); yer tutucunun kendisine ek gelmez.
11. **Satır içi simgeler (font alt kümesi, ART §8):** metne Baloo 2 alt kümesinde olmayan karakter (●, ✓, ★, ♥ gibi)
    **yazılmaz**. Yerine simge yer tutucusu kullanılır; kod bunu satır yüksekliğinde (1 em) görüntü olarak çizer:
    `{coin}` → `icon_coin` (altın miktarı: `{coin}{n}`), `{ok}` → `ghost_badge_ok` (gölgedeki ✓ rozeti). EN ve TR aynı
    yer tutucuyu kullanır.

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
| **Tuna** (iç bilgi: 8; oyunda yaş geçmez) | Kahraman, "Minik Usta". Meraklı, enerjik, vazgeçmez. Her bölümde bir sorunu renkli bir yapıyla çözer. | Ünlemli, kısa, plan kuran cümleler. | "Plan hazır, kask tamam!" / "Plan ready, helmet on!" |
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
| 1 Ağaç Ev | 1–10 | Yeni açılan firmaya kimse iş vermez (referans yok); Gribeton burun kıvırır | İlk yapı; kasaba fark eder | Bölüm 1 kasaba görevi 1 tamamlanınca | Bölüm 1'in son görevi tamamlanınca |
| 2 Mahalle Fırını | 11–20 | Ayşe Teyze'nin bacası çöktü; Gribeton gri kutu önerir | Renkli fırın açılır; ilk gerçek müşteri | Bölüm 1 bitiş sahnesinden sonra ana ekranın bir sonraki açılışı (ekran geçişi ya da soğuk açılış) | Bölüm 2 son görev |
| 3 Okul Kütüphanesi | 21–30 | Kütüphaneyi su bastı | Mozaik duvarlı kütüphane; Selin'in desen ipuçları | Bölüm 2 bitiş sahnesinden sonra ana ekranın bir sonraki açılışı (ekran geçişi ya da soğuk açılış) | Bölüm 3 son görev |
| 4 Fener ve Köprü | 31–40 | Gribeton'un gri köprüsü çatladı; balıkçılar mahsur | Fener yanar, asma köprü kurulur; Gribeton ilk kez teşekkür eder | Bölüm 3 bitiş sahnesinden sonra ana ekranın bir sonraki açılışı (ekran geçişi ya da soğuk açılış) | Bölüm 4 son görev |
| 5 Festival Şatosu | 41–50 | Festivale şato lazım | Gribeton gri temeli getirir; birlikte inşa; "Yılın Firması" | Bölüm 4 bitiş sahnesinden sonra ana ekranın bir sonraki açılışı (ekran geçişi ya da soğuk açılış) | Bölüm 5 son görev |

Görevler bölümleri kilitlemez; yalnız ara sahneleri açar (brif §10). **Görev listesi esastır (R-07):** 5 × 7 = 35
görev, ad ve sıra bu belgededir; META ve `economy.json` bunlara göre güncellendi. Yıldız maliyetleri META §1'de
kesindir; §5 aynı değerleri gösterir (fark çıkarsa META geçerlidir).

**Sahne tetikleyicileri (R-09, brif FTUE sırası; kural META §1, product-lead; `economy.json` `town.cutscenes`):**
prolog FTUE'de (Bölüm 1'den önce); `story.ch1.start` Hikaye Bölümü 1'in **1. görevi** yapılınca, görevin mini
sahnesinden sonra (brifteki "ilk yıldızı harcama → ilk ara sahne" adımı); `story.chN.start` (N ≥ 2) `story.ch(N−1).end`
kapandıktan sonra **ana ekranın bir sonraki açılışında** (başka bir ekrandan ana ekrana geçiş ya da soğuk açılış;
bitiş sahnesinin kapanıp oyuncuyu ana ekranda bırakması açılış sayılmaz). Bu sahne oynayana kadar kasaba N−1 yapısını
gösterir ve N'nin görev balonu çıkmaz; böylece hikayenin sorunu o bölümün ilk görevinden **önce** anlatılır.
`story.chN.end` son (7.) görev yapılınca. Bir eylem en çok bir ara sahne oynatır: N−1 bitişi ile N başlangıcı arka
arkaya oynamaz.

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
- Ayşe Teyze: "İlanın şirin ama… referansın var mı?" / "Cute poster, but… any references?"
- Tuna: "Dedem! Kırk yıllık usta." / "My grandpa! Forty years a master builder."

**Panel 2** — Gri bir kamyonetten Bay Gribeton iniyor, klasörü göğsünde, burnu havada; renkli ilana göz ucuyla bakıyor.
- Gribeton: "Renkli ilan mı? Verimsiz! Gerçek işler gri betondan yapılır." / "A colorful poster? Inefficient! Real work is made of gray concrete."

**Panel 3** — Tuna'nın omzu düşük; Usta Dede katlanır metresiyle Tuna'nın kaskına hafifçe dokunuyor.
- Usta Dede: "Önce temeli düşün, evlat. Küçükten başla." / "Think of the foundation first, kiddo. Start small."

**Panel 4** — Arka bahçede kocaman bir çınar. Tuna metreyi çınara doğru uzatmış, gözleri parlıyor; Kepçe ağacın dibini
kazmaya başlamış.
- Tuna: "Arka bahçeye bir ağaç ev! Herkes görecek." / "A tree house out back! Everyone will see it."
- Kepçe: "Hav hav!" / "Woof woof!"

**Bitiş (`story.ch1.end`, 4 panel)**

**Panel 1** — Renkli ağaç ev tamam; bayrağı dalgalanıyor. Çitin üstünden komşular bakıyor: postacı, bisikletli
emekli bir çift, elinde fileyle bir anne.
- Postacı: "Bunu kim yaptı? Kartvizitin var mı?" / "Who built this? Got a business card?"

**Panel 2** — Tuna ağaç evin penceresinden el sallıyor; Kepçe ip merdivenin ortasında asılı kalmış, kask gözüne düşmüş.
- Tuna: "Minik Usta İnşaat, hizmetinizde!" / "{company}, at your service!"

**Panel 3** — Arka planda Gribeton, gözlerini kısmış, klasörüne bir not yazıyor; ön planda Ayşe Teyze telaşla koşuyor,
önlüğü unlu.
- Gribeton: "Hımm. Verimsiz… ama ilginç." / "Hmm. Inefficient… but interesting."
- Ayşe Teyze: "Tuna! Fırınımın bacası çöktü!" / "Tuna! My bakery chimney collapsed!"

**Panel 4** — Yapı kartı (yalnız gösterilir; Albüm Sonra, R-19): ağaç ev, kenarında "Ağaç Ev" etiketi (i18n katmanı).
Tuna, Dede ve Kepçe beşlik çakıyor (Kepçe patisiyle).
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
- Gribeton: "Göreceğiz, Minik Usta." / "We'll see, Tuna."
- Kepçe: "Hav?" / "Woof?"

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

**Panel 2** — Okul bahçesinde öğrenciler, veliler ve emekli okurlar kitapları mandallarla ipe asıyor (kütüphane
okulun ve bütün kasabanın).
- Emekli okur: "Kasabanın tek kütüphanesiydi!" / "That was the town's only library!"

**Panel 3** — Selin karatahtaya bir mozaik deseni çizmiş; Tuna'nın gözleri parlıyor.
- Selin: "Desenleri seversin, değil mi Tuna?" / "You like patterns, don't you, Tuna?"
- Tuna: "Mozaik duvarlı bir kütüphane!" / "A library with a mosaic wall!"

**Panel 4** — Kapıda Gribeton yağmurluğuyla; Dede şemsiyesini Kepçe'ye tutuyor.
- Gribeton: "Islanmayan tek şey betondur." / "Only concrete stays dry."
- Usta Dede: "Su geçirmez olan renkli de olur." / "Waterproof can be colorful too."

**Bitiş (`story.ch3.end`, 4 panel)**

**Panel 1** — Güneşli gün; mozaik duvar mor-mavi parlıyor; öğrenciler, veliler ve emekli okurlar içeri doluyor.
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

**Yedek plan (ASSET §9; yalnız sanat takvimi kayarsa, 4 + 4 panel):** başlangıçta Panel 3 kesilir — sönük fener Panel
1'in arka planına çizilir, Rıza Kaptan'ın "Fener de söndü…" balonu Panel 1'de ikinci balon olur. Bitişte Panel 5
kesilir — Kepçe'nin ayakkabı şakası Panel 4'ün ön planına küçük olarak girer, Gribeton'un "Hey! Onlar cilalı!"
balonu Panel 4'te ikinci balondur.

### 4.5 Hikaye Bölümü 5 — Festival Şatosu

**Başlangıç (`story.ch5.start`, 4 panel)**

**Panel 1** — Belediye meydanı; Bay Kurdele kürsüde, dev makası havada.
- Bay Kurdele: "{town} Festivali'ne bir şato lazım!" / "The {town} Festival needs a castle!"

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

**Yedek plan (ASSET §9; yalnız sanat takvimi kayarsa):** başlangıç 4 panel kalır. Büyük final 6 → 4: Panel 1 + 2
birleşir (kurdele kesilirken gökyüzünde blok biçimli havai fişekler; Bay Kurdele ve Kepçe balonları aynı panelde;
"en yüksek detay" bu paneldir), Panel 3 + 4 birleşir (Bay Kurdele kupayı Tuna ile Gribeton'a birlikte uzatır; iki
balon). Panel 5 (tabela) ve Panel 6 ("Devamı yolda…") değişmez.

---

## 5. Kasaba görevleri — mini sahneler

Her görev kısa bir sahne oynatır (≤ 2 s yapı animasyonu + tek satırlık balon; MVP-lite). Liste esastır (R-07);
maliyetler META ile aynıdır (hikaye bölümü başına toplam 10 ★ = 10 bölümün yıldızı). Anahtarlar
`town.ch<n>.t<m>.name` (görev adı) ve `town.ch<n>.t<m>.scene` (sahne satırı).

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
| 4 | Vitrin / Shop window | 2 | Postacı burnunu cama yapıştırır. / The mail carrier presses their nose to the glass. |
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
| 6 | Bahçe duvarı / Garden wall | 1 | Veliler ve öğrenciler duvara tebeşirle desen çizer. / Parents and students chalk patterns on it. |
| 7 | Açılış kapısı / Grand door | 2 | Selin kapıyı açar, kasaba halkı içeri dolar. → Bitiş sahnesi / Selin opens the door; the town pours in. → End scene |

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

TR ≤ 8 kelime. Kimlikler `UX_FLOWS.md` §13 ile birebir (tek küme `tut.l{n}.{konu}`, `tut.ctx.*`, `tut.meta.*`; R-08).
Terim "blok"; renk adı yok; kural doğruluğunu product-lead doğrular (GDD K-xx sütunu). Bölüm 1–10'da hangi satırın
hangi adımda çıktığı LEVELS §2 `tutorial[]` verisindedir (ör. Bölüm 3 ve 9'un ilk adımı `tut.l1.match`, Bölüm 4'ün
2. adımı `tut.ctx.support`); bu tablo yalnız metni tanımlar.

| Kimlik | TR | EN | Kural |
| ------ | -- | -- | ----- |
| `tut.l1.lift` | Bloğu tut, duvarın üstünden kaldır! | Grab a block and lift it over the wall! | K-11 |
| `tut.l1.drop` | Şantiyenin üstünde bırak, kendisi düşer. | Let go above the site and it drops. | K-11 |
| `tut.l1.match` | Plandaki renge uyan bloğu seç. | Pick the block that matches the plan. | K-16 |
| `tut.l2.pattern` | Plana bak: renkler şerit şerit. | Look at the plan: colors come in stripes. | K-31 |
| `tut.l2.shadow` | Gölgede {ok} varsa yer doğru. | A {ok} on the shadow means the spot is right. | K-18 |
| `tut.l3.gap` | Duvarda geçit var! Bloğu içinden kaydır. | There's a gap! Slide the block through. | K-12 |
| `tut.l3.rail` | Raydaki blok düşmez. Sıradakini üstünden aşır. | On the rail it stays put. Lift the next one over. | K-12 |
| `tut.l4.window` | Taralı yerler boş kalacak: pencere! | Hatched cells stay empty: it's a window! | S2 |
| `tut.l4.above` | Pencerenin üstünü geçitten raya koy. | Set the top of the window via the gap. | K-12, S2 |
| `tut.l5.segments` | Bu kat bitince şantiye kayar. | Finish this floor and the site moves on. | K-22 |
| `tut.l5.truck` | Kamyon yeni malzeme getirdi! | The truck brought new materials! | K-25 |
| `tut.l6.crane` | Duvar yüksek. Bloğu en tepeye kaldır! | High wall! Lift the block all the way up! | K-05 |
| `tut.l7.dig` | Lazım olan altta. Üsttekini kenara koy. | What you need is below. Move the top one aside. | K-10 |
| `tut.l7.free` | İşte! Artık alabilirsin. | There! Now you can take it. | K-09 |
| `tut.l8.heavy` | Bu çok geniş. Kenara çek ya da kır. | Too wide. Drag it aside or smash it. | Y5, K-10 |
| `tut.l8.hammer` | Sıkışırsan Çekiçle bir bloğu kır. | Stuck? Smash a block with the Hammer. | K-36 |
| `tut.l9.narrow` | Dar geçitten yalnız tek sıra geçer. | Only one-row blocks fit a narrow gap. | W3, K-12 |
| `tut.l10.crane` | Vinç gömülü bloğu da çıkarır, döndürür. | The Crane lifts even buried blocks and turns them. | K-37 |
| `tut.l11.crate` | Yanındaki bloğu oynat, kasa çatlar. | Move a block next to it to crack the crate. | Y1 |
| `tut.l12.clear` | Hedef: bütün kasaları kır! | Goal: break every crate! | K-41 |
| `tut.l12.thermos` | Termos: başlarken {n} hamle daha. | Thermos: {n} extra moves at the start. | K-40 (`{n}` = `economy.json → boosters.thermos.extraMoves`) |
| `tut.l13.shutter` | Kepenk hamle sayar. Açıkken geçir! | The shutter counts moves. Pass while it's open! | W4 |
| `tut.l13.undo` | Yanlış mı oldu? Geri Al kurtarır. | Oops? Undo takes back your last move. | K-39 |
| `tut.l14.gravity` | Dikkat! Alttakini alırsan üsttekiler düşer. | Careful! Take the bottom one and the rest fall. | K-20 |
| `tut.l15.heavyfall` | Ağır yerçekimi! Şantiyede uzun tutamazsın. | Heavy gravity! You can't hold it long up there. | K-19 G-H |
| `tut.l15.setting` | Süre kısa mı? Ayarlardan uzatabilirsin. | Too quick? You can extend it in Settings. | K-19 (R-11) |
| `tut.l16.slider` | Bu kapı her hamlede kayar. | This gate slides after every move. | W5 |
| `tut.l16.trowel` | Mala Başlangıcı: Altın Mala'yla başla. | Trowel Start: begin with a Golden Trowel. | K-40 |
| `tut.l17.debris` | Moloz yanlış yerde. Sahaya taşı. | That debris doesn't belong. Carry it back. | S4 (yalnız Bölüm 17 adımı; bağlamsal tetiği yok, UX §13.2) |
| `tut.l18.bag` | Torbanın yanındaki bloğu oynat, yırtılsın. | Move the block next to the bag to tear it. | Y2 |
| `tut.l19.screw` | Altın vidalar blokların altında. Kaz! | Golden screws hide under blocks. Dig! | Y7, K-42 |
| `tut.l20.openshutter` | Açık Kepenk: {n} hamle kepenkler ve kilitler açık. | Open Shutter: shutters and locks stay open for {n} moves. | K-40 (`{n}` = `boosters.openShutter.openForMoves`) |
| `tut.l21.glass` | Cam kırılır! Çok yüksekten bırakma. | Glass breaks! Don't drop it from too high. | S3 |
| `tut.l22.paint` | Geçitte boya, sahaya geri çek. | Paint it in the gate, then pull it back. | W6 |
| `tut.l22.over` | Şimdi duvarın üstünden yerine koy. | Now lift it over into place. | K-11, K-46 |
| `tut.l22.brush` | Boya Fırçası bir bloğun rengini değiştirir. | The Paint Brush changes a block's color. | K-38 |
| `tut.l23.light` | Hafif yerçekimi! Bloklar yavaş düşer. | Low gravity! Blocks fall slowly. | K-19 G-L (Bölüm 23 adım 1) |
| `tut.l23.steer` | Düşerken bir yana dokun, o yana kaysın. | Tap a side while it falls to nudge it there. | K-19 G-L (R-10; Bölüm 23 adım 2) |
| `tut.l24.chain` | Zincirli blok bekler. Önce yanındakini oynat. | Chained! Move its neighbor first. | Y3 |
| `tut.l26.key` | Anahtarın üstündeki bloğu kaldır, kilit açılsın! | Move the block off the key to unlock! | W7, K-42 (konum her zaman görünür) |
| `tut.l27.repeat` | Soru işareti mi? Aşağıdaki desen tekrar ediyor. | Question marks? The pattern below repeats. | K-32 `repeat` |
| `tut.l28.wet` | Islak beton kurumadan oynamaz. Sayaca bak. | Wet concrete can't move yet. Watch the count. | Y4 |
| `tut.l29.mirror` | Bu kat, öbür katın aynası. | This floor mirrors the other one. | K-32 `mirrorOf` |
| `tut.l31.carousel` | Platform dönüyor! Öndekine yerleştir. | The platform turns! Build on the front one. | S5 |
| `tut.l32.wind` | Rüzgâr ince blokları yana iter. | Wind pushes thin blocks sideways. | W8 |
| `tut.l35.mortar` | Harçlı blok yanlış yere düşerse yapışır. | A mortar block sticks if it lands in the wrong spot. | Y8 |
| `tut.l37.elevator` | İskele iner çıkar. Geçide göre ayarla. | The scaffold moves. Time it with the gap. | S6 |
| `tut.l38.balloon` | Balonlu blok düşmez, tavana yükselir! | Balloon blocks don't fall. They rise to the ceiling! | S8 |
| `tut.ctx.streak` | Hatasız {n} doğru, Altın Mala getirir! | Get {n} right in a row for a Golden Trowel! | K-33 (`{n}` = `combo.correctPlacementsPerTrowel`) |
| `tut.ctx.goldtrowel` | Altın Mala'yla parlayan bir hücreye dokun. | Tap a glowing cell with the Golden Trowel. | K-33, K-34 |
| `tut.ctx.bounce.color` | Renk uymadı, blok geri döndü. | Wrong color, so it bounced back. | K-16, K-17 |
| `tut.ctx.bounce.window` | Orası pencere, boş kalmalı. | That's a window. It stays empty. | S2, K-17 |
| `tut.ctx.bounce.offplan` | Plan dışına inşa edilmez. | Nothing gets built outside the plan. | K-16, K-17 |
| `tut.ctx.support` | Önce alttaki boşluğu doldur, evlat. | Fill the gap below first, kiddo. | K-34 (R-01; GDD K-34 kanca, LEVELS B4 adım 2) |
| `tut.ctx.tootall` | Bu blok çok uzun, üstten geçemez. | Too tall to pass over the top. | K-05 |
| `tut.ctx.lastmoves` | Son beş hamle! Acele etme, düşün. | Five moves left! Think, don't rush. | — |
| `tut.ctx.queue` | Sahada yer aç, kamyon boşaltsın. | Make room so the truck can unload. | K-26 |
| `tut.ctx.reshuffle` | Sıkıştık! Kamyon sahayı yeniden diziyor. | We're stuck! The truck is rearranging the yard. | K-30 D3; D1 ikinci dalı (zincir/ıslaklık yok ya da hâlâ D1) |
| `tut.ctx.truckhelp.material` | Malzeme eksikti. Kamyon getirdi! | We were short on material. The truck brought more! | K-30 D2 |
| `tut.ctx.truckhelp.free` | Kamyon yardım etti, bloklar serbest. Devam! | The truck helped, the blocks are free. Carry on! | K-30 D1 (yalnız zincir/ıslaklık kalkıp D1 çözüldüyse) |
| `tut.ctx.blocked` | Bu blok şimdi kımıldamaz. Çevresine bak. | That one can't move yet. Look around it. | K-09 |
| `tut.ctx.resume` | Kaldığın yerden devam, evlat. | Pick up where you left off. | K-43 (R-13) |
| `tut.meta.bridge` | {n} bölümü art arda kazan, köprüyü geç! | Win {n} in a row to cross the bridge! | META §6 (`{n}` = `events.json → wobblyBridge.planks`) |
| `tut.meta.league` | Usta Ligi: her hafta en iyiler yükselir. | Builder League: the best move up each week. | META §7 |
| `tut.meta.chest` | {n} bölüm tamam! Sandığı aç. | {n} levels done! Open the chest. | META §8.2 (`{n}` = `levelChest.everyLevels`) |
| `tut.meta.daily` | Her gün uğra, hediyen hazır. | Drop by every day for a gift. | META |
| `tut.meta.shop` | Mağazada altın ve paketler var. | The shop has coins and bundles. | — |
| `tut.meta.piggy` | Kazandıkça kumbara dolar. | Your brick bank fills as you win. | META |

---

## 7. Diğer kısa metinler

### 7.1 Tuna ve Kepçe tepki balonları **[Sonra]** (oyun ekranı, 1 s)

| Kimlik | Durum | TR | EN |
| ------ | ----- | -- | -- |
| `react.tuna.combo` | Altın Mala | Usta işi! | Pro move! |
| `react.tuna.segment` | Dilim tamam | Bir kat daha! | One more floor! |
| `react.tuna.bad` | Hatalı yerleşim | Hımm, olmadı. | Hmm, not that one. |
| `react.tuna.last` | Son 5 hamle (oyun içinde; teklif penceresinde **kullanılmaz**) | Az kaldı! | Almost there! |
| `react.kepce.dig` | Kazı (K-10) | Hav! | Woof! |

### 7.2 Etkinlik metinleri

| Kimlik | TR | EN |
| ------ | -- | -- |
| `bridge.title` | Sallanan Köprü | Wobbly Bridge |
| `bridge.rule` | {n} bölümü art arda kazan, ödülü paylaş! | Win {n} in a row and share the prize! |
| `bridge.remaining` | Köprüde kalan: {n}/{max} | Still on the bridge: {n}/{max} |
| `bridge.bots_label` | Rakiplerin: {town} çırakları | Your rivals: {town} apprentices |
| `bridge.bots_info` | Rakiplerin bilgisayarın yönettiği {town} çıraklarıdır. | Your rivals are computer-controlled {town} apprentices. |
| `bridge.rule_card.title` | Köprü kuralları | Bridge rules |
| `bridge.rule_card.win` | {n} bölümü art arda kazan. | Win {n} levels in a row. |
| `bridge.rule_card.lose` | Kaybedersen bu turdan çıkarsın. | If you lose, you're out of this round. |
| `bridge.rule_card.continue` | Kaybedince +{n} hamleyle devam edebilirsin. | You can continue with +{n} moves after a loss. |
| `bridge.rule_card.pool` | Ödül: {coin}{pool}, karşıya geçenler eşit böler. Süre: {time}. | Prize: {coin}{pool}, split evenly by everyone who crosses. Time: {time}. |
| `bridge.rule_card.extra` | Karşıya geçene ek ödül: {extras} | Bonus for crossing: {extras} |
| `bridge.rule_card.daily` | Günde en çok {n} köprüye katılabilirsin. | You can join up to {n} bridges a day. |
| `bridge.rule_card.join` / `.later` | Katıl / Şimdi değil | Join / Not now |
| `bridge.play` | Oyna · Bölüm {n} | Play · Level {n} |
| `bridge.fell` | Köprüden düştün ama simit seni kurtardı! | You fell off, but the ring buoy saved you! |
| `bridge.timeup` | Süre doldu. Bir sonraki köprüde görüşürüz. | Time's up. See you on the next bridge. |
| `bridge.finished` | Karşı kıyıdasın! Payın köprü kapanınca kesinleşir (şu an {coin}{share}). | You made it across! Your share is final when the bridge closes (now {coin}{share}). |
| `bridge.payout` | Köprü kapandı. Payın: {coin}{share} | The bridge has closed. Your share: {coin}{share} |
| `bridge.extra.got` | Ek ödülün verildi: {extras} | Bonus received: {extras} |
| `bridge.dailyLimit` | Bugünün köprüleri bitti. Sonraki köprü: {time} | That's all the bridges for today. Next bridge: {time} |
| `bridge.bot_tap` | {name} · bilgisayarın yönettiği çırak | {name} · computer-controlled apprentice |
| `league.title` | Usta Ligi | Builder League |
| `league.bots_label` | Rakiplerin: {town} çırakları | Your rivals: {town} apprentices |
| `league.bots_info` | Ligdeki diğer {n} kişi bilgisayarın yönettiği çıraklardır. | The other {n} in your league are computer-controlled apprentices. |
| `league.rule_card.points` | Kazandığın her bölüm puan getirir: Kolay {easy} · Normal {normal} · Zor {hard} · Çok Zor {superhard}. | Every level you win scores: Easy {easy} · Normal {normal} · Hard {hard} · Super Hard {superhard}. |
| `league.points_line` | Puan: Kolay {easy} · Normal {normal} · Zor {hard} · Çok Zor {superhard} | Points: Easy {easy} · Normal {normal} · Hard {hard} · Super Hard {superhard} |
| `league.rule_card.lines.both` | Hafta bitince ilk {up} yükselir, son {down} iner. | When the week ends, the top {up} move up and the bottom {down} move down. |
| `league.rule_card.lines.bronze` | Hafta bitince ilk {up} yükselir. Bu ligde düşme yok. | When the week ends, the top {up} move up. No one moves down here. |
| `league.rule_card.lines.diamond` | Hafta bitince son {down} bir alt lige iner. | When the week ends, the bottom {down} move down a league. |
| `league.header_lines.both` | İlk {up} terfi, son {down} düşer | Top {up} promote, bottom {down} drop |
| `league.header_lines.bronze` | İlk {up} terfi eder | Top {up} promote |
| `league.header_lines.diamond` | Son {down} düşer | Bottom {down} drop |
| `league.bonus.all` | Puan bonusu: her galibiyet ×{n} | Points bonus: every win ×{n} |
| `league.bonus.weekend.factor` | Hafta sonu bonusu: {levels} ×{n} puan | Weekend bonus: ×{n} points on {levels} |
| `league.bonus.weekend.add` | Hafta sonu bonusu: {levels} +{n} puan | Weekend bonus: +{n} points on {levels} |
| `league.bonus.levels.some` | {list} bölümlerde | {list} levels |
| `league.bonus.levels.all` | her bölümde | every level |
| `league.bonus.fair` | Bonus çıraklara da uygulanır. | Apprentices get the bonus too. |
| `league.bonus.now` | Şimdi geçerli | Active now |
| `league.bonus.starts` | Başlıyor: {time} | Starts in {time} |
| `difficulty.easy` / `.normal` / `.hard` / `.superhard` | Kolay / Normal / Zor / Çok Zor | Easy / Normal / Hard / Super Hard |
| `league.promote` | Terfi çizgisi | Promotion line |
| `league.demote` | Düşme çizgisi | Relegation line |
| `league.result.up` | Bir üst lige çıktın! | You moved up a league! |
| `league.result.stay` | Ligini korudun. | You held your league. |
| `league.result.down` | Bir alt lige indin. Hafta yeni! | You moved down. New week, new start! |
| `npc.apprentice.badge` | çırak | apprentice |
| `npc.apprentice.format` | Çırak {name} | Apprentice {name} |

`{town}` = `town.name` (§0-10): EN "Hue Hill" çalışma çevirisidir (TR "Renkli Tepe"); NAMING kararına bağlıdır ve
yalnız bu anahtarda değişir.

**Sayılar config'ten (D-017, UX başlığı):** `bridge.rule`, `bridge.rule_card.win` ve `tut.meta.bridge` `{n}` =
`events.json → wobblyBridge.planks`; `bridge.remaining` `{max}` = `wobblyBridge.participants`; `bridge.rule_card.daily`
`{n}` = `maxBridgesPerDay`; `bridge.rule_card.continue` `{n}` = `economy.json → outOfMoves.extraMoves` (§7.3 ile aynı
kaynak); `bridge.play` `{n}` = sıradaki bölüm numarası (`replay.button` kalıbı, ek yok, §0-9);
`league.bots_info` `{n}` = `masterLeague.bots`; `league.rule_card.lines.*` ve `league.header_lines.*` `{up}` / `{down}` =
`promoteTop` / `demoteBottom` (lige göre seçilir: `bronze` iken `.bronze`, düşme yok; `diamond` iken `.diamond`, terfi yok; Gümüş ve Altın'da `.both`; META §7.1, UX §10 çizgi kuralı);
`league.rule_card.points` ve `league.points_line` `{easy}`…`{superhard}` = `masterLeague.pointsPerWin.*` (çarpansız
taban; çarpan ayrı bantta). TR'de sayı rakamla yazılır. **LiveOps satırları
(META §6.1, §7.1; sunum UX §9–§10):** `bridge.rule_card.extra`, `bridge.extra.got` yalnız `finisherExtras` ≠ `null`
iken, `bridge.rule_card.daily` ve `bridge.dailyLimit` yalnız `maxBridgesPerDay` ≠ `null` iken görünür; değerler turun
katılım anında (`t_0`) donmuş olanlardır. `{extras}` = `finisherExtras` içeriği satır içi simgelerle (§0-11): altın
`{coin}{n}`, güçlendirici ikonu (1 em) + "×{n}", öğeler arasında " + ". `league.bonus.all` yalnız `pointsMultiplier` ≠ 1
(ondalıkta yerel ayraç: "×1,5"); `league.bonus.weekend.factor` yalnız `weekendMultiplier.factor` ≠ 1,
`.add` yalnız `addPoints` ≠ 0 iken; `{levels}` = `difficulties` dört zorluğu da içeriyorsa `league.bonus.levels.all`,
değilse `league.bonus.levels.some` (`{list}` = `difficulty.*` adları "/" ile, ör. "Zor/Çok Zor").

### 7.3 Kaybetme ve teklif metinleri (R-15)

| Kimlik | TR | EN |
| ------ | -- | -- |
| `lose.title` | Hamleler bitti! | Out of moves! |
| `lose.left` | Kalan: {n} hücre | Left: {n} cells |
| `lose.offer.moves` | +{n} hamle | +{n} moves |
| `lose.offer.count` | Teklif {n}/{max} | Offer {n}/{max} |
| `lose.offer.last` | Teklif {n}/{max} · son teklif | Offer {n}/{max} · last offer |
| `lose.offer.gift` | +{n} hamle · Usta Dede'den hediye | +{n} moves · a gift from Grandpa |
| `lose.ad` | Reklam izle · +{n} hamle | Watch an ad · +{n} moves |
| `lose.adToday` | bugün {n}/{max} | today {n}/{max} |
| `lose.decline` | Hayır, teşekkürler | No thanks |
| `lose.buygold` | Altın al · eksik {coin}{n} | Get coins · {coin}{n} short |
| `lose.bridgeCap` | Bu turun altın sınırı bu teklife yetmez. | This round's coin limit doesn't cover this offer. |
| `lose.life` | Bir can gitti. | You lost a life. |
| `lose.retry` | Tekrar dene | Try again |
| `lose.streak` | Galibiyet serin sıfırlandı. | Your win streak was reset. |

Kaldırılanlar: `lose.tuna` ("Az kaldı!" satın alma penceresinde baskı yaratıyordu; yerine Tuna yalnız "kararlı" ifade),
`lose.giveup` ("Give up" suçlayıcı ton; yerine `lose.decline`) ve `lose.bridge` ("Devam etmezsen bu turdan çıkarsın."
kayıp penceresinde kural satırıydı; BUSINESS §4.5-4 ve R-15 gereği kural yalnız `bridge.rule_card.*` ve (i) panelinde).
`lose.bridgeCap` tavan dolmadan da çıkar: tur harcaması + bu teklifin fiyatı > 4.050 (META §6.1).
Sayılar config'ten (D-017): `lose.offer.moves`, `lose.offer.gift` `{n}` = `economy.json → outOfMoves.extraMoves`, `lose.ad`
`{n}` = `outOfMoves.rewardedAdOffer.extraMoves`; `lose.offer.count` / `.last` `{max}` = `outOfMoves.maxOffersPerAttempt`
(`.last` yalnız `{n}` = `{max}` iken). `lose.adToday` reklam düğmesinin 2. satırıdır (UX §7 Pencere 1, PriceLabel'ın
2. satırıyla aynı yer ve renk kuralı): `{max}` = `outOfMoves.rewardedAdOffer.perDay`, `{n}` = bu reklamın bugünkü sırası
(bugün izlenen + 1; "Teklif {n}/{max}" gibi sıra sayısı, kalan sayı değil). Tavan dolunca düğme gri ve 2. satır
`ads.tomorrow` olur, `{n}` > `{max}` hiç yazılmaz. `lives.ad` `{n}` de aynı anlamdadır. `lose.offer.moves` eski `lose.offer`'dır: i18n anahtarları iç içe olduğundan (TECH
§11.5) bir anahtar hem metin hem üst düğüm olamaz.

### 7.4 Renkli Tepe çırakları — bot adları (R-14, BUSINESS §4.6)

Köprü ve Lig'deki 99 rakip için 100 ad çifti, anahtar `npc.apprentice.n001…n100`. Kural: kasaba temalı takma ad
(meyve, sebze, alet, malzeme, doğa, hayvan, eşya); **gerçek insan adı-soyadı, kullanıcı adı biçimi ("Selin_U"), hikaye
karakteri adı yok**; iki dilde de yaygın bir insan adı olarak okunan sözcükler elendi (ör. Hazel → Hazelnut, Olive,
Basil, Ginger, Willow, Poppy, Daisy; TR'de Bulut, Deniz, Çınar, Lale, Meltem). Satırda ad her zaman "çırak" rozetiyle
ya da `npc.apprentice.format` ile gösterilir. Atama: `hash32(eventInstanceId, botIndex) mod 100` (çakışmada sonraki
boş ad; code-lead), ödeme verisinden bağımsız.

| 1 | 2 | 3 | 4 | 5 |
| - | - | - | - | - |
| `n001` Fındık / Hazelnut | `n002` Ceviz / Walnut | `n003` Badem / Almond | `n004` Kestane / Chestnut | `n005` İncir / Fig |
| `n006` Mürdüm / Damson | `n007` Ayva / Quince | `n008` Dut / Mulberry | `n009` Kayısı / Apricot | `n010` Armut / Pear |
| `n011` Ahududu / Raspberry | `n012` Böğürtlen / Bramble | `n013` Çilek / Strawberry | `n014` Kavun / Melon | `n015` Limon / Lemon |
| `n016` Nar / Pomegranate | `n017` Havuç / Carrot | `n018` Turp / Radish | `n019` Pancar / Beetroot | `n020` Susam / Sesame |
| `n021` Tarçın / Cinnamon | `n022` Nane / Mint | `n023` Kekik / Thyme | `n024` Maydanoz / Parsley | `n025` Lahana / Cabbage |
| `n026` Bezelye / Peapod | `n027` Keser / Adze | `n028` Rende / Woodplane | `n029` Pense / Pliers | `n030` Tornavida / Screwdriver |
| `n031` Su Terazisi / Spirit Level | `n032` Şakul / Plumb Line | `n033` Şerit Metre / Tape Measure | `n034` Kürek / Shovel | `n035` Kazma / Pickaxe |
| `n036` Tuğla / Brick | `n037` Kiremit / Rooftile | `n038` Kalas / Plank | `n039` Çivi / Nail | `n040` Somun / Hexnut |
| `n041` Menteşe / Hinge | `n042` Makara / Pulley | `n043` Halat / Rope | `n044` Kova / Bucket | `n045` El Arabası / Wheelbarrow |
| `n046` Merdiven / Ladder | `n047` İskele / Scaffold | `n048` Kum / Sand | `n049` Çakıl / Pebble | `n050` Mozaik / Mosaic |
| `n051` Esinti / Gust | `n052` Çiy / Dewdrop | `n053` Dolu / Hailstone | `n054` Sis / Mist | `n055` Gökkuşağı / Rainbow |
| `n056` Kar Tanesi / Snowflake | `n057` Kozalak / Pinecone | `n058` Palamut / Acorn | `n059` Meşe / Oak | `n060` Kavak / Poplar |
| `n061` Ladin / Spruce | `n062` Yosun / Moss | `n063` Mantar / Mushroom | `n064` Devedikeni / Thistle | `n065` Dere / Creek |
| `n066` Arnavut Taşı / Cobblestone | `n067` Tepecik / Hillock | `n068` Sincap / Squirrel | `n069` Kirpi / Hedgehog | `n070` Kunduz / Beaver |
| `n071` Tavşan / Hare | `n072` Kaplumbağa / Tortoise | `n073` Baykuş / Owl | `n074` Serçe / Sparrow | `n075` Martı / Gull |
| `n076` Ağaçkakan / Woodpecker | `n077` Bal Arısı / Honeybee | `n078` Karınca / Ant | `n079` Ateşböceği / Firefly | `n080` Salyangoz / Snail |
| `n081` Kurbağa / Frog | `n082` Ördek / Duck | `n083` Keçi / Goat | `n084` Kaz / Goose | `n085` Pötikare / Gingham |
| `n086` Fiyonk / Bowtie | `n087` Düğme / Button | `n088` Çan / Bell | `n089` Fener / Lantern | `n090` Uçurtma / Kite |
| `n091` Topaç / Spinning Top | `n092` Misket / Marble | `n093` Şemsiye / Umbrella | `n094` Pusula / Compass | `n095` Çaydanlık / Teapot |
| `n096` Kurabiye / Cookie | `n097` Lokum / Turkish Delight | `n098` Pişmaniye / Candy Floss | `n099` Bisküvi / Biscuit | `n100` Gofret / Wafer |

### 7.5 Arayüz kısa metinleri (yeni ekranlar)

| Kimlik | TR | EN |
| ------ | -- | -- |
| `exit.title` | Bölümden çık? | Leave the level? |
| `exit.free` | Henüz hamle yapmadın; can gitmez. | No moves made yet, so no life is lost. |
| `exit.cost` | Çıkarsan 1 can gider. | Leaving costs 1 life. |
| `exit.bridge` | Köprüden düşersin. | You'll fall off the bridge. |
| `exit.streak` | Galibiyet serin sıfırlanır. | Your win streak resets. |
| `exit.refund` | Oyun öncesi güçlendiricilerin geri verilir. | Your pre-game boosters come back to you. |
| `exit.stay` / `exit.leave` | Kal / Çık | Stay / Leave |
| `resume.title` | Kaldığın yerden devam | Pick up where you left off |
| `resume.strip` | Bölüm {n} · hamlelerin kayıtlı | Level {n} · your moves are saved |
| `resume.void.title` | Oyun güncellendi | The game was updated |
| `resume.void.body` | Bölüm {n} baştan başlayacak. Harcadıkların geri verildi. | Level {n} will start from the beginning. Everything you spent is back. |
| `resume.void.bridge` | Köprüdeki yerin korundu. | Your place on the bridge is safe. |
| `common.ok` | Tamam | OK |
| `lives.title` | Can doldur | Refill lives |
| `lives.full` | Tam can ({max}) | Full lives ({max}) |
| `lives.ad` | Reklam izle · +1 can (bugün {n}/{max}) | Watch an ad · +1 life (today {n}/{max}) |
| `lives.wait` | Bekle | Wait |
| `ads.tomorrow` | Yarın tekrar | Back tomorrow |
| `ads.none` | Şu an reklam yok | No ad right now |
| `daily.title` | Günlük hediye | Daily gift |
| `daily.noLoss` | Bir gün gelmezsen ilerlemen kaybolmaz. | Miss a day and you keep your progress. |
| `daily.claim` / `daily.double` | Topla / Reklam · altın ×2 | Collect / Ad · coins ×2 |
| `chest.contains` | İçinde: | Inside: |
| `chest.open` | Aç | Open |
| `shop.testBuy` | Bu bir deneme satın alımıdır, ücret alınmaz. | This is a test purchase. You won't be charged. |
| `shop.covers` | Eksik {coin}{n} için yeterli | Covers the {coin}{n} you need |
| `shop.value` | +%{n} | +{n}% |
| `piggy.status` | Kumbarada {coin}{n} / {max} | Piggy bank: {coin}{n} / {max} |
| `piggy.threshold` | Kırma eşiği: {coin}{n} | Can be broken at {coin}{n} |
| `piggy.full` | Dolu | Full |
| `piggy.break` | Kır | Break |
| `booster.noShutter` | Bu bölümde kepenk yok | No shutters in this level |
| `booster.noUndo` | Geri alınacak hamle yok | Nothing to undo |
| `build.done` | Yapı tamam! | Build complete! |
| `home.empty` | Yeni yapılar yolda | New buildings on the way |
| `age.title` | Doğum yılın | Your birth year |
| `age.check` | Yılı kontrol eder misin? | Could you check the year? |
| `settings.timePressure` | Zaman baskısını azalt | Reduce time pressure |
| `common.comingSoon` | Yakında | Coming soon |
| `common.unlockAt` | {n}. bölümde açılır | Unlocks at level {n} |
| `common.minutes` | {n} dk | {n} min |
| `town.name` | Renkli Tepe | Hue Hill |
| `master.button` | Usta Modu | Master Mode |
| `master.card.title` | Usta Modu | Master Mode |
| `master.card.body` | Bildiğin bölümler, daha az hamle. | Levels you know, fewer moves. |
| `master.card.chest` | Her {n} galibiyette Usta Sandığı. | A Master Chest every {n} wins. |
| `master.card.start` / `.later` | Başla / Şimdi değil | Start / Not now |
| `home.moreSoon` | Yeni bölümler yolda | New levels on the way |
| `replay.button` | Tekrar · Bölüm {n} | Replay · Level {n} |
| `replay.card.title` | Tekrar turu | Replay round |
| `replay.card.body` | Bildiğin bölümler. Köprü ve Lig sürüyor. | Levels you know. Bridge and League go on. |


Sayılar config'ten (D-017): `lives.full` `{max}` = `economy.json → lives.max`; `lives.ad` `{max}` =
`lives.rewardedAdLifePerDay`; `master.card.chest` `{n}` = `masterMode.masterChest.everyWins`; `replay.button` `{n}` =
sıradaki bölüm numarası; `common.minutes` `{n}` = ödüldeki sınırsız can süresi (`unlimitedLivesMinutes`; UX §3.1,
`icon_life_unlimited` yanında); `shop.value` `{n}` = BUSINESS §5.2 değer etiketi kuralı (taban `priceDisplay.referenceSku`,
oyuncuya gösterilen para biriminin fiyatlarıyla, aşağı yuvarlanır; taban paket ve `n < 1` çıkan pakette anahtar
kullanılmaz, "—"), sayı config'e ya da i18n'e sabit yazılmaz (UX §11). `resume.void.*` güncellemeyle geçersiz kalan denemenin ana ekran penceresidir (GDD
K-43 madde 4, E-45; UX §1 (c)): `{n}` = o denemenin bölüm numarası; iade edilen can, güçlendirici ve altın metne yazılmaz, pencerenin iade satırında ikon + adet olarak
görünür; `resume.void.bridge` yalnız Köprü turunda sayılan denemede gösterilir; elenme, kayıp ya da suçlama sözcüğü
kullanılmaz. `build.done` oyun ekranındaki "Yapı tamam!" kurdelesidir (UX §5.1, GDD E-27, D-035).

**Çıkış onayı ve devam (UX §5.1, §1; GDD K-43):** `exit.free` yalnız `m = 0`; `exit.refund` yalnız `m = 0` ve bu
denemede oyun öncesi güçlendirici (`preBoosters`) varken, `exit.free`'nin altında (bölüm içi güçlendirici iade edilmez,
K-43 madde 2); `exit.cost` yalnız `m ≥ 1`; `exit.streak` yalnız `m ≥ 1` ve galibiyet serisi `s > 0` iken (`m = 0`'da seri
bozulmaz, satır yok); `exit.bridge` yalnız Köprü turunda `m ≥ 1`. Satır sırası `exit.cost` → `exit.streak` →
`exit.bridge`. Onay penceresi gelecek zamanı (`exit.streak`), kayıp Pencere 2 geçmiş zamanı (`lose.streak`) kullanır.
`resume.strip` yarım kalan bölümün açılışındaki 1,5 s'lik üst şerittir (JUICE #87): `{n}` = bölüm numarası. Duraklat
penceresinin başlığı o sırada `resume.title`'dır; şerit başlığı tekrarlamaz, kaydın güvende olduğunu söyler. Teklif
penceresine (UX §1 (a)) ya da güncelleme penceresine ((c)) açılan dönüşte şerit yoktur.

### 7.6 Faz 2 ekranları — açılış, oyun ekranı, kazanma ve ortak düğmeler

Faz 2 dikey diliminin (TECH §14.1 #12) bütün görünen metinleri §7.3, §7.5 ve bu tablodadır; ekran yerleşimi UX §1, §2, §5,
§6, §7. Ortak düğme metinleri (`common.*`) her ekranda aynı anahtarla kullanılır; ekran başına kopya anahtar açılmaz.

| Kimlik | TR | EN |
| ------ | -- | -- |
| `app.title` | Lift & Land | Lift & Land |
| `app.version` | Sürüm {version} | Version {version} |
| `common.continue` | Devam | Continue |
| `common.home` | Ana sayfa | Home |
| `common.retry` | Tekrar dene | Try again |
| `common.skip` | Geç | Skip |
| `common.cancel` | Vazgeç | Cancel |
| `common.on` / `.off` | Açık / Kapalı | On / Off |
| `common.count` | {n}/{max} | {n}/{max} |
| `common.plus` | +{n} | +{n} |
| `common.times` | ×{n} | ×{n} |
| `common.coins` | {coin}{n} | {coin}{n} |
| `hud.moves` | Hamle | Moves |
| `hud.streak` | Usta Serisi | Builder Streak |
| `truck.queue` | Kamyonda: {n} | On the truck: {n} |
| `booster.hint.trowel` | Parlayan bir hücreye dokun. | Tap a glowing cell. |
| `booster.hint.hammer` | Kırmak istediğine dokun. | Tap what you want to smash. |
| `booster.hint.crane` | Taşımak istediğin bloğa dokun. | Tap the block you want to move. |
| `booster.hint.brush` | Boyamak istediğin bloğa dokun. | Tap the block you want to paint. |
| `pause.title` | Mola | Paused |
| `pause.exit` | Bölümden çık | Leave level |
| `settings.sound` | Ses | Sound |
| `settings.music` | Müzik | Music |
| `settings.haptics` | Titreşim | Vibration |
| `win.title` | Kazandın! | You won! |
| `win.bonus` | Bonus İnşaat · kalan {n} hamle | Bonus Build · moves left: {n} |
| `win.trowel` | Altın Mala ×{n} | Golden Trowel ×{n} |
| `error.boot` | Bir şeyler takıldı. Yeniden deneyelim mi? | Something got stuck. Shall we try again? |
| `error.level` | Bir şeyler takıldı. Can gitmez. | Something got stuck. No life is lost. |
| `error.restart` | Bölümü baştan başlat | Restart the level |
| `home.play` | Bölüm {n} | Level {n} |
| `story.sign` | {company} | {company} |

Kullanım ve sayılar (D-017; sayılar config'ten, metne sabit yazılmaz):

- `app.title`: oyun adı (§0-10); açılış logosu (UX §1) ve tarayıcı/PWA başlığı. Çalışma değeri "Lift & Land", büyük
  harfe çevrilmez. `app.version` `{version}` = `package.json` sürümü, metin olarak (sayı biçimlemesi yok; UX §1 alt
  satır, UX §11 Ayarlar alt satırı).
- `common.count`: sayaç biçimi; hedefler panelindeki dilim ve `clear` / `collect` sayaçları ("2/4"), renk körü modunda
  Usta Serisi ("3/4", `{max}` = `economy.json → combo.correctPlacementsPerTrowel`); Köprü tahtası satırı (Faz 4).
  `common.plus`: ikon yanındaki artı sayı (kazanma ödül satırında yıldız ve altın, JUICE #53 "+1" çipleri).
  `common.times`: ikon + adet (§7.2 `{extras}`, kayıp penceresi "Kasa ×1"). `common.coins`: altın miktarı her yerde bu
  anahtarla yazılır (PriceLabel 1. satırı, Bonus İnşaat altını, iade satırı); `{coin}` simgesi §0-11, sayı yerel
  biçimde (TR "1.350", EN "1,350").
- `truck.queue` `{n}` = kamyon kuyruğundaki **blok** sayısı (GDD K-26; hücre ya da parti değil); `n = 0` iken çip
  gizlidir, metin "0" göstermez (UX §5.1, JUICE #20, #88). `hud.moves` hamle sayacının altındaki etiket; `hud.streak`
  Usta Serisi şeridinin etiketi (UX §5.1).
- `booster.hint.*`: UX §5.2 madde 1 açıklama şeridi; yanında `common.cancel` (× ile). Faz 2'de yalnız `.trowel` (K-33,
  Altın Mala seçimi); `.hammer`, `.crane`, `.brush` güçlendiricileriyle birlikte kullanılır. İlk Altın Mala seçiminde
  Usta Dede balonu `tut.ctx.goldtrowel` ayrıca çıkar; şerit her seçimde görünür.
- `pause.*`, `settings.*`, `common.on` / `.off`: Duraklat penceresi (UX §5.1) başlık `pause.title` (devam açılışında
  `resume.title`), birincil `common.continue`, üç anahtar satırı, alt satırda `pause.exit` (→ çıkış onayı). Ayarlar
  ekranı (UX §11) aynı `settings.*` satır adlarını kullanır.
- `win.*` (UX §6): başlık `win.title` (`upper` ile "KAZANDIN!"); `win.bonus` `{n}` = altına dönüşen kalan hamle (en çok
  `levelRewards.bonusMaxMovesCounted`), altını yanında `common.coins` sayar (JUICE #56); `win.trowel` `{n}` = kalan
  Altın Mala (yalnız > 0), altını yine `common.coins`; ödül satırı = yıldız ikonu + `common.plus` · altın ikonu +
  `common.plus`; tek düğme `common.continue`. Kazanma ekranında "Tekrar" düğmesi yoktur (ekran başına tek birincil eylem;
  tekrar oynama Usta Modu / Tekrar turuyla, UX §3).
- `error.*` (UX §0.3 "Hata" kalıbı; kırmızı ve suçlama yok): açılışta `error.boot` + `common.retry` (UX §1), oyun
  ekranında `error.level` + `error.restart` (UX §5.1 "hata"; can gitmez). `common.retry` ve `lose.retry` aynı metindir
  ama ayrı anahtardır: kayıp penceresinin metni ekonomiyle birlikte değişebilir.
- `common.home`: kayıp Pencere 2'nin metin düğmesi (UX §7). `common.skip`: giriş sahnesi ve ara sahne "Geç" düğmesi
  (UX §2.1, §8). `home.play` `{n}` = sıradaki bölüm; Bölüm düğmesi (`upper` ile "BÖLÜM 12"; UX §3 ve Faz 2 asgari ana
  ekranı, UX §6). `story.sign`: giriş Panel 3 tabelasının metin katmanı (§0-7, §4.0); `upper` ile çizilir (TR "MİNİK
  USTA İNŞAAT", EN "TUNA & CO.").
