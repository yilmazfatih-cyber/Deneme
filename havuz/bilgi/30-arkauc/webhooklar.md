---
baslik: Webhooklar: imza doğrulama, yineleme koruması ve güvenli gönderim
ozet: Webhook alırken ham gövdeyle HMAC imza doğrulama, yeniden oynatma ve yineleme koruması, hızlı yanıt; gönderirken imzalama, yeniden deneme çizelgesi, zaman aşımı, SSRF ve olay sürümleme.
etiketler: [webhook, hmac, imza, idempotentlik, guvenlik]
duzey: orta
guncellik: 2026-11
---

# Webhooklar: imza doğrulama, yineleme koruması ve güvenli gönderim

> Bu notu ne zaman okumalı: bir ödeme, e-posta ya da kargo sağlayıcısından bildirim alan bir uç yazılırken; kendi
> uygulamanız müşterilerin verdiği adreslere olay gönderecekken; "webhook imzası tutmuyor", "aynı olay iki kez
> işlendi" ya da "sağlayıcı bildirimleri durdurdu" sorunlarında.

## Temel fikir

Webhook, başka bir sistemin sizin **herkese açık** bir adresinize olay göndermesidir. Adresi bilen herkes oraya
istek atabilir; bu yüzden gelen her istek için üç soru sorulur:

1. **Gerçekten o mu gönderdi?** Paylaşılan gizli anahtarla hesaplanmış imza (HMAC), **ham gövde** üstünden,
   sabit zamanlı karşılaştırmayla doğrulanır.
2. **Taze mi?** İmzalı zaman damgası birkaç dakikadan eskiyse reddedilir (yeniden oynatma, replay).
3. **Daha önce işledim mi?** Gönderen, yanıt alamazsa aynı olayı günlerce yeniden gönderir; olay kimliğiyle
   yinelenen ayıklanır.

Sonra iş **hızla 2xx** dönmektir: olay kaydedilir, kuyruğa konur, işlem sonra yapılır. Gönderen zaman aşımına
uğrarsa olayı başarısız sayar ve yeniden gönderir. Olayların **sırası garanti değildir**.

## Karar tablosu: alıcı

| Durum                                             | Yanıt                 | Neden                                                     |
| ------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| İmza tutmuyor ya da başlık yok                    | 401 (ya da 400)       | Gönderen bu değil; işlem yok                              |
| Zaman damgası tolerans dışında                    | 400                   | Yeniden oynatma olabilir                                  |
| Olay daha önce işlenmiş                           | **200**               | 4xx/5xx dönerseniz gönderen yeniden dener, sonsuza dek    |
| Tanımadığınız olay türü                           | **200** (yok sayın)   | Sağlayıcı yeni tür ekledi diye ucunuz kırılmasın          |
| Doğru ve yeni                                     | Kaydet + kuyruğa koy → 200 | Ağır iş yanıtı bekletmesin                           |
| Kendi veritabanınız çöktü                         | 500                   | Gönderen sonra yeniden denesin (istenen davranış)         |

## Alma: imza doğrulama

Gönderenin şeması tipik olarak şudur: `imza = HMAC-SHA256(gizli, zaman + "." + ham_gövde)`; zaman ve imza
başlıklarda gelir. Ayrıntıyı (başlık adları, birden çok imza, kodlama) sağlayıcının belgesinden okuyun.

```python calistir
import hashlib
import hmac
import json

GIZLI = b"whsec_ornek_gizli_anahtar_32_bayt!!"
TOLERANS = 300  # sn: daha eski imzalı istek yeniden oynatma sayılır
islenmis: set[str] = set()


def imzala(zaman: int, govde: bytes) -> str:  # gönderen tarafın yaptığı
    return hmac.new(GIZLI, str(zaman).encode() + b"." + govde, hashlib.sha256).hexdigest()


def al(ham_govde: bytes, zaman_basligi: str, imza_basligi: str, simdi: int) -> int:
    try:
        zaman = int(zaman_basligi)
    except ValueError:
        return 400
    if abs(simdi - zaman) > TOLERANS:
        return 400  # eski ya da gelecekten: yeniden oynatma
    beklenen = imzala(zaman, ham_govde)  # HAM baytlar üstünden; çözülüp yeniden yazılmış JSON değil
    if not hmac.compare_digest(beklenen, imza_basligi):  # sabit zamanlı karşılaştırma
        return 401
    olay = json.loads(ham_govde)
    if olay["id"] in islenmis:
        return 200  # yinelenen: yine 2xx, yoksa gönderen durmadan yeniden dener
    islenmis.add(olay["id"])  # gerçekte: veritabanına + kuyruğa, aynı işlemde; sonra HEMEN 200
    return 200


simdi = 1_800_000_000
ham = '{"id": "ev_1", "tur": "odeme.basarili", "tutar": 15000, "ad": "Ayşe"}'.encode()
imza = imzala(simdi, ham)
assert al(ham, str(simdi), imza, simdi + 2) == 200
assert al(ham, str(simdi), imza, simdi + 3) == 200 and len(islenmis) == 1  # yineleme ayıklandı
# YANLIŞ: gövdeyi çözüp yeniden yazınca baytlar değişir (boşluk, sıra, \u kaçışları)
yeniden = json.dumps(json.loads(ham)).encode()
assert yeniden != ham and al(yeniden, str(simdi), imza, simdi + 2) == 401
assert al(ham, str(simdi), imza, simdi + 3600) == 400  # bir saat sonra aynı istek: reddedilir
assert al(ham.replace(b"15000", b"1"), str(simdi), imza, simdi) == 401  # gövde değiştirilmiş
print("tamam")
```

