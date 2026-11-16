---
baslik: Tarayıcı API'leri
ozet: Depolama seçeneklerinin karşılaştırması; pano, paylaşım, bildirim, mikrofon/kamera, konum ve ekranı uyanık tutma; izin isteme kalıbı, güvenli bağlam gereği ve özellik algılama.
etiketler: [tarayici, depolama, izin, mikrofon, bildirim, onyuz]
duzey: orta
guncellik: 2026-11
---

# Tarayıcı API'leri

> Bu notu ne zaman okumalı: veriyi tarayıcıda nerede saklayacağınıza karar verirken; mikrofon, kamera, konum,
> bildirim, pano ya da paylaşım kullanan bir özellik yazarken; "telefonda çalışmıyor, bilgisayarda çalışıyor"
> durumunda.

## Temel fikir

Güçlü tarayıcı API'leri dört kapıdan geçer: (1) **güvenli bağlam** (HTTPS ya da `localhost`), (2) **kullanıcı
etkinleşmesi** (çağrı bir dokunuşun içinden yapılmalı), (3) **izin** (kullanıcı onayı) ve (4) **destek** (her
tarayıcıda yok). Biri eksikse API ya hiç yoktur ya da sessizce reddeder. Bu yüzden her kullanım şu sırayla yazılır:
özelliği algıla → bağlamı anlat → kullanıcının düğmesiyle iste → reddedilirse yol göster → yedek yol sun.

Depolamada ise soru "nerede saklayayım"dır ve yanıt verinin türüne bağlıdır: oturum çerezde, küçük tercih
localStorage'da, kullanıcı verisi IndexedDB'de, uygulama dosyaları Cache Storage'da.

## Depolama seçenekleri

| Seçenek          | Ne saklar                       | Boyut (tarayıcıya göre) | Erişim                    | Kim erişir             | Ne için                         | Tuzak                                              |
| ---------------- | ------------------------------- | ----------------------- | ------------------------- | ---------------------- | ------------------------------- | -------------------------------------------------- |
| Çerez            | Kısa metin                      | ~4 KB / çerez           | Her istekle sunucuya gider | Sunucu; `HttpOnly` değilse JS | Oturum kimliği (`HttpOnly; Secure; SameSite`) | İstemci verisini çereze koymak her isteği şişirir |
| localStorage     | Yalnız metin                    | Birkaç MB               | Eşzamanlı (ana iş parçacığını bekletir) | Yalnız sayfa (worker/SW değil) | Küçük tercih, bayrak | JSON'suz kayıt veri kaybettirir; büyük veri takılma yapar |
| sessionStorage   | Yalnız metin                    | Birkaç MB               | Eşzamanlı                 | Yalnız o sekme         | Sekme içi geçici taslak         | Sekme kapanınca gider; yeni sekmeye geçmez          |
| IndexedDB        | Yapılandırılmış klon (Date, Blob, Map…) | Diskin bir oranı | Eşzamansız, işlemli       | Sayfa, worker, SW      | Kullanıcı verisi, dosya, ses    | Şema sürümleri; işlem içinde başka `await`         |
| Cache Storage    | İstek/yanıt çiftleri            | Diskin bir oranı        | Eşzamansız                | Sayfa, SW              | Uygulama kabuğu, indirilen dosya | Kişisel API yanıtını koymak                        |
| OPFS             | Siteye özel dosya sistemi       | Diskin bir oranı        | Eşzamansız; worker'da eşzamanlı tutamaç | Sayfa, worker | Büyük ikili dosya, tarayıcıda SQLite | Kullanıcı dosyayı göremez; yedek/dışa aktarma şart |

Sınırlar tarayıcıya ve diske göre değişir; rakama güvenmeyin, `navigator.storage.estimate()` ile ölçün ve
`QuotaExceededError`'ı yakalayın. Kalıcılık ve Safari'nin veri silme kuralı: [PWA ve çevrimdışı](pwa-ve-cevrimdisi.md).

