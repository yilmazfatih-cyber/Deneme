# Netflix desenleri → TV+ uyarlaması

**Kaynak:** `netflix-system-design-reverse-engineered.md` (Netflix web uygulamasının 177 isteklik ağ trafiği dökümü).
**Kapsam uyarısı:** Netflix sütunu dökümde gözlenen davranıştır. TV+ sütunu öneridir; TV+'ın mevcut arka ucu, STB yetenekleri ve hak sözleşmeleri bu belge için doğrulanmadı. Bölüm 4'teki süreler ölçülmüş değer değil, hedef önerisidir.

---

## 1. Desen → Fayda → TV+ uyarlaması

| Netflix deseni | Kullanıcıya faydası | TV+ uyarlaması |
|---|---|---|
| **Lolomo (liste-listesi):** sayfa = başlığı ve arkasındaki kaynağı (tür, liste, devam et) olan sıralı satırlar | Tek öğrenilen kalıp; her ekran aynı şekilde taranır | Ana sayfa, Canlı, Spor, Film/Dizi aynı `Page → rows[] → items[]` şemasını kullanır. Fark: satırlar **karışık türde** öğe taşır (kanal, yayın, maç, film). Satır tipi sayısı sınırlıdır (bkz. İlke 1) |
| **tctx konum izleme:** her kart `satır indeksi, satır içi konum, varlık kimliği` taşır | Sıralama ölçülerek iyileşir; kullanıcı daha az kaydırır | Her öğede `track {row, pos, entityId, rowId}`. Oynatma ve arama olaylarına aynen taşınır; "hangi satır izlemeye dönüştü" baştan ölçülür |
| **MiniModal satır prefetch:** bir karta gelince tüm satırın önizleme verisi tek istekte gelir | Karttan karta geçişte bekleme yok | Mobilde hover yok: satır görünür alana girince satırın özet verisi toplu çekilir; uzun basış/odak önizleme açar. Kanal satırında "şimdi/sonraki" bilgisi satırla birlikte gelir |
| **DetailModal modeli:** `moodTags`, `contentAdvisory` (+nedenler), `playbackBadges`, `similars`, `currentEpisode` | Tek ekranda karar: ne, kime uygun, hangi kalitede, nereden devam | Aynı alanlar + TV+ ekleri: `access` (yetki), `airings[]` (ne zaman yayında), `catchupUntil`. `contentAdvisory` RTÜK akıllı işaretlerine eşlenir. `currentEpisode` karşılığı canlıda "şu anki yayın"dır |
| **Arama yetenek pazarlığı:** istemci çizebildiği varlık türlerini bildirir (`VIDEO`, `GAME`, `GENERIC_CONTAINER`); yanıt `PinotListSection` (öneriler) + `PinotGallerySection` (sonuç ızgarası) | Yeni içerik türü eski istemciyi bozmaz; yeni sürümler hemen faydalanır | TV+ için zorunlu: STB, eski mobil sürüm ve web farklı tür çizer. Bölüm 2.7'deki türler bu mekanizmayla gelir. Aynı pazarlık ana sayfa satır tiplerine de uygulanır |
| **Arama TTL'i:** yanıtta `expires` (yaklaşık 8 saat) | Aynı aramaya dönüş anında açılır | Bölüm bazında TTL: katalog sonuçları saatler; canlı/maç bölümleri 30–60 sn (yayın biter, skor değişir) |
| **Collection varlığı:** "Breaking Bad Collection" tek aranabilir birim | Dağınık başlıklar yerine tek hedef | `COLLECTION`: lig sayfası, takım, "Süper Lig bu hafta", film serisi, kanal paketi, HBO Max vitrini |
| **Billboard `licensedManifest` prefetch:** DRM manifesti tıklamadan önce çekilir | Oynat'a basınca anında başlar | (a) Vitrin içeriği, (b) "izlemeye devam"ın ilk öğesi, (c) canlıda komşu ±1 kanal ve son izlenen kanal için manifest/lisans ön hazırlığı. Ön hazırlık eşzamanlı izleme kotasından düşmemelidir |
| **FTL CDN yarışı + pulse:** 4 uç yarıştırılır; 0 sn, 2 sn, 70 sn'de üç ölçüm | En hızlı sunucu seçilir; ağ bozulunca fark edilir | Turkcell şebekesi içi önbellek ile genel CDN arasında yarış. Wi-Fi ↔ hücresel geçişinde yeniden ölçüm. Sonuç oynatma oturumuna ipucu olarak verilir |
| **Bayt-aralıklı ayrı ses/video:** iki paralel akış, imzalı ve süreli URL | Ses dili değişince video yeniden yüklenmez; kalite kademeli uyarlanır | Ses ayrı parça olarak paketlenir: maçta yorumcu/stadyum sesi, dublaj/orijinal seçimi yeniden tamponlamadan değişir. İmzalı URL süresi canlıda kısa tutulur |
| **TTML altyazı ayrı belge** | Altyazı dili anında değişir | Altyazı her zaman yan dosya. Canlı kanallarda altyazı/işaret dili varlığı `playbackBadges` içinde bildirilir |
| **Profil / Passport:** profil kimliği her istekte çözülür | Öneri, devam et ve liste kişiye özeldir | Ev aboneliğinde hane → profil. STB ortak ekran olduğundan "Ev" profili + kişisel profiller; çocuk profili kanal listesini de kısıtlar |
| **ESN cihaz kimliği:** oynatıcı tipi + platform + benzersiz özet | Cihaz limiti ve doğru codec seçimi | Cihaz kaydı: `STB | TV | MOBILE | WEB`, yetenekler, ev ağına bağlılık. Oturum devri ve kumanda eşleşmesinin temeli (Bölüm 2.6) |
| **Çoklu artwork + görsel API:** boxart, storyArt, logo varyantları; boyut URL ile istenir | Her bağlamda net görsel, hızlı yükleme | Varyantlar: `poster 2:3`, `still 16:9`, `titleLogo`, `channelLogo` (açık/koyu zemin), `teamCrest`, `liveFrame` (canlı yayından periyodik kare). İstemci yalnızca en/boy ister |
| **Persisted GraphQL:** istemci sorgu yerine kimlik + sürüm yollar | Küçük istek, hızlı açılış | Web + mobil için sorgu kayıt defteri. Mühendis ajanlar için sözleşme = kayıtlı sorgu listesi; şema değişikliği CI'da kırılma olarak yakalanır |
| **Ichnaea olay loglama:** ayrı uç, toplu gönderim, hız sınırı | Ürün kararları veriye dayanır; izleme arayüzü yavaşlatmaz | Tek olay şeması. İlk günden: gösterim, tıklama, ilk kare süresi, zap süresi, yeniden tamponlama, sonuçsuz arama, "pakette yok" görüntüleme |
| **watchStatus / bookmark:** `NEVER_WATCHED / IN_PROGRESS / WATCHED` + konum | Kaldığı yerden devam, her cihazda | VOD konumu + geri al yayını konumu + profil başına "son kanal". "İzlemeye devam" satırı VOD ve yarım kalmış yayınları birlikte taşır |
| **Chromecast birinci sınıf:** yayın betiği her sayfada yüklü | Büyük ekrana geçiş her an hazır | TV+ için hedef cihaz önce **kendi STB'si**, sonra Chromecast/AirPlay. "TV'de izle" düğmesi oynatıcıda ve detayda sabit yerdedir |

