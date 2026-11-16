---
baslik: Kimlik ve yetki mimarisi: merkezi kimlik, servisler arası kimlik ve tek karar noktası
ozet: Kimliğin tek yerde doğrulanması, oturum ile belirteç seçiminin mimari etkisi, servisler ve işçiler arasında kimlik taşıma, yetki kararını tek yerde toplama ve iptal gecikmesi; çalışan iç belirteç örneğiyle.
etiketler: [kimlik, yetki, mimari, belirtec, servisler-arasi, guvenlik]
duzey: ileri
guncellik: 2026-11
---

# Kimlik ve yetki mimarisi: merkezi kimlik, servisler arası kimlik ve tek karar noktası

> Bu notu ne zaman okumalı: uygulamaya ikinci bir süreç (işçi, dil modeli servisi, rapor servisi) ya da mobil
> istemci eklenirken; "Google ile giriş" veya kurumsal giriş istenince; bir servis "isteği kimin adına yapıyorum"
> sorusunu cevaplamak zorunda kaldığında; yetkisi kaldırılan birinin hâlâ işlem yapabildiği görüldüğünde.

## Temel fikir

- Üç ayrı soru vardır: **kim** (kimlik doğrulama), **ne yapabilir** (yetki), **bu servis kimin adına çalışıyor**
  (servisler arası kimlik). Üçünün ayrıntılı gerçeklemesi 30-arkauc notlarındadır:
  [Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md), [Yetkilendirme](../30-arkauc/yetkilendirme.md); bu not
  parçaların **nerede** durduğunu anlatır.
- Kimlik **tek yerde** doğrulanır: tek kullanıcı tablosu, tek oturum deposu (ya da tek kimlik sağlayıcı). Her
  servis kendi parola tablosunu tutmaz.
- Hiçbir servis isteğin **ağ konumuna** güvenmez ("iç ağdan geldiyse güvenilir" yanlıştır); kimliği imzalı bir
  belirteçten okur ve doğrular.
- Yetki **kararı** tek yerde (politika modülü), **uygulanması** her uçta. Kuralı her serviste ayrı yazmak, kuralların
  zamanla ayrışması demektir.
- Kimliği aşağı taşıyan belirteç **kısa ömürlü** ve **hedefe özeldir** (yalnız o servis için geçerli).

## Karar tablosu: sistem şekline göre kimlik mimarisi

| Sistem                                               | Kimlik mimarisi                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Tek uygulama + tarayıcı                              | Sunucu tarafı oturum (veritabanında) + `HttpOnly` çerez + tek yetki modülü      |
| Aynı uygulama + mobil/masaüstü istemci               | Aynı oturum tablosu; opak belirteç `Authorization: Bearer` ile                  |
| Uygulama + arka plan işçisi                          | İş yükü başlatanı ve kiracıyı taşır; işçi çalışırken yetkiyi yeniden denetler    |
| Uygulama + birkaç iç servis (dil modeli, rapor)      | Ana uygulama oturumu doğrular, servise kısa ömürlü, hedefe özel imzalı belirteç verir |
| Kurumsal müşteriler kendi hesaplarıyla girmek istiyor | Dış kimlik sağlayıcı (OIDC/SAML) → girişten sonra **kendi** oturumunuz          |
| Üçüncü taraf geliştiriciler API'yi kullanacak        | Kapsamlı (scope) API anahtarı ya da OAuth; anahtarın özeti saklanır, döndürülebilir |
| Zamanlanmış iş başka bir servisi çağırıyor           | Servis kimliği (kendi anahtarı/belirteci); kullanıcı adına değil, kendi adına   |

Havuzdaki API ilk iki satırı birlikte uygular: tarayıcıya çerez, belirteç kipindeki istemciye opak belirteç; ikisi
de aynı `sessions` tablosundaki satırdır ([`api/KARARLAR.md`](../../uygulama/api/KARARLAR.md) → Kimlik).

## Merkezi kimlik

- Kullanıcının **sabit iç kimliği** vardır (UUID); e-posta, telefon, ad değişir, kimlik değişmez. Öteki tablolar
  kimliğe bağlanır, e-postaya değil.
