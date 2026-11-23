---
baslik: "Önizleme ortamları: her değişiklik için deneme adresi"
ozet: Değişiklik isteği başına kısa ömürlü önizleme ortamı; ne zaman değer, tohumlu sahte veri, sırları ve alan adını üretimden ayırma, dış geri çağrılar, erişim, maliyet sınırı ve sahipsiz ortam temizliği; çalışan örneklerle.
etiketler: [onizleme, ci-cd, ortam, tohum-veri, maliyet, devops]
duzey: orta
guncellik: 2026-11
---

# Önizleme ortamları: her değişiklik için deneme adresi

> Bu notu ne zaman okumalı: "değişikliği birleştirmeden önce telefonumda görmek istiyorum" dendiğinde; her değişiklik
> isteği (PR) için otomatik bir deneme adresi kurulurken; önizlemelerden biri gerçek kullanıcıya e-posta attığında
> ya da fatura beklenmedik büyüdüğünde. Durağan sitelerin hazır PR önizlemesi [Durağan site yayını](duragan-site-yayini.md)
> notundadır; bu not veritabanlı uygulamayı anlatır.

## Temel fikir

- Önizleme ortamı = değişikliğin **kodu**, **kendi verisi**, **kendi adresi** ve **kısa bir ömür**. Programcı
  olmayan ürün sahibi için ana inceleme aracıdır: bağlantıyı telefonda açar, değişikliği dener, yorum yazar.
- Üç şeyi üretimden **tamamen** ayrıdır: veri (tohumlu sahte veri, üretim kopyası asla), sırlar (kendi dar yetkili
  anahtarları), alan adı (üretimin alt alan adı değil, ayrı bir alan adı).
- PR'daki kod önizlemenin sırlarıyla çalışır: önizleme sırrı da gerçek bir sırdır; dar yetkili ve döndürülebilir olur,
  dışarıdan gelen (çatal) PR'lara verilmez.
- Her önizleme para ve dikkat ister: sayı sınırı, boşta uyuma, kapanan PR'da silme ve sahipsiz kalanları süpüren
  gece işi baştan kurulur.

## Karar tablosu: hangi düzen

| Durum                                                     | Seçim                                              | Neden                                                     |
| --------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Tek geliştirici, değişiklikler küçük                      | Yerel çalıştırma + ekran görüntüsü                 | Altyapı yükü gereksiz                                     |
| Durağan site                                              | Barındırıcının hazır PR önizlemesi                 | Ücretsiz ya da ucuz, kendiliğinden                        |
| Programcı olmayan biri her değişikliği telefonda görmeli  | PR başına önizleme                                 | İnceleme dönüşü hızlanır                                  |
| Sık değişiklik, kısıtlı bütçe                             | Tek ortak deneme (staging) ortamı + sıra           | Ucuz; ama iki PR aynı anda denenemez                      |
| Göç ya da veri hacmi riski                                | Önizlemeye **ek olarak** üretime benzer deneme ortamı | Önizlemenin küçük tohum verisi büyük veri sorunlarını göstermez |
| Dış geri çağrı (OAuth, ödeme webhook'u) zorunlu           | Sabit adresli tek deneme ortamı ya da sahte sağlayıcı | Dinamik adresler sağlayıcıya tek tek tanıtılamaz          |

Önizleme ile deneme ortamı farklıdır: önizleme **değişiklik başına**, kısa ömürlü ve sahte veriyle; deneme ortamı
**uzun ömürlü**, üretimle aynı ayarda, yayından önceki son kapıdır ([Ortam ve yapılandırma](ortam-ve-yapilandirma.md)).

## Yaşam döngüsü

1. **PR açıldı ya da güncellendi:** imaj derlenir, ortam `pr-<numara>` adıyla açılır (ya da güncellenir).
2. **Hazırlık:** boş veritabanına bütün migrasyonlar, sonra tohum verisi; ortam denetleyicisi (aşağıda) geçmezse dur.
3. **Duman testi:** sağlık ucu, giriş, bir kayıt yaz-oku.
4. **Haber:** adres PR'a yorum olarak yazılır (tek yorum güncellenir, her güncellemede yeni yorum değil).
5. **PR kapandı ya da birleşti:** ortam, verisi ve sırları silinir.
6. **Her gece:** sahipsiz kalanları süpüren temizlik işi (aşağıda).

Kendi sunucunuzda kuracaksanız: PR başına ayrı compose projesi (`docker compose -p pr-15 …`), önünde alt alan adına
göre yönlendiren vekil ve joker sertifika (joker sertifika ACME'de DNS doğrulaması ister: [HTTPS ve
sertifikalar](https-ve-sertifikalar.md)). Bazı barındırıcılar PR önizlemesini hazır sunar; adı, sınırı ve fiyatı
platforma göre değişir (doğrulanmadı).

