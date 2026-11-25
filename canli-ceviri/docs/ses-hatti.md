# Ses hattı şartnamesi

Sahibi: `ses-uzmani` · İlk sürüm: S01 plan kapısı (25.11.2026) · Güncelleme: S01 tur 2 (plan kapısı kararları KR1–KR12)

Bu belge iPhone uygulamasının (ve farkları ayrıca yazılarak web deneme sürümünün) ses hattının **nasıl davranması
gerektiğini** yazar. Kodu anlatmaz; kod buna uyar. Kodun bugünkü hâliyle farkları `docs/sprints/S01/reviews/ses-uzmani-1.md`
ve `ses-uzmani-2.md` içindedir. Kimlikli kurallar (ör. **Y3**, **C2**) incelemelerde ve `docs/cihaz-testi.md` içinde bu
kimlikle anılır.

**Kararlarla uyum.** `docs/sprints/S01/brief.md` "Kararlar" bölümü bu belgeden önce gelir. Bir karar yüzünden değişen
kuralın yanında "(S01 kararı KRn)" yazar; kural kimlikleri değişmedi. Tur 2'de karar dışı netleştirilen kuralların yanında
"(S01 tur 2)" yazar. Değişen kurallar: D-0, D-1, § 2.1 tablosu, G1, G4, G5, G11, G12, T1, T4, K4–K8, K12, K15, C6, C7, S4,
S5, S6, S8, § 6, § 7 (D4, D19–D25); yeni: G11a, S4a, § 5.1 (A1–A3).

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
| **HAZIRLANIYOR** | Çeviri oturumu alındı; dil paketi ve izinler bekleniyor        | "Hazırlanıyor…" (dil paketi inerken "Dil paketi indiriliyor…"); **CANLI rozeti ve "Dinliyorum" yok**; ana düğme "Durdur" (S01 kararı KR3) | `TranslationSession` (yalnız `translationTask` kapanışı içinde), oturum kimliği                         |
| **DİNLİYOR**     | Mikrofondan ses akıyor, tanıma açık                            | CANLI rozeti, "Dinliyorum…" ya da canlı metin, "Durdur"                 | Ses oturumu (etkin), motor (çalışıyor), mikrofon bağlantısı, tanıma görevi, duraklama sayacı, bekçi sayacı, kesinti gözlemcileri, ekran kilidi engeli, cümle akışı |
| **KESİNTİDE**    | Dinleme oturumu sürüyor ama mikrofon geçici olarak kapalı      | CANLI rozeti yerine "Duraklatıldı: <neden>" (S01 kararı KR3); "Dinliyorum" **yok**; ana düğme "Durdur" | Cümle akışı, oturum kimliği, kesinti gözlemcileri. Motor durmuş, tanıma görevi iptal. Seslendirme G11'deki nedene göre (S01 tur 2) |
| **DURDURULUYOR** | Kapatma sırası işliyor (anlık, eşzamanlı)                      | Değişmez; bitince DURUYOR                                               | Aşağıdaki kapatma sırasıyla hepsi kapanır                                                               |

"Duraklatıldı: <neden>" içindeki neden metinleri (S01 tur 2; iOS hangi uygulamanın kestiğini söylemediği için telefon,
alarm ve Siri tek metindir): telefon → "arama, alarm ya da Siri" · arka plan → "uygulama arka planda" · yapılandırma →
"ses yolu değişiyor" · bekçi → "mikrofondan ses gelmiyor". Kesin metni `docs/tasarim.md` değiştirebilir.

