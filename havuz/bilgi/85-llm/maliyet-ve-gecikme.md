---
baslik: Dil modeli maliyeti ve gecikmesi
ozet: Belirteç ekonomisi, fiyatı parametre alan maliyet hesabı, sohbet geçmişinin büyümesi, kısaltma yolları, gecikmenin bileşenleri, akış, zaman aşımı ve yeniden deneme.
etiketler: [llm, maliyet, gecikme, belirtec, yeniden-deneme, akis]
duzey: orta
guncellik: 2026-11
---

# Dil modeli maliyeti ve gecikmesi

> Bu notu ne zaman okumalı: Bir özelliği yayına almadan önce aylık maliyeti ve yanıt süresini kestirirken; fatura ya
> da bekleme beklenenden yüksek çıktığında; zaman aşımı ve yeniden deneme ayarlarını seçerken.

## Temel fikir

Bulutta maliyet = girdi belirteci × girdi fiyatı + çıktı belirteci × çıktı fiyatı; her çağrıda sistem istemi,
kaynaklar, örnekler ve sohbet geçmişi **yeniden** sayılır. Gecikme = ağ ve kuyruk + istem işleme (girdiyle büyür) +
üretim (çıktı belirteci × belirteç süresi) + sonradan işleme; çoğu işte en büyük kalem **çıktı uzunluğudur**. Türkçe
metin aynı içerik için daha çok belirteç tutar ([dil modeli nasıl çalışır](llm-nasil-calisir.md)). Fiyatlar çabuk
değişir: koda ve nota yazmayın, ayar dosyasında tutun ve sağlayıcıdan güncel değeri alın. En ucuz çağrı yapılmayan
çağrıdır: önbellek, "belgede yok" erken dönüşü, kodla çözülebilen işi koda verme.

## Karar tablosu

| Durum                                                 | Ne yapılır                                                    | Neden                                               |
| ----------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Girdi maliyeti baskın (uzun sistem istemi, kaynaklar) | İstem diyeti, k'yı küçültme, az ama iyi örnek                 | Her çağrıda yinelenen kısım küçülür                 |
| Çıktı maliyeti/gecikmesi baskın                       | Çıktı sınırı, kısa biçim (etiket, JSON), gereksiz açıklama yok | Çıktı belirteci hem pahalı hem yavaş               |
| Aynı istekler tekrar ediyor                           | Yanıt önbelleği (sıcaklık 0)                                  | İkinci istek bedava ve anında                       |
| Sabit önek uzun (sistem + araç tanımları)              | Öneki en başa koyun; sağlayıcı önek önbelleği sunuyorsa açın  | Bazı sağlayıcılar yinelenen öneki indirimli/hızlı işler (doğrulayın) |
| Acil olmayan toplu iş (gece raporu, etiketleme)       | Toplu iş (batch) arayüzü ya da yerel model                    | Bazı sağlayıcılar indirim verir (doğrulayın); yerelde ek ücret yok |
| İsteklerin çoğu kolay                                 | Küçük modele yönlendirme + zorlara büyük model               | [Kademelendirme](model-secimi.md)                   |
| Kullanıcı beklerken uzun metin üretiliyor             | Akışla yanıt (streaming)                                     | Algılanan bekleme ilk belirtece iner                |
| Sohbet uzadıkça her tur pahalanıyor                   | Kayan pencere/özet                                           | Geçmiş her turda yeniden gönderiliyor               |

## Maliyet hesabı

Fiyatları **parametre** olarak verin; burada geçen fiyatlar örnektir, gerçek değil.