```js calistir
import assert from 'node:assert/strict'

// localStorage yalnız METİN saklar: değer String() ile çevrilir.
const asLocalStorage = (value) => String(value)
assert.equal(asLocalStorage({ ad: 'Ayşe' }), '[object Object]') // JSON.stringify unutulursa veri gider
assert.equal(asLocalStorage(42), '42') // sayı metin olarak geri gelir

// JSON gidiş-dönüşü türleri bozar:
const record = { at: new Date('2026-11-16T10:00:00Z'), tags: new Set(['ilaç']), note: undefined }
const viaJson = JSON.parse(JSON.stringify(record))
assert.equal(typeof viaJson.at, 'string') // Date → metin
assert.deepEqual(viaJson.tags, {}) // Set → boş nesne
assert.equal('note' in viaJson, false) // undefined alan kayboldu

// IndexedDB yapılandırılmış klon (structured clone) kullanır: Date, Set, Map, Blob korunur; işlev saklanamaz.
const viaClone = structuredClone(record)
assert.ok(viaClone.at instanceof Date)
assert.ok(viaClone.tags.has('ilaç'))
assert.throws(() => structuredClone({ onClick: () => {} }), { name: 'DataCloneError' })
console.log('tamam')
```

```cikti
tamam
```

IndexedDB işlem (transaction) tuzağı: işlem, içinde bekleyen IndexedDB isteği kalmayınca kendiliğinden kapanır.
İşlemin ortasında `await fetch(...)` gibi IndexedDB dışı bir bekleme yaparsanız işlem kapanır ve sonraki yazma
`TransactionInactiveError` verir. Ağ işini işlemden **önce** yapın; işlem içinde yalnız veritabanı çağrıları olsun.
Dexie kullanılıyorsa da bu kural geçerlidir.

## Pano (Clipboard)

- `navigator.clipboard.writeText(text)` güvenli bağlam ister; bazı tarayıcılar kullanıcı dokunuşu da ister. Dokunuşun
  içinden çağırın, `await` ile sonucunu bekleyip "Kopyalandı" deyin (`role="status"`).
- Panodan **okumak** izin ister ve kullanıcıyı ürkütür; yalnız açık bir "Yapıştır" düğmesinde kullanın.
- Yedek: metni seçili bir alanda gösterin; kullanıcı kendisi kopyalasın.

## Paylaşım (Web Share)

`navigator.share({ title, text, url })` telefonun paylaşım sayfasını açar; güvenli bağlam + dokunuş ister. Dosya
paylaşmadan önce `navigator.canShare({ files })` sorun. Kullanıcı paylaşım sayfasını kapatırsa söz `AbortError` ile
reddedilir: bu bir hata değildir, ileti göstermeyin.

```js calistir
import assert from 'node:assert/strict'

// Paylaşım: Web Share → panoya kopyala → metni göster. Kullanıcının vazgeçmesi hata değildir.
async function share(nav, data) {
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data)
      return 'paylaşıldı'
    } catch (error) {
      if (error.name === 'AbortError') return 'vazgeçildi'
    }
  }
  if (nav.clipboard?.writeText) {
    await nav.clipboard.writeText(data.url)
    return 'kopyalandı'
  }
  return 'metni göster'
}
const cancelled = Object.assign(new Error('iptal'), { name: 'AbortError' })
const url = 'https://ornek.app/#/liste/1'

assert.equal(await share({ share: async () => {} }, { url }), 'paylaşıldı')
assert.equal(await share({ share: async () => { throw cancelled } }, { url }), 'vazgeçildi')
assert.equal(await share({ clipboard: { writeText: async () => {} } }, { url }), 'kopyalandı') // Web Share yok
assert.equal(await share({}, { url }), 'metni göster')
console.log('tamam')
```

## Bildirim

- Önce değeri gösterin, sonra isteyin: "İlaç saatinde hatırlatayım mı?" kartı → kullanıcı "Evet"e basınca
  `Notification.requestPermission()`. Açılışta istemek çoğu kullanıcıda kalıcı "Engelle" ile biter.
- Sayfa açıkken yerel bildirim gösterilebilir (`registration.showNotification`). **Uygulama kapalıyken ileri tarihli
  hatırlatma** için güvenilir bir tarayıcı yolu yoktur; Web Push ve onu gönderen bir sunucu gerekir. Sunucusuz,
  yalnız cihazda çalışan bir uygulamada "her gün 9'da hatırlat" sözü verilemez; bunu ürün kararında açıkça yazın.
