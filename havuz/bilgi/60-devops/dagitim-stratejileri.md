---
baslik: Dağıtım stratejileri ve geri alma
ozet: Sıfır kesintili dağıtımın koşulları, mavi-yeşil ve kademeli dağıtım, iki sürümün birlikte çalışması, veritabanı değişikliğinin dağıtımla sıralanması, geri alma planı ve özellik bayrakları.
etiketler: [dagitim, geri-alma, migrasyon, ozellik-bayragi, kanarya, devops]
duzey: ileri
guncellik: 2026-11
---

# Dağıtım stratejileri ve geri alma

> Bu notu ne zaman okumalı: şema ya da API değiştiren bir sürümü yayına almadan önce; "yayından sonra birkaç dakika
> hata yağdı" durumunda; riskli bir özelliği herkese birden açmak yerine azar azar açmak istediğinizde; geri alma
> planı yazarken.

## Temel fikir

Dağıtım bir an değil, **bir aralıktır**: o aralıkta eski ve yeni sürüm birlikte yaşar. Eski kopya son isteklerini
bitirir, kullanıcının açık sekmesi eski JavaScript'i çalıştırır, telefondaki servis çalışanı eski kabuğu sunar,
geri alırsanız eski kod yeni şemayla karşılaşır. Bu yüzden her değişiklik iki birleşimde de çalışmalıdır:
**eski kod + yeni şema/API** ve **yeni kod + eski istemci**.

Geri alma planı dağıtımdan **önce** yazılır: önceki sürümün kimliği, onu yeniden yayına alma komutu ve geri
alınamayan şeylerin listesi.

## Karar tablosu

| Strateji              | Nasıl                                                        | Ne zaman                                          | Bedel / risk                                    |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------- |
| Yerinde (durdur-başlat) | Eskiyi durdur, yeniyi başlat                               | Tek kopya, SQLite, kısa kesinti kabul edilebilir  | Birkaç saniye–dakika kesinti; açık bağlantılar kopar |
| Yuvarlanan (rolling)  | Kopyalar sırayla yenilenir                                   | Birden çok durumsuz kopya                         | İki sürüm aynı anda trafik alır                 |
| Mavi-yeşil            | Yeni ortam tam kurulur, trafik bir anda geçer; eski hazır bekler | Saniyelik geri dönüş istendiğinde              | İki kat kaynak; veritabanı ortak kalır          |
| Kademeli (kanarya)    | Trafiğin küçük bir yüzdesi yeni sürüme, ölçütler karşılaştırılır | Çok kullanıcı ve ölçüt varsa                  | Yönlendirme ve ölçüt altyapısı gerekir          |
| Özellik bayrağı       | Kod yayında ama özellik kapalı; kullanıcı yüzdesiyle açılır  | Riskli özellik; ürün kararı ile yayın ayrılsın    | Bayrak borcu; iki kod yolu test edilmeli        |

Havuzdaki uygulama SQLite'lı tek kopyadır: yerinde dağıtım yapılır ve kısa kesinti kabul edilir. İstemci
çevrimdışı-önce çalıştığı için kullanıcı kesintiyi çoğu zaman fark etmez; eşitleme sonra tamamlanır
([`ESITLEME.md`](../../uygulama/docs/ESITLEME.md)). Dağıtımı trafiğin az olduğu saate koyun.

## Sıfır kesinti neye bağlı

| Koşul                                       | Neden                                                       |
| ------------------------------------------- | ----------------------------------------------------------- |
| Hazırlık denetimi                           | Yeni kopya hazır olmadan trafik almaz ([İzleme](izleme-ve-uyari.md)) |
| Düzgün kapanış (boşaltma)                   | Eski kopya süren istekleri bitirir ([Linux → sinyaller](linux-temelleri.md)) |
| Geriye uyumlu şema ve API                   | İki sürüm aynı veritabanını ve istemcileri paylaşır         |
| En az iki kopya ya da platformun "önce yenisini aç" özelliği | Yeni kopya kalkmadan eski kapanmaz          |
| İstemcinin yeniden denemesi                 | Kopan bağlantı kendiliğinden yeniden kurulur                |

Kalıcı diskli tek kopyada son iki koşul çoğu zaman sağlanamaz; bu bir hata değil, bilinçli bir ödünleşimdir.

## İki sürüm birlikte

