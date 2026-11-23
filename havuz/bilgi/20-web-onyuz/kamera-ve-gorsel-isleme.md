---
baslik: Kamera ve görsel işleme: fotoğraf alma, küçültme, yön ve üst veri
ozet: Dosya seçici, capture özniteliği ve getUserMedia arasında seçim; fotoğrafı tarayıcıda küçültme, EXIF yönü, HEIC, üst veriyi temizleme, yükleme öncesi sıkıştırma ve telefonda bellek tuzakları.
etiketler: [kamera, gorsel, fotograf, exif, mobil, performans]
duzey: orta
guncellik: 2026-11
---

# Kamera ve görsel işleme: fotoğraf alma, küçültme, yön ve üst veri

> Bu notu ne zaman okumalı: kullanıcı fotoğraf çekecek ya da galeriden seçecekse; fotoğraflar yan duruyorsa,
> fotoğraf eklerken telefon donuyor ya da sekme kendiliğinden yenileniyorsa; yüklenen görüntünün konum bilgisi
> taşıyıp taşımadığı sorulduğunda.

## Temel fikir

- Fotoğraf almanın üç yolu vardır: **dosya seçici** (`<input type="file" accept="image/*">`, izin istemez, galeri
  ve kamera birlikte), **`capture` özniteliği** (doğrudan kamera, galeri kapanır) ve **`getUserMedia`** (sayfa
  içinde canlı vizör; izin, akış ve en çok kod).
- Telefon fotoğrafı 12 MP ve üstüdür. Dosyası 3–5 MB olsa da çözülünce `genişlik × yükseklik × 4` bayt yer kaplar
  (~47 MB). Saklamadan ve yüklemeden önce **küçültülür**; özgün dosya saklanmaz.
- Telefonlar pikselleri döndürmez, EXIF'e "yön" yazar. Güncel tarayıcılar bu yönü `<img>`'de ve
  `createImageBitmap`'te kendiliğinden uygular (bu makinedeki Chromium'da denendi). Tuvale çizip yeniden kodlamak
  yönü piksele işler ve **EXIF'i atar** (denendi: çıktıda EXIF bölümü yok). Bu, istemcide üst veri temizliğinin de
  yoludur; sunucu yine kendi temizliğini yapar.

## Karar tablosu: fotoğrafı nasıl alırım

| İhtiyaç                                                  | Seçim                                              | Neden                                                     |
| -------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Kullanıcı galeriden seçsin ya da çeksin                  | `<input type="file" accept="image/*">`             | İzin yok; işletim sisteminin seçicisi kamerayı da sunar   |
| Yalnız yeni çekim (belge, sayaç fotoğrafı)               | `capture="environment"` ekleyin                    | Galeri seçeneği kalkar; masaüstünde yok sayılır           |
| Aile fotoğrafı, eski fotoğraflar                          | `capture` **kullanmayın**                          | Yaşlı kullanıcı galerideki fotoğrafı arar; capture onu saklar |
| Canlı önizleme, çerçeve, peş peşe çekim, barkod          | `getUserMedia` + `<video>` + tuval                 | Vizör sizindir; izin ve temizlik sizin işinizdir          |
| Birden çok fotoğraf                                      | `multiple`, ama **sırayla** işleyin                | Hepsini aynı anda çözmek belleği doldurur                 |
| Ön kamera (özçekim)                                      | `capture="user"` ya da `facingMode: 'user'`        |                                                           |

## Küçültme ve yeniden kodlama

