# S01 — Ses uzmanı incelemesi, tur 1

**Bulgular: 3 Engel · 12 Önemli · 12 Öneri**

İncelenen: `CanliCeviri/Hat.swift` (302 satır), `CanliCeviri/Durum.swift` (66), `CanliCeviri/Arayuz/KokEkran.swift`
(`.translationTask` bağlantısı, 24–56), `web/app.js` (dinleme 197–367, çeviri 371–388, seslendirme 445–573, arka plan
575–603). Ölçüt: `docs/ses-hatti.md` (bu turda yazıldı; kural kimlikleri oradan) ve sekiz ilke. Satır numaraları
incelenen sürüme göredir. Bağlam için `CeviriEkrani.swift` ve `Sabitler.swift` de okundu.

Apple belgelerinin JSON sürümüne bu ortamdan erişilebildi; "(Apple belgesi)" diye anılanlar oradan okundu. "Emin
değilim" dediğim her şey `docs/ses-hatti.md` § 7'de cihaz sorusu olarak durur; o maddelerdeki **davranış** değişiklikleri
cihaz testinden önce yapılmamalı, yalnız savunma amaçlı denetimler (sessiz başarısızlığı görünür kılanlar) yapılmalı.

---

## Engel

### E1 — Durdur'dan sonra eski çeviri görevi geçersiz oturumla `translate` çağırabilir (çökme) ve mikrofonu açabilir

**Yer:** `Durum.swift:24-35`, `Durum.swift:38-57`; `KokEkran.swift:53-55`

İki ayrı yol:

1. **Akışta bekleyen cümleler.** `hat.durdur()` (`Hat.swift:108`) cümle akışını `finish()` ile kapatır.
   `AsyncThrowingStream.finish()` sonrasında yineleyici **tamponda bekleyen öğeleri yine verir**, sonra biter. Kişi hızlı
   konuşurken önceki cümlenin çevirisi beklenirken yeni cümle akışa girer; o anda Durdur'a basılırsa `for try await`
   döngüsü (`Durum.swift:52`) bekleyen cümleyi alır ve `oturum.translate(cumle)` (`:53`) çağrılır. Bu sırada `ayar = nil`
   yapılmıştır. Apple belgesi (`translationTask(_:action:)`): yapılandırma değiştikten sonra `TranslationSession`
   kullanılırsa sistem `fatalError` verir. Görev iptal edilmişse `translate`'in önce iptali mi denetleyip fırlatacağı
   yoksa çökeceği belirsiz; `Task.checkCancellation()` çağrısı (`:54`) `translate`'ten **sonra** geldiği için koruma vermez.
2. **Hazırlık sırasında Durdur.** `ayar = nil`'in çalışan `translationTask` görevini iptal ettiği Apple belgesinde
   yazmıyor (belge yalnız "yapılandırma nil değilken ve değişince çalışır" diyor; D1). İptal etmiyorsa: dil paketi ya da
   izin beklenirken Durdur'a basılır, `Task.checkCancellation()` (`:47`) geçer, `hat.baslat` (`:48`) mikrofonu açar.
   Ekranda "Dinlemeyi Başlat" yazarken mikrofon açıktır ve arkasından gelen ilk cümle 1. yoldaki çökmeye gider.

**Düzeltme:** Görev iptaline ek olarak oturum kimliği (şartname D-1) ve her `translate`'ten **önce** denetim:

```swift
@ObservationIgnored private var kimlik = 0

func dugmeyeBasildi(dil: Dil) {
    kimlik += 1                                   // hem Başlat hem Durdur eski işi geçersiz kılar
    if calisiyor { hat.durdur(); ayar = nil }
    else { hata = nil; self.dil = dil
           ayar = .init(source: .init(identifier: dil.kod), target: .init(identifier: "tr")) }
}

func calistir(_ oturum: TranslationSession) async {
    let benim = kimlik
    func gecerli() -> Bool { benim == kimlik && !Task.isCancelled }
    do {
        try await oturum.prepareTranslation()
        guard gecerli() else { return }
        guard await Hat.izinAl() else { if gecerli() { hata = "…"; ayar = nil }; return }
        guard gecerli() else { return }
        let cumleler = try hat.baslat(konusmaDili: dil.konusma)
        for try await cumle in cumleler {
            guard gecerli() else { break }        // translate'ten ÖNCE
            let sonuc = try await oturum.translate(cumle)
            guard gecerli() else { break }
            satirlar.append(Satir(asil: cumle, ceviri: sonuc.targetText))
            hat.seslendir(sonuc.targetText)
        }
    } catch {
        guard gecerli(), !(error is CancellationError) else { return }
        …
    }
}
```

### E2 — Tanıma hemen hata verip bitiyorsa sonsuz ve sessiz bir yeniden açma döngüsü; ekranda "Dinliyorum"

**Yer:** `Hat.swift:191-209`, `Hat.swift:224-236`

