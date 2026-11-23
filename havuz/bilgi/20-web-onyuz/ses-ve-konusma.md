---
baslik: Ses ve konuşma: sesli okuma, ses kaydı ve konuşma tanıma
ozet: Web Speech API ile Türkçe sesli okuma ve tanıma, ses bulunamayınca hazır kayda düşme, kendiliğinden çalma kuralı, iOS sessiz düğmesi, ses biçimleri, MediaRecorder ile kayıt ve konuşan uygulama denetim listesi.
etiketler: [ses, konusma, web-speech, mediarecorder, mobil, erisilebilirlik]
duzey: orta
guncellik: 2026-11
---

# Ses ve konuşma: sesli okuma, ses kaydı ve konuşma tanıma

> Bu notu ne zaman okumalı: uygulama bir metni sesli okuyacaksa, kullanıcının sesini kaydedecekse ya da konuşmayı
> yazıya çevirecekse; "bende ses çıkıyor, annemin telefonunda çıkmıyor" şikâyeti geldiğinde.

## Temel fikir

Tarayıcıda ses üç ayrı iştir ve üçünün güvenilirliği çok farklıdır:

1. **Sesli okuma** (`speechSynthesis`, TTS): sesi **cihaz** sağlar. API'nin var olması Türkçe bir sesin var olduğu
   anlamına gelmez. Ses listesi ilk anda boş gelebilir, Türkçe ses hiç olmayabilir, olan ses metni sunucuya gönderen
   bir ağ sesi olabilir. Bu makinedeki başsız Chromium'da API var ama ses sayısı 0'dır; `speak()` hata olayı
   (`synthesis-failed`) verir, ekranda hiçbir şey olmaz.
2. **Ses kaydı** (`MediaRecorder`): dosya sizindir; ama biçimi tarayıcıya göre değişir.
3. **Konuşma tanıma** (`SpeechRecognition`): çoğu tarayıcıda ses bir sunucuya gider; internetsiz çalışmaz, kısa
   tek sözcükte ve alışılmadık konuşmada (afazi, aksan) yanılır.

Sonuç: önemli her cümlenin **güvenceli bir yolu** olmalı (kişisel kayıt → hazır ses dosyası → cihaz sesi) ve hiçbir
bilgi **yalnız sesle** verilmemeli: resim ve yazı her zaman ekranda kalır.

## Karar tablosu

| Durum                                                         | Seçim                                                                  | Neden                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Sabit, sayılabilir metin (kart adları, ipuçları, düğmeler)    | Derlemede **bir kez** seslendirilmiş hazır dosya (MP3)                 | Her cihazda aynı ses; internetsiz; Türkçe sesi olmayan telefonda da çalışır |
| Kullanıcının yazdığı serbest metin                            | Cihaz sesi; yoksa metin ekranda kalır                                  | Önceden kaydedilemez                                                   |
| Kişiye özel içerik (aile adları, torunun adı)                 | Ailenin kendi ses kaydı                                                | Sentez sesi özel adları bozar; "önce kişisel"                          |
| Çok sayıda dinamik metin, kalite önemli, internet var         | Sunucuda TTS, sonucu önbelleğe al                                      | Cihaz sesine bağlı kalmaz; ama maliyet, gizlilik ve çevrimdışı kaybı   |
| Dikte (konuşarak yazma)                                       | Önce telefon klavyesinin kendi dikte düğmesi                           | Uygulamaya izin, sunucu, gizlilik yükü getirmez                        |
| Telaffuz alıştırması, "doğru söyledi mi?" puanı               | Tarayıcı tanımasına **güvenmeyin**; kaydı saklayın, insan dinlesin     | Tanıma motoru dil modeliyle "düzeltir": yanlış söyleneni doğru yazar   |
| Bildirim/geri bildirim sesi (onay tonu)                       | Görsel geri bildirimle **birlikte**                                    | Sessiz düğme, kısık ses, işitme kaybı                                  |

## Sesli okuma: ses seçimi