---

## 2. Netflix'te olmayan, TV+ modeline eklenecek kavramlar

### 2.1 Veri modeli özeti

```
CHANNEL        {channelId, name, number, logo, genres[], isHd, access}
PROGRAM        {programId, title, synopsis, seriesRef?, contentAdvisory}        # içerik
PROGRAM_AIRING {airingId, channelId, programId, startAt, endAt,
                liveState: UPCOMING|LIVE|ENDED,
                catchup: {available, until}, startOver: bool,
                recording: {allowed, state: NONE|SCHEDULED|RECORDING|READY}, access}
SPORT_EVENT    {eventId, competition, round, home, away, kickoffAt,
                state: SCHEDULED|LIVE|HALFTIME|FINISHED|POSTPONED,
                score?, minute?, airings[], highlightsRef?}
ACCESS         {state: PLAYABLE|UPSELL|DEVICE_RESTRICTED|OUT_OF_WINDOW|BLOCKED,
                reasonText, requiredProduct?, cta?}
DEVICE         {deviceId, kind, capabilities[], onHomeNetwork, lastSeenAt}
PLAY_SESSION   {sessionId, deviceId, playable, positionMs, state, controllableBy[]}
```

`PROGRAM` ile `PROGRAM_AIRING` ayrımı kritiktir: arama, kayıt ve geri al "yayın"a; öneri ve detay "program"a bağlanır.

