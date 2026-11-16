---
baslik: Erişim denetimi açıkları: IDOR, yetki yükseltme ve toplu atama
ozet: Yatay ve dikey yetki yükseltmenin tipik biçimleri, toplu atama ve prototip kirletme (çalışan örnekler), gizli ucun korumalı olmadığı ve bütün uçları tarayan yetki testi.
etiketler: [guvenlik, yetki, idor, toplu-atama, test]
duzey: orta
guncellik: 2026-11
---

# Erişim denetimi açıkları: IDOR, yetki yükseltme ve toplu atama

> Bu notu ne zaman okumalı: kimlik, rol, sahip ya da kiracı taşıyan bir uç yazılırken veya incelenirken; istek
> gövdesi doğrudan bir nesneye/ORM'e verilirken; "yönetici sayfası menüde yok, kimse bilmez" denildiğinde; bir
> güvenlik testi listesi hazırlanırken. Yetki modelinin kendisi (rol tablosu, kiracı süzgeci):
> [Yetkilendirme](../30-arkauc/yetkilendirme.md).

## Temel fikir

Erişim denetimi açıkları en sık görülen ve araçla en zor bulunan sınıftır: kod "çalışır", yalnız **yanlış kişi
için** çalışır. Üç soru her açığı yakalar:

1. **Kimin adına?** Kimlik ve kiracı oturumdan mı geliyor, yoksa istekten mi (adres, gövde, başlık)?
2. **Hangi kayıt?** Kayıt sorgusu sahiplik koşulunu içeriyor mu, yoksa önce getirip sonra mı bakılıyor (ya da
   hiç bakılmıyor mu)?
3. **Hangi alanlar?** İstemci yalnız değiştirmesine izin verilen alanları mı değiştirebiliyor?

| Açık türü                     | Örnek                                                                     |
| ----------------------------- | ------------------------------------------------------------------------- |
| Yatay yükseltme (IDOR/BOLA)   | Ayşe `/faturalar/102`'yi açar; fatura Mehmet'indir                        |
| Dikey yükseltme               | Üye, yönetici ucunu çağırır; denetim yalnız menüyü gizlemiştir             |
| Toplu atama (mass assignment) | `PATCH /profil {"rol": "yonetici"}` kayda yazılır                         |
| İşlev düzeyi eksik            | Okuma ucu denetlenir, aynı kaydı silen uç denetlenmez                     |
| Durum/akış atlama             | Onaylanmış faturayı düzenleme; ödeme adımını atlayıp "tamamlandı" çağırma |
| Kiracı sızıntısı              | Tekil uç korunur, dışa aktarma/arama bütün kiracıları döndürür             |

IDOR'un çalışan örneği ve kiracı süzgeci [Yetkilendirme](../30-arkauc/yetkilendirme.md) notundadır; burada
yinelenmez.

## Karar tablosu: hata kodu ve varsayılan

| Durum                                            | Yanıt               | Neden                                                    |
| ------------------------------------------------ | ------------------- | -------------------------------------------------------- |
| Oturum yok                                       | 401                 | İstemci yeniden giriş ister                              |
| Kaydın varlığını bilmemesi gereken biri          | 404                 | 403, kaydın var olduğunu söyler                          |
| Kaydı görebilen ama bu işlemi yapamayan          | 403                 | Arayüz anlamlı ileti gösterebilir                        |
| İzin verilmeyen alan gönderildi                  | 400 (alan adıyla)   | Sessizce atmak istemci hatasını ve saldırıyı gizler      |
| Kural bulunamadı / tanımsız işlem                | Reddet              | Varsayılan "hayır"                                       |

## Toplu atama: yanlış, doğru, test

Neden açık: gövde olduğu gibi kayda/ORM'e verilir (`User(**govde)`, `setattr` döngüsü, `update(req.body)`).
İstemci, formda olmayan alanı da gönderebilir: `rol`, `sahip_id`, `eposta_dogrulandi`, `kredi`.