| Birleşim                              | Ne zaman olur                                      | Kural                                                        |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Eski kod + yeni şema                  | Migrasyon koddan önce koştu; ya da geri alındı     | Şema yalnız **eklenir**: yeni sütun boş olabilir, eski sütun durur |
| Yeni kod + eski veri                  | Eski satırlar henüz taşınmadı                      | Yeni kod boş alanı tolere eder (yedek değer, eski alandan okuma) |
| Eski istemci + yeni API               | Açık sekme, güncellenmemiş PWA, eski mobil sürüm   | Alan **eklenir**, silinmez; anlamı değiştirilmez; bilinmeyen alan yok sayılır |
| Yeni istemci + eski API               | Geri alma; CDN'de eski yanıt                       | İstemci eksik alanı tolere eder                              |
| Eski sekme + silinmiş JS parçası      | Yayın eski özetli dosyaları sildi                  | Bir önceki derlemenin dosyalarını bir süre tutun; parça yükleme hatasında sayfayı yenileyin ([PWA](../20-web-onyuz/pwa-ve-cevrimdisi.md)) |

Kural kısaca: **aynı yayında hem ekle hem sil yapılmaz.** Ekleme bir yayında, kullanım geçişi bir sonrakinde,
silme en sonda.

## Veritabanı değişikliğini dağıtımla sıralamak

Genişlet → geçir → daralt yönteminin SQL ayrıntısı ve çalışan örneği: [Migrasyonlar](../30-arkauc/migrasyonlar.md).
Dağıtım açısından sıra şudur (örnek: `ad` sütunu `tam_ad` oluyor):

| Yayın | Migrasyon (koddan önce mi sonra mı)       | Kod                                          | Bu yayın geri alınabilir mi        |
| ----- | ----------------------------------------- | -------------------------------------------- | ---------------------------------- |
| 1     | `ADD COLUMN tam_ad` — **önce**            | İki sütuna yazar, `tam_ad`'dan okur, boşsa `ad` | Evet: eski kod yeni sütunu görmez |
| (iş)  | Eski satırları partilerle doldur          | —                                            | Evet                               |
| 2     | —                                         | Yalnız `tam_ad` okur, ikisine de yazar       | Evet: 1. sürüme dönülebilir        |
| 3     | `DROP COLUMN ad` — eski kod kalmayınca, **sonra** | Yalnız `tam_ad`                      | **Hayır**: veri gitti; öncesinde yedek |

- Genişletme göçleri koddan **önce**, daraltma göçleri eski kod tamamen kapandıktan **sonra** ve ayrı yayında koşar.
- Havuzdaki uygulama göçleri açılışta, istek almadan önce uygular; tek kopya için doğrudur. Birden çok kopyada göç
  ayrı bir adımda ve tek seferde koşar.
- Uzun süren göç açılışı uzatır; sağlık denetiminin bekleme süresi buna yetmezse platform yeni sürümü öldürür ve
  dağıtım döngüye girer. Uzun veri taşımayı açılıştan ayırın.

## Geri alma planı

