# S01 — Ses uzmanı incelemesi, tur 3

**2. tur bulguları (18): 15 kapandı · 1 kısmen · 0 açık · 2 yapılmadı (bildirildiği gibi) + Ön-7a, Ön-10d, Ön-12 birikime**
**Yeni bulgular: 0 Engel · 3 Önemli (2 iOS, 1 web) · 6 Öneri**

İncelenen (satır satır, çalışma ağacı, commit 9031f22 üstü): `CanliCeviri/Hat.swift` (1072 satır), `Durum.swift` (239),
`Anahtarlik.swift` (93), `Tanilama.swift` (169), `Sabitler.swift` (63), `web/app.js` (dinleme, aşama, çeviri, seslendirme,
Tanılama; satır 20–140 ve 440–1140). Bağlam için okunan: `Arayuz/AyarlarEkrani.swift` (anahtar bağlantısı),
`Arayuz/KokEkran.swift` (aşama duyuruları), `Arayuz/CeviriEkrani.swift` (aşama okuma). Bu ortamda çalıştırılanlar:
`python3 scripts/swift-sozdizimi.py` (13 dosya, 0 sorun — derleme değildir) ve `node tests/web-akis.cjs` (204 geçti, 0
kaldı). Mac derlemesinin sonucunu görmedim; satır numaraları bu sürüme göredir.

Apple belgelerine bu turda bakılmadı. Hata alanları üzerine söylediklerim (Z-1) deneyime dayanır ve "emin değilim" diye
işaretlidir; cihaz sorusu D26'dır (ilke 8). Gerçek cihazda hiçbir şey denenmedi.

**Engel yok.** Gerekçe: proje sahibinin ilk denemesinde "Dinliyorum" yazarken duymama, yanlış ses yolu, çökme ya da
kilitlenme doğuracak bir yol bulmadım. YE1'in kapanmasıyla bekçi artık sınırlı (en çok iki alarm) ve ekran bekçi
kesintisini gösteriyor. Kalan sorunlar yanlış ya da eksik **ileti** (Z-1, Z-2) ve web'de izin istemi sırasında yanlış
aşama (Z-9).

---

## 1. Tur 2 bulgularının durumu