```python calistir
from dataclasses import dataclass, field


@dataclass
class Kullanici:
    id: int
    ad: str
    eposta: str
    rol: str = "uye"
    eposta_dogrulandi: bool = False
    ayarlar: dict = field(default_factory=dict)


# YANLIŞ: gövdedeki her anahtar kayda yazılır
def profil_guncelle_yanlis(k: Kullanici, govde: dict) -> None:
    for alan, deger in govde.items():
        setattr(k, alan, deger)


# DOĞRU: her işlemin kendi izin listesi; liste dışı alan 400
PROFIL_ALANLARI = {"ad", "ayarlar"}  # kullanıcının kendisi
YONETICI_ALANLARI = {"ad", "rol"}  # yönetici ucu (ayrı kapıdan geçer)


class AlanHatasi(ValueError):
    pass


def guncelle(k: Kullanici, govde: dict, izinli: set[str]) -> None:
    yasak = set(govde) - izinli
    if yasak:
        raise AlanHatasi(f"değiştirilemeyen alan: {', '.join(sorted(yasak))}")  # → 400
    for alan in izinli & set(govde):
        setattr(k, alan, govde[alan])


saldiri = {"ad": "Ayşe", "rol": "yonetici", "eposta_dogrulandi": True}
k1 = Kullanici(1, "ayse", "ayse@ornek.test")
profil_guncelle_yanlis(k1, saldiri)
assert k1.rol == "yonetici"  # kullanıcı kendini yönetici yaptı

# TEST: aynı gövde doğru sürümde reddedilir, kayıt değişmez
k2 = Kullanici(2, "ayse", "ayse@ornek.test")
try:
    guncelle(k2, saldiri, PROFIL_ALANLARI)
    raise AssertionError("reddedilmeliydi")
except AlanHatasi as hata:
    assert "rol" in str(hata) and "eposta_dogrulandi" in str(hata)
assert (k2.ad, k2.rol, k2.eposta_dogrulandi) == ("ayse", "uye", False)
guncelle(k2, {"ad": "Ayşe", "ayarlar": {"tema": "koyu"}}, PROFIL_ALANLARI)
assert k2.ad == "Ayşe" and k2.rol == "uye"
print("tamam")
```

```cikti
tamam
```

- **Oluşturma da aynıdır:** `Kullanici(**govde)` istemciye `id`, `rol`, `olusturma_zamani` yazdırır. Sunucunun
  belirlediği alanlar (kimlik, sahip, kiracı, zaman, rol) gövdeden hiç okunmaz.
- **Şema kitaplığı:** Zod'un nesne şeması bilinmeyen anahtarları varsayılan olarak **atar**, `.strict()` ile
  hata verir (havuzdaki zod 4.6.7 ile denendi). Hangisi seçilirse seçilsin şema **işlem başına** ayrıdır:
  "kullanıcı günceller" ve "yönetici günceller" aynı şemayı paylaşmaz.
- PATCH'te "anahtar yok" ile `null` ayrımı ve JavaScript örneği: [API tasarımı → Kısmi güncelleme](../30-arkauc/api-tasarimi.md).

## JavaScript'e özgü: prototip kirletme

Neden açık: `JSON.parse` `"__proto__"` anahtarını sıradan bir anahtar olarak üretir. Bunu bir hedef nesneye
**atama** yoluyla kopyalayan kod (elle yazılmış derin birleştirme, `Object.assign`) nesnenin prototipini
değiştirir; derin birleştirmede değişiklik **bütün nesnelere** yayılır: `({}).yonetici === true`.

