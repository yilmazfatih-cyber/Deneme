---
baslik: Lansman
ozet: Yayın öncesi denetim listesi (ürün, ölçüm, destek, yasal, yedek), yumuşak lansman ve kademeli açılış, duyuru kanalları ve metni, ilk hafta izleme, geri dönüş planı ve geri bildirim toplama.
etiketler: [urun, lansman, yayin, izleme, geri-donus]
duzey: temel
guncellik: 2026-11
---

# Lansman

> Bu notu ne zaman okumalı: bir ürünü ya da büyük bir özelliği ilk kez kullanıcılara açmadan önce; duyuru
> planlarken; yayından sonraki ilk haftada.

## Temel fikir

Lansman bir gün değil, bir **süreçtir**: kapalı deneme → yumuşak lansman (az kişi, sessiz) → genel duyuru. Her adım bir
sonrakinin riskini küçültür. Yayın öncesi listenin amacı, ilk gerçek kullanıcıların tek seferlik iyi niyetini teknik
hatalarla harcamamaktır.

Genel duyuru, ürün **değer verdiğini gösterdikten** sonra yapılır: aktivasyon ve tutma tutmuyorsa büyük duyuru kovaya
su doldurur ([ölçüm ve öğrenme](olcum-ve-ogrenme.md)). **Geri dönüş planı** önceden yazılır: neyin ters gidebileceği,
hangi işarette geri alınacağı, kararı kimin vereceği. İlk hafta günlük kısa bir bakış yapılır, küçük düzeltmeler
hızlıca çıkar, büyük değişiklik yapılmaz.

## Karar tablosu: lansman biçimi

| Durum                                             | Biçim                                                                   | Neden                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| İlk sürüm                                         | Kapalı deneme: davetle 5–20 kişi                                        | Hatalar güvenli ortamda bulunur                 |
| Ürün çalışıyor, yük ve destek ihtiyacı bilinmiyor | Yumuşak lansman: sessiz açılış, tek kanal, partiler hâlinde davet        | Kapasite sınanır                                |
| Riskli değişiklik (ödeme, veri göçü, yeni eşitleme) | Kademeli açılış: özellik bayrağı (feature flag) ile %5 → %25 → %100  | Sorun küçükken yakalanır; geri alması kolay     |
| Ürün hazır, tutma görüldü                         | Genel duyuru: e-posta listesi, topluluk, sosyal medya, basın            | Gelen trafik değere dönüşebilir                 |
| Mağaza uygulaması                                 | Önce kapalı test kanalı, sonra kademeli yayın ([mobil ve mağaza](mobil-ve-magaza.md)) | Mağazada geri alma zor ve yavaş |
| Var olan kullanıcılara büyük değişiklik           | Önceden duyuru + isteğe bağlı erken geçiş + bir süre eski yola dönüş     | Alışkanlık bozulur                              |

Takvim: destek veremeyeceğiniz günlerin (hafta sonu, bayram arifesi, kendi izniniz) hemen öncesinde açılış yapmayın.

## Yayın öncesi denetim listesi

| Alan       | Madde                                                                                           | Engel mi |
| ---------- | ----------------------------------------------------------------------------------------------- | -------- |
| Ürün       | Çekirdek akış uçtan uca testte geçiyor; iki gerçek telefonda (iOS ve Android) elle denendi       | Evet     |
| Ürün       | Boş, hata ve yükleniyor hâlleri; 404 sayfası; hesap silme ve veri indirme (gerekiyorsa)          | Evet     |
| Ürün       | Dış servis sınırları (e-posta gönderim kotası, API kotası) beklenen yüke yetiyor                 | Evet     |
| Ölçüm      | Çekirdek olaylar canlıda gerçek bir hesapla geliyor; iç kullanıcılar ayrılıyor                  | Evet     |
| Ölçüm      | Hata izleme açık; uyarı kime gidiyor belli; lansman öncesi taban sayıları not edildi            | Hayır    |
| Destek     | Destek kanalı, yanıt süresi sözü, hazır yanıtlar ([geri bildirim ve destek](geri-bildirim-ve-destek.md)), SSS | Evet |
| Yasal      | Aydınlatma, gizlilik, çerez, kullanım koşulları yayında; köşeli ayraç ve şablon uyarısı kalmadı ([yasal](yasal-temel-belgeler.md)) | Evet |
| Yasal      | Satış varsa ön bilgilendirme, mesafeli satış, iade; fatura akışı denendi                       | Evet     |
| Yedek      | Yedek alınıyor ve **geri yükleme provası yapıldı**                                              | Evet     |
| Yedek      | Geri dönüş adımları yazılı (önceki sürüme dönüş; veri göçü geri alınabilir mi)                  | Evet     |
| Altyapı    | Alan adı ve TLS yenilemesi otomatik ya da takvimde; sırlar depoda değil                          | Evet     |
| İletişim   | Duyuru metni, ekran görüntüleri, kısa video; tanıtım sayfası güncel ve tek çağrılı               | Hayır    |