| No    | Durum | Kanıt / eksik |
| ----- | ----- | ------------- |
| YE1   | **kapandı** | `Hat.swift:62-63`, `:79-86` `gercekSon` yalnız gerçek tamponla; `:95-100` `tamponGeldi(sonra:)`; `:747-764` ilk alarmda `bekciAlarmi = Date()` + `kesintiyeGir(.bekci)` + `surdur()`, alarmdan sonra tampon gelirse `motor  tampon geldi` + `.kesintiBitti`, tek tampon gelmeden ikinci alarmda `hataylaBitir("Mikrofondan ses gelmiyor…")`; `:615-619` bekçiden dönüşte `.kesintiBitti` gönderilmiyor → ekran `kesintide(bekci)`'de kalır (`Durum.swift:199-202`). `bekciAlarmi` `:307` (Başlat), `:357` (Durdur), `:557`/`:573` (telefon/arka plan) sıfırlanıyor. Takılı kalma yolu yok: bekçi görevi `:714` her başarılı açılışta yeniden kuruluyor; tampon ya gelir ya da ~2 sn sonra hata. Kalan pencere: Z-3. |
| YÖ-1  | **kapandı** | `Hat.swift:551`, `:571-575` ses yalnız telefon/arka planda kesiliyor; `:878-889` kesinti telefon/arka plandayken gelen çeviri sıraya girmiyor, `:892-895` not + `ses  atlandı (kesinti)`; `:1000-1010` kesilen ya da bekleyen varsa not (`sirada` `:250`, `:887`, `:911`). Sayaç tutarlı: her `yield` döngüde tam bir kez tüketiliyor, eski oturumun öğesi de `sirada`'yı düşürüyor. Notun ömrü: Z-5. |
| YÖ-2  | **kapandı** | `Hat.swift:549-563` G11a: farklı ve ses kesen neden gelince `kesinti` değişir, `kesintiNo += 1`, `bekciAlarmi = nil`, ses kesilir, ekran güncellenir; `:637-643` 2. deneme hem `oturumNo` hem `kesintiNo` denetliyor; arka plan `:503-507` aynı yoldan geçiyor. Aynı nedenli ikinci `.began` boşluğu: Z-7. |
| YÖ-3  | **kapandı** | `Anahtarlik.swift:39-44` `UserDefaults`'taki değer boş da olsa kazanıyor, yazılamazsa silinmiyor; `:6` `@MainActor`; `:12`, `:16-23` önbellek (geçici okuma hatası önbelleğe girmiyor, `:22`); `:25-34` yazınca `UserDefaults` temizleniyor. 2. turdaki koşul da kalktı: `Arayuz/AyarlarEkrani.swift:68-76` artık `Anahtarlik.alaniaAnahtari`'ya bağlı, `@AppStorage` yok. Yazma hatasının ekranda görünmemesi: Z-8. |
| YÖ-4  | **kısmen** | `app.js:74-77` `d.asama`/`d.kesintiNedeni`; `:190-228` çizim yalnız aşamaya bakıyor (CANLI `:228`); `:471-480` aşama türetimi; `:522` Başlat'ta "hazırlanıyor"; `:732-753` okuma ve gizli sekme "kesintide". **Eksik:** `:660-663` 5 sn yedek süre (ve muhtemelen `:587` `start`) izin istemi açıkken aşamayı "dinliyor" yapıyor → Z-9. |
| YÖ-5  | **kapandı** | `Hat.swift:295-302` başlarken tanıyıcı kullanılamaz ve sunucu dili ise; `:823-827` art arda boş bitişte; ileti `:1029`. Hangi yolun işlediği D32. |
| Ön-1  | kapandı | `Hat.swift:106-156` `ObjectIdentifier` ile sahip denetimi; `:953`, `:977` öğe kimliği geçiriliyor; `:985-996` sigorta yalnız kendi öğesini bitiriyor. Geri çağrıdaki nesne o an canlı olduğundan kimlik çakışması olamaz. |
| Ön-2  | kapandı | `Hat.swift:248`, `:696-701`, `:708`. |
| Ön-3  | kapandı | `Hat.swift:52-53`, `:681-686`; `Durum.swift:205-210`. Çift `durdur()` zararsız (bkz. § 3, nokta 4). |
| Ön-4  | kapandı | `Hat.swift:631-634` yalnız Tanılama satırı (KR4). İletinin kendisi Z-2. |
| Ön-5  | kapandı | `Hat.swift:581-592`, `Sabitler.swift:34`; `:614` başarılı dönüşte not kalkıyor; hata ile durunca `Durum.notlar = []`. Metin: Z-4. |
| Ön-6  | kapandı | `Hat.swift:952-961` `play()` false → `alaniaBasarisiz("çalınamadı")` + Apple sesi. |
| Ön-7  | b, c, d kapandı; a yapılmadı | b `Hat.swift:806-810`; c `Tanilama.swift:53-60`, `:84-88`; d `Hat.swift:536-538`. a (dil paketi "indirildi" ayrımı) birikime. |
| Ön-8  | kapandı | `app.js:485-497` `izin  mikrofon=verildi` bir kez (`audiostart` ya da ilk sonuç); `:659` `konum=bilinmiyor`; `:735`, `:749` kesinti adları; `:133-139` sürüm, saat dilimi, protokol + dosya adı. |
| Ön-9  | kapandı | `app.js:468`, `:520-521`, `:555-559`, `:725-727`, `:788-810`, `:828-839`; iptal hata sayılmıyor (`:764`). Akış testi `çeviri  istek iptal edildi` ve "iptal hata sayılmadı" denetimleriyle yeşil. |
| Ön-10 | a, b, c kapandı; d yapılmadı | a `Anahtarlik.swift:69-76` yalnız `OSStatus`; b `:46-48`; c `:12-23`. d (yeniden kurulumda kalan öğe) D25 ile cihazda görülecek, birikime. |
| Ön-11 | kapandı, **gerileme doğurdu** | `Durum.swift:230-236`, `Hat.swift:689-693` yalnız `NSOSStatusErrorDomain`. Motor hataları büyük olasılıkla başka alanla geliyor → Z-1. |
| Ön-12 | yapılmadı | Birikime (bildirildiği gibi). |
| (Tanılama, tur 2 § 3 son madde) | kapandı | `Hat.swift:193-197`, `:846` tanıma hatasından yalnız alan/kod; `localizedDescription` hiçbir yerde kayda gitmiyor. |

