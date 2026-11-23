---
baslik: Mobil uygulama güvenliği: pakete gömülü sır, güvenli depo, derin bağlantı ve mağaza
ozet: Paketteki her şeyin herkese açık olduğu, belirteci Keychain/Keystore'da saklama, derin bağlantı ve uygulama bağlantısı, sertifika sabitleme ödünleşimi, ekran önizlemesi, kök algılamanın sınırları ve mağaza incelemesi.
etiketler: [mobil, guvenlik, expo, derin-baglanti, depolama, magaza]
duzey: orta
guncellik: 2026-11
---

# Mobil uygulama güvenliği: pakete gömülü sır, güvenli depo, derin bağlantı ve mağaza

> Bu notu ne zaman okumalı: Expo/React Native ya da sarmalanmış bir web uygulaması telefona çıkarken; bir API
> anahtarını uygulamaya koymak üzereyken; giriş belirtecini nerede saklayacağınıza karar verirken; derin bağlantı
> (`havuzmobil://…`) eklerken; mağaza incelemesine hazırlanırken.

## Temel fikir

- Telefona giden paket (APK/AAB/IPA) **kullanıcının elindedir**: açılır, okunur, değiştirilir, sahte bir sunucuya
  bağlanır. İçindeki her dize — API anahtarı, "gizli" uç adresi, `EXPO_PUBLIC_` değişkenleri, yapılandırmanın
  `extra` alanı — herkese açıktır. JavaScript paketi bayt koduna (Hermes) çevrilse de dizeler okunur. **Güven sınırı
  telefonda değil sunucudadır.**
