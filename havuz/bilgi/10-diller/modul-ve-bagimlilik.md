---
baslik: Modül ve bağımlılık yönetimi
ozet: ESM ile CommonJS birlikte çalışması, döngüsel içe aktarma, anlamsal sürümleme ve kilit dosyası, bağımlılık eklemeden önce sorulacaklar, güvenli güncelleme yöntemi ve npm çalışma alanlarıyla tek depo.
etiketler: [node, npm, modul, bagimlilik, python, monorepo]
duzey: orta
guncellik: 2026-11
---

# Modül ve bağımlılık yönetimi

> Bu notu ne zaman okumalı: `require is not defined`, `Named export not found`, `Cannot access 'X' before
> initialization`, `partially initialized module` gibi bir hata gördüğünüzde; yeni bir paket eklemeden önce;
> bağımlılıkları güncellerken; bir depoda birden çok paket (çalışma alanı) kurarken.

## Temel fikir

- Node'da iki modül sistemi vardır: **ES modülleri** (`import`/`export`, tarayıcıyla ortak, standart) ve
  **CommonJS** (`require`/`module.exports`, eski). Yeni kodda yalnız ESM yazın: `package.json`'da `"type": "module"`.
- Bir dosya hangi sistemdedir? `.mjs` → ESM, `.cjs` → CommonJS, `.js`/`.ts` → en yakın `package.json`'daki
  `"type"`'a göre.
- **Döngüsel içe aktarma** (A, B'yi; B, A'yı içe aktarır) çoğu zaman hata değil, tasarım kokusudur: ortak parçayı
  üçüncü bir modüle çıkarın.
- Bağımlılık **sürüm aralığıyla** (`^1.2.3`) bildirilir, **kilit dosyasıyla** (`package-lock.json`, `uv.lock`) birebir
  sabitlenir. Kilit dosyası depoya girer; kurulum ondan yapılır (`npm ci`, `uv sync`).
- Her bağımlılık, sizin yazmadığınız ve denetlemediğiniz koddur: güvenlik, bakım ve lisans yükü getirir.

## ESM ve CommonJS birlikte

```bash calistir
echo '{"type": "module"}' > package.json
printf 'module.exports = { topla: (a, b) => a + b, SURUM: 3 }\n' > eski.cjs

# ESM'den CommonJS: varsayılan içe aktarma HER ZAMAN çalışır
printf "import eski from './eski.cjs'\nconsole.log('varsayılan:', eski.topla(1, 2))\n" > a.mjs
node a.mjs
# Adlı içe aktarma yazım biçimine bağlıdır: bu biçim çözümlenemedi
printf "import { topla } from './eski.cjs'\nconsole.log(topla(1, 2))\n" > b.mjs
node b.mjs 2> hata.txt || grep -o "Named export 'topla' not found" hata.txt

# CommonJS'ten ESM: Node 22.23.4'te require(esm) çalışıyor (eşzamanlı modüllerde)
printf 'export const selam = (ad) => `Merhaba ${ad}`\n' > yeni.mjs
printf "const { selam } = require('./yeni.mjs')\nconsole.log(selam('Ayşe'))\n" > c.cjs
node c.cjs

# ESM'de __dirname yoktur; import.meta.dirname vardır
printf "console.log(typeof __dirname, typeof import.meta.dirname)\n" > d.mjs
node d.mjs

# JSON içe aktarmak tür bildirimi ister
echo '{"il": "İzmir"}' > veri.json
echo "import veri from './veri.json' with { type: 'json' }; console.log(veri.il)" > e.mjs
node e.mjs
```

```cikti
varsayılan: 3
Named export 'topla' not found
Merhaba Ayşe
undefined string
İzmir
```

Node, CommonJS dosyasındaki adları kaynak koddan **tahmin eder**: `exports.topla = …` ve `module.exports = { topla }`
biçimleri çözümlendi, `module.exports = { topla: (a, b) => … }` çözümlenmedi (denendi). Bu yüzden CommonJS paketten
adlı içe aktarma bir sürüm güncellemesinde kırılabilir; güvenli yol varsayılan içe aktarıp parçalamaktır.

