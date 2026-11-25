# Xcode rehberi: ne girecek, nereye dokunacaksınız

Bu rehber Canlı Çeviri'yi ilk kez Xcode'da açıp kendi iPhone'unuzda denemeniz içindir. **Uygulama gerçek bir iPhone'da henüz hiç denenmedi**; bu yüzden bir adım burada yazdığı gibi görünmezse ekran görüntüsünü gönderin. Değerler projeden okundu (`project.pbxproj`, `Sabitler.swift`, `Abonelik.storekit`). Xcode'un menü ve alan adları İngilizcedir; **kalın** yazılanı aynen arayın. "(Xcode sürümüne göre adı değişebilir)" yazan yerlerde ad Xcode sürümünüzde biraz farklı olabilir.

## 1. Gerekenler

- **Mac** ve içinde **Xcode 16 veya üstü** (App Store'dan ücretsiz). Daha eski Xcode ile açılmaz. Mac'iniz o Xcode'u kaldırmıyorsa App Store sayfası söyler.
- **iPhone, iOS 18 veya üstü.** Ayarlar → Genel → Hakkında → iOS Sürümü'nden bakın.
- iPhone'u Mac'e bağlayan **kablo**. Mac'inizin girişine uymuyorsa adaptör gerekir.
- **Apple Kimliği.** Ücretsiz olanı yeter; Developer Programı (99 dolar) şart değil.
- AirPods (çeviriyi duymak için).

**Projeyi indirmek**

1. Tarayıcıda https://github.com/yilmazfatih-cyber/Deneme adresini açın.
2. Dal olarak varsayılan dalı bırakın.
3. Yeşil **Code** düğmesine dokunun, sonra **Download ZIP**'e.
4. İnen ZIP'e çift tıklayın; klasör açılır.
5. İçinden `canli-ceviri` klasörüne girin ve `CanliCeviri.xcodeproj` dosyasını bulun.

Klasörde `canli-ceviri` yoksa varsayılan dalda proje henüz yoktur; bana haber verin, hangi daldan indireceğinizi söyleyeyim.

## 2. Girilecek değerler

Xcode'da soldaki listenin en üstündeki mavi **CanliCeviri** simgesine tıklayın, ortada **TARGETS** altından **CanliCeviri**'yi seçin. Üstte sekmeler görünür: **General**, **Signing & Capabilities** vb.

| Alan (Xcode'daki adı, yeri) | Girilecek / seçilecek | Nereden geliyor |
| --- | --- | --- |
| **Team** (Takım). **Signing & Capabilities** sekmesi → **Signing** bölümü | Kendi Apple Kimliğiniz. Listede adınız ve **(Personal Team)** yazar. Yoksa **Add an Account…** ile ekleyin | Projede boş; sizin hesabınız |
| **Automatically manage signing** (İmzalamayı otomatik yönet). Aynı bölüm | **İşaretli** kalır | `CODE_SIGN_STYLE = Automatic` |
| **Bundle Identifier** (Paket kimliği). **Signing & Capabilities** → **Signing**, ya da **General** → **Identity** | `com.yilmazfatih.canliceviri`. Xcode "kullanılamıyor" derse sonunu değiştirin: `com.<adınız>.canliceviri` | `PRODUCT_BUNDLE_IDENTIFIER` |
| **Display Name** (Görünen ad). **General** → **Identity** | `Canlı Çeviri` (değiştirmeyin) | `INFOPLIST_KEY_CFBundleDisplayName` |
| **Version** (Sürüm). **General** → **Identity** | `1.0` | `MARKETING_VERSION` |
| **Build** (Yapı numarası). Aynı yer | `1` | `CURRENT_PROJECT_VERSION` |
| **Minimum Deployments** (En düşük iOS). **General** sekmesi | `iOS 18.0` (değiştirmeyin) | `IPHONEOS_DEPLOYMENT_TARGET` |
| **Supported Destinations** (Desteklenen cihazlar). **General** | Yalnız **iPhone**; iPad yok | `TARGETED_DEVICE_FAMILY = 1` |
| **iPhone Orientation** (Yönelim). **General** → **Deployment Info** | Yalnız dikey (**Portrait**). Görünüm hep koyu | `UIInterfaceOrientationPortrait`, `UIUserInterfaceStyle = Dark` |
| **Scheme** (Şema). Pencerenin üst çubuğunda, ▶︎ düğmesinin yanında | `CanliCeviri` (Xcode projeyi açınca kendisi oluşturur) | Projede ortak şema dosyası yok |
| **Run Destination** (Çalıştırma hedefi). Üst çubukta şemanın sağında | Bağlı iPhone'unuzun adı. Simülatör seçmeyin (bkz. bölüm 6) | Sizin cihazınız |
| **StoreKit Configuration**. **Product → Scheme → Edit Scheme… → Run → Options** | `Abonelik.storekit` (yalnız satın almayı denemek için; bölüm 4). Normal denemede **None** kalabilir | `CanliCeviri/Abonelik.storekit`; şemaya bağlı gelmez, elle seçilir |
| **Arguments Passed On Launch** (Başlatma argümanları). **Edit Scheme… → Run → Arguments** | Boş bırakın. Yalnız ekranlara bakmak için `-ekran <ad>` (bölüm 6) | `Onizleme.swift` |
| Abonelik **ürün kimliği** (Product ID) | `canliceviri.sinirsiz.haftalik`. App Store Connect'te harfi harfine aynısı girilir | `Sabitler.swift` → `abonelikUrunu`; `Abonelik.storekit` |
| Abonelik **grubu** (Subscription Group) adı | `Canlı Çeviri Sınırsız` | `Abonelik.storekit` → `subscriptionGroups` |
| Abonelik süresi ve deneme fiyatı | 1 hafta (`P1W`); yerel deneme fiyatı 49,99 TL. Gerçek fiyatı App Store Connect'te siz seçersiniz | `Abonelik.storekit` |
| Ücretsiz süre | Günde 10 dakika (600 sn), yalnız "Dinliyorum…" iken sayılır | `Sabitler.swift` → `gunlukUcretsizSure` |
| İzin penceresi: **mikrofon** | "Karşınızdaki kişinin konuşmasını dinleyip Türkçeye çevirmek için mikrofon kullanılır." | `INFOPLIST_KEY_NSMicrophoneUsageDescription` |
| İzin penceresi: **konuşma tanıma** | "Konuşmayı yazıya dökmek için konuşma tanıma kullanılır; destekleniyorsa cihazın içinde yapılır." | `INFOPLIST_KEY_NSSpeechRecognitionUsageDescription` |
| Gizlilik bildirimi | İzleme yok, veri toplama yok; yalnız ayarları saklamak için `UserDefaults` kullanımı beyan edilmiş | `PrivacyInfo.xcprivacy` |

İzin pencerelerinin başlığını ve düğmelerini iPhone yazar; yaklaşık şöyle görünür: **"Canlı Çeviri" Mikrofona Erişmek İstiyor** ve **"Canlı Çeviri" Konuşma Tanımaya Erişmek İstiyor**, altında yukarıdaki metin, düğmeler **İzin Ver** (ya da **Tamam**) ve **İzin Verme** (buna benzer). Dil paketi yoksa ayrıca bir indirme penceresi çıkar.

## 3. İlk çalıştırma, adım adım

1. `CanliCeviri.xcodeproj` dosyasına çift tıklayın. Xcode açılır.
2. Xcode "Trust and Enable" ya da benzeri bir soru sorarsa **Trust** (Güven) deyin. (Buna benzer.)
3. Soldaki listeden mavi **CanliCeviri** simgesine, sonra **TARGETS** altında **CanliCeviri**'ye tıklayın.
4. **Signing & Capabilities** sekmesine geçin.
5. **Automatically manage signing** işaretli mi, bakın.
6. **Team** kutusuna tıklayın.
   - Adınızı görüyorsanız seçin.
   - Görmüyorsanız **Add an Account…** → Apple Kimliğinizle girin → pencereyi kapatıp **Team**'den seçin. (Hesap ekleme yeri: **Xcode → Settings… → Accounts**; Xcode sürümüne göre adı değişebilir.)
7. Aynı bölümde kırmızı hata kalmadığını kontrol edin. Hata varsa bölüm 5'e bakın.
8. iPhone'unuzun kilidini açın ve kabloyla Mac'e bağlayın.
9. iPhone "Bu Bilgisayara Güvenilsin mi?" (Trust This Computer?) derse **Güven**'e dokunun, parolanızı girin.
10. Xcode'un üst çubuğunda şemanın sağındaki kutuya tıklayın ve iPhone'unuzu seçin. Altında "Preparing" ya da "Copying shared cache symbols" yazıyorsa bitmesini bekleyin; birkaç dakika sürebilir.
11. ▶︎ (**Run**) düğmesine basın.
12. Xcode "Developer Mode disabled" gibi bir hata verirse iPhone'da:
    1. **Ayarlar → Gizlilik ve Güvenlik**'e girin.
    2. En alttaki **Geliştirici Modu**'nu açın.
    3. **Yeniden Başlat**'a dokunun.
    4. Telefon açılınca çıkan pencerede **Aç**'a dokunup parolanızı girin.
    5. Xcode'da yeniden ▶︎ basın.
13. Ücretsiz hesapta uygulama yüklenir ama açılmayabilir. iPhone'da **Ayarlar → Genel → VPN ve Aygıt Yönetimi**'ne girin, altında **Apple Development: <e-postanız>**'a dokunun, **Güven**'e, sonra yine **Güven**'e dokunun. Xcode'da yeniden ▶︎ basın.
14. Uygulama açılır: koyu lacivert ekran, altta üç sekme (Çeviri, Geçmiş, Ayarlar).
15. AirPods'u takın. **Çeviri** sekmesinde düğmenin üstünde "… bağlı" yazısını görün.
16. **Dinlemeyi Başlat**'a dokunun.
17. Dil paketi indirme penceresi çıkarsa indirin. Konuşma tanıma ve mikrofon izni sorulunca **İzin Ver** deyin.
18. Ekranda **Dinliyorum…** ve sağ üstte **CANLI** görünür. İngilizce bir cümle söyleyin ya da dinletin; Türkçesi yazılır ve AirPods'tan okunur.
19. **Durdur**'a dokunun.
20. Bir sorun varsa **Ayarlar → Tanılama kaydı → Kopyala** ile kaydı alıp gönderin. Ayrıntılı deneme listesi: `docs/cihaz-testi.md` (U-0, U-1).

İlk açılışta Tanılama kopyasının ilk satırı `Canlı Çeviri 1.0 (1) · S01 tur 4` olmalıdır.

## 4. Aboneliği yerelde deneme (gerçek para gitmez)

Aşağıdaki ayar yalnız Xcode'dan çalıştırdığınızda geçerlidir.

1. Xcode'da **Product → Scheme → Edit Scheme…** deyin.
2. Soldan **Run**'ı, üstten **Options** sekmesini seçin.
3. **StoreKit Configuration** kutusundan `Abonelik.storekit`'i seçin. **Close** deyin.
4. ▶︎ ile uygulamayı yeniden çalıştırın.
5. Uygulamada alttan **Ayarlar** sekmesine, sonra **Abonelik** satırına ("Ücretsiz: günde 10 dakika") dokunun.
6. "Sınırsız çeviri" sayfasında **₺49,99 / hafta** yazısını görün. Yazmıyorsa bölüm 5'teki "Fiyat yüklenemedi" satırına bakın.
7. **Abone ol**'a dokunun. Apple'ın onay penceresi çıkar (üstünde **Environment: Xcode** gibi bir not olur; buna benzer). Onaylayın.
8. Sayfada **Aboneliğiniz etkin.** yazar.

Satın almayı Xcode'dan yönetmek (Xcode'da uygulama çalışırken):

1. Üst menüden **Debug → StoreKit → Manage Transactions…** deyin. (Xcode sürümüne göre adı değişebilir.)
2. Açılan listede satın alma görünür. Birine tıklayıp araç çubuğundan ya da sağ tuş menüsünden şunları seçin (adları buna benzer):
   - **Delete** (sil): satın alma yokmuş gibi olur; uygulama ücretsiz kipe döner.
   - **Refund** (iade): aboneliği geri alır.
   - **Expire Subscription** (süreyi bitir): iptal edilip süresi dolmuş gibi olur.
3. Uygulamaya dönün; durum birkaç saniye içinde güncellenir. Güncellenmezse sayfada **Satın alımları geri yükle**'ye dokunun.

**Günlük 10 dakikalık sayacı sıfırlamak**

- En sağlam yol: iPhone'da uygulama simgesine uzun basın → **Uygulamayı Kaldır → Uygulamayı Sil**. Xcode'dan yeniden ▶︎ basın. Sayaç ve Alania anahtarı da silinir.
- Beklemek istemezseniz: `-ekran sinir-doldu` ile "süre doldu" ekranını hemen görürsünüz (bölüm 6); o kipte satın alma çalışmaz.
- Sayaç yerel takvim gününe bağlıdır; ertesi gün kendiliğinden sıfırlanır.

## 5. Sık çıkan hatalar

Xcode metinleri sürüme göre biraz değişir; "buna benzer" yazanlar bellekten yazıldı.

| Gördüğünüz (İngilizce) | Anlamı | Çözüm |
| --- | --- | --- |
| **Signing for "CanliCeviri" requires a development team. Select a development team in the Signing & Capabilities editor.** | Team seçilmemiş (projede boş). | **Signing & Capabilities** → **Team** → hesabınızı seçin. Hesap yoksa **Add an Account…** |
| **No Account for Team** / **Add a new account in Accounts settings** (buna benzer) | Xcode hesabınızı unutmuş ya da oturum düşmüş. | **Xcode → Settings… → Accounts** → hesabı yeniden ekleyin. |
| **Failed Registering Bundle Identifier: The app identifier "com.yilmazfatih.canliceviri" cannot be registered to your development team because it is not available. Change your bundle identifier to a unique string to try again.** | Bu paket kimliğini başka bir Apple hesabı almış. | **Bundle Identifier**'ı `com.<adınız>.canliceviri` yapın. App Store'a göndereceğiniz kimlikle aynı olmalı. |
| **Your team has no devices from which to generate a provisioning profile. Connect a device to use for development.** (buna benzer) | Xcode telefonu görmüyor. | Kabloyu kontrol edin, telefonun kilidini açın, **Güven** deyin; üst çubuktan iPhone'u seçin. |
| iPhone yerine **Offline** / **Unavailable** / **iPhone is locked** | Telefon bağlı değil ya da kilitli. | Kilidi açın, kabloyu çıkarıp takın. **Window → Devices and Simulators** ile durumuna bakın. |
| **Developer Mode disabled. To use "iPhone" for development, enable Developer Mode in Settings → Privacy & Security.** | Geliştirici Modu kapalı. | Bölüm 3, adım 12. Seçenek yoksa önce bir kez ▶︎ basın; Xcode ilk denemeden sonra seçeneği telefona getirir. |
| iPhone'da **Untrusted Developer** (**Your device management settings do not allow apps from developer "Apple Development: …" on this iPhone**); Xcode'da **Verify the Developer App certificate for your account is trusted on your device** (buna benzer) | Telefon sizin hesabınıza güvenmiyor. | Bölüm 3, adım 13: **Ayarlar → Genel → VPN ve Aygıt Yönetimi** → hesabınıza **Güven**. |
| **iPhone … doesn't match CanliCeviri's deployment target iOS 18.0** ya da hedef listede gri (**Ineligible**) (buna benzer) | iPhone'un iOS'u 18'den düşük. | **Ayarlar → Genel → Yazılım Güncelleme**. Güncellenemeyen telefonda uygulama çalışmaz. |
| Uygulamada **Fiyat yüklenemedi. İnternet bağlantınızı denetleyip yeniden deneyin.** | Ürün bulunamadı. Yerelde: StoreKit Configuration seçili değil. Mağazada: ürün App Store Connect'te henüz yok ya da kimliği farklı. | Yerelde bölüm 4, adım 1 ve 3. Mağazada `canliceviri.sinirsiz.haftalik` kimliğini ve internetinizi kontrol edin. **Yeniden dene**'ye dokunun. Tanılama'da `abonelik  ürün yüklenemedi …` satırı nedenini söyler. |
| Uygulama 7 gün sonra açılmıyor ya da açılır açılmaz kapanıyor | Ücretsiz hesap imzası 7 günde biter. | iPhone'u bağlayıp Xcode'da yeniden ▶︎. Veriler silinmez. |
| Mac'te **Please reinstall the app** ya da yükleme sırasında hata (buna benzer) | Eski kurulum takılmış. | Telefonda uygulamayı silin, Xcode'da **Product → Clean Build Folder**, sonra ▶︎. |

## 6. Simülatörde neler çalışmaz, `-ekran` ile ekranlara bakmak

Simülatörde **mikrofon, konuşma tanıma ve çeviri çalışmaz.** Çeviriyi ve AirPods'u yalnız gerçek iPhone'da denersiniz. Simülatör yalnız ekranların görüntüsünü görmek içindir.

Ekranlara bakmak için (yalnız hata ayıklama derlemesinde, yani Xcode ▶︎ ile; mikrofon, çeviri ve ses açılmaz):

1. **Product → Scheme → Edit Scheme… → Run → Arguments**.
2. **Arguments Passed On Launch** altındaki **+**'ya dokunun.
3. Şunlardan birini yazın: `-ekran abonelik`
4. ▶︎ ile çalıştırın.
5. Gerçek denemeye dönerken satırın solundaki kutunun işaretini kaldırın ya da satırı silin; yoksa uygulama hep örnek ekranla açılır.

| Argüman | Gösterdiği ekran |
| --- | --- |
| `-ekran ceviri-bos` | Çeviri sekmesi, henüz çeviri yok |
| `-ekran ceviri` | Çeviri sekmesi, örnek çeviriler |
| `-ekran dinliyor` | Dinliyor durumu ("Excuse me, where is the…") |
| `-ekran kulakliksiz` | Kulaklık bağlı değil uyarısı |
| `-ekran gecmis` | Geçmiş sekmesi, örnek satırlar |
| `-ekran gecmis-bos` | Geçmiş sekmesi, boş |
| `-ekran ayarlar` | Ayarlar sekmesi |
| `-ekran tanilama` | Tanılama kaydı sayfası |
| `-ekran abonelik` | Abonelik sayfası (örnek fiyat ₺49,99) |
| `-ekran sinir-doldu` | "Bugünkü 10 dakikalık ücretsiz süre doldu…" açıklaması ve abonelik sayfası |

Kod içinde de bakabilirsiniz: Xcode'da `CanliCeviri/Arayuz/Onizleme.swift` dosyasını açın, **Editor → Canvas** deyin (kısayol ⌥⌘↩).
