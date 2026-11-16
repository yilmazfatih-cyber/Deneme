---
baslik: Güvenlik testleri: açığı yakalayan test nasıl yazılır
ozet: Açık sınıfı başına sınama girdileri kataloğu, yasaklı kalıbı yakalayan kural testi, rastgele girdiyle sınır hatası bulma, korumayı kaldırınca kırmızıya dönmeyen testin değersizliği ve hangi testin nerede koşacağı.
etiketler: [guvenlik, test, kural-testi, ozellik-tabanli, ci]
duzey: orta
guncellik: 2026-11
---

# Güvenlik testleri: açığı yakalayan test nasıl yazılır

> Bu notu ne zaman okumalı: bir güvenlik önlemi eklendiğinde ya da bir açık kapatıldığında; bir modelden "test de
> yaz" isterken; yayın öncesi testlerin gerçekten koruyup korumadığını sorgularken. Arka uç test düzeni (ağsız uç
> testi, olumsuz durum tablosu): [API testleri](../30-arkauc/api-testleri.md); genel ilkeler:
> [Test stratejisi](../00-yontem/test-stratejisi.md).

## Temel fikir

Güvenlik açıkları "olmaması gereken şeyin" sınanmadığı yerde doğar. Mutlu yol testi (Ayşe kendi faturasını görür)
hiçbir açığı yakalamaz; açığı yakalayan test **saldırganın girdisini** verir ve **reddedildiğini** doğrular. Dört
tür test birlikte çalışır:

1. **Olumsuz durum testi:** her korumalı işlem için yetkisiz kişi, kötü girdi, başka köken → red.
2. **Kural testi:** bir kalıbın kodda **hiç** bulunmadığını ya da her öğenin kurala uyduğunu bütün depoda denetler
   (yasaklı çağrı, oturumsuz uç, envanterde olmayan sütun).
3. **Rastgele/özellik tabanlı test:** doğrulayıcıya binlerce üretilmiş girdi verir; elle akla gelmeyen sınırı bulur.
4. **Gerileme testi:** kapatılan her açık, onu yeniden üreten bir testle birlikte kapanır; test kalıcıdır.

Testin testi: korumayı geçici olarak kaldırdığınızda test **kırmızıya dönmüyorsa**, hiçbir şeyi korumuyordur.

## Sınama girdileri kataloğu

Her satırdaki girdiyi ilgili uca/işleve verin; beklenen davranışı doğrulayın. Ayrıntı ve çalışan örnek bağlı notta.

| Sınıf                     | Girdiler                                                                       | Beklenen                                     | Not                                               |
| ------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------- |
| SQL                       | `o'brien`, `' OR '1'='1`, `%`, `_`                                             | Değer olarak işlenir; fazladan satır yok     | [Enjeksiyon](enjeksiyon.md)                       |
| Kabuk                     | `x; echo ENJEKTE`, `--version`                                                 | Tek argüman; seçenek sayılmaz                | [Enjeksiyon](enjeksiyon.md)                       |
| NoSQL/gövde türü          | `{"parola": {"$ne": null}}`                                                    | 400                                          | [Enjeksiyon](enjeksiyon.md)                       |
| HTML çıktısı              | `<img src=x onerror=…>`, `" onmouseover="x`                                     | Metin olarak görünür; öğe oluşmaz            | [XSS ve CSP](xss-ve-csp.md)                       |
| Adres (`href`)            | ` JaVaScRiPt:…`, `java\tscript:…`, `data:text/html,…`, `javascript&#58;…`       | Reddedilir ya da zararsız kaçışlanır         | [XSS ve CSP](xss-ve-csp.md)                       |
| Yönlendirme (`next`)      | `//kotu.example`, `/\kotu.example`, `/\t/kotu.example`                          | `/`                                          | [OWASP özeti](owasp-ozet.md)                      |
| Dış istek (SSRF)          | `http://127.1/`, `http://[::ffff:127.0.0.1]/`, `http://169.254.169.254/`, `file:///…`, iç adrese 302 | Reddedilir | [SSRF](ssrf-ve-dis-istekler.md)                   |
| Dosya yolu                | `../../etc/passwd`, `/etc/passwd`, `a\0.png`, kök dışını gösteren sembolik bağ  | Reddedilir                                   | [Dosya yükleme](dosya-yukleme-guvenligi.md)       |
| Arşiv                     | `../kacak.txt` üyesi, ~20 KB'lık 20 MB sıfır                                     | Reddedilir                                   | [Dosya yükleme](dosya-yukleme-guvenligi.md)       |
| Toplu atama               | `{"rol": "yonetici"}`, `{"sahip_id": …}`, `{"__proto__": {…}}`                   | 400; kayıt ve prototip değişmez              | [Erişim açıkları](erisim-denetimi-aciklari.md)    |
| Yetki                     | Başka kullanıcının kimliği; izleyici rolüyle yazma; oturumsuz çağrı             | 404 / 403 / 401                              | [Erişim açıkları](erisim-denetimi-aciklari.md)    |
| CSRF                      | `Origin: https://kotu.example`, `Origin: null`, `Sec-Fetch-Site: same-site`     | 403                                          | [CSRF ve CORS](csrf-ve-cors.md)                   |
| CORS                      | `Origin: https://kotuornek.com`                                                | `Access-Control-Allow-Origin` yok            | [CSRF ve CORS](csrf-ve-cors.md)                   |
| Oturum                    | Çıkıştan sonra eski çerez; girişten önceki oturum kimliği                       | 401; geçersiz                                | [Oturum güvenliği](oturum-guvenligi.md)           |
| Hesap                     | Kayıtlı ve kayıtsız e-postayla giriş/şifremi unuttum; 11. yanlış parola         | Aynı yanıt ve iş; 429                        | [Parola ve hesap](parola-ve-hesap-guvenligi.md)   |
| Günlük                    | Bütün akışlardan sonra günlük çıktısı                                           | Parola, belirteç, çerez, e-posta yok          | [Günlük ve izleme](gunluk-ve-izleme-guvenlik.md)  |
| Başlık                    | Herhangi bir yanıt                                                             | CSP, `nosniff`, üretimde HSTS                 | [Başlıklar ve HTTPS](guvenlik-basliklari-ve-https.md) |
| YZ aracı                  | Modelin ürettiği başka kullanıcı kimliği                                        | Araç reddeder                                | [YZ uygulama güvenliği](yapay-zeka-uygulama-guvenligi.md) |

