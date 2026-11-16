---
baslik: Yayın yolu seçimi: nereye ve nasıl barındırılır
ozet: Durağan site, sunuculu ve veritabanlı uygulama için barındırma türü seçimi; geçici disk tuzağı, bölge ve gecikme, sağlayıcıya kilitlenme ve çıkış yolu.
etiketler: [devops, barindirma, paas, vps, sqlite, gecikme]
duzey: temel
guncellik: 2026-11
---

# Yayın yolu seçimi: nereye ve nasıl barındırılır

> Bu notu ne zaman okumalı: bir uygulamayı ya da siteyi ilk kez yayına alacakken; "ücretsiz katmana koyalım"
> denince; veriler bir sabah kaybolunca; sağlayıcı değiştirmeyi düşünürken.

## Temel fikir

Barındırma kararını üç soru verir:

1. **İstek anında sunucuda kod çalışıyor mu?** Çalışmıyorsa (derlenmiş HTML/JS) durağan barındırma yeter.
2. **Sunucu kalıcı bir şey saklıyor mu?** (veritabanı dosyası, yüklenen fotoğraf). Saklıyorsa o şey kalıcı bir
   depoda durmalıdır; uygulamanın kendi dosya sisteminde değil.
3. **Sunucuyu kim ayakta tutacak?** Güncelleme, yedek, yeniden başlatma, sertifika. "Ben" diyorsanız VPS; "platform"
   diyorsanız PaaS.

Kural: **en az yönetim isteyen seçenekle başlayın**, gerekirse bir basamak aşağı inin: durağan → PaaS → VPS.
Her basamak size daha çok denetim ve daha çok iş verir.

## Karar tablosu

| Ne yayınlıyorsunuz                                       | İlk seçim                                         | Neden                                              |
| -------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Tanıtım sitesi, blog, belge (havuzdaki `site`)            | Durağan barındırma (GitHub Pages, Netlify, Cloudflare Pages) | Sunucu yok, bakım yok, saldırı yüzeyi çok küçük |
| Çevrimdışı PWA, veri telefonda (Köprü)                   | Durağan barındırma                                | Sunucu yalnız dosya verir; veri cihazda           |
| API'li uygulama, veri yönetilen veritabanında            | PaaS web servisi + yönetilen veritabanı           | Süreçler atılabilir; yedek ve güncelleme platformda |
| API + SQLite tek dosya (havuzdaki `uygulama`)            | Kalıcı diskli PaaS ya da VPS + Docker birimi      | SQLite tek makinede kalıcı disk ister; tek kopya   |
| Ara sıra çalışan iş (gece raporu, web kancası)           | Sunucusuz işlev ya da zamanlanmış CI işi          | Boşta maliyet yok                                  |
| Uzun bağlantı (WebSocket, SSE), arka planda sürekli iş   | Sürekli çalışan servis (PaaS ya da VPS)           | Sunucusuz işlevin süre ve bağlantı sınırı var      |
| Tam denetim, sabit maliyet, öğrenme                      | VPS                                               | Her şey sizde: güncelleme, güvenlik duvarı, yedek  |
| Evde ya da ofiste kendi makineniz                        | Yalnız deneme ve iç ağ; dışarı açmak için tünel   | Elektrik, ev bağlantısı ve güvenlik size kalır     |

### Barındırma türleri

| Tür                | Siz yönetirsiniz         | Kalıcı disk               | Uzun bağlantı | Uyku / soğuk başlangıç | Tipik tuzak                               |
| ------------------ | ------------------------ | ------------------------- | ------------- | ---------------------- | ----------------------------------------- |
| Durağan barındırma | Yalnız derleme çıktısı   | Gerekmez                  | Yok           | Yok                    | Alt klasör, SPA yönlendirme               |
| PaaS web servisi   | Kod + ayar               | Çoğu zaman yok; ayrıca eklenir | Var      | Ucuz planlarda var     | Geçici disk                               |
| Sunucusuz işlev    | Yalnız kod               | Yok                       | Yok ya da sınırlı | Var                | Süre sınırı, veritabanı bağlantı sayısı   |
| VPS                | İşletim sistemi dahil her şey | Var                  | Var           | Yok                    | Güncellenmeyen sunucu, alınmayan yedek    |
| Kendi makineniz    | Donanım dahil her şey    | Var                       | Var           | Yok                    | Ev ağının dışarı açılması, IP değişimi    |