---

## 2. Yeni bulgular

### Önemli

#### Z-1 (Önemli) — Ön-11'in alan daraltması motor başlatma hatalarını genel iletiye düşürüyor (K11)

**Yer:** `Durum.swift:230-236` (`turkce`), `Hat.swift:689-693` (`oncelikYetersiz`)

Liderin hatırladığı doğru, ama **emin değilim** (Apple belgesine bu turda erişmedim; deneyime dayanıyor): `AVAudioSession`
yöntemlerinin (`setActive`, `setCategory`) hataları `NSOSStatusErrorDomain` ile gelir (ör. 561017449 `'!pri'`
"Session activation failed"), `AVAudioEngine.start()` hataları ise `com.apple.coreaudio.avfaudio` alanıyla gelir; mikrofon
başka uygulamadayken ya da görüşme sürerken en sık görülen kod 561145187 (`'!rec'`, `cannotStartRecording`) olur. Kodlar
dört harfli (FourCC) olduğu için iki alanda aynı anlamı taşır; başka bir alanda aynı sayıya rastlama olasılığı pratikte
yoktur. Ön-11'in amacı (ör. `NSURLErrorDomain` gibi alakasız bir alanın sayısıyla eşleşmemek) iki alanı birlikte kabul
ederek de korunur. Bugünkü kodla ilk Başlat'ta motor `'!rec'` verirse ekranda "Dinleme durdu
(com.apple.coreaudio.avfaudio/561145187). Yeniden başlatın." çıkar; kullanıcıya ne yapacağını söylemez (K11, ilke 5).

**Düzeltme:** iki alanı kabul eden tek bir yardımcı; hem `Durum.turkce` hem `Hat.surdur` (Z-2) onu kullansın. Cihazda
hangi alanın geldiği D26'da görülür; yardımcı iki durumda da doğru çalışır.

```swift
// Hat.swift (ya da Tanilama.swift yanında, nonisolated)
enum SesHatasi {
    /// Ses oturumu ve ses motoru hatalarının geldiği alanlar (D26: hangisi geldiği cihazda görülecek).
    private static let alanlar: Set<String> = [NSOSStatusErrorDomain, "com.apple.coreaudio.avfaudio"]
    static func eslesir(_ hata: Error, _ kod: AVAudioSession.ErrorCode) -> Bool {
        let n = hata as NSError
        return alanlar.contains(n.domain) && n.code == kod.rawValue
    }
}

// Durum.turkce:
if SesHatasi.eslesir(hata, .insufficientPriority) { return ("Görüşme sürerken dinleme başlatılamaz. Görüşme bitince yeniden deneyin.", kod) }
if SesHatasi.eslesir(hata, .cannotStartRecording) { return ("Mikrofon başka bir uygulamada. O uygulamayı kapatıp yeniden başlatın.", kod) }

// Hat.oncelikYetersiz:
SesHatasi.eslesir(hata, .insufficientPriority)
```

#### Z-2 (Önemli) — Sürdürme iki kez başarısız olunca ileti nedeni söylemiyor (lider nokta 3)

**Yer:** `Hat.swift:645-648` (`surdur`, `deneme == 2` dalı); bağlam `:631-634`, `:503-507`

