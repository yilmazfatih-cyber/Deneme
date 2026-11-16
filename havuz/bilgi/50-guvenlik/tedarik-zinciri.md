---
baslik: Tedarik zinciri: bağımlılık riski ve güvenli güncelleme
ozet: Yazım benzeri paket, ad karışıklığı, bakımsız paket ve kurulum betiği riskleri; kilit dosyası, güncelleme yöntemi, denetim araçları ve en az bağımlılık ilkesi; kilit dosyasını ve paket adlarını denetleyen örnekler.
etiketler: [guvenlik, bagimlilik, npm, pip, kilit-dosyasi, ci]
duzey: orta
guncellik: 2026-11
---

# Tedarik zinciri: bağımlılık riski ve güvenli güncelleme

> Bu notu ne zaman okumalı: projeye yeni bir paket eklenirken (özellikle bir model önerdiğinde); bağımlılıklar
> güncellenirken; `npm audit`/`pip-audit` uyarı verdiğinde; CI'ya yeni bir eylem/eklenti eklenirken; kilit
> dosyasında beklenmedik büyük bir fark görüldüğünde.

## Temel fikir

Projenize eklediğiniz her paket, yazarına ve onun bütün bağımlılıklarının yazarlarına **sunucunuzda kod çalıştırma
izni** verir: kurulum anında (kurulum betikleri) ve çalışma anında. Saldırgan sizin kodunuza değil bu zincirin en
zayıf halkasına gelir.

| Risk                           | Nasıl olur                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Yazım benzeri ad (typosquatting) | `reqeusts`, `lodahs`, `expres` gibi adlarla kötü niyetli paket                 |
| Ad karışıklığı (dependency confusion) | Şirket içi paket adı genel depoda daha yüksek sürümle yayımlanır          |
| Hesap ele geçirme              | Gerçek paketin bakıcısının hesabıyla kötü sürüm yayımlanır                      |
| Kurulum betiği                 | `postinstall`/`setup.py` kurulumda çalışır: sırları okur, dışarı gönderir       |
| Bakımsız paket                 | Açık bulunur, düzeltilmez; sonra başkasına devredilir                           |
| Değişken etiket                | `@v4` gibi bir CI eylemi etiketi başka koda taşınır                             |

Savunma üç kattır: **az paket**, **sabitlenmiş ve doğrulanmış sürüm** (kilit dosyası + bütünlük özeti),
**düzenli ve gözden geçirilmiş güncelleme**.

## Karar tablosu: bu paketi ekleyelim mi?

| Durum                                                         | Karar                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Standart kitaplık ya da çerçeve zaten yapıyor                 | Ekleme                                                                 |
| 20–50 satırlık yardımcı (sol dolgu, tarih biçimi)             | Kendiniz yazın ya da havuzdaki tek dosyalık modülü kopyalayın          |
| Riskli ve zor iş (kriptografi, ayrıştırıcı, tarih/saat dilimi, şema doğrulama) | Yaygın, bakımlı paket; kendi yazdığınız daha risklidir |
| Paketin kurulum betiği var                                    | Gerekçe yazılı olsun; mümkünse betiksiz seçenek                        |
| Tek bakıcı, son sürüm yıllar önce, yüzlerce açık konu         | Ekleme ya da çatallayıp kopyalayın                                     |
| Adı popüler bir paketle bir harf farklı                       | Durun, doğru adı paket deposunun sayfasından doğrulayın                |

Havuzun kuralı: bir bağımlılık ancak yaklaşık 300 satırdan fazla riskli kodu kurtarıyorsa eklenir, gerekçesi
`docs/KARARLAR.md`'ye yazılır ([`STANDARTLAR.md`](../../STANDARTLAR.md) §8). Küçük yardımcılar için bağımlılık
yerine dosya kopyalanır: [`kutuphane/README.md`](../../kutuphane/README.md).

Paket değerlendirme listesi: depo bağlantısı gerçek mi ve kaynak kodla yayımlanan paket uyuşuyor mu; bakıcı sayısı
ve son etkinlik; kurulum betiği var mı; kaç geçişli bağımlılık getiriyor; lisans; adın yazımı.

## Kilit dosyası ve bütünlük

