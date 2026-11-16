---
baslik: Çok kiracılık: paylaşımlı tablo, şema ve veritabanı başına kiracı
ozet: Birden çok müşterinin verisini tek sistemde tutmanın üç modeli ve seçimi; sorgu dışındaki yalıtım açıkları, gürültülü komşu ve adil kuyruk, kiracı başına sınırlar ve büyük kiracıyı ayırma; kural testi ve benzetimle.
etiketler: [cok-kiracili, yalitim, mimari, kota, gurultulu-komsu]
duzey: ileri
guncellik: 2026-11
---

# Çok kiracılık: paylaşımlı tablo, şema ve veritabanı başına kiracı

> Bu notu ne zaman okumalı: ürün şirketlere, okullara, ekiplere ya da ailelere "hesap" olarak satılacaksa;
> "A firmasının kullanıcısı B firmasının verisini gördü" riski konuşulurken; bir müşterinin toplu işi herkesi
> yavaşlattığında; büyük bir müşteri "verimiz ayrı dursun" dediğinde.

## Temel fikir

- **Kiracı** (tenant): verisi ötekilerden yalıtılması gereken müşteri birimi (şirket, okul, ekip, aile). Havuzdaki
  uygulamada kiracı "çalışma alanı"dır.
- Üç model vardır: **paylaşımlı tablo + kiracı sütunu**, **kiracı başına şema**, **kiracı başına veritabanı**.
  Yalıtım arttıkça işletme maliyeti (migrasyon, yedek, izleme × kiracı sayısı) artar.
- İki ana risk: **yalıtım açığı** (bir kiracının verisi ötekine görünür) ve **gürültülü komşu** (bir kiracının
  yükü ötekileri yavaşlatır).
- Kiracı kimliği yalnız SQL sorgusunda değil, **her katmanda** taşınır: önbellek anahtarı, arama dizini, kuyruk
  işi, dosya yolu, günlük, ölçüt, dışa aktarım.
- Sorgu düzeyindeki yalıtım kuralları (kiracı oturumdan gelir, sorguda koşul, 404, bileşik yabancı anahtar):
  [Yetkilendirme](../30-arkauc/yetkilendirme.md) → "Çok kiracılı yalıtım". Bu not mimari tarafı ele alır.

## Karar tablosu: hangi model

| Ölçüt                                   | Paylaşımlı tablo + kiracı sütunu      | Kiracı başına şema               | Kiracı başına veritabanı             |
| --------------------------------------- | ------------------------------------- | -------------------------------- | ------------------------------------ |
| Kiracı sayısı                           | Yüzlerce–milyonlarca                  | Onlarca–birkaç yüz               | Birkaç–onlarca                       |
| Yalıtım                                 | Uygulama kodu (+ satır düzeyi güvenlik) | Şema sınırı; kod yine doğru şemayı seçmeli | En güçlü; ayrı kimlik bilgisi bile mümkün |
| Migrasyon                               | Bir kez                               | Kiracı sayısı kadar; yarıda kalabilir | Kiracı sayısı kadar               |
| Gürültülü komşu                         | En çok risk                           | Orta (aynı sunucu)               | Ayrı sunucuya alınabilir             |
| Tek kiracıyı geri yükleme / silme       | Zor (satır satır)                     | Orta (şema düşür/yükle)          | Kolay (dosya/veritabanı)             |
| Kiracılar arası rapor                   | Kolay                                 | Zor                              | Çok zor                              |
| Ne zaman                                | **Varsayılan**                        | Az sayıda, özelleştirme isteyen kiracı | Düzenlemeye tabi ya da çok büyük kiracı |

Çoğu ürün için doğru yol **melezdir**: küçük kiracılar paylaşımlı tablolarda; sözleşmesi ya da yükü ayrılmayı
gerektiren birkaç büyük kiracı kendi veritabanında. Bunu mümkün kılmak için baştan: her tabloda kiracı sütunu,
bileşik anahtarlar (`(kiraci_id, id)`), tahmin edilemez kimlikler (UUID; birleştirmede çakışmaz).

## Yalıtım açıkları: sorgunun dışında