- iOS'ta web bildirimi yalnız ana ekrana kurulmuş uygulamada çalışır.

## Mikrofon ve kamera

- `navigator.mediaDevices.getUserMedia({ audio: true })` güvenli bağlam ister; izin penceresi ilk çağrıda açılır.
  Kaydet düğmesine basınca isteyin.
- Bitince **her izi durdurun** (`stream.getTracks().forEach((t) => t.stop())`); yoksa mikrofon/kamera göstergesi
  yanık kalır.
- Kayıt biçimi tarayıcıya göre değişir: `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` yoksa
  `audio/mp4` deneyin; kaydın türünü Blob'la birlikte saklayın. Köprü'nün `src/lib/media.ts` dosyası bu kalıbı
  izler (ses kaydı + fotoğraf küçültme).

| Hata adı              | Anlamı                                   | Kullanıcıya ne denir                                         |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `NotAllowedError`     | İzin verilmedi (ya da güvenli bağlam yok) | "Mikrofon izni kapalı. Ayarlardan açabilirsiniz." + nasıl    |
| `NotFoundError`       | Aygıt yok                                | "Bu cihazda mikrofon bulunamadı."                            |
| `NotReadableError`    | Aygıt başka uygulamada meşgul            | "Mikrofon başka bir uygulamada açık. Kapatıp yeniden deneyin." |
| `OverconstrainedError` | İstenen ayar (çözünürlük, kamera) yok    | Kısıtı gevşetip yeniden deneyin; kullanıcıya gösterilmez     |

## Konum

`navigator.geolocation.getCurrentPosition(ok, hata, { enableHighAccuracy, timeout, maximumAge })`. Her zaman
`timeout` verin (yoksa sonsuza dek bekleyebilir). Hata kodları: 1 izin yok, 2 konum alınamadı, 3 zaman aşımı.
`watchPosition` pili tüketir; işiniz bitince `clearWatch`. Konumu saklayacaksanız gerekenden hassas saklamayın
(kişisel veridir).

## Ekranı uyanık tutma (Wake Lock)

```js
// Gösterim (tarayıcı): tarif/pano ekranı açıkken ekran kararmasın.
let wanted = false
let lock = null
async function acquire() {
  if (!('wakeLock' in navigator)) return // destek yok: sessizce vazgeç
  try { lock = await navigator.wakeLock.request('screen') } catch { lock = null } // pil tasarrufu kipi reddedebilir
}
export async function keepAwake(on) {
  wanted = on
  if (on) await acquire()
  else await lock?.release()
}
// Sekme gizlenince kilit KENDİLİĞİNDEN bırakılır; isteniyorsa geri gelince yeniden alın.
document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') void acquire()
})
```

## İzin isteme kalıbı

```js calistir
import assert from 'node:assert/strict'

// Önce bağlam (neden?), sonra kullanıcının düğmesiyle tarayıcı penceresi; reddedilince yol göster.
function permissionUi(state, event) {
  if (state === 'granted') return { show: 'özellik', request: false }
  if (state === 'denied') {
    // Tarayıcı bir daha sormaz; request() hemen reddedilir. Ayarlardan nasıl açılacağını gösterin.
    return { show: event === 'özelliğe dokundu' ? 'ayarlar yardımı' : 'normal', request: false }
  }
  // 'prompt' ya da bilinmiyor
  if (event === 'özelliğe dokundu') return { show: 'açıklama kartı', request: false }
  if (event === 'izin ver dokundu') return { show: 'bekleniyor', request: true }
  return { show: 'normal', request: false } // açılışta asla istenmez
}

assert.deepEqual(permissionUi('prompt', 'açılış'), { show: 'normal', request: false })
assert.deepEqual(permissionUi('prompt', 'özelliğe dokundu'), { show: 'açıklama kartı', request: false })
assert.deepEqual(permissionUi('prompt', 'izin ver dokundu'), { show: 'bekleniyor', request: true })
assert.deepEqual(permissionUi('denied', 'özelliğe dokundu'), { show: 'ayarlar yardımı', request: false })
assert.deepEqual(permissionUi('granted', 'özelliğe dokundu'), { show: 'özellik', request: false })
console.log('tamam')
```