```js calistir
import assert from 'node:assert/strict'

const govde = JSON.parse('{"tema": "koyu", "__proto__": {"yonetici": true}}')

// YANLIŞ: anahtar denetimsiz derin birleştirme
function birlestirYanlis(hedef, kaynak) {
  for (const anahtar of Object.keys(kaynak)) {
    if (typeof kaynak[anahtar] === 'object' && kaynak[anahtar] !== null) {
      hedef[anahtar] ??= {}
      birlestirYanlis(hedef[anahtar], kaynak[anahtar])
    } else hedef[anahtar] = kaynak[anahtar]
  }
  return hedef
}
birlestirYanlis({}, govde)
assert.equal({}.yonetici, true) // bütün nesneler etkilendi
delete Object.prototype.yonetici

// Object.assign da hedefin prototipini değiştirir (yalnız o nesnede)
assert.equal(Object.assign({}, govde).yonetici, true)

// DOĞRU: tehlikeli anahtarları atla (daha iyisi: izin listeli şema)
const YASAK = new Set(['__proto__', 'constructor', 'prototype'])
function birlestir(hedef, kaynak) {
  for (const anahtar of Object.keys(kaynak)) {
    if (YASAK.has(anahtar)) continue
    const deger = kaynak[anahtar]
    if (typeof deger === 'object' && deger !== null && !Array.isArray(deger)) {
      if (!Object.hasOwn(hedef, anahtar)) hedef[anahtar] = {}
      birlestir(hedef[anahtar], deger)
    } else hedef[anahtar] = deger
  }
  return hedef
}
const sonuc = birlestir({}, govde)
// TEST: ne bu nesne ne de başkaları etkilendi
assert.equal(sonuc.tema, 'koyu')
assert.equal(sonuc.yonetici, undefined)
assert.equal({}.yonetici, undefined)
console.log('tamam')
```

```cikti
tamam
```

Yayma sözdizimi (`{ ...govde }`) prototipi değiştirmez ama `__proto__` adlı **kendi** alanını taşır; kayda
yazılırsa yine toplu atamadır. Korumalı birleştirme: [`kutuphane/ts/src/derin.ts`](../../kutuphane/ts/src/derin.ts)
(`deepMerge`). Sözlük gibi kullanılan nesnelerde `Map` ya da `Object.create(null)` tercih edin.

## Gizli uç ≠ korumalı uç

Menüde olmayan, adresi "tahmin edilemez" uç korumalı değildir: adresler istemci paketinde, tarayıcı geçmişinde,
günlüklerde, `robots.txt`'de ve eski belgelerde durur. Dikey yükseltmenin en sık nedeni budur. Tek güvence,
**bütün kayıtlı uçları** tarayan bir testtir:

```python calistir
from collections.abc import Callable

ROTALAR: dict[str, tuple[str, Callable[[dict | None], int]]] = {}


def uc(adres: str, gereken: str):
    """gereken: 'herkes' | 'uye' | 'yonetici'. Kapı rotayla birlikte tanımlanır, işleyicinin içinde değil."""

    def kaydet(islev):
        ROTALAR[adres] = (gereken, islev)
        return islev

    return kaydet


def cagir(adres: str, oturum: dict | None) -> int:
    gereken, islev = ROTALAR[adres]
    if gereken != "herkes" and oturum is None:
        return 401
    if gereken == "yonetici" and oturum["rol"] != "yonetici":
        return 403
    return islev(oturum)


@uc("GET /api/saglik", "herkes")
def saglik(oturum):
    return 200


@uc("GET /api/profil", "uye")
def profil(oturum):
    return 200


@uc("POST /api/yonetim/disa-aktar", "herkes")  # YANLIŞ: "menüde yok, kimse bilmez" diye kapı unutuldu
def disa_aktar(oturum):
    return 200


HERKESE_ACIK = {"GET /api/saglik"}  # bilinçli liste
YONETICI_ONEKI = "POST /api/yonetim/"


def acik_bul() -> list[str]:
    bulgular = []
    for adres in ROTALAR:
        if adres not in HERKESE_ACIK and cagir(adres, None) != 401:
            bulgular.append(f"oturumsuz çağrılabiliyor: {adres}")
        if adres.startswith(YONETICI_ONEKI) and cagir(adres, {"rol": "uye"}) != 403:
            bulgular.append(f"üye çağırabiliyor: {adres}")
    return bulgular


# TEST: gizli uç yakalandı
assert acik_bul() == ["oturumsuz çağrılabiliyor: POST /api/yonetim/disa-aktar", "üye çağırabiliyor: POST /api/yonetim/disa-aktar"]
ROTALAR["POST /api/yonetim/disa-aktar"] = ("yonetici", disa_aktar)  # DOĞRU: kapı eklendi
assert acik_bul() == []
print("tamam")
```