- Dış girişler ayrı bir bağlama tablosunda durur: `(sağlayıcı, sağlayıcıdaki kimlik) → kullanıcı`. Aynı e-postayı
  taşıyan yeni bir dış girişi mevcut hesaba **kendiliğinden** bağlamayın; doğrulanmamış e-postayla hesap ele
  geçirilir. Bağlama, mevcut hesapla giriş yapmış kullanıcının onayıyla olur.
- Oturum mu belirteç mi sorusunun mimari özeti: imzalı, durumsuz belirteç (JWT gibi) **çok sayıda servisin
  veritabanına sormadan** doğrulaması gerektiğinde değer kazanır; bedeli iptal edilememesidir. Tek uygulamada
  veritabanı oturumu hem daha basit hem daha güvenlidir. Melez: kısa ömürlü (5–15 dk) erişim belirteci +
  veritabanında yenileme belirteci ([Oturum güvenliği](../50-guvenlik/oturum-guvenligi.md) → yenileme belirteci
  döndürme).

## Servisler arası kimlik

Ana uygulama kullanıcının oturumunu doğrular; aşağıdaki servise kullanıcının çerezini ya da oturum belirtecini
**iletmez**. Onun yerine o servis için, o istek için, kısa ömürlü bir belirteç üretir; alan servis imzayı, hedefi
(`aud`) ve süreyi doğrular:

```python calistir
import base64
import hashlib
import hmac
import json

ANAHTAR = b"ic-imza-anahtari: gercekte ortamdan okunur"  # en az 32 bayt rastgele; depoda durmaz


def b64(veri: bytes) -> str:
    return base64.urlsafe_b64encode(veri).rstrip(b"=").decode()


def b64_coz(metin: str) -> bytes:
    return base64.urlsafe_b64decode(metin + "=" * (-len(metin) % 4))


def ic_belirtec(kullanici: str, kiraci: str, hedef: str, simdi: int, omur: int = 60) -> str:
    """Ana uygulama (ya da ağ geçidi) oturumu doğruladıktan sonra aşağıdaki servis için üretir."""
    yuk = json.dumps({"sub": kullanici, "kiraci": kiraci, "aud": hedef, "exp": simdi + omur}).encode()
    return f"{b64(yuk)}.{b64(hmac.new(ANAHTAR, yuk, hashlib.sha256).digest())}"


def dogrula(belirtec: str, ben: str, simdi: int) -> dict | None:
    """Alan servis: imza + hedef (aud) + süre. Üçü de tutmazsa kimlik yok sayılır."""
    yuk_b64, _, imza_b64 = belirtec.partition(".")
    yuk = b64_coz(yuk_b64)
    if not hmac.compare_digest(hmac.new(ANAHTAR, yuk, hashlib.sha256).digest(), b64_coz(imza_b64)):
        return None
    veri = json.loads(yuk)
    return veri if veri["aud"] == ben and veri["exp"] > simdi else None


def kim_yanlis(basliklar: dict[str, str]) -> str:
    return basliklar["X-Kullanici-Id"]  # YANLIŞ: servise doğrudan ulaşan herkes istediği kimliği yazar


simdi = 1_800_000_000
b = ic_belirtec("u42", "firma-a", hedef="rapor", simdi=simdi)
assert dogrula(b, "rapor", simdi + 5)["kiraci"] == "firma-a"
assert dogrula(b, "odeme", simdi + 5) is None  # rapor servisine verilen belirteç ödemede geçmez
assert dogrula(b, "rapor", simdi + 61) is None  # süresi doldu: çalınsa da kısa ömürlü
oynanmis = b64(json.dumps({"sub": "u42", "kiraci": "firma-b", "aud": "rapor", "exp": simdi + 60}).encode())
assert dogrula(f"{oynanmis}.{b.split('.')[1]}", "rapor", simdi) is None  # kiracıyı değiştirmek imzayı bozar
assert kim_yanlis({"X-Kullanici-Id": "yonetici"}) == "yonetici"  # imzasız başlığa güvenmek = kimlik taklidi
print("iç belirteç: hedef, süre ve imza denetlendi; imzasız başlık reddedilmeli")
```

```cikti
iç belirteç: hedef, süre ve imza denetlendi; imzasız başlık reddedilmeli
```

