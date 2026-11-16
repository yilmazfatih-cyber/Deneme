---
baslik: Barındırma maliyeti ve kaynak
ozet: Maliyeti belirleyen kalemler (işlem, bellek, depolama, çıkış trafiği, veritabanı, e-posta, günlük), boşta uyuyan servisler, kaynak boyutlandırma, bütçe sınırı ve uyarısı; rakam vermeden hesap yöntemi.
etiketler: [maliyet, kaynak, butce, olcekleme, devops]
duzey: temel
guncellik: 2026-11
---

# Barındırma maliyeti ve kaynak

> Bu notu ne zaman okumalı: barındırma seçerken; ilk faturadan önce; fatura beklenmedik çıktığında; "büyük plana
> geçelim mi" sorusunda; uygulama bellek yetmediği için yeniden başlayıp durduğunda.

## Temel fikir

Fatura = her kalem için **kullanım × birim fiyat** + sabit plan ücretleri. Fiyatı siz belirleyemezsiniz; kullanımı
ve mimariyi belirlersiniz. Bu not fiyat vermez (çabuk değişir); kullanımı nasıl hesaplayacağınızı ve nerede
patlayacağını söyler. Birim fiyatları sağlayıcının **güncel** fiyat sayfasından alıp okuduğunuz tarihle yazın.