Havuzdaki uygulamada bu kalıpların çoğu hazırdır: [`security.test.ts`](../../uygulama/api/test/security.test.ts)
(CSRF, CORS, hesap varlığı, hız sınırı, oturum iptali, başkasının alanı, günlük ve başlıklar).

## Kural testi: yasaklı kalıp bütün depoda

Bir açık bir yerde kapatılınca aynı kalıp başka bir yerde yaşamaya devam eder. Kural testi bütün kaynak
dosyaları tarar; gerçekten gereken istisna aynı satırda **gerekçesiyle** işaretlenir. İleti, düzeltmeyi söyler:

```python calistir
import pathlib
import re
import tempfile

YASAKLAR = [
    (re.compile(r"shell\s*=\s*True"), "kabuk açma; argüman listesi verin (subprocess.run([...]))"),
    (re.compile(r"\.innerHTML\s*="), "HTML yazma; textContent kullanın"),
    (re.compile(r"execute\(\s*f[\"']"), "SQL metne gömülmüş; yer tutucu kullanın"),
    (re.compile(r"\bMath\.random\("), "tahmin edilebilir rastgele; crypto.randomBytes / randomInt"),
]
ISTISNA = re.compile(r"guvenlik-istisna:\s*\S+")  # gerekçesiz istisna kabul edilmez


def kural_testi(kok: pathlib.Path) -> list[str]:
    bulgular = []
    for dosya in sorted(kok.rglob("*")):
        if dosya.suffix not in {".py", ".ts", ".tsx", ".js"} or "node_modules" in dosya.parts:
            continue
        for no, satir in enumerate(dosya.read_text(encoding="utf-8").splitlines(), start=1):
            for kalip, duzeltme in YASAKLAR:
                if kalip.search(satir) and not ISTISNA.search(satir):
                    bulgular.append(f"{dosya.relative_to(kok)}:{no}: {duzeltme}")
    return bulgular


kok = pathlib.Path(tempfile.mkdtemp())
(kok / "src").mkdir()
(kok / "src" / "rapor.py").write_text(
    'subprocess.run(f"pdf {ad}", shell=True)\n'
    'subprocess.run(komut, shell=True)  # guvenlik-istisna: sabit komut, girdi yok\n'
    'cur.execute(f"SELECT * FROM t WHERE ad = \'{ad}\'")\n',
    encoding="utf-8",
)
(kok / "src" / "liste.ts").write_text("el.innerHTML = yorum.metin\nel.textContent = yorum.metin\n", encoding="utf-8")
for bulgu in kural_testi(kok):
    print(bulgu)
```

```cikti
src/liste.ts:1: HTML yazma; textContent kullanın
src/rapor.py:1: kabuk açma; argüman listesi verin (subprocess.run([...]))
src/rapor.py:3: SQL metne gömülmüş; yer tutucu kullanın
```

