# design-lead çapraz inceleme — 2. bölüm (2026-10-04)

İncelenen: `docs/GDD.md`, `docs/OBSTACLES.md`, `docs/LEVELS.md`, `docs/META.md`, `config/economy.json`,
`config/events.json` (product-lead). Bakış açısı: her kural ve engel ekranda açıkça gösterilebiliyor mu (bir bakışta
ayrışma, K-18 gölgesi), öğretici metinlerin tonu ve uzunluğu, 1–10 blockout'larının tahta düzenime ve ilk oturum
hissine uyumu, bana yöneltilen istekler, META ekranları ve ödülleri ↔ UX_FLOWS, K-34'ün oyuncu tarafından anlaşılması.
Kendi belgelerimde gereken değişiklikler revizyon turunda yapılacak ("design-lead revizyonu").

Genel sonuç: Kurallar çok net ve test edilebilir. Tahta düzenim (hücre 120 px, duvar 0,5c, en çok 8 satırlık plan,
5 dilimlik panorama) bütün 1–10 blockout'larını ve 11–50 kayıtlarını değişiklik gerektirmeden taşıyor. Aşağıdaki
yorumlar okunurluk, ilk oturum hissi ve metin tutarlılığı içindir.

---

- [design-lead → product-lead] K-34 "Alttan Üste": oyuncu bu kuralı nasıl anlar?
  Risk: Renkleri tamamen uyan bir blok (ör. GDD Örnek 1: dört hücresi de W olan O4) kırmızı gölge alıp geri sekerse,
  oyuncu "renk doğru, neden yanlış?" diye düşünür. Kural görünmez kalırsa haksızlık hissi doğar (BUSINESS R-12).
  Kuralın kendisi doğru: sessiz çözümsüzlüğü önlüyor ve inşaat metaforuna uyuyor ("boşluğun üstüne inşa edilmez").
  Hissi kabul edilebilir, yeter ki görünür olsun.
  Önem: Önemli
  Düzeltme (design-lead görsel önerisi, onayın gerekli):
  1. **İnşa cephesi vurgusu (bütün zorluklarda):** her şantiye sütununda doldurulabilir en alt boş plan hücresi
     (altındaki bütün hücreler doğru dolu ya da `.`) biraz daha parlak ve düz çizgili kontur alır. Altında boşluk olan
     hücreler normal (kesik) kalır. Oyuncu sürekli "sıradaki kat"ı görür. Bu renk bilgisi değil, Zor bölümde de adil.
  2. **Gölgede neden gösterimi (Kolay/Normal):** K-34 bozuluyorsa gölgenin altındaki boş plan hücreleri turuncu
     45° tarama + aşağı ok ile yanıp söner (renk uyuşmazlığı taramasından farklı desen).
  3. **Geri sekmede neden (bütün zorluklar):** blok sektikten sonra aynı boş hücreler 600 ms vurgulanır (geçmişe
     dönük bilgi, gölgeyi gizleyen Zor bölümde de gösterilir).
  4. **Bağlamsal öğretici:** K-34 ilk kez bozulduğunda Usta Dede: `tut.ctx.support` "Önce temeli düşün, evlat!" (brifin
     kendi cümlesi) / "Think of the foundation first, kiddo!". Kural kimliği LEVELS'ta bir öğretim satırı olarak da
     görünsün: K-34'ün doğal tetiklendiği ilk bölüm (tahminimce 5–7) için `tutorial` adımı önerilir.

- [design-lead → product-lead] öğretici metinlerin sahipliği, anahtarları ve terimler (OBSTACLES ↔ STORY §6 ↔ LEVELS):
  Üç belge üç farklı biçim kullanıyor:
  - OBSTACLES: `tut.<engel>` anahtarı (`tut.W1`), TR ≤ 12 kelime, "parça" terimi; "metin sahibi product-lead" diyor.
  - STORY: `tut.l{n}.{konu}` anahtarı (`tut.l3.gap`), TR ≤ 8 kelime, "blok" terimi, Usta Dede sesi. Rol tanımına göre
    ipucu cümleleri design-lead'in.
  - LEVELS: ikisini karışık kullanıyor (`tut.l1.lift`, `tut.W1`, `tut.S2`, `tut.Y5` …).

  Önem: Önemli
  Düzeltme önerisi:
  - **Tek anahtar kümesi:** `tut.l{n}.{konu}` (adım bazlı; bir bölümde birden çok adım olur). LEVELS `tutorial[].textKey`
    bunları kullanır.
  - **İçerik ↔ ses ayrımı:** OBSTACLES'taki cümleler "öğretim hedefi" olarak kalır (neyin öğretileceği, product-lead);
    ekranda görünen satır STORY §6'dadır (Dede'nin sesi, design-lead).
  - **Terim:** oyunda **"blok" / "block"** (brif ve GDD); "parça/piece" kullanılmaz.
  - **Kaynaştırma:** OBSTACLES'ta daha iyi olan fikirleri STORY'ye alacağım: S3 "Cam kırılır! Önce aşağı indir, sonra
    bırak." · Y5 "Ağır blok duvarı geçemez. Kenara çek ya da kır." · S2'deki "köprü" fikri · S7 ayna "Renkleri yer
    değiştir!".
  - **Değişken sayılar:** S5 "dört hamlede bir" ve W4 "iki hamlede bir" sabit yazılmasın, `{n}` olsun (Bölüm 40'ta
    `carouselEvery 3`).

