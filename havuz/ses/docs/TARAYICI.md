# Tarayıcıda Türkçe ses ve PWA yedek hattı

## Denetim sayfası

```bash
.venv/bin/python -m ses sun          # ya da modelsiz: ... sun --sahte
# tarayıcıda: http://127.0.0.1:8460/tarayici
```

Sayfa (`ses/web/tarayici.html`) şunları gösterir: tarayıcıda Web Speech API var mı; cihazdaki Türkçe sesler
(adı, dili, **çevrimdışı çalışıp çalışmadığı** — `localService`); üç düğme: cihaz sesiyle, sunucuyla ve
otomatik (yedekli) okuma. Metinler `ses/web/sozluk.json`'dadır.

Telefonda denemek için sunucu telefona açılmalı: `SES_SUNUCU_ANAHTARI` verip `--adres 0.0.0.0` ile başlatın;
anahtarsız kipte sunucu yalnız `127.0.0.1` adıyla açılır (güvenlik, docs/KARARLAR.md K-11). Bu durumda sayfanın
"sunucuyla oku" düğmesi anahtar istemeyen yerel kurulum içindir; anahtarlı sunucu için `konus.js`'e
`anahtar` seçeneği verilir.

## Yedek hattı: `konus.js`

`ses/web/konus.js` bağımlılıksız tek bir ES modülüdür; PWA'nıza kopyalayın:

```js
import { konus } from './konus.js'

const nasil = await konus('Saat 14:30\'da ilacını aldın mı?', {
  sunucu: 'https://ses.ornek.example', // boş: aynı köken
  anahtar: null,                       // anahtarlı sunucuda Bearer anahtarı
  hiz: 0.9,                            // yaşlı/afazili dinleyici için biraz yavaş
})
// nasil: 'cihaz' | 'sunucu' | 'yok'  → 'yok' ise metni ekranda büyük göster
```

Sıra:
1. **Cihazın Türkçe sesi** (`speechSynthesis`): çevrimdışı çalışan (`localService: true`) ses önce seçilir.
   Ses listesi bazı tarayıcılarda geç dolar; `voiceschanged` olayı 1,5 sn beklenir.
2. **Ses sunucusu** (`POST /v1/audio/speech`, WAV): ağ ya da yerel ağdaki sunucu gerekir; 15 sn zaman aşımı.
3. **Yok**: ses çalınamadıysa hata göstermeyin; metin ekranda kalır (Köprü ilkesi: başarısızlık hissettirmez).

## Bilinmesi gerekenler (DENENMEDİ — bu ortamda gerçek telefon/tarayıcı sesi yok)

- Hangi cihazda Türkçe ses olduğu üreticiye bağlıdır; bilinenler genel bilgidir, burada sınanmadı:
  Android'de "Google Konuşma Hizmetleri" Türkçe ses paketi indirilmişse çevrimdışı çalışır; iOS/macOS'ta Türkçe
  ses (sistem ayarlarından indirilir) bulunur; masaüstü Chrome'un "Google Türkçe" sesi ağ ister.
- Web Speech API'nin sesi kaydedilemez (dosyaya yazılamaz); hazır ses dosyası gerekiyorsa sunucu ya da
  `python -m ses seslendir` kullanılır.
- Tarayıcılar ses çalmayı bir kullanıcı dokunuşuna bağlar: `konus` bir düğme tıklamasının içinde çağrılmalıdır.
- Çevrimdışı PWA'da sunucu yedeği çalışmaz; çevrimdışı garanti isteniyorsa sık kullanılan cümleleri önceden
  seslendirip PWA önbelleğine koyun (Köprü'nün `public/audio` yaklaşımı) — lisans: docs/LISANSLAR.md.
