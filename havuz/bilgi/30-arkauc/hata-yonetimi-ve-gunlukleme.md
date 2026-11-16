---
baslik: Hata yönetimi ve günlükleme: merkezi işleyici, yapılandırılmış günlük, uyarı
ozet: Beklenen ve beklenmeyen hatayı ayırmak, merkezi hata işleyici, istemciye iç ayrıntı sızdırmamak, istek kimlikli JSON günlük, günlük düzeyleri, asla yazılmaması gerekenler ve uyarıya dönüşecek sinyaller.
etiketler: [hata, gunluk, izleme, guvenlik, api]
duzey: orta
guncellik: 2026-11
---

# Hata yönetimi ve günlükleme: merkezi işleyici, yapılandırılmış günlük, uyarı

> Bu notu ne zaman okumalı: yeni bir uç ya da iş yazarken hatanın nasıl döneceğine karar verirken; kullanıcı "bir
> hata oldu" deyip hiçbir iz bulunamadığında; günlükte parola, belirteç ya da kişisel veri görüldüğünde; uyarılar
> ya hiç gelmediğinde ya da durmadan geldiğinde.

## Temel fikir

İki tür hata vardır ve ikisi bambaşka ele alınır:

- **Beklenen hata** sözleşmenin parçasıdır: doğrulama, oturum yok, yetki yok, bulunamadı, çakışma, hız sınırı.
  Doğru durum kodu ve makinece okunur bir kodla döner; günlükte gürültü yapmaz, uyarı üretmez.
- **Beklenmeyen hata** bir kusurdur ya da altyapı sorunudur: yakalanmamış istisna, veritabanı yanıt vermiyor. İstemci
  yalnız "beklenmeyen sorun + istek kimliği" görür; ayrıntı (yığın izi) **yalnız günlüğe** gider ve oranı artarsa
  uyarı çalar.

Bu ayrım **tek bir merkezi hata işleyicide** yapılır: uçlar yalnız `throw new AppError('kod')` yazar; gerisini
işleyici yapar. Günlükler tek satırlık JSON'dur ve her satır istek kimliğini taşır; böylece kullanıcının
gönderdiği kimlikle o isteğin bütün izi bulunur.

## Karar tablosu

| Durum                                       | HTTP | Günlük                           | Uyarı                       |
| ------------------------------------------- | ---- | -------------------------------- | --------------------------- |
| Doğrulama hatası                            | 400  | Yok (erişim satırı yeter)        | Hayır                       |
| Oturum yok / düşmüş                         | 401  | Yok                              | Hayır                       |
| Yetki yok                                   | 403  | Güvenlik olayıysa denetim günlüğü | Ani artışta                 |
| Bulunamadı                                  | 404  | Yok                              | Hayır                       |
| Çakışma                                     | 409  | Yok                              | Hayır                       |
| Hız sınırı                                  | 429  | `info`                           | Ani artışta (saldırı)       |
| Dış servis geçici hatası, yeniden denenecek | —    | `warn`                           | Oran eşiği aşılırsa         |
| Yakalanmamış istisna                        | 500  | `error` + yığın izi              | Oran eşiği aşılırsa         |
| Veritabanı/bağımlılık ayakta değil          | 503  | `error`                          | **Hemen**                   |

Beklenen hataları `error` düzeyinde günlüğe yazmak en sık hatadır: gerçek hatalar gürültüde kaybolur ve uyarılar
yok sayılmaya başlar.

## Merkezi hata işleyici ve yapılandırılmış günlük