- [design-lead → product-lead] öğretici metinde renk adı (LEVELS Bölüm 2, `tut.l2.shadow`): "gölge yeşilse doğru,
  kırmızıysa yanlış yer." Renk körü oyuncu için bu cümle işe yaramaz. ART P-7 / UX §5.4'te gölge doğru/hatalıyı ayrıca
  çizgi deseni ve rozetle ayırıyor.
  Önem: Önemli
  Düzeltme: Öğretici ve ipucu metinlerinde renk adı geçmesin. Satır: "Gölgede ✓ varsa yer doğru." / "A ✓ on the shadow
  means the spot is right." (STORY §6 `tut.l2.shadow` buna göre güncellenecek). K-18 kural metni aynen kalabilir;
  bu yalnızca oyuncuya görünen metin kuralı.

- [design-lead → product-lead] saklı nesnelerin görünürlüğü (K-42, Y7, W7; LEVELS §5 "gizli bilgi yalnızca `?` ile
  verilir (adalet ilkesi)"): Vida ve anahtarın hangi bloğun altında olduğu oyuncuya gösterilmezse kazı planı
  tahmine döner ve adalet ilkesiyle çelişir (Bölüm 19, 26, 36, 49).
  Önem: Önemli
  Düzeltme: Saklı nesnenin konumu **görünür** olsun. Öneri: örten bloğun (ya da kasanın) o hücresinin köşesinde 20 px
  altın ışıltı + 28 px vida/anahtar simgesi (ART §6 `obs_glint`). Kural değişmez, yalnız "saklı" = "örtülü ama
  konumu belli" diye tanımlansın (GDD K-42 metnine bir cümle). Onay?

- [design-lead → product-lead] ara sahne tetikleyicisi (META §1 ↔ BRIEF §11.2-2 ↔ UX §2.2 ↔ STORY §3): META "Hikaye
  Bölümü 1'in giriş sahnesi FTUE'deki 3 panelli giriş" diyor. Brif FTUE akışında hem 3 panelli giriş hem de
  "ilk yıldızı harcama → **ilk ara sahne**" var. STORY bunu prolog (tabela, 3 panel) + Bölüm 1 başlangıcı ("kimse iş
  vermez, Gribeton güler", 4 panel) olarak yazdı. Brif tablosundaki "Sorun" (Gribeton'un gülmesi) ancak ayrı bir
  sahnede anlatılabiliyor.
  Önem: Önemli
  Düzeltme: Kural önerisi:
  - Hikaye Bölümü 1: FTUE'de 3 panelli prolog (Bölüm 1'den önce); ilk görev yapılınca (ilk yıldız harcanınca)
    `story.ch1.start` oynar.
  - Hikaye Bölümü 2–5: önceki bölümün bitiş sahnesinden sonra, ana ekrana **bir sonraki dönüşte** `story.chN.start`
    oynar (iki sahne arka arkaya 8–10 panel olmasın).
  - Bitiş sahnesi: son görev yapılınca.

  META §1 metni buna göre güncellensin; code-lead akışı buna göre kurar.

- [design-lead → product-lead] kasaba görevleri: sayı, ad ve anahtarlar (META §1, `economy.json` ↔ STORY §5 ↔ UX §2.2):
  META 6 / 7 / 7 / 8 / 8 = 36 görev ve maliyetler veriyor; STORY 5 × 7 = 35 görev, farklı adlar ve maliyetler.
  UX §2.2 FTUE'de ilk görev "Ağaç evin merdivenini kur — ★1", META'da ise ilk görev "Bahçeyi temizle". Anahtar
  biçimleri de farklı: `town.c1.t1` ↔ `town.ch1.t1.name`.
  Önem: Önemli
  Düzeltme (design-lead revizyonu, kabul): Sayı, sıra ve maliyetlerde META geçerli (product-lead'in alanı). STORY §5
  META'nın 36 görevine göre yeniden yazılacak; adlar META'daki gibi, her göreve tek satırlık sahne cümlesi (TR + EN)
  eklenecek. Anahtarlar `town.c{n}.t{m}` (ad) ve `town.c{n}.t{m}.scene` (cümle). UX §2.2 ilk görev "Bahçeyi temizle"
  olacak; Kepçe kazıyor sahnesi buraya çok uygun. ASSET_LIST kasaba parçaları 35 → 36 olacak.
  Tek ad önerisi: c1 t6 "'Minik Usta İnşaat' tabelasını as" EN'de `{company}` yer tutucusuyla yazılsın (BUSINESS P-6).

- [design-lead → product-lead / code-lead] hafif yerçekiminde yönlendirme girdisi (GDD K-19, OBSTACLES G-L, S-26):
  "Düşen bloğa dokunup ≥ 0,5 hücre yana sürüklemek" diyor. Düşen blok saniyede ~4,5 satır hızla hareket eden 120 px'lik
  bir hedef. Üstüne basıp yana sürüklemek motor becerisi istiyor ve tahtada ikinci bir "tutma" gibi algılanıyor.
  Önem: Önemli
  Düzeltme (karar önerisi): Düşüş/yükseliş sürerken tahta "yönlendirme kipi"ndedir (zaten yeni blok tutulamıyor,
  TECH §4.7).
  - **Tahtanın herhangi bir yerine dokunmak** 1 genişlikli bloğu öbür şantiye sütununa geçirir.
  - Alternatif olarak tahtanın herhangi bir yerinde sola/sağa **kaydırmak** o yöne geçirir; yön yanlışsa (kenar) bir şey
    olmaz.
  - İkisi de kabul edilir, düşüş başına 1 kez.
  - Blokta "↔" çipi görünür, gölge anında yeni inişi gösterir.
  - 2 genişlikli bloklarda çip yok, girdi yok sayılır.

  Çekirdek modeli (`steer.atRow`) değişmez. Öğretici metni: `tut.l23.steer` "Düşerken dokun, blok yana kaysın." (5
  kelime).

- [design-lead → product-lead] K-07 "en az 0,3 hücre sürükleme" eşiği: 0,3c = 36 px (≈ 13 pt). Blok bu mesafe boyunca
  parmağı izlemezse "yapışkan / gecikmeli" hissi verir; bitti tanımındaki "tek kare" şartıyla da çelişir. Başlangıç
  konumunda bırakma zaten iptal sayıldığı için (K-07 satır 1) bu eşik oyun kuralı olarak gereksiz.
  Önem: Önemli
  Düzeltme: Kural metninden 0,3 hücre eşiğini çıkar ya da yalnız "dokunma mı sürükleme mi" sınıflandırması olarak
  tanımla. Görsel kaldırma `pointerdown`'da başlar; blok 8 px hareketten itibaren izler (UX §5.3, `drag.startThresholdPx`).
  Hamle sonucu yine bırakma konumuyla belirlenir.

- [design-lead → product-lead] Bölüm 1 ilk hamle ergonomisi ve imza hareket (LEVELS §2): İlk zorunlu hamlenin hedefi
  `a` (0,7) sahanın **sol üst** köşesinde. Burası tek elle (sağ el) en zor erişilen nokta ve tahtanın en uzak yeri;
  oyuncunun oyundaki ilk dokunuşu bu olacak. Ayrıca duvar 2 ve saha y=7'ye kadar dolu olduğundan blok hiç "yukarı"
  kalkmıyor, yalnız sağa kayıp düşüyor. İmza hareketin "yukarı" yarısı ancak Bölüm 6'da (duvar 8) görülüyor.
  Önem: Önemli
  Düzeltme:
  - (a) İlk öğretici hedef duvara yakın üst satırda olsun (ör. `a` ile `d`/`h` yer değiştirsin, hedef (4,7) civarı);
    ilk hamle kısa ve başparmağa yakın olur.
  - (b) Öneri: Bölüm 1'de duvarı en üst dolu satırın üstüne çık (ör. saha üst satırı kısmen boş, hedefler y=6'da, duvar
    7) ki blok en az 1 satır "kaldırılsın" ve imza hareket ilk hamlede hissedilsin. Brif "Duvar 2" diyor; bu değişiklik
    proje sahibine sorulmalı.

  Hücre ölçüsü, renk sayısı (W, Y) ve 3 hamlelik kısa ilk zafer ilk oturum için çok iyi.

- [design-lead → product-lead] K-18 ayrıntıları (gölge): 3 nokta.
  Önem: Öneri
  Düzeltme:
  1. **Çatlak simgesi:** K-18 "Kolay/Normal'de çatlak simgesi taşır; Zor'da yalnızca konum" diye okunabiliyor. Önerim
     çatlak cam uyarısı **bütün zorluklarda** gösterilsin. Bu bir doğruluk bilgisi değil fizik bilgisi; K-21 "her biri
     gölge ya da görünür bir göstergeyle önceden okunabilir olmalıdır" ilkesi de bunu istiyor. Metin buna göre
     netleştirilsin.
  2. **`?` nötr:** Kabul. Nötr gölge = Zor'daki gibi kesik beyaz kontur, rozet yok. Çatlak simgesi ise bu durumda da
     görünür. design-lead revizyonunda JUICE #7'deki "doğru" tık sesi de nötr ve Zor durumda çalmayacak (ses kanalından
     bilgi sızmasın).
  3. **G-L:** Gölge önce yönlendirmesiz inişi, yönlendirmeden sonra **yeni inişi** göstersin (kural metnine "yönlendirme
     sonrası güncellenir" eklensin).

- [design-lead → product-lead] ağır yerçekimi 1400 ms erişilebilirlik ayarı (K-19): Kabul. UX tarifi (design-lead
  revizyonu):
  - Ayarlar'da "Erişilebilirlik" grubunda "Zaman baskısını azalt" anahtarı (varsayılan kapalı).
  - Şantiye üstündeki blokta dolan halka sayacı: 700 ya da 1400 ms; son %30'da turuncu; son 300 ms'de hafif haptik tık.
  - Bölüm 15 öğreticisinde ikinci balon: `tut.l15.setting` "Süre kısa mı? Ayarlardan uzatabilirsin." (5 kelime).

  Önem: Öneri
  Düzeltme: Bölüm 15'in `tutorial` adımlarına bu ikinci balon eklensin. Bot zorluk ölçümü 700 ms ile yapılsın (ayar
  kolaylaştırıcıdır).

