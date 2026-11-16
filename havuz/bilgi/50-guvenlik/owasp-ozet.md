---
baslik: Web açıkları haritası: OWASP sınıfları ve önlemleri
ozet: En sık web açığı sınıflarının her biri için belirti, tek satırlık yapısal önlem ve ayrıntılı nota bağlantı; kodda ilk bakılacak riskli kalıpları bulan küçük tarayıcı.
etiketler: [guvenlik, owasp, web, harita]
duzey: temel
guncellik: 2026-11
---

# Web açıkları haritası: OWASP sınıfları ve önlemleri

> Bu notu ne zaman okumalı: bir kodu güvenlik gözüyle incelemeye başlarken; "bu uygulamada hangi açıklar olabilir?"
> sorusunu somut bir listeye çevirmek için; hangi ayrıntılı notun okunacağını seçmek için. Harita notudur:
> her satır ayrıntılı nota götürür.

## Temel fikir

Web açıklarının çoğu bir düzine sınıfa düşer ve her sınıfın **yapısal** bir önlemi vardır: tek tek "dikkat etmek"
değil, hatayı yapmayı zorlaştıran bir alışkanlık ya da araç. SQL'de parametre, HTML'de kendiliğinden kaçış,
yetkide "varsayılan hayır", sırda "depoda yok".

OWASP Top 10 bu sınıfların gerçek uygulamalarda ne sıklıkla görüldüğüne göre birkaç yılda bir güncellenen bir
listedir. Aşağıdaki tablo **önleme göre** gruplanmıştır, OWASP'ın sırasını ve adlarını birebir izlemez; güncel
listeyi ve numarasını owasp.org'dan doğrulayın (bu ortamdan açılamadı).

Kural: bir açığı kapatırken onu **bir daha yazılamaz** hâle getirin (kural testi, lint, tek yardımcı). Tek
yeri düzeltmek, aynı hatanın on başka yerde yaşamasına izin verir.

## Harita

| Sınıf                                                    | Tipik belirti                                                     | Yapısal önlem (tek satır)                                                        | Not                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Erişim denetimi kırılması (IDOR, dikey yetki, toplu atama) | Adresteki sayıyı değiştiren başkasının kaydını görüyor           | Her istekte sunucuda, sorgunun içinde sahiplik; varsayılan "hayır"; alan izin listesi | [Erişim açıkları](erisim-denetimi-aciklari.md)              |
| Enjeksiyon (SQL, kabuk, şablon, NoSQL)                   | Tırnak işaretli girdi hata veriyor ya da fazla kayıt dönüyor      | Veri ve kodu ayır: parametreli sorgu, argüman listesi, sabit şablon               | [Enjeksiyon](enjeksiyon.md)                                 |
| Siteler arası betik (XSS)                                | Kullanıcı adı alanına yazılan etiket sayfada çalışıyor            | Bağlama göre kaçış (çerçevenin varsayılanı) + içerik güvenlik politikası          | [XSS ve CSP](xss-ve-csp.md)                                 |
| Siteler arası istek sahteciliği (CSRF)                   | Başka siteye tıklayan kullanıcının hesabında işlem oluyor         | `SameSite` çerez + köken denetimi (+ belirteç)                                    | [CSRF ve CORS](csrf-ve-cors.md)                             |
| Sunucu taraflı istek sahteciliği (SSRF)                  | "Bağlantı önizleme" iç ağdaki adresi getiriyor                    | Çözümlenen IP'yi denetle, yönlendirme izleme, izin listesi                        | [SSRF](ssrf-ve-dis-istekler.md)                             |
| Kimlik doğrulama hataları                                | Sınırsız parola denemesi, hesap varlığını söyleyen form           | Yavaş özet, hız sınırı, tek tip yanıt, iki aşamalı doğrulama                       | [Parola ve hesap](parola-ve-hesap-guvenligi.md)             |
| Oturum hataları                                          | Çıkış yapınca eski çerez hâlâ çalışıyor                            | Sunucu tarafı oturum, girişte yeni kimlik, çıkışta silme                          | [Oturum güvenliği](oturum-guvenligi.md)                     |
| Kriptografi hataları                                     | MD5 parola, `random` ile belirteç, kodda anahtar                   | Hazır üst düzey kitaplık; ilkel seçimi tablosu                                   | [Kriptografi kullanımı](kriptografi-kullanimi.md)          |
| Güvenlik yanlış yapılandırması                           | Hata sayfasında yığın izi, `CORS: *`, açık yönetim paneli          | Güvenli varsayılan + başlıklar + yayın öncesi denetim                             | [Başlıklar ve HTTPS](guvenlik-basliklari-ve-https.md)      |
| Sır sızıntısı                                            | Depoda `.env`, istemci paketinde API anahtarı                     | Sır yalnız sunucu ortamında; tarama; sızınca **döndür**                           | [Sır yönetimi](sir-yonetimi.md)                             |
| Savunmasız ve kötü niyetli bileşenler                    | Yazım benzeri paket, kurulum betiği, eski sürüm                   | Kilit dosyası, az bağımlılık, düzenli güncelleme, denetim aracı                   | [Tedarik zinciri](tedarik-zinciri.md)                       |
| Dosya yükleme ve yol geçişi                              | `../../` içeren dosya adı, HTML/SVG yükleme                       | Sunucuda üretilen ad, içerikten tür, ayrı alan adından sunma                      | [Dosya yükleme](dosya-yukleme-guvenligi.md)                 |
| Günlük ve izleme eksikliği                               | Saldırı haftalarca fark edilmiyor; günlükte parola var             | Güvenlik olayları kayıtta, sırlar değil; eşikli uyarı                             | [Günlük ve izleme](gunluk-ve-izleme-guvenlik.md)            |
| Güvensiz tasarım                                         | Kurtarma akışı parolayı atlatıyor; sınırsız deneme iş kuralında   | Tasarımda tehdit modeli; kötüye kullanım senaryosu testi                          | [Tehdit modelleme](tehdit-modelleme.md)                     |
| Yapay zekâ uygulamaları                                  | Belgedeki gizli talimat ajanı yönetiyor                           | Model çıktısı güvenilmez girdi; araç yetkisi dar; insan onayı                     | [YZ uygulama güvenliği](yapay-zeka-uygulama-guvenligi.md)   |