| Hata                                                       | Neden                                   | Çözüm                                               |
| ---------------------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| `require is not defined in ES module scope`                | ESM dosyada `require`                   | `import`; zorunluysa `createRequire(import.meta.url)` |
| `Cannot use import statement outside a module`              | Dosya CommonJS sayılıyor: `.cjs` ya da `"type": "commonjs"` (eski araçlarda `"type"` yokken de) | `"type": "module"` ya da `.mjs` |
| `Named export 'x' not found … is a CommonJS module`         | CommonJS adı çözümlenemedi               | `import paket from '…'` → `const { x } = paket`       |
| `__dirname is not defined`                                  | ESM'de yok                              | `import.meta.dirname`, `import.meta.filename`         |
| `ERR_IMPORT_ATTRIBUTE_MISSING`                              | JSON `with { type: 'json' }` olmadan     | Bildirimi ekleyin ya da `readFile` + `JSON.parse`    |
| `ERR_REQUIRE_ASYNC_MODULE`                                  | `require` edilen ESM üst düzey `await` kullanıyor | `import()` ile yükleyin                     |

## Döngüsel içe aktarma

```bash calistir
echo '{"type": "module"}' > package.json
cat > siparis.mjs << 'EOF'
import { musteriAdi } from './musteri.mjs'
export const VARSAYILAN_DURUM = 'taslak'
console.log(musteriAdi())
EOF
cat > musteri.mjs << 'EOF'
import { VARSAYILAN_DURUM } from './siparis.mjs'
export function musteriAdi() { return `Ayşe (${VARSAYILAN_DURUM})` }
// Yüklenirken okumak: siparis.mjs henüz bu satıra gelmedi
try { console.log(VARSAYILAN_DURUM) } catch (e) { console.log(`${e.name}: ${e.message}`) }
EOF
node siparis.mjs
```

```cikti
ReferenceError: Cannot access 'VARSAYILAN_DURUM' before initialization
Ayşe (taslak)
```

Aynı döngü işlev içinde (çağrı anında) okunduğunda çalıştı, modül yüklenirken okunduğunda patladı. Hata yükleme
**sırasına** bağlıdır; dosyalardan biri başka yerden önce içe aktarılınca hata ortaya çıkar ya da kaybolur.

```python calistir
import subprocess
import sys
from pathlib import Path

Path("dukkan").mkdir()
Path("dukkan/__init__.py").write_text("", encoding="utf-8")
Path("dukkan/siparis.py").write_text("from dukkan.musteri import ADRES\nDURUM = 'taslak'\n", encoding="utf-8")
Path("dukkan/musteri.py").write_text("from dukkan.siparis import DURUM\nADRES = 'İzmir'\n", encoding="utf-8")
sonuc = subprocess.run([sys.executable, "-c", "import dukkan.siparis"], capture_output=True, text=True)
assert "partially initialized module" in sonuc.stderr and "circular import" in sonuc.stderr

# Çözüm: ortak değerleri iki modülün de içe aktardığı üçüncü bir modüle taşımak
Path("dukkan/sabitler.py").write_text("DURUM = 'taslak'\nADRES = 'İzmir'\n", encoding="utf-8")
Path("dukkan/siparis.py").write_text("from dukkan.sabitler import ADRES, DURUM\n", encoding="utf-8")
Path("dukkan/musteri.py").write_text("from dukkan.sabitler import DURUM, ADRES\n", encoding="utf-8")
sonuc = subprocess.run([sys.executable, "-c", "import dukkan.siparis, dukkan.musteri"], capture_output=True, text=True)
assert sonuc.returncode == 0, sonuc.stderr
print("tamam")
```

Python 3.13'te paket **dışındaki** iki dosya arasındaki döngü, "most likely due to a circular import" yerine
yanıltıcı bir "consider renaming … if it has the same name as a library" ipucuyla raporlanabilir (denendi); ileti ne
derse desin, `ImportError: cannot import name` görünce önce döngüye bakın.