```python calistir
import math


def belirtec(karakter: int, karakter_basina: float = 2.6) -> int:  # Türkçe için güvenli taraf
    return math.ceil(karakter / karakter_basina)


def aylik_maliyet(istek_gunde: int, girdi: int, cikti: int, fiyat_girdi: float, fiyat_cikti: float,
                  onbellekli_girdi: int = 0, onbellek_indirimi: float = 0.0) -> float:
    """Fiyatlar 1 milyon belirteç başına, KENDİ para biriminizde (sağlayıcınızdan alın; burada örnek)."""
    girdi_bedeli = (girdi - onbellekli_girdi) * fiyat_girdi + onbellekli_girdi * fiyat_girdi * (1 - onbellek_indirimi)
    return istek_gunde * 30 * (girdi_bedeli + cikti * fiyat_cikti) / 1e6


sistem, kaynaklar, soru, yanit = belirtec(1200), belirtec(4000), belirtec(150), 250
girdi = sistem + kaynaklar + soru
print(f"istek başına: sistem {sistem} + kaynak {kaynaklar} + soru {soru} = {girdi} girdi, {yanit} çıktı")
FIYAT_GIRDI, FIYAT_CIKTI = 0.5, 2.0  # ÖRNEK birim fiyatlar (1M belirteç başına)
temel = aylik_maliyet(10_000, girdi, yanit, FIYAT_GIRDI, FIYAT_CIKTI)
diyet = aylik_maliyet(10_000, belirtec(600) + belirtec(2000) + soru, 150, FIYAT_GIRDI, FIYAT_CIKTI)
print(f"aylık: {temel:.0f} → istem diyeti + k küçültme + kısa çıktı: {diyet:.0f}")
assert diyet < temel * 0.6
```

```cikti
istek başına: sistem 462 + kaynak 1539 + soru 58 = 2059 girdi, 250 çıktı
aylık: 459 → istem diyeti + k küçültme + kısa çıktı: 249
```

- Gerçek kullanımı ölçün: sağlayıcının bildirdiği `usage` alanını her çağrıda kaydedin; bildirmiyorsa tahmin
  edildiğini işaretleyin (havuz: `yz/yz/saglayici/maliyet.py`, `KullanimSayaci`; fiyat tablosu `yz.yaml`'da,
  tabloda olmayan modelin maliyeti "bilinmiyor" döner, sıfır değil).
- Zincir ve ajanlarda istek başına çağrı sayısını çarpın; onarım turları da çağrıdır.
- Yerelde maliyet donanım + elektrik + bakımdır; çağrı başına ücret yoktur ama süre maliyeti vardır.

## Sohbet geçmişi neden pahalanır

Model hafıza tutmaz; her tur, o ana kadarki konuşmanın tamamı yeniden gönderilir. Toplam girdi tur sayısının karesiyle
büyür.

```python calistir
def sohbet_belirteci(tur: int, tur_basina: int, sistem: int, pencere: int | None = None) -> int:
    """Her turda geçmişin TAMAMI yeniden gönderilir. `pencere` verilirse yalnız son N tur gönderilir."""
    toplam = 0
    for t in range(1, tur + 1):
        gecmis = t if pencere is None else min(t, pencere)
        toplam += sistem + gecmis * tur_basina
    return toplam


for tur in (5, 20, 40):
    tam, kayan = sohbet_belirteci(tur, 200, 500), sohbet_belirteci(tur, 200, 500, pencere=6)
    print(f"{tur} tur: tam geçmiş {tam:,} girdi belirteci | son 6 tur {kayan:,}")
assert sohbet_belirteci(40, 200, 500) > 2.5 * sohbet_belirteci(40, 200, 500, pencere=6)
```

```cikti
5 tur: tam geçmiş 5,500 girdi belirteci | son 6 tur 5,500
20 tur: tam geçmiş 52,000 girdi belirteci | son 6 tur 31,000
40 tur: tam geçmiş 184,000 girdi belirteci | son 6 tur 65,000
```

Kayan pencere bilgiyi unutturur; özetleme ya da getirerek hatırlama ile birleştirin
([bellek ve bağlam yönetimi](bellek-ve-baglam-yonetimi.md)).

## Kısaltma yolları