Sürprizlerin çoğu iki yerden gelir: **sizin denetlemediğiniz trafikle büyüyen kalemler** (çıkış trafiği, işlev
çağrısı, günlük, dil modeli belirteci) ve **unutulan kaynaklar** (deneme ortamları, eski yedekler, bağlı olmayan
diskler, sabit IP'ler).

## Maliyeti belirleyen kalemler

| Kalem                         | Neye göre ölçülür                                   | Nasıl düşer                                              | Sürpriz kaynağı                                         |
| ----------------------------- | --------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| İşlem (CPU / örnek-saat)      | Çalışma süresi × boyut × kopya                      | Doğru boyut; trafik yoksa uyku                           | Unutulan kopyalar, açık kalan deneme ortamı             |
| Bellek                        | Plan boyutu çoğu zaman belleğe göre seçilir          | Bellek sızıntısını bulmak, önbelleği sınırlamak          | Bellek aşımı → yeniden başlatma → büyük plana geçme     |
| Disk / birim                  | **Ayrılan** GB × ay (kullanılan değil)              | Küçük başlayın; büyütmek kolay, küçültmek çoğu zaman olanaksız | Silinen servisin kalan diski                     |
| Yedek / anlık görüntü         | Saklanan GB × ay                                    | Saklama düzeni (GFS)                                     | Hiç silinmeyen günlük yedekler                          |
| Çıkış trafiği (egress)        | Sunucudan dışarı giden GB                           | Görselleri küçültmek, CDN, önbellek başlıkları           | Büyük dosya indirmeleri, botlar, bölgeler arası trafik  |
| Yönetilen veritabanı          | Örnek boyutu + depolama (+ G/Ç)                     | Dizin, doğru boyut                                       | Boşta da ücret; okuma kopyaları                         |
| İşlev çağrısı (sunucusuz)     | Çağrı × süre × bellek                               | Önbellek, toplu iş                                       | Kendini çağıran döngü, bot trafiği                      |
| E-posta                       | Gönderilen ileti                                    | Toplu gönderimi işlemselden ayırmak                      | Kayıt formu spam'i ile binlerce doğrulama e-postası     |
| Günlük ve izleme              | Alınan GB + saklama süresi                          | `info` düzeyi, kısa saklama, sağlık yoklamalarını süzmek | `debug` açık unutuldu                                   |
| Dil modeli API'si             | Giren + çıkan belirteç                              | Kısa istem, küçük model, önbellek ([`yz`](../../yz/README.md)) | Sonsuz ajan döngüsü, istemciye açık anahtar      |
| Alan adı                      | Yıllık                                              | Otomatik yenileme                                        | Yenileme unutulunca kesinti                             |

## Kullanımı hesaplamak

Önce sağlayıcıdan bağımsız **kullanım tablosunu** çıkarın; fiyatla çarpmak son adımdır. Varsayımları açık yazın ve
yayından sonra günlükten ölçtüklerinizle değiştirin:

```python calistir
# Sağlayıcıdan bağımsız KULLANIM tablosu. Fiyatla çarpmayı siz, sağlayıcının güncel sayfasıyla yaparsınız.
GUN = 30
kullanici = 2_000  # aylık etkin kullanıcı (varsayım)
istek_kisi_gun = 40  # API isteği (varsayım; günlükten ölçün)
api_yanit_kb = 8
sayfa_kisi_gun = 6
gorsel_mb_sayfa = 1.5  # boyutlandırılmamış telefon fotoğrafları
veritabani_gb = 0.5


def binlik(x: float) -> str:
    return f"{x:,.0f}".replace(",", ".")


istek = kullanici * istek_kisi_gun * GUN
cikis_api_gb = istek * api_yanit_kb / 1024**2
cikis_gorsel_gb = kullanici * sayfa_kisi_gun * GUN * gorsel_mb_sayfa / 1024
cikis_gorsel_kucuk_gb = cikis_gorsel_gb * 0.2  # boyutlandırma + WebP/AVIF ile ~5 kat küçük (varsayım)
saat_her_zaman = 24 * GUN
saat_uyuyan = 10 * GUN  # günde ~10 saat trafik alan, boşta uyuyan servis
yedek_gfs_gb = veritabani_gb * 20  # GFS: 7 günlük + 4 haftalık + 12 aylık ≈ 20 kopya
yedek_hepsi_gb = veritabani_gb * 365  # hiç silinmeyen günlük yedek, bir yıl sonra
gunluk_gb = istek * 300 / 1024**3  # istek başına ~300 bayt JSON satırı

tablo = [
    ("API isteği", f"{binlik(istek)} istek"),
    ("Çıkış trafiği: API yanıtları", f"{cikis_api_gb:.0f} GB"),
    ("Çıkış trafiği: görseller (ham)", f"{cikis_gorsel_gb:.0f} GB"),
    ("Çıkış trafiği: görseller (küçültülmüş)", f"{cikis_gorsel_kucuk_gb:.0f} GB"),
    ("İşlem: her zaman açık / uyuyan", f"{saat_her_zaman} / {saat_uyuyan} örnek-saat"),
    ("Yedek depolama: GFS / hiç silmeden (1 yıl)", f"{yedek_gfs_gb:.0f} / {yedek_hepsi_gb:.0f} GB"),
    ("Günlük (info düzeyi)", f"{gunluk_gb:.1f} GB".replace(".", ",")),
]
for kalem, miktar in tablo:
    print(f"{kalem:44} {miktar}")
assert cikis_gorsel_gb > 25 * cikis_api_gb  # çıkış trafiğini görseller belirliyor
```

```cikti
API isteği                                   2.400.000 istek
Çıkış trafiği: API yanıtları                 18 GB
Çıkış trafiği: görseller (ham)               527 GB
Çıkış trafiği: görseller (küçültülmüş)       105 GB
İşlem: her zaman açık / uyuyan               720 / 300 örnek-saat
Yedek depolama: GFS / hiç silmeden (1 yıl)   10 / 182 GB
Günlük (info düzeyi)                         0,7 GB
```

Okuma: bu varsayımlarla çıkış trafiğini API değil **görseller** belirliyor; ilk iş görselleri boyutlandırmak ve
önbelleğe almaktır, büyük plana geçmek değil. Sonra kullanıcı sayısını 10 katına çıkarıp tabloyu yeniden üretin:
hangi kalem doğrusal, hangisi sıçrayarak büyüyor (plan basamağı, yeni kopya)? Kapasite tahmininin ayrıntısı:
[Kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md).

## Boşta uyuyan servisler

Ucuz planlar ve sunucusuz servisler trafik yokken **uyur**; ilk istek uyandırır.

| Konu                          | Uyuyan servis                                          | Her zaman açık servis          |
| ----------------------------- | ------------------------------------------------------ | ------------------------------ |
| İşlem maliyeti                | Yalnız çalıştığı süre                                  | Ay boyu                        |
| İlk istek                     | Soğuk başlangıç: saniyeler                             | Hemen                          |
| Uygulama içi zamanlayıcı      | **Çalışmaz** (saatlik bakım, gece e-postası)           | Çalışır                        |
| Açık bağlantılar (SSE, WebSocket) | Uykuyla kopar                                      | Sürer                          |
| Yerel disk                    | Çoğu zaman uyanışta sıfırlanır ([Yayın yolu](yayin-yolu-secimi.md)) | Plana göre      |
| Dışarıdan izleme              | Yoklama servisi uyandırır: kullanım sayılır            | Etkisiz                        |

"Uyumasın diye dışarıdan dürtmek" hem kullanım yazar hem de platformun kurallarına aykırı olabilir. Uyku sorun
oluyorsa her zaman açık plana geçin; zamanlanmış işi dışarıdan tetikleyin ([CI/CD](ci-cd.md) → `schedule`).

## Kaynak boyutlandırma

- **Bellek planı belirler.** Tepe kullanımı ölçün (platform paneli, `docker stats`, `ps`). Çıkış kodu 137 ile yeniden
  başlatma bellek aşımıdır. Deponun kökündeki [`render.yaml`](../../../render.yaml) TV+'yı dar bellekli planda tutmak
  için Node'un yığınını ve glibc arenalarını sınırlıyor (`NODE_OPTIONS=--max-old-space-size=256`,
  `MALLOC_ARENA_MAX=2`; dosyadaki nota göre tepe kullanım ölçülerek ayarlanmış). Önce ölçün, sonra sınırlayın.