- Telefonda iki tür depo vardır: düz depo (AsyncStorage, SQLite, dosyalar; kök erişimiyle ve bazen yedekle okunur)
  ve güvenli depo (iOS Keychain, Android Keystore destekli şifreli depo; Expo'da `expo-secure-store`). Belirteç ve
  şifreleme anahtarı güvenli depoya; veri düz depoya.
- Uygulamaya dışarıdan giren her şey güvenilmez girdidir: derin bağlantı, bildirim yükü, paylaşım menüsünden gelen
  dosya, panodaki metin.
- Telefonda yapılan savunmalar (kök/jailbreak algılama, sertifika sabitleme, karartma) atlatılabilir; ek katmandır,
  asıl denetim değildir.

## Karar tablosu

| Durum                                                         | Seçim                                                                  | Neden                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| Üçüncü tarafın gizli anahtarı (ödeme, e-posta, dil modeli)    | Sunucuda; uygulama kendi API'nizi çağırır                              | Paket açılır, anahtar dakikalar içinde çıkar        |
| "Açık" istemci anahtarı (harita, analitik, bildirim servisi)  | Pakette olabilir; paket adı/imza ve kota ile **kısıtlayın**, verileri sunucu kurallarıyla koruyun | Gizli değildir; kötüye kullanımı sınırlanır |
| Oturum ya da yenileme belirteci                               | Güvenli depo, "bu cihaza özel" erişilebilirlikle                       | Yedekle başka cihaza taşınmaz                       |
| Kullanıcı verisi (görev, not, sağlık kaydı)                   | Yerel veritabanı; hassassa anahtarı güvenli depoda tutulan şifreleme   | Güvenli depo küçük değerler içindir                 |
| "Google ile giriş" gibi dış giriş                             | Sistem tarayıcısı + PKCE; dönüş uygulama bağlantısı ya da özel şemayla | Gömülü web görünümünde parola sorulmaz              |
| Derin bağlantıyla hassas işlem (hesap silme, ödeme onayı)     | Bağlantı yalnız ekranı açar; işlem uygulamada onayla yapılır           | Bağlantıyı herkes üretip gönderebilir               |
| Sertifika sabitleme                                           | Çoğu ürün için **hayır**; gerekiyorsa açık anahtar sabitleme + yedek anahtar + uzaktan kapatma | Anahtar değişince eski sürümler ağsız kalır |
| Hassas ekran (sağlık, para)                                   | Uygulama değiştiricide önizlemeyi gizle; Android'de ekran görüntüsünü engelle | Önizleme ve ekran kaydı sızar              |

## Pakete gömülü sır yanılgısı

- Expo'da `EXPO_PUBLIC_` önekli değişkenler derlemede pakete yazılır; uygulama yapılandırmasının `extra` alanı da
  uygulamayla gider. Bunlara yalnız herkesin görebileceği değerleri koyun (API adresi, ortam adı). Önek listesi ve
  derleme çıktısını tarayan denetim: [Sır yönetimi](sir-yonetimi.md).
- "Açık" anahtar türleri (harita, bildirim, analitik istemci anahtarları) gizli değildir ama başıboş da
  bırakılmaz: sağlayıcı panelinde Android paket adı + imza parmak izi, iOS paket kimliği ve kota sınırı verin.
  Veritabanı/depolama hizmetlerinde koruma anahtarın gizliliğinden değil **sunucu tarafı kurallardan** gelir.
- Sunucu, isteğin "bizim uygulamamızdan" geldiğine başlığa bakarak (`X-App-Version`, `User-Agent`) güvenmez; bu
  değerler uydurulur. Uygulama kanıtlama hizmetleri (Android Play Integrity, iOS App Attest) bir sinyal verir; sunucu
  tarafında doğrulanır ve yine tek başına yetki kararı değildir (kurulumu kurulu SDK belgesinden doğrulayın).

## Güvenli depo

| Erişilebilirlik (`expo-secure-store` sabiti)      | Ne zaman okunur                          | Yedekle başka cihaza geçer mi | Ne için                                  |
| ------------------------------------------------- | ---------------------------------------- | ----------------------------- | ---------------------------------------- |
| `WHEN_UNLOCKED_THIS_DEVICE_ONLY`                  | Yalnız telefon kilidi açıkken            | Hayır                         | Oturum belirteci (arka plan işi yoksa)   |
| `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`             | Açılıştan sonraki ilk kilit açmadan sonra | Hayır                        | Kilitliyken çalışan arka plan eşitlemesi |
| `WHEN_UNLOCKED` / `AFTER_FIRST_UNLOCK`            | Yukarıdakiler gibi                       | Evet                          | Yeni telefona taşınması istenen değer    |
| `ALWAYS…`                                         | Her zaman                                | —                             | Kullanmayın (kurulu sürümde kullanımdan kalkmış) |

Tablo kurulu `expo-secure-store` 58.0.3'ün tip tanımlarından okundu. Havuzdaki mobil temel oturum belirtecini
`WHEN_UNLOCKED_THIS_DEVICE_ONLY` ile saklar: [`tokenStorage.ts`](../../mobil/src/lib/session/tokenStorage.ts).
Ödünleşim: bu kipte telefon kilitliyken çalışan bir arka plan işi belirteci **okuyamaz**; arka planda eşitleme
istiyorsanız `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` seçin.

- Güvenli depo küçük değerler içindir; büyük veriyi orada tutmayın. Büyük ve hassas veri için rastgele bir anahtar
  üretip güvenli depoya koyun, veriyi o anahtarla şifreleyip düz depoya yazın
  ([Kriptografi kullanımı](kriptografi-kullanimi.md)).
- Android'in otomatik yedeği uygulama verisini (veritabanı, ayar dosyaları) kullanıcının bulut yedeğine kopyalayabilir;
  Expo yapılandırmasında `android.allowBackup` varsayılan olarak açıktır (kurulu yapılandırma tiplerinde doğrulandı).
  Hassas veri tutan uygulamada kapatın ya da hassas dosyaları yedek dışında bırakın.
- "Parmak iziyle giriş" ancak sır işletim sistemi tarafından biyometrik doğrulamaya bağlanırsa anlamlıdır
  (`requireAuthentication: true`). JavaScript'te "biyometri geçti" diye bir değişken tutmak kök erişimli cihazda
  atlatılır. Biyometri istemi iptal, kilitlenme ve kayıtlı parmak izi olmaması yüzünden başarısız olabilir; her zaman
  parola ile giriş yolu kalsın.
- Web derlemesinde güvenli depo yoktur; havuzdaki temel orada `localStorage`'a düşer ve bunu yalnız deneme için
  kullanır ([Oturum güvenliği](oturum-guvenligi.md)).

## Derin bağlantı ve uygulama bağlantısı

İki tür vardır: **özel şema** (`havuzmobil://gorev/…`) ve **uygulama bağlantısı** (Android App Links, iOS Universal
Links: `https://uygulama.ornek.com/gorev/…`). Özel şemayı başka bir uygulama da kaydedebilir; hangi uygulamanın
açılacağı garanti değildir. Uygulama bağlantısı alan adınızdaki doğrulama dosyasıyla (`assetlinks.json`,
`apple-app-site-association`) uygulamaya bağlanır ([PWA'yı telefona kurdurma](../60-devops/mobil-paketleme.md)).

Kurallar: bağlantı yalnız **bilinen bir ekranı açar**; işlem yapmaz; belirteç, kod, parola taşımaz; parametreleri
biçim denetiminden geçer.

```js calistir
import assert from 'node:assert/strict'

// Derin bağlantı dışarıdan gelen GÜVENİLMEZ girdidir: yalnız bilinen ekranı aç, işlem yapma, gizli değer kabul etme.
const ROUTES = [
  { pattern: /^\/gorev\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/, screen: 'gorev' },
  { pattern: /^\/listeler$/, screen: 'listeler' },
]
const SCHEME = 'havuzmobil:'
const APP_LINK_HOSTS = new Set(['uygulama.ornek.com']) // doğrulanmış uygulama bağlantısı (App Links / Universal Links)
const SECRET_PARAMS = ['token', 'access_token', 'refresh_token', 'code', 'sifre', 'password']
const HOME = { screen: 'ana-sayfa' }

function routeFor(link) {
  let url
  try {
    url = new URL(link)
  } catch {
    return { ...HOME, reason: 'ayrıştırılamadı' }
  }
  const custom = url.protocol === SCHEME
  if (!custom && !(url.protocol === 'https:' && APP_LINK_HOSTS.has(url.hostname))) {
    return { ...HOME, reason: 'yabancı kaynak' }
  }
  if (SECRET_PARAMS.some((name) => url.searchParams.has(name))) return { ...HOME, reason: 'gizli değer taşıyor' }
  const path = custom ? `/${url.hostname}${url.pathname}` : url.pathname // havuzmobil://gorev/… → host "gorev"
  for (const { pattern, screen } of ROUTES) {
    const match = path.match(pattern)
    if (match) return { screen, id: match[1] }
  }
  return { ...HOME, reason: 'bilinmeyen yol' }
}

const id = '3f2b8c1e-9d4a-4c7b-8e21-5a6f0b9c2d13'
assert.deepEqual(routeFor(`havuzmobil://gorev/${id}`), { screen: 'gorev', id })
assert.deepEqual(routeFor(`https://uygulama.ornek.com/gorev/${id}`), { screen: 'gorev', id })
assert.equal(routeFor(`https://kotu.example/gorev/${id}`).reason, 'yabancı kaynak')
assert.equal(routeFor('havuzmobil://hesap-sil?onay=evet').reason, 'bilinmeyen yol') // işlem bağlantıyla yapılmaz
assert.equal(routeFor('havuzmobil://listeler?token=abc').reason, 'gizli değer taşıyor')
assert.equal(routeFor(`havuzmobil://gorev/${id}/../../hesap-sil`).reason, 'bilinmeyen yol')
assert.equal(routeFor('havuzmobil://gorev/1 OR 1=1').reason, 'bilinmeyen yol') // kimlik biçimi denetlendi
console.log('tamam')
```

Ayrıştırmanın bir inceliği: özel şemalı `havuzmobil://gorev/abc` adresinde `gorev` **ana makine** (host) olarak
ayrıştırılır, yol `/abc` olur; büyük-küçük harf de korunur (`HAVUZMOBIL://Gorev/abc` → host `Gorev`). Yönlendirme
kitaplığı bunu sizin yerinize yapıyorsa bile parametreleri (`id`) ekranda yeniden doğrulayın: yönlendirici biçim
denetlemez. OAuth dönüşünde kod özel şemayla geliyorsa PKCE zorunludur; aynı şemayı kaydeden başka uygulama kodu
yakalasa da kullanamaz ([Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md)).

## Sertifika sabitleme

Sabitleme, uygulamanın yalnız belirli bir açık anahtara sahip sunucuya bağlanmasını sağlar: kullanıcının cihazına
kurulmuş sahte bir kök sertifikayla araya girmeyi zorlaştırır. Bedeli ağırdır: sunucu anahtarı **önceden
planlanmadan** değişirse güncellenmemiş her telefonda uygulama ağsız kalır.

```js calistir
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'

// Açık anahtar sabitleme: sertifikanın değil, içindeki açık anahtarın (SPKI) SHA-256 özeti sabitlenir.
const pinOf = (keys) =>
  createHash('sha256').update(keys.publicKey.export({ type: 'spki', format: 'der' })).digest('base64')
const newKeys = () => generateKeyPairSync('ec', { namedCurve: 'P-256' })

const current = newKeys()
const backup = newKeys() // ŞİMDİDEN üretilip güvenli yerde bekleyen yedek anahtar
const pinned = new Set([pinOf(current), pinOf(backup)]) // ikisi de uygulama paketinde
const accepts = (serverKeys) => pinned.has(pinOf(serverKeys))

assert.equal(pinOf(current).length, 44) // base64 SHA-256
assert.ok(accepts(current)) // sertifika yenilendi, anahtar aynı: sabit tutar
assert.ok(accepts(backup)) // anahtar değişti ama yedek pin pakette vardı: uygulama çalışır
assert.ok(!accepts(newKeys())) // barındırıcı anahtarı kendisi yeniledi: güncellenmemiş HER telefonda ağ kesilir
console.log('tamam')
```

| Sabitlersiniz, eğer                                       | Sabitlemezsiniz, eğer                                          |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| Bankacılık, sağlık gibi yüksek riskli trafik var          | Sertifikayı barındırıcı ya da CDN kendi yönetiyor (anahtarı siz seçmiyorsunuz) |
| Anahtar yönetimi sizde, yedek anahtar hazır               | Zorunlu güncelleme mekanizmanız yok                            |
| Sabitlemeyi sunucudan kapatabilecek bir yolunuz var       | Ekip anahtar döndürme takvimini izleyemiyor                    |

Sabitlemeden de güçlü bir taban vardır: yalnız HTTPS (Android'de açık metin trafik kapalı, iOS'ta ATS istisnasız),
sunucuda HSTS. Havuzdaki temel iOS'ta yalnız **yerel ağdaki geliştirme sunucusu** için istisna açar
([`app.config.ts`](../../mobil/app.config.ts)); bu istisna yayın yapılandırmasına taşınmamalı.

## Ekran görüntüsü, önizleme, pano ve günlük

- Telefon uygulama değiştiricide son ekranın görüntüsünü saklar ve gösterir. Hassas ekranda uygulama arka plana
  geçerken içeriği örtün; Android'de ekran görüntüsünü ve kaydını engelleyen pencere bayrağı (`FLAG_SECURE`)
  vardır. Expo'da bunun için ayrı bir modül gerekir; kurulu paketten doğrulayın.
- Parola ve tek kullanımlık kod alanlarında güvenli metin girişi (`secureTextEntry`) ve doğru otomatik doldurma
  türü verin; klavye önerisi ve pano geçmişi hassas metni tutabilir.
- Geliştirme günlükleri (`console.log`) yayın derlemesinde de çalışabilir ve cihaz günlüklerinden okunur: belirteç,
  kişisel veri, tam API yanıtı günlüğe yazılmaz ([Güvenlik günlüğü](gunluk-ve-izleme-guvenlik.md)).

## Kök ve jailbreak algılamanın sınırları

Algılama kitaplıkları bilinen izleri arar (dosya yolları, izinler, kancalama araçları); kök erişimli kullanıcı bu
izleri gizleyebilir ya da algılama işlevini kancalayıp "temiz" döndürtebilir. Bu yüzden:

- Algılama sonucunu **sinyal** olarak kullanın (uyarı göster, riskli işlemde ek doğrulama iste), kilit olarak değil.
- Kendi cihazını yöneten meşru kullanıcıyı (erişilebilirlik araçları, özel ROM) cezalandırmayın.
- Kararı sunucu verir: kanıtlama belirteci sunucuda doğrulanır; yetki her istekte sunucuda denetlenir
  ([Erişim denetimi açıkları](erisim-denetimi-aciklari.md)).

## Mağaza incelemesi

İnceleme bir güvenlik denetimi değildir; ama şu noktalarda uygulamanızı reddeder ya da sonradan kaldırır:

- **İzin amaç metinleri:** iOS'ta kamera, mikrofon, fotoğraf, konum isteyen uygulamanın her izin için amaç açıklaması
  olmalıdır. Açıklama yoksa izin istendiği anda uygulama kapanır; belirsizse ("Gerekli") inceleme reddeder.
- **Gizlilik beyanları:** mağazaların veri güvenliği/gizlilik etiketi formları, uygulamanın ve içindeki SDK'ların
  topladığı veriyle tutarlı olmalı. Analitik ya da hata izleme SDK'sı eklemek beyanı değiştirir.
- **İnceleme hesabı:** girişli uygulamada inceleyiciye çalışan bir deneme hesabı ve gerekiyorsa açıklama verin.
- **Hesap silme:** uygulama içinde hesap açılabiliyorsa silme yolu da uygulama içinde olmalı (havuzdaki mobil temelde
  `delete-account` ekranı var); süreç ve ayrıntı: [Mobil ve mağaza](../95-urun/mobil-ve-magaza.md).
- **Uzaktan kod güncellemesi:** JavaScript paketini mağaza dışından güncellemek (OTA) mağaza kurallarının izin verdiği
  sınırda kalmalı; uygulamanın amacını değiştiren güncelleme yapılmaz. Kuralların güncel metnini okuyun
  (doğrulanmadı).

```python calistir
REQUIRED = {  # izin → iOS'ta zorunlu amaç açıklaması anahtarı
    "camera": "NSCameraUsageDescription",
    "microphone": "NSMicrophoneUsageDescription",
    "photos": "NSPhotoLibraryUsageDescription",
    "location": "NSLocationWhenInUseUsageDescription",
}
VAGUE = {"gerekli", "izin gerekli", "uygulama için gerekli", "required"}


def check(permissions: list[str], info_plist: dict[str, str]) -> list[str]:
    problems = []
    for permission in permissions:
        key = REQUIRED[permission]
        text = info_plist.get(key, "").strip()
        if not text:
            problems.append(f"{key} yok: izin istenince uygulama kapanır, inceleme reddeder")
        elif text.lower() in VAGUE or len(text) < 25:
            problems.append(f"{key} belirsiz: neyi, ne için kullandığınızı yazın")
    return problems


info = {
    "NSCameraUsageDescription": "Kartlara kendi fotoğraflarınızı eklemek için kamerayı kullanırız.",
    "NSMicrophoneUsageDescription": "Gerekli",
}
assert check(["camera"], info) == []
assert check(["camera", "microphone", "photos"], info) == [
    "NSMicrophoneUsageDescription belirsiz: neyi, ne için kullandığınızı yazın",
    "NSPhotoLibraryUsageDescription yok: izin istenince uygulama kapanır, inceleme reddeder",
]
print("tamam")
```

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Faturada tanımadığınız e-posta/dil modeli kullanımı           | Gizli anahtar uygulama paketindeydi                           | Anahtarı döndürün; işi sunucuya taşıyın                      |
| Harita anahtarınız başka sitelerde kullanılıyor               | "Açık" anahtar kısıtlanmamış                                  | Paket adı, imza, kota kısıtı                                 |
| Telefonu değiştiren kullanıcı oturumunu yeni telefonda buldu  | Belirteç yedekle taşınan erişilebilirlikle saklandı           | `…THIS_DEVICE_ONLY`                                          |
| Arka plan eşitlemesi telefon kilitliyken hep başarısız        | Belirteç `WHEN_UNLOCKED…` ile saklandı                        | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`                        |
| Bulut yedeğinde uygulamanın veritabanı görünüyor              | Android otomatik yedeği açık                                  | `allowBackup: false` ya da hassas dosyaları dışlayın         |
| Bir bağlantıya dokunan kullanıcının hesabında işlem yapıldı   | Derin bağlantı doğrudan işlem tetikledi                       | Bağlantı yalnız ekran açar; işlem onayla                     |
| Başka bir uygulama giriş dönüşünü yakaladı                    | Özel şema + PKCE yok                                          | PKCE; mümkünse uygulama bağlantısı                           |
| Sertifika yenilendi, uygulama "bağlantı yok" diyor            | Sertifika (ya da yedeksiz anahtar) sabitlenmişti              | Açık anahtar + yedek pin; uzaktan kapatma; ya da sabitlemeyin |
| Uygulama değiştiricide sağlık bilgisi görünüyor               | Arka plana geçişte ekran örtülmedi                            | Örtme; Android'de ekran görüntüsü engeli                     |
| Kamera düğmesine basınca iOS'ta uygulama kapanıyor            | Amaç açıklaması yok                                           | Her izin için Türkçe, somut açıklama                         |
| Kök algılama yüzünden erişilebilirlik aracı kullanan kullanıcı dışarıda | Algılama kilit olarak kullanıldı                    | Sinyal olarak kullanın, karar sunucuda                       |

## Denetim listesi

- [ ] Paket ve `extra`/`EXPO_PUBLIC_` değerlerinde sır yok; derleme çıktısı sunucu sırlarının değerleri için taranıyor.
- [ ] "Açık" istemci anahtarları paket adı/imza ve kota ile kısıtlı.
- [ ] Belirteç güvenli depoda, `…THIS_DEVICE_ONLY` erişilebilirlikle; arka plan ihtiyacına göre doğru sınıf seçildi.
- [ ] Hassas veri için Android yedeği kapalı ya da dışlanmış.
- [ ] Derin bağlantılar izin listeli yollara gidiyor, işlem yapmıyor, gizli değer kabul etmiyor; birim testli.
- [ ] Dış giriş sistem tarayıcısı + PKCE ile; gömülü web görünümünde parola yok.
- [ ] Yayın derlemesinde açık metin trafik yok; yerel ağ istisnası yalnız geliştirmede.
- [ ] Sertifika sabitleme kararı yazılı (yapılıyorsa yedek anahtar ve kapatma yolu var).
- [ ] Hassas ekranlar uygulama değiştiricide örtülüyor; günlükte belirteç ve kişisel veri yok.
- [ ] Her izin için somut amaç metni var; gizlilik beyanı SDK'larla tutarlı; inceleme hesabı hazır.

## Küçük modele yaptırırken

- **İsteme yazın:** "Uygulamaya hiçbir gizli anahtar koyma; üçüncü taraf çağrısını sunucudaki uç üzerinden yap.
  Belirteci yalnız `tokenStorage` ile sakla. Derin bağlantı yalnız izin listesindeki ekranı açsın ve parametreyi
  doğrulasın; bağlantıdan işlem yapma. Yeni izin eklersen iOS amaç metnini Türkçe ve somut yaz."
- **Modelin tipik hatası:** API anahtarını `EXPO_PUBLIC_` değişkenine ya da `app.config`'in `extra` alanına koyar;
  belirteci AsyncStorage'a yazar; derin bağlantıdan gelen `id`'yi doğrulamadan sorguya koyar ya da bağlantıyla
  silme yapar; "güvenlik için" sertifika sabitleme ekleyip yedek anahtarı unutur; izin amaç metnini boş bırakır.
- **Çıktıda arayın:** `EXPO_PUBLIC_` ile başlayan yeni değişkenler, `extra:` altına eklenen değerler,
  `AsyncStorage.setItem` ile belirteç, `useLocalSearchParams` sonrası doğrulamasız kullanım, `Linking` işleyicisinde
  ağ isteği, `NS…UsageDescription` eksikleri, `console.log` içinde belirteç ya da yanıt gövdesi.
- **Test isteyin:** derin bağlantı yönlendirmesi için izin verilen/verilmeyen yollar, gizli parametre ve bozuk
  kimlik içeren birim testleri (yukarıdaki gibi).

## İlgili

- [Sır yönetimi](sir-yonetimi.md) — istemci paketine sızan ortam değişkenleri, sır taraması
- [Oturum güvenliği](oturum-guvenligi.md) — belirteç ömrü, yenileme belirteci döndürme
- [Ön yüz güvenliği](../20-web-onyuz/onyuz-guvenligi.md) — web derlemesinde belirteç ve XSS
- [PWA'yı telefona kurdurma ve mağazaya çıkma](../60-devops/mobil-paketleme.md) — imza anahtarı, `assetlinks.json`
- [Mobil ve mağaza](../95-urun/mobil-ve-magaza.md) — mağaza süreci, sürümleme, zorunlu güncelleme
- [Tehdit modelleme](tehdit-modelleme.md) — mobil istemciyi güvenilmez bileşen olarak modele koymak
- Havuzdaki mobil temel: [`tokenStorage.ts`](../../mobil/src/lib/session/tokenStorage.ts) (güvenli depo),
  [`app.config.ts`](../../mobil/app.config.ts) (şema, izinler, ağ istisnası)