| Yol                      | Nasıl                                                                 | Bedeli / dikkat                                      |
| ------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------- |
| İstem diyeti             | Bilgi taşımayan cümleleri, tekrarları, uzun açıklamaları silin         | Her silmeden sonra görev kümesini koşun              |
| Az ve seçilmiş örnek     | Soruya en benzeyen 2–3 örnek (`AzOrnekSecici`)                        | Örnek seçimi kötüleşirse doğruluk düşer              |
| Bağlamı küçültme         | Daha iyi getirme, küçük k, yinelenen parçaları atma                    | recall@k'yı izleyin ([RAG değerlendirme](rag-degerlendirme.md)) |
| Çıktıyı kısaltma         | Çıktı sınırı; etiket/JSON biçimi; "açıklama yazma" yerine "yalnız etiket" | Kesik çıktıyı ayrıca yakalayın                    |
| Yanıt önbelleği          | Aynı istek → diskteki yanıt (yalnız sıcaklık 0/tohumlu)               | Önbellek kişisel veri içerir; paylaşmayın           |
| Önek önbelleği (sağlayıcı) | Sabit kısmı başa, değişen kısmı sona koyun                           | Sağlayıcıya göre değişir; doğrulayın                 |
| Toplu iş                 | Acil olmayan işleri toplu gönderin ya da yerel modelde gece koşun     | Gecikme saatler olabilir                             |
| Küçük modele yönlendirme | Kolay istekleri küçük model, zoru büyük model                          | Denetçinin yakalama oranı belirleyicidir            |
| Çağrı yapmama            | "Belgede yok" erken dönüşü, kodla çözülen hesap/biçim                  | En ucuz ve en güvenilir yol                         |

## Gecikmenin bileşenleri

| Bileşen               | Neye bağlı                               | Nasıl kısalır                                              |
| --------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Ağ + kuyruk           | Sağlayıcı yükü, uzaklık, hız sınırı       | Yakın bölge; yerel model; eşzamanlılığı sınırlama          |
| İstem işleme (TTFT)   | Girdi belirteci, model boyu               | İstem diyeti; önek önbelleği; küçük model                  |
| Üretim                | Çıktı belirteci × belirteç süresi         | Kısa çıktı; küçük model; yerelde nicemleme                 |
| Sonradan işleme       | Ayrıştırma, doğrulama, onarım turları     | Bilinen sapmayı kod düzeltsin (onarım turu azalır)         |
| Zincir / ajan         | Ardışık çağrı sayısı                      | Adım birleştirme; bağımsız adımları paralel koşma          |

Gecikmeyi yüzdelikle (p50, p95) okuyun; ortalama, yavaş kuyruğu gizler. Havuzdaki ölçüm araçları gecikme p50/p95'i
her koşuda yazar (`python -m yz degerlendir`). Kapasite ve eşzamanlılık hesabı:
[Kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md).

## Akışla yanıt

- Akış (streaming), belirteçleri üretildikçe gönderir: kullanıcı ilk sözcüğü TTFT kadar sonra görür. Toplam süre
  kısalmaz.
- Serbest metinde kullanın; **yapılı çıktıda** son ayrıştırma ve doğrulama yanıt tamamlanınca yapılır. JSON'u akışla
  kullanıcıya göstermeyin.
- Akışta parçalar sözcük ya da işaret ortasından bölünebilir: maskelenmiş kişisel veriyi geri açarken parçayı
  bekletin (havuz: `yz/yz/guvenlik/maske.py`, `AkisMaskeAcici`); düşünce etiketi iki parçaya bölünebilir
  (`yz/yz/saglayici/dusunce.py`).
- Akış kopabilir: parçalar arası bekleme için ayrı bir zaman aşımı koyun.

## Zaman aşımı ve yeniden deneme

- **Zaman aşımları:** bağlantı (kısa, birkaç saniye), okuma (beklenen çıktı uzunluğuna göre), akışta parçalar arası
  bekleme ve tüm iş için üst süre (deadline).