- Kilit dosyası (`package-lock.json`, `uv.lock`, `poetry.lock`) depoya girer; CI ve üretim **yalnız kilitten**
  kurar: `npm ci`, `uv sync --locked`, `pip install --require-hashes -r requirements.txt`.
- Kilit her paketin tam sürümünü, indirileceği adresi ve **bütünlük özetini** (`integrity`) taşır; arada değişen
  dosya kurulmaz.
- Kilit dosyası farkı kod gibi incelenir. Aranacaklar: yeni gelen paketler, kurulum betiği bayrağı, depo dışı
  adres (git, http, başka sunucu), özetsiz kayıt.

```python calistir
import json

KILIT = json.loads("""
{
  "lockfileVersion": 3,
  "packages": {
    "": {"name": "uygulama"},
    "node_modules/zod": {"version": "4.6.7", "resolved": "https://registry.npmjs.org/zod/-/zod-4.6.7.tgz",
                         "integrity": "sha512-AAAA"},
    "node_modules/renkli-cikti": {"version": "1.0.3", "resolved": "https://registry.npmjs.org/renkli-cikti/-/renkli-cikti-1.0.3.tgz",
                                  "integrity": "sha512-BBBB", "hasInstallScript": true},
    "node_modules/yardimci": {"version": "2.0.0", "resolved": "git+ssh://git@ornek.example/yardimci.git#abc123"},
    "node_modules/@uygulama/api": {"resolved": "api", "link": true}
  }
}
""")
GUVENILEN_DEPO = "https://registry.npmjs.org/"


def kilit_denetle(kilit: dict, izinli_betikler: set[str]) -> list[str]:
    bulgular = []
    for yol, paket in kilit["packages"].items():
        if not yol or paket.get("link"):
            continue  # kök ve çalışma alanı bağları
        ad = yol.split("node_modules/")[-1]
        if paket.get("hasInstallScript") and ad not in izinli_betikler:
            bulgular.append(f"{ad}: kurulum betiği var (gerekçesi yazılı mı?)")
        if not str(paket.get("resolved", "")).startswith(GUVENILEN_DEPO):
            bulgular.append(f"{ad}: paket deposu dışından geliyor")
        if not paket.get("integrity"):
            bulgular.append(f"{ad}: bütünlük özeti yok")
    return bulgular


for bulgu in kilit_denetle(KILIT, izinli_betikler=set()):
    print(bulgu)
assert kilit_denetle(KILIT, izinli_betikler={"renkli-cikti"})[0].startswith("yardimci")  # gerekçeli istisna
```

```cikti
renkli-cikti: kurulum betiği var (gerekçesi yazılı mı?)
yardimci: paket deposu dışından geliyor
yardimci: bütünlük özeti yok
```

