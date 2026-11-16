---
baslik: PWA'yı telefona kurdurma ve mağazaya çıkma
ozet: PWA'nın telefona kurulması, mağazaya çıkma yolları (TWA, Capacitor gibi sarmalayıcılar), imza anahtarı ve alan adı doğrulaması, bildirim ve çevrimdışı farkları, ne zaman yerel uygulama gerektiği.
etiketler: [pwa, mobil, magaza, twa, capacitor, bildirim]
duzey: orta
guncellik: 2026-11
---

# PWA'yı telefona kurdurma ve mağazaya çıkma

> Bu notu ne zaman okumalı: "uygulamamız mağazada olsun" isteği geldiğinde; kullanıcılara PWA'yı nasıl kurduracağınızı
> düşünürken; hatırlatma bildirimi gibi bir özellik planlarken; Play'deki uygulamada adres çubuğu görününce.

## Temel fikir

PWA, telefona **tarayıcıdan** kurulabilen bir web sitesidir: manifest + HTTPS + servis çalışanı. Mağazaya çıkmak
için aynı web uygulaması yerel bir kabuğa sarılır. Her kabuk ikinci bir yayın süreci getirir: mağaza incelemesi,
imza anahtarı, sürüm numarası, gizlilik beyanları, her güncellemede yeniden onay. Bu yüzden önce sorulacak soru
şudur: **mağaza neyi çözecek?** Keşfedilme ve güven mi, yoksa web'in veremediği bir telefon yeteneği mi?

Manifest alanları, servis çalışanı ve depolama kalıcılığı ayrı bir notta: [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md).
Bu not paketleme ve dağıtım kararıdır. Bu ortamda hiçbir mağaza aracı ve cihaz denenmedi; adımlar kavram düzeyindedir.

## Karar tablosu

| İhtiyaç                                                        | Yol                                              | Bedel                                                     |
| -------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Bağlantıyla dağıtmak, çevrimdışı çalışmak (Köprü)              | PWA yeter                                        | iOS'ta kurulum kullanıcıya elle anlatılır                 |
| Play Store'da görünmek, aynı web uygulaması                    | TWA (Trusted Web Activity)                       | Kendi alan adı + alan adı doğrulaması; yalnız Android     |
| App Store'da görünmek                                          | Capacitor gibi bir sarmalayıcı + gerçek yerel değer | Mac + Xcode; yalnız siteyi saran uygulama reddedilebilir |
| Zamanlanmış hatırlatma, güvenilir bildirim                     | Sarmalayıcı + yerel bildirim eklentisi, ya da sunucudan push | Push için sunucu gerekir                      |
| Arka planda konum, Bluetooth cihaz, NFC (iOS), sağlık verisi, widget | Yerel uygulama ya da sarmalayıcı eklentisi | Ayrı kod ve test                                          |
| Kurum içi dağıtım                                              | PWA ya da kurumun cihaz yönetimi                 |                                                           |

## Telefona kurdurmak

- **Android / Chromium:** tarayıcı `beforeinstallprompt` olayını verir; olayı saklayıp kendi "Uygulamayı yükle"
  düğmenizden açarsınız. Kullanıcı menüden de kurabilir.