- **Yalnız yeniden denenebilir hatalar:** 408, 429, 5xx, bağlantı kopması. 400/401/422 yeniden denemekle düzelmez.
- **Üstel geri çekilme + titreşim** (exponential backoff + jitter): bekleme her denemede katlanır, rastgele pay eklenir
  ki bütün istemciler aynı anda dönmesin. Sunucu `Retry-After` verdiyse ona uyun. Deneme sayısı sınırlı.
- **Yinelenebilirlik:** dünyayı değiştiren çağrıyı zaman aşımından sonra körlemesine yinelemeyin; istek kimliği
  kullanın ([ajanlar ve araçlar](ajanlar-ve-araclar.md)).

```python calistir
import random


class SaglayiciHatasi(Exception):
    def __init__(self, kod: int, bekle_sn: float | None = None) -> None:
        super().__init__(f"HTTP {kod}")
        self.kod, self.bekle_sn = kod, bekle_sn  # bekle_sn: sunucunun Retry-After başlığı


YENIDEN_DENENIR = {408, 429, 500, 502, 503, 504}


def yeniden_dene(islev, uyu, rastgele: random.Random, azami_deneme: int = 4, taban: float = 0.5,
                 carpan: float = 2.0, tavan: float = 20.0, titresim: float = 0.25):
    for deneme in range(1, azami_deneme + 1):
        try:
            return islev()
        except SaglayiciHatasi as hata:
            if hata.kod not in YENIDEN_DENENIR or deneme == azami_deneme:
                raise  # 400, 401, 422: yeniden denemek düzeltmez
            bekle = hata.bekle_sn or min(tavan, taban * carpan ** (deneme - 1))
            uyu(min(tavan, bekle * (1 + titresim * rastgele.random())))  # titreşim: herkes aynı anda dönmesin


beklemeler: list[float] = []
yanitlar = iter([SaglayiciHatasi(503), SaglayiciHatasi(429, bekle_sn=3.0), "tamam"])


def cagri():
    sonraki = next(yanitlar)
    if isinstance(sonraki, Exception):
        raise sonraki
    return sonraki


print(yeniden_dene(cagri, beklemeler.append, random.Random(0)), [round(b, 2) for b in beklemeler])
assert len(beklemeler) == 2 and beklemeler[1] >= 3.0  # Retry-After'a uyuldu


def hatali_istek():
    raise SaglayiciHatasi(400)


try:
    yeniden_dene(hatali_istek, beklemeler.append, random.Random(0))
except SaglayiciHatasi as hata:
    print("yeniden denenmedi:", hata, "| bekleme sayısı:", len(beklemeler))
```

```cikti
tamam [0.61, 3.57]
yeniden denenmedi: HTTP 400 | bekleme sayısı: 2
```

Bekleme işlevi (`uyu`) ve rastgele kaynak parametredir: testte gerçek bekleme olmaz. Havuzdaki gerçekleme aynı
kalıptadır (`yz/yz/saglayici/yeniden_dene.py`; varsayılan 3 deneme, taban 0,5 sn, çarpan 2, tavan 20 sn, titreşim
%25). Kuyruklu arka plan işlerinde yeniden deneme ve ölü mektup: [Arka plan işleri](../30-arkauc/arka-plan-isleri.md).

## Tuzaklar