Görev hata ile biterse geri çağrı `metin = nil, bitti = true` ile gelir. `canliMetin` boşsa `:197` atlanır, `:204`'te
1,2 sn'lik sayaç kurulur, sayaç `cumleyiKapat()` → `tanimayiBaslat()` çağırır, yeni görev yine hemen hata verir… Hata
kodu hiçbir yere taşınmaz (`gorevAc` hatayı yalnız `Bool`'a çevirir, `:230`). Cihazda bunun olası nedenleri: cihazda
tanıma modeli inmemiş, Siri ve Dikte kapalı, tanıma hizmeti çökmüş (D4, D5). Sonuç: ekranda CANLI ve "Dinliyorum…"
yazarken uygulama hiçbir şey duymaz — ilke 5'in "en ağır hata" dediği durum. Web sürümü bunu `bosBitis` ile önlüyor
(`app.js:287-296`); iPhone'da karşılığı yok.

**Düzeltme (şartname T3):** Hatayı geri çağrıya taşı, art arda boş bitişleri say, 5'te akışı hatayla bitir:

```swift
// gorevAc: (String?, Bool, NSError?) olarak geçir
let hataNS = hata as NSError?
DispatchQueue.main.async { MainActor.assumeIsolated { olay(metin, bitti, hataNS) } }

// tanimayiBaslat içinde
let acilis = Date.now
gorev = Hat.gorevAc(taniyici, istek) { [weak self] metin, bitti, hata in
    guard let self, buTur == self.tur else { return }
    if let metin, metin != self.canliMetin { self.canliMetin = metin; self.bosBitis = 0; /* sayaç kur */ }
    guard bitti else { return }
    if self.canliMetin.isEmpty, Date.now.timeIntervalSince(acilis) < 2 {
        self.bosBitis += 1
        if self.bosBitis >= 5 {
            let kod = hata.map { "\($0.domain)/\($0.code)" } ?? "?"
            self.cumleEkle?.finish(throwing: HatHatasi(
                mesaj: "Konuşma tanıma çalışmıyor (\(kod)). Dinlemeyi yeniden başlatın."))
            self.cumleEkle = nil
            return
        }
    }
    self.cumleyiKapat()       // metin varsa gönderir, yoksa hemen yeni görev açar
}
```

### E3 — Mikrofon bağlantısı kurulamazsa sessizce dönülüyor; yeniden bağlanmada sıra yanlış

**Yer:** `Hat.swift:213-219` (özellikle `:216`), `Hat.swift:157-170`

`mikrofonuBagla` biçim geçersizse (`sampleRate == 0`) **hiçbir şey söylemeden** döner. Motor bağlantısız başlar, tanıma
görevine ses gitmez, ekran "Dinliyorum" der. `baslat` bu durumu `:77-80`'de önceden yakalıyor; ama `yenidenBaglan` ve
her cümle sonundaki `tanimayiBaslat` yakalamıyor. Ayrıca `yenidenBaglan` sırası yanlış: `cumleyiKapat()` (`:160`) →
`tanimayiBaslat()` → `mikrofonuBagla` biçimi **`setActive(true)`'dan önce** (`:162`) okur. Kesinti bittiğinde oturum
henüz etkin değilken giriş biçiminin 0 Hz ya da eski değer döndürmesi olasıdır (emin değilim, D8/D11); hangisi olursa
olsun sonuç ya sessiz sağırlık (0 Hz) ya da eski biçimle bağlantıdır (Apple belgesi: yapılandırma değişince düğümler eski
biçimle bağlı kalır, uygulama yeniden kurmalıdır).

**Düzeltme (şartname Y1, Y2):** `mikrofonuBagla` fırlatsın; `yenidenBaglan` önce oturumu açsın, sonra bağlasın:

```swift
private nonisolated static func mikrofonuBagla(_ giris: AVAudioInputNode,
                                               _ istek: SFSpeechAudioBufferRecognitionRequest) throws {
    let bicim = giris.outputFormat(forBus: 0)
    guard bicim.sampleRate > 0, bicim.channelCount > 0 else {
        throw HatHatasi(mesaj: "Mikrofon şu an kullanılamıyor.")
    }
    giris.removeTap(onBus: 0)
    giris.installTap(onBus: 0, bufferSize: 1024, format: bicim) { tampon, _ in istek.append(tampon) }
}

private func yenidenBaglan() {
    guard cumleEkle != nil else { return }
    duraklamaGorevi?.cancel()
    yarimCumleyiGonder()                 // tanımayı kapatır, YENİSİNİ AÇMAZ
    motor.stop()
    do {
        try AVAudioSession.sharedInstance().setActive(true)
        try tanimayiBaslat()             // bağlantıyı yeni biçimle kurar, fırlatabilir
        motor.prepare(); try motor.start()
    } catch {
        cumleEkle?.finish(throwing: HatHatasi(mesaj: "Mikrofon yeniden açılamadı. Dinlemeyi yeniden başlatın."))
        cumleEkle = nil
    }
}
```

İsteğe bağlı ama önerilen: bağlantıyı her cümlede söküp kurmak yerine bir kez kurmak ve tamponu kilitli bir kutudaki
"etkin istek"e yönlendirmek (şartname C2). Hem cümle arasındaki kısa boşluk kapanır hem bu hata yolu tek yere iner.

---

## Önemli

### Ö-1 (Önemli) — Kesinti başladığında hiçbir şey yapılmıyor; bitiş bildirimi gelmezse ekran "Dinliyorum" der

**Yer:** `Hat.swift:142-147`

Yalnız `.ended` işleniyor; `.began` yok sayılıyor. Kesinti boyunca ekran CANLI ve "Dinliyorum…" gösterir, yarım cümle
ekranda asılı kalır, çalan ses kesilmez. Apple'ın kesinti belgesi, sistemin bitiş olayını teslim edemeyebileceğini açıkça
yazıyor. Ayrıca `.ended` gelince `shouldResume` seçeneğine bakılmıyor. Arka plandan dönüşte gecikmeli gelen `.began`
(neden `appWasSuspended`, Apple belgesi) yeni eklenecek işlemede yok sayılmalı.
**Düzeltme:** Şartname G11/G12 ve K4–K7: `.began` → KESİNTİDE (yarım cümle gönder, tanımayı iptal et, motoru durdur,
sesi kes, `Durum`'a "Duraklatıldı: …" bildir); `.ended` → G12; `AVAudioSessionInterruptionReasonKey == .appWasSuspended`
ya da `wasSuspendedKey` ise `.began`'i yok say.

### Ö-2 (Önemli) — Medya servisleri sıfırlanması işlenmiyor; motor yeniden kurulamıyor

**Yer:** `Hat.swift:21-22` (`let motor`, `let yedekSes`), gözlemci yok
Apple belgesi: sıfırlamadan sonra ses nesneleri yeniden kurulmalı, kayıt kullanıcı başlatmadan sürdürülmemeli. Bugün
eski `AVAudioEngine` ile devam edilir ve ekran "Dinliyorum" kalır.
**Düzeltme:** `motor` ve `yedekSes`'i `var` yap; `mediaServicesWereResetNotification` (ana iş parçacığında gelir, Apple
belgesi) gelince `durdur()` + yeni nesneler + `hata = "Ses sistemi yeniden başladı. Dinlemeyi yeniden başlatın."` (K13).

### Ö-3 (Önemli) — Mikrofondan ses gelip gelmediğini denetleyen bir bekçi yok

**Yer:** `Hat.swift:157-158`, `Hat.swift:217-219`
Kurtarma tümüyle bildirimlere ve `motor.isRunning`'e dayanıyor. Bildirim gelmezse ya da `isRunning` yanlış `true`
kalırsa (emin değilim, D11) sağırlık hiç fark edilmez. **Düzeltme (C6, K15):**

```swift
final class SonTampon: @unchecked Sendable {
    private let kilit = NSLock(); private var t = Date.distantPast
    func dokun() { kilit.lock(); t = .now; kilit.unlock() }
    var gecen: TimeInterval { kilit.lock(); defer { kilit.unlock() }; return Date.now.timeIntervalSince(t) }
}
// tap içinde: sonTampon.dokun(); istek.append(tampon)
// DİNLİYOR'da 1 sn'lik ana aktör döngüsü: if sonTampon.gecen > 2 { yenidenBaglan(neden: .bekci) }
```

### Ö-4 (Önemli) — Arka plana geçişte dinleme açıkça duraklatılmıyor; dönüşte `isRunning`'e güveniliyor

**Yer:** `Hat.swift:148-152`, `Hat.swift:158`
Arka plan kipi yok (plan), yani uygulama askıya alınır; Apple belgesi böyle bir uygulamanın arka plana giderken ses
oturumunu kendisinin kapatmasını öneriyor. Bugün hiçbir şey yapılmıyor; dönüşte `!motor.isRunning` doğruysa kurtarılıyor,
değilse (motor "çalışıyor" görünür ama oturum sistemce kapatılmış) sağır kalınır.
**Düzeltme (K8, K9):** `didEnterBackgroundNotification` → G11 (neden arka plan) + `setActive(false)`; `didBecomeActive` →
dinleme oturumu KESİNTİDE ise **koşulsuz** G12. `willResignActive` (Kontrol Merkezi) yalnız Tanılama'ya yazılsın (K10).

### Ö-5 (Önemli) — Tercih edilen giriş verilmiyor; mikrofonlu kablolu kulaklıkta dinleyen kulaklık mikrofonu olur

**Yer:** `Hat.swift:71-74`
A2DP yalnız çıkıştır (Apple belgesi), bu yüzden AirPods'ta giriş iPhone'da kalır; ama mikrofonlu kablolu kulaklıkta
sistem girişi kulaklık mikrofonuna geçirir (D9) — ilke 2 ihlali, karşıdakinin sesi göğüs hizasındaki mikrofondan alınır.
**Düzeltme (Y1):**

```swift
try oturum.setActive(true)
if let dahili = oturum.availableInputs?.first(where: { $0.portType == .builtInMic }) {
    try? oturum.setPreferredInput(dahili)
}
```

Ardından `currentRoute.inputs.first?.portType` Tanılama'ya yazılsın; `.builtInMic` değilse sarı uyarı (Y6).

### Ö-6 (Önemli) — Cihazda tanıma yoksa ses sessizce Apple sunucusuna gidiyor

**Yer:** `Hat.swift:184-186`
`supportsOnDeviceRecognition` `false` ise `requiresOnDeviceRecognition` hiç konmuyor ve Apple belgesine göre istek ağ
gerektirir: konuşma telefondan çıkar (ilke 3), ekranda hiçbir şey söylenmez, sunucu tanımasının süre sınırı devreye girer.
**Düzeltme (T1):** `baslat` içinde, `supportsOnDeviceRecognition` `false` ise Türkçe hata fırlat; her durumda
`tanıma açıldı  <bölge> cihazda|sunucuda` Tanılama'ya yazılsın. Hangi dillerde bunun olacağı cihazda görülecek (D4).

### Ö-7 (Önemli) — Apple sesi beklenmiyor; Alania sesiyle üst üste biniyor

**Yer:** `Hat.swift:257-259`, `Hat.swift:271`, `Hat.swift:276-280`
`appleIleOku` `speak` çağırıp hemen döner; döngü sonraki öğeye geçer. Apple sesleri sentezleyicinin kendi sırasında
birbirini bekler, ama karışık durumda (cümle 1 Alania hatası → Apple sesi; cümle 2 Alania başarılı) Alania sesi Apple
sesinin üstüne çalar. Şartname S2 ihlali; mimari özetindeki "sesler üst üste binmez" sözü tutmuyor.
**Düzeltme:** Apple sesini bitişine kadar bekle:

```swift
final class SozBekleyici: NSObject, AVSpeechSynthesizerDelegate {
    private var devam: CheckedContinuation<Void, Never>?
    func bekle(_ s: AVSpeechSynthesizer, _ soz: AVSpeechUtterance) async {
        await withCheckedContinuation { devam = $0; s.speak(soz) }
    }
    private func bitir() { devam?.resume(); devam = nil }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish _: AVSpeechUtterance) { bitir() }
    func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel _: AVSpeechUtterance) { bitir() }
}
```

(Temsilci geri çağrılarının hangi iş parçacığında geldiğinden emin değilim; `devam`'a erişim ana aktöre taşınmalı ya da
kilitlenmeli. Swift 5 kipinde uyarısız derlendiği Mac'te doğrulanmalı.)

### Ö-8 (Önemli) — Alania: 15 sn bekleme sırayı tıkıyor, Durdur isteği iptal etmiyor, yedeğe düşüş ekranda görünmüyor

**Yer:** `Hat.swift:256`, `Hat.swift:261-272`, `Hat.swift:287`, `Hat.swift:296-299`
- `timeoutInterval = 15` boşta kalma süresidir, toplam süre değil; ağ yokken her cümle 15 sn bekleyip sonra Apple sesine
  düşer, sonraki cümleler arkasında birikir (ilke 4). Devre kesici yok.
- Durdur uçuştaki `URLSession` isteğini iptal etmez; döngü 15 sn'ye kadar o istekte takılı kalır ve **yeni oturumun ilk
  cümlesi bunu bekler**.
- Yedeğe düşüş ekranda söylenmiyor (ilke 5), HTTP kodu kaybediliyor (`URLError(.badServerResponse)`), Tanılama'ya
  hiçbir şey yazılamıyor.
- Anahtar `UserDefaults`'tan okunuyor (`:256`); K5 gereği `Anahtarlik.alaniaAnahtari` olmalı.
**Düzeltme (S4–S6):** Her öğeyi iptal edilebilir bir alt `Task` içinde çalıştır, referansını tut, `durdur()` iptal etsin;
toplam 5 sn sınırını `withThrowingTaskGroup` ile (istek + `Task.sleep(for: .seconds(5))`) uygula; HTTP kodunu
`HatHatasi`'na taşı; 3 ardışık hatada oturum boyunca Apple sesi; yedeğe düşünce `Durum`'a not.

### Ö-9 (Önemli) — Tek bir çeviri hatası bütün dinleme oturumunu bitiriyor

**Yer:** `Durum.swift:52-63`
`oturum.translate` fırlatırsa `catch` dinlemeyi durdurur. İlke 4: "ağ hatası akışı durdurmaz"; bir cümlenin çevrilememesi
(ör. tanınamayan karışık metin) konuşmanın geri kalanını kaybettirmemeli. Web sürümü burada doğru davranıyor
(`app.js:376-381`). **Düzeltme:** Cümle başına `do/catch`; `CancellationError` dışındaki hatada Tanılama'ya `çeviri  hata
<kod>`, ekranda kısa not ("Bir cümle çevrilemedi"), döngü sürer. Yalnız ardışık 3 hata oturumu bitirsin.

### Ö-10 (Önemli) — Hazırlık sırasında ekranda CANLI ve "Dinliyorum…" görünüyor

**Yer:** `Durum.swift:22`, `CeviriEkrani.swift:35`, `CeviriEkrani.swift:83-86`
`calisiyor` = `ayar != nil`; yapılandırma atandığı anda (dil paketi inmeden, izin sorulmadan, mikrofon açılmadan) arayüz
"Dinliyorum…" der. İlk açılışta dil paketi indirmesi dakikalar sürebilir. Şartname D-0 ihlali.
**Düzeltme:** `Durum`'da açık bir `asama` (`duruyor / hazirlaniyor / dinliyor / kesintide`); `hat.baslat` başarıyla
dönünce `.dinliyor`. Arayüz CANLI ve "Dinliyorum"u yalnız `.dinliyor`'da gösterir; `.hazirlaniyor`'da "Hazırlanıyor…".
(Arayüz metinleri `arayuz-denetcisi` ile birlikte belirlenmeli.)

### Ö-11 (Önemli) — Hata metni sistemin `localizedDescription`'ı; Türkçe ve yol gösterici olmayabilir

**Yer:** `Durum.swift:61`
`setActive` (`insufficientPriority`, K5), `motor.start()`, `prepareTranslation` ve `translate` hataları uygulamanın
yerelleştirmesine göre İngilizce ya da teknik metinle görünebilir. "Bitti" tanımı: hata Türkçe ve ne yapılacağını söyler.
**Düzeltme:** `HatHatasi` dışındaki hataları bilinen alan/kodlara göre Türkçe metne eşle; bilinmeyende "Dinleme
durdu (<alan>/<kod>). Yeniden başlatın." ve aynı kod Tanılama'ya.

### Ö-12 (Önemli, web) — Tek `askida` işareti iki nedeni karıştırıyor: gizli sekmede tanıma açılıyor

**Yer:** `app.js:204`, `app.js:356-367`, `app.js:453-454`, `app.js:470-472`, `app.js:595-603`
"Okurken beklet" açıkken okuma sürerken sekme gizlenirse: `dinlemeyiBeklet()` (zaten askıda), okuma bitince `finally`
→ `dinlemeyiSurdur(no)` → `askida = false` ve **sekme gizliyken** tanıma açılır; tarayıcı bunu reddedip hemen bitirirse
`onend` yeniden açar, `bosBitis` 6'ya varır ve kullanıcı dönünce "Konuşma tanıma başlatılamadı" hatasıyla durmuş oturum
bulur. Tersi: sekme okuma sürerken görünür olursa `visibilitychange` tanımayı açar ve "okurken beklet" bozulur.
**Düzeltme (şartname § 6):**

```js
const askiNedeni = { okuma: false, gizli: false }
const askida = () => askiNedeni.okuma || askiNedeni.gizli
function dinlemeyiBeklet(neden) { askiNedeni[neden] = true; clearTimeout(duraklamaSayaci); cumleyiGonder(); tanimayiKapat() }
function dinlemeyiSurdur(neden, no) {
  askiNedeni[neden] = false
  if (!askida() && d.calisiyor && no === oturumNo && !taniyici) tanimayiBaslat()
}
// onend ve setTimeout içindeki `askida` okumaları askida() olur; baslat/durdur iki işareti de sıfırlar.
```

---

## Öneri

- **Ön-1** — `Hat.swift:193-208`, `app.js:267-271`: Duraklama sayacı her geri çağrıda sıfırlanıyor; tanıyıcı sessizlikte
  aynı metni (ör. noktalama düzeltmesiyle) yinelerse cümle geç kapanır (D5). Sayacı yalnız metin değişince sıfırla
  (`if metin != canliMetin`), şartname C1.
- **Ön-2** — `Hat.swift:122-125`: `.bluetoothHFP` "kulaklık bağlı" sayılıyor; bu ilke 2 ihlalinin belirtisi, uyarıyla
  gösterilmeli. `.builtInSpeaker` / `.airPlay` / `.carAudio` için uyarı yok (Y4 tablosu). Tanılama eklenirken `portName`
  değil `portType` yazılmalı.
- **Ön-3** — `Hat.swift:115`: `setActive(false)` hatası `try?` ile yutuluyor. Apple belgesine göre `isBusy` dönse de oturum
  etkisizleşir, yani davranış doğru; ama hata Tanılama'ya yazılmalı (diğer uygulamaların sesi geri gelmezse nedeni görünsün).
- **Ön-4** — `Hat.swift:267-269`: Alania sesinin bitişi 50 ms'lik yoklamayla bekleniyor. `AVAudioPlayerDelegate`
  (`audioPlayerDidFinishPlaying`) ile süreklilik ve pil daha iyi; Ö-8 düzeltmesiyle birlikte yapılabilir.
- **Ön-5** — `KokEkran.swift:29-31`: `State(initialValue: durum ?? Durum())` her `KokEkran` oluşturuluşunda yeni bir `Durum`
  ve `Hat` (ve `AVAudioEngine`) üretir; yalnız ilki kullanılır. `Hat.init` (`Hat.swift:43-50`) gözlemci ekliyor, `deinit`
  yok; atılan örneklerin gözlemcileri kalır (`[weak self]` sayesinde zararsız ama sızıntı). Kök görünüm nadiren yeniden
  oluşur; yine de `Durum`'u `CeviriApp`'te bir kez oluşturup aşağı geçirmek ve `Hat`'e `deinit`'te gözlemci kaldırma eklemek önerilir.
- **Ön-6** — `Hat.swift:278`: `AVSpeechSynthesisVoice(language: "tr-TR")` `nil` dönerse fark edilmiyor (S7, D13).
- **Ön-7** — `Hat.swift` (genel): Kulaklık yokken Türkçe ses ahizeden okunurken tanıma açık; mikrofonun bunu duyup sahte
  cümle üretmesi olası (D7). Cihazda gözlenirse web'deki "okurken beklet" seçeneği iPhone'a da eklenmeli (S8).
- **Ön-8** — `Hat.swift:63`, `Hat.swift:175-186`: `SFSpeechRecognizerDelegate.availabilityDidChange` izlenmiyor (T4).
  Uzun vadede iOS 26'daki `SpeechAnalyzer`/`SpeechTranscriber` uzun konuşma için değerlendirilebilir; uygunluğundan emin
  değilim, ROADMAP'e not.
- **Ön-9** — `app.js:328-342`: Cümle kapanınca yeni tanıma ancak `abort()` → `end` → 150 ms sonra açılıyor; bu boşlukta
  söylenen kelimeler (bir sonraki cümlenin başı) kaybolabilir (D15). Cihazda ölçülmeden değiştirilmemeli.
- **Ön-10** — `app.js:339-341`: Sigorta `t.onend()`'i elle çağırınca eski tanıma hâlâ canlıysa ikinci bir tanıma açılır;
  Safari ikinciyi `InvalidStateError` ile reddederse `bosBitis` gereksiz artar. Sigortadan önce `t.abort()` yeniden denenip
  `t.onend = null` yapılabilir.
- **Ön-11** — `app.js:231-247`, `app.js:475-499`: Durdur `speechSynthesis.cancel()` çağırıyor ama bekleyen `cihazSesiyleOku`
  sözü yalnız tarayıcı `end/error` verirse çözülüyor; vermezse sigorta (4 sn + metin×120 ms) dolana kadar yeni oturumun ilk
  sesi bekler. Bekleyen sözün `bitti` işlevini saklayıp `durdur`'da çağırın. Ayrıca Alania zaman aşımı 15 sn (`app.js:510`)
  ve "Alania'ya ulaşılamadı" notu (`app.js:464`) başarılı bir Alania sesinden sonra temizlenmiyor.
- **Ön-12** — `app.js:577-583`: `wakeLock.request` beklenirken Durdur'a basılırsa kilit `ekraniBirak`'tan sonra atanır ve
  serbest kalmaz. `const k = await …; if (!d.calisiyor) k.release(); else ekranKilidi = k`.

---

## Sorun yok dediğim alanlar (neye bakarak)

- **İptal edilen tanıma görevinden geç sonuç (iPhone):** `tur` hem `tanimayiBaslat`'ta (`Hat.swift:177`) hem `durdur`'da
  (`:100`) artıyor; geri çağrı ana kuyruğa taşınıp `buTur == self.tur` ile süzülüyor (`:192`). Durdur–Başlat ve cümle
  geçişlerinde eski sonuç `canliMetin`'e yazılamıyor.
- **Ana aktör:** Tanıma geri çağrısı `DispatchQueue.main.async` + `assumeIsolated` ile (`:232-234`), gözlemciler
  `queue: .main` ile, sayaç `Task`'ı ana aktör kapanışından doğduğu için ana aktörde. Arayüz durumu ana aktör dışında
  değişmiyor. Mikrofon geri çağrısı yalnız `istek.append` yapıyor.
- **Mikrofon bağlantısının biçimi:** `inputNode.outputFormat(forBus: 0)` ile kuruluyor (donanım biçimi) — doğru.
- **Kategori ve seçenekler:** `.playAndRecord` + yalnız `.allowBluetoothA2DP`; HFP seçeneği yok, `.defaultToSpeaker` yok.
  Apple belgesindeki A2DP/HFP önceliği kuralıyla ilke 2'ye uygun (cihazda doğrulanacak: D2).
- **Apple sesi ses oturumu:** `usesApplicationAudioSession` varsayılanı değiştirilmemiş; Apple sesi uygulamanın yolunu izler (Y3).
- **Durdur'da kaynak kapanışı:** gözlemciler, bağlantı, motor, akış, oynatıcı, Apple sesi, ekran kilidi engeli,
  `setActive(false, .notifyOthersOnDeactivation)` hepsi kapanıyor (`Hat.swift:98-116`). Eksikler yalnız Ö-8'deki uçuştaki
  Alania isteği ve Ö-3'teki (henüz olmayan) bekçi.
- **`baslat` yarıda kalırsa:** `setActive`, biçim ya da `motor.start()` hatasında `Durum.calistir`'in `catch`'i
  `hat.durdur()` çağırıyor; açık kalan oturum ya da bağlantı yok.
- **Seslendirme sırası ve oturum (Alania yolu):** öğe `(oturumNo, metin)` taşıyor; sıradan alınırken (`:255`) ve Alania
  yanıtından sonra (`:263`) denetleniyor; Durdur'dan sonra eski sesler çalmıyor.
- **Web, geç sonuç ve Durdur–Başlat:** `onresult` `t !== taniyici || t.kapali` ile, `onerror`/`onend` `t !== taniyici` ile
  süzülüyor; `cevirVeOku` ve `oku` `oturumNo`'yu `await` öncesi ve sonrası denetliyor; Alania çalarken Durdur `pause` →
  `onpause` ya da `play()` reddi ile temiz çıkıyor (`app.js:516-525`).
- **Web, kendiliğinden biten tanıma:** `onend` yarım cümleyi gönderiyor (`app.js:284`) ve art arda boş bitişleri sayıp 6'da
  Türkçe nedenle duruyor (`:287-296`) — iPhone'da eksik olan (E2) davranış burada var.
- **Web, çeviri hatası:** dinlemeyi durdurmuyor, ekranda gösteriyor, sonraki başarılı çeviride temizleniyor (`app.js:376-385`).

## Cihaz testine aktarılacaklar

`docs/ses-hatti.md` § 7'deki D1–D18. Bu incelemedeki "emin değilim" notları: E1 (D1), E3 (D8, D11), Ö-3 (D11),
Ö-5 (D9), Ö-6 (D4), Ö-7 (temsilci iş parçacığı — Mac derlemesi), Ön-1 (D5), Ön-7 (D7), Ön-9 (D15).