**Değişmez kural (D-0) (S01 kararı KR3):** Aşama tek kaynaktır: `Durum.asama` = duruyor / hazırlanıyor / dinliyor /
kesintide(neden). Ekranda "Dinliyorum…" ya da CANLI rozeti **yalnız "dinliyor"da** görünür; "hazırlanıyor"da
"Hazırlanıyor…", "kesintide"de "Duraklatıldı: <neden>" yazar. Ana düğme "duruyor" dışındaki **her** aşamada "Durdur"
yazar. Arayüz aşamayı yalnız bu alandan okur; `ayar != nil` gibi dolaylı bir işaretten çıkarmaz. "Dinliyor"a geçiş motor
başlayınca yapılır; bekçi (C6) ilk 2 saniyeyi bu andan sayar, sonrasında "dinliyor" ancak bekçi son 2 saniyede tampon
gördükçe sürer (S01 tur 2: bekçinin başlangıç payı açıkça yazıldı).

**Oturum kimliği (D-1):** Her Başlat ve her Durdur — ve hata ile durma (S01 tur 2) — bir tamsayı kimliği artırır. Bir `await`'ten dönen her iş (izin,
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
| G1  | DURUYOR → HAZIRLANIYOR      | Başlat'a dokunuş                                  | Oturum kimliği +1; hata ve notlar temizlenir; aşama = hazırlanıyor (KR3); çeviri yapılandırması atanır                                                       | `başlat  dil=en`                                                                                   |
| G2  | HAZIRLANIYOR (içinde)       | Dil paketi denetimi                               | Paket durumu okunur (kurulu mu); `prepareTranslation()` beklenir                                                                                             | `dil paketi  hazır` / `indirildi (… ms)` / `hata <kod>` — sonuç gelince                            |
| G3  | HAZIRLANIYOR (içinde)       | İzin istemleri                                    | Konuşma tanıma izni, sonra mikrofon izni                                                                                                                     | `izin  mikrofon=verildi konuşma=reddedildi` — ikisi de yanıtlanınca, tek satır                    |
| G4  | HAZIRLANIYOR → DURUYOR      | İzin yok / dil paketi hatası / Durdur (KR3)       | Hiçbir ses kaynağı açılmamıştır; yalnız yapılandırma `nil`. Ses motoruna (giriş düğümü dahil) dokunulmaz (S01 tur 2)                                         | `durdur  neden=izin yok` / `neden=hata dil paketi` / `neden=düğme`                                 |
| G5  | HAZIRLANIYOR → DİNLİYOR     | İzinler tamam, kimlik hâlâ geçerli                | Y1 sırası; tanıyıcı cihazda tanımayı desteklemiyorsa **yine açılır**, ekranda kalıcı sarı not (T1, S01 kararı KR2); kesinti gözlemcileri; bekçi; ekran kilidi engeli; durum = DİNLİYOR | `ses yolu  çıkış=bluetooth giriş=dahili`, ardından `tanıma açıldı  en-US cihazda` ya da `tanıma açıldı  ar-SA sunucuda` (KR2) |
| G6  | DİNLİYOR (döngü)            | Cümle kapandı (§ 3)                               | Cümle akışa yazılır; yeni tanıma görevi açılır                                                                                                               | `cümle  kelime=7` (cümle akışa yazıldığı anda)                                                     |
| G7  | DİNLİYOR (döngü)            | Çeviri döndü                                      | Kimlik denetimi → satır eklenir → seslendirme sırasına girer                                                                                                  | `çeviri  182 ms` ya da `çeviri  hata <kod>` (çeviri bitince)                                       |
| G8  | DİNLİYOR (döngü)            | Ses çalındı                                       | § 5                                                                                                                                                         | `ses  alania 640 ms` (yanıt gelince; ms = istekten ilk bayta) / `ses  apple` (okuma başlarken) / `ses  alania hatası http=401` ya da `zaman aşımı` |
| G9  | DİNLİYOR (döngü)            | Tanıma görevi kendiliğinden bitti                 | § 3.2                                                                                                                                                       | `tanıma bitti  neden=son sonuç` / `neden=hata <alan>/<kod> <açıklama>`; art arda aynı neden 5 sn içinde tekrarlanırsa satır yazılmaz, sayaç artar (`×12`) |
| G10 | DİNLİYOR (döngü)            | Ses yolu değişti                                  | Kulaklık satırı güncellenir; motor durduysa G11                                                                                                              | `ses yolu  çıkış=ahize neden=eski cihaz gitti`                                                     |
| G11 | DİNLİYOR → KESİNTİDE        | Kesinti başladı / arka plan / motor yapılandırması değişti / bekçi alarmı | Yarım cümle gönderilir (C4); tanıma görevi iptal (tur +1); mikrofon bağlantısı sökülür; motor durur; durum = KESİNTİDE. **Neden telefon ya da arka plan ise** çalan ses kesilir, ses sırası boşaltılır, uçuştaki Alania isteği iptal. **Neden yapılandırma ya da bekçi ise** seslendirme sürer, sıra korunur (S01 tur 2; K1–K3 ile uyum) | `kesinti  başladı neden=telefon|arka plan|yapılandırma|bekçi`                                      |
| G11a | KESİNTİDE → KESİNTİDE      | Yapılandırma/bekçi kesintisinin yeniden denemesi beklenirken telefon kesintisi ya da arka plan geldi | Neden "telefon" / "arka plan" olur (ekran güncellenir); bekleyen yeniden deneme iptal edilir (kesinti numarası +1); bu nedenin gerektirdiği ses kesme yapılır (S01 tur 2) | `kesinti  neden değişti=telefon`                                                                    |
| G12 | KESİNTİDE → DİNLİYOR        | Kesinti bitti / ön plana dönüldü / yapılandırma değişikliği işlendi | Y1 sırası (kategori zaten ayarlı; `setActive(true)` dahil); yeni tanıma; bekçi sıfırlanır. Yeniden deneme zamanlayıcısı kendi kesinti numarasını denetler; o kesinti bitmiş ya da nedeni değişmişse hiçbir şey yapmaz (S01 tur 2) | `kesinti  bitti`, ardından `motor  yeniden başlatıldı` ve `ses yolu …`                              |
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