## Tohumlu sahte veri

Önizlemeye üretim verisi kopyalanmaz: kişisel veri taşımaktır ([KVKK pratiği](../50-guvenlik/kvkk-pratik.md)).
Tohum verisi **belirlenimci** olur (aynı tohum → aynı veri; ekran görüntüleri ve hatalar her önizlemede aynı yerde)
ve uç durumları **bilerek** içerir:

```python calistir
import hashlib
import json
import random
from datetime import date, timedelta

ADLAR = ["Ayşe", "İsmail", "Işıl", "Çağrı", "Gülşen", "Ömer", "Şule", "Ümit"]
SOYADLAR = ["Yılmaz", "Öztürk", "Çelik", "Doğan", "Işık", "Güneş"]
ISLER = ["Kira öde", "Faturayı yatır", "İlaç al", "Toplantı notu", "Çocuğu okuldan al"]


def tohumla(tohum: int, bugun: date) -> dict:
    rng = random.Random(tohum)
    kullanicilar = [{"id": f"u{i}", "ad": f"{rng.choice(ADLAR)} {rng.choice(SOYADLAR)}",
                     "eposta": f"deneme{i}@ornek.com"} for i in range(1, 4)]  # ayrılmış alan: gerçek kişiye gitmez
    gorevler = [{"id": f"g{i}", "sahip": rng.choice(kullanicilar)["id"], "baslik": rng.choice(ISLER),
                 "son_tarih": (bugun + timedelta(days=rng.randint(-5, 10))).isoformat()} for i in range(1, 601)]
    gorevler += [  # uç durumlar rastgeleliğe bırakılmaz
        {"id": "uzun", "sahip": "u1", "baslik": "Ç" * 200, "son_tarih": None},  # en uzun başlık, tarihsiz
        {"id": "buyuk-harf", "sahip": "u1", "baslik": "İSTANBUL ILIK ÇIĞ", "son_tarih": bugun.isoformat()},
    ]
    return {"kullanicilar": kullanicilar, "gorevler": gorevler, "bos_liste": []}


def ozet(veri: dict) -> str:
    return hashlib.sha256(json.dumps(veri, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


GUN = date(2026, 11, 23)  # "bugün" de sabit: tarihe bağlı ekranlar da her seferinde aynı
a, b, c = tohumla(42, GUN), tohumla(42, GUN), tohumla(7, GUN)
assert ozet(a) == ozet(b) != ozet(c)
assert len(a["gorevler"]) > 500  # havuzdaki eşitleme tek yanıtta 500 kayıt verir: "devamı var" yolu da sınanır
assert any(not g["son_tarih"] for g in a["gorevler"]) and any(len(g["baslik"]) == 200 for g in a["gorevler"])
print(f"aynı tohum iki koşuda aynı veriyi verdi; {len(a['gorevler'])} görev, uç durumlar dahil")
```

```cikti
aynı tohum iki koşuda aynı veriyi verdi; 602 görev, uç durumlar dahil
```