- **Paylaşılan anahtarın sınırı:** HMAC'te doğrulayabilen her servis belirteç de **üretebilir**. Servis sayısı
  ikiyi geçince imzayı yalnız ana uygulamanın bildiği özel anahtarla atın (asimetrik imza), servisler açık
  anahtarla doğrulasın. Anahtarlar döndürülebilir olsun (belirteçte anahtar kimliği) ([Sır yönetimi](../50-guvenlik/sir-yonetimi.md)).
- Yükte yalnız gerekeni taşıyın: kullanıcı kimliği, kiracı, hedef, süre; e-posta ya da kişisel veri değil.
- Servisin **kendi** kimliği ayrıdır: "rapor servisi, kullanıcı u42 adına" ile "rapor servisi, gece işi için
  kendi adına" farklı yetkilere sahiptir ve denetim günlüğünde ayrı görünür.
- Ağ katmanı ikinci savunmadır: iç servisler dışarıya kapalı adreste dinler, aralarında TLS kullanılır. Ama kimlik
  denetimi yine yapılır; tek bir yanlış vekil ayarı iç servisi dışarı açabilir ([Ters vekil](../60-devops/ters-vekil.md)).

## Yetki kararını tek yerde toplama

| Yaklaşım                                     | Ne zaman                               | Bedel                                               |
| -------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| Tek uygulamada yetki modülü (`can(...)`)     | Monolit — çoğu ürün                    | Yok denecek kadar az; havuzdaki seçim                |
| Ortak, sürümlü politika kütüphanesi          | Aynı dilde birkaç servis               | Her servis güncellenmeli; sürüm kayması              |
| Politika servisi (her karar bir ağ çağrısı)  | Çok servis, sık değişen kurallar       | Gecikme ve erişilebilirlik; karar önbelleği gerekir |
| Belirteçte kaba rol + kaynakta ince denetim  | Servisler arası                        | Rol değişikliği belirteç süresince gecikir           |

- Karar için gereken veri (üyelik, sahiplik, rol) **kaynağın sahibi** olan modülde durur; karar orada ya da
  oradan okunarak verilir.
- Her karar noktası "varsayılan hayır" ile çalışır; tanımsız işlem hata verir ([Yetkilendirme](../30-arkauc/yetkilendirme.md)
  → "Yetkiyi tek yerde toplama").
- Havuzdaki örnek: başında rol tablosu olan tek dosya, her kural bir `assert…` işlevi
  ([`permissions.ts`](../../uygulama/api/src/modules/workspaces/permissions.ts)); eşitleme ucu her değişikliği
  aynı işlevlerle denetler.

## İptal gecikmesi

Yetki ya da oturum iptal edildiğinde etkisi ne kadar sürede bütün sisteme ulaşır?

| Mekanizma                                    | En kötü iptal gecikmesi            | Not                                               |
| -------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| Her istekte veritabanından oturum + rol      | Sıfır                              | Havuzdaki seçim                                   |
| Rol önbellekte, süre T                        | T                                  | Rol değişince önbelleği silin; T kısa olsun       |
| Belirteçte rol, ömür T                        | T                                  | Kritik işlemde rolü veritabanından yeniden okuyun |
| Uzun ömürlü JWT oturum olarak                 | Belirteç ömrü (günler)             | Kaçının ([Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md)) |
| Kuyrukta bekleyen iş, başlatanın yetkisiyle  | İş çalışana dek                    | İşçi çalışırken yetkiyi yeniden denetler          |
| Açık anlık bildirim bağlantısı (SSE/WebSocket) | Bağlantı kapanana dek            | Üyelik değişince o kullanıcının bağlantılarını kapatın |

Bu tablo bir **tasarım girdisidir**: "çalışan işten çıkarıldı, erişimi ne kadar sürede kesilmeli?" sorusunun cevabı
mekanizmayı seçer.

## Tuzaklar

