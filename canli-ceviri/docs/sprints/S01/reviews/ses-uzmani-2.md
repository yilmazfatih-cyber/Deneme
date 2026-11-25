# S01 — Ses uzmanı incelemesi, tur 2

**1. tur bulguları (27): 22 kapandı · 2 kısmen · 0 açık · 3 karar gereği yapılmadı**
**Yeni bulgular: 1 Engel · 5 Önemli · 12 Öneri**

İncelenen (baştan sona, satır satır): `CanliCeviri/Hat.swift` (904 satır), `Durum.swift` (230), `Tanilama.swift` (152),
`Anahtarlik.swift` (66), `Sabitler.swift` (62), `web/app.js` (1145). Bağlam için okunup **incelenmeyen**:
`Arayuz/KokEkran.swift`, `Arayuz/AyarlarEkrani.swift` (B adımı sırada). Ölçüt: `docs/ses-hatti.md` (bu turda KR1–KR12'ye
göre güncellendi; değişen kurallar belgenin başında listeli) ve sekiz ilke. Satır numaraları incelenen sürüme göredir;
Mac derlemesindeki düzeltmeler bunları kaydırabilir.

Bu turda Apple belgelerine yeniden bakılmadı; "Apple belgesi" diye anılanlar 1. turda okunanlardır. Kod hiçbir yerde
çalıştırılmadı; aşağıdakiler kod okumasıdır (ilke 8). "Emin değilim" dediklerim `docs/ses-hatti.md` § 7'ye D19–D25 olarak
eklendi.

---

## 1. Tur 1 bulgularının durumu