- Uç durum listesi: Türkçe harfler (İ/ı), en uzun alan, boş liste, tarihsiz kayıt, sayfalamayı tetikleyecek kadar
  kayıt, geçmiş ve gelecek tarih, iki kullanıcının ortak alanı.
- E-posta adresleri ayrılmış alan adlarında (`ornek.com`, `example.com`) olur; gerçek bir adrese e-posta gitmez.
- Havuzdaki `npm run seed` bir deneme kullanıcısı ile örnek liste ve görevleri **gerçek eşitleme koduyla** yazar
  ([`api/scripts/seed.ts`](../../uygulama/api/scripts/seed.ts)); kimlikleri zamana dayalı olduğu için her koşuda
  farklıdır. Ekran görüntüsü karşılaştırması gerekiyorsa sabit kimlikli bir tohum eklenir.

## Sırları ve adları üretimden ayırmak

| Kaynak                         | Önizlemede ne kullanılır                                              | Neden                                                        |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Alan adı                       | **Ayrı** alan adı: `pr-15.ornek-onizleme.dev`                          | Üretimin alt alan adı çerez, CORS ve CSP kurallarına karışır |
| Veritabanı                     | Önizleme başına boş veritabanı + tohum                                | Üretim verisi kişisel veridir; PR kodu güvenilmezdir         |
| E-posta                        | Gönderilmez (havuzda `MAIL_PROVIDER=console`: `mail_outbox` tablosuna) | Gerçek kişiye e-posta gitmesin                               |
| Ödeme, SMS, dış API            | Sağlayıcının sınama anahtarı ya da sahte sunucu                        | Canlı anahtarla PR kodu gerçek işlem yapar                   |
| Sırlar                         | Önizlemeye özel, dar yetkili, döndürülebilir                           | PR kodu bu sırları okuyabilir                                |
| Çatal (fork) PR                | Sır yok; ya sahte servislerle ya da bir bakımcının onayından sonra    | Dışarıdan gelen kod sırları sızdırabilir ([CI/CD](ci-cd.md))   |
| Arama motorları                | Erişim koruması (parola ya da platform koruması) + `X-Robots-Tag: noindex` | Yarım özellik dizine girmesin                            |