```cikti
tamam
```

Ham gövde neden önemli: çoğu çerçeve gövdeyi JSON olarak çözüp size nesne verir. O nesneyi yeniden metne çevirirseniz
boşluklar, anahtar sırası ve Türkçe karakterlerin kaçışlanması (`"Ayşe"`) değişir; imza tutmaz. Webhook ucunda
gövde **bayt olarak** okunur, imza doğrulanır, **sonra** çözülür.

Node'da sabit zamanlı karşılaştırmanın bir tuzağı var: uzunluklar farklıysa hata fırlatır.

```js calistir
import assert from 'node:assert/strict'
import { createHmac, timingSafeEqual } from 'node:crypto'

const gizli = 'whsec_ornek_gizli_anahtar_32_bayt!!'
const ham = '{"id":"ev_1","tutar":15000}'
const imza = createHmac('sha256', gizli).update(ham).digest('hex')

// YANLIŞ: uzunluk farklıysa timingSafeEqual HATA FIRLATIR → yakalanmazsa 500 → gönderen durmadan yeniden dener
assert.throws(() => timingSafeEqual(Buffer.from('kisa'), Buffer.from(imza)), {
  code: 'ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH',
})

// DOĞRU: önce uzunluk, sonra sabit zamanlı karşılaştırma; gövde HAM metin olarak okunur
function imzaGecerli(hamGovde, gelen) {
  const beklenen = Buffer.from(createHmac('sha256', gizli).update(hamGovde).digest('hex'))
  const verilen = Buffer.from(String(gelen ?? ''))
  return verilen.length === beklenen.length && timingSafeEqual(verilen, beklenen)
}
assert.equal(imzaGecerli(ham, imza), true)
assert.equal(imzaGecerli(ham, 'kisa'), false)
assert.equal(imzaGecerli(ham, undefined), false)
assert.equal(imzaGecerli(JSON.stringify(JSON.parse(ham), null, 1), imza), false) // yeniden yazılmış gövde
console.log('tamam')
```

```cikti
tamam
```

## Alma: hızlı yanıt, kuyruk ve sıra

- İşleyici yalnız şunları yapar: imza → zaman → olay kimliğini ve ham gövdeyi kaydet (benzersizlik kısıtıyla) →
  kuyruğa iş koy → 200. Hepsi milisaniyeler sürer. Fatura kesme, e-posta, sağlayıcıya geri sorgu kuyrukta yapılır
  ([Arka plan işleri](arka-plan-isleri.md)).
- **Sıra garantisi yoktur.** "İptal" olayı "oluşturuldu"dan önce gelebilir. Çözüm: durum makinesi ve yalnız ileri
  geçişler ([Ödeme tümleştirme](odeme-tumlestirme.md)), ya da olaydaki zaman/sürüm alanına göre eskiyi yok sayma,
  ya da olayı yalnız "değişti" işareti sayıp güncel durumu sağlayıcının API'sinden çekme ("dürt, sonra çek").
- Ham gövdeyi bir süre saklamak hata ayıklamayı kolaylaştırır; kişisel veri içerir, saklama süresi koyun.
- Webhook ucuna hız sınırı koyarken sağlayıcının yeniden deneme fırtınasını kesmeyecek kadar geniş tutun;
  imzasız istekleri ucuzca reddetmek asıl korumadır.