| Belirti                                                          | Neden                                                    | Çözüm                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| İç servise `X-Kullanici-Id` başlığıyla herkes istediği gibi girdi | Servis imzasız başlığa güvendi                           | İmzalı, hedefe özel, kısa ömürlü belirteç                   |
| Rapor servisine verilen belirteçle ödeme yapılabildi             | Belirteçte hedef (`aud`) yok ya da denetlenmiyor         | `aud` zorunlu ve her serviste denetlenir                    |
| Kullanıcının oturum çerezi iç servislerin günlüğünde             | Çerez/oturum belirteci aşağı iletildi                    | Aşağıya yalnız iç belirteç; çerez sınırda kalır             |
| Yetkisi alınan çalışan bir gün daha işlem yaptı                  | Rol belirteçte ya da süresiz önbellekte                  | İptal gecikmesi tablosuna göre mekanizma                    |
| Aynı kural iki serviste farklı sonuç veriyor                     | Kural her serviste ayrı yazıldı                          | Tek politika modülü/kütüphanesi                             |
| "Google ile giriş" başka birinin hesabını açtı                   | Aynı e-postalı dış giriş kendiliğinden bağlandı          | Bağlamayı oturumlu kullanıcının onayına bağla               |
| Gece işi "sistem" yetkisiyle her kiracının verisine dokundu      | İşin kimliği ve kiracısı yok                             | İş yükünde başlatan + kiracı; servis kimliği ayrı           |
| Bir servisin anahtarı sızınca bütün servisler taklit edilebildi  | Tek paylaşılan HMAC anahtarı                             | Asimetrik imza; servis başına anahtar; döndürme             |

## Denetim listesi

- [ ] Tek kullanıcı tablosu ve tek oturum deposu var; kullanıcının sabit iç kimliği var.
- [ ] Dış girişler bağlama tablosunda; kendiliğinden hesap birleştirme yok.
- [ ] İç servisler imzalı, hedefe özel, kısa ömürlü belirteç istiyor; imzasız kimlik başlığına güvenmiyor.
- [ ] Kullanıcı çerezi ya da oturum belirteci sınırı geçmiyor.
- [ ] Yetki kararı tek modülde/kütüphanede; her uç onu çağırıyor; varsayılan "hayır".
- [ ] Arka plan işleri başlatanı ve kiracıyı taşıyor; çalışırken yetki yeniden denetleniyor.
- [ ] İptal gecikmesi her mekanizma için biliniyor ve kabul edilmiş.
- [ ] Denetim günlüğü "kim, kimin adına, hangi servisle" bilgisini taşıyor.
- [ ] İmza anahtarları ortamdan okunuyor ve döndürülebiliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni servis kimliği imzalı iç belirteçten okusun; `aud` bu servisin adı olmalı, süre en çok
  60 sn. Kullanıcının çerezini ya da oturum belirtecini servise iletme. Yetki kararını `permissions` modülündeki
  işlevlerle ver; yeni kural gerekiyorsa oraya ekle."
- **Modelin tipik hatası:** iç servise "güvenilir ağ" diye kimliksiz erişim açar; kullanıcı kimliğini başlıkta
  düz metin taşır; uzun ömürlü JWT'yi oturum olarak kullanır; yetki kuralını servisin içine yeniden yazar; arka plan
  işini "sistem" kimliğiyle çalıştırır.
- **Çıktıda arayın:** `X-User-Id`, `X-Kullanici` gibi başlıkların okunduğu yerler; `aud` denetimi olmayan belirteç
  doğrulaması; `expiresIn` değeri saatler/günler; servis kodunda `role ===` karşılaştırmaları.
- **Test isteyin:** "başka servise verilmiş belirteç reddedilir", "süresi dolmuş belirteç reddedilir", "imzasız
  kimlik başlığı reddedilir" testleri.

## İlgili

- [Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md) · [Yetkilendirme](../30-arkauc/yetkilendirme.md) ·
  [Oturum güvenliği](../50-guvenlik/oturum-guvenligi.md) · [Erişim denetimi açıkları](../50-guvenlik/erisim-denetimi-aciklari.md)
- [Monolit ve servisler](monolit-ve-servisler.md) · [Çok kiracılık](cok-kiracilik.md) ·
  [Tehdit modelleme](../50-guvenlik/tehdit-modelleme.md)
- Havuzda: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md),
  [`uygulama/api/src/modules/auth/session.ts`](../../uygulama/api/src/modules/auth/session.ts)