1. `createImageBitmap(file)` ile çözün (yön uygulanır). Destekleyen tarayıcıda
   `createImageBitmap(file, { resizeWidth, resizeQuality: 'high' })` çözerken küçültür ve tam boy tuval kurdurmaz
   (Chromium'da denendi; öteki tarayıcılarda algılayıp yedeğe düşün).
2. Hedef boyutu hesaplayın (uzun kenar 1024–1600 px; kart görseli için 800 px yeter), tuvale çizin.
3. `canvas.toBlob(cb, 'image/jpeg', 0.8)` ya da `OffscreenCanvas.convertToBlob(...)` ile kodlayın.
4. Dönen `blob.type`'ı denetleyin: tarayıcı istenen türü kodlayamıyorsa **sessizce PNG** döner (bu makinedeki
   Chromium'da `image/avif`, `image/heic`, `image/bmp` istekleri `image/png` döndü). PNG fotoğrafta JPEG'in kat kat
   büyüğüdür. WebP kodlamayı her tarayıcı desteklemez; JPEG her yerde çalışır.
5. `bitmap.close()`, nesne adreslerini `URL.revokeObjectURL` ile bırakın.

Ağır iş: çok fotoğraf ya da büyük oran varsa küçültmeyi bir Worker'da `OffscreenCanvas` ile yapın; ana iş
parçacığı boşta kalır, dokunuşlar takılmaz ([Web performansı](web-performansi.md)). Büyük oranda (4000 → 400)
tek adımda küçültmek bulanık ya da tırtıklı sonuç verebilir; `imageSmoothingQuality = 'high'` ya da iki adımda
yarıya indirme deneyin.

```js calistir
import assert from 'node:assert/strict'

// Hedef boyut: uzun kenar en çok maxSide; küçük fotoğraf büyütülmez; en-boy oranı korunur.
function fitWithin(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
const decodedMB = (w, h) => (w * h * 4) / 1024 / 1024 // çözülmüş görüntü: piksel başına 4 bayt

assert.deepEqual(fitWithin(4032, 3024, 1600), { width: 1600, height: 1200 }) // 12 MP telefon fotoğrafı
assert.deepEqual(fitWithin(3024, 4032, 1600), { width: 1200, height: 1600 }) // dikey
assert.deepEqual(fitWithin(640, 480, 1600), { width: 640, height: 480 }) // küçüğü büyütmez
assert.deepEqual(fitWithin(10000, 10, 1600), { width: 1600, height: 2 }) // uç oran: kenar sıfıra inmez
assert.equal(Math.round(decodedMB(4032, 3024)), 47) // dosya 3 MB olsa da bellekte ~47 MB
assert.equal(Math.round(decodedMB(1600, 1200)), 7)

// Base64 metin olarak saklamak boyutu üçte bir büyütür; Blob olarak saklayın.
const base64Length = (bytes) => 4 * Math.ceil(bytes / 3)
assert.equal(base64Length(3_000_000), 4_000_000)

// toBlob desteklemediği türde SESSİZCE PNG döner (Chromium'da AVIF, HEIC, BMP denendi).
function checkEncoded(requested, blobType) {
  if (blobType === requested) return 'tamam'
  return blobType === 'image/png' ? "PNG'ye düştü: JPEG ile yeniden kodla" : 'beklenmeyen tür'
}
assert.equal(checkEncoded('image/webp', 'image/webp'), 'tamam')
assert.equal(checkEncoded('image/avif', 'image/png'), "PNG'ye düştü: JPEG ile yeniden kodla")
console.log('tamam')
```

## Yön (EXIF Orientation)

| Değer | Anlamı                        | Ne zaman görülür                     |
| ----- | ----------------------------- | ------------------------------------ |
| 1     | Döndürme yok                  | Yatay çekim, ekran görüntüsü         |
| 6     | 90° saat yönünde döndürülmeli | Telefon dik tutularak çekilmiş       |
| 3     | 180°                          | Telefon ters tutulmuş                |
| 8     | 90° saat yönünün tersine      | Dik, öteki yöne                      |
| 2,4,5,7 | Aynalanmış biçimler         | Bazı ön kameralar                    |

Bu makinedeki Chromium'da yönü 6 olan 40×20'lik JPEG `<img>`'de de `createImageBitmap`'te de 20×40 açıldı;
`imageOrientation: 'none'` seçeneği bile sonucu değiştirmedi (belirtim değişti). İki sonuç:

- **Eski kod iki kez döndürür.** EXIF'i bir kitaplıkla okuyup tuvali kendisi döndüren eski kod, tarayıcı zaten
  döndürdüğü için fotoğrafı yan yatırır. Böyle kod görürseniz silin; sonucu gerçek bir dik fotoğrafla sınayın.
- **Sunucu tarafında yön yoktur.** Sunucuda yeniden kodlarken yönü uygulamak sizin işinizdir (Pillow'da
  `ImageOps.exif_transpose`; [Dosya ve medya](../30-arkauc/dosya-ve-medya.md)).

Yönü baytlardan okumak (sunucuda ya da teşhiste):

```js calistir
import assert from 'node:assert/strict'

// JPEG içindeki EXIF yön etiketini (0x0112) okur; yoksa 1 (döndürme yok).
function exifOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(0) !== 0xffd8) throw new Error('JPEG değil')
  let offset = 2
  while (offset + 4 <= view.byteLength && view.getUint8(offset) === 0xff) {
    const marker = view.getUint8(offset + 1)
    if (marker === 0xda) break // görüntü verisi başladı: üst veri bitti
    const length = view.getUint16(offset + 2)
    const isExif = marker === 0xe1 && String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'Exif'
    if (isExif) {
      const tiff = offset + 10
      const little = view.getUint16(tiff) === 0x4949 // "II" küçük sonlu, "MM" büyük sonlu
      const ifd = tiff + view.getUint32(tiff + 4, little)
      for (let i = 0; i < view.getUint16(ifd, little); i++) {
        const entry = ifd + 2 + i * 12
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little)
      }
    }
    offset += 2 + length
  }
  return 1
}

// Sınama verisi: yalnız baş kısmı olan JPEG (SOI + EXIF + SOS)
function fakeJpeg(orientation, little = true) {
  const t = Buffer.alloc(26)
  const u16 = (v, at) => (little ? t.writeUInt16LE(v, at) : t.writeUInt16BE(v, at))
  const u32 = (v, at) => (little ? t.writeUInt32LE(v, at) : t.writeUInt32BE(v, at))
  t.write(little ? 'II' : 'MM', 0)
  u16(42, 2), u32(8, 4), u16(1, 8), u16(0x0112, 10), u16(3, 12), u32(1, 14), u16(orientation, 18)
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t])
  const app1 = Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff])
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), app1, payload, Buffer.from([0xff, 0xda, 0, 2])]))
}

assert.equal(exifOrientation(fakeJpeg(6)), 6) // dikey telefon fotoğrafı: 90° saat yönünde göster
assert.equal(exifOrientation(fakeJpeg(3, false)), 3) // büyük sonlu (MM) de okunur
assert.equal(exifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), 1) // EXIF yok
const swapsSides = (o) => o >= 5 // 5–8: genişlik ile yükseklik yer değiştirir
assert.equal(swapsSides(6), true)
console.log('tamam')
```

## HEIC ve tür tanıma

- iPhone fotoğrafları varsayılan olarak HEIC biçimindedir. Safari dışındaki tarayıcıların çoğu HEIC çözemez;
  çözemeyen tarayıcıda `createImageBitmap` `InvalidStateError` ile reddeder (bu makinedeki Chromium'da çözülemeyen
  veriyle denendi).
- iOS'un dosya seçicisi HEIC'i yüklemeden önce JPEG'e çevirebilir; bu `accept` değerine ve iOS sürümüne bağlıdır
  (doğrulanmadı). Varsaymayın: gelen dosyanın türünü **ilk baytlarından** anlayın; `file.type` boş ya da yanlış
  olabilir, ad "IMG_0001.JPG" olsa bile içerik HEIC olabilir.
- Çözülemeyen biçimde suçlamayan bir metin gösterin: "Bu fotoğraf biçimi açılamadı. Telefonun paylaş menüsünden
  JPEG olarak gönderin ya da fotoğrafın ekran görüntüsünü ekleyin."

```python calistir
def sniff(head: bytes) -> str:
    """Dosyanın türünü ilk baytlarından bulur; uzantıya ve file.type'a güvenmez."""
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if head[4:8] == b"ftyp":  # ISO taban medya biçimi: marka 8–12. baytlarda
        brand = head[8:12]
        if brand in (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"):
            return "heic"
        if brand in (b"avif", b"avis"):
            return "avif"
    return "bilinmiyor"


iphone = b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic"
assert sniff(iphone) == "heic"  # adı "IMG_0001.JPG" olsa bile
assert sniff(b"\xff\xd8\xff\xe1\x00\x10Exif") == "jpeg"
assert sniff(b"RIFF\x24\x00\x00\x00WEBPVP8 ") == "webp"
assert sniff(b"\x00\x00\x00\x1cftypavif") == "avif"
assert sniff(b"<svg xmlns=") == "bilinmiyor"  # SVG görüntü değil, betik taşıyabilen belgedir
print("tamam")
```

## Üst veri temizliği

- Yeniden kodlanmış Blob'da EXIF (konum, cihaz, çekim zamanı) yoktur; **özgün `File` nesnesinde vardır.** Özgün
  dosyayı "yedek olsun" diye IndexedDB'ye koymayın, sunucuya yanlışlıkla göndermeyin.
- Dosya adı da kişisel bilgi taşıyabilir ("ayse-hastane-raporu.jpg"); sakladığınız ada rastgele kimlik verin.
- Renk profili de yeniden kodlamada düşebilir; geniş renk gamlı fotoğrafta renkler hafifçe solabilir
  (doğrulanmadı; önemliyse gerçek fotoğrafla karşılaştırın).
- İstemci atlanabilir: sunucu her yüklemede kendisi yeniden kodlar ve EXIF'i atar
  ([Dosya ve medya](../30-arkauc/dosya-ve-medya.md),
  [Dosya yükleme güvenliği](../50-guvenlik/dosya-yukleme-guvenligi.md)).

## Yüklemeden önce sıkıştırma

İstemcide sıkıştırmak telefonun veri paketini ve sunucunun işlemcisini korur. Bütçeye sığdırmak için önce kaliteyi,
sonra boyutu düşürün; adım sayısı sınırlı olsun, sığmazsa en küçük sonucu kullanın:

```js calistir
import assert from 'node:assert/strict'

// Yükleme bütçesine sığdırma: önce kaliteyi, sonra boyutu düşür; sınırlı adım, en küçük denemeyi döndür.
const STEPS = [
  { maxSide: 1600, quality: 0.85 },
  { maxSide: 1600, quality: 0.72 },
  { maxSide: 1280, quality: 0.72 },
  { maxSide: 1024, quality: 0.65 },
]
async function compressToBudget(encode, budgetBytes) {
  let best = null
  for (const step of STEPS) {
    const blob = await encode(step)
    if (!best || blob.size < best.blob.size) best = { blob, step }
    if (blob.size <= budgetBytes) return { ...best, fits: true }
  }
  return { ...best, fits: false } // sığmadı: en küçüğünü kullan ya da kullanıcıya söyle; döngüye girme
}

// Sahte kodlayıcı: boyut ≈ piksel × kalite × katsayı (gerçekte canvas.toBlob ya da convertToBlob)
const fakeEncode = (bytesPerPixel) => async ({ maxSide, quality }) => ({
  size: Math.round(maxSide * maxSide * 0.75 * quality * bytesPerPixel),
})

const normal = await compressToBudget(fakeEncode(0.3), 450_000)
assert.equal(normal.fits, true)
assert.deepEqual(normal.step, { maxSide: 1600, quality: 0.72 }) // boyut korunup kalite düştü
const noisy = await compressToBudget(fakeEncode(2), 100_000) // gürültülü gece fotoğrafı sığmaz
assert.equal(noisy.fits, false)
assert.equal(noisy.step.maxSide, 1024)
console.log('tamam')
```

Yükleme sırasında ilerleme göstermek gerekiyorsa `XMLHttpRequest`'in `upload.onprogress` olayı en yaygın
desteklenen yoldur. Büyük ya da kesintiye açık yüklemede parçalı/sürdürülebilir yükleme gerekir
([Dosya ve medya](../30-arkauc/dosya-ve-medya.md)).

## Bellek tuzakları

| Ne yapılıyor                                         | Ne olur                                                     | Doğrusu                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| 20 fotoğraf `Promise.all` ile aynı anda küçültülüyor | Her biri ~47 MB çözülür; telefon sekmeyi öldürür            | Sırayla (ya da en çok 2 eşzamanlı)                         |
| Tuval özgün boyutta kuruluyor                        | iOS'ta tuval alanı/bellek sınırı aşılınca çizim boş çıkar (sınırlar doğrulanmadı) | Çözerken küçültün; tuval hedef boyutta   |
| Önizleme için `URL.createObjectURL`, hiç bırakılmıyor | Her önizleme belleği tutar                                  | Bileşen kalkınca `revokeObjectURL`                         |
| Fotoğraf base64 metin olarak durumda/IndexedDB'de     | +%33 boyut, her render'da büyük metin kopyası               | Blob saklayın; gösterirken nesne adresi                     |
| Izgarada 50 özgün fotoğraf `<img>` ile               | Her biri tam boy çözülür                                    | Küçük resim (thumbnail) saklayın; `loading="lazy"`         |
| Küçültme ana iş parçacığında                         | Ekran saniyelerce donar                                     | Worker + `OffscreenCanvas`                                 |
| Tuval işi bitince bırakılmıyor                       | Bazı tarayıcılarda tuval belleği geç geri alınır            | `canvas.width = canvas.height = 0`, `bitmap.close()`       |

## Canlı kamera (getUserMedia) kısaca

- Kısıtlarda `ideal` kullanın (`facingMode: { ideal: 'environment' }`); `exact` istenen kamera yoksa
  `OverconstrainedError` verir.
- iOS'ta `<video>` öğesine `playsinline` ve `muted` verin; yoksa vizör tam ekran oynatıcıya geçebilir.
- Kare almak: `video.videoWidth/Height` boyutunda tuvale `drawImage(video, …)`, sonra yukarıdaki küçültme.
- Sayfadan çıkınca, sekme gizlenince ve bileşen kalkınca **izleri durdurun**; yoksa kamera ışığı yanık kalır.
- İzin reddi ve aygıt hataları: [Tarayıcı API'leri](tarayici-apileri.md).

## Tuzaklar

| Belirti                                                     | Neden                                                    | Çözüm                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Dik çekilen fotoğraflar yan duruyor                         | Eski kod EXIF'e göre bir kez daha döndürüyor             | Elle döndürmeyi silin; tarayıcı zaten uyguluyor            |
| Sunucuda küçültülen fotoğraflar yan                          | Sunucuda yön uygulanmadan EXIF atıldı                    | Önce yönü uygula, sonra yeniden kodla, sonra EXIF at       |
| "Küçültülmüş" dosya özgünden büyük                          | `toBlob` istenen türü kodlayamadı, PNG döndü             | `blob.type` denetimi; JPEG'e düşün                         |
| iPhone fotoğrafı eklenmiyor, hata yok                        | HEIC çözülemedi, ret yakalanmadı                         | İlk baytlardan tür; anlaşılır metin; sunucuda dönüştürme   |
| Birden çok fotoğraf seçince sekme yenileniyor               | Aynı anda çözme, bellek doldu                            | Sırayla işleme, küçük resim                                |
| Galerideki aile fotoğrafı seçilemiyor                       | `capture` özniteliği galeriyi kapattı                    | `capture`'ı kaldırın                                       |
| Paylaşılan fotoğrafta evin konumu görünüyor                 | Özgün dosya yüklendi                                     | Yeniden kodlanmış Blob'u yükleyin; sunucuda da temizleyin  |
| Kamera ışığı uygulamadan çıkınca yanık                      | İzler durdurulmadı                                       | `track.stop()` (kalkış, gizlenme, bitiş)                   |
| Fotoğraf eklerken ekran donuyor                             | Küçültme ana iş parçacığında                             | Worker + `OffscreenCanvas`                                 |

## Denetim listesi

- [ ] Galeriyi isteyen yerde `capture` yok; doğrudan kamera gereken yerde var.
- [ ] Fotoğraf saklanmadan ve yüklenmeden önce küçültülüyor; özgün `File` saklanmıyor.
- [ ] Kodlama sonrası `blob.type` denetleniyor; PNG'ye düşme yakalanıyor.
- [ ] Gerçek bir dik telefon fotoğrafıyla denendi: önizlemede, saklanan dosyada ve sunucuda doğru yönde.
- [ ] Saklanan/yüklenen dosyada EXIF yok (testle denetleniyor); dosya adı rastgele.
- [ ] HEIC ve çözülemeyen dosya için suçlamayan bir ileti var.
- [ ] Birden çok fotoğraf sırayla işleniyor; nesne adresleri ve bitmap'ler bırakılıyor.
- [ ] Küçültme ana iş parçacığını uzun süre tutmuyor (Worker ya da ölçülmüş süre).
- [ ] Canlı kamera kullanılıyorsa izler her çıkış yolunda durduruluyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Fotoğrafı `createImageBitmap` ile çöz, uzun kenarı 1600 px'e küçült, JPEG 0,8 ile yeniden kodla,
  dönen `blob.type`'ı denetle. EXIF'i elle okuyup döndürme; tarayıcı yönü zaten uyguluyor. Özgün dosyayı saklama.
  Birden çok fotoğrafı sırayla işle."
- **Modelin tipik hatası:** EXIF kitaplığı ekleyip tuvali döndürür (iki kez döner); `toBlob(..., 'image/webp')`
  sonucunu denetlemez; fotoğrafı `FileReader.readAsDataURL` ile base64'e çevirip duruma koyar; `capture`'ı her
  yere ekler; `Promise.all` ile hepsini aynı anda işler.
- **Çıktıda arayın:** `readAsDataURL`, `exif` adlı içe aktarmalar ve `rotate(` çağrıları, `capture=` öznitelikleri,
  `toBlob` sonrası tür denetimi, `revokeObjectURL` ve `close()` çağrıları.
- **Test isteyin:** hedef boyut hesabı (dikey, yatay, küçük, uç oran) ve tür tanıma için birim testi; gerçek bir dik
  fotoğrafla uçtan uca deneme; saklanan dosyada EXIF bulunmadığını denetleyen test.

## İlgili

- [Tarayıcı API'leri](tarayici-apileri.md) — izin kalıbı, kamera hataları, güvenli bağlam
- [Web performansı](web-performansi.md) — görsel boyutu, `srcset`, uzun görevler
- [Ses ve konuşma](ses-ve-konusma.md) — aynı izin ve Blob saklama kuralları ses kaydı için
- [Dosya ve medya](../30-arkauc/dosya-ve-medya.md) — sunucuda yön, EXIF temizliği, imzalı adres
- [Dosya yükleme güvenliği](../50-guvenlik/dosya-yukleme-guvenligi.md) — piksel bombası, görüntü kitaplığı riskleri
- [KVKK pratiği](../50-guvenlik/kvkk-pratik.md) — fotoğraf ve konum kişisel veridir