| Çözüm                                            | Ne zaman                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| Ortak parçayı üçüncü modüle çıkarmak               | Hemen her zaman ilk tercih                                        |
| Bağımlılık yönünü düzeltmek (katmanlar)            | `veri → servis → arayüz`; alt katman üsttekini içe aktarmaz       |
| İçe aktarmayı işlevin içine almak (Python)          | Geçici çare; yalnız tip için gerekiyorsa `TYPE_CHECKING` bloğu    |
| Yalnız tip için içe aktarma (TypeScript)            | `import type` silinir, döngü çalışma zamanına taşınmaz            |

## Anlamsal sürümleme ve aralıklar

Sürüm `ANA.YAN.YAMA` (MAJOR.MINOR.PATCH): ana sürüm kırıcı değişiklik, yan sürüm geriye uyumlu yenilik, yama düzeltme
demektir. Bu bir **sözdür**, garanti değildir. Aralıkların anlamı (npm `semver` 7.8.6 ile karşılaştırıldı):

```python calistir
def ayir(surum: str) -> tuple[int, int, int]:
    ana, yan, yama = (int(p) for p in surum.split("."))
    return ana, yan, yama


def uyar(aralik: str, surum: str) -> bool:
    """npm'in ^ ve ~ kuralları (ön sürüm ekleri hariç)."""
    s = ayir(surum)
    if aralik.startswith("^"):
        t = ayir(aralik[1:])
        if t[0] > 0:
            ust = (t[0] + 1, 0, 0)  # ^1.2.3 → <2.0.0
        elif t[1] > 0:
            ust = (0, t[1] + 1, 0)  # ^0.2.3 → <0.3.0  (0.x'te YAN sürüm kırıcı sayılır)
        else:
            ust = (0, 0, t[2] + 1)  # ^0.0.3 → <0.0.4
        return t <= s < ust
    if aralik.startswith("~"):
        t = ayir(aralik[1:])
        return t <= s < (t[0], t[1] + 1, 0)  # ~1.2.3 → <1.3.0
    return s == ayir(aralik)


assert uyar("^1.2.3", "1.9.0") and not uyar("^1.2.3", "2.0.0") and not uyar("^1.2.3", "1.2.2")
assert uyar("^0.2.3", "0.2.9") and not uyar("^0.2.3", "0.3.0")
assert not uyar("^0.0.3", "0.0.4")
assert uyar("~1.2.3", "1.2.9") and not uyar("~1.2.3", "1.3.0")
print("tamam")
```

| Yazım       | Anlamı                          | Ne zaman                                              |
| ----------- | ------------------------------- | ----------------------------------------------------- |
| `^1.2.3`    | `>=1.2.3 <2.0.0`                | Uygulama bağımlılığı (npm varsayılanı)                 |
| `^0.2.3`    | `>=0.2.3 <0.3.0`                | 0.x paketler her yan sürümde kırabilir                 |
| `~1.2.3`    | `>=1.2.3 <1.3.0`                | Yalnız yamalara güveniyorsanız; TypeScript `~6.0`      |
| `1.2.3`     | Tam olarak bu                    | Araç zinciri, sorunlu paket                            |
| `*`, `latest`, `>=1` | Her şey                 | **Kullanmayın**: bir gün kırıcı sürüm gelir            |
| Python `~=1.4.2` | `>=1.4.2, ==1.4.*`          | Python'da `~` karşılığı                               |
| Python `>=0.28,<1` | Açık alt ve üst sınır      | Python uygulama bağımlılığı                           |

Ön sürümler (`1.3.0-beta.1`) `^1.2.3` aralığına **girmez** (npm `semver` ile denendi).

## Kilit dosyası

| Kural                                                                | Neden                                                     |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| Kilit dosyası (`package-lock.json`, `uv.lock`) depoya girer            | Herkes ve CI birebir aynı sürümleri kurar                  |
| Temiz kurulum: `npm ci` / `uv sync`                                   | Kilidi değiştirmez; kilit ile `package.json` uyuşmazsa hata verir |
| `npm install` yalnız bağımlılık eklerken/güncellerken                  | Kilidi yeniden yazabilir                                   |
| Kilit dosyasındaki çakışma elle çözülmez                               | Bir tarafı alıp `npm install` ile yeniden üretin           |
| Tek paket yöneticisi (npm **ya da** pnpm ya da yarn)                   | İki kilit dosyası iki farklı ağaç demektir                 |
| `node_modules` ve `.venv` depoya girmez                               | Kilitten yeniden kurulur                                   |