- `speechSynthesis.getVoices()` sayfa açılırken boş dizi döndürebilir; `voiceschanged` olayını bir üst süreyle
  bekleyin (Köprü'nün `src/lib/speech.ts` dosyası 1,5 sn bekler).
- Dil kodunu normalleştirin: Android'de `tr_TR` biçimi görülebilir; `lang.replace('_', '-')`.
- `localService: false` olan ses **ağ sesidir**: metin bir sunucuya gider, internet yokken susar. "Veri telefonda
  kalır" diyen bir ürün bunu ayarlar ekranında söylemeli ya da yalnız yerel sesleri kullanmalıdır.
- Hiç Türkçe ses yoksa `u.lang = 'tr-TR'` verseniz bile motor metni başka dilin sesiyle okuyabilir: hata olmaz,
  Türkçe metin İngiliz aksanıyla okunur. Kurulumda **ses testi** gösterin ("Bu cümleyi duydunuz mu?").

```js calistir
import assert from 'node:assert/strict'

// Türkçe ses seçimi. Android'de dil "tr_TR" diye gelebilir; ağ sesi (localService: false) metni sunucuya
// gönderir ve internetsiz çalışmaz.
const normLang = (lang) => lang.replace('_', '-').toLowerCase()
function chooseVoice(voices, { preferredURI, offlineOnly = false } = {}) {
  const tr = voices.filter((v) => normLang(v.lang).startsWith('tr'))
  const usable = offlineOnly ? tr.filter((v) => v.localService) : tr
  return (
    usable.find((v) => v.voiceURI === preferredURI) ??
    usable.find((v) => v.localService) ??
    usable[0] ??
    null // Türkçe ses yok: hazır kayda düşün ya da metni gösterin
  )
}

const android = [
  { lang: 'en_US', localService: true, voiceURI: 'en-us-x-1' },
  { lang: 'tr_TR', localService: true, voiceURI: 'tr-tr-x-1' },
]
const networkOnly = [{ lang: 'tr-TR', localService: false, voiceURI: 'Google Türkçe' }]

assert.equal(chooseVoice(android)?.voiceURI, 'tr-tr-x-1') // "tr_TR" de bulundu
assert.equal(chooseVoice([]), null) // liste ilk anda boş gelebilir: voiceschanged beklenir
assert.equal(chooseVoice(networkOnly)?.localService, false) // çalışır ama internet ister
assert.equal(chooseVoice(networkOnly, { offlineOnly: true }), null) // "internetsiz" söz verildiyse kullanılmaz
assert.equal(chooseVoice([{ lang: 'en-US', localService: true, voiceURI: 'x' }]), null) // İngilizce sesle okutmayın
console.log('tamam')
```

## Sesli okuma: olaylar güvenilmez

`onstart`, `onend`, `onerror` olaylarının her motorda zamanında geleceğine güvenmeyin. Aşağıdaki belirtiler sahada
görülmüş ve Köprü'nün `speech.ts` dosyasında önlem alınmıştır (her cihazda ayrıca doğrulayın):

| Belirti                                                 | Olası neden                                              | Önlem                                                          |
| ------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| Ses yok, hata da yok                                    | Türkçe ses yok, ses listesi yüklenmedi, dokunuş yok      | Ses testi; `voiceschanged` + üst süre; ilk dokunuşta kilit açma |
| Konuşma ortasında kesiliyor (Android Chrome)            | `SpeechSynthesisUtterance` nesnesi çöpe gitti            | Nesnenin başvurusunu konuşma bitene dek bir değişkende tutun   |
| `cancel()`'ın hemen ardından gelen `speak()` sessiz      | Motor iptali bitirmeden yeni metni düşürüyor             | İptalden sonra ~100 ms bekleyip konuşun                        |
| `onend` hiç gelmiyor, sıradaki cümle hiç başlamıyor      | Olay bazı motorlarda kayboluyor                          | Metin uzunluğuna göre üst süre; süre dolunca "bitti" sayın     |
| `onstart` geç geliyor                                   | Motor yavaş başlıyor                                     | `speechSynthesis.speaking` da başlangıç sayılır                |
| Masaüstü Chrome'da hiçbir şey okunmuyor                 | Konuşma kuyruğu "duraklatılmış" kalmış                   | `speak()`'ten önce `resume()`                                  |
| Uzun metin yarıda kalıyor                               | Bazı motor/ses ikililerinde uzun konuşma kesiliyor (doğrulanmadı) | Cümlelere bölüp sırayla okuyun                       |

Bunların ortak çaresi: her okuma yolunu bir **üst süreyle** sarmak ve kullanıcı yeni bir karta dokununca eski
okumanın yedek denemelerini durdurmak. İkincisi unutulursa hızlı iki dokunuşta önceki kelime sonradan araya girer:

```js calistir
import assert from 'node:assert/strict'

// Okuma sırası: kişisel kayıt → hazır dosya → cihaz sesi. Her yol hata verebilir ya da hiç bitmeyebilir (onend
// gelmez). Kullanıcı başka karta dokununca eski okumanın yedek denemeleri durmalıdır.
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((ok) => setTimeout(() => ok('süre doldu'), ms))])

let generation = 0
async function speak(text, ways, said) {
  const mine = ++generation
  for (const way of ways) {
    if (mine !== generation) return 'iptal' // bu denetim yoksa eski metin yenisinin ARDINDAN okunur
    if ((await withTimeout(way(text), 50)) === 'tamam') {
      said.push(text)
      return way.name
    }
  }
  return 'hiçbiri' // metni ve resmi göstermeye devam: ses tek kanal değildir
}

const fails = async () => 'hata'
const hangs = () => new Promise(() => {}) // onend'i hiç gelmeyen motor
const works = async () => 'tamam'
const said = []
assert.equal(await speak('su', [fails, hangs, works], said), 'works') // takılmadan sıradakine geçti

const first = speak('ilaç', [hangs, works], said) // ilk yol takıldı...
const second = speak('ağrı', [works], said) // ...bu arada kullanıcı başka karta dokundu
assert.equal(await second, 'works')
assert.equal(await first, 'iptal')
assert.deepEqual(said, ['su', 'ağrı']) // "ilaç" sonradan araya girmedi
console.log('tamam')
```

Hız ve telaffuz: `rate` 0,8–0,9 yaşlı ve afazili kullanıcı için iyi bir başlangıçtır, ama her motor hızı farklı
yorumlar; gerçek cihazda dinleyin. Web Speech API'ye SSML etiketleri vermeyin (motorların çoğu desteklemez, etiketi
okuyabilir; doğrulanmadı): sayı, tarih ve kısaltmayı metni önceden düzelterek okutun
([Türkçe ses ve konuşma](../97-turkce/turkce-ses-ve-konusma.md)).