| Belirti                                                    | Neden                                                   | Çözüm                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Fatura tahminin iki katı                                   | Türkçe belirteç İngilizce oranla hesaplandı; onarım turları ve zincir adımları sayılmadı | Gerçek `usage` kaydı; çağrı sayısını izleyin |
| Uzun sohbetlerde maliyet patlıyor                          | Geçmiş her turda tam gönderiliyor                        | Kayan pencere + özet                                        |
| Önbellek isabeti hiç yok                                   | İstemde değişen alan (zaman damgası, rastgele kimlik)    | Değişen kısmı istemin sonuna; anahtardan çıkarın            |
| Önbellek yanlış yanıt döndürüyor                           | Sıcaklık > 0 yanıtı ya da model/istem sürümü anahtarda yok | Yalnız belirlenimci istekler; anahtara sürüm               |
| 429 hataları artınca her şey duruyor                       | Herkes aynı anda yeniden deniyor                         | Titreşimli geri çekilme; eşzamanlılık sınırı                |
| Zaman aşımında çift işlem                                  | Yazma çağrısı körlemesine yeniden denendi                | İstek kimliği; önce durum sorgusu                           |
| Ortalama gecikme iyi, kullanıcılar şikâyetçi               | Yavaş kuyruk (p95) görülmüyor                            | p95/p99 izleyin                                             |
| Akışla JSON gösterildi, yarım nesne ekrana düştü           | Yapılı çıktı akışla kullanıldı                           | Yapılı çıktıyı tamamlanınca ayrıştırın                      |

## Denetim listesi

- [ ] İstek başına girdi/çıktı belirteci gerçek ölçümle biliniyor (Türkçe metin ile).
- [ ] Aylık maliyet hesabı fiyatları ayardan alıyor; zincir adımları ve onarım turları dahil.
- [ ] Sistem istemi, örnekler ve kaynaklar diyetten geçti; her kısaltma görev kümesiyle doğrulandı.
- [ ] Çıktı sınırı işe göre ayarlı; kesik çıktı ayrıca işleniyor.
- [ ] Yanıt önbelleği yalnız belirlenimci isteklerde; anahtarda model + istem sürümü var.
- [ ] Zaman aşımları (bağlantı, okuma, akış, toplam) ayrı ayrı tanımlı.
- [ ] Yeniden deneme yalnız 408/429/5xx/bağlantı hatasında; titreşimli; `Retry-After`'a uyuyor; sınırlı.
- [ ] Gecikme p50/p95 izleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Maliyet hesabında fiyatları sabit yazma, ayardan oku. Belirteçleri sağlayıcının bildirdiği
  `usage`'dan al; yoksa Türkçe için 2,6 karakter/belirteç ile tahmin et ve tahmin olduğunu işaretle. Yeniden
  denemeyi yalnız 408/429/5xx'te, titreşimli üstel geri çekilmeyle yap; bekleme işlevini parametre al."
- **Modelin tipik hatası:** ezberden fiyat yazmak; her hatada yeniden denemek (400 dahil); sonsuz yeniden deneme;
  `time.sleep`'i doğrudan çağırıp testi yavaşlatmak; maliyeti yalnız ilk çağrıdan hesaplamak.
- **Çıktıda denetleyin:** fiyat sabiti kodda var mı; yeniden denenen hata kodları; deneme sınırı; zaman aşımı
  değerleri; maliyet hesabında zincir/onarım çağrıları sayılıyor mu.

## İlgili

- [Yerel model çalıştırma](yerel-model-calistirma.md) · [Model seçimi](model-secimi.md) ·
  [Bellek ve bağlam yönetimi](bellek-ve-baglam-yonetimi.md) · [Üretim hattı kalıpları](uretim-hatti-kaliplari.md)
- Havuz: [`maliyet.py`](../../yz/yz/saglayici/maliyet.py), [`yeniden_dene.py`](../../yz/yz/saglayici/yeniden_dene.py),
  [`onbellek.py`](../../yz/yz/saglayici/onbellek.py), [`butce.py`](../../yz/yz/istem/butce.py); ayar örneği
  [`yz.ornek.yaml`](../../yz/yz.ornek.yaml)
- Önbellek kararları genel olarak: [Önbellek](../30-arkauc/onbellek.md); zaman aşımı, yeniden deneme ve devre kesici:
  [Dayanıklılık kalıpları](../40-sistem-tasarimi/dayaniklilik-kaliplari.md)