Dağıtımdan önce üç satır yazın: **önceki sürüm** (imaj etiketi ya da kayıt kimliği), **geri alma komutu**
(platformun "önceki dağıtıma dön" düğmesi, `git revert` + dağıtım, compose'da eski `SURUM` ile `up -d`),
**geri alınamayanlar** (silinen sütun, gönderilen e-posta, ödeme, dış servise yazılan veri).

| Ne bozuldu                                   | Geri alma yolu                                                  |
| -------------------------------------------- | --------------------------------------------------------------- |
| Kod hatası, şema yalnız genişletildi         | Önceki sürümü yayına alın; şemaya dokunmayın                    |
| Yanlış ayar (ortam değişkeni)                | Önceki değeri yazın, yeniden başlatın                           |
| Daraltma göçü veri sildi                     | Yazmaları durdurun; yedeği yanına açıp yalnız kaybolanı taşıyın ([Yedekleme](veritabani-yedekleme.md)) |
| Hatalı veri yazıldı                          | İleri düzeltme: düzelten bir göç ya da betik; bütün veritabanını geri yüklemeyin |
| Riskli özellik bayrak arkasında              | Bayrağı kapatın; dağıtım gerekmez                               |
| Dış etki (e-posta, bildirim, ödeme)          | Geri alınamaz: kullanıcıya açıklama, ödemede iade               |

Geri almak ile ileri düzeltmek arasında karar: düzeltme küçük, testli ve dakikalar içinde yayına çıkabilecekse ileri;
değilse **önce geri alın**, sonra sakin kafayla düzeltin. "Yedeği geri yüklemek" bir geri alma yolu değildir: yedekten
sonraki bütün kullanıcı verisini siler.

## Kademeli dağıtım ve özellik bayrağı

Kullanıcıyı yüzdeye göre seçerken seçim **kalıcı** olmalıdır: aynı kullanıcı her istekte, her sunucu kopyasında
aynı tarafta kalmalı; yoksa ekran bir açılışta yeni, bir açılışta eski görünür.

```python calistir
import hashlib
import os
import subprocess
import sys


def kova(kullanici_id: str, bayrak: str) -> int:
    """0–99 arası kalıcı kova: aynı kullanıcı her sunucuda, her açılışta aynı kovaya düşer."""
    ozet = hashlib.sha256(f"{bayrak}:{kullanici_id}".encode()).digest()
    return int.from_bytes(ozet[:4], "big") % 100


def acik_mi(kullanici_id: str, bayrak: str, yuzde: int) -> bool:
    return kova(kullanici_id, bayrak) < yuzde


# YANLIŞ: Python'un hash() işlevi her süreçte başka tohumla çalışır (sunucu kopyası, yeniden başlatma)
kod = "print(hash('kullanici-42') % 100)"
sonuclar = {
    subprocess.run(
        [sys.executable, "-c", kod], capture_output=True, text=True, env={**os.environ, "PYTHONHASHSEED": tohum}
    ).stdout
    for tohum in ("1", "2", "3")
}
assert len(sonuclar) > 1  # aynı kullanıcı her yeniden başlatmada başka kovaya düşer

# DOĞRU: içerikten türeyen özet
kullanicilar = [f"kullanici-{i}" for i in range(10_000)]
yuzde10 = {k for k in kullanicilar if acik_mi(k, "yeni-esitleme", 10)}
yuzde25 = {k for k in kullanicilar if acik_mi(k, "yeni-esitleme", 25)}
baska_bayrak = {k for k in kullanicilar if acik_mi(k, "yeni-tema", 10)}
assert yuzde10 <= yuzde25  # yüzdeyi artırmak, açılmış kullanıcıyı kapatmaz
assert 900 < len(yuzde10) < 1100 and len(yuzde10 & baska_bayrak) < 200  # her bayrak başka bir %10
print(f"%10 → {len(yuzde10)} kullanıcı, %25 → {len(yuzde25)} kullanıcı; ilk %10'un hepsi hâlâ içeride")
```

```cikti
%10 → 1037 kullanıcı, %25 → 2508 kullanıcı; ilk %10'un hepsi hâlâ içeride
```

Kanaryayı (yeni sürümü ya da açılmış bayrağı) tabanla karşılaştırırken az veriyle karar vermeyin: 40 istekte 2 hata
"%5" eder ama hiçbir şey kanıtlamaz.

```python calistir
from math import sqrt


def kanarya_karari(k_hata: int, k_istek: int, t_hata: int, t_istek: int, en_az_istek: int = 500) -> str:
    """Kanaryanın hata oranı tabanınkinden şans eseri olamayacak kadar yüksek mi?"""
    if k_istek < en_az_istek:
        return "bekle: yeterli veri yok"
    p_k, p_t = k_hata / k_istek, t_hata / t_istek
    p = (k_hata + t_hata) / (k_istek + t_istek)
    z = (p_k - p_t) / sqrt(p * (1 - p) * (1 / k_istek + 1 / t_istek))  # iki oranın farkı, standart hatayla
    if z > 3:
        return f"GERİ AL: kanarya %{p_k * 100:.1f}, taban %{p_t * 100:.1f}"
    return f"devam: fark gürültü düzeyinde (kanarya %{p_k * 100:.1f}, taban %{p_t * 100:.1f})"


print(kanarya_karari(k_hata=2, k_istek=40, t_hata=10, t_istek=1000))
print(kanarya_karari(k_hata=9, k_istek=600, t_hata=60, t_istek=6000))
print(kanarya_karari(k_hata=30, k_istek=600, t_hata=60, t_istek=6000))
```

```cikti
bekle: yeterli veri yok
devam: fark gürültü düzeyinde (kanarya %1.5, taban %1.0)
GERİ AL: kanarya %5.0, taban %1.0
```

Bayrak kuralları:

- Bayrak adı karma girdisine girer: her bayrak kullanıcıların **başka** bir yüzdesini seçer, hep aynı kişiler
  denek olmaz.
- Her bayrağın sahibi ve **kaldırma tarihi** olur; %100'e ulaşan bayrağın kodu silinir. Unutulan bayraklar iki kod
  yolunu sonsuza dek test etmeyi gerektirir.
- Yetki ve güvenlik kararı istemcideki bayrağa bırakılmaz: istemci bayrağı görebilir ve değiştirebilir; sunucu kendi
  denetimini yapar.
- Dış servise bağlı riskli işler için "kapatma düğmesi" (kill switch) bayrağı tutun: sorun çıkınca dağıtımsız kapatılır.

## Tuzaklar

| Belirti                                                          | Neden                                                        | Çözüm                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Yayından sonra birkaç dakika "no such column"                    | Sütun tek yayında adlandırıldı/silindi                       | Genişlet → geçir → daralt; silme ayrı ve en son yayında            |
| Geri aldık ama hatalar sürüyor                                   | Yeni kodun göçü eski kodla uyumsuz (silme/adlandırma)        | Göçler yalnız eklesin; daraltma ancak geri dönüş ihtiyacı bitince  |
| Açık sekmelerde "Failed to fetch dynamically imported module"    | Yayın eski JS parçalarını sildi                              | Önceki derlemenin dosyalarını tutun; parça hatasında yenileyin     |
| Eski mobil/PWA istemcisi yayından sonra çöküyor                  | API'den alan silindi ya da anlamı değişti                    | Alan ekleyin, silmeyin; eski istemciyle sözleşme testi             |
| Dağıtım döngüye girdi, sürüm hiç yayına çıkmadı                  | Açılıştaki uzun göç sağlık denetimini geçemiyor              | Veri taşımayı açılıştan ayırın; bekleme süresini ayarlayın         |
| İki kopya aynı anda göç koşturdu, şema bozuldu                   | Göç her kopyanın açılışında                                  | Tek göç adımı ya da kilit                                          |
| Kullanıcı bazen yeni, bazen eski ekranı görüyor                  | Kova rastgele ya da süreç başına `hash()` ile seçiliyor      | İçerikten özet (`sha256(bayrak:kullanıcı)`)                        |
| Kanarya "%5 hata" dedi, panikle geri alındı                      | 40 istekle karar verildi                                     | En az istek sayısı + tabanla karşılaştırma                         |
| "Geri almak" için yedek geri yüklendi, gün boyu veri gitti       | Geri alma ile geri yükleme karıştırıldı                      | Kodu geri alın; veriyi ileri düzeltmeyle onarın                    |
| Bayraklar birikti, kimse neyin açık olduğunu bilmiyor            | Sahipsiz, tarihsiz bayraklar                                 | Bayrak listesi: sahip, kaldırma tarihi; %100 olanın kodu silinir   |

## Denetim listesi

- [ ] Dağıtımdan önce önceki sürümün kimliği, geri alma komutu ve geri alınamayanlar yazıldı.
- [ ] Bu yayındaki göçler yalnız ekliyor; silme/adlandırma varsa ayrı ve sonraki yayında.
- [ ] Yeni kod eski veriyle, eski kod yeni şemayla çalışıyor (test ya da deneme ortamında denendi).
- [ ] API değişikliği yalnız ekleme; eski istemciyle denendi.
- [ ] Yıkıcı adımdan önce yedek alındı ve geri yükleme biliniyor.
- [ ] Dağıtımdan sonra sağlık ucu yeni sürümü gösteriyor; ilk dakikalarda hata oranı izlendi.
- [ ] Riskli özellik bayrak arkasında; bayrağın sahibi ve kaldırma tarihi var.
- [ ] Kademeli açılışta kova kalıcı (özet) ve karar en az istek sayısına bağlı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu değişikliği yayınlara böl: her yayında hangi göç (koddan önce mi sonra mı), kod ne yapıyor,
  geri alınabilir mi — tablo olarak. Aynı yayında hem ekleme hem silme yapma. Geri alma planını üç satırla yaz."
- **Modelin tipik hatası:** sütun adlandırmayı tek göçte yapmak; "geri alma" için `down` göçü yazıp hiç denememek;
  özellik bayrağını `Math.random()` ya da `hash()` ile kovalamak; API'den alanı silip istemciyi aynı anda
  güncellemek ve açık sekmeleri unutmak; geri almayı yedekten dönmek sanmak.
- **Çıktıda denetleyin:** göç dosyalarında `DROP`, `RENAME` ve `ALTER … TYPE` arayın; her biri ayrı ve son yayında mı.
  Bayrak kodunda `random`/`hash(` var mı. Planda "geri alınamayanlar" satırı var mı.

## İlgili

- [Migrasyonlar](../30-arkauc/migrasyonlar.md) — genişlet → geçir → daralt, partili veri göçü
- [API tasarımı](../30-arkauc/api-tasarimi.md) — geriye uyumlu değişiklik ve sürümleme
- [CI/CD](ci-cd.md) — onaylı dağıtım ve dağıtım sonrası doğrulama
- [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md) — eski servis çalışanı ve eski parça sorunu
- [A/B testi](../70-veri/ab-testi.md) — örneklem büyüklüğü, erken bakma tuzağı (kanarya kararının istatistiği)
- [Çevrimdışı-önce ve eşitleme](../40-sistem-tasarimi/cevrimdisi-once-ve-esitleme.md) — eski istemcilerle uyum
- [Olay sonrası değerlendirme](olay-sonrasi-degerlendirme.md) · [Docker Compose](docker-compose.md) (sürüm etiketiyle geri dönüş)
- Çalışan karşılıklar: [`migrate.ts`](../../uygulama/api/src/db/migrate.ts) (açılışta göç),
  [`uygulama/docs/ESITLEME.md`](../../uygulama/docs/ESITLEME.md) (çevrimdışı istemci ve sunucu dönüşü)
