---
baslik: Ölçekleme temelleri: tek makine, darboğaz ve önce ölçmek
ozet: Tek sunucunun ne kadar taşıdığını hesaplamak, darboğazı bulmak, dikey ve yatay büyüme arasında seçim, durum bilgisiz sunucu ve erken dağıtıklaşma tuzağı; kuyruk benzetimiyle.
etiketler: [olcekleme, kapasite, darbogaz, performans, mimari]
duzey: orta
guncellik: 2026-11
---

# Ölçekleme temelleri: tek makine, darboğaz ve önce ölçmek

> Bu notu ne zaman okumalı: "site yavaşladı, daha büyük sunucu mu alalım, ikinci sunucu mu koyalım?" sorusunda;
> bir model "mikroservis + Kubernetes + Redis" önerdiğinde; ilk yayından önce "bu kaç kullanıcı taşır?" diye
> sorulduğunda.

## Temel fikir

- **Ölçekleme**, yük artarken gecikmeyi ve hata oranını kabul edilen sınırda tutmaktır. Sıra hep aynıdır:
  ölç → darboğazı bul → yalnız darboğazı rahatlat → yeniden ölç.
- Sistem **en yavaş parçası kadar** taşır. Darboğaz olmayan parçayı büyütmek hiçbir şey kazandırmaz; çoğu zaman
  darboğazı kötüleştirir (daha çok uygulama sunucusu = veritabanına daha çok bağlantı).
- Doluluk %100'e yaklaştıkça gecikme doğrusal değil **patlayarak** artar. Kapasite %60–70 doluluğa göre planlanır.
- Tek makine çoğu ürünün sandığından çok fazlasını taşır. Asıl kayıp çoğunlukla eksik dizin, N+1 sorgu, istek
  içinde yapılan yavaş iş (e-posta, PDF, dil modeli çağrısı) ve önbelleğe alınmayan pahalı hesaptır.
- Yatay büyümenin ön koşulu **durum bilgisiz** (stateless) sunucudur: herhangi bir süreç ölse kullanıcı fark etmez.

## Karar tablosu

| Durum                                                     | Seçim                                                          | Neden                                                |
| --------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| "Yavaş" şikâyeti var, ölçüm yok                           | Önce ölç: uç başına p95 gecikme, CPU, veritabanı süresi payı   | Darboğazı bilmeden yapılan büyütme boşa para          |
| Tek uç yavaş, CPU düşük                                    | Sorgu planı, dizin, N+1 ([Veritabanı ölçekleme](veritabani-olcekleme.md)) | Yavaşlığın en sık nedeni                  |
| CPU sürekli > %70, tek süreç çalışıyor                    | Süreç/işçi sayısını çekirdek sayısına çıkar, sonra dikey büyüt | En ucuz adım, kod değişmez                           |
| Okuma ağırlıklı yük veritabanını boğuyor                  | Önbellek, sonra okuma kopyası                                  | Okumayı veritabanından uzaklaştırır                  |
| Yazma veritabanını boğuyor                                 | İşlemleri kısalt, toplu yaz, kuyruğa al; bölümleme en son      | Bölümleme en pahalı ve geri dönüşü en zor adım       |
| İstek içinde saniyeler süren iş var                        | Arka plan kuyruğu ([Kuyruk ve olaylar](kuyruk-ve-olaylar.md))  | İstek süresi ve eşzamanlı bağlantı sayısı düşer       |
| Statik dosya ve görsel bant genişliğini yiyor             | CDN ([Önbellek katmanları](onbellek-katmanlari.md))            | En ucuz büyük kazanç                                 |
| Tek makine ölçülmüş olarak yetmiyor ya da kesinti kabul edilemez | Yatay: 2+ durum bilgisiz sunucu + yük dengeleyici        | Hem kapasite hem yedeklilik                          |
| Sorun yok ama "ileride büyürüz"                            | Hiçbir şey yapma; ölçümü ve uyarıyı kur                       | Erken dağıtıklaşma bugünden bedel ödetir             |