- **iOS:** kurma düğmesi yoktur; yalnız Paylaş → "Ana Ekrana Ekle". Uygulama içinde bunu **resimli** adımlarla
  gösteren bir kart koyun (Köprü'nün "önce görsel" ilkesi burada da geçerli).
- Kurulu çalışıp çalışmadığını `matchMedia('(display-mode: standalone)')` ile anlayın; kurulduysa kartı gizleyin.
- iOS'ta Safari sekmesinin verisi ile ana ekrandaki uygulamanın verisi **ayrıdır**. Veri yerelde tutuluyorsa önce
  kurdurun, sonra kullandırın; ya da dışa aktar / içe aktar sunun.
- Önemli veri cihazdaysa (Köprü: kişisel fotoğraf, ses kaydı) depolama tarayıcı tarafından silinebilir; kalıcılık
  isteği ve düzenli dışa aktarma şarttır.

## Mağazaya çıkma yolları

| Yol                         | Nasıl çalışır                                                       | Güncelleme                    | Çevrimdışı                         | Platform        |
| --------------------------- | ------------------------------------------------------------------- | ----------------------------- | ---------------------------------- | --------------- |
| TWA                         | Tarayıcı (çoğu zaman Chrome) sitenizi tam ekran, adres çubuksuz açar | Web'e yayın = anında         | Servis çalışanına bağlı (PWA gibi) | Android         |
| Capacitor ve benzerleri     | Derlenmiş web dosyaları uygulamanın içine konur, sistem WebView'ında çalışır; eklentilerle yerel API | Mağaza sürümüyle | İlk açılıştan itibaren (dosyalar paketin içinde) | Android + iOS |
| Yerel (Kotlin/Swift) ya da çapraz platform çatısı | Ayrı uygulama                                  | Mağaza sürümüyle              | Tasarıma bağlı                     | Seçilen         |

### TWA'nın iki ince noktası

1. **Alan adı doğrulaması (Digital Asset Links):** sitenin **alan adı kökünde**
   `/.well-known/assetlinks.json` dosyası durur; içinde uygulamanın paket adı ve imza sertifikasının SHA-256 parmak
   izi vardır. Dosya bulunamaz ya da tutmazsa uygulama açılır ama üstte **adres çubuğu** görünür.
   `kullanici.github.io/depo/` gibi alt klasördeki bir site alan adının köküne dosya koyamaz: TWA için kendi alan
   adınız gerekir.
2. **İmza anahtarı:** Play mağazası uygulamayı çoğu zaman kendi tuttuğu anahtarla imzalar (Play App Signing); siz
   yalnız yükleme anahtarıyla gönderirsiniz. `assetlinks.json`'a **mağazanın imza sertifikasının** parmak izi yazılır
   (Play Console'da görünür); yalnız kendi yükleme anahtarınızınki yazılırsa yerel denemede çalışır, mağazadan
   indirilen sürümde adres çubuğu çıkar. İki parmak izini birlikte yazabilirsiniz.

Yükleme anahtarını ve parolasını parola yöneticisinde, ikinci bir kopyasıyla saklayın; depoya koymayın. Paketi
üreten araçlar (Bubblewrap, PWABuilder gibi) bu adımları yönlendirir; sürümleri ve ayrıntıları kendi belgelerinden
okuyun.

### Capacitor gibi sarmalayıcılar

- Web derlemesi (`dist`) yerel projelere kopyalanır, Android Studio ve Xcode ile derlenir. iOS derlemesi bir Mac
  ister (ya da bulutta derleme servisi).
- Göreli taban (`base: './'`) ve hash yönlendirme pakette sorunsuz çalışır; mutlak `/` yollar çoğu zaman kırılır
  ([Durağan site yayını](duragan-site-yayini.md)).
- Web'deki gibi anında güncelleme yoktur: her değişiklik mağaza incelemesinden geçer. Hata düzeltmesi günler sürebilir.
- Apple, yalnız bir web sitesini saran uygulamaları "asgari işlev" gerekçesiyle reddedebilir. Uygulamanın web'de
  olmayan bir değeri olmalıdır (yerel bildirim, dosya paylaşımı, cihaz özelliği).

## Bildirim farkları

| Yol                           | Sunucudan push                                  | Zamanlanmış yerel hatırlatma                     | Dikkat                                                |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| PWA, Android                  | Var (izinle)                                    | Güvenilir bir web API'si yok                     | Push için abonelikleri saklayan bir sunucu gerekir    |
| PWA, iOS                      | Yalnız ana ekrana kurulmuş uygulamada, izinle   | Yok                                              | İzin kullanıcı dokunuşuyla istenir                    |
| TWA                           | Web push (PWA gibi)                             | Yok                                              | Android sürümüne göre uygulama düzeyinde de izin gerekir |
| Capacitor gibi sarmalayıcı    | Eklentiyle (sistem push servisleri)             | Yerel bildirim eklentisiyle var                  | Hesaplar, anahtarlar, iki platform ayarı              |

Durağan barındırılan, sunucusuz bir PWA (Köprü) **kendi başına push gönderemez**. "Her sabah kelime pratiği
hatırlatması" gibi bir özellik ya bir push sunucusu ya da bir sarmalayıcıdaki yerel bildirim ister. Bildirim izni
ilk açılışta değil, kullanıcı değerini gördüğü anda istenir
([E-posta ve bildirim](../30-arkauc/e-posta-ve-bildirim.md) → bildirim yorgunluğu).

## Çevrimdışı farkları

| Yol            | İlk açılış                         | Uygulama dosyaları            | Kullanıcı verisi                                       |
| -------------- | ---------------------------------- | ----------------------------- | ------------------------------------------------------ |
| PWA / TWA      | İnternet gerekir (dosyalar inmeli) | Servis çalışanı önbelleği     | IndexedDB; tarayıcı yer daralınca silebilir            |
| Sarmalayıcı    | İnternetsiz açılır                 | Paketin içinde                | WebView depolaması; önemli veri için yerel depo eklentisi |

## Ne zaman yerel uygulama gerekir

Yalnız şu yeteneklerden biri ürünün **çekirdeğiyse**: arka planda konum ya da coğrafi çit; Bluetooth cihazlarla
konuşma (iOS'ta web'den yok); iOS'ta NFC; sağlık verisi okuma/yazma; ana ekran araçları (widget); uzun arka plan
işi; güvenilir alarm; mağaza içi dijital satın alma. Bunlar yoksa sarmalayıcı ya da PWA yeter; yeniden yazmak
bakım yükünü ikiye katlar.

## Mağaza süreci kavramları

- Geliştirici hesapları ücretlidir (tutarlar ve koşullar değişir; mağazanın güncel sayfasına bakın).
- Her yayında artan bir sürüm kodu, gizlilik/veri beyanı formu, ekran görüntüleri ve inceleme vardır.
- Google Play'de yeni kişisel hesaplardan üretime çıkmadan önce test kullanıcılarıyla kapalı test istenebiliyor
  (sayı ve süre Kasım 2026'da doğrulanmadı).
- Sağlık kategorisindeki uygulamalardan mağazalar ek beyan isteyebilir; uygulama "tedavi" vaadinde bulunmamalı
  (Köprü'nün 10. ilkesi).

## Paket ön denetimi

Mağaza paketine geçmeden önce manifest ve alan adı doğrulamasını denetleyin:

```python calistir
import re
from urllib.parse import urljoin, urlsplit

PARMAK_IZI = re.compile(r"^([0-9A-F]{2}:){31}[0-9A-F]{2}$")  # SHA-256, iki nokta ayraçlı, büyük harf


def paket_denetle(manifest_adresi: str, manifest: dict, assetlinks: list[dict] | None = None) -> list[str]:
    sorunlar = []
    simgeler = manifest.get("icons", [])
    if "512x512" not in {s.get("sizes") for s in simgeler}:
        sorunlar.append("512x512 simge yok: mağaza paketi ve açılış ekranı için gerekir")
    if not any("maskable" in s.get("purpose", "") for s in simgeler):
        sorunlar.append("maskeli simge yok: Android simgeyi küçültüp çerçeveler")
    if manifest.get("display") not in ("standalone", "fullscreen"):
        sorunlar.append(f"display {manifest.get('display')!r}: pakette adres çubuğu görünür")
    if "id" not in manifest:
        sorunlar.append("id yok: start_url değişirse cihaz onu başka bir uygulama sayar")
    baslangic = urljoin(manifest_adresi, manifest.get("start_url", "."))
    kapsam = urljoin(manifest_adresi, manifest.get("scope", "."))
    if not baslangic.startswith(kapsam):
        sorunlar.append(f"start_url kapsam dışında: {urlsplit(baslangic).path} ⊄ {urlsplit(kapsam).path}")
    kok = urljoin(manifest_adresi, "/.well-known/assetlinks.json")
    if urlsplit(kapsam).path != "/":
        sorunlar.append(f"TWA: {kok} alan adının kökünde olmalı; alt klasördeki site oraya dosya koyamaz")
    for kayit in assetlinks or []:
        for iz in kayit.get("target", {}).get("sha256_cert_fingerprints", []):
            if not PARMAK_IZI.match(iz):
                sorunlar.append("assetlinks parmak izi biçimi yanlış (32 bayt, AA:BB:… büyük harf)")
    return sorunlar


# Köprü'nün manifest'i (vite.config.ts), GitHub Pages proje sitesinde
kopru = {
    "name": "Köprü — resimlerle konuş", "short_name": "Köprü", "start_url": "./", "scope": "./",
    "display": "standalone", "lang": "tr",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192"},
        {"src": "icons/icon-512.png", "sizes": "512x512"},
        {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "purpose": "maskable"},
    ],
}
print("Köprü:")
for sorun in paket_denetle("https://kullanici.github.io/kopru/manifest.webmanifest", kopru):
    print("-", sorun)

# Mutlak start_url alt klasörde kapsam dışına düşer
kirik = {**kopru, "start_url": "/"}
assert "start_url kapsam dışında: / ⊄ /kopru/" in paket_denetle("https://kullanici.github.io/kopru/m.json", kirik)
# Aynı manifest kendi alan adında, sabit id ve doğru assetlinks ile
iyi = {**kopru, "id": "/"}
dogru_iz = ":".join(["AB"] * 32)
assetlinks = [{"relation": ["delegate_permission/common.handle_all_urls"],
               "target": {"namespace": "android_app", "package_name": "com.ornek.kopru",
                          "sha256_cert_fingerprints": [dogru_iz]}}]
assert paket_denetle("https://kopru.ornek.com/manifest.webmanifest", iyi, assetlinks) == []
yanlis = [{"target": {"sha256_cert_fingerprints": [dogru_iz.lower().replace(":", "")]}}]
assert len(paket_denetle("https://kopru.ornek.com/manifest.webmanifest", iyi, yanlis)) == 1
```

```cikti
Köprü:
- id yok: start_url değişirse cihaz onu başka bir uygulama sayar
- TWA: https://kullanici.github.io/.well-known/assetlinks.json alan adının kökünde olmalı; alt klasördeki site oraya dosya koyamaz
```

Köprü için sonuç: bugünkü hâliyle (alt klasörde, sabit `id`'siz) TWA paketi çıkarılamaz; önce kendi alan adı ve
manifest'e sabit bir `id` gerekir. `id` sonradan eklenirse önceden kurmuş kullanıcıların uygulaması "başka bir
uygulama" sayılabilir: kararı ilk yayından önce verin.

## Tuzaklar

| Belirti                                                          | Neden                                                         | Çözüm                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Play'den indirilen TWA'da üstte adres çubuğu                     | `assetlinks.json` yok, yanlış yerde ya da mağaza imza parmak izi eksik | Alan adı kökünde dosya; Play Console'daki imza parmak izini ekleyin |
| TWA için `assetlinks.json` konulamıyor                           | Site `kullanici.github.io/depo/` alt klasöründe               | Kendi alan adı                                                     |
| iOS kullanıcısı "kur" düğmesi bulamıyor                          | iOS'ta kurulum yalnız Paylaş menüsünden                       | Resimli kurulum kartı                                              |
| iOS'ta kurunca girilen veriler yok                               | Safari sekmesi ile kurulu uygulamanın depolaması ayrı         | Önce kurdurun; dışa/içe aktarma                                    |
| Hatırlatma bildirimi hiç gelmiyor                                | Sunucusuz PWA push gönderemez; iOS'ta kurulmadan izin yok     | Push sunucusu ya da sarmalayıcıda yerel bildirim                   |
| App Store incelemesinde ret                                      | Uygulama yalnız siteyi sarıyor                                | Yerel değer ekleyin ya da PWA ile sürdürün                         |
| Mağaza sürümünde acil düzeltme günler sürdü                      | Sarmalayıcıda her değişiklik incelemeden geçer                | Web içeriğini uzaktan yükleyen yapıyı ya da TWA'yı değerlendirin; test sıkılığı |
| Uygulama güncellenemiyor                                         | İmza/yükleme anahtarı kayboldu                                | Anahtar parola yöneticisinde ve yedekte; mağazanın anahtar sıfırlama süreci |
| Pakette beyaz ekran                                              | Mutlak `/` yollar                                             | Göreli taban                                                       |
| Kullanıcının verileri bir gün kayboldu                           | Tarayıcı depolamayı temizledi                                 | Kalıcılık isteği, kurulum, düzenli dışa aktarma                    |

## Denetim listesi

- [ ] "Mağaza neyi çözecek" sorusunun yanıtı yazılı; PWA'nın yetmediği yer belli.
- [ ] Manifest'te sabit `id`, `standalone`, 512 ve maskeli simge; `start_url` kapsam içinde (ön denetim boş).
- [ ] iOS için resimli kurulum kartı var; kurulu çalışınca gizleniyor.
- [ ] Önemli yerel veri için dışa aktarma ve kalıcılık isteği var.
- [ ] TWA ise: kendi alan adı, kökte `assetlinks.json`, mağaza imza parmak izi dahil; mağazadan indirilen sürümde
      adres çubuğu yok.
- [ ] Sarmalayıcı ise: web'de olmayan yerel değer listelendi; iOS derleme ortamı (Mac) belli.
- [ ] Bildirim gerekiyorsa push sunucusu ya da yerel bildirim yolu seçildi; izin değerli anda isteniyor.
- [ ] İmza/yükleme anahtarı ve parolası iki ayrı güvenli yerde; depoda değil.
- [ ] Gizlilik ve veri beyanı, uygulamanın gerçekte topladığıyla aynı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Mağazaya çıkmadan önce şu tabloyu doldur: ihtiyaç, PWA ile olur mu, TWA ile olur mu,
  sarmalayıcı gerekir mi, neden. Araç sürümü ve mağaza ücreti yazma. Manifest'i ön denetimden geçir ve sonucu göster."
- **Modelin tipik hatası:** "mağazaya çıkalım" isteğine doğrudan yeniden yazım (React Native/Flutter) önermek; iOS'ta
  `beforeinstallprompt` kullanmak; sunucusuz PWA'da push önermek; `assetlinks.json`'a yalnız yükleme anahtarının
  parmak izini yazmak; imza anahtarını depoya koymak.
- **Çıktıda denetleyin:** `assetlinks.json` adresi alan adı kökünde mi; parmak izi biçimi; manifest'te `id`; iOS için
  kurulum yolu anlatılmış mı; bildirim planında hangi sunucunun push göndereceği yazıyor mu.

## İlgili

- [Mobil ve mağaza](../95-urun/mobil-ve-magaza.md) — ürün kararı, mağaza süreci, sürümleme ve zorunlu güncelleme
- [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md) — manifest, servis çalışanı, iOS farkları
- [Durağan site yayını](duragan-site-yayini.md) — alt klasör, göreli taban
- [Alan adı ve DNS](alan-adi-ve-dns.md) — TWA için kendi alan adı
- [E-posta ve bildirim](../30-arkauc/e-posta-ve-bildirim.md) — bildirim izni ve yorgunluk
- Çalışan karşılıklar: Köprü manifest'i [`vite.config.ts`](../../../vite.config.ts), uygulama temelinin PWA ayarı
  [`uygulama/web/vite.config.ts`](../../uygulama/web/vite.config.ts)