"Engel" maddelerinin her biri **kanıtla** işaretlenir (komut çıktısı, ekran görüntüsü, tarihli not). Kanıtsız işaret
yapılmamış sayılır:

```python calistir
# (madde, alan, engel mi, yapıldı mı, kanıt) — Sedir v0.1 yumuşak lansman, kurgusal
checklist = [
    ("Çekirdek akış uçtan uca testte geçiyor", "ürün", True, True, "npm run e2e çıktısı"),
    ("İki gerçek telefonda elle denendi", "ürün", True, True, "iOS + Android notu"),
    ("Olaylar canlıda gerçek hesapla geliyor", "ölçüm", True, True, "olay listesi ekran görüntüsü"),
    ("Destek kanalı ve hazır yanıtlar", "destek", True, True, "destek@ adresi denendi"),
    ("Yasal metinler dolduruldu, şablon uyarısı kalktı", "yasal", True, True, "'[' araması boş"),
    ("Yedekten geri yükleme provası", "yedek", True, False, ""),
    ("Geri dönüş adımları yazılı", "yedek", True, True, "YAYINLAMA.md §geri dönüş"),
    ("Durum sayfası", "destek", False, False, ""),
    ("Tanıtım videosu", "iletişim", False, False, ""),
]


def gate(items) -> tuple[str, list[str], list[str]]:
    blockers = [name for name, _, blocker, done, proof in items if blocker and not (done and proof)]
    warnings = [name for name, _, blocker, done, _ in items if not blocker and not done]
    return ("ERTELE" if blockers else "YAYINLA"), blockers, warnings


decision, blockers, warnings = gate(checklist)
assert decision == "ERTELE" and blockers == ["Yedekten geri yükleme provası"]
print(decision, "→", "; ".join(blockers))

fixed = [(n, a, b, True, "prova 2026-12-18, 4 dk") if n.startswith("Yedekten") else (n, a, b, d, p)
         for n, a, b, d, p in checklist]
decision, blockers, warnings = gate(fixed)
assert decision == "YAYINLA"
print(decision, f"({len(warnings)} uyarı: {', '.join(warnings)})")
```

```cikti
ERTELE → Yedekten geri yükleme provası
YAYINLA (2 uyarı: Durum sayfası, Tanıtım videosu)
```

Yayın ve yedek ayrıntıları havuzdaki temellerde: [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md)
(Docker, ters vekil, yedek), [`site/docs/YAYINLAMA.md`](../../site/docs/YAYINLAMA.md). Yöntem notları:
[yayın yolu seçimi](../60-devops/yayin-yolu-secimi.md), [veritabanı yedekleme](../60-devops/veritabani-yedekleme.md)
(geri yükleme tatbikatı), [izleme ve uyarı](../60-devops/izleme-ve-uyari.md) (sağlık denetimi, uyarı eşiği).

## Yumuşak lansman ve kademeli açılış

- **Partiler hâlinde davet:** bekleme listesinden günde 10–20 kişi; destek kapasitesine göre artırılır.
- **Özellik bayrağı:** kod yayındadır ama yalnız seçilen gruba açıktır; kapatmak yeni yayın gerektirmez. Bayrak yoksa
  önceki sürüme dönüş komutu denenmiş olmalıdır.
- **Kademeli açılışta izlenen üç sayı:** hata oranı, çekirdek akışın başarı oranı, destek talebi sayısı. Eşik aşılırsa
  oran düşürülür ya da bayrak kapatılır; neden bulunmadan yeniden açılmaz.

## Duyuru kanalları ve metin

| Kanal                               | Ne zaman                  | Hazırlık                                                   | Dikkat                                      |
| ----------------------------------- | ------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| Erken erişim listesi (e-posta)      | İlk                       | Kişisel ve kısa: ne değişti, ilk adım, yardım yolu         | Onay ve ret yolu ([içerik ve büyüme](icerik-ve-buyume.md)) |
| Topluluklar ve dernekler            | Yumuşak lansmandan sonra  | Katkı biçiminde; yöneticiden izin                          | Reklam algısı                               |
| Kendi sosyal medya hesaplarınız     | Genel duyuru              | Kısa video, gerçek kullanım, ekran görüntüsü               | —                                           |
| Lansman siteleri ve forumlar        | Genel duyuru              | Hikâye, ekip; ilk yorumlara gün içinde yanıt               | Tek günlük trafik; tutma yoksa iz kalmaz    |
| Basın ve bloglar                    | Anlatacak hikâye varsa    | Kısa basın bülteni, görseller, iletişim kişisi             | Doğrulanabilir iddialar                     |
| Ortaklar (dernek, danışman, tedarikçi) | Hazır olduğunda        | Ortağa özel bağlantı ya da kupon                           | Ortağın çıkarı yazılı                       |