- İzin durumunu önceden öğrenmek için `navigator.permissions.query({ name: 'microphone' })`; her ad her tarayıcıda
  desteklenmez, `try/catch` içinde çağırın ve hata olursa "bilinmiyor" sayın.
- Reddedildikten sonra açıklama kartı yine çıkabilir, ama tarayıcı penceresi çıkmaz: kart "Ayarlar → Site ayarları →
  Mikrofon" yolunu (Android) ya da "Ayarlar → Safari / uygulama" yolunu (iOS) anlatır.
- İzinsiz de çalışan bir yol bırakın (mikrofon yoksa hazır ses, konum yoksa il seçimi).

## Güvenli bağlam (HTTPS) gereği

Servis çalışanı, kamera/mikrofon, konum, pano, paylaşım, bildirim ve wake lock yalnız güvenli bağlamda vardır.
Bilgisayardaki geliştirme sunucusuna telefondan yerel ağ adresiyle (`http://192.168…`) girince bunların hepsi
kaybolur:

```js calistir
import assert from 'node:assert/strict'

// Sadeleştirilmiş kural (W3C Secure Contexts): https/wss, localhost ve geri döngü adresleri güvenlidir.
function isPotentiallyTrustworthy(href) {
  const url = new URL(href)
  if (['https:', 'wss:', 'file:'].includes(url.protocol)) return true
  const host = url.hostname
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  return /^127(\.\d{1,3}){3}$/.test(host) || host === '[::1]'
}

assert.equal(isPotentiallyTrustworthy('https://uygulama.ornek.com'), true)
assert.equal(isPotentiallyTrustworthy('http://localhost:5310'), true)
assert.equal(isPotentiallyTrustworthy('http://127.0.0.1:5310'), true)
assert.equal(isPotentiallyTrustworthy('http://[::1]:5310'), true)
assert.equal(isPotentiallyTrustworthy('http://192.168.1.20:5310'), false) // telefondan: mikrofon, SW YOK
assert.equal(isPotentiallyTrustworthy('http://uygulama.local:5310'), false)
console.log('tamam')
```

Telefonda denemek için geliştirme sunucusunu HTTPS ile açın (Köprü: `npm run dev:https`, Vite'ın basit SSL
eklentisiyle; tarayıcı sertifika uyarısını bir kez onaylatır) ya da derleyip HTTPS'li bir önizleme adresine koyun.
Kodda `window.isSecureContext` ile denetleyip "Bu özellik güvenli bağlantı ister" diyebilirsiniz.

## Özellik algılama

| Ne                              | Nasıl algılanır                                                   |
| ------------------------------- | ----------------------------------------------------------------- |
| Servis çalışanı                 | `'serviceWorker' in navigator`                                    |
| Paylaşım / dosya paylaşımı      | `typeof navigator.share === 'function'` / `navigator.canShare?.({ files })` |
| Ses kaydı                       | `'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia` |
| Ekranı uyanık tutma             | `'wakeLock' in navigator`                                         |
| Kalıcı depolama                 | `typeof navigator.storage?.persist === 'function'`                |
| CSS özelliği                    | `CSS.supports('height', '100dvh')`                                |
| Dokunmatik mi, fare mi          | `matchMedia('(hover: hover) and (pointer: fine)')`                |
| Kurulu uygulama olarak mı açık  | `matchMedia('(display-mode: standalone)').matches`                |