- [design-lead → product-lead] balon tavanı (OBSTACLES S8, öneri P-3): Kabul. "Tavan" ekranda bir şey olarak
  görünmeli, yoksa "tavana asılır" metni boşlukta kalır.
  Önem: Öneri
  Düzeltme (design-lead revizyonu): Aktif dilimin plan tepesinde (`h + e` satır sınırı) her bölümde yatay **iskele
  tavan kirişi** çizilir: 16 px çelik boru + turuncu kelepçeler, asansörle birlikte hareket eder. Kiriş plan
  yüksekliğini de bir bakışta gösterir. Balon kirişe çarpınca 2 küçük sekme yapar, ipi kirişe bağlanır. Balonlu blok
  sürüklenirken gölge yukarıda, kirişin altında gösterilir.

- [design-lead → product-lead] kepenk sayacı (OBSTACLES W4 "bir sonraki değişime kalan hamle sayısı"): Kabul. ART §5'teki
  rozet tasarımıyla aynı.
  Önem: Öneri
  Düzeltme: Rozet = sonraki değişime kalan hamle (`1…period`) + bir sonraki durumun simgesi (açık kilit / kapalı kilit).
  1'de rozet nabız atar. Örnek (`period 2, phase 0`): m=0 "2 + kapalı kilit", m=1 "1 + kapalı kilit (nabız)", m=2 "2 +
  açık kilit". Aynı rozet dili döner platform (S5) için "dönmeye N hamle" ve ıslak beton için kullanılır.

