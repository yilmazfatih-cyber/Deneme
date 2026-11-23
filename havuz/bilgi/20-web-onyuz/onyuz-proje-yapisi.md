---
baslik: Ön yüz proje yapısı: özellik klasörleri, katmanlar ve içe aktarma kuralı
ozet: Ön yüz kodunu özellik klasörlerine ve katmanlara ayırmak, katmanlar arası içe aktarma kuralını kural testiyle korumak, kodu ne zaman paylaşılan katmana taşımak, fıçı dosyaları ve adlandırma kuralları.
etiketler: [react, mimari, klasor-yapisi, kural-testi, adlandirma, onyuz]
duzey: orta
guncellik: 2026-11
---

# Ön yüz proje yapısı: özellik klasörleri, katmanlar ve içe aktarma kuralı

> Bu notu ne zaman okumalı: yeni bir ön yüz projesi kurarken, "bu dosyayı nereye koyayım" sorusunda, bir özellik
> değişikliği beş klasöre dağılmaya başladığında ya da küçük model dosyaları her seferinde başka yere koyduğunda.

## Temel fikir

Kod iki eksende düzenlenir:

- **Özellik** (ne iş yapar): görevler, hesap, ayarlar. Bir özelliğin sayfası, parçaları, kancası, saf mantığı ve
  metin eşlemi **aynı klasörde** durur; çünkü birlikte değişirler.
- **Katman** (ne tür kod): uygulama kabuğu (`app/`), özellikler (`features/`), arayüz bileşenleri (`ui/`), altyapı
  (`lib/`). Bağımlılık **tek yönlüdür**: üst katman alttakini kullanır, alttaki üsttekini bilmez.

Tür klasörleri (`components/`, `hooks/`, `utils/`) küçük projede masum görünür; büyüyünce tek bir değişiklik dört
klasöre dağılır ve hangi bileşenin kime ait olduğu kaybolur. Kural ne olursa olsun, **insan dikkatine değil kural
testine** bırakılır: küçük model kuralı unutur, test unutmaz.

## Karar tablosu: bu kod nereye

| Kod                                                          | Yer                                     | Neden                                               |
| ------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------- |
| Bir ekranın sayfası ve o ekrana özel parçalar                | `features/<ad>/`                        | Birlikte değişir                                    |
| O özelliğin saf mantığı (süz, sırala, hesapla)               | `features/<ad>/logic.ts`                | React'siz birim testi kolay                         |
| Birçok özelliğin kullandığı görsel bileşen (düğme, pencere)  | `ui/`                                   | Erişilebilirlik ve görünüm tek yerde                |
| Veri deposu, oturum, API istemcisi, tarih, PWA               | `lib/`                                  | Özelliklerden bağımsız altyapı                      |
| Rotalar, kabuk, sağlayıcılar, hata sınırı                    | `app/`                                  | Tek giriş noktası, her şeyi bilen tek katman        |
| Arayüz metni                                                  | `i18n/tr.json`                          | Tek sözlük ([Uluslararasılaştırma](uluslararasilastirma.md)) |
| Şimdilik tek özelliğin kullandığı "ortak olabilir" yardımcı  | Özelliğin içinde kalsın                 | Üçüncü kullanımda taşıyın                           |
| İki özelliğin paylaştığı parça                               | `ui/` ya da sahibinin giriş dosyası     | Öteki özelliğin iç dosyası doğrudan alınmaz         |

## Örnek düzen: havuzdaki uygulama

```
web/src/
├─ app/          routes.tsx, Shell.tsx, App.tsx, ErrorBoundary.tsx
├─ features/
│  └─ tasks/     TasksPage.tsx, TaskRow.tsx, TaskForm.tsx, useTaskActions.ts, logic.ts, labels.ts
├─ ui/           Button.tsx, Dialog.tsx, Field.tsx, … , index.ts
├─ lib/          store/, sync/, session/, api.ts, date.ts
├─ i18n/         tr.json
└─ styles/       index.css
web/test/
├─ features/     tasks.test.tsx   ← her özellik klasörünün testi (kural testi denetler)
└─ rules/        structure, i18n, routes, contrast, hardcoded-text
```

Katmanların görevi [`docs/MIMARI.md`](../../uygulama/docs/MIMARI.md)'de, kural testleri
[`web/test/rules/`](../../uygulama/web/test/rules/structure.test.ts) altındadır. Bu düzende **içe aktarma yönünü
denetleyen bir test yoktur** ve iki özellik arası içe aktarma bulunur (`workspaces/InvitePage.tsx` →
`auth/AuthLayout.tsx`, `settings/SyncCard.tsx` → `sync/syncView.ts`). Aşağıdaki kuralı eklerseniz bu ikisi için
karar verin: ya ortak parçayı `ui/`'ye taşıyın ya da sahibinin giriş dosyasından (`features/auth/index.ts`) dışa
açın.