Havuzdaki uygulamanın kilidinde 600'ü aşkın kayıttan yalnız biri (`fsevents`, macOS'a özgü isteğe bağlı paket)
kurulum betiği taşıyor (Kasım 2026'da bu ortamda sayıldı). Bu denetimi CI'da kilit dosyası değiştiğinde
çalıştırmak, yeni gelen betikli paketi incelemeye zorlar.

## Yazım benzeri adlar ve ad karışıklığı

Bir model ya da hızlı bir arama yanlış adı önerebilir; bazı modeller **var olmayan** paket adı uydurur ve o ad
sonradan kötü niyetle yayımlanabilir. Yeni eklenen her adı, popüler adlarla karşılaştırmak ucuz bir süzgeçtir:

```python calistir
def uzaklik(a: str, b: str) -> int:
    """Damerau-Levenshtein (bitişik yer değiştirme dahil), küçük adlar için yeterli."""
    d = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        d[i][0] = i
    for j in range(len(b) + 1):
        d[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            maliyet = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + maliyet)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[len(a)][len(b)]


POPULER = {"requests", "lodash", "express", "react", "numpy", "zod", "pydantic", "fastapi"}


def supheli(ad: str) -> str | None:
    if ad in POPULER:
        return None
    yakin = sorted(p for p in POPULER if uzaklik(ad.lower(), p) <= (1 if len(p) <= 5 else 2))
    return f"{ad} → {', '.join(yakin)} mi demek istediniz?" if yakin else None


for aday in ["reqeusts", "lodahs", "expres", "pydantik", "react", "kendi-paketim"]:
    sonuc = supheli(aday)
    if sonuc:
        print(sonuc)
```

```cikti
reqeusts → requests mi demek istediniz?
lodahs → lodash mi demek istediniz?
expres → express mi demek istediniz?
pydantik → pydantic mi demek istediniz?
```

**Ad karışıklığı:** şirket içi paketleriniz varsa adları sahip olduğunuz bir **kapsamla** başlasın
(`@sirketiniz/ortak`) ve `.npmrc`'de o kapsamın deposu açıkça yazılsın. Python'da `--extra-index-url` iki depoyu
birleştirir; aynı adın daha yüksek sürümü genel depodan gelebilir: iç depo varsa tek kaynak (`--index-url`) ve
özetli kilit kullanın.

## Kurulum betikleri

- npm, bağımlılıkların `preinstall`/`install`/`postinstall` betiklerini varsayılan olarak çalıştırır.
  `npm ci --ignore-scripts` hepsini kapatır; gerçekten gereken paketin derlemesi sonra açıkça çalıştırılır. Hangi
  paketlerin betiği olduğu kilitteki `hasInstallScript` alanından görülür (yukarıdaki denetim).
- Python'da kaynak paket (sdist) kurulurken derleme kodu çalışır; hazır tekerlek (wheel) çalıştırmaz. Mümkünse
  `--only-binary :all:` ve özetli kilit.
- Kurulumu sırların bulunduğu ortamda yapmayın: CI'da bağımlılık kurulumu, dağıtım sırlarının verildiği adımdan
  önce ve ayrı çalışsın.

## Güncelleme yöntemi

| Adım                                      | Ayrıntı                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Düzenli ve küçük                          | Haftalık ya da aylık; birikmiş iki yıllık güncelleme kimsenin inceleyemeyeceği bir farktır      |
| Otomatik öneri                            | Dependabot/Renovate gibi bir araç değişiklik isteği açar; CI testleri koşar                    |
| Bekleme süresi                            | Yeni yayımlanan sürümü birkaç gün beklemek, kısa sürede geri çekilen kötü sürümleri ayıklar (npm `--before`, uv `--exclude-newer` ayarları; davranışı sürümünüzde doğrulayın) |
| Değişiklik notunu okuyun                  | Özellikle ana sürüm atlamalarında ve güvenlik düzeltmelerinde                                   |
| Kilit farkını inceleyin                   | Yeni paket, betik, adres; beklenmedik geçişli bağımlılık                                        |
| Güvenlik açığı varsa öncelik              | Açık sizi gerçekten etkiliyor mu (aşağıdaki tablo)                                               |

## Denetim araçları ve önceliklendirme

`npm audit` (havuzdaki yayın denetim listesinde `npm audit --omit=dev`), `pip-audit`, OSV tabanlı tarayıcılar
bilinen açık veritabanıyla kilidi karşılaştırır. Her uyarı aynı ağırlıkta değildir:

| Soru                                                     | Cevap → öncelik                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| Paket üretimde mi çalışıyor, yalnız geliştirmede mi?     | Yalnız geliştirme (test aracı) → düşük, ama CI makinesini unutmayın |
| Açıklı işlev kodunuzdan çağrılıyor mu?                   | Hayır → düşük; evet → yüksek                                       |
| Saldırgan girdisi o işleve ulaşabiliyor mu?              | Evet (istek gövdesi, yüklenen dosya) → acil                        |
| Düzeltilmiş sürüm var mı?                                | Yok → geçici önlem (girdi süzgeci, özelliği kapatma) + takip       |

`npm audit fix --force` ana sürümleri atlatıp uygulamayı bozabilir; önerilen değişikliği testle doğrulayın.
Yayımlanan paketlerin imza ve köken (provenance) bilgisini doğrulayan komutlar da vardır (ör. `npm audit
signatures`; çıktısını sürümünüzde deneyin).

## CI ve kapsayıcılar

- Üçüncü taraf CI eylemlerini etiketle değil **tam commit özetiyle** sabitleyin; güncellemeyi otomatik araç
  önersin.
- İş akışı belirtecinin yetkisini en aza indirin; sırlar yalnız gereken adımda ([Sır yönetimi](sir-yonetimi.md)).
- Temel Docker görüntüsünü özetle (`@sha256:…`) sabitleyin, küçük görüntü seçin, düzenli yeniden derleyin.
- Bağımlılık listesini (SBOM, ör. CycloneDX ya da SPDX biçiminde) üretip saklamak, yeni bir açık duyurulduğunda
  "bizde var mı" sorusunu dakikalara indirir.

## Tuzaklar

| Belirti                                                             | Neden                                                        | Çözüm                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| CI'da `npm install` her seferinde başka sürüm kuruyor               | Kilit dosyası yok ya da `install` kullanılıyor               | Kilit depoda; `npm ci`                                            |
| Model önerdiği paketi kurduk, adı tek harf farklıymış                | Yazım benzeri paket                                          | Adı depo sayfasından doğrulayın; yeni ad süzgeci                  |
| Kurulumdan sonra CI'daki dağıtım anahtarı kötüye kullanıldı          | Bir bağımlılığın kurulum betiği sırları okudu                | `--ignore-scripts`; kurulum sırsız adımda                         |
| İç paket yerine genel depodaki aynı adlı paket geldi                 | Ad karışıklığı (`--extra-index-url`, kapsamsız ad)           | Kapsamlı ad; tek kaynak; özetli kilit                             |
| Kilit farkı binlerce satır, kimse bakmadı                            | Toplu ve seyrek güncelleme                                   | Küçük ve düzenli güncellemeler; denetim betiği                    |
| `npm audit` yüzlerce uyarı veriyor, hepsi yok sayılıyor              | Önceliklendirme yok                                          | Üretim/erişilebilirlik tablosu; `--omit=dev`                       |
| CI eylemi bir gün farklı davranmaya başladı                          | Etiket başka commit'e taşındı                                | Tam commit özetiyle sabitleme                                     |
| Yıllardır güncellenmeyen paket bir anda yeni sürüm yayımladı         | Paket el değiştirdi ya da hesap ele geçti                    | Bekleme süresi; değişiklik notu ve kaynak farkı incelemesi        |

## Denetim listesi

- [ ] Her doğrudan bağımlılığın gerekçesi `docs/KARARLAR.md`'de; küçük yardımcılar paket değil.
- [ ] Kilit dosyası depoda; CI ve üretim yalnız kilitten kuruyor (`npm ci`, `uv sync --locked`, `--require-hashes`).
- [ ] Kilit denetimi CI'da: kurulum betiği, depo dışı adres, özetsiz kayıt.
- [ ] Yeni paket adları yazım benzerliği için denetleniyor; iç paketler kapsamlı adla ve tek kaynaktan.
- [ ] Bağımlılık kurulumu sırların olmadığı adımda; gerekmiyorsa kurulum betikleri kapalı.
- [ ] Güncellemeler düzenli, küçük, testli; açık uyarıları önceliklendirilerek kapatılıyor.
- [ ] CI eylemleri commit özetiyle, Docker temel görüntüsü özetle sabit.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni bağımlılık ekleme; önce standart kitaplıkla ya da projedeki yardımcılarla çöz. Paket
  şartsa adını, haftalık indirmesini, son sürüm tarihini, kurulum betiği olup olmadığını ve neden gerektiğini yaz;
  ben onaylamadan kurma."
- **Modelin tipik hatası:** küçük bir iş için paket eklemek; var olmayan ya da yanlış yazılmış paket adı
  önermek; `npm install` ile kilidi gereksiz güncellemek; `npm audit fix --force` çalıştırmak; CI eylemini
  `@main` ile kullanmak.
- **Çıktıda denetleyin:** `package.json`/`pyproject.toml` farkında yeni ad var mı; kilit farkında beklenmeyen
  paket ya da `hasInstallScript`; `.github/workflows` içinde `@main`/`@v` etiketleri.
- **Test isteyin:** `kilit_denetle` ve `supheli` kalıplarını CI adımı olarak ekletin.

## İlgili

- Havuz kuralları: [`STANDARTLAR.md`](../../STANDARTLAR.md) §8 (bağımlılıklar) · bağımlılık yerine kopyalanan
  modüller [`kutuphane/README.md`](../../kutuphane/README.md)
- Yayın öncesi `npm audit`: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) §3 ·
  [Yayın öncesi denetim](yayin-oncesi-guvenlik-denetimi.md)
- CI'daki sırlar: [Sır yönetimi](sir-yonetimi.md) · Görüntü kitaplıklarının güncelliği: [Dosya yükleme](dosya-yukleme-guvenligi.md)