Tarayıcı adına (user agent) bakmayın: yanılır ve eskir. Tek makul istisna, API'si olmayan bir yönerge göstermektir
(iOS'ta "Ana Ekrana Ekle" kartı gibi). Algılama sonucunu arayüzde kullanın: desteklenmeyen düğmeyi gizleyin ya da
yedeğini sunun, tıklayınca hata vermesin.

## Tuzaklar

| Belirti                                                          | Neden                                                    | Çözüm                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| Bilgisayarda çalışıyor, telefonda mikrofon/paylaşım yok          | Telefondan `http://192.168…` ile girildi                 | HTTPS'li geliştirme ya da önizleme                        |
| Kayıtlı ayar `[object Object]` olarak geri geldi                 | localStorage'a `JSON.stringify` olmadan yazıldı          | Okuma/yazmayı şemalı tek yardımcıdan geçirin              |
| Tarih alanları metin olarak geri geliyor                         | JSON gidiş-dönüşü                                        | IndexedDB (yapılandırılmış klon) ya da şemayla dönüştürme |
| IndexedDB yazımı "TransactionInactiveError" veriyor              | İşlem içinde ağ isteği beklendi                          | Ağ işini işlemden önce yapın                              |
| İzin penceresi hiç çıkmıyor                                      | Daha önce reddedilmiş ya da çağrı dokunuşun dışında      | `permissions.query` ile durumu okuyun; ayarlar yardımı    |
| Kullanıcı paylaşımı kapatınca "Hata oluştu" çıkıyor              | `AbortError` hata sanıldı                                | `AbortError`'ı sessizce geçin                             |
| Kamera ışığı yanık kalıyor                                       | İzler durdurulmadı                                       | Bileşen kalkınca/bitişte `track.stop()`                   |
| Safari'de ses kaydı açılmıyor                                    | Sabit `audio/webm` istendi                               | `isTypeSupported` ile biçim seçin                         |
| Ekran yine kararıyor                                             | Wake lock sekme gizlenince bırakıldı                     | `visibilitychange`'de yeniden alın                        |
| Açılışta izin isteyen uygulama kalıcı olarak engellendi          | Bağlamsız izin isteği                                    | Önce açıklama kartı, sonra düğmeyle istek                 |

## Denetim listesi

- [ ] Her tarayıcı API'si kullanımında özellik algılama ve desteklenmeyen durumda yedek yol var.
- [ ] İzinler yalnız kullanıcının ilgili düğmesine basmasıyla isteniyor; öncesinde neden gerektiği anlatılıyor.
- [ ] Reddedilen izin için ayarlara yol gösteren metin var; özellik izinsiz de bir biçimde kullanılabiliyor.
- [ ] Mikrofon/kamera akışları iş bitince ve bileşen kalkınca durduruluyor.
- [ ] Kullanıcı verisi IndexedDB'de; localStorage yalnız küçük tercihler için ve şemayla okunuyor.
- [ ] Telefonda HTTPS üzerinden denendi (yerel ağ IP'si üzerinden değil).
- [ ] `QuotaExceededError` ve `AbortError` ayrıca ele alınıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu API'yi kullanmadan önce özellik algıla; yoksa yedek yolu göster. İzni sayfa açılırken değil,
  kullanıcının düğmesinde iste ve reddedilirse ayarlara yol gösteren metni göster. Akışları bitince durdur.
  Kullanıcı verisini localStorage'a değil IndexedDB'ye yaz."
- **Modelin tipik hatası:** `useEffect` içinde açılışta izin ister; `navigator.share` varlığını denetlemeden çağırır;
  `AbortError`'ı hata olarak gösterir; büyük veriyi localStorage'a JSON olarak yazar; tarayıcı adına bakarak
  dallanır.
- **Çıktıda arayın:** effect içinde `getUserMedia`/`requestPermission`/`getCurrentPosition`; `navigator.userAgent`;
  `localStorage.setItem` ile büyük nesneler; `track.stop` olmayan kayıt kodu; IndexedDB işlemi içinde `fetch`.
- **Test isteyin:** Sahte `navigator` nesneleriyle "API yok", "izin reddedildi", "kullanıcı vazgeçti" dallarının
  birim testleri (yukarıdaki `share` örneği gibi).

## İlgili

- [PWA ve çevrimdışı](pwa-ve-cevrimdisi.md) — depolama kalıcılığı, kota, iOS farkları
- [Ön yüz güvenliği](onyuz-guvenligi.md) — belirteci nerede saklamalı
- [Hata ve boş durumlar](hata-ve-bos-durumlar.md) — izin reddi ve aygıt hatası metinleri
- Çalışan örnekler: [`storage.ts`](../../uygulama/web/src/lib/storage.ts) (kota ve kalıcılık),
  [`backup.ts`](../../uygulama/web/src/lib/backup.ts) (dışa aktarma)