Gerçek projede bu iş için önce lint kuralı (ESLint `no-restricted-syntax`, Ruff kuralları) düşünülür; lint
yetmeyen yerde (çok dosyalı kural, "her uç listede mi") test yazılır. Havuzdaki örnekler: oturumsuz uç kuralı
[`rules.test.ts`](../../uygulama/api/test/rules.test.ts), düz `toUpperCase` yasağı
[`uygulama/eslint.config.js`](../../uygulama/eslint.config.js).

## Rastgele girdiyle sınır hatası bulmak

Elle yazılan girdiler yazarın aklına gelenlerle sınırlıdır. Doğrulayıcıya parçalardan üretilmiş binlerce girdi
verip "kabul edildiyse gerçekten güvenli mi" özelliğini sınamak, beklenmedik birleşimleri bulur. Örnek: yolun
kökte kaldığını **dizge önekiyle** denetleyen doğrulayıcı, adı kökle aynı başlayan kardeş klasörü kaçırır.

```python calistir
import random
from pathlib import PurePosixPath

KOK = PurePosixPath("/srv/yukleme/kullanici-7")
PARCALAR = ["..", ".", "a", "b.pdf", "kullanici-7", "kullanici-70", ""]


def coz(yol: PurePosixPath) -> PurePosixPath:  # dosya sistemine dokunmadan ".." ve "." çözümü
    parcalar: list[str] = []
    for p in yol.parts:
        if p == "..":
            if len(parcalar) > 1:
                parcalar.pop()
        elif p not in (".", ""):
            parcalar.append(p)
    return PurePosixPath(*parcalar)


def izinli_yanlis(goreli: str) -> bool:  # YANLIŞ: dizge öneki
    return str(coz(KOK / goreli)).startswith(str(KOK))


def izinli(goreli: str) -> bool:  # DOĞRU: parça parça karşılaştırma
    return coz(KOK / goreli).is_relative_to(KOK)


def guvenli_mi(goreli: str) -> bool:  # özellik: çözülmüş yolun parçaları kökün parçalarıyla başlar
    return coz(KOK / goreli).parts[: len(KOK.parts)] == KOK.parts


def karsi_ornek(dogrulayici, deneme: int = 5000, tohum: int = 2026) -> str | None:
    uretec = random.Random(tohum)  # tohumlu; yalnız random() kullanılır: dizisi Python sürümleri arasında sabittir
    for _ in range(deneme):
        uzunluk = 1 + int(uretec.random() * 4)
        yol = "/".join(PARCALAR[int(uretec.random() * len(PARCALAR))] for _ in range(uzunluk))
        if dogrulayici(yol) and not guvenli_mi(yol):
            return yol
    return None


bulunan = karsi_ornek(izinli_yanlis)
assert bulunan is not None and "kullanici-70" in bulunan  # TEST: önek hatası bulundu
print(f"yanlış doğrulayıcı geçirdi: {bulunan!r} → {coz(KOK / bulunan)}")
assert karsi_ornek(izinli) is None  # doğru sürüm 5000 girdide karşı örnek vermedi
```

```cikti
yanlış doğrulayıcı geçirdi: '../kullanici-70/./kullanici-7' → /srv/yukleme/kullanici-70/kullanici-7
```

Aynı yöntem kaçış işlevine (`çıktıda < ya da " yok`), adres denetleyicisine (`kabul edilen her adresin şeması
izin listesinde`), yetki tablosuna (`her rol × işlem hücresi kurala uyar`) uygulanır. Bulunan karşı örnek kalıcı
bir sınama girdisi olarak kataloğa eklenir. Python'da `hypothesis` gibi bir kitaplık bunu küçültme (shrinking)
ile yapar; bağımlılık eklemeden önce yukarıdaki tohumlu döngü çoğu zaman yeter
([Test stratejisi → Özellik tabanlı test](../00-yontem/test-stratejisi.md)).

## Testin testi: korumayı kaldırın

Yeni bir güvenlik testi yazdıktan sonra:

1. Koruma satırını geçici olarak etkisizleştirin (ör. `requireUser(c)` satırını yorum yapın, köken denetimini
   `return next()` ile atlayın).
2. Testi çalıştırın: **kırmızı** olmalı. Yeşilse test korumayı sınamıyordur (yanlış uca gidiyor, durum kodunu
   değil yalnız gövdeyi denetliyor, düzenek korumayı zaten kapatıyor…).
3. Korumayı geri koyun; test yeşile dönmeli.

Bu adım, modelin yazdığı testlerde özellikle gereklidir: model çoğu zaman testi **geçecek** biçimde yazar.

## Hangi test nerede koşar