### 2.2 Canlı durumu, geri al, baştan başlat
- Her canlı kartı şunu gösterir: kanal logosu, şimdiki program, ilerleme çubuğu, bitiş saati, sonraki program. Sunucu `startAt/endAt` verir, ilerlemeyi istemci hesaplar (sunucu saatiyle eşitlenmiş).
- **Baştan başlat** canlı oynatıcıda birincil eylemdir; program başladıktan sonra girildiyse görünür olur.
- **Geri al (7 gün):** EPG'de geçmiş yayınlar oynatılabilir görünür; son 24 saat kala "yarın kalkıyor" bilgisi. Pencere dışı = `OUT_OF_WINDOW`, tıklanabilir ama açıklamalı.

### 2.3 Kayıt (bulut PVR)
Tek dokunuş "Kaydet"; dizi yayınında "Tüm bölümler". Kayıtlar "Listem" ile aynı kütüphanede ayrı sekmedir. Kota ve saklama süresi görünür olmalıdır.

### 2.4 Spor etkinliği
Maç kartı: armalar, lig, saat veya dakika + skor. Durumlara göre tek birincil eylem: önce "Hatırlat", canlıda "İzle", sonra "Özet / Tekrar". **Skor gizleme** ayarı: geri al veya tekrar izleyene skor gösterilmez.