```cikti
tamam
```

Havuzdaki karşılığı: [`rules.test.ts`](../../uygulama/api/test/rules.test.ts) sunucuya **kayıtlı** her ucu
listeler; `PUBLIC_ROUTES` dışındaki her uç oturumsuz isteğe 401 vermezse test düşer ve iletisi "işleyicinin ilk
satırı `requireUser(c)` olmalı" der.

## Sık kaçan yerler

| Yer                                      | Açık                                                                  | Önlem                                                           |
| ---------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Aynı kaynağın başka yöntemi              | `GET` denetlenir, `PUT`/`DELETE` ya da toplu uç denetlenmez           | Yetki işlem başına; testte her yöntem                           |
| Yöntem geçersiz kılma başlıkları         | `X-HTTP-Method-Override` ile yöntem değişir, ara katman eskisine bakar | Bu başlıkları kabul etmeyin                                     |
| Vekilde adres kalıbıyla yetki            | `/admin` engellenir; büyük harf, sondaki `/`, kodlama farkı geçer      | Yetki uygulamada, işlem düzeyinde; vekil yalnız ek kat           |
| Çok adımlı akış                          | 3. adım 1. adımın koşulunu yeniden denetlemez                          | Her adım durum makinesine göre izin verilen geçişi denetler     |
| Durum kilidi                             | Onaylı/ödenmiş kayıt düzenlenebilir                                   | Kural: durum → izin verilen işlemler; testli                    |
| Anlık bildirim (SSE/WebSocket) aboneliği | Başka alanın kanalına abone olunabilir                                | Abone olurken üyelik denetimi; üyelik bitince bağlantıyı kes    |
| Dışa aktarma, arama, sayım, rapor        | Kiracı süzgeci yalnız tekil uçta                                      | Kiracıyla kurulan depo; iki kiracılı test                        |
| Dosya ve görsel adresleri                | Süresiz/tahmin edilebilir adres                                       | Yetki denetimli uç ya da kısa süreli imzalı adres ([Dosya ve medya](../30-arkauc/dosya-ve-medya.md)) |
| Yapay zekâ aracı                         | Araç uygulamanın tam yetkisiyle çalışır, kullanıcıyı model seçer       | Araç oturumdaki kullanıcının yetkisiyle ([YZ güvenliği](yapay-zeka-uygulama-guvenligi.md)) |
| Rol değişikliği                          | Rol belirteçte/önbellekte; düşürülen kişi bir süre daha yönetici      | Rol her istekte veritabanından ya da önbellek silinir           |

## Tuzaklar