- [design-lead → product-lead] K-06 panorama "dokunmaya tepki vermez" ↔ UX §5.1 "dokun → 1,5 s büyük önizleme":
  Önizleme oyun durumunu değiştirmez. `mirrorOf` / `repeat` bölümlerinde (27, 29, 44, 46, 50) önceki dilimi okumak
  için gerekli; 110 px yüksekliğindeki şerit 8 satırlık dilimi hücre başına ~13 px gösteriyor.
  Önem: Öneri
  Düzeltme: K-06 "Panorama oyun durumunu değiştirmez; dokunuş yalnızca büyük önizleme açar" diye güncellensin.

- [design-lead → product-lead] E-27 (yapı tamam, `clear` hedefi eksik): Kurala göre "her şantiye bırakması hatalıdır";
  oyuncu farkında olmadan hamle yakar.
  Önem: Öneri
  Düzeltme: Bu durumda şantiye "kapalı" sayılsın: şantiyeye bırakma **iptal** (0 hamle). Ekranda şantiye üstünde
  "Yapı tamam!" kurdelesi ve hedef panelinde eksik hedef nabzı görünür. LEVELS kontrol listesi bu durumu zaten
  engelliyor; kural yine de güvenli tarafta kalsın.

- [design-lead → product-lead] Altın Mala hedef seçimi (K-33 + K-34): Mala yalnız K-34'ü sağlayan hücreye konabiliyor.
  Oyuncu hangilerinin geçerli olduğunu görmeli.
  Önem: Öneri
  Düzeltme (design-lead revizyonu): Mala etkinken geçerli hücreler altın kesik konturla nabız atar, geçersizler %50
  soluklaşır. Geçersiz hücreye dokununca hücre 2 px titrer, mala harcanmaz (kural metniyle uyumlu). İnşa cephesi
  vurgusuyla (K-34 maddesi) aynı hücreler olduğu için görsel dil tek.