## Kendiliğinden çalma ve ses kilidi

Tarayıcılar kullanıcı etkileşimi olmadan ses çalmayı engeller. Chromium'da, kullanıcı etkinleşmesi isteyen kipte
(`--autoplay-policy=document-user-activation-required`) şu davranış denendi:

| An                                   | `new Audio(…).play()`       | `AudioContext` durumu        |
| ------------------------------------ | --------------------------- | ---------------------------- |
| Sayfa açılırken (dokunuş yok)        | `NotAllowedError` ile ret   | `suspended`                  |
| Bir düğmeye dokunulduğunda           | Çalar                       | `resume()` sonrası `running` |
| Dokunuştan sonra, zamanlayıcıyla     | Çalar (etkinleşme kalıcı)   | `running`                    |

Kurallar:

- Açılışta kendiliğinden ses çalmayın; çalmanız gerekiyorsa bile `play()` sözünü yakalayın, reddi hata saymayın.
- İlk dokunuşta ses yollarının **kilidini bir kez açın**: `AudioContext`'i `resume()` edin; mobil tarayıcılarda
  ilk konuşmanın da bir dokunuşun içinde başlaması gerekebilir (iOS ayrıntısını cihazda doğrulayın).
- Test ortamında (Playwright `page.evaluate`) kod kullanıcı etkinleşmesiyle çalışır; kendiliğinden çalma yasağı
  orada görünmez. Gerçek davranışı sayfanın kendi betiğiyle ve tıklamayla sınayın.

```js
// Gösterim (tarayıcı): ilk dokunuşta bir kez kilit aç.
const audioContext = new AudioContext() // açılışta 'suspended' başlar
document.addEventListener('pointerdown', () => void audioContext.resume(), { once: true, capture: true })
```

## iOS sessiz düğmesi ve ses oturumu

