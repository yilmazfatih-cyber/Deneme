# Cihaz testi — gerçek iPhone ve AirPods

Sahibi: `kalite-sorumlusu` · Sürüm: S01 (kod `9031f22` ve son düzeltme turu) · Dayanak: `docs/ses-hatti.md` § 4
(kesintiler K1–K16) ve § 7 (cihaz soruları D1–D35), bu belge yazılmadan hemen önce yeniden okundu.

Bu belge proje sahibinin ilk denemesi içindir. Uygulama hiçbir gerçek iPhone'da çalıştırılmadı. Amacımız iki şey:
çalışıyor mu, çalışmıyorsa nedenini telefonun kendi kaydından okuyabilmek.

---

## 0. Önce bunu okuyun

**Sıra:**

1. **Bölüm A — Web deneme sürümü.** Yalnız iPhone ve AirPods yeter. Önce bunu yapın.
2. **Bölüm B — iPhone uygulaması.** Mac ve Xcode gerekir. Mac yoksa bu bölümü atlayın.

**Acele ediyorsanız:** yalnız "İlk deneme" senaryolarını yapın: **W-0, W-1** (web, 5 dakika) ve Mac varsa **U-0, U-1**
(uygulama, 5 dakika). Gerisi kesintiler ve ayrıntılardır; önem sırasıyla dizildi.

**Her senaryoda üç bölüm var:**

- **Yap:** sırayla, her adımda tek iş.
- **Beklenen:** ekranda ne görmeli, kulakta ne duymalısınız.
- **Olmazsa:** ne göndermelisiniz.

Sonuçları en sondaki **Sonuç tablosuna** yazın: geçti / kaldı ve kısa bir not.

### 0.1 Gerekenler

- iPhone (uygulama için iOS 18 ya da yenisi).
- AirPods (ya da başka bir Bluetooth kulaklık; hangisi olduğunu not edin).
- Wi-Fi. İlk açılışta dil paketi iner.
- **İngilizce konuşan bir ses.** En kolayı: ikinci bir cihazda (bilgisayar, tablet) İngilizce bir haber ya da podcast
  açın. Ses normal konuşma düzeyinde olsun. İsterseniz aşağıdaki cümleleri kendiniz de okuyabilirsiniz.
- Arama testleri için: sizi arayabilecek **ikinci bir telefon** ya da bir yakınınız.
- İsteğe bağlı: Alania API anahtarı.

**Okunacak örnek cümleler** (her birinden sonra 2 saniye susun):

1. Good morning, how are you today?
2. Where is the train station?
3. The meeting starts at nine o'clock.
4. Could you help me with my luggage, please?
5. I would like a cup of coffee and a glass of water.

### 0.2 Tanılama kaydı nasıl gönderilir (bir kez öğrenin)

Uygulama olan biteni kısa satırlarla telefonda kaydeder. Kayıtta **konuşma ya da çeviri metni, telefonun ya da
kulaklığın adı ve API anahtarı yoktur.** Gönül rahatlığıyla gönderebilirsiniz.

1. Alttaki **Ayarlar** sekmesine dokunun.
2. En alttaki **Tanılama kaydı** satırına dokunun.
3. **Kopyala**'ya dokunun. Düğme bir an "Kopyalandı" der.
4. Mesajlar, WhatsApp ya da e-postayı açın.
5. Metni yapıştırıp gönderin.
6. Tanılama ekranını **Bitti** ile kapatın.

Web sürümünde "Otomatik kopyalanamadı" yazarsa: altta açılan metin kutusuna basılı tutun, **Tümünü Seç**, sonra
**Kopyala**.

Web sürümünde Tanılama sayfası açılınca üstteki "Tanılama" başlığı ve **Bitti** görünmüyorsa (bilinen bir hata):
**Kopyala** yine de çalışır. Önce kopyalayıp gönderin, sonra sayfayı yenileyin. Yenileyince kayıt silinir; bu yüzden
yenilemeden önce mutlaka kopyalayın.

**Dikkat:**

- Sorunu gördüğünüz **anda** kopyalayın. Kayıt en çok 300 satır tutar; uzun denemede ilk satırlar silinir.
- Uygulamayı kapatırsanız (yukarı kaydırıp atarsanız) ya da web sayfasını yenilerseniz kayıt silinir.
- Bu belgede anılan kayıt satırları (`kesinti  bitti` gibi) son düzeltme turunda biraz değişmiş olabilir. Birebir aynı
  yazıyı aramayın; kopyanın tamamını gönderin.
- **Ekran görüntüsü:** yan tuş ile sesi açma tuşuna aynı anda basın.