- [design-lead → product-lead] Vinç Alanı yükseklik sınırı (K-05, W2): Duvar 8'de boyu > 2 dikey blok (I3_0, L4_0)
  duvarı aşamıyor; oyuncu bloğun neden "takıldığını" görmeyebilir.
  Önem: Öneri
  Düzeltme (design-lead revizyonu): Yapışkan takip duvar tepesinde engellenince vinç alanının kesik sınır çizgisi ve
  sağ kenardaki "2 sıra" yükseklik işareti 400 ms parlar; blok çarpma esnemesi (JUICE #4) yapar. Bölüm 6 öğreticisine
  (W2) ikinci adım önerisi: uzun bloğun sığmadığını gösteren yumuşak ipucu.

- [design-lead → product-lead] düşüş hızları (K-19 tablosu: 220 / 60 / 30 ms/satır): Bunlar görsel değerler, tokens'taki
  fizik değerleriyle uyumlanmalı.
  Önem: Öneri
  Düzeltme: GDD tablosu "görsel varsayılan: `tokens.physics`" diye atıf yapsın. design-lead revizyonunda değerler
  hizalanacak: hafif 220 ms/satır sabit (yönlendirme penceresi öngörülebilir kalsın); normal ve ağır ivmeli ama
  ortalaması 60 / 30 ms/satır. Kural sonucu (iniş, cam) hızdan bağımsız olduğu için çekirdeği etkilemez.

- [design-lead → product-lead] META ekranları ve ödüller ↔ UX_FLOWS / JUICE: Aşağıdakiler META'da var, benim
  belgelerimde eksik ya da farklı; design-lead revizyonunda eklenecek. Hatalı anladığım varsa lütfen düzelt.
  Önem: Öneri
  Düzeltme (eklenecek görseller):
  - **Can ve çıkış:**
    - Bölüm başında can ayrılması: üst çubukta gösterilmez.
    - Uygulama bölüm ortasında kapanmışsa açılışta bilgi penceresi: "Yarım kalan bölüm sayıldı, 1 can gitti."
    - Sınırsız can: kalp içinde ∞ ve geri sayım.
    - Çıkış onayı metni `m` değerine göre: `m = 0` → "Çıkabilirsin, can gitmez." · `m ≥ 1` → "Çıkarsan 1 can gider."
      (K-43).
  - **Kazanma ve ödüller:**
    - Bonus İnşaat en çok 10 hamleyi canlandırır (en fazla 1,2 s); fazlası tek seferde "+N".
    - Kalan Altın Mala başına +10 altın satırı.
    - Bölüm sandığı ilerleme halkası ana ekranda Bölüm 1'den itibaren görünür.
  - **Kural olayları:**
    - Geri sekme → kamyon kuyruğu animasyonu: blok "Kamyonda" çipine uçar (K-17 adım 3).
    - Kamyon Yardımı D1 animasyonu: zincirler ve ıslaklık kalkar. D2 animasyonu: kamyon `B1` getirir (K-30).
    - Harçlı bloğu sürüklerken hamle sayacında "−2" önizlemesi.
  - **Sallanan Köprü:** "Süre doldu" durumu (elenme değil); "Bitirdin, ödül etkinlik bitince paylaşılacak" durumu.
  - **Şantiye modları:**
    - Döner platformda "dönmeye N hamle" rozeti ve panoramada sıradaki yüz oku.
    - Asansör ve kayar kapıda geçidin hizasını şantiyede gösteren yatay kılavuz çizgi.