## Doluluk ve gecikme: neden %70

Bir sunucu istekleri sırayla işler; istekler rastgele zamanlarda gelir. Doluluk arttıkça istek, işlenmeden önce
**sırada** bekler. Aşağıdaki benzetim tek sunuculu kuyruğu (her istek ortalama 10 ms iş) farklı doluluklarda koşar
ve kuramsal formülle (ortalama gecikme = hizmet süresi / (1 − doluluk)) karşılaştırır:

```python calistir
import random


def benzet(doluluk: float, hizmet_ms: float = 10.0, adet: int = 200_000, tohum: int = 3) -> tuple[float, float]:
    """Tek sunuculu kuyruk: istekler rastgele gelir, sunucu sırayla işler. (ortalama, p99) gecikme döner."""
    rng = random.Random(tohum)
    gelis_hizi = doluluk / hizmet_ms  # ms başına istek
    saat = bos_kalacagi_an = 0.0
    gecikmeler = []
    for _ in range(adet):
        saat += rng.expovariate(gelis_hizi)
        basla = max(saat, bos_kalacagi_an)  # sunucu meşgulse sırada bekler
        bos_kalacagi_an = basla + rng.expovariate(1 / hizmet_ms)
        gecikmeler.append(bos_kalacagi_an - saat)
    gecikmeler.sort()
    return sum(gecikmeler) / adet, gecikmeler[int(adet * 0.99)]


onceki = 0.0
for doluluk in (0.5, 0.7, 0.8, 0.9, 0.95):
    ortalama, p99 = benzet(doluluk)
    kuram = 10.0 / (1 - doluluk)
    assert abs(ortalama - kuram) / kuram < 0.15 and ortalama > onceki
    onceki = ortalama
    print(f"doluluk %{doluluk * 100:.0f}: ortalama {ortalama:4.0f} ms, p99 {p99:5.0f} ms (kuram {kuram:.0f} ms)")
```

```cikti
doluluk %50: ortalama   20 ms, p99    93 ms (kuram 20 ms)
doluluk %70: ortalama   34 ms, p99   157 ms (kuram 33 ms)
doluluk %80: ortalama   51 ms, p99   234 ms (kuram 50 ms)
doluluk %90: ortalama  102 ms, p99   458 ms (kuram 100 ms)
doluluk %95: ortalama  198 ms, p99   854 ms (kuram 200 ms)
```