## Katman kuralı

| Katman          | İçe aktarabilir                                         | İçe aktaramaz                           |
| --------------- | ------------------------------------------------------- | --------------------------------------- |
| `app/`          | her şey                                                 | —                                       |
| `features/<x>/` | kendi dosyaları, `ui/`, `lib/`, `i18n/`, başka özelliğin **yalnız girişi** | başka özelliğin iç dosyası, `app/` |
| `ui/`           | `ui/`, `i18n/`                                          | `features/`, `app/`, `lib/` (veri bilmez) |
| `lib/`          | `lib/`                                                  | `features/`, `ui/`, `app/`              |

`ui/` bileşeni veri deposunu bilmez: veriyi prop olarak alır. Bu, bileşeni katalogda, testte ve başka projede
kullanılabilir kılar. `import type` da sayılır: çalışma zamanında silinse de iki katmanı birbirine bağlar.

## Kural testi (çalışan örnek)

```js calistir
import assert from 'node:assert/strict'
import path from 'node:path'

// Katman kuralı: app → features → (ui, lib). Alt katman üsttekini, bir özellik ötekinin iç dosyasını içe aktarmaz.
const ALLOWED = {
  app: ['app', 'features', 'ui', 'lib', 'i18n'],
  features: ['features', 'ui', 'lib', 'i18n'],
  ui: ['ui', 'i18n'],
  lib: ['lib'],
}
const SPEC = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g
const PUBLIC_ENTRY = /^features\/[^/]+(\/index\.tsx?)?$/ // özelliğin dışa açık tek girişi

function layerOf(file) {
  const [layer, feature] = file.split('/')
  return { layer, feature: layer === 'features' ? feature : null }
}

function violations(files) {
  const found = []
  for (const [file, source] of Object.entries(files)) {
    const from = layerOf(file)
    for (const match of source.matchAll(SPEC)) {
      const spec = match[1] ?? match[2] ?? match[3]
      if (!spec.startsWith('.') && !spec.startsWith('@/')) continue // paket: react, zod…
      const target = spec.startsWith('@/') ? spec.slice(2) : path.posix.join(path.posix.dirname(file), spec)
      const to = layerOf(target)
      if (!ALLOWED[from.layer]?.includes(to.layer)) {
        found.push(`${file}: '${to.layer}' katmanı içe aktarılamaz (${spec})`)
      } else if (from.feature && to.feature && from.feature !== to.feature && !PUBLIC_ENTRY.test(target)) {
        found.push(`${file}: '${to.feature}' özelliğinin iç dosyası (${spec}); girişini kullanın ya da ui/'ye taşıyın`)
      }
    }
  }
  return found
}