**Her "kaldı" için gönderin:** senaryo numarası + ekran görüntüsü + Tanılama kopyası + bir cümle ("çeviri ekranda vardı
ama kulakta duymadım" gibi).

### 0.3 Kulakla ne dinliyoruz

- **Temiz ses:** müzik dinler gibi, net ve dolgun. Beklenen budur.
- **Boğuk ses:** telefon görüşmesi gibi, dar ve cızırtılı. Bu bir sorundur; mutlaka not edin.
- **AirPods yokken** uygulama sesi telefonun **üstteki kulak hoparlöründen** verir; çok kısıktır. Duymak için telefonu
  kulağınıza tutun. Bu bilerek böyle yapıldı (hoparlörden çalsa telefon kendi sesini yeniden çevirirdi).

---

## Bölüm A — Web deneme sürümü (yalnız telefon yeter)

**Adres:** https://yilmazfatih-cyber.github.io/Deneme/canli-ceviri/

Bir kez hazırlık:

1. iPhone'da **Ayarlar → Genel → Klavye → Dikteyi Etkinleştir** açık olsun.
2. Adresi **Safari** ile açın. Ana ekrana eklemeyin, Chrome kullanmayın.
3. "Köprü" uygulaması açılırsa sayfayı bir kez yenileyin.

### W-0 · Hangi sürüm açık? (1 dakika)

**Yap**

1. Sayfayı yenileyin (adres çubuğundaki ↻).
2. **Ayarlar → Tanılama kaydı → Kopyala**.
3. Notlar uygulamasına yapıştırın.
4. Üstteki **"Sürüm:"** satırına bakın.

**Beklenen**

- `Sürüm: S01 tur 3` ya da daha büyük bir tur: yeni sürüm açık. Bütün web senaryoları yapılabilir.
- **"Sürüm:" satırı hiç yoksa** eski sürüm açık (önceki tur, yayındaki bugünkü sürüm budur). W-1, W-6, W-7, W-8, W-9
  yine yapılabilir. W-2, W-4 ve W-5'teki "Hazırlanıyor…" ve "Duraklatıldı" beklenmez; bunları atlayın ve sonuç
  tablosuna "eski sürüm" yazın.
- `Tarayıcı:` satırında iPhone'un iOS sürümü görünür (ör. `iPhone OS 18_…`).

**Olmazsa** — Tanılama kaydı satırı ya da Kopyala yoksa: Ayarlar ekranının görüntüsünü gönderin.

### W-1 · İlk deneme: dinle, çevir, kulakta duy (5 dakika)

**Yap**

1. AirPods'u takın.
2. **Çeviri** sekmesinde dil şeridi "İngilizce → Türkçe" olsun.
3. **Dinlemeyi Başlat**'a dokunun.
4. İzin sorulursa **İzin Ver** deyin.
5. İngilizce sesi başlatın ya da 1. örnek cümleyi okuyun.
6. Cümleden sonra 2 saniye susun.
7. 2.–5. cümlelerle tekrarlayın.
8. **Durdur**'a dokunun.

**Beklenen**

- Başlat'tan sonra kısa süre "Hazırlanıyor…" (yeni sürümde), sonra **"Dinliyorum…"** ve sağ üstte **CANLI**.
- Konuşurken duyulan İngilizce italik yazıyla belirir.
- Sustuktan 1–2 saniye sonra Türkçesi büyük yazıyla çıkar ve **AirPods'tan Türkçe okunur.**
- Önceki çeviriler "Öncekiler" kartına iner.
- Durdur'dan sonra düğme yine "Dinlemeyi Başlat" olur.
- Kulakta ses temiz mi boğuk mu? Not edin (D14).

**Olmazsa** — Hangi adımda kaldığını yazın. Çeviri ekranın ve Tanılama kopyasını gönderin. Kopyada şunlara bakılacak:
`başlat`, `izin`, `tanıma açıldı`, `cümle`, `çeviri`, `ses` satırları.

### W-2 · İzin istemi açıkken ekran ne diyor? (3 dakika)

Bu senaryo izin isteminin **yeniden** çıkmasını ister.

**Yap**

1. Safari'de adres çubuğundaki **aA** simgesine dokunun.
2. **Web Sitesi Ayarları → Mikrofon → Sor** seçin.
3. Sayfayı yenileyin.
4. **Dinlemeyi Başlat**'a dokunun.
5. İzin istemi açıkken **cevap vermeyin**; 10 saniye ekrana bakın.
6. Sonra **İzin Ver** deyin.
7. Bir cümle okuyun.
8. Durdur'a dokunun ve Tanılama'yı kopyalayın.

**Beklenen**

- İstem açıkken: "Hazırlanıyor…", CANLI **yok**, düğme "Durdur".
- 5 saniye geçince ekran "Dinliyorum…"a geçebilir (bugünkü kodun yedek süresi). **Geçip geçmediğini yazın.**
- İzin verince ve konuşunca: "Dinliyorum…" ve CANLI.
- Tanılama'da şu satırları arayın ve tabloya aynen yazın:
  - `aşama  dinliyor olay=…` — `olay=` sonrasında ne yazıyor: `start`, `audiostart`, `sonuç` ya da `yedek`?
  - `izin  mikrofon=verildi` — var mı? Sonunda `(ilk sonuç geldi)` eki var mı?

**Olmazsa** — İstem açıkken ekranın görüntüsü ve Tanılama kopyası.

### W-3 · Çeviri beklenirken Durdur, sonra hemen Başlat (2 dakika)

**Yap**

1. Başlat'a dokunun.
2. Uzun bir cümle okuyun (4. ya da 5. cümle).
3. Sustuktan **hemen sonra**, çeviri ekrana gelmeden **Durdur**'a dokunun.
4. Hemen **Başlat**'a dokunun.
5. 2. cümleyi okuyun.

**Beklenen**

- Yeni cümlenin çevirisi beklemeden gelir.
- Durdur'dan önceki cümlenin çevirisi ekrana **gelmez**, okunmaz.
- Tanılama'da `çeviri  istek iptal edildi` satırı olabilir. Çeviri Durdur'dan önce yetiştiyse bu satır çıkmaz; bu da
  normaldir. Hangisi olduğunu yazın.

**Olmazsa** — Eski cümlenin çevirisi geldiyse ya da yeni cümle 5 saniyeden geç çevrildiyse: Tanılama kopyası.

### W-4 · Kulaklıksız: okurken dinlemeyi duraklat (3 dakika)

**Yap**

1. AirPods'u çıkarın (ses telefonun hoparlöründen gelecek).
2. **Ayarlar**'da **"Çeviri okunurken dinlemeyi duraklat"**'ı açın.
3. **Çeviri** sekmesine dönün, **Başlat**'a dokunun.
4. Bir cümle okuyun, susun.
5. Türkçe okunurken ekrana bakın.
6. Durdur'a dokunun. Anahtarı kapatıp 3.–5. adımları yineleyin.

**Beklenen**

- Anahtar açıkken, Türkçe okunurken: **"Duraklatıldı: okuma sürüyor"**, CANLI yok. Okuma bitince **"Dinliyorum…"**.
- Anahtar kapalıyken: telefon kendi Türkçe sesini duyup çevirmeye çalışabilir (garip yeni "çeviriler"). Olup olmadığını
  yazın.

**Olmazsa** — Okurken ekran "Dinliyorum…" diyorsa: ekran görüntüsü ve Tanılama kopyası.

### W-5 · Uygulama değiştirip dönmek, ekranı kilitlemek (3 dakika)

**Yap**

1. AirPods takılı, **Başlat**.
2. Bir cümle okuyun, çevrilsin.
3. Ekranın altından yukarı kaydırıp ana ekrana gidin; 10 saniye bekleyin.
4. Safari'ye dönün.
5. Bir cümle daha okuyun.
6. Yan tuşla ekranı kilitleyin; 10 saniye bekleyin; açın.
7. Bir cümle daha okuyun.

**Beklenen**

- Dönüşte kısa süre **"Duraklatıldı: sayfa arka planda"**, sonra **"Dinliyorum…"**. Cümle yine çevrilir.
- Mikrofon izni yeniden soruluyor mu? Yazın.
- Tanılama'da `sekme  gizlendi`, `sekme  göründü` ve `kesinti` satırları.

**Olmazsa** — Dönüşte ekran "Dinliyorum…" diyor ama cümleler çevrilmiyorsa: bu en önemli hatadır. Ekran görüntüsü ve
Tanılama kopyası.

### W-6 · Alania sesi (anahtar varsa, 3 dakika)

**Yap**

1. **Ayarlar**'da API anahtarını girin.
2. **Çeviri**'ye dönün, **Başlat**.
3. Üç cümle okuyun, her birinden sonra susun.

**Beklenen**

- Üç çeviri de Alania'nın sesiyle (cihazın sesinden farklı bir ses) okunur; **ekrana dokunmadan**.
- Tanılama'da her cümle için `ses  alania … ms`. Milisaniyeleri yazın.

**Olmazsa**

- Ekranda "Alania sesine ulaşılamadı…" notu ve Tanılama'da `ses  alania hatası ağ` görünüyorsa: tarayıcı Alania'ya
  ulaşamıyor (büyük olasılıkla Alania tarayıcıdan gelen isteğe izin vermiyor). Kopyayı gönderin.
- `alania hatası http=401` ya da `403`: anahtar yanlış.
- `çalınamadı`: Safari sesi dokunuşsuz çalmadı. Kopyayı gönderin.

### W-7 · Hangi mikrofon dinliyor? (2 dakika)

**Yap**

1. AirPods takılı, **Başlat**.
2. Telefonu masada bırakın.
3. 3–4 metre uzaklaşın.
4. Kendiniz bir cümle okuyun.
5. Telefonun yanına dönüp sonucu görün.

**Beklenen**

- Web sürümünde mikrofonu tarayıcı seçer. Uzaktan söylediğiniz cümle **düzgün çevrildiyse AirPods'un mikrofonu
  dinliyordur.** Bu durumda kulaktaki ses de boğuk olabilir. İkisini de yazın (D14).

**Olmazsa** — Bu senaryoda "kaldı" yoktur; gözleminizi yazın.

### W-8 · Sessiz bekleme ve hızlı konuşma (3 dakika)

**Yap**

1. **Başlat**.
2. 30 saniye hiç konuşmayın.
3. Bir cümle okuyun.
4. Bir cümle bitince hiç beklemeden ikincisine başlayın.

**Beklenen**

- 30 saniye sonra da dinleme sürer; cümle çevrilir.
- İkinci cümlenin ilk kelimesi kaybolmamalı. Kaybolduysa yazın (D15).
- Tanılama'da `tanıma bitti` satırları: nedenlerini ve `×` sayılarını kopyayla gönderin.

**Olmazsa** — Ekranda "Konuşma tanıma başlatılamadı" çıkarsa: ekran görüntüsü ve kopya.

### W-9 · İnternet kesilince (2 dakika)

**Yap**

1. **Başlat**.
2. Kontrol Merkezi'nden **Uçak modu**nu açın.
3. Bir cümle okuyun.
4. Uçak modunu kapatın.
5. Bir cümle daha okuyun.

**Beklenen**

- Uçak modunda: "Çeviri hizmetine ulaşılamadı…" ya da "Konuşma tanıma için internet bağlantısı gerekli." yazar.
  Hangisi yazdı, yazın. Sayfa çökmez.
- İnternet gelince sonraki cümle yine çevrilir (dinleme durduysa Başlat'a dokunun ve bunu yazın).

**Olmazsa** — Ekranda hiçbir açıklama yoksa: ekran görüntüsü ve kopya.

---

## Bölüm B — iPhone uygulaması (Mac ve Xcode gerekir)

### U-0 · Uygulamayı telefona yüklemek

**Yap** — `README.md` → "Çalıştırma" adımları (Xcode'da aç, Team seç, iPhone'u kabloyla bağla, ▶︎).

1. İlk açılışta telefonda **Geliştirici Modu**'nu açın (telefon yeniden başlar).
2. Ücretsiz hesapta **Ayarlar → Genel → VPN ve Aygıt Yönetimi**'nden kendi hesabınıza güvenin.
3. Uygulamayı açın.
4. **Ayarlar → Tanılama kaydı → Kopyala**, Notlar'a yapıştırın.

**Beklenen**

- Uygulama açılır, koyu lacivert ekran, altta üç sekme.
- Kopyanın başında `Canlı Çeviri 1.0 (…)`, `iOS …`, `Cihaz iPhone…` satırları.

**Olmazsa**

- Xcode imzada "bundle identifier … cannot be registered" gibi bir hata verirse: hatanın ekran görüntüsünü gönderin
  (paket kimliğinin değiştirilmesi gerekebilir).
- Uygulama açılır açılmaz kapanırsa: Xcode'un alt panelindeki son kırmızı satırların görüntüsü.

### U-1 · İlk deneme: dinle, çevir, AirPods'tan duy (5 dakika)

**Yap**

1. AirPods'u takın.
2. **Çeviri** sekmesinde düğmenin üstüne bakın.
3. **Dinlemeyi Başlat**'a dokunun.
4. Dil paketi indirme penceresi çıkarsa **İndir**'e dokunun ve bitmesini bekleyin.
5. Konuşma tanıma izni sorulunca **İzin Ver**.
6. Mikrofon izni sorulunca **İzin Ver**.
7. 1.–5. örnek cümleleri sırayla okuyun; her birinden sonra 2 saniye susun.
8. **Durdur**'a dokunun.
9. Tanılama'yı kopyalayıp gönderin (her şey yolunda olsa da).

**Beklenen**

- Başlatmadan önce düğmenin üstünde mavi **"<kulaklığınızın adı> bağlı"**.
- Başlat'tan sonra **"Hazırlanıyor…"**, CANLI yok, düğme kırmızı **"Durdur"**.
- İzinlerden sonra **"Dinliyorum…"** ve sağ üstte **CANLI**.
- Duyulan İngilizce italik yazıyla; susunca Türkçesi büyük yazıyla ve **AirPods'tan Türkçe ses**. Ses **temiz** olmalı.
- Durdur'dan sonra müzik çalıyorsa kaldığı yerden sürer.
- Tanılama'da sırasıyla (aralarında başka satırlar olabilir): `başlat  dil=en`, `dil paketi  hazır (… ms)`,
  `izin  mikrofon=verildi konuşma=verildi`, `ses yolu  çıkış=bluetooth giriş=dahili`, `tanıma açıldı  en-US cihazda`,
  `mikrofon  … Hz, … kanal`, `cümle  kelime=…`, `çeviri  … ms`, `ses  apple` (ya da `ses  alania … ms`), `durdur  neden=düğme`.

**Olmazsa**

- Ekranda kırmızı bir açıklama çıkarsa: açıklamanın ekran görüntüsü ve kopya.
- "Dinliyorum…" yazıyor ama hiçbir şey yazıya dökülmüyorsa: kopyayı **hemen** alın ve gönderin.
- `ses yolu` satırında `giriş=dahili` yerine başka bir şey (`hfp`, `bluetooth`) ya da ses boğuksa: kopya (D2).
- `tanıma açıldı  en-US sunucuda` yazıyorsa ve ekranda sarı "Apple'ın sunucusunda" notu varsa: not edin (D4).

### U-2 · Hangi mikrofon dinliyor? (2 dakika)

**Yap**

1. AirPods takılı, **Başlat**.
2. İngilizce sesi veren cihazı iPhone'un yanına koyun.
3. Siz 3–4 metre uzaklaşın; AirPods kulağınızda kalsın.
4. 1 dakika dinleyin.
5. Sonra siz, uzaktan, bir cümle okuyun.

**Beklenen**

- Telefonun yanındaki İngilizce ses çevrilir ve **siz uzaktayken AirPods'tan duyarsınız.**
- Sizin uzaktan söylediğiniz cümle ya hiç yakalanmaz ya da kötü yakalanır. Bu doğrudur: dinleyen iPhone'un
  mikrofonudur, AirPods'un değil (ilke 2).
- Kulaktaki ses temiz kalır.

**Olmazsa** — Uzaktan söylediğiniz cümle kusursuz çevrildiyse ve ses boğuksa: AirPods'un mikrofonu açılmış olabilir.
Kopya gönderin (D2).

### U-3 · Dil paketi inerken Durdur (3 dakika)

**Yap**

1. Dil şeridine dokunup daha önce hiç seçmediğiniz bir dil seçin (ör. **Almanca**).
2. **Başlat**'a dokunun.
3. İndirme penceresi açılınca ya da indirme sürerken **Durdur**'a dokunun.
4. Ekranın sağ üstündeki durum çubuğuna 10 saniye bakın.

**Beklenen**

- Düğme "Dinlemeyi Başlat"a döner.
- Sağ üstte **turuncu nokta** (mikrofon kullanımda işareti) **yanmaz**.
- Uygulama çökmez.

**Olmazsa** — Turuncu nokta yandıysa ya da sonradan bir dinleme başladıysa: kopya (D1).

### U-4 · İzin verilmezse (3 dakika)

**Yap**

1. iPhone **Ayarlar → Gizlilik ve Güvenlik → Mikrofon**'da **Canlı Çeviri**'yi kapatın.
2. Uygulamaya dönüp **Başlat**'a dokunun.
3. Açıklamayı okuyun.
4. Bir kez daha **Başlat**'a, hemen ardından **Durdur**'a dokunun.
5. Mikrofon iznini geri açın.

**Beklenen**

- "Mikrofon ve konuşma tanıma izni gerekli (Ayarlar'dan açabilirsiniz)." yazar; düğme "Dinlemeyi Başlat"a döner.
- Hızlı Başlat–Durdur'da uygulama çökmez (D23).
- Tanılama: `izin  mikrofon=reddedildi …`, `durdur  neden=izin yok`.

**Olmazsa** — Uygulama kapanırsa ya da açıklama çıkmazsa: ekran görüntüsü ve kopya.

### U-5 · Yedi dil: cihazda mı, sunucuda mı? (10 dakika)

**Yap** — Her dil için (İngilizce, Almanca, Fransızca, İspanyolca, İtalyanca, Rusça, Arapça):

1. Dil şeridinden dili seçin.
2. **Başlat**; indirme isterse indirin.
3. Ekranda sarı **"Bu dilde konuşma tanıma Apple'ın sunucusunda yapılır."** notu var mı, bakın.
4. **Durdur**.

Sonda Tanılama'yı kopyalayın.

**Beklenen**

- Her dil için Tanılama'da `tanıma açıldı  <bölge> cihazda` ya da `… sunucuda`. Sarı not yalnız "sunucuda" olanlarda.
- Sonuç tablosunun altındaki dil tablosunu doldurun.

**Olmazsa** — Bir dil hiç açılmazsa ekrandaki açıklamayı ve kopyayı gönderin (D4).

### U-6 · İnternet yokken (5 dakika)

**Yap**

1. Kontrol Merkezi'nden **Uçak modu**nu açın (Bluetooth açık kalsın; AirPods bağlı olsun).
2. Dil: **İngilizce**. **Başlat**, iki cümle okuyun, **Durdur**.
3. U-5'te "sunucuda" çıkan bir dil seçin (yoksa **Arapça**). **Başlat**, 15 saniye bekleyin.
4. Alania anahtarınız varsa: dili İngilizce yapın, **Başlat**, bir cümle okuyun.
5. Uçak modunu kapatın.

**Beklenen**

- İngilizcede uçak modunda da çeviri gelir ve okunur. "İnternet gerekli" iletisi **çıkmaz**.
- Sunucudaki dilde: "Bu dilde konuşma tanıma için internet gerekli. Bağlanıp yeniden başlatın." (hemen ya da birkaç
  saniye içinde).
- Alania anahtarıyla: cümle birkaç saniye içinde Apple sesiyle okunur ve sarı "Alania'ya ulaşılamadı; …" notu çıkar.
  Kaç saniye beklediğinizi yazın (D12).

**Olmazsa** — Her adımın sonunda ekran görüntüsü ve kopya (D22, D32).

### U-7 · Dinlerken AirPods'u çıkarıp takmak (5 dakika)

Geliştiricinin "cihazda denenmeli" dediği 2. madde: çalan çeviri sürmeli, sıradakiler atılmamalı.

**Yap**

1. AirPods takılı, **Başlat**.
2. Uzun bir cümle okuyun (5. cümle).
3. Türkçe okunmaya başlar başlamaz **iki AirPods'u kutuya koyun.**
4. Telefonu kulağınıza tutun.
5. Hemen bir cümle daha okuyun.
6. AirPods'u kutudan çıkarıp takın.
7. Bir cümle daha okuyun.
8. 3.–7. adımları **tek kulaklıkla** (birini çıkarın, sonra geri takın) yineleyin.
9. Alania anahtarınız varsa her şeyi anahtarla bir kez daha yapın (anahtarsız da yaptıysanız).

**Beklenen**

- Çalmakta olan Türkçe cümle **kesilmeden** telefonun kulak hoparlöründen sürer.
- Kutuya koyunca kısa süre "Duraklatıldı: ses yolu değişiyor", sonra "Dinliyorum…". Düğmenin üstünde sarı "AirPods
  bağlı değil…".
- 5. adımdaki cümle de çevrilir ve okunur; **hiçbir çeviri atlanmaz**, iki ses **üst üste binmez**.
- Takınca "… bağlı" geri gelir, ses yine AirPods'tan.
- Tanılama'da `ses yolu  … neden=eski cihaz gitti` / `yeni cihaz`, `kesinti  başladı neden=yapılandırma`,
  `motor  yeniden başlatıldı`. **`neden=bekçi` satırı çıkmamalı.**

**Olmazsa** — Okuma kesildiyse, bir çeviri okunmadıysa, sesler üst üste bindiyse ya da `neden=bekçi` gördüyseniz: hemen
kopya (D3, D19, D24, D27).

İsteğe bağlı (K3): AirPods aynı Apple hesabındaki bir iPad ya da Mac'e kendiliğinden geçerse (o cihazda bir video
başlatın) aynı beklentiler geçerlidir.

### U-8 · Mikrofondan ses gelmezse ("bekçi") — gözlem

Geliştiricinin 1. maddesi. Bunu kasten tetiklemenin yolu yok; diğer senaryolarda **görürseniz** not edin.

**Belirti:** ekranda **"Duraklatıldı: mikrofondan ses gelmiyor"** ya da Tanılama'da `kesinti  başladı neden=bekçi`.

**Beklenen**

- Ekran, mikrofon yeniden ses verene dek "Duraklatıldı: mikrofondan ses gelmiyor"da kalır.
- Sonra ya "Dinliyorum…"a döner (Tanılama: `motor  tampon geldi`), ya da 2–3 saniye içinde kırmızı
  "Mikrofondan ses gelmiyor. Dinlemeyi yeniden başlatın." çıkar.
- Arada ekranda **"Dinliyorum…" yazmamalı.**

**Olmazsa** — Ne gördüyseniz ekran görüntüsü ve hemen kopya (D11, D31).

### U-9 · Gelen arama, açmadan (5 dakika; ikinci telefon gerekir)

Geliştiricinin 3. ve 4. maddeleri.

Önce bakın: iPhone **Ayarlar → Uygulamalar → Telefon → Gelen Aramalar** "Afiş" mi "Tam Ekran" mı? Not edin.

**Yap**

1. AirPods takılı, **Başlat**.
2. Uzun bir cümle okuyun.
3. Türkçe okunurken ikinci telefondan sizi arasınlar.
4. Aramayı **açmayın**; 15 saniye çalsın, ekrana bakın.
5. Aramayı **reddedin**.
6. Bir cümle okuyun.

**Beklenen**

- Arama gelince okunan Türkçe **hemen kesilir**; ekranda **"Duraklatıldı: arama, alarm ya da Siri"**.
- 10 saniye sonra sarı not: **"Devam etmek için Durdur'a, sonra Başlat'a dokunun."** (Son turda metin "Dinleme
  kendiliğinden sürmezse Durdur'a, sonra Başlat'a dokunun." olarak değişmiş olabilir; ikisi de doğru.)
- Reddedince: not kalkar, **"Dinliyorum…"**a dönülür; sarı **"Kesinti sırasında gelen çeviri okunmadı."** notu görünür.
  (Bu not şimdilik Durdur'a dek kalır.)
- 6. adımdaki cümle çevrilir ve okunur.
- Tanılama: `kesinti  başladı neden=telefon`, `ses  atlandı (kesinti)`, `kesinti  10 sn sürdü, bitiş bildirimi yok`,
  `kesinti  bitti shouldResume=…`, `motor  yeniden başlatıldı`.

**Olmazsa**

- Reddettikten sonra ekran "Duraklatıldı"da kalırsa: 10 saniye bekleyin, görüntü alın, **Durdur → Başlat** yapın, sonra
  kopyayı gönderin (D8, D20, D29).
- Okuma kesilmediyse ya da not çıkmadıysa: kopya (D28).

### U-10 · Gelen arama, açınca (5 dakika)

**Yap**

1. AirPods takılı, **Başlat**.
2. İkinci telefondan sizi arasınlar; aramayı **açın**.
3. 10 saniye konuşun.
4. Görüşme sürerken Canlı Çeviri'ye dönün (ekranın üstündeki yeşil alana ya da ana ekrandan simgeye dokunun).
5. 10 saniye ekrana bakın.
6. Görüşmeyi kapatın.
7. Canlı Çeviri'ye dönüp bir cümle okuyun.

**Beklenen** (bu davranış henüz bilinmiyor; gördüğünüzü yazın)

- Görüşme sürerken: "Duraklatıldı: …" ya da kırmızı bir açıklama. **Açıklamanın tam metnini yazın.**
- Görüşme bitince: ya dinleme kendiliğinden sürer, ya da açıklama "yeniden başlatın" der. Hangisi?
- Uygulama çökmez.

**Olmazsa** — Her durumda kopyayı gönderin (D30).

### U-11 · Görüşme sürerken Başlat (3 dakika)

**Yap**

1. Uygulamada **Durdur** durumundayken ikinci telefondan sizi arasınlar; açın.
2. Görüşme sürerken Canlı Çeviri'yi açın.
3. **Başlat**'a dokunun.
4. Görüşmeyi kapatın; **Başlat**'a yeniden dokunun.

**Beklenen**

- 3. adımda: "Görüşme sürerken dinleme başlatılamaz. Görüşme bitince yeniden deneyin." (ya da benzeri). Tam metni yazın.
- 4. adımda dinleme normal başlar.

**Olmazsa** — Açıklama başka bir şey söylüyorsa: görüntü ve kopya (`durdur  neden=hata …` satırı, D26).

### U-12 · Siri (2 dakika)

**Yap**

1. **Başlat**.
2. Siri'yi açın (yan tuşa basılı tutun ya da "Hey Siri").
3. "Saat kaç?" diye sorun.
4. Siri kapanınca bir cümle okuyun.

**Beklenen**

- Siri açıkken "Duraklatıldı: arama, alarm ya da Siri".
- Siri kapanınca "Dinliyorum…"; cümle çevrilir.

**Olmazsa** — Ekran "Duraklatıldı"da kalırsa: 10 saniye bekleyin (sarı not çıkmalı), görüntü ve kopya (D8, D20).

### U-13 · Alarm ya da zamanlayıcı (3 dakika)

**Yap**

1. **Saat** uygulamasında **1 dakikalık** zamanlayıcı kurun.
2. Canlı Çeviri'ye dönün, **Başlat**.
3. Zamanlayıcı çalınca **durdurun**.
4. Bir cümle okuyun.

**Beklenen**

- Çalarken "Duraklatıldı: arama, alarm ya da Siri".
- Durdurunca "Dinliyorum…"; cümle çevrilir. Dönmezse 10 saniye sonra sarı "Devam etmek için…" notu çıkmalı.

**Olmazsa** — Görüntü ve kopya (D8, D20).

### U-14 · Uygulamadan çıkıp dönmek (3 dakika)

**Yap**

1. **Başlat**.
2. Bir cümleyi okurken, **cümlenin ortasında** ana ekrana gidin.
3. 10 saniye bekleyin.
4. Canlı Çeviri'ye dönün.
5. Bir cümle okuyun.

**Beklenen**

- Dönüşte kısa süre "Duraklatıldı: uygulama arka planda", sonra "Dinliyorum…".
- Yarım kalan cümle de çevrilmiş olabilir (ekranda görünür); okunmadıysa sarı "Kesinti sırasında…" notu.
- 5. adımdaki cümle çevrilir ve okunur.
- Tanılama: `uygulama  arka planda`, `kesinti  başladı neden=arka plan`, `uygulama  etkin oldu`, `kesinti  bitti`,
  `motor  yeniden başlatıldı`. Yarım cümlenin `çeviri` satırı var mı, `hata` mı? (D21)

**Olmazsa** — Dönüşte "Dinliyorum…" yazıyor ama çeviri gelmiyorsa: **hemen** kopya.

### U-15 · Ekran kilidi (3 dakika)

**Yap**

1. **Başlat**.
2. Telefona 2 dakika dokunmadan İngilizce sesi dinletin.
3. Yan tuşla ekranı kilitleyin; 10 saniye bekleyin.
4. Kilidi açın; uygulama açık gelir.
5. Bir cümle okuyun.

**Beklenen**

- 2. adımda ekran **kararmaz**.
- Kilit açılınca kısa "Duraklatıldı", sonra "Dinliyorum…"; cümle çevrilir.

**Olmazsa** — Görüntü ve kopya.

### U-16 · Kontrol Merkezi (1 dakika)

**Yap**

1. **Başlat**.
2. Sağ üstten aşağı çekip Kontrol Merkezi'ni açın; 5 saniye bekleyin; kapatın.
3. Bir cümle okuyun.

**Beklenen**

- Dinleme **durmaz**; ekranda "Duraklatıldı" görünmez. Cümle çevrilir.
- Tanılama: `uygulama  etkinliğini yitirdi`, `uygulama  etkin oldu` (aralarında `kesinti` yok).

**Olmazsa** — Kopya.

### U-17 · Mikrofonu başka bir uygulama alırsa (4 dakika)

**Yap**

1. **Başlat**.
2. **Sesli Notlar**'ı açın, 5 saniye kayıt yapın, kaydı durdurun.
3. Canlı Çeviri'ye dönün; bir cümle okuyun.
4. **Durdur**.
5. Sesli Notlar'da **kaydı başlatın ve sürdürün.**
6. Canlı Çeviri'ye geçip **Başlat**'a dokunun.
7. Sesli Notlar kaydını durdurun.

**Beklenen**

- 3. adımda "Dinliyorum…"a dönülür ya da ne yapılacağını söyleyen bir açıklama çıkar. Hangisi?
- 6. adımda: "Mikrofon başka bir uygulamada…" ya da benzeri bir açıklama. **Tam metni yazın.**
- Hiçbir adımda ekran "Dinliyorum…" derken çeviri durmuş olmamalı.

**Olmazsa** — Görüntü ve kopya (`motor  başlatılamadı …` satırları, D26).

### U-18 · Başka ses çıkışları (isteğe bağlı, 5 dakika)

**Yap** — Elinizde olanları deneyin; her birinde **Başlat**, bir cümle, **Durdur**, kopya:

1. **Hoparlör:** dinlerken Kontrol Merkezi'nde müzik kutusundaki ses çıkışı simgesine dokunup **iPhone hoparlörü**nü seçin.
2. **Kablolu kulaklık** (USB-C ya da Lightning).
3. **Bluetooth hoparlör** ya da **araç**.

**Beklenen**

- Hoparlörde: sarı "Ses hoparlörden çıkıyor; mikrofon kendi sesini duyabilir."
- Kablolu kulaklıkta: "… bağlı"; Tanılama `çıkış=kablolu` ya da `çıkış=usb`, `giriş=dahili` (D9).
- BT hoparlörde AirPods gibi "bağlı" görünüp görünmediğini; araçta sarı uyarı olup olmadığını yazın (D10).

**Olmazsa** — Kopya.

### U-19 · Kulaklıksız: uygulama kendi sesini duyuyor mu? (3 dakika)

**Yap**

1. AirPods'u kutuya koyun.
2. **Başlat**.
3. Bir cümle okuyun; Türkçe kulak hoparlöründen okunurken telefonu **masada** bırakın.
4. Bir cümle daha.

**Beklenen**

- Türkçe okunurken yeni, anlamsız "çeviriler" oluşmamalı. Oluşursa sayısını yazın (D7).

**Olmazsa** — Kopya (okuma sırasında `cümle` satırları).

### U-20 · Alania sesi ve Apple'ın Türkçe sesi (5 dakika)

**Yap**

1. **Ayarlar**'da anahtar alanı **boş**ken **Başlat**, bir cümle, **Durdur**.
2. Anahtarı girin. **Başlat**, üç cümle, **Durdur**.
3. Anahtarın sonuna bir harf ekleyin (yanlış anahtar). **Başlat**, iki cümle, **Durdur**.
4. Anahtarı düzeltin.

**Beklenen**

- 1: Türkçe Apple sesi okur. Ekranda "Türkçe ses yüklü değil" notu çıkarsa yazın (D13).
- 2: Alania sesi; Tanılama `ses  alania … ms` (sayıları yazın, D12).
- 3: sarı "Alania anahtarı geçersiz; Apple sesi kullanılıyor."; cümleler Apple sesiyle okunur.

**Olmazsa** — Kopya.

### U-21 · Anahtar saklanıyor mu? (5 dakika)

**Yap**

1. Anahtarı girin.
2. Uygulamayı kapatın (ekranın altından yukarı kaydırıp kartı atın).
3. Açın; **Ayarlar**'da alan dolu mu?
4. Uygulamayı silin (simgeye basılı tutun → Uygulamayı Sil).
5. Xcode'dan yeniden yükleyin (▶︎).
6. **Ayarlar**'da alan dolu mu?
7. Alanı tamamen boşaltın; **Başlat**, bir cümle; Tanılama'da `ses  apple` mı?

**Beklenen**

- 3: dolu.
- 6: dolu ya da boş — **hangisi olduğunu yazın** (D25).
- 7: Apple sesi okur.

Daha önce bu uygulamanın eski bir sürümünü kullandıysanız (anahtar o zaman girildiyse): yeni sürümü üstüne yükleyince
alan dolu mu? Yazın (D33). Eski sürüm yoksa bu adımı atlayın.

**Olmazsa** — Ekran görüntüsü; **anahtarı göndermeyin.**

### U-22 · Uzun deneme ve sessizlik (12 dakika)

**Yap**

1. Pil yüzdesini yazın.
2. AirPods takılı, **Başlat**.
3. İngilizce bir podcast'i 10 dakika dinletin.
4. Sonra 30 saniye hiç ses olmasın.
5. Bir cümle okuyun.
6. **Durdur**; pil yüzdesini yazın; telefon ısındı mı?
7. Tanılama'yı kopyalayın.

**Beklenen**

- 10 dakika boyunca çeviriler gelir ve okunur; zamanla bozulmaz.
- 30 saniyelik sessizlikten sonra da cümle çevrilir.
- Kopyada `tanıma bitti` satırlarının nedenleri görülür (D5, D18).

**Olmazsa** — Sorunu gördüğünüz **anda** kopya.

### U-23 · Ses sistemi sıfırlanınca (yalnız Geliştirici menüsü varsa)

**Yap**

1. **Başlat**.
2. iPhone **Ayarlar → Geliştirici**'de **Reset Media Services** varsa dokunun. Yoksa bu senaryoyu atlayın.
3. Uygulamaya dönün.

**Beklenen**

- Uygulama çökmez; "Ses sistemi yeniden başladı. Dinlemeyi yeniden başlatın." yazar.
- **Başlat** ile yeniden çalışır.

**Olmazsa** — Görüntü ve kopya (D17).

### U-24 · VoiceOver (isteğe bağlı, 5 dakika)

**Yap**

1. **Ayarlar → Erişilebilirlik → VoiceOver**'ı açın.
2. Canlı Çeviri'de ekranı sağa kaydırarak öğeleri tek tek dinleyin.
3. Başlat'a çift dokunun; bir cümle okuyun.
4. VoiceOver'ı kapatın.

**Beklenen**

- Okunanlar Türkçe ve anlamlı: "Kaynak dil, İngilizce, Türkçeye çevrilir", "Dinlemeyi başlat", sekmelerde "Seçili".
- "Dinleme başladı" duyurusu; çeviri gelince Türkçe metni okunur.
- Simge adları ("waveform" gibi) okunmaz.

**Olmazsa** — Yanlış okunan öğeyi yazın.

### U-25 · Geliştirici yapısı gerekenler (bu turda yapılmaz)

D6 (ses oturumu kipinin `.measurement` ile karşılaştırılması) ayrı bir yapı ister. Sonuç tablosuna "yapılmadı" yazın.

---

## Sonuç tablosu

| Senaryo | Konu                               | Geçti / Kaldı / Yapılmadı | Not |
| ------- | ---------------------------------- | ------------------------- | --- |
| W-0     | Web sürümü (`Sürüm:` satırı)       |                           |     |
| W-1     | Web ilk deneme                     |                           |     |
| W-2     | İzin istemi, aşama (`olay=…`)      |                           |     |
| W-3     | Çeviri beklenirken Durdur → Başlat |                           |     |
| W-4     | Okurken duraklat                   |                           |     |
| W-5     | Arka plan, ekran kilidi (web)      |                           |     |
| W-6     | Alania (web)                       |                           |     |
| W-7     | Hangi mikrofon (web)               |                           |     |
| W-8     | Sessizlik, hızlı konuşma (web)     |                           |     |
| W-9     | İnternet kesilince (web)           |                           |     |
| U-0     | Yükleme                            |                           |     |
| U-1     | Uygulama ilk deneme                |                           |     |
| U-2     | Hangi mikrofon                     |                           |     |
| U-3     | Dil paketi inerken Durdur          |                           |     |
| U-4     | İzin verilmezse                    |                           |     |
| U-5     | Yedi dil                           |                           |     |
| U-6     | İnternet yokken                    |                           |     |
| U-7     | AirPods çıkar / tak                |                           |     |
| U-8     | Bekçi (gözlem)                     |                           |     |
| U-9     | Arama, açmadan                     |                           |     |
| U-10    | Arama, açınca                      |                           |     |
| U-11    | Görüşme sürerken Başlat            |                           |     |
| U-12    | Siri                               |                           |     |
| U-13    | Alarm                              |                           |     |
| U-14    | Uygulamadan çıkıp dönmek           |                           |     |
| U-15    | Ekran kilidi                       |                           |     |
| U-16    | Kontrol Merkezi                    |                           |     |
| U-17    | Mikrofonu başka uygulama alırsa    |                           |     |
| U-18    | Başka ses çıkışları                |                           |     |
| U-19    | Kulaklıksız yankı                  |                           |     |
| U-20    | Alania ve Apple sesi               |                           |     |
| U-21    | Anahtar saklanıyor mu              |                           |     |
| U-22    | Uzun deneme                        |                           |     |
| U-23    | Ses sistemi sıfırlama              |                           |     |
| U-24    | VoiceOver                          |                           |     |
| U-25    | Geliştirici yapısı (D6)            | Yapılmadı                 |     |

**Dil tablosu (U-5):**

| Dil        | Tanılama: cihazda / sunucuda | Sarı not var mı | Çeviri geldi mi |
| ---------- | ---------------------------- | --------------- | --------------- |
| İngilizce  |                              |                 |                 |
| Almanca    |                              |                 |                 |
| Fransızca  |                              |                 |                 |
| İspanyolca |                              |                 |                 |
| İtalyanca  |                              |                 |                 |
| Rusça      |                              |                 |                 |
| Arapça     |                              |                 |                 |

---

## § 7 karşılık tablosu (ekip için)

`docs/ses-hatti.md` § 7'deki her cihaz sorusu (D) ve § 4'teki her kesinti senaryosu (K) aşağıdaki senaryolarda
gözlenir. Geliştiricilerin "cihazda denenmeli" dedikleri de en altta.

**Cihaz soruları**

| D   | Konu (kısa)                                                     | Senaryo                     |
| --- | --------------------------------------------------------------- | --------------------------- |
| D1  | `translationTask`, yapılandırma `nil` olunca görevi iptal ediyor mu | U-3                     |
| D2  | AirPods bağlıyken giriş `builtInMic`, çıkış A2DP mi             | U-1, U-2                    |
| D3  | Tek / iki kulaklık çıkarılınca yol ve yapılandırma bildirimi    | U-7                         |
| D4  | Hangi diller cihazda tanınıyor; sunucu notu                     | U-5 (ayrıca U-1)            |
| D5  | Sessizlikte tanıma görevi kendiliğinden bitiyor mu              | U-22                        |
| D6  | `.default` ile `.measurement` karşılaştırması                   | U-25 (geliştirici yapısı)   |
| D7  | Kulaklıksız ahize sesi yeniden tanınıyor mu                     | U-19 (web karşılığı W-4)    |
| D8  | Arama, Siri, alarm sonrası `.ended`, `shouldResume`; gecikmeli `.began` | U-9, U-12, U-13, U-14 |
| D9  | Kablolu kulaklık port türü; giriş iPhone'da mı                  | U-18                        |
| D10 | BT hoparlör / araç "bağlı" görünüyor mu                         | U-18                        |
| D11 | Kesinti sonrası `isRunning`; gereksiz bekçi alarmı              | U-7, U-8                    |
| D12 | Alania gecikmesi; 5 sn sınırı; uçak kipinde yedeğe geçiş        | U-20, U-6                   |
| D13 | Türkçe Apple sesi yüklü mü                                      | U-20                        |
| D14 | Web: AirPods A2DP mi HFP mi; web sesi kulaklıktan mı            | W-1, W-7                    |
| D15 | Web: `continuous` tanımanın bitişi; cümle arası kelime kaybı    | W-8                         |
| D16 | Web: Alania sesi dokunuşsuz çalıyor mu                          | W-6                         |
| D17 | Medya servisleri sıfırlanınca çökmeden hata                     | U-23                        |
| D18 | 10 dakikalık oturum: pil, ısınma, doğruluk                      | U-22                        |
| D19 | AirPods tak / çıkar sonrası ilk tampon; bekçi payı              | U-7                         |
| D20 | Alarm, Siri, arama afişi `.ended` gönderiyor mu                 | U-9, U-12, U-13             |
| D21 | Arka planda / kesintide `translate` ne yapıyor                  | U-14                        |
| D22 | Sunucu tanıması internetsiz: hata kodu                          | U-6                         |
| D23 | İzin yokken / hazırlıkta Durdur'da `inputNode`                  | U-4, U-3                    |
| D24 | `didCancel` gecikmesi; sesler üst üste binmiyor mu              | U-7                         |
| D25 | Silip yeniden kurunca anahtar kalıyor mu                        | U-21                        |
| D26 | Mikrofon başka uygulamada / görüşme sürerken hata alanı ve kodu | U-17 (a), U-11 (b)          |
| D27 | AirPods çıkar / takta çalan çeviri sürüyor mu                   | U-7                         |
| D28 | Arama gelince okuma kesiliyor mu; "okunmadı" notu               | U-9                         |
| D29 | Arama 10 sn çalınca "Durdur'a, sonra Başlat'a" notu; reddedince sürme | U-9                   |
| D30 | Arama açılınca, görüşme sürerken dönüş                          | U-10                        |
| D31 | Bekçiden dönüş; "Duraklatıldı"da kalma; ikinci alarm            | U-8                         |
| D32 | Sunucu dili internetsiz: hangi yol, hangi ileti; cihaz dilinde ileti yok | U-6                |
| D33 | Eski sürümden güncellemede anahtar taşınıyor mu                 | U-21                        |
| D34 | Web: start / audiostart / sonuç; "Hazırlanıyor…" → "Dinliyorum…"; `olay=yedek` | W-2          |
| D35 | Web: ekran kilidi ve sekme değişiminde tanıma; dönüş; izin yeniden soruluyor mu | W-5         |

**Kesinti senaryoları**

| K   | Senaryo                                  | Senaryo (bu belge) |
| --- | ---------------------------------------- | ------------------ |
| K1  | AirPods takıldı                          | U-7                |
| K2  | AirPods çıkarıldı / kutuya kondu         | U-7                |
| K3  | AirPods başka cihaza geçti               | U-7 (isteğe bağlı) |
| K4  | Telefon çağrısı                          | U-9, U-10          |
| K5  | Görüşme sürerken Başlat                  | U-11               |
| K6  | Siri                                     | U-12               |
| K7  | Alarm / zamanlayıcı                      | U-13               |
| K8  | Uygulama arka plana gitti                | U-14 (web: W-5)    |
| K9  | Ekran kilitlendi                         | U-15 (web: W-5)    |
| K10 | Kontrol Merkezi / bildirim perdesi       | U-16               |
| K11 | Başka uygulama mikrofonu aldı            | U-17               |
| K12 | İnternet kesildi                         | U-6 (web: W-9)     |
| K13 | Medya servisleri sıfırlandı              | U-23               |
| K14 | Motor yapılandırması değişti             | U-7                |
| K15 | Bekçi                                    | U-8                |
| K16 | Çıkış hoparlöre / AirPlay'e alındı       | U-18               |

**Geliştiricilerin "cihazda denenmeli" dedikleri**

| Madde                                                                                     | Senaryo  |
| ----------------------------------------------------------------------------------------- | -------- |
| iOS 1 — bekçiden sonra tampon gelene dek "Duraklatıldı", sonra dinleme ya da 2 sn'de hata  | U-8      |
| iOS 2 — AirPods tak / çıkarda çalan çeviri sürer, sıradakiler atılmaz                     | U-7      |
| iOS 3 — arama gelince "Kesinti sırasında gelen çeviri okunmadı." notu                      | U-9      |
| iOS 4 — arama 10 sn sürünce "Devam etmek için Durdur'a, sonra Başlat'a dokunun." notu      | U-9      |
| Web 1 — ilk Başlat'ta izin istemi açıkken "Hazırlanıyor…"; `aşama  dinliyor olay=…`        | W-2      |
| Web 2 — izin istemi 5 sn'den uzun beklenirse yedek süre (`olay=yedek`)                    | W-2      |
| Web 3 — `izin  mikrofon=verildi` ilk Başlat'ta mı, `(ilk sonuç geldi)` ekiyle mi          | W-2      |
| Web 4 — "Duraklatıldı: okuma sürüyor" ↔ "Dinliyorum…"; arka planda "sayfa arka planda"     | W-4, W-5 |
| Web 5 — çeviri beklenirken Durdur → Başlat; `çeviri  istek iptal edildi`                   | W-3      |
