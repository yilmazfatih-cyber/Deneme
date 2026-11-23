# Fiş — masada hesap bölüşme

Restoranda masaya tek fiş gelir. Hesabı toplayan kişi fişi girer, bağlantıyı masaya yollar; herkes kendi telefonunda
yediğini işaretleyip geri gönderir. Toplayıcının ekranı kimin gönderdiğini, hangi kalemin sahipsiz kaldığını ve kaç
liranın açıkta olduğunu söyler. Hesap, kurulum ve sunucu yok.

**Adres:** `https://<kullanıcı>.github.io/<depo>/fis/` (GitHub Pages iş akışı `fis/` klasörünü olduğu gibi yayınlar).

## Akış

**Toplayıcı**

1. **Yeni hesap:** kalemleri yazar ya da fiş fotoğrafından "Metni Kopyala" ile aldığı metni yapıştırır. İndirim varsa
   "Ödenecek tutar"a fişin son tutarını yazar; indirim herkese aynı oranda yansır.
2. **Masaya yolla:** QR'ı gösterir ya da "Paylaş" ile AirDrop / Mesajlar / WhatsApp'tan bağlantıyı yollar.
3. **Toplama:** gelen yanıt bağlantılarını aynı telefonda açar (AirDrop'la gelen bağlantı Safari'de açılır, kişi listeye
   eklenir). Mesajla gelenleri "Gelen bağlantıyı yapıştır" ile, telefonu olmayanları "Telefonu olmayan birini ekle" ile girer.
   "Eksikler" bölümü düz cümlelerle ne kaldığını söyler.
4. **Sonucu paylaş:** herkesin payını gösteren tek bağlantıyı masaya yollar.

**Misafir**

1. Bağlantıyı Safari'de açar, adını yazar, yediklerine dokunur (adetli kalemde − / +). Ortak yediklerini de işaretler;
   toplayıcıda işaretleyenler arasında bölünür.
2. "Gönder" der: paylaşım sayfasından toplayıcıya yollar ya da çıkan QR'ı toplayıcıya okutur.

## Bağlantı biçimi

Her şey adresin `#` kısmında taşınır; sunucuya hiçbir şey gitmez.

| Bağlantı                   | Ne açar                                                  |
| -------------------------- | -------------------------------------------------------- |
| `…/fis/`                   | Ana ekran (yeni hesap, bu telefondaki son hesaplar)      |
| `…/fis/#b=<FİŞ>`           | Misafir ekranı; toplayıcının telefonunda Toplama ekranı  |
| `…/fis/#b=<FİŞ>&r=<YANIT>` | Bir kişinin seçimi; toplayıcıda açılınca listeye eklenir |
| `…/fis/#b=<FİŞ>&s=<HEPSİ>` | Sonuç ekranı (salt okunur)                               |

Kodlama: sürümlü kompakt JSON dizisi → UTF-8 → deflate → base64url, başında `z` (sıkıştırma kazandırmıyorsa düz
base64url; çözücü ikisini de okur). Örnek fişin misafir bağlantısı böylece 861 yerine 514 karakter, QR'ı 101 yerine 77 modül. Yanıt bağlantısı fişi de taşır, hangi tarayıcıda açılırsa
açılsın çalışır. `&v=paylas`, `&v=sec`, `#v=yeni` yalnızca toplayıcının kendi ekranları arasında gezinmek içindir.

## iPhone notları

- **Ana ekrana ekleme önerilmez.** iOS'ta ana ekrana eklenen web uygulamasının deposu Safari'den ayrıdır ve AirDrop /
  Mesajlar'dan gelen bağlantılar her zaman Safari'de açılır. Toplayıcı Safari'de kalmalı ki yanıtlar aynı yerde birikir.
  Manifest bu yüzden `display: browser` kullanır.
- Yanıtlar toplayıcının telefonunda `localStorage`'da durur. Gizli sekmede uygulama çalışır ama sekme kapanınca unutur.
- Çok uzun fişlerde bağlantı QR koda sığmayabilir; o zaman "Paylaş" ya da "Bağlantıyı kopyala" kullanılır.
- Toplayıcı bağlantıyı başka bir cihazda açtıysa misafir ekranının altındaki "Bu hesabı ben topluyorum" ile geçer.

## Geliştirme

Derleme yok. Klasörü herhangi bir statik sunucuyla açın (ES modülleri `file://` ile çalışmaz):

```bash
npx serve fis
```

Hesap mantığı `fis.mjs` dosyasında saf fonksiyonlardır; testleri:

```bash
node --test fis/fis.test.mjs
```

Bağlantıdan ve `localStorage`'dan okunan her şey `normalizeBill` / `normalizeResp` ile doğrulanır; ekrana yalnızca
`textContent` ile yazılır.

Depo anahtarları: `fis.bill.<id>` (fiş), `fis.resps.<id>` (yanıtlar), `fis.host.<id>` (bu telefon toplayıcı),
`fis.recent` (son hesaplar), `fis.pick.<id>` (misafirin seçimi), `fis.name` (son yazılan ad), `fis.me.<id>` (sonuç
ekranında seçilen ad), `fis.draft` (yarım kalan fiş girişi).

Dosyalar: `index.html` (kabuk ve stil) · `app.mjs` (ekranlar, depolama, paylaşım) · `fis.mjs` (kodlama, pay hesabı, fiş
metni çözümleme) · `ornek.mjs` (örnek fiş) · `fis.test.mjs` · `sw.js` (çevrimdışı) · `manifest.webmanifest` · `icon.svg`, `icon-180.png` (iOS ana ekran simgesi) ·
`vendor/qrcode.mjs` (QR üretici) ve `vendor/fflate.mjs` (bağlantı sıkıştırma); ikisi de MIT, bkz. `vendor/LICENSE.md`.