- **T1 — Cihazda tanıma yoksa sunucu, ama söylenerek (S01 kararı KR2).** `supportsOnDeviceRecognition` `true` ise
  `requiresOnDeviceRecognition = true` konur. `false` ise bu ayar uygulanmaz ve ses Apple'ın sunucusuna gider (Apple
  belgesi). Dinleme **reddedilmez** (proje sahibinin özgün tasarımı; ilke 3'ün ilk istisnası). Bunun yerine:
  - ekranda dinleme boyunca kalıcı sarı not: "Bu dilde konuşma tanıma Apple'ın sunucusunda yapılır." (Durdur'da kalkar);
  - Tanılama: `tanıma açıldı  ar-SA sunucuda` (uyarı olayı);
  - sunucu tanımasında internet yoksa görevler hemen hatayla biter; T3 sayacı dolunca durma iletisi internet gerektiğini
    söyler: "Bu dilde konuşma tanıma için internet gerekli." (S01 tur 2; hangi hata kodlarıyla bittiği D22'de görülür).
  Hangi dillerin cihazda tanındığı D4'te görülür.
- **T2 — Sonuçla biten görev:** C4'teki gibi cümle gönderilir, yeni görev açılır.
- **T3 — Sonuçsuz biten görev:** Yeni görev hemen açılır. Açıldıktan sonraki 2 saniye içinde metin üretmeden biten
  görevler sayılır; art arda **5** olunca dinleme durur (G14) ve ekranda hata kodu ile "Konuşma tanıma çalışmıyor.
  Dinlemeyi yeniden başlatın." yazar. Metin üreten ya da 2 saniyeden uzun yaşayan her görev sayacı sıfırlar. Sonsuz
  sessiz yeniden açma döngüsü yasaktır (ilke 5).
- **T4 — Tanıyıcı kullanılamaz oldu** (`availabilityDidChange` → `false`): KESİNTİDE (neden "konuşma tanıma kullanılamıyor");
  10 saniye içinde geri gelmezse G13. **(S01 kararı KR1: birikime yazıldı, bu sürümde uygulanmaz.** Bu sürümde aynı durumu
  T3 sayacı ve bekçi yakalar.)
- **T5 — Geç sonuç:** İptal edilmiş görevden ya da önceki turdan gelen sonuç hiçbir duruma dokunmaz (tur numarası).

---

## 4. Kesinti senaryoları

"Kodda karşılığı" sütunu kodun **bulunması gereken** karşılığıdır; bugünkü durum incelemededir.

| No   | Senaryo                                         | Beklenen davranış                                                                                                   | Ekranda                                                         | Kodda karşılığı                                                                                     |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| K1   | AirPods takıldı / bağlandı (dinlerken)          | Ses AirPods'a geçer. Motor yapılandırması değişirse G11→G12 (yarım cümle gönderilir; seslendirme kesilmez, S01 tur 2). Giriş iPhone'da kalır. | Kulaklık satırı "AirPods … bağlı"                              | `routeChangeNotification` (neden `newDeviceAvailable`), `AVAudioEngineConfigurationChange`         |
| K2   | AirPods çıkarıldı / kutuya kondu / kulaktan alındı | Dinleme sürer; ses ahizeye geçer; çalmakta olan cümle ahizeden sürer, sıradakiler atılmaz (G11, neden yapılandırma) | Sarı uyarı (kulaklık yok)                                       | `routeChangeNotification` (neden `oldDeviceUnavailable`) + gerekirse yapılandırma değişikliği       |
| K3   | AirPods başka cihaza geçti (otomatik geçiş)     | K2 ile aynı                                                                                                         | Sarı uyarı                                                      | Aynı                                                                                                |
| K4   | Telefon çağrısı geldi                           | Kesinti başlar: G11 (neden telefon); başka bir kesinti sürerken gelirse G11a. Çağrı reddedilir ya da biter: G12. Bitiş bildirimi gelmezse ön plana dönüşte G12; uygulama hiç etkinliğini yitirmediyse 10 sn sonra ekranda "Devam etmek için Durdur'a, sonra Başlat'a dokunun." (S01 tur 2, KR4: davranış değişmez, yalnız görünür kılınır; D8) | "Duraklatıldı: arama, alarm ya da Siri" (KR3)                  | `interruptionNotification` `.began` / `.ended`; dönüşte `didBecomeActive`                          |
| K5   | Görüşme sürerken Başlat                         | Oturum etkinleşemez (`insufficientPriority`, Apple belgesi): G4 benzeri durma                                        | "Görüşme sürerken dinleme başlatılamaz."                        | `setActive(true)` hatasının alan **ve** koduna göre Türkçe mesaj                                   |
| K6   | Siri                                            | Uygulama etkinliğini yitirir, ses oturumu kesilir: G11; Siri kapanınca G12                                          | "Duraklatıldı: arama, alarm ya da Siri"                         | `.began`/`.ended` + `didBecomeActive`                                                               |
| K7   | Alarm / zamanlayıcı                             | Kesinti: G11; kapatılınca G12; `.ended` gelmezse K4'teki 10 sn notu                                                 | "Duraklatıldı: arama, alarm ya da Siri"                         | `interruptionNotification`                                                                          |
| K8   | Uygulama arka plana gitti                       | Arka plan kipi yok (plan). `didEnterBackground`'da G11 (neden arka plan; zaten kesintideyse G11a) ve oturum etkisizleştirilir (Apple belgesi önerisi); ön plana dönüşte **koşulsuz** G12. `.ended` arka plandayken gelirse G12 ön plana dönüşe ertelenir | Dönüşte kısa süre "Duraklatıldı: uygulama arka planda", sonra "Dinliyorum" | `didEnterBackgroundNotification`, `didBecomeActiveNotification`. Dönüşte gelen gecikmeli `.began` (neden `appWasSuspended`) yok sayılır |
| K9   | Ekran kilitlendi (yan tuş)                      | K8 ile aynı. Kendiliğinden kararma dinlerken engellidir                                                             | Aynı                                                            | `isIdleTimerDisabled` + K8                                                                          |
| K10  | Kontrol Merkezi / bildirim perdesi              | Dinleme **sürer** (yalnız etkinlik kaybı); kesinti gelirse K4 kuralları                                             | Değişmez                                                        | `willResignActive` yalnız Tanılama'ya yazılır                                                       |
| K11  | Başka uygulama mikrofonu aldı                   | Kesinti olarak gelir: G11; mikrofon geri alınamazsa iki denemeden sonra G13                                          | "Duraklatıldı", gerekirse "Mikrofon başka bir uygulamada."       | `.began`; biçim 0 Hz ise Y2 hatası                                                                  |
| K12  | İnternet kesildi                                | Tanıma ve çeviri cihazda olduğu için akış sürer. Alania: § 5 yedeği (5 sn, 3 hatada kesici; S01 kararı KR10). Sunucuda tanınan dilde (T1, KR2) tanıma durur: T3 → G14, internet iletisiyle | "Alania'ya ulaşılamadı; Apple sesi kullanılıyor." / sunucu tanımasında "Bu dilde konuşma tanıma için internet gerekli." | Alania zaman aşımı / hata yolu; T3 sayacı                                                            |
| K13  | Medya servisleri sıfırlandı                     | Apple belgesi: ses nesneleri yeniden kurulur, kayıt kullanıcı başlatmadan sürdürülmez → G13; motor ve sentezleyici yeni nesneyle değiştirilir | "Ses sistemi yeniden başladı. Dinlemeyi yeniden başlatın."      | `mediaServicesWereResetNotification`                                                                |
| K14  | Motor yapılandırması değişti (örnekleme hızı)   | Motor kendini durdurur (Apple belgesi): G11 → bağlantı yeni biçimle → G12                                            | Kısa "Duraklatıldı" görünmeyebilir                              | `AVAudioEngineConfigurationChange`                                                                  |
| K15  | Bekçi: 2 sn mikrofon tamponu gelmedi            | DİNLİYOR'da tampon 2 sn gelmezse G11 (neden bekçi) → G12. G12 hata vermeden "başarılı" olsa da arada tek tampon gelmeden bekçi **art arda ikinci kez** alarm verirse G13 (S01 tur 2) | "Duraklatıldı: mikrofondan ses gelmiyor", sonra hata: "Mikrofondan ses gelmiyor. Dinlemeyi yeniden başlatın." | Mikrofon bağlantısında son tampon zamanı + 1 sn'lik ana aktör sayacı + ardışık alarm sayacı         |
| K16  | Çıkış hoparlöre / AirPlay'e alındı              | Dinleme sürer                                                                                                        | Sarı uyarı (Y4 tablosu)                                         | `routeChangeNotification`                                                                            |

**C6 — Bekçi.** Mikrofon bağlantısının geri çağrısı her tamponda kilitli bir "son tampon zamanı"nı günceller. Ana aktörde
1 saniyelik sayaç DİNLİYOR durumunda bu zamanı okur. Bekçi; bildirim gelmeyen ya da `isRunning` yanlış `true` dönen
durumlara karşı son çaredir ve D-0'ın tek doğrulayıcısıdır. KESİNTİDE ve HAZIRLANIYOR'da bekçi **çalışmaz**. Ardışık
alarm sayacı, bir tampon geldiğinde (son tampon zamanı alarmdan sonraki bir anı gösterdiğinde) sıfırlanır (S01 tur 2).

**C7 — Yeniden başlatma.** G12 iki kez denenir (ikincisi 0,5 sn sonra). İkisi de başarısızsa G13. Başarısızlık sessiz
kalmaz. "Başarı" yalnız `start()`'ın hata vermemesi değildir: bekçi kesintisinden dönüşte başarı, ardından tampon
gelmesidir (K15). Yeniden deneme zamanlayıcısı kesinti numarasını taşır (G12) (S01 tur 2).

---

## 5. Seslendirme

- **S1 — Tek sıra:** Çeviriler geliş sırasıyla tek bir FIFO sıraya girer; her öğe (oturum kimliği, metin) taşır.
- **S2 — Üst üste binmez:** Sıradaki öğe, öncekinin **çalması bitmeden** başlamaz. Bu Apple sesi için de geçerlidir:
  `speak` çağrısı dönünce değil, sentezleyici "bitti" ya da "iptal" bildirince sonraki öğeye geçilir. Alania ile Apple
  sesi karışık gelse de aynı anda iki ses çalmaz.
- **S3 — Eski oturum:** Öğenin kimliği o anki oturum kimliğiyle tutmuyorsa çalınmaz. Kimlik; sıradan alınırken, Alania
  yanıtı gelince ve çalmaya başlamadan hemen önce denetlenir.
- **S4 — Durdur ve kesinti:** Durdur'da ve telefon / arka plan kesintisinde çalan ses hemen kesilir (`stop`,
  `stopSpeaking(at: .immediate)`), uçuştaki Alania isteği iptal edilir, sıra boşaltılır. Yapılandırma ve bekçi
  kesintisinde ses kesilmez, sıra korunur (S01 tur 2; K1–K3). Durdur'dan sonra yeni oturumun ilk cümlesi eski isteği
  beklemez (S01 kararı KR10). Kesinti yüzünden okunmayan bir çeviri varsa ekranda bir kez "Kesinti sırasında gelen çeviri
  okunmadı." notu çıkar (ilke 5; S01 tur 2).
- **S4a — Bitiş bildirimi kime ait (S01 tur 2):** Bir öğenin bitişini bekleyen kod, gelen "bitti / iptal" geri çağrısının
  **o öğeye** (o `AVSpeechUtterance`'a, o `AVAudioPlayer`'a) ait olduğunu denetler. Önceki öğenin geç gelen `didCancel`'ı
  sonraki öğenin beklemesini bitiremez (yoksa S2 bozulur).
- **S5 — Alania → Apple yedeği (S01 kararı KR10):** Anahtar yalnız `Anahtarlik.alaniaAnahtari`'dan okunur. Anahtar boşsa
  Apple sesi. İstek **toplam 5 saniye** içinde (bağlantı + yanıt + gövde) bitmezse iptal edilir ve aynı cümle Apple sesiyle
  okunur (KR10 gereği 5 sn sabittir; yeterliliği D12'de ölçülür). Yanıt 200 değilse, ses çözülemezse ya da oynatıcı
  çalmayı başlatamazsa aynı yedek. Yedeğe düşüldüğünde ekranda kısa bir not görünür ve Tanılama'ya HTTP kodu yazılır
  (ilke 5).
- **S6 — Devre kesici (S01 kararı KR10):** Art arda 3 Alania hatasından sonra o dinleme oturumunun geri kalanında
  doğrudan Apple sesi kullanılır (her cümlede 5 sn beklenmez, ilke 4); ekrandaki not oturum boyunca kalır. 401/403 ilk
  seferde kesiciyi açar ve "Alania anahtarı geçersiz" der. Durdur'un iptal ettiği istek hata sayılmaz.
- **S7 — Türkçe ses yoksa:** `AVSpeechSynthesisVoice(language: "tr-TR")` `nil` dönerse ekranda "Türkçe ses yüklü değil"
  notu çıkar, Tanılama'ya yazılır; okuma yine denenir.
- **S8 — Kulaklık yokken:** Ses ahizeden çıkar. Ahize sesinin iPhone mikrofonuna geri dönüp tanınması cihazda ölçülür
  (D7). **S01 kararı KR5 (B-16) ve KR1 (Ön-7): "okurken dinlemeyi beklet" bu sprintte iPhone'a eklenmez;** D7'de geri
  dönüş gözlenirse birikimden ele alınır.
- **S9 — Gizlilik:** Alania'ya yalnız Türkçe çeviri metni ve ses adı gider; asıl cümle gitmez (ilke 3'ün ikinci
  istisnası; ekranda söylenir).

### 5.1 Alania anahtarı (brief K5)

- **A1** Anahtar Anahtar Zinciri'nde, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` ile durur (yedekle başka cihaza
  geçmez, iCloud'a gitmez). `UserDefaults`'ta kalmaz.
- **A2** Eski kurulumda `UserDefaults`'ta kalan değer ilk okumada taşınır. İkisi birden varsa **`UserDefaults`'taki
  kazanır** (orada yalnız eski arayüz yazmış olabilir, o da kullanıcının en son girdiğidir); Anahtar Zinciri'ne yazılamazsa
  eski değer silinmez (S01 tur 2).
- **A3** Yazma başarısız olursa Tanılama'ya `anahtar  kaydedilemedi <OSStatus>` yazılır; anahtarın kendisi hiçbir yere
  yazılmaz (S01 tur 2).

---

## 6. Web deneme sürümü farkları

Web sürümü aynı durum adlarını ve aynı Tanılama olaylarını kullanır; şu farklarla:

- **Aşamalar (S01 kararı KR3'ün web karşılığı; S01 tur 2):** "hazırlanıyor" Başlat'tan tanımanın ilk `start` /
  `audiostart` olayına kadar sürer (izin istemi bu aşamadadır); "kesintide" okurken bekletme ve gizli sekme içindir
  ("Duraklatıldı: okuma sürüyor" / "Duraklatıldı: sayfa arka planda"). CANLI ve "Dinliyorum…" yalnız "dinliyor"da.
- **Tanılama farkları:** `dil paketi` olayı yoktur (çeviri internettedir); `tanıma açıldı` satırına `konum=bilinmiyor`
  yazılır (tarayıcı cihazda mı sunucuda mı tanıdığını söylemez); `izin` satırı ilk `audiostart`ta `mikrofon=verildi`,
  reddedilince `not-allowed` / `service-not-allowed` ile yazılır; arka plan / ön plan `sekme  gizlendi / göründü` olarak
  yazılır. Kopya başlığında sayfa sürümü bulunur; dosya yolu (`file://` içinde kullanıcı adı olabilir) yazılmaz.
- **Alania (S01 kararı KR10):** iPhone ile aynı: toplam 5 sn, Durdur uçuştaki isteği iptal eder, 3 hatada kesici, yedeğe
  düşüş notla ve HTTP koduyla.

- **Ses yolu denetlenemez.** Tarayıcı mikrofon ve çıkış seçimini kendisi yapar; iPhone Safari'de tanıma sürerken AirPods
  mikrofonunun (HFP) açılması ve sesin telefon kalitesine düşmesi olasıdır (D14). Tanılama'ya `ses yolu  bilinmiyor` yazılır.
- **Tanıma yeniden açılması** `onend` üzerinden yapılır; T3 sayacının karşılığı art arda 6 boş bitiştir (bugünkü kod).
- **Askıya alma nedenleri ayrı tutulur:** "okurken beklet" ve "sekme gizli" iki ayrı işarettir; tanıma ancak ikisi de
  kalkınca yeniden açılır. Gizli sekmede tanıma açılmaz.
- **Durdur**, bekleyen cihaz seslendirmesinin sözünü (Promise) hemen çözer; yeni oturum eski sesin sigortasını beklemez.
  Aynı kural uçuştaki çeviri isteği için de geçerlidir: Durdur onu iptal eder, yeni oturumun ilk cümlesi eski çeviriyi
  beklemez (S01 tur 2).
- Çeviri hatası dinlemeyi durdurmaz (bugünkü kod buna uyuyor).

---

## 7. Doğrulanamayanlar (yalnız gerçek iPhone + AirPods'ta görülebilir)

`kalite-sorumlusu` her birini `docs/cihaz-testi.md` içinde en az bir senaryoya çevirir. S01 kararı KR4 gereği bu
listedeki davranışlar cihazda denenmeden değiştirilmez; yalnız sessiz başarısızlığı görünür kılan savunma denetimleri
eklenir. Ön-7 (D7) ve Ön-9 (D15) KR1 gereği yalnız cihaz sorusudur.

| No  | Soru                                                                                                                                         | Nasıl gözlenir                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | `.translationTask` yapılandırma `nil` olunca çalışan görevi iptal ediyor mu? (Apple belgesi yalnız "nil değilken ve değişince çalışır" diyor) | Dil paketi inerken Durdur'a bas; mikrofon göstergesi (turuncu nokta) yanmamalı |
| D2  | `.playAndRecord` + `.allowBluetoothA2DP` ile AirPods bağlıyken giriş gerçekten `.builtInMic` mi, çıkış A2DP mi?                              | Tanılama `ses yolu` satırı; kulaklıkta ses kalitesi (müzik gibi mi, telefon gibi mi) |
| D3  | AirPods otomatik kulak algılaması: tek/iki kulaklık çıkarılınca yol ne oluyor, motor yapılandırma bildirimi geliyor mu?                       | Tanılama `ses yolu` ve `kesinti` satırları                                     |
| D4  | Yedi dilin hangileri `supportsOnDeviceRecognition == true`? (özellikle `ar-SA`, `ru-RU`); model inmemişse ne dönüyor; sunucuda tanınan dilde sarı not görünüyor mu (KR2) | Her dili sırayla başlat; `tanıma açıldı … cihazda/sunucuda` satırı ve ekrandaki not |
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
| D19 | AirPods takılınca / çıkarılınca motor yeniden başladıktan sonra ilk mikrofon tamponu kaç ms'de geliyor; bekçinin 2 sn payı yetiyor mu (S01 tur 2) | AirPods'u dinlerken birkaç kez tak/çıkar; `kesinti … neden=bekçi` satırı çıkmamalı |
| D20 | Alarm, Siri ve gelen arama bildirimi (afiş) uygulama etkinken `.ended` gönderiyor mu; göndermiyorsa ekran "Duraklatıldı"da kalıyor mu (S01 tur 2) | Dinlerken alarm çaldır, kapat; Siri'yi aç, kapat; `kesinti  bitti` satırı      |
| D21 | Arka plandayken ya da kesintideyken `TranslationSession.translate` çağrısı ne yapıyor (bekliyor mu, hata mı veriyor) (S01 tur 2)           | Uzun cümlenin ortasında uygulamayı arka plana al; `çeviri` satırı              |
| D22 | Sunucuda tanınan dilde (KR2) internet yokken `isAvailable` ve tanıma görevi hangi hata koduyla bitiyor (S01 tur 2)                          | Uçak kipinde `ar-SA` ile başlat; `tanıma açıldı` ve `tanıma bitti` satırları    |
| D23 | Mikrofon izni reddedilmişken ya da oturum hiç açılmamışken `AVAudioEngine.inputNode`'a dokunmak (Durdur'daki `removeTap`) sorunsuz mu (S01 tur 2) | İzni reddet, Başlat, sonra hazırlanırken Durdur                                 |
| D24 | `stopSpeaking(at: .immediate)` sonrası `didCancel` ne kadar gecikmeyle geliyor (S4a)                                                         | Apple sesi okurken AirPods'u çıkar/tak, sonra hızlı bir cümle; sesler üst üste binmemeli |
| D25 | Uygulama silinip yeniden kurulunca Alania anahtarı Anahtar Zinciri'nde kalıyor mu (A1; iOS davranışı sürüme göre değişmiş olabilir)         | Anahtarı gir, uygulamayı sil, kur; Ayarlar'da anahtar alanı                     |