**Çerez tuzağı:** önizleme `pr-15.ornek.com` gibi üretimin alt alan adındaysa, üretimin `Domain=ornek.com` ile
yazdığı çerezler önizlemeye de gider ve PR'daki kod onları okuyabilir; önizleme de üretime çerez yazabilir. Havuzdaki
oturum çerezi `__Host-` önekli olduğu için alana yayılmaz ([`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md));
yine de önizlemeyi ayrı bir alan adında tutun: başka çerezler, CORS izin listesi ve OAuth ayarları da aynı sorunu
taşır ([Oturum güvenliği](../50-guvenlik/oturum-guvenligi.md), [CSRF ve CORS](../50-guvenlik/csrf-ve-cors.md)).

Önizleme açılmadan önce ayarları denetleyen küçük bir kapı, "üretim ayarını kopyalayıp düzenledim" hatasını yakalar:

```python calistir
from urllib.parse import urlsplit

URETIM_ALANI, ONIZLEME_ALANI = "ornek.com", "ornek-onizleme.dev"  # önizleme AYRI bir alan adında


def denetle(ortam: dict[str, str]) -> list[str]:
    """Önizleme açılmadan önce: üretimin adı, sırrı ya da verisi buraya sızmış mı?"""
    sorun = []
    ana = urlsplit(ortam.get("APP_URL", "")).hostname or ""
    if not ana.endswith("." + ONIZLEME_ALANI):
        sorun.append(f"APP_URL önizleme alanında değil ({ana}): e-posta bağlantıları ve çerezler üretime karışır")
    if ortam.get("MAIL_PROVIDER", "console") != "console":
        sorun.append("e-posta gerçekten gönderilecek: önizlemede console (gönderilmez, tabloya yazılır)")
    if any(deger.startswith("canli_") for deger in ortam.values()):
        sorun.append("canlı (üretim) anahtarı var: önizlemenin kendi sınama anahtarı olmalı")
    if URETIM_ALANI in ortam.get("DATABASE_URL", "") or ortam.get("DATABASE_PATH", "").startswith("/srv/uretim"):
        sorun.append("üretim veritabanına bağlanıyor")
    return sorun


yanlis = {"APP_URL": "https://pr-15.ornek.com", "MAIL_PROVIDER": "http", "MAIL_HTTP_KEY": "canli_7f3a",
          "DATABASE_PATH": "/srv/uretim/uygulama.db"}  # üretim ayarı kopyalanıp düzenlenmiş
dogru = {"APP_URL": "https://pr-15.ornek-onizleme.dev", "MAIL_PROVIDER": "console",
         "DATABASE_PATH": "/data/pr-15/uygulama.db"}
assert denetle(dogru) == []
for sorun in denetle(yanlis):
    print("REDDEDİLDİ:", sorun)
```

```cikti
REDDEDİLDİ: APP_URL önizleme alanında değil (pr-15.ornek.com): e-posta bağlantıları ve çerezler üretime karışır
REDDEDİLDİ: e-posta gerçekten gönderilecek: önizlemede console (gönderilmez, tabloya yazılır)
REDDEDİLDİ: canlı (üretim) anahtarı var: önizlemenin kendi sınama anahtarı olmalı
REDDEDİLDİ: üretim veritabanına bağlanıyor
```

`canli_` öneki örnektir: sağlayıcınızın canlı ve sınama anahtarlarını nasıl ayırdığına bakın (önek, hesap kimliği).
Havuzdaki sunucu da üretim ayarlarını açılışta denetler; bu kapı önizlemeye özgü kuralları ekler.

## Dış geri çağrılar: OAuth ve webhook

Sağlayıcılar geri çağrı adresini çoğu zaman önceden kayıtlı ister; her PR'ın adresi farklıdır.

| Seçenek                                                    | Ne zaman                                         |
| ---------------------------------------------------------- | ------------------------------------------------ |
| Önizlemede sahte sağlayıcı (giriş ve ödeme taklidi)        | Çoğu değişiklik; dış akışın kendisi değişmiyorsa |
| Sabit adresli tek deneme ortamı, gerçek sınama hesabıyla   | Dış akış değişiyorsa; sırayla denenir            |
| Sabit bir geçit adresi, isteği PR'a göre yönlendirir       | Çok sayıda PR dış akışa dokunuyorsa; kurulumu zor |
| Sağlayıcının joker geri çağrı izni (varsa)                 | Sağlayıcı izin veriyorsa; güvenlik bedelini tartın |

Sahte sağlayıcı fikri ve sözleşme testi: [Dış API istemcisi](../30-arkauc/dis-api-istemcisi.md).

## Maliyet ve temizlik

- **Sınırlar:** aynı anda en çok N önizleme (en eskisi durur); boşta uyuma; önizleme başına küçük kaynak (SQLite
  dosyası ucuzdur, önizleme başına ayrı Postgres sunucusu pahalıdır).
- **Etiket:** her kaynak (kapsayıcı, birim, veritabanı, DNS kaydı, sertifika) PR numarasıyla etiketlenir; silme işi
  etiketten bulur. Etiketsiz kaynak sahipsiz kalır.
- **Silme iki yoldan:** PR kapanınca anında ve her gece süpürücüyle (kapanma olayı kaçabilir). Süpürücü yalnız
  `pr-<numara>` adlarına dokunur ve tur başına sınırlıdır: PR listesi hatayla boş gelirse her şeyi silmesin.

```python calistir
import re
from datetime import datetime, timedelta

SIMDI = datetime(2026, 11, 23, 3, 0)
ORTAMLAR = [  # barındırıcıdan alınan liste: ad, son dağıtım
    ("pr-12", datetime(2026, 11, 22, 18, 0)), ("pr-13", datetime(2026, 11, 20, 9, 0)),
    ("pr-15", datetime(2026, 11, 12, 9, 0)), ("deneme", datetime(2026, 10, 1, 9, 0)),
    ("uretim", datetime(2026, 11, 22, 9, 0)),
]
AD = re.compile(r"^pr-(\d+)$")  # yalnız bu biçimdeki adlar silinebilir
BOSTA_EN_COK, TUR_BASINA_EN_COK = timedelta(days=7), 2


def temizlik_plani(ortamlar: list, acik_pr: set[int], simdi: datetime) -> list[tuple[str, str]]:
    plan = []
    for ad, son in ortamlar:
        eslesme = AD.match(ad)
        if not eslesme:
            continue  # üretim, deneme ve elle açılmış ortamlara ASLA dokunma
        if int(eslesme.group(1)) not in acik_pr:
            plan.append((ad, "PR kapandı"))
        elif simdi - son > BOSTA_EN_COK:
            plan.append((ad, f"{(simdi - son).days} gündür dağıtım yok"))
    if len(plan) > TUR_BASINA_EN_COK:  # beklenmedik toplu silme: dur, insana sor
        raise RuntimeError(f"{len(plan)} ortam silinecekti (tur sınırı {TUR_BASINA_EN_COK}); PR listesi yanlış olabilir")
    return plan


for ad, neden in temizlik_plani(ORTAMLAR, {12, 15}, SIMDI):
    print(f"sil {ad}: {neden}")
try:
    temizlik_plani(ORTAMLAR, set(), SIMDI)  # PR listesi alınamadı, boş geldi
except RuntimeError as hata:
    print("DURDU:", hata)
```

```cikti
sil pr-13: PR kapandı
sil pr-15: 10 gündür dağıtım yok
DURDU: 3 ortam silinecekti (tur sınırı 2); PR listesi yanlış olabilir
```

Süpürücü ilk haftalarda yalnız **plan yazar** (silmez); doğru çalıştığı görülünce silmeye başlar. Önizleme sayısı ve
aylık tutar panoda durur; bütçe uyarısı kurulur ([Barındırma maliyeti ve kaynak](maliyet-ve-kaynak.md)).

## Tuzaklar

| Belirti                                                       | Neden                                                       | Çözüm                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Önizleme gerçek müşterilere e-posta attı                      | Üretim e-posta ayarı ve üretim verisinin kopyası            | `console` e-posta; tohumlu sahte veri; ayar kapısı            |
| Önizlemedeki PR kodu üretim oturum çerezini okudu             | Önizleme üretimin alt alan adındaydı                        | Ayrı alan adı; üretimde `__Host-` çerezi                      |
| Çatal PR'dan gelen kod önizleme anahtarlarını dışarı yolladı  | Dışarıdan gelen PR'a sır verildi                            | Çatal PR'da sır yok ya da bakımcı onayı                       |
| Önizlemede ödeme gerçekten çekildi                            | Canlı ödeme anahtarı kopyalandı                             | Sınama anahtarı; kapıda canlı anahtar reddi                   |
| Ay sonunda fatura beş katı                                    | Kapanan PR'ların ortamları silinmedi                        | Kapanışta silme + gece süpürücüsü + sayı sınırı               |
| Süpürücü bir gece bütün ortamları sildi                       | PR listesi hatayla boş geldi; ad süzgeci yoktu              | Ad kalıbı, tur sınırı, önce yalnız plan                       |
| Önizlemede her şey yolunda, yayında göç saatlerce sürdü       | Tohum verisi küçük; büyük veri sorunu görünmedi             | Üretim boyutunda sentetik veriyle ayrı deneme ortamı          |
| Önizleme adresi arama sonuçlarında çıktı                      | Erişim koruması ve `noindex` yok                            | Parola/platform koruması + `X-Robots-Tag: noindex`            |
| "Bende çalışıyor" ama önizlemede bozuk                        | Önizleme migrasyonları her seferinde baştan koşmuyor        | Boş veritabanı + bütün migrasyonlar + tohum her dağıtımda     |
| OAuth girişi önizlemede "geçersiz yönlendirme" diyor          | Dinamik adres sağlayıcıda kayıtlı değil                     | Sahte sağlayıcı ya da sabit adresli deneme ortamı             |

## Denetim listesi

- [ ] Önizleme PR açılınca kuruluyor, güncellenince yenileniyor, kapanınca siliniyor; adres PR'a tek yorumla yazılıyor.
- [ ] Önizleme ayrı bir alan adında; erişim korumalı; `noindex` başlığı var.
- [ ] Veritabanı her dağıtımda boş + bütün migrasyonlar + tohumlu sahte veri; üretim verisi yok.
- [ ] Tohum belirlenimci ve uç durumları içeriyor.
- [ ] E-posta gönderilmiyor; ödeme ve dış servisler sınama anahtarıyla ya da sahte.
- [ ] Önizleme sırları dar yetkili, üretimden ayrı; çatal PR'lara verilmiyor.
- [ ] Ayar kapısı açılıştan önce koşuyor (alan adı, e-posta, canlı anahtar, üretim veritabanı).
- [ ] Önizleme sayısı sınırlı; boşta uyuma var; gece süpürücüsü ad kalıbı ve tur sınırıyla çalışıyor.
- [ ] Kaynaklar PR numarasıyla etiketli; aylık tutar ve önizleme sayısı izleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her PR için `pr-<numara>.ornek-onizleme.dev` adresinde bir önizleme kur: boş veritabanı, bütün
  migrasyonlar, `tohum 42` ile sahte veri, `MAIL_PROVIDER=console`, ödeme için sınama anahtarı. Açmadan önce ayar
  kapısını çalıştır. PR kapanınca bütün kaynakları sil; ayrıca gece çalışan, yalnız `pr-\d+` adlarına dokunan, tur
  başına en çok 2 silme yapan ve ilk hafta yalnız plan yazan bir süpürücü yaz. Çatal PR'larda sır kullanma."
- **Modelin tipik hatası:** önizlemeyi üretimin alt alan adına koyar; "gerçekçi olsun" diye üretim veritabanının
  kopyasını önerir; üretim `.env`'ini kopyalayıp birkaç satırını değiştirir; `pull_request_target` ile çatal PR'a
  sır verir; silmeyi yalnız PR kapanma olayına bağlar; süpürücüyü ad süzgeci ve sınır olmadan yazar.
- **Çıktıda arayın:** `APP_URL` ve çerez alanı; e-posta sağlayıcı ayarı; sır kaynakları ve hangi olayda verildikleri;
  silme işinde ad kalıbı ve tur sınırı; tohumun sabit olup olmadığı.

## İlgili

- [CI/CD](ci-cd.md) (tetikleyiciler, çatal PR ve sırlar) · [Ortam ve yapılandırma](ortam-ve-yapilandirma.md) (ortamlar
  arası fark) · [Durağan site yayını](duragan-site-yayini.md) (hazır PR önizlemesi)
- [Barındırma maliyeti ve kaynak](maliyet-ve-kaynak.md) · [Sır yönetimi](../50-guvenlik/sir-yonetimi.md) ·
  [KVKK pratiği](../50-guvenlik/kvkk-pratik.md) (üretim verisinin kopyası)
- [Uygulama yayın tarifi](uygulama-yayin-tarifi.md) · [Dış API istemcisi](../30-arkauc/dis-api-istemcisi.md) (sahte
  sağlayıcı) · Havuzda: [`uygulama/api/scripts/seed.ts`](../../uygulama/api/scripts/seed.ts),
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ortam değişkenleri"