```python calistir
import contextvars
import io
import json
import logging
import traceback
import uuid

istek_kimligi = contextvars.ContextVar("istek_kimligi", default="-")
IZINLI_ALANLAR = {"kullanici_id", "rota", "durum", "sure_ms", "is_adi"}  # izin listesi: gerisi yazılmaz


class JsonBicim(logging.Formatter):
    def format(self, kayit: logging.LogRecord) -> str:
        satir = {"zaman": self.formatTime(kayit, "%Y-%m-%dT%H:%M:%S"), "duzey": kayit.levelname.lower(),
                 "ileti": kayit.msg, "istek_kimligi": istek_kimligi.get()}
        satir |= {k: v for k, v in getattr(kayit, "alanlar", {}).items() if k in IZINLI_ALANLAR}
        if kayit.exc_info:
            satir["yigin"] = "".join(traceback.format_exception(*kayit.exc_info))
        return json.dumps(satir, ensure_ascii=False)  # yeni satır vb. kaçışlanır: sahte günlük satırı olmaz


cikti = io.StringIO()
isleyici = logging.StreamHandler(cikti)
isleyici.setFormatter(JsonBicim())
gunluk = logging.getLogger("api")
gunluk.addHandler(isleyici)
gunluk.setLevel(logging.INFO)


class UygulamaHatasi(Exception):  # beklenen hatalar: sözleşmenin parçası
    def __init__(self, kod: str, durum: int, ileti: str):
        super().__init__(kod)
        self.kod, self.durum, self.ileti = kod, durum, ileti


def isle(islev, *argumanlar) -> tuple[int, dict, dict]:
    """Merkezi hata işleyici: her uç bunun içinden çağrılır."""
    kimlik = uuid.uuid4().hex[:16]
    istek_kimligi.set(kimlik)
    basliklar = {"X-Request-Id": kimlik}
    try:
        return 200, islev(*argumanlar), basliklar
    except UygulamaHatasi as hata:  # beklenen: düzeyi düşük, yığın izi yok
        gunluk.info("istek reddedildi", extra={"alanlar": {"durum": hata.durum}})
        return hata.durum, {"error": {"code": hata.kod, "message": hata.ileti}}, basliklar
    except Exception:  # beklenmeyen: ayrıntı YALNIZ günlüğe
        gunluk.error("beklenmeyen hata", exc_info=True, extra={"alanlar": {"durum": 500}})
        ileti = "Beklenmeyen bir sorun oldu. Bu kodu destek ekibine iletin: " + kimlik
        return 500, {"error": {"code": "internal", "message": ileti}}, basliklar


def giris(eposta: str, parola: str) -> dict:
    if "@" not in eposta:
        raise UygulamaHatasi("validation", 400, "Geçerli bir e-posta yazın.")
    gunluk.info("giriş denemesi", extra={"alanlar": {"rota": "/api/giris", "eposta": eposta, "parola": parola}})
    raise RuntimeError(f"SELECT * FROM users WHERE email = '{eposta}' zaman aşımı")  # iç ayrıntı


durum, govde, _ = isle(giris, "yanlis", "x")
assert durum == 400 and govde["error"]["code"] == "validation"
durum, govde, basliklar = isle(giris, "ayse@ornek.com\n{\"duzey\": \"info\"}", "gizli-parola-123")
assert durum == 500 and "SELECT" not in json.dumps(govde)  # iç ayrıntı istemciye sızmadı
assert basliklar["X-Request-Id"] in govde["error"]["message"]
satirlar = [json.loads(s) for s in cikti.getvalue().splitlines()]  # her satır geçerli JSON (sahte satır yok)
assert all(s["istek_kimligi"] for s in satirlar)
assert "gizli-parola-123" not in cikti.getvalue() and "eposta" not in satirlar[1]  # izin listesi süzdü
assert satirlar[-1]["duzey"] == "error" and "RuntimeError" in satirlar[-1]["yigin"]
# DİKKAT: izin listesi alanları süzer, istisna İLETİSİNİ süzmez: iletiye konan e-posta yığın iziyle günlüğe düştü
assert "ayse@ornek.com" in satirlar[-1]["yigin"]
print(len(satirlar), "satır günlük; parola yok, e-posta yalnız istisna iletisinden sızdı")
```

```cikti
3 satır günlük; parola yok, e-posta yalnız istisna iletisinden sızdı
```

Örnekten çıkan kurallar:

- İstemciye giden 500 gövdesinde SQL, dosya yolu, kitaplık adı, yığın izi yoktur; istek kimliği vardır.
- Günlük alanları **izin listesiyle** seçilir (yasak listesi her yeni alanda unutulur).
- İleti sabit bir metindir (`"giriş denemesi"`), değişkenler alan olarak eklenir: aranabilir, sayılabilir, ve
  kullanıcı girdisindeki satır sonu sahte bir günlük satırı üretemez.
- **İstisna iletisine kişisel veri ya da sır koymayın**: alan süzgeci yığın izindeki metni görmez.

Havuzdaki karşılıkları: hata → HTTP çevirisi [`errors.ts`](../../uygulama/api/src/http/errors.ts), JSON günlükçü
[`logger.ts`](../../uygulama/api/src/lib/logger.ts), istek kimliği ve erişim satırı
[`requestLog.ts`](../../uygulama/api/src/http/requestLog.ts), hata kodları ve Türkçe iletiler
[`shared/src/errors.ts`](../../uygulama/shared/src/errors.ts).

## İlişkilendirme kimliği

- Her isteğe bir kimlik verilir ve yanıtta `X-Request-Id` başlığıyla döner. İstemci geçerli biçimde bir kimlik
  gönderdiyse o kullanılabilir; biçim denetlenmeden kabul edilmez (günlüğe zararlı metin enjeksiyonu).