Plan adları, fiyatlar ve ücretsiz katman sınırları sık değişir; bu not onları vermez. Seçmeden önce sağlayıcının
güncel fiyat ve belge sayfasını okuyun, okuduğunuz tarihi `docs/KARARLAR.md`'ye yazın.

## Geçici disk tuzağı

PaaS'larda uygulama bir kapsayıcıda çalışır. Kapsayıcının dosya sistemi her başlatmada imajdan **sıfırdan** açılır.
Uygulamanın yazdığı dosya o çalışma süresince durur, sonra yok olur. Silinme anları:

- yeni bir dağıtım (her `git push` sonrası otomatik dağıtım dahil),
- çökme ya da bellek aşımı sonrası yeniden başlatma,
- ucuz planlarda boşta kalınca **uyku** ve ilk istekte uyanma,
- platformun bakım için servisi başka makineye taşıması.

Belirti hata iletisi değildir; sessizdir: "Dün kaydolan kullanıcı bugün giriş yapamıyor", "yüklenen fotoğraflar
kayboldu", "veritabanı her sabah boş". SQLite dosyası, yüklenen dosyalar, dosyada tutulan oturumlar etkilenir.

| Kalıcı veri           | Geçici diskli PaaS'ta ne yapılır                                                          |
| --------------------- | ----------------------------------------------------------------------------------------- |
| SQLite veritabanı     | Platformun kalıcı diskini/birimini ekleyin ve `DATABASE_PATH`'i oraya verin; ya da Postgres |
| Kullanıcı yüklemeleri | Nesne deposu (S3 uyumlu); yerel diske yazmayın                                            |
| Oturumlar, önbellek   | Veritabanında; önbellek kaybolabilir olmalı                                                |