| Katman                  | Açık                                                              | Önlem                                                        |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Sorgu                   | `WHERE id = ?` tek başına                                          | Kiracıyla kurulan depo; kural testi (aşağıda)                |
| Önbellek                | Anahtarda kiracı yok: A'nın listesi B'ye gider                    | Anahtar önekinde kiracı ([Önbellek katmanları](onbellek-katmanlari.md)) |
| Arama dizini            | Dizin sorgusu kiracı süzgeçsiz                                     | Dizin belgesinde kiracı alanı + zorunlu süzgeç               |
| Kuyruk işi              | İş "sistem" yetkisiyle çalışıyor, kiracıyı bilmiyor                | İş yükü kiracıyı ve başlatanı taşır; çalışırken yeniden denetler |
| Dosya depolama          | `/yuklemeler/123.pdf` tahmin edilebilir; süresiz bağlantı          | Yol kiracı önekli; kısa süreli imzalı bağlantı               |
| Sıralı kimlik           | Fatura no 1042 → "bu firma 1041 fatura kesmiş"                     | Dışarıya görünen kimlik rastgele; kiracı içi numara ayrı     |
| E-posta ve şablon       | Önbellekteki şablonda başka kiracının logosu/adı                  | Şablon önbelleği anahtarında kiracı                          |
| Dışa aktarım ve rapor   | Toplu sorgu süzgeçsiz                                             | Aynı depo katmanı; iki kiracılı test                         |
| Günlük ve destek araçları | Destek ekranı bütün kiracıları gösteriyor                       | Yönetici yetkisi ayrı; erişim denetim günlüğünde             |
| Yedekten geri yükleme   | Tek kiracıyı geri yüklemek için bütün veritabanı geri alınıyor    | Kiracı başına dışa aktarım; ya da büyük kiracı ayrı veritabanında |

Sorgu katmanında kiracı koşulunu unutmayı bir kural testi yakalayabilir. Kaba bir ağdır (dizgi taraması; birleşen
tabloların her birini denetlemez), ama küçük modelin en sık hatasını yakalar:

```python calistir
import re

KIRACI_TABLOLARI = {"fatura", "musteri", "urun"}  # kiracıya ait veri taşıyan tablolar
SORGULAR = {  # gerçek projede: kaynak dosyalardaki SQL dizgileri taranır
    "fatura_listesi": "SELECT id, tutar FROM fatura WHERE kiraci_id = ? ORDER BY id DESC LIMIT 50",
    "fatura_ekle": "INSERT INTO fatura (kiraci_id, tutar) VALUES (?, ?)",
    "fatura_sil": "DELETE FROM fatura WHERE id = ?",
    "musteri_ara": "SELECT id, ad FROM musteri WHERE ad LIKE ?",
    "urun_guncelle": "UPDATE urun SET fiyat = ? WHERE id = ? AND kiraci_id = ?",
    "pano_sayim": "SELECT count(*) FROM fatura f JOIN musteri m ON m.id = f.musteri_id WHERE f.kiraci_id = ?",
    "yonetim_sayim": "SELECT count(*) FROM fatura",
}


def kiracisiz(sorgular: dict[str, str]) -> list[str]:
    sorunlu = []
    for ad, sql in sorgular.items():
        tablolar = {t.lower() for t in re.findall(r"\b(?:FROM|JOIN|UPDATE|INTO)\s+(\w+)", sql, re.I)}
        if not tablolar & KIRACI_TABLOLARI:
            continue
        ust = sql.upper()
        kapsam = ust if ust.lstrip().startswith("INSERT") else ust.partition("WHERE")[2]
        if "KIRACI_ID" not in kapsam:
            sorunlu.append(ad)
    return sorunlu


sorunlu = kiracisiz(SORGULAR)
print("kiracı koşulu olmayan sorgular:", ", ".join(sorunlu))
assert sorunlu == ["fatura_sil", "musteri_ara", "yonetim_sayim"]
```

```cikti
kiracı koşulu olmayan sorgular: fatura_sil, musteri_ara, yonetim_sayim
```

- Bilinçli istisnalar (yönetici sayımı gibi) testte **adıyla ve gerekçesiyle** ayrı bir listede durur; liste
  büyüyorsa tasarım sorunludur.
- `pano_sayim` geçti ama birleşen `musteri` tablosunda kiracı koşulu yok: bileşik yabancı anahtar
  (`(kiraci_id, musteri_id)`) burada ikinci savunmadır ([Yetkilendirme](../30-arkauc/yetkilendirme.md)).
- Postgres kullanılıyorsa satır düzeyi güvenlik (row level security) üçüncü kattır; birinci kat yine uygulamadır.

## Gürültülü komşu

Paylaşımlı kaynakta (işçi havuzu, veritabanı, dış API kotası) bir kiracının toplu işi herkesi bekletir. Benzetim:
tek işçi saniyede 10 iş bitiriyor; A kiracısı bir anda 500 dışa aktarım işi atıyor, B ve C saniyede birer iş:

```python calistir
from collections import deque


def benzet(adil: bool) -> dict[str, float]:
    """Tek işçi saniyede 10 iş bitirir. A kiracısı t=0'da 500 dışa aktarım işi atar; B ve C saniyede birer iş.
    Kiracı başına en uzun bekleme (sn) döner."""
    kuyruklar: dict[str, deque] = {"A": deque(), "B": deque(), "C": deque()}
    tek_kuyruk: deque = deque()
    sira = ["A", "B", "C"]
    en_uzun = {"A": 0.0, "B": 0.0, "C": 0.0}
    for adim in range(1_000):  # 100 sn, her adım 0,1 sn = bir iş
        t = adim / 10
        gelen = [("A", t)] * 500 if adim == 0 else []
        if adim % 10 == 0 and t < 60:
            gelen += [("B", t), ("C", t)]
        for kiraci, an in gelen:
            (kuyruklar[kiraci] if adil else tek_kuyruk).append((kiraci, an))
        if adil:  # sırayla kiracılara bak: her kiracıdan en çok bir iş (döner sıra)
            for _ in range(3):
                kiraci = sira.pop(0)
                sira.append(kiraci)
                if kuyruklar[kiraci]:
                    is_ = kuyruklar[kiraci].popleft()
                    break
            else:
                continue
        elif tek_kuyruk:
            is_ = tek_kuyruk.popleft()
        else:
            continue
        en_uzun[is_[0]] = max(en_uzun[is_[0]], t - is_[1])
    return en_uzun


fifo, adil = benzet(adil=False), benzet(adil=True)
for ad, s in (("tek kuyruk (FIFO)", fifo), ("kiracı başına adil", adil)):
    print(f"{ad:18}: en uzun bekleme A {s['A']:4.1f} sn | B {s['B']:4.1f} sn | C {s['C']:4.1f} sn")
assert fifo["B"] > 40 and adil["B"] < 1 and adil["A"] < fifo["A"] * 1.5
```

```cikti
tek kuyruk (FIFO) : en uzun bekleme A 49.9 sn | B 50.0 sn | C 50.1 sn
kiracı başına adil: en uzun bekleme A 61.9 sn | B  0.1 sn | C  0.2 sn
```

Adil sıra (kiracı başına kuyruk + döner sıra) küçük kiracıları korur; büyük kiracı biraz daha bekler, kimse
aç kalmaz. Aynı fikir: kiracı başına eşzamanlı iş sınırı, ağırlıklı adil sıra (ücretli plana daha büyük pay).

## Kiracı başına sınırlar

| Kaynak                         | Sınır                                         | Uygulama                                                      |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------------- |
| İstek hızı                     | Kiracı başına jeton kovası (+ kullanıcı başına) | [`hiz_siniri`](../../kutuphane/py/kutuphane/hiz_siniri.py), anahtar `kiraci:{id}` |
| Arka plan işi                  | Kiracı başına eşzamanlı en çok N iş           | Adil kuyruk; iş tablosunda kiracı sütunu                       |
| Depolama                       | Kiracı başına kota (bayt, dosya sayısı)       | Yüklemeden önce denetim; kullanımı ayrı tabloda tutma          |
| Kayıt sayısı / üye sayısı      | Plana göre üst sınır                          | Yazma yolunda tek yerde denetim                               |
| Dış API ve dil modeli maliyeti | Kiracı başına aylık bütçe                     | Çağrıdan önce bütçe denetimi; aşımda kibar hata               |
| Dışa aktarım boyutu            | Satır/bayt sınırı, sayfalı üretim             | Arka plan işi + parça parça                                   |

Sınırlar **planla ilişkilendirilir** ve tek bir yapılandırma tablosunda durur; kodun içine sayı gömülmez. Sınıra
yaklaşan kiracı için uyarı (yüzde 80) kullanıcıya ve size gider. Sınır aşımında hata iletisi ne olduğunu ve ne
yapılacağını söyler ("Bu ay 1000 dışa aktarım hakkınız doldu; 1 Aralık'ta yenilenir").

## Büyük kiracıyı ayırma

1. Kiracının bütün satırları `kiraci_id` ile seçilebilir olmalı (her tabloda sütun; ara tablolar dahil).
2. Kimlikler küresel benzersiz (UUID) olmalı; ayrı veritabanında üretilen kimlik ötekiyle çakışmamalı.
3. Kiracı → veritabanı **eşleme tablosu** tutulur; uygulama bağlantıyı bu tabloya göre seçer
   ([Veritabanı ölçekleme](veritabani-olcekleme.md) → arama tablosu).