Proje sahibinin büyük olasılıkla deneyeceği akış (D30): dinlerken arama gelir → açar → uygulama arka plana gider (neden
"arka plan" olur, `kesintiNo` artar, 10 sn notu çıkmaz — doğru) → görüşme sürerken uygulamaya döner → `didBecomeActive`
→ `surdur` → `setActive(true)` iki kez `insufficientPriority` → ekranda "Mikrofon yeniden açılamadı. Dinlemeyi yeniden
başlatın." Bu ileti yanlış yol gösterir: hemen yeniden başlatmak işe yaramaz (Başlat bu kez "Görüşme sürerken dinleme
başlatılamaz" der). Davranışı değiştirmek (kesintide kalıp `.ended`'i beklemek) KR4 gereği cihazda görülmeden
yapılmamalı (D30); ama **ileti** savunma denetimidir, KR4'e uyar. `Hat.oncelikYetersiz` zaten var.

**Düzeltme:**

```swift
} else {
    kayit.kaydet("motor", "başlatılamadı \(hataKodu(error))", uyari: true)
    let mesaj: String
    if SesHatasi.eslesir(error, .insufficientPriority) {
        mesaj = "Görüşme sürerken dinleme sürdürülemez. Görüşme bitince Başlat'a dokunun."
    } else if SesHatasi.eslesir(error, .cannotStartRecording) {
        mesaj = "Mikrofon başka bir uygulamada. O uygulamayı kapatıp yeniden başlatın."
    } else {
        mesaj = "Mikrofon yeniden açılamadı. Dinlemeyi yeniden başlatın."
    }
    hataylaBitir(HatHatasi(mesaj: mesaj, kod: "motor \(hataKodu(error))"))
}
```

(İlk ileti 9 kelime; `docs/tasarim.md` kısaltmak isterse "Görüşme sürüyor. Bitince Başlat'a dokunun." da doğru.)

#### Z-9 (Önemli, web) — Yedek süre izin istemi açıkken ekranı "Dinliyorum…"a geçiriyor (YÖ-4'ün kalanı)

**Yer:** `app.js:660-663` (5 sn yedek), `:587` (`onstart`), `:485-501` (`dinlemeBasladi`)

YÖ-4'ün asıl durumu "izin beklenirken ekran Dinliyorum der" idi. Bugün `HAZIRLIK_YEDEK` (5 sn) dolunca hiçbir tarayıcı
olayı gelmemiş olsa da aşama "dinliyor" oluyor. iPhone Safari'de ilk Başlat'ta mikrofon izni istemi açılır; kullanıcı
istemi 5 sn'den uzun okursa (bu uygulamanın kullanıcısında olası) izin verilmeden CANLI ve "Dinliyorum…" görünür —
ilke 5'in "en ağır hata" dediği durum, küçük ölçekte. Yedeğin tek kazancı, tarayıcı `start`/`audiostart` hiç
göndermezse ve kullanıcı sessizse ekranın "Hazırlanıyor…"da kalmamasıdır; bu durumda da ilk sonuç (`:592`) geçişi
yapar, yani yedeğe gerek yok. `start` olayının Safari'de izin isteminden önce mi sonra mı geldiğinden emin değilim
(D34); `audiostart` mikrofonun açıldığının daha güçlü kanıtıdır.

**Düzeltme:** yedek süre aşamayı değiştirmesin, yalnız Tanılama'ya uyarı yazsın; `start` yalnız kayıt olsun.

```js
t.onstart = () => {
  if (t === taniyici && !t.kapali && no === oturumNo)
    kaydet('tanıma', `start ${Math.round(performance.now() - baslatZamani)} ms`)
}
// ...
if (!dinlemeDogrulandi) {
  setTimeout(() => {
    if (!dinlemeDogrulandi && t === taniyici && no === oturumNo)
      kaydet('aşama', 'hazırlanıyor: 5 sn içinde audiostart ya da sonuç gelmedi', true)   // aşama değişmez
  }, HAZIRLIK_YEDEK)
}
```