- **CPU'yu bazen güvenlik ister:** parola özeti bilerek pahalıdır. Havuzdaki uygulamada istek başına ~0,15 sn ve
  16 MiB, aynı anda en çok 2 ([`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ölçekleme"). Toplu giriş
  saatlerinde CPU'yu bu belirler.
- **Disk ayrılan boyuttan ücretlenir** ve çoğu platformda küçültülemez: ölçülen büyüme hızına göre küçük başlayın.
- Dikey büyütme (daha büyük plan) ilk çaredir; yatay büyütme (çok kopya) SQLite'ta yoktur
  ([Ölçekleme temelleri](../40-sistem-tasarimi/olcekleme-temelleri.md)).

## Sınır ve uyarı koymak

- **Bütçe uyarısı:** ayın %50, %80, %100'ünde; ayrıca **gidişat** uyarısı (aşağıda). Uyarı iki kişiye gitsin.
- **Sert sınır** (harcama tavanı) varsa açın; yoksa en azından kaynak kotaları: en çok kopya sayısı, kendiliğinden
  ölçeklemenin üst sınırı, işlev eşzamanlılığı.
- **Uygulama içi sınırlar:** hız sınırı, yükleme boyutu, kayıt formunda bot önlemi. Dil modeli ve e-posta API
  anahtarlarında sağlayıcının kullanım sınırını açın.
- **Ayda bir faturayı satır satır okuyun:** tanımadığınız her kalem ya unutulmuş bir kaynaktır ya da bir sızıntı.
- Kaynakları adlandırın/etiketleyin (proje, ortam); deneme ortamlarına kapanma tarihi koyun.

Ay sonunu beklemeyin; gidişata ve günlük sıçramaya bakın:

```python calistir
import calendar
from datetime import date
from statistics import median


def butce_uyarilari(gunluk_harcama: list[float], bugun: date, aylik_butce: float) -> list[str]:
    """gunluk_harcama: ayın 1'inden bugüne her günün harcaması (sağlayıcının faturalama panelinden)."""
    uyarilar = []
    harcanan = sum(gunluk_harcama)
    ay_gun = calendar.monthrange(bugun.year, bugun.month)[1]
    tahmin = harcanan / bugun.day * ay_gun  # bugünkü gidişatla ay sonu
    if tahmin > aylik_butce:
        oran = harcanan / aylik_butce * 100
        uyarilar.append(f"gidişat: ay sonu ≈ {tahmin:.0f} birim, bütçe {aylik_butce:.0f} (şimdiye dek %{oran:.0f})")
    onceki = gunluk_harcama[:-1]
    if len(onceki) >= 7 and gunluk_harcama[-1] > 3 * median(onceki):
        uyarilar.append(f"sıçrama: bugün {gunluk_harcama[-1]:.0f} birim, olağan gün ≈ {median(onceki):.0f}")
    return uyarilar


normal = [3.0] * 10
assert butce_uyarilari(normal, date(2026, 11, 10), aylik_butce=100) == []
artan = [3.0] * 9 + [16.0]  # bir bot ya da sonsuz döngü harcamayı birden artırdı
for uyari in butce_uyarilari(artan, date(2026, 11, 10), aylik_butce=100):
    print("UYARI:", uyari)
```

```cikti
UYARI: gidişat: ay sonu ≈ 129 birim, bütçe 100 (şimdiye dek %43)
UYARI: sıçrama: bugün 16 birim, olağan gün ≈ 3
```

Harcama %43'teyken %50 uyarısı henüz çalmamıştır; gidişat uyarısı ise bugünden haber verir. Sıçrama uyarısı bot
saldırısını, kendini çağıran bir döngüyü ya da açık kalmış bir anahtarı günler önce yakalar.

## Tuzaklar

| Belirti                                                          | Neden                                                       | Çözüm                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Faturanın çoğu "çıkış trafiği"                                   | Büyük görseller ve dosyalar doğrudan sunucudan              | Boyutlandırma, modern biçimler, CDN, uzun önbellek                  |
| Kullanılmayan servis için ödeme sürüyor                          | Silinen servisin diski, yedeği, IP'si kaldı                 | Ayda bir kaynak listesi; etiketler; kapanma tarihi                  |
| Uygulama sık yeniden başlıyor, büyük plan önerildi               | Bellek sızıntısı ya da sınırsız önbellek                    | Önce tepe belleği ölçün; sızıntıyı düzeltin                         |
| Ucuz planda gece işleri hiç çalışmamış                           | Servis uyuyordu                                             | Dışarıdan tetikleme ya da her zaman açık plan                       |
| İlk kullanıcı her sabah uzun bekliyor                            | Soğuk başlangıç                                             | Her zaman açık plan; ya da "uyanıyor" ekranı                        |
| Bir gecede yüksek fatura                                         | Bot trafiği, sonsuz döngü, sızan anahtar; sınır yok         | Kotalar, hız sınırı, gidişat ve sıçrama uyarısı                     |
| Dil modeli faturası beklenenin katları                           | Ajan döngüsü sınırsız; anahtar istemcide                    | Adım ve belirteç sınırı; anahtar yalnız sunucuda                    |
| Günlük faturası uygulamanınkini geçti                            | `debug` düzeyi, uzun saklama                                | `info`, kısa saklama, gürültülü satırları süzün                     |
| Disk küçültülemiyor                                              | Ayrılan boyut ücretlenir, küçültme yok                      | Küçük başlayın; büyümeyi izleyin                                    |
| Fiyat tablosu modelden geldi, yanlış çıktı                       | Ezberden fiyat                                              | Fiyat yalnız sağlayıcının güncel sayfasından, tarihle               |

## Denetim listesi

- [ ] Kullanım tablosu (istek, çıkış GB, örnek-saat, disk, yedek, günlük, e-posta) varsayımlarıyla yazılı.
- [ ] Birim fiyatlar sağlayıcının güncel sayfasından, okunma tarihiyle `docs/KARARLAR.md`'de.
- [ ] Bütçe uyarıları (%50/%80/%100) ve gidişat uyarısı açık; iki kişiye gidiyor.
- [ ] Kopya sayısı ve kendiliğinden ölçekleme üst sınırı tanımlı; dış API anahtarlarında kullanım sınırı var.
- [ ] Görseller boyutlandırılmış; özetli dosyalar uzun önbellekte.
- [ ] Yedek saklama düzeni var; eski yedekler siliniyor.
- [ ] Tepe bellek ölçüldü; plan buna göre seçildi.
- [ ] Ayda bir fatura satır satır okunuyor; kullanılmayan kaynak kalmadı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Fiyat yazma. Önce kullanım tablosunu çıkar (istek, çıkış GB, örnek-saat, disk GB, yedek GB,
  günlük GB, e-posta adedi); her satırın varsayımını yaz. Sonra 'fiyatı sağlayıcının güncel sayfasından al' diye
  boş bir fiyat sütunu bırak. 10 kat kullanıcıda hangi kalemin büyüdüğünü göster."
- **Modelin tipik hatası:** ezberden fiyat ve ücretsiz katman sınırı yazmak; yalnız işlem maliyetini hesaplayıp
  çıkış trafiğini ve yedeği unutmak; bellek sorununa "daha büyük plan" demek; uyumayı engellemek için dışarıdan
  dürtme önermek.
- **Çıktıda denetleyin:** tabloda para birimi ve rakamlı fiyat var mı (olmamalı, ya da kaynağı ve tarihi yazmalı);
  çıkış trafiği satırı var mı; uyarı ve sınır adımları var mı.

## İlgili

- [Yayın yolu seçimi](yayin-yolu-secimi.md) — barındırma türleri, uyku ve geçici disk
- [Kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md) · [Ölçekleme temelleri](../40-sistem-tasarimi/olcekleme-temelleri.md)
- [İzleme ve uyarı](izleme-ve-uyari.md) — uyarı eşiği ve gürültü
- [Veritabanı yedekleme](veritabani-yedekleme.md) — GFS saklama
- Çalışan karşılıklar: kök [`render.yaml`](../../../render.yaml) (bellek sınırları),
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ölçekleme ve sınırlar"