const files = {
  'app/routes.tsx': "import { TasksPage } from '../features/tasks/TasksPage.tsx'",
  'features/tasks/TasksPage.tsx': "import { Button } from '@/ui/Button.tsx'\nimport { useRecords } from '../../lib/store/hooks.ts'",
  'features/settings/SyncCard.tsx': "import { syncLabel } from '../sync/syncView.ts'",
  'features/auth/index.ts': "export { AuthLayout } from './AuthLayout.tsx'",
  'features/workspaces/InvitePage.tsx': "import { AuthLayout } from '../auth'",
  'ui/Dialog.tsx': "import type { Task } from '../features/tasks/logic.ts'",
  'lib/api.ts': "const toast = await import('../ui/Toast.tsx')",
}
const found = violations(files)
for (const line of found) console.log(line)
assert.equal(found.length, 3)
```

```cikti
features/settings/SyncCard.tsx: 'sync' özelliğinin iç dosyası (../sync/syncView.ts); girişini kullanın ya da ui/'ye taşıyın
ui/Dialog.tsx: 'features' katmanı içe aktarılamaz (../features/tasks/logic.ts)
lib/api.ts: 'ui' katmanı içe aktarılamaz (../ui/Toast.tsx)
```

Gerçek projeye taşırken:

1. `files` yerine `src/` klasörünü özyinelemeli tarayın; test `npm run check` içinde koşsun.
2. Düzenli ifade, yorumdaki ya da metindeki `import` sözcüğüne kanabilir. Kalıcı testte TypeScript ayrıştırıcısını
   kullanın; havuzdaki kural testleri bunu [`test/rules/source.ts`](../../uygulama/web/test/rules/source.ts) ile
   yapar (`parse` + `walk`).
3. Hata iletisi düzeltmeyi söylesin ("girişini kullanın ya da `ui/`'ye taşıyın"); küçük model iletiyi okuyup
   kendisi düzeltir.
4. Bilinçli istisnalar bir izin listesinde, gerekçesiyle durur; liste büyüyorsa kural yanlıştır.

Aynı kural ESLint'in `no-restricted-imports` kuralıyla da yazılabilir; ama kalıp yazımı karmaşıklaşınca kural testi
daha okunurdur. Sunucu modülleri için aynı fikrin Python sürümü:
[Monolit ve servisler](../40-sistem-tasarimi/monolit-ve-servisler.md).

## Bir özellik klasörünün içi

| Dosya               | İşi                                                     |
| ------------------- | ------------------------------------------------------- |
| `TasksPage.tsx`     | Rotanın bileşeni: veriyi okur, parçaları dizer          |
| `TaskRow.tsx`, `TaskForm.tsx` | Ekrana özel parçalar                          |
| `useTaskActions.ts` | Yazma eylemleri (ekle, tamamla, sil + geri al)          |
| `logic.ts`          | Saf işlevler: süzme, sıralama, gruplama (birim testli)  |
| `labels.ts`         | Durum → sözlük anahtarı eşlemi (anahtarı birleştirerek kurmamak için) |
| `index.ts`          | Yalnız başka katman bir şey kullanacaksa: dışa açık yüz |

Saf mantığı bileşenden ayırmak hem testi hem küçük modelin işini kolaylaştırır: "süzme yanlış" hatası bir
bileşenin içinde değil, on satırlık bir işlevde aranır.

## Adlandırma

| Ne                      | Kural                                     | Örnek                                 |
| ----------------------- | ----------------------------------------- | ------------------------------------- |
| Bileşen dosyası         | PascalCase, bileşen adıyla aynı           | `TaskRow.tsx` → `export function TaskRow` |
| Sayfa                   | `…Page.tsx`                               | `SettingsPage.tsx`                    |
| Kanca                   | `use` + ad                                | `useTaskActions.ts`                   |
| Saf mantık, yardımcı    | işini söyleyen ad                         | `logic.ts`, `date.ts` (`utils.ts` değil) |
| Mantıksal değer         | `is` / `has` / `can`                      | `isDone`, `canEdit`                   |
| Olay prop'u ↔ işleyici  | prop `on…`, içerideki işlev `handle…`     | `onSave` ↔ `handleSave`               |
| Klasör                  | küçük harf, İngilizce, tutarlı çoğul      | `features/tasks/`                     |
| Test                    | kaynakla aynı ad + `.test`                | `tasks.test.tsx`                      |

Kod adları İngilizce, arayüz metni Türkçe ve sözlükte ([Havuz standartları](../../STANDARTLAR.md) §3).

## Paylaşılan kod: ne zaman taşınır

- **Üçüncü kullanım kuralı:** iki benzer kod kopya kalabilir; üçüncüsünde ortak yere taşıyın
  ([Tasarım kararı](../00-yontem/tasarim-karari.md)). Erken taşınan "ortak" bileşen her yeni kullanımda bir
  mantıksal prop daha alır; on mantıksal prop'lu bileşen iki ayrı bileşen olmalıdır.
- **`utils.ts` çöplüğü:** "yardımcılar" dosyası büyüdükçe her şey ona bağımlı olur. Dosyayı işine göre bölün
  (`date.ts`, `money.ts`); adı içeriği söylesin.
- Paylaşılan kod özellik bilmez: `ui/Button` "görev" sözcüğünü, `lib/date` "fatura"yı bilmez.

## Fıçı (barrel) dosyaları

`index.ts` içinde her şeyi yeniden dışa aktaran fıçılar üç sorun getirir: (1) döngüsel içe aktarma (fıçı A'yı, A
fıçıyı içe aktarır; [Modül ve bağımlılık](../10-diller/modul-ve-bagimlilik.md)); (2) bir ad için bütün modüllerin
yüklenmesi: ESM'de yeniden dışa aktarma da içe aktarmadır, geliştirme sunucusu ve testler fıçının işaret ettiği her
dosyayı değerlendirir; (3) yan etkili modüllerde ağaç sallamanın (tree shaking) çalışmaması. Kural: özelliğin dış
yüzü için tek, kısa bir giriş; katman içinde doğrudan dosya yolu.

## Tuzaklar

| Belirti                                                       | Neden                                                 | Çözüm                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Küçük bir değişiklik dört klasörde dosya açtırıyor            | Tür klasörleri (`components/`, `hooks/`, `utils/`)    | Özellik klasörü; birlikte değişen birlikte durur             |
| Bir bileşeni değiştirince alakasız ekran bozuluyor             | Özellikler birbirinin iç dosyasını kullanıyor         | Katman kuralı + kural testi; giriş dosyası                   |
| "Cannot access before initialization" ya da `undefined` içe aktarma | Fıçı dosyası üzerinden döngü                     | Doğrudan dosya yolu; döngüyü kırın                           |
| Geliştirmede sayfa açılışı yavaş, testler yavaş               | Geniş fıçılar her şeyi yüklüyor                       | Fıçıyı daraltın ya da kaldırın                               |
| Kendi makinede derleniyor, CI'da "Cannot find module"         | Yalnız harf büyüklüğü değişen yeniden adlandırma (macOS/Windows dosya sistemi büyük-küçük harf duyarsız) | `git mv` ile iki adımda (geçici ad → yeni ad); CI Linux'ta sınar |
| `ui/` bileşeni testte veritabanı istiyor                      | Bileşen veri deposunu kendisi okuyor                  | Veriyi prop ile alın; okuma özellikte                        |
| Aynı düğme üç farklı görünümde                                 | Model `ui/Button` yerine yeni düğme yazmış            | İsteme "önce `ui/`'ye bak"; katalog sayfası                  |
| `utils.ts` 1500 satır                                         | Ad içerik söylemiyor, her şey oraya gidiyor           | İşine göre böl; dosya adı = iş                               |

## Denetim listesi

- [ ] Klasör düzeni ve katman kuralı AGENTS.md'de ya da mimari belgesinde bir tabloyla yazılı.
- [ ] İçe aktarma yönünü denetleyen kural testi `check` içinde koşuyor; iletisi düzeltmeyi söylüyor.
- [ ] Her özellik klasörünün testi var (kural testi denetliyor).
- [ ] Saf mantık bileşenden ayrı dosyada ve birim testli.
- [ ] Özellikler arası kullanım yalnız giriş dosyasından; istisnalar gerekçeli listede.
- [ ] `ui/` bileşenleri veri deposunu, rotayı, özelliği bilmiyor.
- [ ] `utils`/`helpers` adlı büyük dosya yok; fıçılar kısa.
- [ ] Dosya adları kurala uygun; yalnız harf büyüklüğü değişen ad değişikliği CI'da denendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni ekranı `features/<ad>/` altında `…Page.tsx` olarak oluştur; saf mantığı `logic.ts`'e
  koy ve birim testini yaz. Görsel parça için önce `ui/`'deki bileşenlere bak, yenisini yazma. Başka özelliğin iç
  dosyasını içe aktarma. Bitince `npm run check` çalıştır; kural testi hata verirse iletideki düzeltmeyi uygula."
- **Modelin tipik hatası:** genel bir `components/` klasörü açar; `ui/Button` dururken yeni düğme yazar; başka
  özelliğin bileşenini `../auth/AuthLayout` diye alır; her klasöre `index.ts` fıçısı ekler; `utils.ts`'e ekler.
- **Çıktıda arayın:** yeni klasör adları (`components`, `helpers`, `utils`), `../` ile başka özelliğe giden içe
  aktarmalar, `ui/` dosyalarında `lib/store` içe aktarması, yeni `index.ts` dosyaları, testsiz `logic.ts`.
- **Sınır kuralını test olarak isteyin:** yukarıdaki örneği projeye uyarlatıp önce kırmızıya düşürün (bilerek
  yanlış içe aktarma ekleyin), sonra yeşile çevirtin; kırmızıya düşmeyen kural testi işe yaramaz.

## İlgili

- [Monolit ve servisler](../40-sistem-tasarimi/monolit-ve-servisler.md) — modül sınırı kural testinin Python sürümü
- [Sunucu mimarisi](../30-arkauc/sunucu-mimarisi.md) — arka uçta katmanlar ve modül sınırları
- [Modül ve bağımlılık yönetimi](../10-diller/modul-ve-bagimlilik.md) — döngüsel içe aktarma
- [TypeScript proje ayarları](../10-diller/typescript-proje-ayarlari.md) — yol takma adları (`@/`)
- [Durum yönetimi seçimi](durum-yonetimi-secimi.md) — durum hangi katmanda durur
- [CSS mimarisi](css-mimarisi.md) — bileşen stillerinin yeri
- Havuzdaki düzen: [`uygulama/web/src`](../../uygulama/web/src/app/routes.tsx) (rotalar),
  [`features/tasks`](../../uygulama/web/src/features/tasks/logic.ts) (saf mantık örneği),
  [`AGENTS.md`](../../uygulama/AGENTS.md) (harita ve değişmez kurallar)