Akış testinde değişmesi gereken tek yer `tests/web-akis.cjs:1119-1130` (durum e: "yedek süre dolunca Dinliyorum…"
ve `olay=yedek` beklentisi): artık 5 sn sonra "Hazırlanıyor…" ve CANLI yok, Tanılama'da uyarılı `aşama  hazırlanıyor: …`
satırı beklenmeli. `:1096` (`olay=start`) durumu da `start` geçiş olmaktan çıkarsa güncellenir. D34 cihazda `start` ile `audiostart` arasındaki farkı gösterecek; `start` izin sonrası geliyorsa yeniden
geçiş olayı yapılabilir.

### Öneri

- **Z-3 (Öneri; lider nokta 2)** — `Hat.swift:615-624`. Bekçi kesintisinden dönüşte tampon beklenirken (`kesinti == nil`,
  ekran "Duraklatıldı: mikrofondan ses gelmiyor") yapılandırma kesintisi gelip başarıyla çözülürse `.kesintiBitti`
  gider, ekran "Dinliyorum" olur; `bekciAlarmi` silinmediği için tampon gelmezse en geç ~2 sn sonra hata ile durur.
  **Hüküm: kabul edilebilir** — süre sınırlı ve D-0'ın her açılışta verdiği 2 sn'lik doğrulanmamış "Dinliyorum" payıyla
  aynı; sessiz ve sonsuz değil. Yine de tek satırla tutarlı kılınabilir: `if neden == .bekci || bekciAlarmi != nil`
  (alarm çözülmemişse hangi kesintiden dönülürse dönülsün tampon beklenir). Yan etkisi: AirPods takılınca mikrofonun
  kendiliğinden düzeldiği durumda da ekran ilk tampona dek (~100 ms beklenir) "Duraklatıldı"da kalır — zararsız.
- **Z-4 (Öneri; lider nokta 5)** — `Hat.swift:590`. 10 sn notu çalan (henüz açılmamış) aramada da dolar (çağrı 10 sn'den
  uzun çalabilir; arama kesintisinin çalmayla başladığını sanıyorum, emin değilim — D29). O anda "Durdur'a, sonra
  Başlat'a dokunun" demek erken; kullanıcı uyarsa Başlat "Görüşme sürerken dinleme başlatılamaz" der, zarar yok ama
  kafa karıştırır. Her duruma (alarm afişi, çalan arama, açılmış arama) uyan metin: **"Dinleme kendiliğinden sürmezse
  Durdur'a, sonra Başlat'a dokunun."** (8 kelime). Davranış aynı kalır.