### 2.5 Yetki (entitlement) ve "pakette yok"
- Yetki, katalogdan ayrı hesaplanır ve her oynatılabilir öğeye `access` olarak eklenir.
- İçerik gizlenmez; kartta tek küçük kilit/paket işareti olur. Dokununca hata değil, alt sayfa açılır: "Bu içerik HBO Max eklentisiyle izlenir" + fiyat + tek adımda ekleme + "Paketimde benzerleri".
- `DEVICE_RESTRICTED` (ör. yalnızca ev paketinde, STB'de izlenebilen kanal): mesaj "Evdeki TV+ kutunuzda izlenir", eylem "TV'de aç".
- Filtre: "Yalnızca paketimdekiler" tüm liste ve aramada bulunur.
- Oynat'a basıldıktan sonra yetki hatası gösterilmez; durum karttan bellidir.

### 2.6 Cihazlar arası oturum devri
- Oturum servisi her profilin etkin `PLAY_SESSION` kayıtlarını tutar. Telefon açıldığında STB'de oynayan içerik "Şu an TV'de" şeridi olarak görünür.
- Eylemler: **TV'de devam et** (telefon → STB, konumla), **Telefonda devam et** (STB → telefon), **Kumanda** (oynat/duraklat, sarma, kanal ±, ses, kanal listesi).
- En yüksek değerli kumanda özelliği: STB aramasını telefon klavyesiyle yazmak.
- Eşleşme: aynı hesap + ev ağı otomatik; aksi halde TV'de gösterilen kod.

### 2.7 Arama varlık türleri ve yetenek bildirimi
Türler: `VIDEO`, `CHANNEL`, `PROGRAM_AIRING`, `SPORT_EVENT`, `PERSON`, `COLLECTION`.

```json
{ "searchTerm": "galatasaray",
  "capabilities": {
    "sections": ["topResult", "suggestionList", "gallery", "airingList"],
    "entityTreatments": {
      "poster":      ["VIDEO"],
      "channelTile": ["CHANNEL"],
      "airingRow":   ["PROGRAM_AIRING"],
      "matchCard":   ["SPORT_EVENT"],
      "personChip":  ["PERSON"],
      "destination": ["COLLECTION"] } } }
```

Yanıt sırası niyete göredir: canlı olan en üstte, sonra yaklaşan yayın/maç, sonra katalog. Her bölümün kendi `expires` değeri vardır.

---

## 3. Tasarım ilkeleri (12 test edilebilir kural)

1. **Satır tipi sınırı:** Ana sayfada en fazla 6 satır tipi kullanılır (vitrin, devam et, canlı kanal, poster, maç, koleksiyon). Yedincisi için biri çıkarılır.
2. **Kart başına 1 rozet:** Öncelik sırası: CANLI > pakette yok > yeni bölüm > kalkıyor. İkincisi gösterilmez.
3. **Oynat en fazla 2 dokunuş:** Herhangi bir karttan oynatmaya en çok 2 dokunuş; devam et ve canlı kanal kartında 1.
4. **Canlı her zaman zaman bilgisi taşır:** Canlı öğe ilerleme çubuğu + bitiş saati olmadan çizilmez.
5. **Arama boşken de faydalıdır:** İlk tuştan önce son aramalar, şu an canlı popülerler ve bugünün maçları görünür.
6. **Arama asla çıkmaz sokak değildir:** Sonuçsuz ekran yoktur; yazım düzeltmesi, en yakın sonuç veya "pakette yok ama var" gösterilir.
7. **Yetki sürprizi yok:** Oynatılamayan öğe dokunmadan önce ayırt edilir; hiçbir "pakette yok" durumu tam ekran hata olarak gösterilmez.
8. **Tek birincil eylem:** Her detay ekranında tek dolu düğme vardır; etiketi duruma göre değişir (İzle / Devam et / Baştan başlat / Hatırlat / Paketi ekle).
9. **Zaman her yerde aynı biçimde:** 24 saat biçimi, "Bugün 21:45", "Yarın", gün adı; geri sayım yalnızca son 60 dakikada.
10. **Oynatıcı durumu kaybolmaz:** Oynatıcıdan çıkınca mini oynatıcı kalır; uygulama yeniden açıldığında son kanal/konum 1 dokunuşla geri gelir.
11. **TV'ye geçiş sabit yerde:** "TV'de izle" simgesi oynatıcı ve detayda hep aynı köşededir; hedef cihaz yoksa gizlenmez, pasif görünür ve nedenini açıklar.
12. **Boş ekran yok:** Her veri bölgesinin iskelet, boş ve hata durumu çizilmiş olmalıdır; hata durumu her zaman "Tekrar dene" içerir ve sayfanın geri kalanını kilitlemez.

---

## 4. Kodlama aşaması için mimari notu

### 4.1 Servis sınırları
| Servis | Sorumluluk |
|---|---|
| Gateway / BFF | Persisted GraphQL, yetenek pazarlığı, cihaz tipine göre biçimleme |
| Kimlik ve Profil | Hesap, hane, profil, ebeveyn denetimi |
| Cihaz ve Oturum | Cihaz kaydı, etkin oynatma oturumları, devir ve kumanda komutları |
| Yetki | Paket, eklenti, cihaz/ağ kısıtı → `access` kararı |
| Katalog | VOD başlık, sezon/bölüm, kişi, koleksiyon |
| EPG / Canlı | Kanal, program, yayın, geri al penceresi |
| Spor | Etkinlik, skor, lig, yayın eşlemesi |
| Sayfa / Keşif | Satır birleştirme ve sıralama |
| Arama | Çok türlü indeks, öneri, niyet sıralaması |
| Oynatma | Manifest, DRM lisansı, imzalı URL, eşzamanlı izleme sınırı |
| İlerleme | Bookmark, watchStatus, son kanal |
| Kayıt | Bulut PVR zamanlama ve kütüphane |
| Görsel | Varyant + boyutlandırma |
| Olay | Toplu olay alımı, QoE ölçümleri |

### 4.2 İstemci sözleşmesi örneği

```json
{ "page": "home", "expires": "2026-11-12T19:05:00Z",
  "rows": [
    { "rowId": "live-now", "type": "CHANNEL_ROW", "title": "Şimdi Canlı", "ttlSec": 60,
      "items": [
        { "kind": "CHANNEL", "id": "ch:101", "name": "Örnek Kanal", "logo": "img://ch/101",
          "now":  { "airingId": "air:9001", "title": "Ana Haber",
                    "startAt": "2026-11-12T19:00:00+03:00", "endAt": "2026-11-12T20:00:00+03:00",
                    "startOver": true },
          "next": { "title": "Dizi", "startAt": "2026-11-12T20:00:00+03:00" },
          "access": { "state": "PLAYABLE" },
          "track": { "row": 1, "pos": 0 } } ] },
    { "rowId": "continue", "type": "CONTINUE_ROW", "title": "İzlemeye Devam",
      "items": [
        { "kind": "VIDEO", "id": "vid:555", "title": "Örnek Dizi", "subtitle": "S2 B4",
          "art": { "still": "img://vid/555/still" },
          "progress": { "positionSec": 1260, "durationSec": 2700 },
          "access": { "state": "PLAYABLE" }, "track": { "row": 2, "pos": 0 } } ] },
    { "rowId": "matches-today", "type": "MATCH_ROW", "title": "Bugünün Maçları", "ttlSec": 30,
      "items": [
        { "kind": "SPORT_EVENT", "id": "ev:777", "competition": "Örnek Lig",
          "home": { "name": "Ev Sahibi", "crest": "img://t/1" },
          "away": { "name": "Konuk", "crest": "img://t/2" },
          "state": "LIVE", "minute": 63, "score": { "home": 1, "away": 0 },
          "access": { "state": "UPSELL", "reasonText": "Spor paketiyle izlenir",
                      "requiredProduct": "prod:spor" },
          "track": { "row": 3, "pos": 0 } } ] } ] }
```

Kurallar: `kind` ayrımı zorunludur; istemci tanımadığı `type` veya `kind` değerini sessizce atlar; `access` her oynatılabilir öğede bulunur; her satır kendi `ttlSec` değerini taşır.

### 4.3 Performans bütçeleri (hedef önerisi; mevcut durum ölçülüp doğrulanmalı)
| Ölçüt | p50 | p95 |
|---|---|---|
| VOD ilk kare (Oynat → görüntü) | 1,5 sn | 3 sn |
| Kanal zap (kanal değiştir → görüntü) | 1 sn | 2 sn |
| Ana sayfa ilk anlamlı içerik (orta seviye Android, 4G) | 2 sn | 4 sn |
| Arama yanıtı (tuş → sonuç) | 200 ms | 400 ms |
| Detay açılışı (ön veri hazırken) | 150 ms | 300 ms |
| Yeniden tamponlama oranı | < %0,5 izleme süresi | — |
| Oturum devri (dokunuş → TV'de görüntü) | 3 sn | 5 sn |

### 4.4 MVP ve sonrası
**MVP:** satır/sayfa şeması + `kind` ayrımı; `access` modeli ve nazik "pakette yok"; çok türlü arama + yetenek bildirimi + boş durum; canlı kartı (şimdi/sonraki, ilerleme); baştan başlat + geri al; bookmark ve son kanal; persisted sorgular; olay şeması ve QoE ölçümleri; görsel varyantları; ayrı altyazı/ses parçaları; `track` konum izleme; "TV'de devam et" (temel devir).

**Sonra:** satır prefetch ve video önizleme; komşu kanal manifest ön hazırlığı; CDN yarışı (FTL benzeri); kişiselleştirilmiş artwork; telefonu tam kumanda olarak kullanma; bulut PVR dizi kaydı; skor gizleme ve maç anları; moodTags tabanlı keşif; düşük gecikmeli canlı spor yayını.