Bir açıktan şüphelenip olay müdahalesine geçmek gerekiyorsa: [Olay müdahalesi](olay-mudahalesi.md). Yayından önce
tek sayfa: [Yayın öncesi denetim](yayin-oncesi-guvenlik-denetimi.md).

## Küçük sınıflar

| Sınıf                                     | Belirti                                                        | Önlem                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Açık yönlendirme (open redirect)          | `?next=` ile girişten sonra başka siteye gidiliyor (oltalama)  | Yalnız kendi sitenizdeki yol; aşağıdaki örnek                                             |
| Güvensiz seri çözme (deserialization)     | `pickle.loads`, `yaml.load`, `eval` güvenilmez veride          | Yalnız veri biçimi: JSON + şema. Python belgesi `pickle` için açıkça uyarır ([Seri çözme](guvensiz-seri-cozme.md)) |
| Ayrıntılı hata iletisi                    | Yanıtta yığın izi, SQL, dosya yolu                             | İstemciye kod + kısa ileti + istek kimliği; ayrıntı günlüğe                               |
| Düzenli ifade ile hizmet engelleme (ReDoS) | İç içe niceleyicili (`(a+)+`) ifade uzun girdide takılıyor     | Girdi uzunluğu sınırı; iç içe niceleyiciden kaçının; zaman aşımlı eşleştirici               |
| XML dış varlık (XXE) ve "milyar gülüş"    | XML yükleme sunucu dosyasını okuyor ya da belleği tüketiyor     | Dış varlık ve DTD kapalı ayrıştırıcı; Python'da `defusedxml` (sürüme göre doğrulayın) ([Seri çözme](guvensiz-seri-cozme.md)) |
| Başlık/günlük enjeksiyonu (CRLF)          | Girdideki satır sonu yeni başlık ya da sahte günlük satırı yazıyor | Başlık değerinde `\r\n` reddi; yapılandırılmış (JSON) günlük                           |
| Kaynak tüketimi                           | Tek istek dakikalarca sürüyor; `limit=1000000`                  | Gövde, sayfa, dosya, süre için üst sınır; hız sınırı                                      |
| Prototip kirletme (JavaScript)            | `{"__proto__": …}` gövdesi bütün nesnelere alan ekliyor         | Anahtar izin listesi; özel anahtarları reddeden birleştirme ([Erişim açıkları](erisim-denetimi-aciklari.md)) |

### Açık yönlendirme: yanlış, doğru, test

Neden açık: güvendiğiniz alan adındaki bağlantı kullanıcıyı saldırganın sitesine götürür; giriş sonrası
yönlendirmede kullanıcı "zaten giriş yaptım" sanır. Tarayıcı `//kotu.example` adresini **başka bir siteye**,
`/\kotu.example` adresini de ters eğik çizgiyi düz çizgi sayarak yine başka siteye çözer; sekme ve satır sonunu
da adresten siler.

