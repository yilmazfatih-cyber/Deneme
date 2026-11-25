# Ses hattı şartnamesi

Sahibi: `ses-uzmani` · İlk sürüm: S01 plan kapısı (25.11.2026)

Bu belge iPhone uygulamasının (ve farkları ayrıca yazılarak web deneme sürümünün) ses hattının **nasıl davranması
gerektiğini** yazar. Kodu anlatmaz; kod buna uyar. Kodun bugünkü hâliyle farkları `docs/sprints/S01/reviews/ses-uzmani-1.md`
içindedir. Kimlikli kurallar (ör. **Y3**, **C2**) incelemelerde ve `docs/cihaz-testi.md` içinde bu kimlikle anılır.

**Kaynak notu.** Bu belge yazılırken Apple geliştirici belgelerinin JSON sürümüne erişilebildi; aşağıda "(Apple belgesi)"
diye işaretlenen cümleler oradan okunmuştur. Geri kalanı deneyime dayanır; emin olunmayan her şey § 7
"Doğrulanamayanlar" listesindedir ve cihazda denenmeden kesin bilgi sayılmaz (ilke 8).

---

## 1. Ses yolu

### 1.1 Ses oturumu yapılandırması

| Ayar          | Değer                                                        | Neden                                                                                                                       |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Kategori      | `.playAndRecord`                                             | Aynı anda dinleyip okumak için tek kategori.                                                                                 |
| Kip           | `.default`                                                   | `.voiceChat` / `.videoChat` ses işleme ve HFP'ye yönelir (ilke 2). `.measurement` cihazda karşılaştırılacak (bkz. D6).        |
| Seçenekler    | yalnız `.allowBluetoothA2DP`                                 | A2DP yalnız çıkış profilidir (Apple belgesi); AirPods'a stereo, yüksek kaliteli ses gider, mikrofon iPhone'da kalır (ilke 1, 2). |
| Konulmayacak  | `.allowBluetoothHFP` (eski adı `.allowBluetooth`)            | A2DP ile birlikte verilirse sistem HFP'ye öncelik verir (Apple belgesi): AirPods mikrofonu açılır, ses telefon kalitesine düşer. |
| Konulmayacak  | `.defaultToSpeaker`                                          | Kulaklık yokken ses hoparlörden çıkar, mikrofon kendi Türkçe sesini duyup yeniden tanır.                                    |
| Konulmayacak  | `.mixWithOthers`, `.duckOthers`                              | Dinlerken müzik/podcast durur (tanımayı bozmasın); Durdur'da `.notifyOthersOnDeactivation` ile geri gelir.                   |
| Tercih giriş  | `setPreferredInput(<.builtInMic portu>)`                     | Mikrofonlu kablolu kulaklıkta giriş kendiliğinden kulaklık mikrofonuna geçer; ilke 2 gereği her zaman iPhone mikrofonu.     |

**Y1 — Sıra.** Açılış her zaman şu sırayla yapılır: `setCategory` → `setActive(true)` → `setPreferredInput(builtInMic)`
(Apple belgesi: tercih edilen giriş yalnız kategori ayarlanıp oturum etkinleştikten sonra verilir) → ses yolunu oku ve
Tanılama'ya yaz → `inputNode.outputFormat(forBus: 0)` oku → biçim geçerli değilse (0 Hz ya da 0 kanal) **hata** →
mikrofon bağlantısını (tap) kur → tanıma görevini aç → `engine.prepare()` → `engine.start()`.

**Y2 — Biçim.** Mikrofon bağlantısı her zaman o anki donanım biçimiyle (`inputNode.outputFormat(forBus: 0)`) kurulur.
Biçim değişince (bkz. K-motor) bağlantı söküp yeniden kurulur. Geçersiz biçimde bağlantı kurmadan **sessizce dönmek
yasaktır**: ya hata fırlatılır ya da durum KESİNTİDE'ye geçip ekranda söylenir (ilke 5).

**Y3 — Seslendirme aynı oturumu kullanır.** `AVSpeechSynthesizer.usesApplicationAudioSession` varsayılanı (`true`) değiştirilmez;
`false` olursa sistem ayrı bir ses oturumu açar (Apple belgesi) ve yol kuralları tutmaz.

### 1.2 Ses yolu tablosu