## Bağımlılık eklemeden önce

| Soru                                                          | İyi yanıt                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Standart kütüphane ya da projedeki mevcut bağımlılık bunu yapıyor mu? | Evet ise ekleme (`fetch`, `node:test`, `structuredClone`, `tomllib`, `zoneinfo`) |
| Kaç satır riskli kodu kurtarıyor?                              | Havuz kuralı: ~300 satırdan azsa kendiniz yazın (testiyle)          |
| Bakılıyor mu?                                                  | Son bir yılda sürüm; açık sorunlara yanıt; birden çok bakımcı       |
| Kaç dolaylı bağımlılık getiriyor?                               | Az; `npm ls <paket>` ile ağaca bakın                                |
| Lisansı uygun mu?                                               | MIT, BSD, Apache-2.0 çoğu zaman sorunsuz; GPL/AGPL'de danışın; belirsizse eklemeyin |
| Adı doğru mu?                                                   | Yazım hatalı sahte paketler (typosquatting) vardır; adı resmi belgeden kopyalayın |
| Kurulumda betik çalıştırıyor mu?                                | `postinstall` betiği olan pakete ekstra dikkat                      |
| Tarayıcıya gidecekse boyutu?                                     | Paket boyutu sayfa yükünü büyütür                                   |

Kararı ve gerekçeyi `docs/KARARLAR.md`'ye bir satırla yazın (havuz standardı).

## Güncelleme yöntemi

1. Durumu görün: `npm outdated` (Python: `uv pip list --outdated`).
2. Yamalar ve yan sürümler: `npm update` aralıklar içinde günceller; ardından `npm run check`.
3. Ana sürüm: **teker teker** `npm install paket@latest`; sürüm notlarını (CHANGELOG, "breaking changes") okuyun;
   `npm run check` + uçtan uca test; her ana sürüm ayrı kayıt.
4. Python: `uv lock --upgrade-package paket` + `uv sync` + denetim komutu.
5. Güvenlik uyarısı (`npm audit`): önce gerçekten kullandığınız koda dokunup dokunmadığına bakın; `npm audit fix
   --force` ana sürüm atlatabilir, körü körüne çalıştırmayın.
6. Birlikte sürümlenen paketleri (ör. `typescript` ile `typescript-eslint`, `react` ile `react-dom`) birlikte
   güncelleyin; eş bağımlılık (peer dependency) uyarısını görmezden gelmeyin.

## Tek depo: npm çalışma alanları

Bir depoda birden çok paket (ör. `shared`, `api`, `web`) varsa kök `package.json`'a `"workspaces"` yazılır; tek
`npm install` hepsini kurar ve iç paketleri birbirine bağlar. Havuzdaki örnek: [`uygulama/package.json`](../../uygulama/package.json)
(`shared`, `api`, `web`; iç paket `"@uygulama/shared": "*"` ile bağlanır).

| İş                                       | Komut                                              |
| ---------------------------------------- | -------------------------------------------------- |
| Hepsini kur                               | Kökte `npm ci`                                     |
| Bir pakete bağımlılık ekle                 | `npm install zod -w @uygulama/shared`              |
| Bir paketin betiğini çalıştır              | `npm run test -w @uygulama/api`                    |
| Bütün paketlerde (olanlarda) çalıştır       | `npm run test --workspaces --if-present`           |

Tuzak — **hayalet bağımlılık**: paket A kendi `package.json`'unda yazmadığı bir paketi içe aktarır ve çalışır, çünkü
npm o paketi köke kaldırmıştır (hoisting). Paket ayrı kopyalanınca ya da kurulunca kırılır. Her paket kullandığı
her şeyi **kendi** `package.json`'unda bildirmelidir. pnpm'in `workspace:*` yazımı npm'de çalışmaz.

## Tuzaklar