4. Taşıma: yaz-ikiye, doğrula, oku-yeni, eskiyi sil; ya da kısa bir salt okunur pencerede kopyala ve çevir.
   Geri dönüş planı yazılı olur ([Tasarım kararı şablonu](tasarim-karari-sablonu.md)).

## Tuzaklar

| Belirti                                                     | Neden                                                   | Çözüm                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| A firması B firmasının kaydını görüyor                      | Sorguda kiracı koşulu yok                               | Kiracıyla kurulan depo; kural testi; iki kiracılı test     |
| Arama sonuçlarında başka firmanın belgesi                   | Arama dizini süzgeçsiz                                  | Dizinde kiracı alanı + zorunlu süzgeç                      |
| Bir firma toplu aktarım yapınca herkes yavaşlıyor           | Tek FIFO kuyruk, ortak işçi havuzu                       | Adil kuyruk, kiracı başına eşzamanlılık sınırı              |
| Şema başına modelde migrasyon yarıda kaldı                  | 300 şemadan 120'sinde hata                              | Migrasyonlar idempotent; kiracı başına durum tablosu       |
| Tek müşteri "dünkü hâlimize dönün" dedi, yapılamadı         | Paylaşımlı tabloda tek kiracı geri yüklenemiyor         | Kiracı başına dışa/içe aktarım aracı                       |
| Fatura numaralarından rakip firma hacmini çıkardı           | Küresel sıralı kimlik                                   | Dışa görünen kimlik rastgele; kiracı içi sıra ayrı         |
| Ücretsiz plandaki bir kiracı dil modeli faturasını patlattı | Kiracı başına maliyet sınırı yok                        | Aylık bütçe ve denetim                                     |
| Büyük kiracıyı ayırmak aylar sürdü                          | Bazı tablolarda kiracı sütunu yok, kimlikler sıralı tamsayı | Baştan her tabloda kiracı sütunu ve UUID                 |

## Denetim listesi

- [ ] Model seçildi ve gerekçesi yazıldı; melez geçiş yolu açık (kiracı sütunu her tabloda, UUID).
- [ ] Kiracı kimliği oturumdan geliyor; her sorgu kiracıyla kurulan depo üzerinden.
- [ ] Kiracı koşulu kural testi `check` içinde; bilinçli istisnalar gerekçeli listede.
- [ ] Önbellek anahtarı, arama dizini, kuyruk işi, dosya yolu, ölçüt etiketi kiracıyı taşıyor.
- [ ] İki kiracılı "çapraz erişim" testi her uçta 404 bekliyor.
- [ ] Paylaşımlı kuyrukta adil sıra ya da kiracı başına eşzamanlılık sınırı var.
- [ ] Kiracı başına sınırlar tek yapılandırmada, plana bağlı; %80 uyarısı var.
- [ ] Tek kiracıyı dışa aktarma, silme (KVKK) ve geri yükleme yolu denendi ([Veri yaşam döngüsü](veri-yasam-dongusu.md)).

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu tablo kiracıya ait: `kiraci_id` sütunu, birincil anahtar `(kiraci_id, id)`. Sorguları
  yalnız `KiraciDeposu(kiraci_id)` üzerinden yaz; kiracı oturumdan gelir. Önbellek anahtarına ve kuyruk işine
  kiracıyı koy. İki kiracılı çapraz erişim testi yaz."
- **Modelin tipik hatası:** yeni sorguda `WHERE id = ?` yazıp kiracıyı unutur; kiracıyı istek gövdesinden okur;
  arama dizinine ve önbelleğe kiracı koymaz; arka plan işini kiracısız çalıştırır; şema başına model önerip
  migrasyon maliyetini düşünmez.
- **Çıktıda arayın:** kural testinin çıktısı; `req.body.kiraci`/`tenantId` okunan yerler; önbellek `set(`
  anahtarları; kuyruğa konan iş yükünde `kiraci_id` var mı.
- **Doğrulama:** "B kiracısının kullanıcısı A'nın her kaydına her uçtan 404 alır" testini çalıştırın.

## İlgili

- [Yetkilendirme](../30-arkauc/yetkilendirme.md) (sorgu düzeyi yalıtım, bileşik yabancı anahtar) ·
  [Kimlik ve yetki mimarisi](kimlik-ve-yetki-mimarisi.md)
- [Veritabanı ölçekleme](veritabani-olcekleme.md) (kiracıya göre parçalama, sıcak kiracı) ·
  [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) · [Veri yaşam döngüsü](veri-yasam-dongusu.md)
- Havuzda kiracı = çalışma alanı: [`uygulama/api/src/modules/workspaces/permissions.ts`](../../uygulama/api/src/modules/workspaces/permissions.ts)