```text
Konu: Sedir açıldı: randevularınızı bağlantıyla alın                       (kurgusal)

Merhaba Gülay Hanım,
Erken erişim listemize yazıldığınız için teşekkürler. Sedir bugün açıldı.
Ne yapar: Müşterileriniz bağlantınızdan boş saati seçip randevu alır; siz telefonda değil işinizde olursunuz.
İlk adım (10 dakika): [Hesabınızı açın] → hizmetlerinizi yazın → bağlantınızı Instagram profilinize ekleyin.
İlk ay ücretsiz; sonrasında İşletme paketi aylık 349 TL + KDV. İstediğiniz ay iptal edebilirsiniz.
Takılırsanız bu e-postayı yanıtlayın; iş günlerinde aynı gün dönüyoruz.
Ayşe, Sedir

Bu e-postayı erken erişim listemize kaydolduğunuz için aldınız. [Listeden çıkın]
```

## İlk hafta izleme

Her gün aynı saatte beş sayıya bakın: yeni kayıt, kısa pencereli aktivasyon, çekirdek akış hata oranı, destek talebi
sayısı ve konuları, (varsa) ödeme. Eşikleri lansmandan **önce** yazın. Lansman haftasında yedi günlük aktivasyon henüz
olgunlaşmamıştır; günlük bakışta "aynı gün kurulumu bitiren" gibi kısa pencereli bir öncü ölçüt kullanın.

```python calistir
# İlk hafta günlük bakış: eşikler lansmandan ÖNCE yazıldı (kurgusal)
THRESHOLDS = {"hata_orani": 0.02, "aktivasyon": 0.30, "destek_talebi": 15}
days = [
    {"gun": 1, "kayit": 40, "hata_orani": 0.004, "aktivasyon": 0.42, "destek_talebi": 6},
    {"gun": 2, "kayit": 55, "hata_orani": 0.006, "aktivasyon": 0.38, "destek_talebi": 9},
    {"gun": 3, "kayit": 61, "hata_orani": 0.041, "aktivasyon": 0.22, "destek_talebi": 21},
]


def alarms(day: dict) -> list[str]:
    found = []
    if day["hata_orani"] > THRESHOLDS["hata_orani"]:
        found.append(f"hata %{100 * day['hata_orani']:.1f}")
    if day["aktivasyon"] < THRESHOLDS["aktivasyon"]:
        found.append(f"aktivasyon %{100 * day['aktivasyon']:.0f}")
    if day["destek_talebi"] > THRESHOLDS["destek_talebi"]:
        found.append(f"destek {day['destek_talebi']}")
    return found


for day in days:
    found = alarms(day)
    print(f"gün {day['gun']}: " + ("tamam" if not found else "İNCELE → " + ", ".join(found)))
assert alarms(days[2]) and not alarms(days[0])
```

```cikti
gün 1: tamam
gün 2: tamam
gün 3: İNCELE → hata %4.1, aktivasyon %22, destek 21
```

Üç alarm birlikte çaldığında ortak bir neden aranır (3. günün yayını, bir dış servisin kesintisi): önce son değişiklik
geri alınır, sonra neden aranır ([hata ayıklama](../00-yontem/hata-ayiklama.md)). Sızıntı ya da hesap ele geçirme
şüphesi ayrı bir yoldur: [olay müdahalesi](../50-guvenlik/olay-mudahalesi.md).

## Geri bildirim toplama

- Her yeni kullanıcıya ilk gün kişisel bir e-posta: "Takıldığınız bir yer oldu mu? Bu e-postayı yanıtlamanız yeter."
- Aktivasyondan sonra ürün içinde tek soruluk anket; ilk hafta içinde 5 kullanıcıyla 20 dakikalık görüşme.
- Bilinen sorunlar listesi; düzeldiğinde bildirene haber ("Bildirdiğiniz sorun düzeldi, teşekkürler"). Bu, ilk
  kullanıcıların güvenini en ucuz kazanma yoludur.
- İlk hafta yalnız hata düzeltilir; yeni istekler istek defterine yazılır ([önceliklendirme](onceliklendirme.md)).