| Belirti                                                          | Neden                                                      | Çözüm                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Kullanıcı profil formundan kendini yönetici yaptı                 | Gövde doğrudan kayda yazıldı                               | İşlem başına alan izin listesi; liste dışı alan 400              |
| Yeni kayıt istemcinin seçtiği `id`/`sahip_id` ile oluştu          | `Model(**govde)`                                           | Sunucu alanları gövdeden okunmaz                                 |
| Bütün nesnelerde beklenmedik `yonetici` alanı                      | Prototip kirletme                                          | Tehlikeli anahtar reddi, şema, `Map`                            |
| "Gizli" yönetim ucu arama motorunda çıktı                         | Gizlilik koruma sanıldı                                    | Kapı + bütün uçları tarayan test                                 |
| Arayüzde düğme yok ama `curl` ile işlem yapılıyor                 | Yetki yalnız arayüzde                                      | Karar sunucuda; arayüz yalnız gösterir                           |
| Üye kendi rolünü `owner` yaptı                                    | Rol değiştirme ucu hedefin kendisi olup olmadığına bakmadı | "Kendi rolünü değiştiremez", "son sahip düşürülemez" kuralları    |
| Testler yeşil ama açık var                                        | Yalnız mutlu yol test edilmiş                              | Her kural için olumsuz test; iki kullanıcılı/iki kiracılı kurgu  |
| 403 yanıtı başkasının kaydının varlığını doğruluyor               | Üye olmayana 403                                           | Üye olmayana 404                                                 |

## Denetim listesi

- [ ] Kimlik, rol, kiracı yalnız oturumdan okunuyor; gövde/adres/başlıktaki bu alanlar yok sayılmıyor, reddediliyor.
- [ ] Oluşturma ve güncelleme uçlarının her birinin kendi alan izin listesi (şeması) var; liste dışı alan 400.
- [ ] Derin birleştirme yapılan her yer tehlikeli anahtarları reddediyor ya da şemadan geçmiş veriyle çalışıyor.
- [ ] Kayıtlı bütün uçları tarayan test: herkese açık liste dışında oturumsuz 401, yönetici uçlarında üyeye 403.
- [ ] Her yetki kuralının olumsuz testi var; iki kullanıcılı ve iki kiracılı kurgu her kaynak için çalışıyor.
- [ ] Durum kilitleri (onaylı, ödenmiş, arşivlenmiş) sunucuda denetleniyor.
- [ ] Anlık bildirim, dışa aktarma, arama ve dosya uçları aynı yetki işlevlerinden geçiyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu uçta değiştirilebilecek alanlar yalnız şunlar: [liste]. Başka alan gelirse 400 dön. Kimlik
  ve kiracıyı oturumdan al, gövdeden okuma. Testlere şunları ekle: başka kullanıcının kaydı → 404; izleyici
  rolü → 403; gövdede `rol`/`sahip_id` → 400 ve kayıt değişmedi."
- **Modelin tipik hatası:** `Object.assign(kayit, req.body)`, `Model(**body)`, `update(req.body)`; yeni yönetici
  ucunu "nasılsa menüde yok" diye kapısız bırakmak; yalnız arayüzde düğmeyi gizlemek; yalnız mutlu yol testi.
- **Çıktıda denetleyin:** `req.body` / `govde` doğrudan kayda ya da ORM'e mi gidiyor; `**` ile açılan sözlük;
  `Object.assign(`, kendi yazdığı `merge(`; yeni rota kural testindeki listeye bilinçli mi eklenmiş.
- **Test isteyin:** "Bütün uçları dolaşan yetki testi" (yukarıdaki `acik_bul` kalıbı ya da `rules.test.ts`) ve
  her kaynak için iki kullanıcılı çapraz erişim testi.

## İlgili

- Model ve IDOR örneği: [Yetkilendirme](../30-arkauc/yetkilendirme.md) · PATCH alan listesi:
  [API tasarımı](../30-arkauc/api-tasarimi.md)
- Çalışan kod: [`uygulama/api/src/modules/workspaces/permissions.ts`](../../uygulama/api/src/modules/workspaces/permissions.ts),
  [`rules.test.ts`](../../uygulama/api/test/rules.test.ts), [`security.test.ts`](../../uygulama/api/test/security.test.ts)
  → "başkasının alanına erişim"; tarif [`uygulama/api/TARIFLER.md`](../../uygulama/api/TARIFLER.md) → "Yeni yetki kuralı"
- [Tehdit modelleme](tehdit-modelleme.md) (STRIDE'ın E satırı) · [OWASP özeti](owasp-ozet.md)