- iOS'ta Web Audio (`AudioContext`) çıkışının yan taraftaki **sessiz düğmesine** uyduğu, `<audio>` öğesiyle çalınan
  medyanın ise çaldığı yaygın olarak bildirilir (cihazda doğrulayın). Köprü'nün onay tonu `AudioContext` ile
  çalındığından sessizde duyulmayabilir: onay bu yüzden görsel olarak da verilir.
- Safari'nin ses oturumu API'si (`navigator.audioSession.type = 'playback'`) bu davranışı değiştirmek için vardır;
  destek tarayıcıya göre değişir (bu makinedeki Chromium'da yok). `'audioSession' in navigator` ile algılayın.
- Bluetooth kulaklık bağlanıp kopunca çıkış yolu değişir; çalan ses kesilebilir. Uzun okumada "yeniden oku"
  düğmesi her zaman bir dokunuş uzakta olsun.

## Ses biçimleri ve hazır dosyalar

| İş                              | Biçim                                     | Not                                                              |
| ------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Hazır kayıt (derlemede üretilir) | MP3, mono, düşük bit hızı (32 kbit/sn)    | Her tarayıcı çalar; konuşma için yeter                           |
| Tarayıcıda kayıt                | Ne verirse: Chromium/Firefox WebM-Opus, Safari MP4-AAC | `isTypeSupported` ile sorun; türü Blob'la birlikte saklayın |
| Kaydı başka cihazda çalmak       | Türünü `canPlayType` ile denetleyin       | WebM her yerde çalmayabilir; paylaşılacaksa sunucuda dönüştürün  |

`canPlayType` evet/hayır değil `""`, `"maybe"`, `"probably"` döndürür; boş metin "çalamam" demektir. Bu makinedeki
Chromium `MediaRecorder` ile `audio/webm;codecs=opus` ve `audio/mp4` kaydedebiliyor, `audio/ogg` ve `audio/wav`
kaydedemiyordu; başka tarayıcıda liste farklıdır.

Hazır dosyaların adını **normalleştirilmiş metinden** türetin (Türkçe kuralla küçült, noktalamayı at, boşlukları
sadeleştir, özet al): "Su istiyorum." ile "su istiyorum" aynı dosyayı bulur. Köprü'de anahtar `audioKey.ts`'te,
üretim betiği `scripts/make-audio.py`'dedir (açık kaynak Piper sesiyle). Ses modelinin lisansını okuyun: Köprü'nün
kullandığı Türkçe ses ticari olmayan kullanım lisanslıdır; ticari sürümde başka ses gerekir.

## Ses kaydı (MediaRecorder)

1. Özelliği algılayın: `'MediaRecorder' in window && navigator.mediaDevices?.getUserMedia`.
2. İzni **kaydet düğmesinde** isteyin; reddi sakin bir metinle karşılayın ([Tarayıcı API'leri](tarayici-apileri.md)).
3. Biçimi seçin, kaydı başlatın, **üst süre** koyun (Köprü: 15 sn); kaydın sürdüğünü görünür biçimde gösterin.
4. `onstop`'ta **mikrofon izlerini durdurun** ve Blob'u `recorder.mimeType` ile kurun.
5. Blob'u IndexedDB'ye Blob olarak yazın (base64 değil, üçte bir büyür); çalarken nesne adresi oluşturup işi bitince
   `URL.revokeObjectURL` çağırın.
6. Üzerine kayıt onaysız yapılmaz: "Eski kaydın yerine geçsin mi?" ya da eskisini geri alınabilir saklayın.
7. Yedeğe (dışa aktarma) kayıtları da koyun; yoksa telefon değişince ailenin sesi kaybolur.

```js calistir
import assert from 'node:assert/strict'

// Kayıt biçimini tarayıcıya sorun: sabit 'audio/webm' Safari'de kaydı başlatmaz.
const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
const pickMime = (isTypeSupported) => CANDIDATES.find((type) => isTypeSupported(type))
const EXT = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' }
const extensionOf = (type) => EXT[type.split(';')[0]] ?? 'bin'

const chromiumLike = (t) => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].includes(t)
const safariLike = (t) => t === 'audio/mp4'
assert.equal(pickMime(chromiumLike), 'audio/webm;codecs=opus')
assert.equal(pickMime(safariLike), 'audio/mp4')
assert.equal(pickMime(() => false), undefined) // kayıt yok: düğmeyi gizleyin, yedek yolu gösterin
assert.equal(extensionOf('audio/webm;codecs=opus'), 'webm') // dışa aktarırken doğru uzantı

// Boyut: bit hızı (kbit/sn) × süre (sn) / 8 = KB
const kb = (kbps, seconds) => (kbps * seconds) / 8
assert.equal(kb(32, 15), 60) // 15 sn kişisel kayıt ≈ 60 KB
assert.equal(Math.round((kb(32, 2) * 1400) / 1024), 11) // 1400 hazır cümle, ortalama 2 sn → ≈ 11 MB
console.log('tamam')
```

Son satırdaki hesap önbellek kararını verir: on bir megabaytlık ses uygulama kabuğuyla birlikte ilk açılışta
indirilecekse ilk açılış yavaşlar; ayrı, adlandırılmış bir önbelleğe arka planda indirmek ya da en sık
kullanılanları önce almak daha iyidir ([PWA ve çevrimdışı](pwa-ve-cevrimdisi.md)).

## Konuşma tanıma (SpeechRecognition)

- Bu makinedeki Chromium hem `SpeechRecognition` hem `webkitSpeechRecognition` adını sunuyor; adın var olması
  çalışacağını göstermez. Chrome'da ses tanınmak üzere bir sunucuya gönderilir: internetsiz çalışmaz ve sağlık gibi
  hassas bir bağlamda kişisel veri aktarımıdır ([KVKK pratiği](../50-guvenlik/kvkk-pratik.md)). Cihaz üstü
  tanıma seçenekleri belirtime ekleniyor; desteği doğrulanmadı.
- Tanımayı yalnız kullanıcının düğmesiyle başlatın; `onend` sonrası kendiliğinden yeniden başlatan döngü pili
  bitirir ve mikrofon göstergesini sürekli yanık tutar.
- `lang = 'tr-TR'` verin; ara sonuçları (`interimResults`) yalnız gösterin, kararı son sonuçla verin.
- Tek sözcüklük girişte bağlam yoktur, hata oranı yüksektir; alternatifleri (`maxAlternatives`) isteyip kendi
  sözlüğünüzle eşleyin. Türkçede sık hatalar ve ölçme (WER/CER):
  [Türkçe ses ve konuşma](../97-turkce/turkce-ses-ve-konusma.md).

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Bilgisayarda okuyor, annenin telefonunda sessiz               | Cihazda Türkçe ses yok ya da ses bir ağ sesi                  | Hazır ses dosyaları; kurulumda ses testi                      |
| Türkçe metin İngiliz aksanıyla okunuyor                       | Türkçe ses yok; motor varsayılan sese düştü                   | Ses seçiminde Türkçe yoksa cihaz sesini kullanmayın           |
| Açılışta okunması gereken karşılama sesi hiç çıkmıyor          | Kendiliğinden çalma engeli (`NotAllowedError`)                | Sesi kullanıcının ilk dokunuşuna bağlayın                     |
| Onay tonu bazı iPhone'larda duyulmuyor                        | Sessiz düğmesi Web Audio'yu susturuyor                        | Görsel onay; önemli bilgiyi sese bırakmayın                   |
| Hızlı dokunuşlarda kelimeler karışık sırayla okunuyor          | Eski okumanın yedek denemeleri sürüyor                        | Kuşak sayacı; yeni dokunuşta `cancel()`                       |
| Sıralı okuma ikinci cümlede takılıyor                         | `onend` gelmedi                                               | Her okumaya üst süre                                          |
| Kayıt Safari'de başlamıyor                                    | Sabit `audio/webm` istendi                                    | `isTypeSupported` ile seçim                                   |
| Yedekten geri yüklenen kayıt iPhone'da çalmıyor                | WebM kayıt başka cihazda çalınamıyor                          | Türü saklayın, `canPlayType` ile denetleyin, gerekirse dönüştürün |
| Mikrofon göstergesi kayıt bittikten sonra yanık               | İzler durdurulmadı                                            | `onstop`'ta `track.stop()`                                    |
| Uçak kipinde okuma susuyor                                    | Seçilen ses ağ sesi                                           | `localService` olan sesi seçin; hazır kayıt                   |
| Testte her şey yeşil, cihazda ses yok                         | Başsız tarayıcıda ses yok; test yolu sahte                    | Kurulumda ses testi ekranı; gerçek telefonla demo             |

## Denetim listesi

Konuşan bir uygulama için (Köprü gibi):

- [ ] Her okunan öğe ekranda resim ve yazıyla da duruyor; ses tek bilgi kanalı değil.
- [ ] Okuma sırası: kişisel kayıt → hazır dosya → cihaz sesi; her adım bir üst süreyle sarılı.
- [ ] Yeni dokunuş eski okumayı durduruyor (kuşak sayacı ya da `cancel()`); hızlı dokunuş testi var.
- [ ] Türkçe ses seçimi `tr_TR`/`tr-TR` iki biçimini de buluyor; Türkçe yoksa başka dilin sesi kullanılmıyor.
- [ ] Ağ sesi kullanılıyorsa kullanıcıya söyleniyor; "internetsiz" söz veren ürün yalnız yerel ses kullanıyor.
- [ ] Kurulumda ses testi var ve sonucu (hangi yol çalıştı) ayarlarda görünüyor.
- [ ] Açılışta kendiliğinden ses yok; ilk dokunuşta kilit açılıyor; `play()` reddi yakalanıyor.
- [ ] Ses kaydı: özellik algılama, düğmede izin, üst süre, görünür kayıt durumu, `track.stop()`, türüyle saklama.
- [ ] Kayıtlar yedeğe dahil; üzerine kayıt onaylı ya da geri alınabilir.
- [ ] Hazır ses dosyalarının lisansı ve ses modelinin kullanım koşulu yazılı.
- [ ] Gerçek bir Android ve bir iPhone'da sessiz düğmesi açık/kapalı denendi; uçak kipinde denendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Sesli okumayı projedeki `speak()` yardımcısıyla yap; doğrudan `speechSynthesis.speak`
  çağırma. Her okuma yolu üst süreyle sarılı olsun, yeni dokunuş eskisini durdursun. Türkçe ses yoksa başka dilin
  sesine düşme. Ses kaydında biçimi `isTypeSupported` ile seç, bitince mikrofon izlerini durdur."
- **Modelin tipik hatası:** `getVoices()[0]` ile ilk sesi seçer (çoğu cihazda İngilizce); `onend`'e güvenip zaman
  sınırı koymaz; sayfa açılışında `useEffect` içinde okumaya başlar; `audio/webm`'i sabit yazar; kayıt Blob'unu
  base64 metne çevirip localStorage'a koyar.
- **Çıktıda arayın:** `getVoices()[0]`, `speechSynthesis.speak(` çağrılarının yardımcı dışında geçmesi, `onend`
  bekleyen ama süre sınırı olmayan söz, `useEffect` içinde `speak`/`play`, `'audio/webm'` sabiti, `track.stop`
  olmayan kayıt kodu.
- **Test isteyin:** sahte ses listeleriyle (boş, yalnız İngilizce, `tr_TR`, yalnız ağ sesi) ses seçimi testi;
  takılan ve hata veren sahte okuma yollarıyla yedeğe düşme ve hızlı dokunuş testi (yukarıdaki örnekler gibi).

## İlgili

- [Tarayıcı API'leri](tarayici-apileri.md) — izin isteme kalıbı, mikrofon hataları, güvenli bağlam
- [PWA ve çevrimdışı](pwa-ve-cevrimdisi.md) — hazır ses dosyalarını önbelleğe alma, depolama kalıcılığı
- [Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md) — ekran okuyucuyla birlikte çalışma, canlı bölgeler
- [Kamera ve görsel işleme](kamera-ve-gorsel-isleme.md) — aynı izin ve bellek kuralları fotoğraf için
- [Türkçe ses ve konuşma](../97-turkce/turkce-ses-ve-konusma.md) — sayı, tarih, kısaltmayı okunur metne çevirme; WER/CER
- [Yapay zekâ özelliği tasarlama](../95-urun/yapay-zeka-ozelligi-tasarlama.md) — tanıma hatasında arayüz