- Kimlik isteğin bütün günlük satırlarında, kuyruğa konan işin verisinde ve dış servislere giden isteklerin
  başlığında taşınır: bir kullanıcı şikâyeti tek aramayla uçtan uca izlenir.
- Eşzamansız kodda kimliği küresel değişkende değil bağlamda tutun (Python `contextvars`, Node `AsyncLocalStorage`);
  yoksa aynı anda gelen istekler birbirinin kimliğini yazar.

## Günlük düzeyleri

| Düzey   | Ne yazılır                                                              | Üretimde |
| ------- | ----------------------------------------------------------------------- | -------- |
| `debug` | Geliştirme ayrıntısı, ara değerler                                      | Kapalı   |
| `info`  | İstek satırı, başlatma/kapanma, iş başladı/bitti, önemli iş olayları    | Açık     |
| `warn`  | Kendiliğinden düzelen ya da yeniden denenecek sorun, yanlış görünen ayar | Açık     |
| `error` | İnsan müdahalesi gerekebilecek hata (yığın iziyle)                      | Açık     |

Erişim günlüğünde adresin **kalıbı** yazılır (`/api/invites/:token`), gerçek adres değil: adreste belirteç olabilir.
Sorgu dizgisi yazılmaz (arama metni e-posta içerebilir). Havuzdaki sunucu ikisini de uygular.

## Asla günlüğe yazılmayanlar

| Veri                                                        | Neden                                              |
| ----------------------------------------------------------- | -------------------------------------------------- |
| Parola (yanlış girilenler dahil), parola özeti              | Yanlış parola çoğu zaman başka bir sitenin parolasıdır |
| Oturum çerezi, `Authorization` başlığı, API anahtarı, sıfırlama/davet belirteci | Günlüğü okuyan hesabı ele geçirir |
| Kart numarası, CVV, IBAN'ın tamamı                          | Ödeme uyumu ve dolandırıcılık                      |
| TC kimlik no, sağlık bilgisi, tam adres                     | Özel nitelikli kişisel veri (KVKK)                 |
| İstek/yanıt gövdesinin tamamı                               | Yukarıdakilerin hepsini taşıyabilir                |
| E-posta adresi (kullanıcı kimliği yeter)                    | Kişisel veri; arama için kullanıcı kimliğini yazın |

Günlükler de kişisel veri işlemedir: saklama süresi, erişim yetkisi ve silme kuralı belirleyin. Havuzdaki güvenlik
testi bütün akışlardan sonra günlükte parola, belirteç, çerez ve e-posta geçmediğini denetler
([`security.test.ts`](../../uygulama/api/test/security.test.ts)). Aynı testi kendi projenize kopyalayın.

## Uyarıya dönüşecek sinyaller

Uyarı **kullanıcıya etki eden belirtiye** kurulur ve her uyarının "ne yapılır" notu olur:

| Sinyal                                              | Neden önemli                                        |
| --------------------------------------------------- | --------------------------------------------------- |
| 5xx oranı (ör. 5 dakikada istek yüzdesi)            | Kullanıcılar hata görüyor                           |
| Yanıt süresinin yüksek yüzdelikleri (p95, p99)      | Ortalama, yavaşlayan azınlığı gizler                |
| Sağlık ucunun dışarıdan başarısızlığı               | Hizmet tümden kapalı                                |
| Kuyruk derinliği ve en eski işin yaşı, ölü mektuplar | İşler birikiyor ya da kayboluyor                   |
| Yayından sonra hata sıçraması                       | Geri alma kararı                                    |
| Başarısız giriş, 429 ve 403 sayısında ani artış     | Saldırı denemesi                                    |
| Disk doluluğu, sertifika bitiş tarihi, yedeğin yaşı | Sessizce yaklaşan felaket                           |
| Ödeme mutabakatı farkı, webhook hata oranı          | Para kaybı                                          |

Eşikleri birkaç haftalık gerçek veriye bakarak koyun; her yanlış alarm, gerçek alarmın yok sayılma olasılığını
artırır. Ölçüt, iz, hizmet düzeyi hedefi (SLO) ve uyarı tasarımının bütünü:
[Gözlemlenebilirlik](../40-sistem-tasarimi/gozlemlenebilirlik.md).

## Tuzaklar