| Belirti                                                     | Neden                                                  | Çözüm                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `Named export not found` bir güncellemeden sonra              | CommonJS paketin adları çözümlenemiyor                  | Varsayılan içe aktarıp parçalayın                          |
| `Cannot access 'X' before initialization`                   | ESM döngüsü, yükleme sırasında okuma                   | Ortak parçayı üçüncü modüle çıkarın                        |
| `cannot import name … partially initialized module`          | Python döngüsü                                         | Aynı; ya da tip içe aktarmasını `TYPE_CHECKING`'e alın     |
| Bende çalışıyor, CI'da ya da arkadaşta çalışmıyor              | Kilit dosyası yok ya da `npm install` ile farklı ağaç   | Kilidi depoya koyun; `npm ci`                               |
| `npm ci` "not in sync" hatası                                | `package.json` değişmiş, kilit güncellenmemiş            | `npm install` ile kilidi güncelleyip ikisini birlikte kaydedin |
| 0.x paketin yan sürümü her şeyi bozdu                          | 0.x'te yan sürüm kırıcı olabilir                        | `^0.y` yalnız aynı yan sürümü kabul eder; notları okuyun   |
| Yayımlanınca/kopyalanınca "Cannot find module"                 | Hayalet bağımlılık                                     | Kullanılan her paketi kendi `package.json`'una yazın       |
| `npm audit fix --force` sonrası proje derlenmiyor               | Ana sürüm atlandı                                      | Ana sürümleri teker teker, notları okuyarak                |
| Aynı paketin iki kopyası, `instanceof` yanlış dönüyor           | Ağaçta iki sürüm (ör. iki `zod`)                         | `npm ls paket`; sürümleri hizalayın                        |
| İki kilit dosyası (`package-lock.json` + `pnpm-lock.yaml`)      | İki paket yöneticisi                                   | Birini seçin, ötekini silin                                |

## Denetim listesi

- [ ] `package.json`'da `"type": "module"`; kodda `require` ve `module.exports` yok (zorunlu `.cjs` dosyaları dışında).
- [ ] Döngüsel içe aktarma yok (gerekirse `madge --circular` gibi bir araçla ya da gözle tarandı).
- [ ] Bütün bağımlılıklar aralıkla (`^`, `~`) bildirilmiş; `*`, `latest`, git adresi yok.
- [ ] Kilit dosyası depoda; CI `npm ci` / `uv sync` kullanıyor.
- [ ] Yeni bağımlılığın gerekçesi `docs/KARARLAR.md`'de; lisansı ve bakım durumu bakılmış.
- [ ] Ana sürüm güncellemeleri teker teker ve ayrı kayıtlarda; her biri `check` ile doğrulanmış.
- [ ] Çalışma alanlarında her paket kendi bağımlılıklarını bildiriyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni paket ekleme; önce standart kütüphane ya da mevcut bağımlılıklarla çöz. Ekleman gerekiyorsa
  adını, sürümünü, lisansını, neden gerektiğini yaz ve onayımı bekle. `npm ci` ile kur; `package-lock.json`'u elle
  düzenleme. ESM yaz."
- **Modelin tipik hatası:** Küçük bir iş için paket ekler (`left-pad` sendromu); var olmayan ya da adı yanlış paket
  önerir; `npm install` yerine `npm ci` gereken yerde kilidi değiştirir; `require` ile `import`'u karıştırır;
  döngüsel içe aktarmayı içe aktarmayı işlev içine gömerek "çözer"; `npm audit fix --force` çalıştırır.
- **Çıktıda arayın:** `package.json` ve kilit dosyasındaki her değişiklik (yeni paket = soru), `require(`,
  `module.exports`, `"*"`, `"latest"`, `--force`.
- **Doğrulama:** Paket adını `npm view <ad> name version license` ile kendiniz doğrulayın; model uydurabilir.

## İlgili

- [TypeScript proje ayarları](typescript-proje-ayarlari.md): `import type`, `#` içe aktarımları, modül çözümleme
- [Python tipleme ve proje düzeni](python-tipleme-ve-proje.md): `pyproject.toml`, `uv`, paket düzeni
- [Git](git.md): kilit dosyasını kaydetmek, çakışma
- [Tedarik zinciri](../50-guvenlik/tedarik-zinciri.md): yazım benzeri paket, kurulum betiği, denetim araçları