- **Z-5 (Öneri)** — `Hat.swift:892-895`, `Durum.swift:177-189`. "Kesinti sırasında gelen çeviri okunmadı." notu Durdur'a
  dek ekranda kalıyor; 10 dakikalık oturumda kesintiden çok sonra hâlâ görünür ve hangi çevirinin okunmadığı belli
  değil. Öneri: kesintiden dönüldükten sonra ilk çeviri okunmaya başlayınca kaldır (`sesCal` içinde,
  `oku`'dan önce `bildir?(.not(.okunmayanCeviri, nil))`), ya da okunmayan satırı Geçmiş'te işaretle (arayüz denetçisine).
- **Z-6 (Öneri)** — `Hat.swift:599-601`. `kesinti  bitti` satırı her `surdur(deneme: 1)` çağrısında, dinleme gerçekten
  sürmeden yazılıyor: arka planda gelen `.ended`'de bir kez (`:600`, ardından `:604` "arka planda, dönüşte sürecek"),
  dönüşte `didBecomeActive`'de bir kez daha; bekçide tampon gelmeden. Kayıt okuyan kişi kesintinin iki kez bittiğini
  sanır. Öneri: `.ended` geldiğinde `kesinti  bitiş bildirimi <seçenek>`, `didBecomeActive`'de `kesinti  ön plana
  dönüldü`; `kesinti  bitti neden=<neden>` yalnız başarılı açılışta (bekçide `motor  tampon geldi` ile birlikte).
  `docs/cihaz-testi.md` satır adlarına dayanıyorsa kalite sorumlusuna haber verilmeli.
- **Z-7 (Öneri)** — `Hat.swift:554`. Telefon kesintisinde `.ended` gelir, 1. deneme başarısız olur, 0,5 sn içinde **yeni**
  bir `.began` gelirse (art arda iki arama, arama + alarm) neden aynı olduğu için `kesintiNo` artmaz; bekleyen 2. deneme
  yeni kesinti sürerken çalışıp dinlemeyi hatayla bitirebilir (YÖ-2'nin aynı nedenli kopyası; dar pencere). Düzeltme:
  `.began`'de `kesinti == .telefon` ise de `kesintiNo += 1` ve `uzunKesintiNotunuKur()` (yeni kesinti, yeni 10 sn).
- **Z-8 (Öneri)** — `Anahtarlik.swift:25-34`, `Arayuz/AyarlarEkrani.swift:73-76`. Anahtar Zinciri'ne yazılamazsa
  (A3) yalnız Tanılama'ya yazılıyor; Ayarlar'daki alan yeni değeri gösterir ama Alania eski (ya da hiç) anahtarı
  kullanır — sessiz başarısızlık (ilke 5). `set` `Bool` dönen bir işleve (`kaydet(_:) -> Bool`) çevrilip Ayarlar'da
  "Anahtar kaydedilemedi." satırı gösterilebilir. Olasılığı düşük (kilitli cihaz, `AfterFirstUnlock`).

### Birikime (yapılmadı, bildirildiği gibi)

Ön-7a (dil paketi "indirildi" ayrımı), Ön-10d (yeniden kurulumda kalan Anahtar Zinciri öğesi; D25 sonucuna göre),
Ön-12 (hazırlık sırasında arka plan). Ayrıca Z-3…Z-8 bu sprintte yapılmazsa.

---

## 3. Liderin beş noktası — hüküm

1. **Ön-11 ve hata alanı.** Liderin hatırladığı büyük olasılıkla doğru (emin değilim; cihazda D26): `setActive`
   `NSOSStatusErrorDomain`, `AVAudioEngine.start()` `com.apple.coreaudio.avfaudio`. **İki alan da kabul edilmeli**
   (Z-1); FourCC kodlar iki alanda aynı anlamdadır. Bugünkü kodda motor `'!rec'` verirse K11 iletisi eşleşmez.
2. **Bekçi + yapılandırma, ~2 sn "Dinliyorum".** Kabul edilebilir (sınırlı, sessiz değil, D-0'ın başlangıç payıyla
   aynı). Tek satırlık tutarlılık düzeltmesi Z-3. Akışı satır satır doğruladım: yapılandırma kesintisi `bekciAlarmi`'yı
   silmiyor (`:571-575`), `surdur` başarıda bekçiyi yeniden kuruyor (`:714`), sonraki turda `tamponGeldi` yanlışsa ve
   `gecen > 2` ise `:755-759` hata. Takılı kalma yok.
3. **Arama + arka plan.** Akış liderin anlattığı gibi (G11a telefon → arka plan, `kesintiNo` +1, 10 sn notu çıkmaz;
   dönüşte görüşme sürüyorsa iki `insufficientPriority` → G13). Davranış KR4 gereği kalır (D30). **İleti yanlış** —
   "Görüşme sürerken dinleme sürdürülemez. Görüşme bitince Başlat'a dokunun." olmalı (Z-2). Not: dönüşte bekleyen bir
   `.ended` görüşme bitmeden gelmez; görüşme bitmişse dönüş başarılı olur.
4. **`.durdu` yolunda çift `durdur()`.** Yan etkisi yok. İkinci çağrıda: `oturumNo`, `tur`, `sesNo` bir kez daha artar
   (hepsi yalnız "eşit mi" diye karşılaştırılır, zararsız); `mikrofonuSok` `baglandi == false` ile çıkar (giriş düğümüne
   dokunmaz); `cumleEkle` zaten nil; `sesiKes` boş oynatıcı/sentezleyicide `stop` + `bekleyici.bitir()` (bekleyen yok);
   `gozlemciler.kaldir()` boş listede; `oturumuKapat` `oturumEtkin == false` ile çıkar (ikinci `setActive(false)` yok).
   `Hat.durdur` Tanılama'ya yazmadığı için çift satır yok; `durdur  neden=hata …` yalnız `Durum.hataylaBitir`'den bir
   kez yazılır. Akışın hatası `Durum.calistir`'e ulaşınca kimlik artmış olduğu için (`Durum.swift:169`) ikinci kez
   işlenmez. Değişiklik gerekmez.
5. **10 sn notu çalan aramada.** Evet, dolabilir ve o anda erken/yanıltıcı (zarar vermez). Metin önerisi Z-4; cihazda D29.

---

## 4. Yeniden bakılan riskli noktalar (sorun bulmadıklarım)

- **Takılı kalan aşama:** Her kesinti nedeni için çıkış var: telefon → `.ended` ya da ön plana dönüş, yoksa 10 sn notu;
  arka plan → `didBecomeActive` koşulsuz `surdur`; yapılandırma → anında `surdur` + 0,5 sn'de 2. deneme (arka plandaysa
  dönüşte); bekçi → tampon ya da ~2 sn'de G13. Bekçi bekleme durumunda (`kesinti == nil`, ekran "Duraklatıldı") gelen
  telefon/arka plan alarmı siliyor ve normal G11'e giriyor.
- **Sayaçlar:** `kesintiNo` yalnız artıyor (yeni kesinti, neden değişimi); başarılı dönüş artırmıyor ama zamanlayıcılar
  ayrıca `kesinti != nil` (10 sn notu `:588`) ya da `guard let neden = kesinti` (`surdur` `:597`) denetliyor — başarıdan
  sonra uyanan eski zamanlayıcı bir şey yapmıyor. `sesNo` Başlat, Durdur ve telefon/arka plan kesintisinde artıyor;
  yapılandırma/bekçide artmadığı için sıra korunuyor (YÖ-1'in amacı). `sirada` eksiye düşemez.
- **Kaçan `continuation`:** `SesBekleyici`'de her `basla` öncekini bırakıyor; `sesiKes` koşulsuz `bitir()`; sigorta her
  beklemede kuruluyor ve yalnız bekleme bitince iptal ediliyor. `Hat.izinler` iki `continuation`'ı da tek kez çözüyor.
  Kaçak yol görmedim.
- **Ana aktör:** Yeni zamanlayıcılar (`uzunKesintiNotunuKur`, 2. deneme) `@MainActor` sınıfta kurulan `Task`; kapanış
  ana aktörü miras alıyor. `Anahtarlik` artık `@MainActor` ve tek okuyucusu `Hat.oku` (ana aktör) ile Ayarlar.
- **Tanılama ve ilke 3:** Yeni satırların hepsine baktım (`kesinti  neden değişti=…`, `… sn sürdü…`, `öncelik yetersiz…`,
  `motor  tampon geldi`, `ses  atlandı (kesinti)`, `tanıma bitti  neden=sessizlik`, `anahtar  kaydedilemedi <OSStatus>`,
  web `aşama  dinliyor olay=…`, `çeviri  istek iptal edildi`). Metin, ad ya da yol yok.
- **Web iptal:** Durdur → `ceviriKesici.abort()` → `getir`'in iç denetleyicisi kesiliyor → `cevir` `iptal` kodu →
  `cevirVeOku` sessiz çıkıyor; yeni oturum `cevirKuyrugu`'nu sıfırladığı için eskisini beklemiyor.

---

## 5. Şartnamede bu turda değişenler (`docs/ses-hatti.md`)

Uygulanmış davranışla eşitlendi; kural kimlikleri korundu, değişenler "(S01 tur 3)" ile işaretli: D-0 (hata ile durmada
aşama hemen "duruyor"; bekçi dönüşünde tampona dek "kesintide"), G6 (`neden=sessizlik`), G9 (sistem açıklaması
yazılmaz), G11a (telefon ↔ arka plan dahil her ses kesen neden değişimi), G12 (bekçide tampon bekleme ve Tanılama
satırları; arka planda deneme yok), G13 (nedene göre ileti — Z-2), G14 (bekçinin ikinci alarmı), § 2.3 adım 4 (yalnız
bağlıysa sök), T1 (iki yolda internet iletisi), K4 (10 sn notunun Tanılama satırı ve arama açılınca çıkmaması), K5 ve
K11 (iki hata alanı — Z-1), K15 ve C6 (gerçek tampon zamanı), C7, S4 (not ve `ses  atlandı (kesinti)`), A2 (kırpma,
önbellek), A3, § 6 (web aşama geçişi ve Z-9, kesinti satır adları, kopya başlığı, çeviri iptali).

## 6. Cihaz testine aktarılanlar (`docs/ses-hatti.md` § 7)

Eklenen: **D26–D35** (hiçbir eski numara değişmedi ya da silinmedi; geçersiz kalan soru yok).

| No  | Konu | Bağlı bulgu |
| --- | ---- | ----------- |
| D26 | Motor ve ses oturumu hata alanı/kodu (başka uygulama kaydediyor; görüşme sürüyor) | Z-1, K5, K11 |
| D27 | Yapılandırma kesintisinde çalan sesin sürmesi, sıradakilerin okunması | YÖ-1, K1–K3 |
| D28 | Telefon kesintisinde sesin kesilmesi ve "okunmadı" notu | YÖ-1, S4 |
| D29 | Çalan aramada 10 sn notu; reddedince kendiliğinden sürme | Ön-5, Z-4 |
| D30 | Arama açılıp görüşme sürerken dönüş: hata ve ileti; görüşme bitince | Ön-4, Z-2 |
| D31 | Bekçi alarmından dönüş: süre, ekran, ikinci alarm iletisi | YE1, Z-3 |
| D32 | Sunucu dilinde internetsiz: hangi yol, ileti; cihaz dilinde ileti çıkmaması | YÖ-5 |
| D33 | Eski sürümden güncellemede anahtar taşıma; alanı boşaltınca Alania kapanması | YÖ-3 |
| D34 | (web) Safari'de `start` / `audiostart` / ilk sonuç sırası, aşama geçişi, `olay=yedek` | YÖ-4, Z-9 |
| D35 | (web) Safari'de kilit ekranı / sekme değişimi ve dönüş | § 6 |

---

## 7. Geliştiriciye iş listesi (son düzeltme turu)

**iOS (`ios-gelistirici`)** — öncelik sırasıyla:

1. **Z-1** `SesHatasi.eslesir` yardımcısı (iki alan); `Durum.turkce` ve `Hat.oncelikYetersiz` onu kullansın.
2. **Z-2** `surdur` 2. deneme başarısızlığında nedene göre ileti.
3. (Öneri, tek satır) **Z-4** 10 sn notu metni: "Dinleme kendiliğinden sürmezse Durdur'a, sonra Başlat'a dokunun."
4. (Öneri, tek satır) **Z-3** `if neden == .bekci || bekciAlarmi != nil`.
5. (Öneri) **Z-7** aynı nedenli `.began`'de `kesintiNo += 1`; **Z-6** Tanılama satır adları (kalite sorumlusuyla
   eşgüdümlü); **Z-5** okunmadı notunun kaldırılması; **Z-8** anahtar yazma hatasının ekranda söylenmesi.

Z-1 ve Z-2 davranış değiştirmez (yalnız ileti), KR4'e uyar; Mac derlemesinden geçmeleri yeter. 3 ve 4 aynı commit'e
girebilir; 5'teki maddeler yapılmazsa birikime.

**Web (`web-gelistirici`):**

1. **Z-9** yedek süre aşamayı değiştirmesin (yalnız uyarı satırı); `onstart` yalnız kayıt. Akış testinde durum (e)
   `tests/web-akis.cjs:1119-1130` "5 sn sonra hâlâ Hazırlanıyor…, CANLI yok, uyarı satırı var" olarak; `start` geçiş
   olmaktan çıkarsa `:1096` durumu "start yalnız kayıt, aşama audiostart'ı bekler" olarak güncellenir.