```python calistir
from urllib.parse import urlsplit


# YANLIŞ: "/ ile başlıyorsa iç adrestir"
def donus_yanlis(next_param: str) -> str:
    return next_param if next_param.startswith("/") else "/"


# DOĞRU: yalnız kendi sitemizde bir yol. Boşluk/denetim karakteri ve ters eğik çizgi hiç kabul edilmez.
def donus_adresi(next_param: str) -> str:
    if any(ord(c) <= 0x20 or ord(c) == 0x7F or c == "\\" for c in next_param):
        return "/"
    parca = urlsplit(next_param)
    if parca.scheme or parca.netloc or not next_param.startswith("/") or next_param.startswith("//"):
        return "/"
    return next_param


# TEST: açığı yakalayan girdiler
assert donus_yanlis("//kotu.example/giris") == "//kotu.example/giris"  # tarayıcı başka siteye gider
for kotu in ["//kotu.example", "/\\kotu.example", "/\t/kotu.example", "https://kotu.example", "javascript:x"]:
    assert donus_adresi(kotu) == "/", repr(kotu)
assert donus_adresi("/alanlar/42?sekme=uyeler") == "/alanlar/42?sekme=uyeler"
print("tamam")
```

```cikti
tamam
```

Daha da sağlamı: `next` yerine bilinen sayfaların **adını** taşımak (`?donus=ayarlar`) ve adresi sunucuda bir
sözlükten üretmek.

## İlk 10 dakika: kodda nereye bakılır

Riskli çağrıların çoğu adından tanınır. Aşağıdaki tarayıcı bir **ilk eleme** aracıdır: bulduğu her satır açık
değildir, bulamadığı yerde de açık olabilir. Gerçek projede aynı işi bakımı süren bir statik analiz aracı yapar
(ör. Python için Bandit, çok dilli Semgrep; adlar doğrulanmadı, sürümünüzde kurallarına bakın).