| Bağlı olan                         | Çıkış (çeviri sesi)        | Giriş (dinleyen)          | Beklenen `currentRoute`                          | Ekranda (kulaklık satırı)                                  |
| ---------------------------------- | -------------------------- | ------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| AirPods (ya da başka BT kulaklık)  | AirPods, A2DP stereo       | iPhone dahili mikrofon    | çıkış `.bluetoothA2DP`, giriş `.builtInMic`      | "AirPods Pro bağlı" (portun adı ekranda gösterilir)        |
| AirPods ama yol HFP'ye düşmüş      | AirPods, HFP (düşük kalite) | AirPods mikrofonu         | çıkış/giriş `.bluetoothHFP`                       | Sarı uyarı: "AirPods telefon kipinde; ses kalitesi düşük". **Olmamalı**; Tanılama'ya yazılır |
| Kablolu kulaklık (mikrofonlu/suz)  | Kulaklık                   | iPhone dahili (Y1 ile)    | çıkış `.headphones` (USB-C'de `.usbAudio` olabilir, D9), giriş `.builtInMic` | "Kablolu kulaklık bağlı"                     |
| Kulaklık yok                       | Ahize (`.builtInReceiver`) | iPhone dahili             | çıkış `.builtInReceiver`, giriş `.builtInMic`    | Sarı uyarı: "AirPods bağlı değil. Çeviriyi duymak için AirPods'u takın." |
| Hoparlöre / AirPlay'e alınmış      | Hoparlör / AirPlay         | iPhone dahili             | çıkış `.builtInSpeaker` / `.airPlay`             | Sarı uyarı: "Ses hoparlörden çıkıyor; mikrofon kendi sesini duyabilir." Tanılama'ya yazılır |
| Araç (CarPlay) / BT hoparlör       | Araç / hoparlör (A2DP)     | iPhone dahili             | `.carAudio` ya da `.bluetoothA2DP`               | A2DP hoparlör AirPods'tan ayırt edilemez (D10); CarPlay'de sarı uyarı |

Kurallar:

- **Y4** Ekrandaki kulaklık satırı `routeChangeNotification` ile ve ön plana dönüşte güncellenir; ekranda portun adı
  görünebilir, **Tanılama'ya yalnız tür yazılır** (`bluetooth`, `kablolu`, `ahize`, `hoparlör`, `hfp`, `airplay`, `araç`),
  ad asla yazılmaz (ilke 3, brief).
- **Y5** "Kulaklık bağlı" yalnız çıkış `.bluetoothA2DP`, `.bluetoothLE`, `.headphones` (ve D9 doğrulanırsa `.usbAudio`)
  olduğunda söylenir. `.bluetoothHFP` "bağlı" sayılır ama uyarıyla gösterilir.
- **Y6** Giriş `.builtInMic` değilse (Y1'e rağmen) dinleme sürer, ekranda sarı uyarı çıkar ve Tanılama'ya `ses yolu giriş=<tür>` yazılır.

---

## 2. Durum makinesi

### 2.1 Durumlar

| Durum            | Anlamı                                                         | Ekranda                                                                 | Açık kaynaklar                                                                                          |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **DURUYOR**      | Hiçbir şey açık değil                                          | "Dinlemeyi Başlat"; dil seçilebilir                                    | Yalnız uygulama boyu ses yolu gözlemcisi (Y4) ve seslendirme döngüsü (boşta)                              |
| **HAZIRLANIYOR** | Çeviri oturumu alındı; dil paketi ve izinler bekleniyor        | "Hazırlanıyor…" (dil paketi inerken "Dil paketi indiriliyor…"); **CANLI rozeti ve "Dinliyorum" yok**; düğme "Vazgeç" ya da "Durdur" | `TranslationSession` (yalnız `translationTask` kapanışı içinde), oturum kimliği                         |
| **DİNLİYOR**     | Mikrofondan ses akıyor, tanıma açık                            | CANLI rozeti, "Dinliyorum…" ya da canlı metin, "Durdur"                 | Ses oturumu (etkin), motor (çalışıyor), mikrofon bağlantısı, tanıma görevi, duraklama sayacı, bekçi sayacı, kesinti gözlemcileri, ekran kilidi engeli, cümle akışı |
| **KESİNTİDE**    | Dinleme oturumu sürüyor ama mikrofon geçici olarak kapalı      | CANLI rozeti yerine "Duraklatıldı: <neden>" (telefon görüşmesi / uygulama arka planda / ses yolu değişiyor); "Dinliyorum" **yok** | Cümle akışı, oturum kimliği, kesinti gözlemcileri. Motor durmuş, tanıma görevi iptal, seslendirme durmuş, sıra boş |
| **DURDURULUYOR** | Kapatma sırası işliyor (anlık, eşzamanlı)                      | Değişmez; bitince DURUYOR                                               | Aşağıdaki kapatma sırasıyla hepsi kapanır                                                               |

**Değişmez kural (D-0):** Ekranda "Dinliyorum…" ya da CANLI rozeti **yalnız DİNLİYOR durumunda** ve bekçi (C6) son 2
saniyede mikrofondan ses tamponu geldiğini doğrulamışken görünür. Arayüz bu durumu tek bir alandan okur (ör.
`Durum.asama`); `ayar != nil` gibi dolaylı bir işaretten çıkarmaz.

**Oturum kimliği (D-1):** Her Başlat ve her Durdur bir tamsayı kimliği artırır. Bir `await`'ten dönen her iş (izin,
dil paketi, çeviri, Alania isteği, tanıma geri çağrısı, sayaç) kendi kimliğini o anki kimlikle karşılaştırır; tutmuyorsa
hiçbir yan etki yapmadan çıkar. Görev iptaline (`Task.isCancelled`) ek olarak bu denetim de yapılır; çünkü
`translationTask`'in yapılandırma `nil` olunca görevini iptal ettiği Apple belgesinde yazmıyor (D1). Apple belgesi,
yapılandırma değiştikten sonra eski `TranslationSession`'ın kullanılmasının `fatalError` ile çöktüğünü söyler; bu yüzden
**her `translate` çağrısından hemen önce** kimlik denetlenir.

### 2.2 Geçişler, açılan/kapanan kaynaklar ve Tanılama olayları

Tanılama satırı biçimi brief'teki gibidir: `SS:DD:SS.mmm  olay  ayrıntı`. Hiçbir satıra konuşma ya da çeviri metni,
cihaz ya da kulaklık adı yazılmaz.

| No  | Geçiş                       | Tetikleyen                                        | Yapılan (sırasıyla)                                                                                                                                         | Tanılama'ya yazılan (o anda)                                                                       |
| --- | --------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| G1  | DURUYOR → HAZIRLANIYOR      | Başlat'a dokunuş                                  | Oturum kimliği +1; hata temizlenir; çeviri yapılandırması atanır                                                                                             | `başlat  dil=en`                                                                                   |
| G2  | HAZIRLANIYOR (içinde)       | Dil paketi denetimi                               | Paket durumu okunur (kurulu mu); `prepareTranslation()` beklenir                                                                                             | `dil paketi  hazır` / `indirildi (… ms)` / `hata <kod>` — sonuç gelince                            |
| G3  | HAZIRLANIYOR (içinde)       | İzin istemleri                                    | Konuşma tanıma izni, sonra mikrofon izni                                                                                                                     | `izin  mikrofon=verildi konuşma=reddedildi` — ikisi de yanıtlanınca, tek satır                    |
| G4  | HAZIRLANIYOR → DURUYOR      | İzin yok / dil paketi hatası / Vazgeç             | Hiçbir ses kaynağı açılmamıştır; yalnız yapılandırma `nil`                                                                                                   | `durdur  neden=izin yok` / `neden=hata dil paketi` / `neden=düğme`                                 |
| G5  | HAZIRLANIYOR → DİNLİYOR     | İzinler tamam, kimlik hâlâ geçerli                | Y1 sırası; tanıyıcı cihazda tanımayı desteklemiyorsa **açılmaz** (T1); kesinti gözlemcileri; bekçi; ekran kilidi engeli; durum = DİNLİYOR                   | `ses yolu  çıkış=bluetooth giriş=dahili`, ardından `tanıma açıldı  en-US cihazda`                  |
| G6  | DİNLİYOR (döngü)            | Cümle kapandı (§ 3)                               | Cümle akışa yazılır; yeni tanıma görevi açılır                                                                                                               | `cümle  kelime=7` (cümle akışa yazıldığı anda)                                                     |
| G7  | DİNLİYOR (döngü)            | Çeviri döndü                                      | Kimlik denetimi → satır eklenir → seslendirme sırasına girer                                                                                                  | `çeviri  182 ms` ya da `çeviri  hata <kod>` (çeviri bitince)                                       |
| G8  | DİNLİYOR (döngü)            | Ses çalındı                                       | § 5                                                                                                                                                         | `ses  alania 640 ms` (yanıt gelince; ms = istekten ilk bayta) / `ses  apple` (okuma başlarken) / `ses  alania hatası http=401` ya da `zaman aşımı` |
| G9  | DİNLİYOR (döngü)            | Tanıma görevi kendiliğinden bitti                 | § 3.2                                                                                                                                                       | `tanıma bitti  neden=son sonuç` / `neden=hata <alan>/<kod> <açıklama>`; art arda aynı neden 5 sn içinde tekrarlanırsa satır yazılmaz, sayaç artar (`×12`) |
| G10 | DİNLİYOR (döngü)            | Ses yolu değişti                                  | Kulaklık satırı güncellenir; motor durduysa G11                                                                                                              | `ses yolu  çıkış=ahize neden=eski cihaz gitti`                                                     |
| G11 | DİNLİYOR → KESİNTİDE        | Kesinti başladı / arka plan / motor yapılandırması değişti / bekçi alarmı | Yarım cümle gönderilir (C4); tanıma görevi iptal (tur +1); mikrofon bağlantısı sökülür; motor durur; çalan ses kesilir, ses sırası boşaltılır, uçuştaki Alania isteği iptal; durum = KESİNTİDE | `kesinti  başladı neden=telefon|arka plan|yapılandırma|bekçi`                                      |
| G12 | KESİNTİDE → DİNLİYOR        | Kesinti bitti / ön plana dönüldü / yapılandırma değişikliği işlendi | Y1 sırası (kategori zaten ayarlı; `setActive(true)` dahil); yeni tanıma; bekçi sıfırlanır                                                                      | `kesinti  bitti`, ardından `motor  yeniden başlatıldı` ve `ses yolu …`                              |
| G13 | KESİNTİDE → DURUYOR (hata)  | Yeniden başlatma iki denemede başarısız / medya servisleri sıfırlandı / tanıma kullanılamaz | Kapatma sırası; ekranda ne yapılacağını söyleyen Türkçe hata                                                                                                  | `motor  başlatılamadı <alan>/<kod>`, ardından `durdur  neden=hata`                                  |
| G14 | DİNLİYOR → DURUYOR (hata)   | Art arda boş tanıma (T3) / mikrofon biçimi geçersiz | Kapatma sırası; Türkçe hata                                                                                                                                 | `durdur  neden=hata tanıma <kod>`                                                                  |
| G15 | Her durum → DURDURULUYOR    | Durdur'a dokunuş                                  | Kapatma sırası                                                                                                                                              | `durdur  neden=düğme`                                                                              |
| G16 | (her durumda)               | Uygulama etkin oldu / etkinliğini yitirdi        | DİNLİYOR'da: arka plana geçişte G11, dönüşte G12. Yalnız etkinlik kaybı (Kontrol Merkezi, bildirim) dinlemeyi durdurmaz                                     | `uygulama  etkinliğini yitirdi` / `arka planda` / `etkin oldu`                                     |

### 2.3 Kapatma sırası (G13, G14, G15)

Her adım bir önceki başarısız olsa da çalışır:

1. Oturum kimliği +1 ve tanıma turu +1 (geç gelen her sonuç bundan sonra yok sayılır).
2. Duraklama sayacı ve bekçi sayacı iptal.
3. Tanıma görevi iptal, referansı bırakılır.
4. Mikrofon bağlantısı sökülür, motor durdurulur.
5. Cümle akışı kapatılır. **Akışta bekleyen ama henüz çevrilmemiş cümleler çevrilmez** (D-1 denetimi bunu sağlar).
   Ekrandaki yarım cümle atılır (çevrilmez, okunmaz).
6. Uçuştaki Alania isteği iptal; çalan ses (oynatıcı ve Apple sesi) hemen kesilir; ses sırası boşaltılır.
7. Kesinti gözlemcileri kaldırılır (uygulama boyu ses yolu gözlemcisi kalır).
8. Ekran kilidi engeli kaldırılır.
9. `setActive(false, options: .notifyOthersOnDeactivation)`; hata dönerse (ör. `isBusy`) Tanılama'ya yazılır. Apple
   belgesine göre `isBusy` dönse de oturum etkisizleşir.
10. Durum = DURUYOR; canlı metin boşaltılır.

---

## 3. Cümle ayırma

**C1 — Sessizlik.** Canlı metin **değiştikten** sonra 1,2 saniye (`duraklama`) yeni bir değişiklik gelmezse cümle biter.
Sayaç yalnız metin gerçekten değiştiğinde sıfırlanır; aynı metni yineleyen ara sonuçlar sayacı uzatmaz.

**C2 — Cümle bitince:** Metin kırpılır; boş değilse cümle akışına yazılır; eski tanıma görevi iptal edilir; hemen yeni
görev açılır. Mikrofon bağlantısı ve motor cümleler arasında **durdurulmaz**; boşlukta söylenen kelimeler kaybolmasın
diye bağlantının her cümlede söküp yeniden kurulmaması tercih edilir (tampon, o anki isteğe yönlendirilir).

**C3 — Uzun konuşma.** Sessizlik gelmeden süren konuşma bu sürümde zorla bölünmez. Cümle 20 saniyeyi aşıyorsa bölmek
S02'de cihaz gözlemine göre karar verilecek öneridir (ROADMAP).

**C4 — Yarım cümlenin kaderi.**

| Olay                                        | Yarım cümle                                     |
| ------------------------------------------- | ----------------------------------------------- |
| Tanıma kendiliğinden bitti (son sonuç/hata) | Hemen gönderilir (1,2 sn beklenmez)             |
| Kesinti, arka plan, motor yapılandırması    | Gönderilir (çevrilir, okunması § 5'e bağlı)     |
| Durdur                                      | **Atılır**                                      |
| Hata ile durma                              | Atılır                                          |

### 3.2 Tanıma görevinin kendiliğinden bitmesi

- **T1 — Cihazda tanıma şart.** `supportsOnDeviceRecognition` `false` ise `requiresOnDeviceRecognition` uygulanmaz ve ses
  ağa gider (Apple belgesi). İlke 3 gereği bu durumda dinleme **açılmaz**; ekranda: "Bu dil için cihazda konuşma tanıma
  yok. Ayarlar › Genel › Klavye'den dikte dilini ekleyin." (yol D4'te doğrulanır). Tanılama: `tanıma açıldı  ar-SA sunucuda
  — reddedildi`.
- **T2 — Sonuçla biten görev:** C4'teki gibi cümle gönderilir, yeni görev açılır.
- **T3 — Sonuçsuz biten görev:** Yeni görev hemen açılır. Açıldıktan sonraki 2 saniye içinde metin üretmeden biten
  görevler sayılır; art arda **5** olunca dinleme durur (G14) ve ekranda hata kodu ile "Konuşma tanıma çalışmıyor.
  Dinlemeyi yeniden başlatın." yazar. Metin üreten ya da 2 saniyeden uzun yaşayan her görev sayacı sıfırlar. Sonsuz
  sessiz yeniden açma döngüsü yasaktır (ilke 5).
- **T4 — Tanıyıcı kullanılamaz oldu** (`availabilityDidChange` → `false`): KESİNTİDE (neden "konuşma tanıma kullanılamıyor");
  10 saniye içinde geri gelmezse G13.
- **T5 — Geç sonuç:** İptal edilmiş görevden ya da önceki turdan gelen sonuç hiçbir duruma dokunmaz (tur numarası).

---

## 4. Kesinti senaryoları

"Kodda karşılığı" sütunu kodun **bulunması gereken** karşılığıdır; bugünkü durum incelemededir.

| No   | Senaryo                                         | Beklenen davranış                                                                                                   | Ekranda                                                         | Kodda karşılığı                                                                                     |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| K1   | AirPods takıldı / bağlandı (dinlerken)          | Ses AirPods'a geçer. Motor yapılandırması değişirse G11→G12 (yarım cümle gönderilir). Giriş iPhone'da kalır.          | Kulaklık satırı "AirPods … bağlı"                              | `routeChangeNotification` (neden `newDeviceAvailable`), `AVAudioEngineConfigurationChange`         |
| K2   | AirPods çıkarıldı / kutuya kondu / kulaktan alındı | Dinleme sürer; ses ahizeye geçer; çalmakta olan cümle ahizeden sürer                                              | Sarı uyarı (kulaklık yok)                                       | `routeChangeNotification` (neden `oldDeviceUnavailable`) + gerekirse yapılandırma değişikliği       |
| K3   | AirPods başka cihaza geçti (otomatik geçiş)     | K2 ile aynı                                                                                                         | Sarı uyarı                                                      | Aynı                                                                                                |
| K4   | Telefon çağrısı geldi                           | Kesinti başlar: G11 (neden telefon). Çağrı reddedilir ya da biter: G12. Bitiş bildirimi gelmezse ön plana dönüşte G12 | "Duraklatıldı: telefon görüşmesi"                              | `interruptionNotification` `.began` / `.ended`; dönüşte `didBecomeActive`                          |
| K5   | Görüşme sürerken Başlat                         | Oturum etkinleşemez (`insufficientPriority`, Apple belgesi): G4 benzeri durma                                        | "Görüşme sürerken dinleme başlatılamaz."                        | `setActive(true)` hatasının koduna göre Türkçe mesaj                                               |
| K6   | Siri                                            | Uygulama etkinliğini yitirir, ses oturumu kesilir: G11; Siri kapanınca G12                                          | "Duraklatıldı"                                                  | `.began`/`.ended` + `didBecomeActive`                                                               |
| K7   | Alarm / zamanlayıcı                             | Kesinti: G11; kapatılınca G12                                                                                       | "Duraklatıldı"                                                  | `interruptionNotification`                                                                          |
| K8   | Uygulama arka plana gitti                       | Arka plan kipi yok (plan). `didEnterBackground`'da G11 (neden arka plan) ve oturum etkisizleştirilir (Apple belgesi önerisi); ön plana dönüşte **koşulsuz** G12 | Dönüşte kısa süre "Duraklatıldı", sonra "Dinliyorum"           | `didEnterBackgroundNotification`, `didBecomeActiveNotification`. Dönüşte gelen gecikmeli `.began` (neden `appWasSuspended` / `wasSuspendedKey`) yok sayılır |
| K9   | Ekran kilitlendi (yan tuş)                      | K8 ile aynı. Kendiliğinden kararma dinlerken engellidir                                                             | Aynı                                                            | `isIdleTimerDisabled` + K8                                                                          |
| K10  | Kontrol Merkezi / bildirim perdesi              | Dinleme **sürer** (yalnız etkinlik kaybı); kesinti gelirse K4 kuralları                                             | Değişmez                                                        | `willResignActive` yalnız Tanılama'ya yazılır                                                       |
| K11  | Başka uygulama mikrofonu aldı                   | Kesinti olarak gelir: G11; mikrofon geri alınamazsa iki denemeden sonra G13                                          | "Duraklatıldı", gerekirse "Mikrofon başka bir uygulamada."       | `.began`; biçim 0 Hz ise Y2 hatası                                                                  |
| K12  | İnternet kesildi                                | Tanıma ve çeviri cihazda olduğu için akış sürer. Alania: § 5 yedeği                                                 | "Alania'ya ulaşılamadı; Apple sesi kullanılıyor."               | Alania zaman aşımı / hata yolu                                                                       |
| K13  | Medya servisleri sıfırlandı                     | Apple belgesi: ses nesneleri yeniden kurulur, kayıt kullanıcı başlatmadan sürdürülmez → G13; motor ve sentezleyici yeni nesneyle değiştirilir | "Ses sistemi yeniden başladı. Dinlemeyi yeniden başlatın."      | `mediaServicesWereResetNotification`                                                                |
| K14  | Motor yapılandırması değişti (örnekleme hızı)   | Motor kendini durdurur (Apple belgesi): G11 → bağlantı yeni biçimle → G12                                            | Kısa "Duraklatıldı" görünmeyebilir                              | `AVAudioEngineConfigurationChange`                                                                  |
| K15  | Bekçi: 2 sn mikrofon tamponu gelmedi            | DİNLİYOR'da tampon 2 sn gelmezse G11 (neden bekçi) → G12; iki deneme başarısızsa G13                                 | "Duraklatıldı", sonra hata                                      | Mikrofon bağlantısında son tampon zamanı + 1 sn'lik ana aktör sayacı                               |
| K16  | Çıkış hoparlöre / AirPlay'e alındı              | Dinleme sürer                                                                                                        | Sarı uyarı (Y4 tablosu)                                         | `routeChangeNotification`                                                                            |

**C6 — Bekçi.** Mikrofon bağlantısının geri çağrısı her tamponda kilitli bir "son tampon zamanı"nı günceller. Ana aktörde
1 saniyelik sayaç DİNLİYOR durumunda bu zamanı okur. Bekçi; bildirim gelmeyen ya da `isRunning` yanlış `true` dönen
durumlara karşı son çaredir ve D-0'ın tek doğrulayıcısıdır.

**C7 — Yeniden başlatma.** G12 iki kez denenir (ikincisi 0,5 sn sonra). İkisi de başarısızsa G13. Başarısızlık sessiz
kalmaz.

---

## 5. Seslendirme

- **S1 — Tek sıra:** Çeviriler geliş sırasıyla tek bir FIFO sıraya girer; her öğe (oturum kimliği, metin) taşır.
- **S2 — Üst üste binmez:** Sıradaki öğe, öncekinin **çalması bitmeden** başlamaz. Bu Apple sesi için de geçerlidir:
  `speak` çağrısı dönünce değil, sentezleyici "bitti" ya da "iptal" bildirince sonraki öğeye geçilir. Alania ile Apple
  sesi karışık gelse de aynı anda iki ses çalmaz.
- **S3 — Eski oturum:** Öğenin kimliği o anki oturum kimliğiyle tutmuyorsa çalınmaz. Kimlik; sıradan alınırken, Alania
  yanıtı gelince ve çalmaya başlamadan hemen önce denetlenir.
- **S4 — Durdur ve kesinti:** Çalan ses hemen kesilir (`stop`, `stopSpeaking(at: .immediate)`), uçuştaki Alania isteği
  iptal edilir, sıra boşaltılır. Durdur'dan sonra yeni oturumun ilk cümlesi eski isteği beklemez.
- **S5 — Alania → Apple yedeği:** Anahtar yalnız `Anahtarlik.alaniaAnahtari`'dan okunur. Anahtar boşsa Apple sesi.
  İstek **toplam 5 saniye** içinde (bağlantı + yanıt + gövde) bitmezse iptal edilir ve aynı cümle Apple sesiyle okunur
  (değer cihazda ayarlanabilir, D12). Yanıt 200 değilse ya da ses çözülemezse aynı yedek. Yedeğe düşüldüğünde ekranda kısa
  bir not görünür ve Tanılama'ya HTTP kodu yazılır (ilke 5).
- **S6 — Devre kesici:** Art arda 3 Alania hatasından sonra o dinleme oturumunun geri kalanında doğrudan Apple sesi
  kullanılır (her cümlede 5 sn beklenmez, ilke 4); ekrandaki not oturum boyunca kalır. 401/403 ilk seferde kesiciyi açar ve
  "Alania anahtarı geçersiz" der.
- **S7 — Türkçe ses yoksa:** `AVSpeechSynthesisVoice(language: "tr-TR")` `nil` dönerse ekranda "Türkçe ses yüklü değil"
  notu çıkar, Tanılama'ya yazılır; okuma yine denenir.
- **S8 — Kulaklık yokken:** Ses ahizeden çıkar. Ahize sesinin iPhone mikrofonuna geri dönüp tanınması cihazda ölçülür
  (D7); gözlenirse "okurken dinlemeyi beklet" seçeneği iPhone'a da eklenir.
- **S9 — Gizlilik:** Alania'ya yalnız Türkçe çeviri metni ve ses adı gider; asıl cümle gitmez (ilke 3).

---

## 6. Web deneme sürümü farkları

Web sürümü aynı durum adlarını ve aynı Tanılama olaylarını kullanır; şu farklarla:

- **Ses yolu denetlenemez.** Tarayıcı mikrofon ve çıkış seçimini kendisi yapar; iPhone Safari'de tanıma sürerken AirPods
  mikrofonunun (HFP) açılması ve sesin telefon kalitesine düşmesi olasıdır (D14). Tanılama'ya `ses yolu  bilinmiyor` yazılır.
- **Tanıma yeniden açılması** `onend` üzerinden yapılır; T3 sayacının karşılığı art arda 6 boş bitiştir (bugünkü kod).
- **Askıya alma nedenleri ayrı tutulur:** "okurken beklet" ve "sekme gizli" iki ayrı işarettir; tanıma ancak ikisi de
  kalkınca yeniden açılır. Gizli sekmede tanıma açılmaz.
- **Durdur**, bekleyen cihaz seslendirmesinin sözünü (Promise) hemen çözer; yeni oturum eski sesin sigortasını beklemez.
- Çeviri hatası dinlemeyi durdurmaz (bugünkü kod buna uyuyor).

---

## 7. Doğrulanamayanlar (yalnız gerçek iPhone + AirPods'ta görülebilir)

`kalite-sorumlusu` her birini `docs/cihaz-testi.md` içinde en az bir senaryoya çevirir.

| No  | Soru                                                                                                                                         | Nasıl gözlenir                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | `.translationTask` yapılandırma `nil` olunca çalışan görevi iptal ediyor mu? (Apple belgesi yalnız "nil değilken ve değişince çalışır" diyor) | Dil paketi inerken Durdur'a bas; mikrofon göstergesi (turuncu nokta) yanmamalı |
| D2  | `.playAndRecord` + `.allowBluetoothA2DP` ile AirPods bağlıyken giriş gerçekten `.builtInMic` mi, çıkış A2DP mi?                              | Tanılama `ses yolu` satırı; kulaklıkta ses kalitesi (müzik gibi mi, telefon gibi mi) |
| D3  | AirPods otomatik kulak algılaması: tek/iki kulaklık çıkarılınca yol ne oluyor, motor yapılandırma bildirimi geliyor mu?                       | Tanılama `ses yolu` ve `kesinti` satırları                                     |
| D4  | Yedi dilin hangileri `supportsOnDeviceRecognition == true`? (özellikle `ar-SA`, `ru-RU`); model inmemişse ne dönüyor; ekrandaki ayar yolu doğru mu | Her dili sırayla başlat; `tanıma açıldı … cihazda/sunucuda` satırı              |
| D5  | Cihazda tanıma sessizlikte görevi kendiliğinden bitiriyor mu, hangi hata koduyla, kaç saniyede?                                              | 30 sn sessiz bekle; `tanıma bitti` satırları                                    |
| D6  | `.default` ile `.measurement` kipi arasında tanıma doğruluğu ve AirPods ses düzeyi farkı                                                     | Aynı metni iki kipte okut (geliştirici yapısı gerekir)                          |
| D7  | Kulaklık yokken ahizeden çıkan Türkçe sesi mikrofon duyup yanlış cümle üretiyor mu?                                                          | AirPods'suz dinle; okuma sırasında "cümle" satırı oluşuyor mu                  |
| D8  | Telefon çağrısı, Siri, alarm sonrası `.ended` geliyor mu, `shouldResume` taşıyor mu; arka plandan dönüşte gecikmeli `.began` geliyor mu         | Her kesintiden sonra Tanılama `kesinti` satırları                               |
| D9  | USB-C / Lightning kulaklık hangi port türüyle görünüyor (`.headphones` mı `.usbAudio` mı); mikrofonlu kablolu kulaklıkta giriş iPhone'da kalıyor mu | Kablolu kulaklıkla başlat; `ses yolu` satırı                                    |
| D10 | BT hoparlör / araç A2DP'de AirPods gibi "bağlı" görünüyor mu                                                                                 | Araçta ya da BT hoparlörle başlat                                               |
| D11 | Kesinti sonrası `AVAudioEngine.isRunning` doğru değeri veriyor mu; bekçi gereksiz alarm veriyor mu                                            | `kesinti  başladı neden=bekçi` satırlarının sıklığı                            |
| D12 | Alania gerçek gecikmesi (istekten ilk bayta) ve 5 sn sınırının yeterliliği; uçak kipinde yedeğe geçiş süresi                                   | `ses  alania … ms` satırları; uçak kipinde bir cümle                            |
| D13 | Türkçe Apple sesi cihazda yüklü mü; yüklü değilse ne okunuyor                                                                                | Alania anahtarı boşken bir cümle                                                |
| D14 | iPhone Safari'de (web) tanıma sürerken çıkış AirPods'ta A2DP mi HFP mi; `speechSynthesis` sesi kulaklıktan mı geliyor, tanıma sırasında kısılıyor mu | Web sürümünü AirPods ile dene; kulaklıkta ses kalitesi                          |
| D15 | iPhone Safari `webkitSpeechRecognition`: `continuous` kipte kendiliğinden ne zaman bitiyor; `abort()` ile `end` arasındaki süre; cümle arasındaki boşlukta kelime kayboluyor mu | Web Tanılama `tanıma bitti` satırları; cümle başını hızlı söyle                |
| D16 | iPhone Safari'de ilk dokunuşla "açılan" `Audio` öğesi sonraki Alania seslerini dokunuşsuz çalabiliyor mu                                      | Web sürümünde Alania anahtarıyla üç cümle                                       |
| D17 | Medya servisleri sıfırlanınca (Ayarlar › Geliştirici › Reset Media Services) uygulama çökmeden hata gösteriyor mu                            | Geliştirici menüsünden sıfırla                                                  |
| D18 | Uzun oturumda (10 dk) pil, ısınma, tanıma doğruluğunun düşmesi                                                                               | 10 dk kesintisiz dinleme                                                        |