- Yerel geliştirmede sağlayıcının komut satırı aracı ya da bir tünel webhook'u makinenize iletir; sınama ve canlı
  ortamın imza anahtarları ayrıdır.

## Gönderme: kendi uygulamanız olay yayınlıyorsa

| Konu              | Kural                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| İmza              | Her abone için ayrı gizli anahtar; `HMAC(gizli, zaman + "." + gövde)`; zaman ve imza başlıkta    |
| Anahtar döndürme  | Bir süre iki anahtarla birden imzalayın (başlıkta iki imza); abone yenisine geçince eskiyi kaldırın |
| Olay kimliği      | Her olayın değişmeyen kimliği; yeniden denemede **aynı** kimlik (alıcı yinelemeyi ayıklar)       |
| Zaman aşımı       | Bağlantı + yanıt toplam 5–10 sn; yavaş alıcı işçinizi tutmasın                                   |
| Başarı            | Yalnız 2xx; yönlendirmeyi izlemeyin (SSRF'e kapı açar)                                           |
| Yeniden deneme    | Üstel geri çekilme + titreme; ör. 1 dk, 5 dk, 30 dk, 2 sa, 8 sa, 24 sa; toplam bir-üç gün        |
| Sürekli başarısız | Uç devre dışı + aboneye e-posta; elle "yeniden gönder" düğmesi                                   |
| Sürümleme         | Olay gövdesinde `type` ve şema sürümü; kırıcı değişiklik yeni tür ya da yeni sürümle            |
| Gönderim kaydı    | Her deneme: zaman, durum kodu, süre; aboneye panelde gösterilir                                 |

Gönderim bir kuyruk işidir: olay, onu doğuran değişiklikle aynı işlemde giden kutusuna yazılır, işçi gönderir
([İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md)).

### SSRF: kullanıcının verdiği adrese istek atmak

Müşteri webhook adresi olarak `http://169.254.169.254/` (bulut meta veri servisi), `http://localhost:6379` ya da iç
ağdaki bir adresi yazarsa sunucunuz o iç servise istek atar: sunucu taraflı istek sahteciliği (SSRF). Önlem: yalnız
`https`, alan adının çözüldüğü **bütün** adresler herkese açık olmalı, bağlantı denetlenen adrese yapılmalı
(denetimden sonra DNS değişirse — DNS rebinding — başka adrese gidilmesin), yönlendirme izlenmemeli.

```python calistir
import ipaddress
from urllib.parse import urlsplit


def hedef_guvenli_mi(adres: str, cozulen_ipler: list[str]) -> bool:
    """`cozulen_ipler`: alan adının DNS'te çözüldüğü TÜM adresler (bağlantı bunlardan birine yapılacak)."""
    parca = urlsplit(adres)
    if parca.scheme != "https" or parca.username or parca.password:
        return False
    for metin in cozulen_ipler:
        ip = ipaddress.ip_address(metin)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped  # ::ffff:127.0.0.1 kılığı
        if not ip.is_global or ip.is_multicast:  # özel ağ, loopback, link-local (meta veri), ayrılmış
            return False
    return bool(cozulen_ipler)


assert hedef_guvenli_mi("https://kanca.musteri.example/olay", ["8.8.8.8"])
for ic in ["127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "fd00::1"]:
    assert not hedef_guvenli_mi("https://kotu.example/", [ic]), ic
assert not hedef_guvenli_mi("http://kanca.example/", ["8.8.8.8"])  # düz http
assert not hedef_guvenli_mi("https://kanca.example/", ["8.8.8.8", "10.0.0.5"])  # biri bile içeride
print("tamam")
```

```cikti
tamam
```

Bu denetim kayıt anında **ve** her gönderimde yapılır (DNS kaydı sonradan değişebilir). Mümkünse gönderimi iç ağa
erişimi olmayan ayrı bir çıkış vekilinden yapın.

## Tuzaklar

| Belirti                                                          | Neden                                                     | Çözüm                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| İmza her zaman tutmuyor                                          | Gövde çözülüp yeniden yazıldı; ya da yanlış ortamın anahtarı | Ham baytları kullanın; ortam anahtarını denetleyin        |
| Uç ara sıra 500 veriyor, sağlayıcı yeniden deniyor               | `timingSafeEqual` uzunluk farkında hata fırlattı          | Önce uzunluk denetimi                                        |
| Aynı ödeme için iki kez fatura kesildi                           | Olay kimliğiyle yineleme ayıklanmıyor                     | Olay kimliği tablosu (benzersizlik)                          |
| Sağlayıcı "uç sürekli başarısız" deyip bildirimleri durdurdu     | İşleyici ağır iş yapıyor, zaman aşımına uğruyor           | Kaydet + kuyruğa koy + hemen 200                             |
| Yinelenen olaya 409 dönüldü; sağlayıcı günlerce yeniden gönderdi | Yineleme hata sayıldı                                     | Yinelenene 200                                               |
| Yeni olay türü gelince uç kırıldı                                | Bilinmeyen tür 400/500 alıyor                             | Bilinmeyeni 200 ile yok sayın, günlüğe yazın                 |
| Eski bir imzalı istek tekrar gönderildi ve işlendi               | Zaman damgası denetlenmiyor                               | Tolerans penceresi + olay kimliği                            |
| "İptal" olayı siparişi açık bıraktı                              | Olaylar sırasız geldi, sonuncusu üstüne yazdı             | Durum makinesi / sürüm karşılaştırması / API'den çekme       |
| Sunucunuz iç servislere istek attı                               | Kullanıcı adresine denetimsiz istek (SSRF)                | `https` + IP denetimi + yönlendirme yok + çıkış vekili       |
| Yavaş bir abone bütün gönderim işçilerini kilitledi              | Zaman aşımı yok                                           | 5–10 sn zaman aşımı, abone başına eşzamanlılık sınırı        |

## Denetim listesi

- [ ] Gövde ham bayt olarak okunuyor; imza o baytlar üstünden, sabit zamanlı (uzunluk denetimli) doğrulanıyor.
- [ ] Zaman damgası toleransı var; olay kimliği benzersizlik kısıtıyla saklanıyor.
- [ ] Yinelenene ve bilinmeyen türe 200; işleyici kaydedip kuyruğa koyup hemen dönüyor.
- [ ] Sıra varsayımı yok: durum makinesi ya da güncel durumu sağlayıcıdan çekme.
- [ ] İmza anahtarı ortama özel, sırlarda; sınama ve canlı ayrı.
- [ ] (Gönderen) abone başına anahtar, olay kimliği, zaman aşımı, geri çekilmeli yeniden deneme, devre dışı bırakma.
- [ ] (Gönderen) kullanıcı adreslerine SSRF denetimi; yönlendirme izlenmiyor.
- [ ] Olay şeması sürümlü ve belgeli.

## Küçük modele yaptırırken

- **İsteme yazın:** "Webhook ucunda gövdeyi ham bayt olarak oku; imzayı sağlayıcının belgesindeki şemaya göre o
  baytlar üstünden HMAC-SHA256 ile hesapla, uzunluğu denetleyip sabit zamanlı karşılaştır. Zaman damgası 5 dk'dan
  eskiyse reddet. Olay kimliğini benzersiz sakla; yinelenene 200 dön. İşi kuyruğa koy, hemen 200 dön."
- **Tipik hatalar:** `express.json()` sonrası `JSON.stringify(req.body)` ile imza hesaplamak; `===` ile imza
  karşılaştırmak; `timingSafeEqual`'ı uzunluk denetimsiz çağırmak; yinelenen olaya 4xx dönmek; işleyicide e-posta
  göndermek; gönderen tarafta zaman aşımı koymamak; kullanıcı adresine körü körüne `fetch` atmak.
- **Çıktıda arayın:** `JSON.stringify(req.body)`, `== signature`, `timingSafeEqual(` çevresinde uzunluk denetimi,
  işleyicide `await` edilen ağır işler, gönderen kodda `redirect: 'follow'` ve IP denetimi.
- **Test isteyin:** "değiştirilmiş gövde 401", "bir saat önceki imza 400", "aynı olay iki kez → yan etki bir kez",
  "10.0.0.5'e çözülen adrese gönderim reddedilir".

## İlgili

- [Ödeme tümleştirme](odeme-tumlestirme.md) · [Arka plan işleri](arka-plan-isleri.md) ·
  [API tasarımı](api-tasarimi.md) (idempotentlik) · [Yapılandırma ve sırlar](yapilandirma-ve-sirlar.md)
  (anahtar döndürme) · [E-posta ve bildirim](e-posta-ve-bildirim.md) (geri dönen e-posta webhookları)
- HMAC ve sabit zamanlı karşılaştırma yardımcıları (Python + TypeScript, ortak sınama vektörleriyle):
  [`kutuphane/py/kutuphane/kripto.py`](../../kutuphane/py/kutuphane/kripto.py); yeniden deneme:
  [`yeniden_dene.py`](../../kutuphane/py/kutuphane/yeniden_dene.py).