| Test                                                         | Nerede                          | Ne zaman                          |
| ------------------------------------------------------------ | ------------------------------- | --------------------------------- |
| Birim ve kural testleri (kaçış, yol, yetki tablosu, yasaklı kalıp) | Hızlı denetim (`check`)    | Her değişiklik                    |
| Uç düzeyi olumsuz testler (401/403/404, CSRF, hız sınırı)    | Hızlı denetim, ağsız            | Her değişiklik                    |
| Uçtan uca güvenlik testleri (saklanan XSS, CSP ihlali yok)   | Uzun denetim (`e2e`)            | Her değişiklik isteği, yayın öncesi |
| Bağımlılık, sır ve kilit dosyası taraması                    | CI                              | Her değişiklik isteği + haftalık  |
| Başlık denetimi ve duman testi                               | Dağıtım sonrası, gerçek adres   | Her yayın                         |
| Dinamik tarama aracı (ör. OWASP ZAP; ayarları doğrulanmadı)  | Önizleme ortamı                 | Büyük değişiklikte / dönemsel     |

## Tuzaklar

| Belirti                                                          | Neden                                                      | Çözüm                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Bütün testler yeşil, açık yine de var                            | Yalnız mutlu yol sınanmış                                  | Katalogdaki olumsuz girdiler; iki kullanıcılı kurgu             |
| Güvenlik testi korumayı kaldırınca da yeşil                      | Test yanlış şeyi denetliyor                                | "Testin testi" adımı                                            |
| Kapatılan açık bir ay sonra başka dosyada çıktı                  | Tek yer düzeltildi                                         | Kural testi ya da lint                                          |
| Kural testi herkesçe `istisna` yorumuyla susturuluyor            | Gerekçe zorunlu değil; inceleme yok                        | Gerekçesiz istisna reddi; istisnalar incelemede listelenir       |
| Rastgele test bazen kırmızı, bazen yeşil                         | Tohum yok                                                  | Tohumlu üreteç; bulunan örneği sabit girdi yapın                |
| Güvenlik testleri yavaş diye kapatıldı                           | Hepsi uçtan uca                                            | Çoğunu birim/uç düzeyine indirin; tablodaki yerleşim            |
| Test, düzenek yüzünden korumasız bir uygulamayla koşuyor          | Testte CSRF/hız sınırı kapalı                              | Güvenlik testleri üretim ara katmanlarıyla koşar                |

## Denetim listesi

- [ ] Her korumalı işlemin olumsuz testleri var (yetkisiz, kötü girdi, başka köken); katalogdaki girdiler kullanılıyor.
- [ ] Yasaklı kalıplar kural testi ya da lint ile bütün depoda denetleniyor; istisnalar gerekçeli.
- [ ] Doğrulayıcı ve kaçış işlevleri tohumlu rastgele girdiyle de sınanıyor; bulunan karşı örnekler kalıcı girdi.
- [ ] Her yeni güvenlik testi "korumayı kaldır → kırmızı" adımından geçti.
- [ ] Kapatılan her açığın gerileme testi var.
- [ ] Testlerin hangisinin `check`, `e2e`, CI ve dağıtım sonrası koştuğu belli.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce olumsuz testleri yaz: [katalogdan ilgili satırlar]. Sonra kodu yaz. Testi yazdıktan
  sonra korumayı geçici kaldırıp testin kırmızıya döndüğünü göster, sonra geri koy."
- **Modelin tipik hatası:** yalnız mutlu yol testi; testi korumayı sınamayacak biçimde yazmak (yanlış durum kodu,
  yanlış uç); kırmızı testi "düzeltmek" için beklentiyi gevşetmek; istisna yorumunu gerekçesiz eklemek.
- **Çıktıda denetleyin:** test dosyasında 401/403/404/400 beklentileri var mı; katalogdaki girdiler geçiyor mu;
  `skip`, `only`, gevşetilmiş beklenti var mı; "testin testi" adımının çıktısı paylaşıldı mı.
- **Test isteyin:** bu notun kendisi: her güvenlik değişikliğinde katalog satırı + kural testi + gerileme testi.

## İlgili

- [API testleri](../30-arkauc/api-testleri.md) (ağsız uç testi, olumsuz durum tablosu) ·
  [Test stratejisi](../00-yontem/test-stratejisi.md) (özellik tabanlı ve farksal test) ·
  [Ön yüz testi](../20-web-onyuz/onyuz-testi.md)
- Çalışan güvenlik testleri: [`uygulama/api/test/security.test.ts`](../../uygulama/api/test/security.test.ts),
  [`rules.test.ts`](../../uygulama/api/test/rules.test.ts), [`password.test.ts`](../../uygulama/api/test/password.test.ts)
- [Yayın öncesi denetim](yayin-oncesi-guvenlik-denetimi.md) · [OWASP özeti](owasp-ozet.md)