Okuma: iş 10 ms olduğu hâlde %90 dolulukta kullanıcı ortalama 100 ms, her yüz istekten birinde yarım saniye bekler.
%90'dan %95'e çıkmak gecikmeyi **ikiye katlar**. Model tek işçilidir; çok işçili kaynakta eğri daha geç ama daha
sert kırılır (Erlang C formülüyle hesap: 16 işçide %90 dolulukta gecikme hizmet süresinin ~1,4 katı, %95'te ~2 katı,
%100'e yaklaşınca sonsuz). Yük patlamalı gelince anlık doluluk ortalamanın çok üstüne çıkar. Bu yüzden CPU,
veritabanı bağlantısı, işçi havuzu gibi her kaynakta ortalama doluluk hedefi %60–70; %80'i geçen kaynak için uyarı
kurulur ([Gözlemlenebilirlik](gozlemlenebilirlik.md)).

## Tek makine ne kadar taşır: hesap

Ezber sayı yerine kendi sayınızı hesaplayın. Gereken iki ölçüm: istek başına **işlemci süresi** (sürecin toplam
CPU saniyesi / aynı sürede işlenen istek sayısı) ve istek başına **veritabanı süresi** (sorgu sayısı × ortalama
sorgu süresi). Kapasite = çekirdek × (1000 / istek başına ms) × hedef doluluk. Sistem, zincirin en zayıf halkası
kadar taşır:

```python calistir
def kapasite(cekirdek: int, istek_basina_ms: float, doluluk: float = 0.7) -> float:
    """Bir kaynağın güvenle taşıdığı istek/sn: çekirdek × (1000 / istek başına iş) × hedef doluluk."""
    return cekirdek * 1000 / istek_basina_ms * doluluk


def sistem(uygulama_sunucusu: int, onbellek_isabeti: float) -> tuple[float, float, float]:
    uygulama = uygulama_sunucusu * kapasite(cekirdek=4, istek_basina_ms=4.0)
    vt_isi_ms = 3 * 2.0 * (1 - onbellek_isabeti)  # istek başına 3 sorgu × 2 ms; isabet edenler VT'ye gitmez
    veritabani = kapasite(cekirdek=4, istek_basina_ms=vt_isi_ms)
    return uygulama, veritabani, min(uygulama, veritabani)  # zincir en zayıf halkası kadar taşır


for sunucu, isabet in [(1, 0.0), (2, 0.0), (1, 0.8), (2, 0.8)]:
    u, v, s = sistem(sunucu, isabet)
    darbogaz = "veritabanı" if v < u else "uygulama"
    print(f"{sunucu} sunucu, önbellek %{isabet * 100:.0f}: sistem {s:5.0f} istek/sn (darboğaz: {darbogaz})")

assert sistem(2, 0.0)[2] == sistem(1, 0.0)[2]  # VT darboğazken ikinci sunucu HİÇBİR şey kazandırmaz
assert sistem(1, 0.8)[2] > sistem(1, 0.0)[2]  # darboğazı rahatlatmak kazandırır
assert sistem(2, 0.8)[2] == 2 * sistem(1, 0.8)[2]  # artık darboğaz uygulama: sunucu eklemek işe yarar

tepe = 2_000_000 / 86_400 * 5  # günde 2 milyon istek, tepe çarpanı 5 (varsayım; ölçün)
print(f"günde 2 milyon istek → tepede ~{tepe:.0f} istek/sn (tek sunucu kapasitesinin %{tepe / 700 * 100:.0f} kadarı)")
```

```cikti
1 sunucu, önbellek %0: sistem   467 istek/sn (darboğaz: veritabanı)
2 sunucu, önbellek %0: sistem   467 istek/sn (darboğaz: veritabanı)
1 sunucu, önbellek %80: sistem   700 istek/sn (darboğaz: uygulama)
2 sunucu, önbellek %80: sistem  1400 istek/sn (darboğaz: uygulama)
günde 2 milyon istek → tepede ~116 istek/sn (tek sunucu kapasitesinin %17 kadarı)
```

İki ders: (1) darboğaz yer değiştirir; her iyileştirmeden sonra yeniden bakın. (2) Günde milyonlarca istek bile
çoğu zaman tek makinenin işidir. Hesabın ayrıntısı ve tepe çarpanının nasıl bulunacağı:
[Kapasite tahmini](kapasite-tahmini.md).

## Dikey mi, yatay mı

| Ölçüt                 | Dikey (daha büyük makine)                 | Yatay (daha çok makine)                                     |
| --------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Kod değişikliği       | Yok                                       | Durum bilgisiz sunucu şart (aşağıdaki tablo)                |
| Üst sınır             | Var (en büyük makine), ama yüksektir       | Pratikte yok; darboğaz veritabanına kayar                   |
| Kesinti               | Tek makine = tek arıza noktası            | Biri ölünce ötekiler taşır (en az 2 kopya)                  |
| Yeni sorunlar         | Yok                                       | Yük dengeleyici, dağıtım sırası, saat, paylaşılan durum     |
| Ne zaman              | İlk büyüme adımı; veritabanı için uzun süre | Kesintisizlik gerekince ya da dikey sınır ölçülerek aşılınca |

Veritabanı dikey büyütmenin en çok kazandırdığı yerdir: yatay büyütmesi (kopya, bölümleme) en pahalı iştir.

## Durum bilgisiz sunucu: süreçten dışarı alınacaklar

Tek sunucuda bellekte tutulan her şey, ikinci sunucu eklenince **sessizce** bozulur:

| Durum                         | Tek sunucuda          | Çok sunucuda belirti                                 | Taşınacağı yer                                   |
| ----------------------------- | --------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Oturum                        | Süreç belleği         | Rastgele "oturumunuz kapandı"                        | Veritabanı ya da paylaşılan depo                 |
| Yüklenen dosya                | Yerel disk            | Dosya bazen var bazen yok                            | Nesne deposu ([Dosya paylaşımı](ornek-dosya-paylasimi.md)) |
| Hız sınırı sayacı             | Bellek                | Sınır, sunucu sayısı kadar gevşer                    | Paylaşılan sayaç                                 |
| Süreç içi önbellek            | Bellek                | Sunucular farklı (bayat) yanıt verir                 | Kısa süre + kabul ya da paylaşılan önbellek      |
| Anlık bildirim bağlantıları   | Bellek                | Bildirim, başka sunucuya bağlı kullanıcıya gitmez    | Yayın/abone (ör. Postgres LISTEN/NOTIFY, Redis)  |
| Zamanlanmış iş (cron)         | Tek kez çalışır       | Her sunucuda çalışır: herkese 3 e-posta              | Tek çalıştırıcı ya da veritabanında iş kaydı     |
| Bellekteki iş kuyruğu         | Süreçle yaşar         | Dağıtımda bekleyen işler kaybolur                    | Kalıcı kuyruk ([Kuyruk ve olaylar](kuyruk-ve-olaylar.md)) |
| Yerel SQLite dosyası          | Tek dosya             | Her sunucu ayrı veritabanı görür                     | Sunucu veritabanı (Postgres)                     |

Zamanlanmış iş tuzağı en sinsisidir; çözümü veritabanında "bu işi bugün kim aldı" kaydıdır:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE eposta (kullanici TEXT, gun TEXT)")
db.execute("CREATE TABLE is_kaydi (is_adi TEXT, gun TEXT, sunucu TEXT, PRIMARY KEY (is_adi, gun))")
KULLANICILAR = ["ayse", "mehmet", "zeynep"]


def gunluk_ozet_yanlis(sunucu: str, gun: str) -> None:
    for k in KULLANICILAR:  # her sunucunun zamanlayıcısı 09:00'da bunu çalıştırır
        db.execute("INSERT INTO eposta VALUES (?, ?)", (k, gun))


def gunluk_ozet(sunucu: str, gun: str) -> None:
    # (iş, gün) için tek satır yazılabilir: ilk yazan çalıştırır, ötekiler sessizce çekilir
    alindi = db.execute("INSERT OR IGNORE INTO is_kaydi VALUES ('gunluk-ozet', ?, ?)", (gun, sunucu)).rowcount
    if alindi == 1:
        for k in KULLANICILAR:
            db.execute("INSERT INTO eposta VALUES (?, ?)", (k, gun))


for sunucu in ("a", "b", "c"):  # yatay büyüdük: 3 kopya
    gunluk_ozet_yanlis(sunucu, "2026-11-16")
assert db.execute("SELECT count(*) FROM eposta").fetchone()[0] == 9  # herkese 3 e-posta

db.execute("DELETE FROM eposta")
for sunucu in ("a", "b", "c"):
    gunluk_ozet(sunucu, "2026-11-17")
assert db.execute("SELECT count(*) FROM eposta").fetchone()[0] == 3  # herkese 1 e-posta
print("3 sunucu: yanlış 9 e-posta, doğru 3 e-posta")
```

```cikti
3 sunucu: yanlış 9 e-posta, doğru 3 e-posta
```

Kira süreli kilitle tek çalıştırıcı seçme ve zamanlanmış işlerin öteki tuzakları:
[Arka plan işleri](../30-arkauc/arka-plan-isleri.md) → "Zamanlanmış işler ve çifte çalışma". Durumsuz sunucunun kod
tarafı (bağımlılıkları dışarıdan verme, düzgün kapanış, sağlık ucu): [Sunucu mimarisi](../30-arkauc/sunucu-mimarisi.md).

Havuzdaki API bu sınırları açıkça yazar: hız sınırı bellek içidir
([`rateLimit.ts`](../../uygulama/api/src/http/rateLimit.ts)), anlık bildirim merkezi tek süreçlidir
([`hub.ts`](../../uygulama/api/src/modules/events/hub.ts)), veritabanı tek SQLite dosyasıdır. Çok kopyaya geçişin
adımları: [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ölçekleme ve sınırlar".

## Önce ölç: neyi, nasıl

1. **Uç başına gecikme dağılımı** (p50, p95, p99) ve istek sayısı. Ortalama yanıltır:
   [Kapasite tahmini](kapasite-tahmini.md) → yüzdelikler.
2. **Kaynak doluluğu:** CPU, bellek, disk, veritabanı bağlantı havuzunda bekleme süresi, kuyruk derinliği.
3. **Zaman nereye gidiyor:** istek süresinin ne kadarı veritabanında, ne kadarı dış çağrıda, ne kadarı hesapta.
   Basit yol: her istek için toplam süreyi ve veritabanı süresini aynı günlük satırına yazmak.
4. **Yük testi** gerçekçi veriyle: 100 satırlık veritabanında eksik dizin görünmez. Üretim boyutunda sentetik veri
   üretin, testi başka bir makineden koşun, kademeli artırın ve gecikmenin kırıldığı noktayı not edin.
5. Her değişiklikten sonra aynı ölçümü yineleyin; iyileşme yoksa değişikliği geri alın.

Tek bir yavaş işlevi ya da sorguyu ölçme yöntemi (profil, Amdahl yasası, ölçüm hataları):
[Performans yöntemi](../00-yontem/performans-yontemi.md).

## Erken dağıtıklaşma tuzağı

İkinci bir servis, kuyruk sistemi ya da veritabanı kopyası eklemenin bugünden ödenen bedeli: ağ çağrısı başına
gecikme ve kısmi arıza, iki yere yazma tutarsızlığı, dağıtım sırası, daha çok izleme ve daha zor hata ayıklama
([Dağıtık sistem yanılgıları](dagitik-sistem-yanilgilari.md)). Bir kişilik ekip ve küçük bir modelle bu bedel
ürünü yavaşlatır. Kural: **yeni makine ya da servis, ancak ölçülmüş bir darboğaz başka yolla çözülemiyorsa ya
da kesinti kabul edilemiyorsa** eklenir. Başlangıç mimarisi: [Monolit ve servisler](monolit-ve-servisler.md).

## Tuzaklar

| Belirti                                                        | Neden                                                         | Çözüm                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Sunucu eklendi, site yine yavaş                                 | Darboğaz veritabanıydı                                        | Önce ölç; darboğaz kaynağını rahatlat                          |
| Sunucu eklendi, veritabanı "çok fazla bağlantı" hatası verdi    | Her sunucu kendi bağlantı havuzunu açtı                       | Havuz boyu × sunucu sayısı ≤ veritabanı sınırı; bağlantı vekili |
| CPU %75'te "henüz yer var" denirken gecikme ikiye katlandı      | Kuyruk etkisi: doluluk %70'ten sonra gecikme patlar           | Hedef doluluk %60–70; uyarıyı %80'e kur                        |
| İkinci sunucudan sonra kullanıcılar rastgele oturumdan düşüyor | Oturum süreç belleğindeydi                                    | Oturumu veritabanına taşı                                      |
| Yatay büyümeden sonra herkese iki e-posta gidiyor              | Zamanlanmış iş her kopyada çalışıyor                          | Veritabanında iş kaydı ya da tek çalıştırıcı                    |
| Yük testinde her şey hızlı, üretimde yavaş                     | Test veritabanı küçük, önbellek sıcak, test aynı makineden    | Üretim boyutunda veri, soğuk başlangıç, ayrı makine            |
| Ortalama gecikme iyi, kullanıcılar şikâyetçi                    | Uzun kuyruk ortalamada kaybolur                               | p95/p99 izle                                                   |
| "Ölçeklenebilir olsun" diye ilk günden mikroservis             | Tasarım kararı ölçümsüz verildi                               | Modüler monolit; ayırma ölçütleri gelene dek bekle             |
| Dağıtım sırasında istekler hata veriyor                        | Süreç kapanırken yarım istekler kesiliyor                     | Düzgün kapanış: yeni istek alma, süren isteği bitir, sonra çık |

## Denetim listesi

- [ ] Uç başına p50/p95/p99 gecikme, istek sayısı ve hata oranı ölçülüyor.
- [ ] CPU, bellek, disk, bağlantı havuzu ve kuyruk derinliği için %80 uyarısı var.
- [ ] İstek başına CPU ve veritabanı süresi bir kez ölçüldü; tek sunucu kapasitesi hesaplanıp yazıldı.
- [ ] Darboğaz adıyla biliniyor ("veritabanı yazma kilidi", "PDF üretimi") ve önerilen değişiklik onu hedefliyor.
- [ ] İstek içinde 1 saniyeden uzun süren iş yok; varsa arka plan işine taşındı.
- [ ] Yatay büyümeden önce: oturum, dosya, sayaç, zamanlanmış iş, anlık bildirim süreç dışında.
- [ ] Her değişiklikten sonra aynı ölçüm yinelendi; kazanç sayıyla yazıldı.
- [ ] Yeni bir servis ya da altyapı parçası için ölçüme dayalı gerekçe yazılı ([Tasarım kararı şablonu](tasarim-karari-sablonu.md)).

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce ölçüm öner, sonra değişiklik. Hangi kaynağın darboğaz olduğunu sayıyla göster (istek
  başına ms, doluluk). Yeni servis, kuyruk sistemi ya da önbellek sunucusu ekleme; önce dizin, sorgu ve istek
  içindeki yavaş iş."
- **Modelin tipik hatası:** belirtiyi duyar duymaz altyapı önerir (Redis, Kubernetes, mikroservis); darboğazı
  ölçmeden "yatay ölçekle" der; durum bilgisiz olmayan bir uygulamayı çok kopyaya çıkarır ve zamanlanmış işleri,
  oturumu, hız sınırını unutur.
- **Çıktıda arayın:** önerinin hangi ölçüme dayandığı; "N kopya" geçen her yerde yukarıdaki durum tablosunun
  satırları tek tek ele alınmış mı; kapasite hesabında doluluk payı (×0,7) var mı.
- **Doğrulama:** değişiklikten önce ve sonra aynı yük testini koşturun; sayıları yan yana isteyin.

## İlgili

- [Kapasite tahmini](kapasite-tahmini.md) · [Önbellek katmanları](onbellek-katmanlari.md) ·
  [Veritabanı ölçekleme](veritabani-olcekleme.md) · [Dayanıklılık kalıpları](dayaniklilik-kaliplari.md)
- [Monolit ve servisler](monolit-ve-servisler.md) · [Gözlemlenebilirlik](gozlemlenebilirlik.md) ·
  [Barındırma maliyeti ve kaynak](../60-devops/maliyet-ve-kaynak.md) (dikey büyütmenin bedeli, boyutlandırma)
- Havuzdaki tek sunuculu gerçekleme ve çok kopyaya geçiş notu:
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) (§7),
  [`uygulama/docs/MIMARI.md`](../../uygulama/docs/MIMARI.md)
