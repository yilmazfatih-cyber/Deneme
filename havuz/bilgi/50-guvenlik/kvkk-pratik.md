---
baslik: KVKK pratiği: veriyle çalışan geliştiricinin denetim listesi
ozet: Kişisel veriyle çalışan geliştirici için pratik liste: veri envanteri (kodla denetlenen), amaç ve en az veri, açık rıza ile aydınlatma farkı, saklama ve silme, yurt dışı aktarım soruları, çalışan erişimi ve başvurular.
etiketler: [guvenlik, kvkk, kisisel-veri, gizlilik, saklama]
duzey: temel
guncellik: 2026-11
---

# KVKK pratiği: veriyle çalışan geliştiricinin denetim listesi

> Bu notu ne zaman okumalı: bir forma yeni alan, veritabanına kişisel veri taşıyan sütun, yeni bir dış hizmet
> (e-posta, analitik, hata izleme, yapay zekâ API'si) eklenirken; veri silme, dışa aktarma ya da yedekleme
> yazılırken; "bu veriyi tutabilir miyiz?" sorusu sorulduğunda.

> **Hukuki danışmanlık değildir.** 6698 sayılı Kanun, yönetmelikler ve Kurul kararları değişir; aşağıdaki hukuki
> bilgiler genel çerçevedir ve doğrulanmamıştır. Güncel metin için kvkk.gov.tr; karar için bir hukukçu.
> Veri biliminde uygulama (maskeleme, sentetik veri): [`veri/docs/KVKK_NOTLARI.md`](../../veri/docs/KVKK_NOTLARI.md).

## Temel fikir

Geliştiricinin KVKK'daki işi hukuki metin yazmak değil, **sistemin söylenene uymasını sağlamaktır**:

1. **Ne tutuyoruz?** Her kişisel veri alanı bir envanterde; envanterde olmayan sütun yok.
2. **Neden ve ne kadar?** Her alanın amacı, hukuki sebebi ve saklama süresi var; süre dolunca **gerçekten** siliniyor.
3. **Kim görüyor, nereye gidiyor?** Erişim dar; dış hizmetlere (özellikle yurt dışına) giden veri biliniyor.
4. **Kişi sorarsa:** verisini verebiliyor, düzeltebiliyor, silebiliyoruz.
5. **Sızarsa:** kimin hangi verisinin etkilendiğini bulabiliyoruz ([Olay müdahalesi](olay-mudahalesi.md)).

Kişisel veri, kimliği belirli ya da belirlenebilir kişiye ilişkin her bilgidir: ad, e-posta, telefon, IP adresi,
cihaz kimliği, konum, satın alma geçmişi. Tek başına tanımlamayan alanlar birleşince tanımlar. Özetlenmiş ya da
takma adlı veri de çoğu durumda kişisel veri olarak kalır ([Kriptografi kullanımı](kriptografi-kullanimi.md)).

## Karar tablosu: en az veri

| İhtiyaç                        | Çoğu zaman fazla toplanan               | Yeterli olan                                        |
| ------------------------------ | --------------------------------------- | --------------------------------------------------- |
| Yaş sınırı                     | Tam doğum tarihi                        | "18 yaşından büyüğüm" onayı ya da doğum yılı        |
| Fatura                         | Herkesten T.C. kimlik no                | Yalnız fatura isteyenden, yalnız fatura için        |
| Konuma göre içerik             | Kesin GPS                               | İl/ilçe                                             |
| İletişim                       | Telefon + e-posta + adres               | İşin gerektirdiği tek kanal                         |
| Kullanım analizi               | Kullanıcı kimliğiyle her tıklama         | Toplu sayımlar, kısa saklama                        |
| Hata izleme                    | İstek gövdesi, form değerleri           | Hata kodu, istek kimliği, kullanıcı kimliği         |
| Destek                         | Ekranın tam görüntüsü                   | Kullanıcının gönderdiği, maskeli görüntü            |
| Test ve geliştirme             | Üretim verisinin kopyası                | Sentetik veri (`veri` temelindeki üreteç)           |

Kural: alanın **amacını tek cümleyle** yazamıyorsanız toplamayın. Özel nitelikli veri (sağlık, biyometrik, din,
etnik köken, siyasi görüş, ceza mahkûmiyeti…) için şartlar çok daha sıkıdır; mümkünse hiç toplamayın.

## Veri envanteri: kodla denetlenen

Envanter bir belgede kalırsa şemadan kopar. Envanteri veri olarak tutup **veritabanı şemasıyla karşılaştıran** bir
kural testi, yeni eklenen sütunu ("doğum tarihi de alalım") envantere girmeye zorlar:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, password_hash TEXT, birth_date TEXT);
CREATE TABLE audit_log (id INTEGER PRIMARY KEY, actor_id TEXT, ip TEXT, action TEXT, created_at TEXT);
""")

TR = "TR barındırıcı"
ENVANTER = {
    "users.id": {"kisisel": False},
    "users.email": {"kisisel": True, "amac": "giriş ve bildirim", "sebep": "sözleşmenin ifası", "saklama": "hesap silinene dek", "yer": TR},
    "users.name": {"kisisel": True, "amac": "arayüzde hitap", "sebep": "sözleşmenin ifası", "saklama": "hesap silinene dek", "yer": TR},
    "users.password_hash": {"kisisel": True, "amac": "kimlik doğrulama", "sebep": "sözleşmenin ifası", "saklama": "hesap silinene dek", "yer": TR},
    "audit_log.id": {"kisisel": False},
    "audit_log.actor_id": {"kisisel": True, "amac": "güvenlik denetimi", "sebep": "meşru menfaat", "saklama": "180 gün", "yer": TR},
    "audit_log.ip": {"kisisel": True, "amac": "güvenlik denetimi", "sebep": "meşru menfaat", "saklama": "180 gün", "yer": "yurt dışı (günlük hizmeti)"},
    "audit_log.action": {"kisisel": False},
    "audit_log.created_at": {"kisisel": False},
}


def envanter_denetle(db: sqlite3.Connection, envanter: dict[str, dict]) -> list[str]:
    tablolar = [ad for (ad,) in db.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")]
    sutunlar = {f"{t}.{s[1]}" for t in tablolar for s in db.execute(f"PRAGMA table_info({t})")}  # ad şemadan
    sorunlar = [f"{s}: envanterde yok (neden topluyoruz?)" for s in sorted(sutunlar - envanter.keys())]
    for sutun, bilgi in sorted(envanter.items()):
        if not bilgi["kisisel"]:
            continue
        eksik = [alan for alan in ("amac", "sebep", "saklama", "yer") if not bilgi.get(alan)]
        if eksik:
            sorunlar.append(f"{sutun}: eksik bilgi: {', '.join(eksik)}")
        if bilgi.get("yer", "").startswith("yurt dışı"):
            sorunlar.append(f"{sutun}: yurt dışına gidiyor; aktarım dayanağı kayıtlı mı?")
    return sorunlar


for sorun in envanter_denetle(db, ENVANTER):
    print(sorun)
```

```cikti
users.birth_date: envanterde yok (neden topluyoruz?)
audit_log.ip: yurt dışına gidiyor; aktarım dayanağı kayıtlı mı?
```

Bu testi projenin `check` adımına koyun: şemaya kişisel veri ekleyen her değişiklik envanteri de güncellemek
zorunda kalır. Envanter aynı zamanda aydınlatma metninin ve "verilerimi istiyorum" yanıtının kaynağıdır.

## Aydınlatma ile açık rıza (genel)

| Konu         | Aydınlatma                                                                 | Açık rıza                                                                         |
| ------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Nedir        | Kişiyi bilgilendirmek: kim, hangi amaçla, kime aktararak, hangi sebeple işliyor; kişinin hakları | Belirli bir konuya ilişkin, bilgilendirmeye dayanan, özgür iradeyle verilen onay |
| Ne zaman     | Veri toplanırken **her zaman**                                             | Kanundaki başka bir işleme şartı yoksa (ör. sözleşmenin ifası, hukuki yükümlülük, meşru menfaat) |
| Arayüzde     | Ayrı, okunur metin; kayıt formunda bağlantı                                 | Ayrı, önceden işaretlenmemiş onay kutusu; hizmet şartına bağlanmamış               |
| Geri alma    | —                                                                          | Her zaman geri alınabilir; geri alınca o işleme durur                              |
| Yaygın hata  | Aydınlatmayı "okudum, kabul ediyorum" kutusuna çevirmek                     | Her işleme rıza istemek; rızayı hizmetin ön şartı yapmak; tek kutuyla her şeye rıza |

Geliştirici için sonuç: rıza bir **veri**dir. Hangi kişi, hangi metin sürümüne, ne zaman, hangi kanaldan rıza
verdi ya da geri aldı; kayıt altında tutulur ve rıza geri alınınca ilgili işleme (ör. pazarlama e-postası)
koddan durur. Zorunlu olmayan çerezler ve pazarlama iletileri için ayrıca kurallar vardır (Kurul'un çerez rehberi
ve ticari elektronik ileti mevzuatı; doğrulanmadı).

## Saklama ve silme

Her veri türünün süresi yazılı olur ve bir bakım işi uygular. Havuzdaki uygulamanın süreleri:
oturumlar süre dolunca, sıfırlama belirteçleri 1 gün, davetler 30 gün, denetim kayıtları 180 gün; hesap silinince
kişisel veriler hemen silinir ([`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "Veri yaşam
döngüsü", bakım işi [`maintenance.ts`](../../uygulama/api/src/maintenance.ts)).

Silme işinin kendisi test edilmelidir; sessizce hiçbir şey silmeyen iş yıllarca fark edilmez:

```sql calistir
CREATE TABLE denetim (id INTEGER PRIMARY KEY, zaman TEXT NOT NULL);  -- zamanlar ISO 8601, UTC: 2026-05-20T05:00:00Z
INSERT INTO denetim (zaman) VALUES ('2026-05-20T05:00:00Z'), ('2026-05-20T13:00:00Z'), ('2026-11-01T00:00:00Z');
-- YANLIŞ: datetime() "2026-05-20 12:00:00" (boşluklu) döndürür; 'T'li metinle karşılaştırma aynı günü kaçırır
SELECT 'yanlış', COUNT(*) FROM denetim WHERE zaman < datetime('2026-11-16T12:00:00Z', '-180 days');
-- DOĞRU: sınır da aynı biçimde üretilir
SELECT 'doğru', COUNT(*) FROM denetim WHERE zaman < strftime('%Y-%m-%dT%H:%M:%SZ', '2026-11-16T12:00:00Z', '-180 days');
```

```cikti
yanlış|0
doğru|1
```

- **Yedekler:** silinen kişi yedekte kalır. Yedek saklama süresini yazın ("silinen veri en geç N gün sonra
  yedeklerden de çıkar") ve yedekten geri dönüşte silinmiş hesapların yeniden silinmesini sağlayın
  ([Yedek ve fidye yazılımı](yedek-ve-fidye-yazilimi.md)).
- **Türev kopyalar:** arama dizini, önbellek, analitik tablosu, dışa aktarılmış dosyalar, e-posta sağlayıcısındaki
  kayıtlar da silme kapsamındadır; envanterde "yer" sütunu bu yüzden vardır.
- **Anonimleştirme** silmenin yerine geçebilir ama gerçekten geri döndürülemez olmalıdır; kimliği özetlemek ya da
  takma ad vermek anonimleştirme değildir.

## Yurt dışı aktarım: soru işareti listesi

Küçük bir uygulama bile farkında olmadan yurt dışına veri gönderir. Her dış hizmet için envantere şunları yazın:

| Hizmet türü                          | Hangi veri gidiyor                       | Azaltma                                                    |
| ------------------------------------ | ---------------------------------------- | ---------------------------------------------------------- |
| Barındırma / bulut, yedek alanı      | Her şey                                  | Bölge seçimi; şifreli yedek                                |
| E-posta gönderim sağlayıcısı         | E-posta adresi, ileti içeriği            | İçerikte gereksiz kişisel veri yok                         |
| Hata izleme, günlük toplama          | IP, kullanıcı kimliği, hata bağlamı      | Gövde ve kişisel alan gönderilmez; maskeleme               |
| Analitik                             | Cihaz, davranış                          | Toplu ve kısa ömürlü; gerekmiyorsa hiç                     |
| Yapay zekâ API'si                    | İstemdeki her şey                        | Göndermeden maskeleme ([`yz/yz/guvenlik/maske.py`](../../yz/yz/guvenlik/maske.py)); yerel model seçeneği |
| Destek / sohbet aracı                | Kullanıcının yazdıkları                  | Kullanıcıyı bilgilendirin                                  |

Kanunun yurt dışı aktarım maddesi 2024'te değiştirildi (yeterlilik, uygun güvenceler, standart sözleşme gibi
yollar); hangi hizmet için hangi dayanağın gerektiği **hukuki bir sorudur**, doğrulanmadı. Geliştiricinin işi
listeyi eksiksiz çıkarmak ve gönderilen veriyi en aza indirmektir.

## Çalışan erişimi

- Üretim veritabanına doğrudan erişim birkaç kişide; her erişim kişisel hesapla ve kayıt altında.
- Destek ekranları maskeli gösterir (`a***@ornek.com`); tam veri yalnız gerekçeyle ve denetim kaydıyla açılır
  (maskeleme yardımcıları: [`kutuphane/py/kutuphane/maske.py`](../../kutuphane/py/kutuphane/maske.py)).
- Üretim verisinin kopyası geliştirici makinesine inmez; test için sentetik veri.
- Ayrılan çalışanın erişimleri aynı gün kapanır; ortak hesap ve paylaşılan parola yoktur ([Sır yönetimi](sir-yonetimi.md)).

## İlgili kişi başvuruları

Kişi verisinin işlenip işlenmediğini öğrenme, verisini isteme, düzeltme, silme gibi haklara sahiptir; başvuruya
yasal süre içinde (genel kural 30 gün olarak bilinir, doğrulanmadı) cevap verilir. Geliştirici tarafı:

- **Dışa aktarma:** kişinin bütün verisini makinece okunur biçimde veren bir uç (havuzda `GET /api/account/export`).
- **Silme:** hesabı ve türev kopyaları silen bir uç (havuzda `DELETE /api/account`, yeniden parola ister).
- **Kimlik doğrulama:** başvuranın gerçekten o kişi olduğu doğrulanır; yoksa başvuru başkasının verisini sızdırır.
- Uçların belgesi: [`uygulama/docs/API.md`](../../uygulama/docs/API.md).

## Tuzaklar

| Belirti                                                         | Neden                                                    | Çözüm                                                             |
| --------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Kimse bir sütunun neden tutulduğunu bilmiyor                    | Envanter yok ya da şemadan koptu                         | Kodla denetlenen envanter                                         |
| Süresi dolan kayıtlar silinmiyor, kimse fark etmiyor            | Silme işinde tarih biçimi/saat dilimi hatası; test yok   | Aynı biçimde sınır; silme işinin testi                            |
| Silinen kullanıcının verisi aramada çıkıyor                     | Arama dizini ve önbellek silme kapsamı dışında            | Envanterdeki her "yer" için silme adımı                           |
| Hata izleme aracında kullanıcıların form değerleri duruyor       | Varsayılan ayar istek gövdesini gönderiyor               | Gövde gönderimini kapatın; maskeleme                              |
| Pazarlama e-postası rızayı geri alan kişiye gitmeye devam ediyor | Rıza kaydı gönderim koduna bağlı değil                   | Gönderimden önce rıza tablosu denetimi                            |
| "Anonim" veri setinde kişiler tanındı                           | Özetleme/takma ad anonimleştirme sanıldı                 | Toplulaştırma, alan atma; şüphede kişisel veri sayın             |
| Yapay zekâ API'sine müşteri kayıtları olduğu gibi gönderildi     | Aktarım envantere girmemişti                              | Maskeleme; envanter; gerekirse yerel model                        |
| Başvuru e-postasıyla başkasının verisi gönderildi               | Başvuranın kimliği doğrulanmadı                          | Oturum açmış kullanıcıya ya da doğrulanmış kanala yanıt          |

## Denetim listesi

- [ ] Her kişisel veri sütununun amacı, hukuki sebebi, saklama süresi ve yeri envanterde; şema ile envanter testle
      eşleşiyor.
- [ ] Toplanan her alan "en az veri" sorusundan geçti; özel nitelikli veri yok ya da gerekçesi yazılı.
- [ ] Aydınlatma metni var ve envanterle tutarlı; açık rıza gerekiyorsa ayrı, geri alınabilir ve kayıtlı.
- [ ] Saklama süreleri bakım işiyle uygulanıyor; silme işinin testi var; yedek ve türev kopyalar kapsamda.
- [ ] Dış hizmetler (barındırma, e-posta, hata izleme, analitik, yapay zekâ) ve giden veri listelendi; yurt dışı
      aktarım için hukuki görüş alındı.
- [ ] Günlüklerde ve hata izlemede kişisel veri en aza indirildi.
- [ ] Çalışan erişimi kişisel hesaplarla, dar ve kayıtlı; üretim verisi geliştirmede kullanılmıyor.
- [ ] Dışa aktarma ve silme uçları var; başvuran kimliği doğrulanıyor.
- [ ] İhlal anında kimin hangi verisinin etkilendiği bulunabiliyor ([Olay müdahalesi](olay-mudahalesi.md)).

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni kişisel veri alanı ekliyorsan envantere amacını, hukuki sebebini (seçenek listesinden),
  saklama süresini ve yerini yaz; envanter testi geçmeli. Bu alanı günlüğe ve hata izlemeye gönderme. Silme ve
  dışa aktarma uçlarını da güncelle."
- **Modelin tipik hatası:** "ileride lazım olur" diye fazladan alan eklemek; hukuki sebebi uydurmak ya da kesin
  hukuki hüküm vermek; silme işinde türev kopyaları (dizin, önbellek) unutmak; dışa aktarmaya yeni alanı
  eklememek; test verisi için gerçek görünen kişi bilgisi üretmek yerine üretim verisini kopyalamayı önermek.
- **Çıktıda denetleyin:** yeni sütunlar envanterde mi; günlük satırlarında yeni alan geçiyor mu; silme ucu yeni
  tabloyu kapsıyor mu; modelin yazdığı hukuki cümleler "doğrulanmadı" diye işaretli mi.
- **Test isteyin:** envanter testi; "hesap silinince yeni tablodaki satırlar da silinir"; "dışa aktarma yeni alanı
  içerir"; saklama işinin sınır testi.

## İlgili

- Veri işleme tarafı (maskeleme, sentetik veri, profil): [`veri/docs/KVKK_NOTLARI.md`](../../veri/docs/KVKK_NOTLARI.md)
- [Günlük ve izleme](gunluk-ve-izleme-guvenlik.md) (saklama ödünleşimi) · [Kriptografi kullanımı](kriptografi-kullanimi.md)
  (özet ≠ anonim) · [YZ uygulama güvenliği](yapay-zeka-uygulama-guvenligi.md) (modele giden veri)
- Çalışan kod: [`uygulama/api/src/maintenance.ts`](../../uygulama/api/src/maintenance.ts) (saklama süreleri),
  [`uygulama/docs/API.md`](../../uygulama/docs/API.md) (dışa aktarma ve hesap silme)