| No    | Durum | Kanıt / eksik |
| ----- | ----- | ------------- |
| E1    | kapandı | `Durum.swift:71` kimlik her dokunuşta +1; `:115`, `:120` her `await` sonrası, `:144` `translate`'ten **önce**, `:148`, `:156` sonra denetim. Hazırlıkta Durdur mikrofon açmaz (`:120` → `:132`'ye varılmaz). |
| E2    | kapandı | `Hat.swift:695-711` hata kodu geri çağrıya taşınıyor; `:674-691` 2 sn içinde sonuçsuz bitişler sayılıyor, 5'te (`Sabitler.swift:28`) Türkçe hatayla duruyor. |
| E3    | kapandı | `Hat.swift:600-605` geçersiz biçimde fırlatıyor; `:518-522` önce `setActive(true)`, sonra bağlantı; bağlantı tek kutu üzerinden (`:56-89`, `:648`) — C2. |
| Ö-1   | kapandı | `Hat.swift:462-475` `.began` → G11; `:466` `appWasSuspended` (ham 1) yok sayılıyor; `:476-484` `shouldResume` yalnız kaydediliyor (KR4). |
| Ö-2   | kapandı | `Hat.swift:223`, `:430-431`, `:552-564`: akış hatayla biter, motor ve sentezleyici yenilenir (`:185-186` artık `var`). |
| Ö-3   | **kısmen** | Bekçi var (`:56-89`, `:613-630`) ama "iki deneme başarısızsa G13" yok: alarm sınırsız tekrarlanır → **YE1**. |
| Ö-4   | kapandı | `Hat.swift:447-451` arka planda G11 + oturum kapanır; `:433-442` dönüşte koşulsuz G12; `:444-445` Kontrol Merkezi yalnız kayıt. |
| Ö-5   | kapandı | `Hat.swift:263`, `:521`, `:332-343` `setPreferredInput(builtInMic)` `setActive`'ten sonra; `:363` Y6 uyarısı. |
| Ö-6   | kapandı (KR2'ye göre) | `Hat.swift:271-273`: reddedilmiyor; kalıcı sarı not + `tanıma açıldı <bölge> sunucuda`. Çevrimdışı durumda ileti eksik → **YÖ-5**. |
| Ö-7   | kapandı | `Hat.swift:93-117` `SesBekleyici`; `:816-819` Apple sesi bitişe kadar bekleniyor. Bekleyicinin geri çağrıyı sahibine eşlememesi → **Ön-1** (yeni). |
| Ö-8   | kapandı | `Hat.swift:161-166` toplam 5 sn (`timeoutIntervalForResource`); `:757-764`, `:839` Durdur uçuştaki isteği iptal eder; `:848-861` 3 hatada kesici, 401/403'te hemen; `:864` HTTP kodu; `:767` anahtar `Anahtarlik`'tan. |
| Ö-9   | kapandı | `Durum.swift:146-164` cümle başına `do/catch`, art arda 3 hatada durur (`Sabitler.swift:34`). |
| Ö-10  | kapandı (mantık) | `Durum.swift:16-30` `Asama`, `:64` `calisiyor = asama != .duruyor` (KR3), `:89` hazırlanıyor, `:138` dinliyor. Arayüzün `asama`'yı okuması B adımında; orada yeniden bakılmalı. |
| Ö-11  | kapandı | `Durum.swift:218-229` Türkçe eşleme; `:112`, `:125`, `:161` sabit Türkçe metinler. Alan denetimi eksik → Ön-11. |
| Ö-12  | kapandı | `app.js:436-437`, `:652-666`; `:508`, `:562`, `:577` `askida()`. |
| Ön-1  | kapandı | `Hat.swift:654`; `app.js:527`. |
| Ön-2  | kapandı | `Hat.swift:313`, `:355-365`, `:367-380`; Tanılama'ya yalnız tür (`:324-329`). |
| Ön-3  | kapandı | `Hat.swift:570-575`. |
| Ön-4  | kapandı | `Hat.swift:115`, `:796-799` (`AVAudioPlayerDelegate` + sigorta). |
| Ön-5  | **kısmen** | `Hat.swift:119-135` gözlemciler `deinit`'te kalkıyor. `Durum`'un `CeviriApp`'te bir kez kurulması (`KokEkran.swift:29-31`) B adımında. |
| Ön-6  | kapandı | `Hat.swift:806-813`. |
| Ön-7  | karar gereği yapılmadı (KR1) | Cihaz sorusu D7; şartname S8 güncellendi (KR5/B-16 ile birlikte). |
| Ön-8  | karar gereği yapılmadı (KR1) | Birikime; şartname T4 işaretlendi. |
| Ön-9  | karar gereği yapılmadı (KR1) | Cihaz sorusu D15. |
| Ön-10 | kapandı | `app.js:622-636`. |
| Ön-11 | kapandı | `app.js:443`, `:498`, `:837-842`; `:26` 5 sn; `:788-791` başarılı sesten sonra not kalkıyor. |
| Ön-12 | kapandı | `app.js:970-985`. |

---

## 2. Yeni bulgular

### Engel

#### YE1 (Engel) — Bekçi alarmının üst sınırı yok; mikrofon sağırken ekran kesintisiz "Dinliyorum" der

**Yer:** `Hat.swift:626-630` (`bekciDenetle`), `:588-596` (`dinlemeyiAc` → `kutu.sifirla()`), `:507-527` (`surdur`)

Bekçinin var olma nedeni, `motor.start()` hata vermediği hâlde mikrofondan tampon gelmeyen durumdur (D11). Kodda tam bu
durumda:

1. 2 sn tampon yok → `kesintiyeGir(.bekci)` → aynı çağrıda `surdur()`.
2. `surdur` deneme 1'de `setActive` ve `start()` hata vermez → "başarılı" sayılır, `kutu.sifirla()` (`:594`) zamanı
   "şimdi"ye çeker, `kesinti = nil`, `bildir(.kesintiBitti)`.
3. 2 sn sonra yine tampon yok → 1'e dön. Sonsuza dek; C7'deki "iki denemede G13" hiç devreye girmez, çünkü yalnız
   **fırlatan** deneme sayılıyor (`:535`).

Daha kötüsü: `kesintiyeGir` ile `surdur` aynı ana aktör adımında çalıştığı için `asama` `.kesintide` → `.dinliyor`
arasında SwiftUI hiç çizim yapmaz; ekranda "Duraklatıldı" **hiç görünmez**, CANLI ve "Dinliyorum…" kesintisiz kalır.
Üstelik her turda `sesiKes()` (`:500`) çalan çeviriyi keser ve sırayı atar (bkz. YÖ-1). Sonuç ilke 5'in "en ağır hata"
dediği durumdur ve bekçinin tek amacı onu önlemekti. Şartname K15/C7 (tur 2'de netleştirildi).

**Düzeltme:** Gerçek tamponu "başlangıç payı"ndan ayır; bir alarmdan sonra tek tampon gelmeden ikinci alarm gelirse G13.

```swift
// MikrofonKutusu
private var gercekSon = Date.distantPast          // yalnız tampon() günceller
func tampon(_ t: AVAudioPCMBuffer) { kilit.lock(); son = Date(); gercekSon = son; let h = istek; kilit.unlock(); h?.append(t) }
func tamponGeldi(sonra an: Date) -> Bool { kilit.lock(); defer { kilit.unlock() }; return gercekSon > an }

// Hat
@ObservationIgnored private var bekciAlarmi: Date?     // baslat() ve durdur()'da nil

private func bekciDenetle() {
    guard cumleEkle != nil, kesinti == nil else { return }
    if let an = bekciAlarmi, kutu.tamponGeldi(sonra: an) { bekciAlarmi = nil }
    guard kutu.gecen > bekciSiniri else { return }
    if bekciAlarmi != nil {
        Tanilama.ortak.kaydet("motor", "bekçi: tampon gelmiyor", uyari: true)
        hataylaBitir(HatHatasi(mesaj: "Mikrofondan ses gelmiyor. Dinlemeyi yeniden başlatın.", kod: "bekçi"))
        return
    }
    bekciAlarmi = Date()
    kesintiyeGir(.bekci)
    surdur()
}
```

### Önemli

#### YÖ-1 (Önemli) — Yapılandırma ve bekçi kesintisinde çalan çeviri kesiliyor, sıradakiler sessizce atılıyor

**Yer:** `Hat.swift:500` (`kesintiyeGir` → `sesiKes`), `:837-845`, `:737-741` (`seslendir`), `:349-351`, `:424-428`

`kesintiyeGir` her nedende `sesiKes()` çağırıyor: `sesNo += 1`, oynatıcı ve Apple sesi durur, sıradakiler `:759`'da
atlanır. AirPods takılınca / çıkarılınca motor yapılandırması değişir (K1–K3) ve tam o anda kulağa gelmekte olan çeviri
ile sıradakiler **hiç okunmaz**; ekranda bunu söyleyen bir şey yok (yalnız Tanılama'da `ses  atlandı` satırı, o da
`seslendir` kesinti sırasında çağrılırsa). Şartname K2 "çalmakta olan cümle ahizeden sürer" diyordu; G11 ise her nedende
"çalan ses kesilir" diyordu — bu çelişkiyi tur 2'de şartnamede giderdim (G11, S4). Motoru yeniden başlatmak için
`AVAudioPlayer` ya da `AVSpeechSynthesizer`'ı durdurmaya gerek yok; ikisi de motordan bağımsız, aynı oturumda çalar.

**Düzeltme:**

```swift
// kesintiyeGir içinde
if neden == .telefon || neden == .arkaPlan { sesiKes() }   // yapılandırma / bekçi: ses sürer, sıra korunur

// seslendir: yalnız telefon / arka plan kesintisinde atla ve bir kez söyle
func seslendir(_ metin: String) {
    guard cumleEkle != nil else { return }
    if let k = kesinti, k == .telefon || k == .arkaPlan {
        Tanilama.ortak.kaydet("ses", "atlandı (kesinti)")
        bildir?(.not(.kesinti, "Kesinti sırasında gelen çeviri okunmadı."))   // NotTuru'na yeni durum
        return
    }
    sesSirasinaEkle.yield((sesNo, metin))
}
```

#### YÖ-2 (Önemli) — Telefon kesintisi başka bir kesintinin üstüne gelirse yok sayılıyor; bekleyen 2. deneme görüşme sürerken dinlemeyi hatayla bitiriyor

**Yer:** `Hat.swift:492` (`guard kesinti == nil`), `:475`, `:450`, `:537-542` (yeniden deneme zamanlayıcısı)

Sıra: yapılandırma ya da bekçi kesintisi → `surdur` deneme 1 hata verir → 0,5 sn sonrası için deneme 2 kurulur → bu arada
arama gelir, `.began` gelir → `kesintiyeGir(.telefon)` `:492`'de **hiçbir şey yapmadan** döner (kesinti zaten var). Ekran
"ses yolu değişiyor" der; deneme 2 görüşme sürerken `setActive(true)` dener, `insufficientPriority` ile düşer ve
`hataylaBitir` dinlemeyi "Mikrofon yeniden açılamadı" ile **bitirir** — oysa beklenen, görüşme bitince (`.ended`)
kendiliğinden sürmekti. Aynı yarış, arama başlarken bildirimden önce bekçinin (2 sn tampon yok) alarm verdiği durumda da
olur. Zamanlayıcı yalnız `oturumNo`'yu denetliyor (`:540`); hangi kesintiye ait olduğunu bilmiyor. Arka plana geçişte de
(`:450`) neden güncellenmiyor ama orada `oturumuKapat` yine çalıştığı için zararı küçük.

**Düzeltme (şartname G11a, G12):**

```swift
@ObservationIgnored private var kesintiNo = 0      // kesintiyeGir'de ve neden değişince +1

// kesintiBildirimi .began, guard cumleEkle != nil'den sonra:
if let k = kesinti, k != .telefon {
    kesinti = .telefon
    kesintiNo += 1                                 // bekleyen 2. deneme artık geçersiz
    sesiKes()
    Tanilama.ortak.kaydet("kesinti", "neden değişti=telefon", uyari: true)
    bildir?(.kesintiBasladi(.telefon))
    return
}
// didEnterBackground için aynısı (.arkaPlan)

// surdur'daki zamanlayıcı:
let no = oturumNo, k = kesintiNo
Task { [weak self] in
    try? await Task.sleep(for: .seconds(yenidenDenemeArasi))
    guard let self, no == self.oturumNo, k == self.kesintiNo else { return }
    self.surdur(deneme: 2)
}
```

`Durum.hatBildirdi(.kesintiBasladi)` aşamayı zaten günceller (`Durum.swift:197-198`).

#### YÖ-3 (Önemli) — Anahtar taşıma: Anahtar Zinciri'nde değer varsa `UserDefaults`'taki daha yeni anahtar sessizce atılıyor

**Yer:** `Anahtarlik.swift:22-29`; bağlam: `Arayuz/AyarlarEkrani.swift:5` (henüz `@AppStorage(Kayit.alaniaAnahtari)`)

`eskisiniTasi` Anahtar Zinciri'nde değer varsa `UserDefaults`'taki değeri **yazmadan siler** (`:25` koşulu yanlış olunca
`:28`). `UserDefaults`'a yalnız eski (ya da B adımına kadar bugünkü) arayüz yazar; yani orada duran değer her zaman
kullanıcının **en son** girdiğidir. Bugünkü yapıda somut sonuç: kullanıcı anahtarı girer → ilk cümlede Anahtar Zinciri'ne
taşınır, `UserDefaults`'tan silinir → `@AppStorage` alanı ekranda **boşalır** → kullanıcı yeniden (ya da düzeltilmiş)
anahtar yazar → bir sonraki okumada eski anahtar kalır, yenisi atılır; anahtarı silmek için alanı boşaltmak da işe
yaramaz (`""` → `:25` atlanır, `:28` siler, Anahtar Zinciri'ndeki kalır). K5'in "eski değer taşınır" maddesi bu yüzden
yalnız tek yönde doğru.

**Düzeltme (şartname A2):** `UserDefaults`'taki değer, boş da olsa, kazanır:

```swift
private static func eskisiniTasi() {
    let v = UserDefaults.standard
    guard let eski = v.string(forKey: Kayit.alaniaAnahtari) else { return }
    guard yaz(eski) else { return }          // boşsa siler; yazılamazsa eskiyi koru
    v.removeObject(forKey: Kayit.alaniaAnahtari)
}
```

B adımında `AyarlarEkrani` doğrudan `Anahtarlik.alaniaAnahtari`'ya bağlanmadan (bugünkü `@AppStorage` ile) bu yapı cihaz
testine verilmemeli.

#### YÖ-4 (Önemli, web) — Web'de aşama yok: izin beklenirken ve okurken bekletmede ekran "Dinliyorum…" der

**Yer:** `app.js:187-191` (`cizSuAn`), `:205`, `:208` (CANLI rozeti), `:462` (`d.calisiyor = true`), `:652-658`

Web tek `d.calisiyor` işaretiyle çiziyor. İlk Başlat'ta tarayıcı mikrofon iznini sorarken, "okurken dinlemeyi beklet"
açıkken her okuma boyunca (tanıma bilerek kapalı, `:657`) ve sekme gizliyken ekranda CANLI ve "Dinliyorum…" görünür.
Şartname § 6 web'in aynı aşama adlarını kullanmasını ister; D-0/KR3'ün web karşılığı yok.

**Düzeltme:** `d.asama` ('duruyor' | 'hazirlaniyor' | 'dinliyor' | 'kesintide') ve `d.kesintiNedeni`; çizim yalnız buna
baksın.

```js
// baslat: d.asama = 'hazirlaniyor'
t.onaudiostart = () => {           // Safari'de gelmezse onstart ya da ilk onresult (emin değilim, D15)
  if (t !== taniyici) return
  if (d.asama !== 'dinliyor') { d.asama = 'dinliyor'; kaydet('izin', 'mikrofon=verildi'); ciz() }
}
// dinlemeyiBeklet: d.asama = 'kesintide'; d.kesintiNedeni = neden
// dinlemeyiSurdur: tanıma yeniden açılınca d.asama = 'dinliyor'
// cizSuAn: 'Dinliyorum…' yalnız d.asama === 'dinliyor'; 'Hazırlanıyor…' / 'Duraklatıldı: okuma sürüyor' / '… sayfa arka planda'
// $('canliRozet').hidden = d.asama !== 'dinliyor'; ana düğme d.asama !== 'duruyor' iken "Durdur"
```

Akış testindeki sahte tanımanın `audiostart` (ya da `start`) olayını tetiklemesi gerekir.

#### YÖ-5 (Önemli) — Sunucuda tanınan dilde (KR2) internet yoksa hata iletisi yanlış yol gösteriyor

**Yer:** `Hat.swift:243-246`, `:681-685`

KR2 ile `ar-SA` gibi diller sunucuda tanınıyor. Yurtdışında veri bağlantısı olmayan kullanıcı (bu uygulamanın tipik
kullanım yeri) için iki olası sonuç var, ikisi de yanlış yönlendirir: `isAvailable == false` → "şu an kullanılamıyor.
Biraz sonra yeniden deneyin."; ya da görevler hemen hatayla biter → 5 boş bitişte "Konuşma tanıma çalışmıyor
(kAFAssistantErrorDomain/…). Dinlemeyi yeniden başlatın." Yeniden başlatmak işe yaramaz; gereken internettir. Hangi
yolun ve hangi kodun geleceğinden emin değilim (D22).

**Düzeltme (şartname T1, K12):** Tanıyıcı sunucu kullanıyorsa (`!supportsOnDeviceRecognition`) her iki yerde ileti:
"Bu dilde konuşma tanıma için internet gerekli. Bağlanıp yeniden başlatın." (`kod` aynı kalır, Tanılama'ya gider).

```swift
let sunucuda = !(taniyici?.supportsOnDeviceRecognition ?? true)
let mesaj = sunucuda ? "Bu dilde konuşma tanıma için internet gerekli. Bağlanıp yeniden başlatın."
                     : "Konuşma tanıma çalışmıyor (\(kod)). Dinlemeyi yeniden başlatın."
```

### Öneri

- **Ön-1** — `Hat.swift:93-117`, `:823-834`: `SesBekleyici` tek bir `devam` tutuyor ve gelen `didFinish` / `didCancel` /
  `audioPlayerDidFinishPlaying` geri çağrısının **hangi öğeye** ait olduğuna bakmıyor. `stopSpeaking(at: .immediate)`
  (`:843`) sonrası `didCancel` geç gelirse ya da Apple sesinin sigortası (`:816`) sesten önce dolarsa, önceki öğenin geç
  bildirimi sonraki öğenin beklemesini erken bitirir ve iki ses üst üste biner (S2). Pencere dar (D24). Düzeltme
  (şartname S4a): `basla(_:icin: AnyObject)` ile beklenen `AVSpeechUtterance` / `AVAudioPlayer`'ı sakla; temsilci
  yöntemlerinde `utterance === beklenen` değilse `bitir()` çağırma.
- **Ön-2** — `Hat.swift:293`: `durdur()` her zaman `motor.inputNode.removeTap(onBus: 0)` çağırıyor; hazırlıkta Durdur
  (`Durum.swift:80`), izin reddi ve dil paketi hatası (`Durum.swift:210`) yollarında motor hiç kullanılmamışken giriş
  düğümü bu satırla ilk kez oluşturulur. Zararsız olabilir, emin değilim (D23). `@ObservationIgnored private var baglandi
  = false` tut; `mikrofonuBagla` sonrası `true`, yalnız `true` ise `removeTap` ve `motor.stop()`.
- **Ön-3** — `Hat.swift:579-583`, `:552-559`: Hat kendini hatayla durdurduğunda `Durum`'a doğrudan haber vermiyor; aşama,
  akışın hatası `for try await`'e ulaşana dek (bir `translate` sürüyorsa onun bitişine dek) `.dinliyor` kalır. Kısa ama
  D-0 ihlali. `bildir?(.durdu)` ekle; `Durum` aşamayı hemen `.duruyor` yapsın, hata metni akıştan gelince yazılsın.
- **Ön-4** — `Hat.swift:433-438`, `:544-546`: Görüşme sürerken uygulamaya dönülürse `surdur` `setActive`'te
  `insufficientPriority` alır, iki denemeden sonra dinleme hatayla biter; görüşme bitince kendiliğinden sürmez.
  `insufficientPriority`'de G13 yerine kesintide kal ve `.ended`'i bekle. iOS'un tam olarak bu hatayı verdiğinden emin
  değilim (D8, D20); KR4 gereği cihazda görülmeden davranış değiştirilmemeli, şimdilik Tanılama satırı yeterli.
- **Ön-5** — `Hat.swift:476-484`: `.ended` hiç gelmezse ve uygulama etkinliğini yitirmediyse (alarm afişi, D20) ekran
  "Duraklatıldı"da kalır ve çıkış yolu söylenmez. Savunma (KR4'e uygun, şartname K4): kesintide 10 sn sonra ekranda "Devam
  etmek için Durdur'a, sonra Başlat'a dokunun." notu.
- **Ön-6** — `Hat.swift:799`: `o.play()` `false` dönerse `bekle` hemen biter; cümle okunmaz, ekranda ve Tanılama'da iz
  kalmaz (S5). `play()` `false` ise `alaniaBasarisiz("çalınamadı", gecersiz: false)` + `appleIleOku`.
- **Ön-7** — iPhone Tanılama eksikleri: (a) `Durum.swift:116` dil paketi hep "hazır (ms)"; brief "hazır / indirildi"
  ayırır — `prepareTranslation`'dan önce `LanguageAvailability().status(from:to:)` okunup `.installed` değilse
  "indirildi" yazılabilir. (b) Brief "tanıma bitti neden: sessizlik" ister; sessizlikle kapanan görev (`:714-718`) hiç
  satır yazmıyor (yalnız `cümle` satırı var); web yazıyor (`app.js:552-553`). `cumleyiKapat`'ın sayaçtan geldiği yolda
  `kaydet("tanıma bitti", "neden=sessizlik", tekrarPenceresi: tanimaBitisPenceresi)`. (c) Kopya başlığında saat dilimi
  ve "eski olaylar atıldı" bilgisi yok (`Tanilama.swift:51-56`; web'de var, `app.js:127-128`). (d) `:481` dinlerken
  ama `kesinti == nil` iken gelen `.ended` için "bitti (dinlemiyor)" yazıyor; yanıltıcı — "bitti (kesinti yoktu)".
- **Ön-8** — Web Tanılama eksikleri: `izin` yalnız redde yazılıyor (`app.js:538-539`), "mikrofon=verildi" yok (YÖ-4'teki
  `onaudiostart` ile kapanır); `tanıma açıldı` (`:586`) konum söylemiyor → `konum=bilinmiyor`; başlıkta sürüm yok;
  `Sayfa: location.pathname` (`:126`) `file://` ile açılınca kullanıcı adını içerebilir (`/Users/<ad>/…`) — yalnız
  `location.protocol` + dosya adı yaz. Ayrıca kesinti karşılığı `bekleme` (`:653`, `:664`) adıyla yazılıyor; şartname § 6
  aynı adları ister: `kesinti  başladı neden=okuma` önerilir (test beklentisiyle birlikte).
- **Ön-9** — Web `app.js:477-504`, `:648`, `:700-707`: Durdur uçuştaki MyMemory isteğini iptal etmiyor; `cevirKuyrugu`
  sıralı olduğu için Durdur–Başlat sonrası yeni oturumun ilk cümlesi eski isteği 10 sn'ye kadar bekler (şartname § 6, tur
  2). Oturum başına bir `AbortController` tut, `getir`'e geçir, `durdur`'da `abort()`.
- **Ön-10** — `Anahtarlik.swift`: (a) `set` sonucu atılıyor (`:17`); yazma başarısızsa kullanıcı da Tanılama da bilmez
  (şartname A3): `kaydet("anahtar", "kaydedilemedi \(durum)")` — anahtarın kendisi asla. (b) Boşluklar kırpılmıyor (web
  kırpıyor, `app.js:1128`); yapıştırılan sondaki boşluk 401 verir. (c) Her cümlede `UserDefaults` + `SecItemCopyMatching`
  (`Hat.swift:767`): küçük ama gereksiz; okunan değeri bellekte tutup `set`'te güncellemek yeter. (d) Anahtar Zinciri öğesi
  uygulama silinince kalabilir (D25); istenmiyorsa ilk açılışta bir `UserDefaults` işaretine bakıp eski öğeyi silmek
  yaygın yöntemdir.
- **Ön-11** — `Durum.swift:222-227`: `n.code` alan denetlenmeden `AVAudioSession.ErrorCode` ile karşılaştırılıyor; başka
  alandan aynı sayılı bir kod yanlış iletiyle eşleşebilir. `n.domain == NSOSStatusErrorDomain` koşulu ekle.
- **Ön-12** — `Durum.swift:119-132`: Hazırlık sürerken uygulama arka plana giderse `hat.baslat` arka planda çalışabilir;
  arka plan kipi olmadığı için `setActive` büyük olasılıkla hata verir ve dinleme Türkçe ama yanlış nedenli bir hatayla
  biter (emin değilim). `baslat`'tan önce `UIApplication.shared.applicationState == .background` ise ön plana dönüşü
  bekle.

**Derleme notu:** Kesin bir derleme hatası görmedim. `Hat.swift:466` yorumu derlemenin uyarıları hata saydığını
düşündürüyor; `TanimaHatasi` ve `BildirimOzeti` (`Sendable` değil) `@MainActor` kapanışlara taşınıyor — Swift 5 kipinde
uyarı vermemeli, Mac'te görülecek.

---

## 3. Yeniden bakılan riskli noktalar (sorun bulmadıklarım)

- **Durdur sırası** (`Hat.swift:283-305`): oturum no +1, tur +1, duraklama ve bekçi iptal, tanıma iptal, kutu boş,
  bağlantı sökülür, motor durur, akış kapanır, ses kesilir (uçuştaki Alania dahil), gözlemciler kalkar, kilit engeli
  kalkar, oturum kapanır (`isBusy` kaydedilir). Şartname § 2.3 ile birebir. İki kez çağrılması zararsız.
- **Kesinti → dönüş → Durdur:** Bekleyen 2. deneme `oturumNo` ile eleniyor (`:540`); arka planda kapanmış oturum
  `oturumEtkin` ile iki kez kapatılmıyor (`:567`). Durdur kesintideyken de tam kapatıyor.
- **Bekçi kesintide susuyor mu:** Evet. `kesintiyeGir` görevi iptal ediyor (`:496`), `bekciDenetle` `kesinti == nil`
  istiyor (`:627`), yalnız başarılı `dinlemeyiAc` yeniden kuruyor (`:595`). Hazırlıkta hiç kurulmuyor. Ana aktör tıkansa
  bile süre ses iş parçacığının zamanından ölçüldüğü için yanlış alarm vermez. Tek sorun üst sınırın olmaması (YE1).
- **Ses iş parçacığı ↔ ana aktör:** Paylaşılan tek şey `MikrofonKutusu` (`istek`, `son`), kilitli; tap kapanışı
  `nonisolated static` işlevde kurulduğu için ana aktöre bağlı değil (`:600-609`) — ses iş parçacığında aktör denetimi
  çökmesi olmaz. `istek.append` kilit dışında; eski isteğe geç bir tampon eklenebilir, iptal edilmiş istekte zararsız.
  Tanıma geri çağrısı `DispatchQueue.main.async` + `assumeIsolated` (`:707-709`), bildirimler `queue: .main` (`:401`).
  `SesBekleyici` kilitli. Arayüz durumu ana aktör dışında değişmiyor.
- **Geç tanıma sonucu:** `tur` `tanimayiBaslat`, `yarimCumleyiGonder`, `durdur` ve `surdur` hatasında artıyor; geri
  çağrı `buTur == self.tur` ile süzülüyor (`:652`). Duraklama sayacı iptalle korunuyor ve hepsi ana aktörde.
- **`await` noktalarında kimlik:** `Durum.calistir`'de her `await` (`prepareTranslation`, `izinler`, akış, `translate`)
  sonrasında ve `translate`'ten önce; `Hat.oku`'da Alania yanıtından sonra ve çalmadan önce (`:778`, `:784`, `:798`);
  `appleIleOku` başında (`:804`); yeniden deneme zamanlayıcısında (`:540`, eksiği YÖ-2); bekçide (`:620`). Eksik kalan
  `await` görmedim.
- **Seslendirme iptal ve yedek:** Durdur'un iptal ettiği Alania isteği hata sayılmıyor (`:778`); 5 sn zaman aşımı ve
  HTTP hatası Apple sesine düşüyor ve notla söyleniyor; kesici oturum boyunca açık kalıyor, notu kalkmıyor (Alania
  denenmediği için `:795`'e varılmıyor). Sıra `AsyncStream` ile tek döngüde, öğeler (oturum no, metin) taşıyor.
- **Tanılama ve ilke 3:** Her `kaydet` çağrısının argümanına baktım (Hat 29 çağrı, Durum 8). Yazılanlar: dil / bölge kodu,
  kelime sayısı, ms, `alan/kod`, port **türü**, kesinti nedeni, `shouldResume`, biçim (Hz, kanal). Konuşma ya da çeviri
  metni, `portName` ve cihaz adı yok; `HatHatasi.mesaj` kayda gitmiyor, yalnız `kod`. Kopya başlığında `uname` donanım
  kimliği (`Tanilama.swift:79-88`), `UIDevice.name` değil. Tek açık soru: tanıma hatasının `localizedDescription`'ı
  (`Hat.swift:705`) kayda giriyor; Speech hata açıklamalarının konuşma içerdiğini hiç görmedim ama içeriği sistem belirler.
  Kopyaya yalnız `alan/kod` yazmak en güvenlisi (Öneri düzeyinde; şimdilik bırakılabilir).
- **Anahtar Zinciri erişimi:** `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (`:63`); kilitliyken okuma başarısız
  olursa taşıma eski değeri silmiyor (`:26`). Anahtar hiçbir kayda gitmiyor.

---

## 4. "Tanılama: ne kaydedilir" tablosu — kodda nerede

| Olay | iPhone | Web | Eksik |
| ---- | ------ | --- | ----- |
| başlat / durdur | `Durum.swift:90` (`dil=`); `:79` (`neden=düğme`), `:209` (`neden=izin yok` / `hata dil paketi` / `hata <kod>` / `hata çeviri`) | `app.js:467`, `:451` (desteklenmiyor), `:501` (`neden=`) | — |
| izin | `Durum.swift:121-123` (tek satır, ikisi birden) | `app.js:538-539` yalnız redde | Web: "verildi" (Ön-8) |
| dil paketi | `Durum.swift:116` hazır (ms), `:111` hata | yok (çeviri internette; şartname § 6) | iPhone: "indirildi" ayrımı (Ön-7a) |
| tanıma açıldı | `Hat.swift:272` (`<bölge> cihazda/sunucuda`), `:244` (kullanılamıyor) | `app.js:586` (yalnız bölge) | Web: konum (Ön-8) |
| tanıma bitti | `Hat.swift:676` (son sonuç / `hata alan/kod açıklama`, `×n`) | `app.js:550-560`, `:607` (sessizlik / son sonuç / sonuçsuz / hata / durdur) | iPhone: "sessizlik" (Ön-7b) |
| cümle | `Hat.swift:732` (`kelime=`) | `app.js:647` | — |
| çeviri | `Durum.swift:149` (ms), `:158` (hata kodu) | `app.js:685`, `:678` | — |
| ses | `Hat.swift:793` (alania ms), `:814` (apple), `:850` (alania hatası http / zaman aşımı / ağ), `:854` (kesici), `:811` (Türkçe ses yok), `:739` (atlandı) | `app.js:893`, `:834` (cihaz), `:798`, `:804`, `:490` (iptal), `:820` | iPhone: `play()` başarısızlığı (Ön-6) |
| ses yolu | `Hat.swift:328` (çıkış/giriş türü, neden) — `:268`, `:347`, `:526`'dan; `:335`, `:341` | `app.js:468` (`bilinmiyor`) | — |
| kesinti | `Hat.swift:494` (başladı neden), `:511` (bitti + `shouldResume`), `:467`, `:470`, `:472`, `:481`, `:515`; motor `:524` / `:536` / `:544`; `:553` (ses sistemi sıfırlandı) | `app.js:653`, `:664` (`bekleme` adıyla) | Web adı (Ön-8); iPhone "neden değişti" (YÖ-2) |
| arka plan / ön plan | `Hat.swift:434`, `:445`, `:448` | `app.js:1003` (`sekme gizlendi/göründü`) | — |
| Başlık (sürüm, iOS, model) | `Tanilama.swift:51-56` | `app.js:124-129` (tarayıcı kimliği) | Web: sürüm; `pathname` (Ön-8) |
| En çok 300, bellekte | `Tanilama.swift:103-105`, `Sabitler.swift:35` | `app.js:31`, `:105-108` | — |
| Satır biçimi `SS:DD:SS.mmm  olay  ayrıntı` | `Tanilama.swift:58-61`, `:91` | `app.js:133` | — |

---

## 5. Şartnamede bu turda değişenler (`docs/ses-hatti.md`)

KR2 → T1, G5 (reddedilmez; kalıcı sarı not; `sunucuda` satırı; çevrimdışı iletisi). KR3 → D-0, § 2.1 tablosu (Durdur her
aşamada; "Duraklatıldı: <neden>" metinleri), G1, G4. KR10 → S4–S6, K12, § 6. KR1 → T4 (birikim), § 7 (Ön-7/Ön-9 cihaz
sorusu). KR5/KR1 → S8 (iPhone'a "okurken beklet" eklenmez). KR4 → § 7 girişi. Tur 2 netleştirmeleri: G11 (ses yalnız
telefon/arka planda kesilir; K2 ile çelişki giderildi), yeni G11a (neden değişimi), G12 ve C7 (kesinti numarası, "başarı"
tanımı), K15 ve C6 (ardışık bekçi alarmında G13), S4a (bitiş bildiriminin sahibi), § 5.1 A1–A3 (Anahtar Zinciri), § 6
(web aşamaları, Tanılama farkları, çeviri isteğinin iptali). Yeni cihaz soruları D19–D25.

## 6. Cihaz testine aktarılacaklar

D19 (bekçi payı, YE1), D20 (`.ended` gelmeyen kesintiler, Ön-5), D21 (arka planda `translate`), D22 (sunucu tanıması
çevrimdışı, YÖ-5), D23 (`inputNode`, Ön-2), D24 (`didCancel` gecikmesi, Ön-1), D25 (anahtarın yeniden kurulumda kalması,
Ön-10d); ayrıca Ön-4 (görüşme sürerken dönüş, D8) ve YÖ-4'teki Safari `audiostart` sorusu (D15).