Havuzdaki uygulama tek bir SQLite dosyası kullanır; seçenekler ve diskli Render örneği
[`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) ile
[`render.ornek.yaml`](../../uygulama/render.ornek.yaml) dosyasındadır (`disk:` bölümü). Deponun kökündeki
[`render.yaml`](../../../render.yaml) ise veritabanı tutmayan TV+ gösterimini ücretsiz planda çalıştırır: orada
geçici disk sorun değildir, çünkü saklanan bir şey yoktur.

Kalıcı disk eklemenin bedeli: birçok platformda diskli servis **tek kopya** çalışır ve dağıtımda kısa kesinti
olabilir (disk aynı anda tek makineye bağlanır). Ayrıntıyı sağlayıcının belgesinden okuyun.

### Açılışta yol denetimi

Üretimde veritabanı yolu kalıcı bağlama noktasının altında değilse uygulama **başlamamalı**. Denetimi düz metin
önekiyle yazmak yaygın bir hatadır:

```python calistir
import os.path

KALICI_KOKLER = ["/data"]  # platformda kalıcı diskin bağlandığı yer (render.ornek.yaml → disk.mountPath)


def kalici_mi_yanlis(yol: str) -> bool:
    return any(yol.startswith(kok) for kok in KALICI_KOKLER)


def kalici_mi(yol: str) -> bool:
    tam = os.path.normpath(os.path.abspath(yol))  # gerçek sunucuda os.path.realpath bağlantıları da çözer
    return any(os.path.commonpath([tam, kok]) == kok for kok in KALICI_KOKLER)


# YANLIŞ: metin öneki iki durumda yanılır
assert kalici_mi_yanlis("/data2/uygulama.db")  # /data2 başka bir klasör
assert kalici_mi_yanlis("/data/../app/uygulama.db")  # aslında /app altında, geçici
# DOĞRU
assert kalici_mi("/data/uygulama.db")
assert not kalici_mi("/data2/uygulama.db")
assert not kalici_mi("/data/../app/uygulama.db")
assert not kalici_mi(".data/uygulama.db")  # göreli yol çalışma klasörüne göredir: kapsayıcının içinde
print("yol denetimi doğru")
```

```cikti
yol denetimi doğru
```

Asıl kanıt yine de **yeniden başlatma testidir**: bir kayıt ekleyin → servisi yeniden dağıtın ya da yeniden
başlatın → kayıt duruyor mu? Bunu ilk gerçek kullanıcıdan önce yapın.

## Bölge ve gecikme

İki uzaklık vardır:

1. **Kullanıcı ↔ sunucu:** her istek en az bir gidiş-dönüştür; HTTPS bağlantısı kurulurken birkaç tane daha. Türkiye'deki
   kullanıcı için Avrupa'daki bir bölge, okyanus ötesindeki bir bölgeden belirgin biçimde yakındır.
2. **Sunucu ↔ veritabanı:** bir sayfa onlarca sorgu atabilir ve her sorgu bir gidiş-dönüştür. Bu uzaklık sayfa
   süresini sorgu sayısıyla **çarpar**. Uygulama ile veritabanı aynı bölgede olmalıdır.

```python calistir
# Sayfa süresi = sunucu işi + sorgu sayısı × gidiş-dönüş. Gidiş-dönüş süreleri VARSAYIMDIR; kendi ortamınızda ölçün.
def sayfa_ms(sorgu: int, gidis_donus_ms: float, sunucu_ms: float = 20) -> float:
    return sunucu_ms + sorgu * gidis_donus_ms


ayni_bolge = sayfa_ms(sorgu=25, gidis_donus_ms=1)  # uygulama ve veritabanı aynı veri merkezinde
uzak_bolge = sayfa_ms(sorgu=25, gidis_donus_ms=90)  # uygulama Avrupa'da, veritabanı başka kıtada
az_sorgu = sayfa_ms(sorgu=2, gidis_donus_ms=90)  # aynı uzaklık, sorgular birleştirilmiş
print(f"aynı bölge: {ayni_bolge:.0f} ms · uzak bölge: {uzak_bolge:.0f} ms · uzak ama 2 sorgu: {az_sorgu:.0f} ms")
assert uzak_bolge > 40 * ayni_bolge
```

```cikti
aynı bölge: 45 ms · uzak bölge: 2270 ms · uzak ama 2 sorgu: 200 ms
```

Ölçmek için (ağ ister; yerel makinenizden çalıştırın):

```bash
curl -o /dev/null -sS -w 'DNS %{time_namelookup}s · bağlantı %{time_connect}s · TLS %{time_appconnect}s · ilk bayt %{time_starttransfer}s\n' \
  https://ornek.com/api/health
```

"İlk bayt" süresi bağlantı süresinden çok büyükse yavaşlık sunucudadır (sorgu, soğuk başlangıç); bağlantı süresi
büyükse uzaklıktadır.

## Kilitlenme (lock-in) ve çıkış yolu

Her platform sizi biraz bağlar; amaç bağı ince tutmaktır. Ölçüt: **"Bu uygulamayı bir hafta sonunda başka bir
sağlayıcıya taşıyabilir miyim?"**

| Neye bağlanırsınız                         | Çıkışı açık tutmak için                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Platformun kendi derleme düzeni            | Dockerfile ile derleyin; platform dosyası (`render.yaml`) birkaç satır kalsın       |
| Platforma özgü veritabanı, anahtar-değer servisi | Standart Postgres ya da SQLite; SQL tek dosyanın arkasında (havuzda `api/src/db/database.ts`) |
| Platform işlevleri, form servisi           | İş mantığı sizin kodunuzda; platform yalnız çağırır                                 |
| Platformun kimlik/oturum servisi           | Kullanıcı tablosu sizde ya da tam dışa aktarılabilir                                |
| Alan adı barındırıcıdan alınmış            | Alan adını ayrı bir kayıt firmasından alın; DNS'i siz yönetin                       |
| Veri yalnız platformun panelinde           | Düzenli, standart biçimde dışa aktarım; başka yerde geri yükleme denenmiş           |

Kodun platformun adını bilmemesi iyi bir işarettir: ayar ortam değişkeninden gelir
([Ortam ve yapılandırma](ortam-ve-yapilandirma.md)), günlük standart çıktıya yazılır, kapı `PORT`'tan okunur.

## Tuzaklar

| Belirti                                                         | Neden                                                        | Çözüm                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Kayıtlar her dağıtımdan ya da her sabahtan sonra yok            | SQLite geçici diskte                                         | Kalıcı disk ya da yönetilen veritabanı; açılışta yol denetimi        |
| İlk istek çok uzun sürüyor, sonrakiler hızlı                    | Ucuz planda uyku; uyanış soğuk başlangıç                     | Her zaman açık plan; ya da kullanıcıya "uyanıyor" ekranı             |
| Saatlik bakım işi, zamanlanmış e-posta hiç çalışmamış           | Uyuyan serviste uygulama içi zamanlayıcı da uyur             | Zamanlanmış işi dışarıdan tetikleyin ya da uyumayan plan             |
| Her sayfa yavaş, sunucu boşta                                   | Uygulama ve veritabanı farklı bölgede                        | Aynı bölge; sorgu sayısını azaltın                                   |
| `database is locked`, bozuk veritabanı                          | SQLite'a iki kopya yazıyor ya da dosya ağ diskinde (NFS)     | Tek kopya, yerel kalıcı disk; çok kopya gerekiyorsa Postgres         |
| Yüklenen dosya bazen var bazen yok                              | Çok kopya + her kopyanın kendi yerel diski                   | Nesne deposu                                                         |
| WebSocket/SSE birkaç dakikada bir kopuyor                       | Sunucusuz ya da ara katman zaman aşımı                       | Sürekli çalışan servis, nabız mesajı ([Ters vekil](ters-vekil.md))   |
| Taşınmak isterken veriyi çıkaramıyorsunuz                       | Özel servis, dışa aktarım yok                                | Standart biçimde düzenli yedek ([Veritabanı yedekleme](veritabani-yedekleme.md)) |
| Barındırıcı hesabı kapanınca alan adı da gitti                  | Alan adı barındırıcıdan alınmış                              | Ayrı kayıt firması ([Alan adı ve DNS](alan-adi-ve-dns.md))           |
| VPS haftalarca güncellenmemiş, ele geçirilmiş                   | VPS'in bakımı size kalır                                     | Otomatik güvenlik güncellemesi, yalnız anahtarla SSH ([Linux](linux-temelleri.md)) |
| Fatura beklenenden çok yüksek                                   | Trafiğe göre ölçülen kalem (çıkış trafiği, çağrı)            | [Maliyet ve kaynak](maliyet-ve-kaynak.md) yöntemi, bütçe uyarısı     |

## Denetim listesi

- [ ] Uygulamanın türü belli (durağan / sunuculu / veritabanlı) ve seçim gerekçesiyle `docs/KARARLAR.md`'de.
- [ ] Kalıcı verinin nerede durduğu yazılı; `DATABASE_PATH` kalıcı diskte ya da veritabanı yönetilen bir serviste.
- [ ] Üretimde uygulama, veritabanı yolu kalıcı kökün altında değilse başlamıyor.
- [ ] Yeniden başlatma testi yapıldı: kayıt ekle → yeniden dağıt → kayıt duruyor.
- [ ] Uygulama ve veritabanı aynı bölgede; bölge kullanıcılara yakın; `curl -w` ile ölçüldü.
- [ ] Kaç kopya çalışacağı belli; SQLite ise tek kopya.
- [ ] Uyku/soğuk başlangıç kabul edildi ya da her zaman açık plan seçildi; uygulama içi zamanlanmış işler buna göre.
- [ ] Platforma özgü ayar tek dosyada; kod platformun adını bilmiyor.
- [ ] Alan adı barındırıcıdan bağımsız; veri düzenli dışa aktarılıyor.
- [ ] Fiyat ve sınırlar sağlayıcının güncel sayfasından okundu, tarih not edildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce bu üç soruyu yanıtla: istek anında kod çalışıyor mu, kalıcı veri var mı, kim yönetecek.
  Sonra seçenekleri tablo yap: kalıcı disk var mı, uyku var mı, kaç kopya. Fiyat ve sınır yazma; 'sağlayıcının
  sayfasına bak' de."
- **Modelin tipik hatası:** SQLite'lı uygulamayı ücretsiz katmana önermek ve geçici diski hiç anmamak; sunucu süreci
  isteyen uygulamaya yalnız durağan barındırma önermek; ezberden fiyat ve sınır yazmak; "çok kopya" ile SQLite'ı
  birlikte önermek.
- **Çıktıda denetleyin:** `DATABASE_PATH` nereyi gösteriyor; platform dosyasında `disk:` (ya da birim) satırı var
  mı; planda "yeniden başlatma testi" adımı var mı; uygulama ile veritabanının bölgesi aynı mı.

## İlgili

- [İlk yayın denetim listesi](ilk-yayin-denetim-listesi.md) — seçimden sonraki adımlar sırayla
- [Docker](docker.md) · [Durağan site yayını](duragan-site-yayini.md) · [Maliyet ve kaynak](maliyet-ve-kaynak.md)
- [Veritabanı ölçekleme](../40-sistem-tasarimi/veritabani-olcekleme.md) — SQLite'ın yettiği ve yetmediği yer
- Çalışan karşılıklar: [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md),
  [`uygulama/Dockerfile`](../../uygulama/Dockerfile), [`site/docs/YAYINLAMA.md`](../../site/docs/YAYINLAMA.md)