```python calistir
import re

KALIPLAR = [
    (r"execute\(\s*f[\"']|execute\([^)]*%\s*\(|execute\([^)]*\.format\(", "SQL metne gömülmüş", "enjeksiyon"),
    (r"shell\s*=\s*True|os\.system\(|child_process\.exec\(", "kabuk komutu", "enjeksiyon"),
    (r"`\s*(SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{", "SQL şablon dizgisinde", "enjeksiyon"),
    (r"innerHTML\s*=|dangerouslySetInnerHTML|v-html|document\.write\(", "HTML yazan çıkış", "xss"),
    (r"pickle\.loads?\(|yaml\.load\((?![^)]*SafeLoader)|\beval\(|new Function\(", "kod çalıştıran çözümleme", "seri-cozme"),
    (r"verify\s*=\s*False|rejectUnauthorized\s*:\s*false", "TLS doğrulaması kapalı", "kripto"),
    (r"md5\(|sha1\(", "zayıf özet (parola mı?)", "kripto"),
    (r"Math\.random\(|random\.(random|randint|choice)\(", "tahmin edilebilir rastgele (belirteç mi?)", "kripto"),
    (r"localStorage\.setItem\([^)]*(token|jwt)", "belirteç localStorage'da", "oturum"),
    (r"(?i)(api_?key|secret|password)\s*[:=]\s*[\"'][^\"']{8,}[\"']", "koda gömülü sır", "sir"),
]


def tara(kod: str) -> list[tuple[int, str, str]]:
    bulgular = []
    for no, satir in enumerate(kod.splitlines(), start=1):
        for kalip, aciklama, sinif in KALIPLAR:
            if re.search(kalip, satir):
                bulgular.append((no, sinif, aciklama))
    return bulgular


ORNEK = '''
cur.execute(f"SELECT * FROM kullanici WHERE ad = '{ad}'")
subprocess.run(komut, shell=True)
el.innerHTML = yorum.metin
oturum = pickle.loads(cerez)
API_KEY = "sk_canli_0123456789"
token = "".join(random.choice(harfler) for _ in range(8))
cur.execute("SELECT * FROM kullanici WHERE ad = ?", (ad,))
'''
bulgular = tara(ORNEK)
for no, sinif, aciklama in bulgular:
    print(f"{no}. satır [{sinif}] {aciklama}")
assert 8 not in {no for no, _, _ in bulgular}  # parametreli sorgu temiz geçmeli
```

```cikti
2. satır [enjeksiyon] SQL metne gömülmüş
3. satır [enjeksiyon] kabuk komutu
4. satır [xss] HTML yazan çıkış
5. satır [seri-cozme] kod çalıştıran çözümleme
6. satır [sir] koda gömülü sır
7. satır [kripto] tahmin edilebilir rastgele (belirteç mi?)
```

Her bulguda sorulacak soru: "Bu satıra ulaşan veri kullanıcıdan gelebilir mi?" Cevap evetse ilgili nota gidin.

## Tuzaklar

| Belirti                                                              | Neden                                                         | Çözüm                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Bir açık kapatıldı, aynısı bir ay sonra başka uçta çıktı             | Tek yer düzeltildi; kalıp yasaklanmadı                         | Ortak yardımcı + kural testi ya da lint ile kalıbı yasaklayın           |
| Tarayıcı aracı "temiz" dedi, yine de IDOR var                        | Erişim denetimi hataları adla tanınmaz; mantık hatasıdır       | Yetki için iki kullanıcılı/iki kiracılı test yazın                      |
| Güvenlik yalnız girdi süzgecine bırakılmış ("tehlikeli karakteri sil") | Kara liste; her bağlamın tehlikeli karakteri farklı          | Girdide şema doğrulama, çıktıda bağlama göre kaçış                      |
| Hata yanıtında SQL ya da dosya yolu görünüyor                        | Geliştirme hata sayfası üretimde açık                          | İstemciye kod + ileti + istek kimliği; ayrıntı günlükte                |
| Girişten sonra kullanıcı başka siteye gidiyor                        | `next` parametresi denetimsiz                                  | Yalnız yol; `//`, `\`, şema, denetim karakteri reddi                    |
| Önbelleğe atılmış nesne `pickle` ile okunuyor                        | "İç veri" sanıldı; önbellek/kuyruk yazılabilir                 | JSON + şema; imzasız ikili biçim yok                                    |
| OWASP listesinin numarası notlarda tutmuyor                          | Liste sürümden sürüme değişiyor                                | Numara yerine sınıf adı kullanın; sürümü yanına yazın                   |
| "Çerçeve hallediyor" denip geçilen yer açık çıktı                     | Çerçevenin kaçış dışı yolları (`raw`, `safe`, `dangerously…`) | Bu kaçış yollarını arayın; her birinin gerekçesi yazılı olsun           |

## Denetim listesi

- [ ] Uygulamadaki her sınıf için "biz bunu nasıl önlüyoruz" sorusunun bir dosya adıyla cevabı var.
- [ ] Riskli kalıp taraması (yukarıdaki ya da bir statik analiz aracı) çalıştırıldı; her bulgu ya düzeltildi ya
      da yanında gerekçesi var.
- [ ] Yetki, CSRF ve hesap varlığı için olumsuz testler var (araç bunları bulamaz).
- [ ] Yönlendirme parametreleri yalnız iç yol kabul ediyor.
- [ ] Güvenilmez veri hiçbir yerde `pickle`, `yaml.load`, `eval` ile çözülmüyor.
- [ ] Hata yanıtları ayrıntı sızdırmıyor; gövde, liste, dosya ve süre sınırları var.
- [ ] Kapatılan her açık için kalıbı yasaklayan bir test ya da lint kuralı eklendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu değişikliği şu sınıflara göre incele: erişim denetimi, enjeksiyon, XSS, CSRF, SSRF, sır,
  dosya. Her sınıf için ya 'uygulanmaz (neden)' ya da 'şu satırda risk var' yaz. Satır numarası vermeden genel
  uyarı yazma."
- **Modelin tipik hatası:** her sınıfı genel cümleyle "dikkat edilmeli" diye geçmek; kara liste önermek
  (`replace("'", "")`, `<script>` silmek); çerçevenin kaçış yolunu (`dangerouslySetInnerHTML`, `|safe`) fark
  etmemek; yetkiyi hiç sormamak.
- **Çıktıda denetleyin:** her bulgu bir dosya ve satır gösteriyor mu; önerilen düzeltme yapısal mı (parametre,
  izin listesi, kaçış) yoksa karakter silme mi.
- **Test isteyin:** her bulgu için "açığı gösteren girdi reddedilir" testi; yetki için iki kullanıcılı test.
  Sınıf başına girdi kataloğu: [Güvenlik testleri](guvenlik-testleri.md).

## İlgili

- Başlangıç: [Tehdit modelleme](tehdit-modelleme.md) · Bitiş: [Yayın öncesi denetim](yayin-oncesi-guvenlik-denetimi.md)
- HTTP ve CORS'un ne olduğu: [HTTP temelleri](../30-arkauc/http-temelleri.md) · Yetki modeli:
  [Yetkilendirme](../30-arkauc/yetkilendirme.md)
- Çalışan karşılık: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) ve
  [`security.test.ts`](../../uygulama/api/test/security.test.ts)
- İnceleme yöntemi: [Kod inceleme](../00-yontem/kod-inceleme.md) · Ön yüz: [Ön yüz güvenliği](../20-web-onyuz/onyuz-guvenligi.md) ·
  ReDoS ölçümü: [Düzenli ifadeler](../10-diller/duzenli-ifadeler.md)