## Tuzaklar

| Belirti                                                       | Neden                                                 | Çözüm                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Duyuru günü kayıt e-postaları gitmedi                         | Gönderim kotası ve yük denenmedi                      | Yumuşak lansman; kotayı önceden yükseltin; partiler hâlinde davet        |
| Yedek vardı ama geri yüklenemedi                              | Geri yükleme hiç denenmemişti                         | Yayın öncesi geri yükleme provası; süresini not edin                     |
| İlk gün gelen yüzlerce kişiden kimse kalmadı                  | Tutma görülmeden genel duyuru yapıldı                 | Önce yumuşak lansman; aktivasyon ve tutma görülünce duyuru              |
| Destek e-postaları günlerce yanıtsız                          | Destek planı ve nöbet yok                             | Yanıt süresi sözü, nöbet, hazır yanıtlar                                 |
| Yayından sonra olayların hiç gelmediği anlaşıldı              | Ölçüm canlıda denenmedi                               | Gerçek hesapla uçtan uca olay denetimi listede engel                     |
| Sorunlu özelliği kapatmak için yeni yayın gerekti             | Bayrak ya da hazır dönüş adımı yok                    | Bayrak ya da denenmiş dönüş komutu                                       |
| İlk hafta ekip her isteğe koştu, hatalar birikti              | Kapsam disiplini bırakıldı                            | İlk hafta yalnız hata; istekler deftere                                  |
| Yasal metinde "[Şirket unvanı]" yayında                       | Yasal maddeler engel sayılmadı                        | Köşeli ayraç araması ve şablon uyarısı listede engel                     |
| Mağaza reddi duyuru tarihini kaçırdı                          | İnceleme süresi ve kuralları hesaba katılmadı         | Duyuru tarihini mağaza onayından sonraya koyun                           |
| Bayram arifesinde açılış, kimse destek veremedi               | Takvim düşünülmedi                                    | Destek verilebilecek bir hafta içi sabahı seçin                          |

## Denetim listesi

- [ ] Engel maddelerinin hepsi kanıtla işaretli (uçtan uca test, gerçek telefon, olaylar, destek, yasal, geri yükleme).
- [ ] Geri dönüş planı yazılı ve denenmiş; kararı kimin vereceği belli.
- [ ] Yumuşak lansman yapıldı; aktivasyon ve tutma genel duyurudan önce görüldü.
- [ ] Duyuru metni tek çağrılı, doğrulanabilir iddialı; ticari iletide onay ve ret yolu var.
- [ ] İlk hafta bakış ölçütleri ve alarm eşikleri lansmandan önce yazıldı.
- [ ] İlk hafta yalnız hata düzeltiliyor; istekler deftere yazılıyor.
- [ ] İlk kullanıcılardan en az beşiyle görüşme planlandı.
- [ ] Bilinen sorunlar listesi tutuluyor; düzelince bildirene haber veriliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu lansman listesini projemize göre doldur. Her madde için 'nasıl doğrulanır' sütunu ekle (komut
  ya da elle adım). Doğrulayamadığın maddeyi 'denenmedi' diye bırak; tamamlanmış sayma."
- **Duyuru metni için:** "Kısa, kişisel, tek çağrılı yaz; ne değiştiğini, ilk adımı ve yardım yolunu söyle. Üstünlük
  sıfatı ve doğrulanmamış rakam kullanma. Sonuna listeden çıkma bağlantısı koy."
- **Modelin tipik hatası:** maddeleri kanıtsız "tamam" sayar; geri dönüş planını "gerekirse geri alırız" diye yazar;
  duyuruya abartılı sıfatlar koyar; ret yolunu unutur; eşikleri sonuçlara bakarak sonradan koyar.
- **Çıktıda denetleyin:** her engel maddesinin kanıtı; geri dönüş adımlarının komut düzeyinde yazılı olması; duyuru
  metnindeki her rakamın kaynağı.

## İlgili

- [Geri bildirim ve destek](geri-bildirim-ve-destek.md): destek kanalı, yanıt şablonları, etiketleme.
- [Geliştirme döngüsü ve kalite kapıları](gelistirme-dongusu-ve-kapilar.md): yayına gelen işin geçtiği kapılar.
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md): aktivasyon, tutma, karar kuralı.
- [Yasal temel belgeler](yasal-temel-belgeler.md) ve [içerik ve büyüme](icerik-ve-buyume.md).
- [Mobil ve mağaza](mobil-ve-magaza.md): mağaza incelemesi ve kademeli yayın.
- [Yayın yolu seçimi](../60-devops/yayin-yolu-secimi.md): nereye ve nasıl yayınlanacağı.