| Belirti                                                          | Neden                                                 | Çözüm                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Kullanıcı ekranda SQL ya da dosya yolu gördü                     | İstisna iletisi yanıta konuldu                        | Merkezi işleyici; 500'de sabit ileti + istek kimliği        |
| "Bir hata oldu" bildirimi geldi, günlükte iz yok                 | İstek kimliği yok ya da istisna yutuldu               | `X-Request-Id`; boş `catch` yok                             |
| Günlük `error` dolu ama hepsi 404 ve doğrulama                   | Beklenen hatalar `error` düzeyinde                    | Beklenene düşük düzey ya da hiç                             |
| Uyarılar yok sayılıyor                                           | Gürültülü, eyleme dönüşmeyen uyarılar                 | Belirtiye dayalı, eşikli, "ne yapılır" notlu uyarılar       |
| Günlükte parola ya da belirteç görüldü                           | İstek gövdesi/başlıkları toptan yazıldı               | İzin listesi; günlük testi                                  |
| Günlükte e-posta, istisna iletisinden sızıyor                    | ``throw new Error(`… ${email}`)``                     | İstisna iletisine kişisel veri koymayın                     |
| Günlükte sahte satırlar                                          | Kullanıcı girdisi düz metin günlüğe satır sonuyla yazıldı | JSON günlük; ileti sabit, değişken alanlarda            |
| Aynı anda gelen isteklerin günlükleri karışıyor                  | İstek kimliği küresel değişkende                      | `contextvars` / `AsyncLocalStorage`                         |
| Hata 200 ile dönüyor, izleme bir şey görmüyor                    | `try/catch` hatayı yutup başarı döndürüyor            | Hata yukarı fırlatılsın; işleyici çevirsin                  |
| Geçici dış servis hatası kullanıcıya 500 olarak yansıyor         | Yeniden deneme ya da 503 ayrımı yok                   | Sınırlı yeniden deneme; bağımlılık yoksa 503 + `Retry-After` |

## Denetim listesi

- [ ] Uçlar yalnız tipli uygulama hatası fırlatıyor; HTTP'ye çeviri tek bir işleyicide.
- [ ] 500 yanıtında iç ayrıntı yok, istek kimliği var; Türkçe ileti suçlamıyor ve ne yapılacağını söylüyor.
- [ ] Her yanıtta `X-Request-Id`; kimlik işlere ve dış isteklere taşınıyor.
- [ ] Günlük tek satır JSON; ileti sabit, değişkenler alanlarda; alanlar izin listesinden.
- [ ] Beklenen hatalar `error` düzeyinde değil.
- [ ] Parola, belirteç, çerez, kart, kimlik no, gövde, e-posta günlükte yok; bunu denetleyen test var.
- [ ] İstisna iletilerinde kişisel veri yok.
- [ ] Boş `catch` yok; yakalanan her hata ya ele alınıyor ya da yeniden fırlatılıyor.
- [ ] 5xx oranı, gecikme yüzdelikleri, sağlık ucu ve kuyruk için uyarılar var; her uyarının yapılacaklar notu var.
- [ ] Günlük saklama süresi ve erişim yetkisi belirli.

## Küçük modele yaptırırken

- **İsteme yazın:** "Hataları `throw new AppError('kod')` ile fırlat; yanıta çevirme işini merkezi işleyiciye
  bırak. Günlüğe sabit ileti + alanlar yaz (`logger.info('…', { userId })`); parola, belirteç, e-posta, gövde
  yazma. İstisna iletisine kullanıcı verisi koyma."
- **Tipik hatalar:** her uçta ayrı `try/catch` ile `res.status(500).json({ error: err.message })`; `console.log(req.body)`;
  `catch (e) {}`; ileti içine şablon dizgisiyle değer gömmek; beklenen hataları `logger.error` ile yazmak.
- **Çıktıda arayın:** `err.message`'ın yanıta gittiği yerler, `console.log(` ve `logger.*(` çağrılarında `body`,
  `password`, `token`, `email`, `headers`; boş `catch`; `status(200)` ile birlikte `error`.
- **Test isteyin:** "beklenmeyen hatada yanıt iç ayrıntı içermez ve istek kimliği taşır", "bütün akıştan sonra
  günlükte parola/belirteç/e-posta yok".

## İlgili

- [API tasarımı](api-tasarimi.md) (hata gövdesi) · [HTTP temelleri](http-temelleri.md) (durum kodları) ·
  [Sunucu mimarisi](sunucu-mimarisi.md) (sağlık ucu, kapanış) · [Yapılandırma ve sırlar](yapilandirma-ve-sirlar.md)
  (`LOG_LEVEL`)
- Havuzdaki güvenlik belgesinin günlük bölümü: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) →
  "Günlük ve denetim".
- Günlükle hata bulma yöntemi: [Hata ayıklama](../00-yontem/hata-ayiklama.md).
