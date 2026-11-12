# Mini freeCodeCamp — meydan okuma çalıştırıcısı, sıfırdan

freeCodeCamp'in kalbi bir "meydan okuma" (challenge) döngüsüdür: öğrenci yönergeyi okur, başlangıç kodunu
değiştirir, gizli testler tarayıcıda çalışır, hepsi geçince ilerleme kaydedilir; belirli projeler bitince sertifika
alınır. Bu klasör o döngünün üç parçasını Node.js ile kurar:

1. **Ayrıştırıcı:** gerçek dosya biçimindeki markdown'dan ön bilgi, açıklama, ipuçları (testler), tohum kodu,
   düzenlenebilir bölge, çözümler ve kancaları çıkarır.
2. **Çalıştırıcı:** öğrenci kodunu `node:vm` bağlamında, zaman aşımıyla çalıştırır; her ipucunun test kodunu koşar,
   konsolu yakalar, anlaşılır hata verir.
3. **Müfredat ve sertifika:** süper blok → blok → meydan okuma yapısını yükleyip tutarlılığını denetler; ilerleme
   yüzdesi ve sertifika talebi.

Örnek müfredat (`ornek-mufredat/`) Türkçe ve özgündür: değişkenler, şablon dizgileri, KDV hesaplayıcı ve Türkçe
karakterlere duyarlı palindrom laboratuvarı. Kod da özgündür; freeCodeCamp'ten kopyalanmamıştır.

## Gereksinimler

- Node.js 22 veya üstü. Paket kurulumu ve internet gerekmez.

## Çalıştırma

```bash
cd repo-atlasi/dallar/02-uygulama-platformlari/freecodecamp/sifirdan
node cli.js ornek-mufredat/challenges/blocks/lab-palindrom-denetleyici/6a7b8c9d0e1f2a3b4c5d6e04.md
node cli.js <meydan-okuma.md> benim-cozumum.js     # kendi çözümünü dene
node --test                                         # 18 test
```

Örnek çıktı (başlangıç kodu kalır, dosyadaki çözüm geçer):

```text
Başlangıç kodu:
  [GEÇTİ] `palindromMu` adında bir fonksiyonun olmalı.
  [KALDI] `palindromMu("kayak")` `true` döndürmeli.
          → undefined true değil
  …
Dosyadaki çözüm:
  [GEÇTİ] `palindromMu("KIlık")` `true` döndürmeli (Türkçede `I` küçülünce `ı` olur).
  Sonuç: tüm testler geçti
```

## Meydan okuma dosyasının biçimi

```text
---
id: 6a7b8c9d0e1f2a3b4c5d6e01 ← 24 haneli onaltılık kimlik
title: Değişkene Değer Ata
challengeType: 1 ← 1 = JS alıştırması, 26 = JS laboratuvarı (gerçek tablo: packages/shared/src/config/challenge-types.ts)
dashedName: degiskene-deger-ata
---

# --description-- açıklama (markdown)

# --instructions-- yönerge

# --hints-- her ipucu: bir paragraf + hemen ardından bir js kod bloğu (gizli test)

# --before-all-- / --before-each-- / --after-each-- / --after-all-- (isteğe bağlı kancalar)

# --seed--

## --seed-contents-- başlangıç kodu; iki "--fcc-editable-region--" satırı düzenlenebilir bölgeyi sınırlar

# --solutions-- bir ya da daha çok çözüm; "---" ile ayrılır
```

Testler `assert` (chai'ın arayüzü), öğrencinin kodunu metin olarak veren `code` ve `__helpers` ile yazılır.
Bu klasördeki `.md` dosyaları `<!-- prettier-ignore-start/end -->` ile sarılıdır: kök depodaki Prettier kod bloklarını
biçimlendirirse `--fcc-editable-region--` satırını `--fcc - editable - region--` yapar ve noktalı virgülleri siler.
Gerçek depo da aynı nedenle `curriculum/challenges/**/*` yolunu `.prettierignore` dosyasında dışarıda bırakıyor.

## Aşamalar

| Aşama | Dosya                   | İçerik                                                                                                                         | Test                       |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| 1     | `asama1_ayristirici.js` | Ön bilgi (YAML alt kümesi), işaretçi doğrulama, ipucu/tohum/çözüm/kanca çıkarma, düzenlenebilir bölge                          | `test/ayristirici.test.js` |
| 2     | `asama2_calistirici.js` | `vm.createContext` + `runInContext({ timeout })`, async test sarmalayıcı, chai benzeri `assert`, konsol yakalama, kanca sırası | `test/calistirici.test.js` |
| 3     | `asama3_mufredat.js`    | Müfredat yükleme ve tutarlılık, ilerleme yüzdesi, `tamamla`, `sertifikaTalepEt`                                                | `test/mufredat.test.js`    |
| —     | `cli.js`                | Komut satırından deneme                                                                                                        | —                          |

Önemli ayrıntılar:

- **Zaman aşımı iki katmanlı:** senkron sonsuz döngüyü `vm`'in `timeout` seçeneği, asılı kalan Promise'i
  `Promise.race` ile kurulan zamanlayıcı keser (gerçekte test başına 5 sn: `executeTests(…, testTimeout = 5000)`).
  **Sınırı:** `await`'ten sonra dönen bir sonsuz döngü (ör. `await null; while (true) {}`) mikro görev olarak ana
  olay döngüsünde çalışır; `vm` zaman aşımı onu görmez, olay döngüsü kilitlendiği için zamanlayıcı da hiç tetiklenmez
  ve süreç donar. Çareleri: `vm.createContext(…, { microtaskMode: 'afterEvaluate' })` ya da kodu bir `worker_threads`
  iş parçacığında koşup süre dolunca `terminate()` etmek ([dosyadaki](../README.md) 5. alıştırma).
- **"Realm" tuzağı:** öğrenci kodunun ürettiği diziler vm bağlamının kendi `Array.prototype`'ına sahiptir;
  `util.isDeepStrictEqual` prototipleri karşılaştırdığı için yanlış sonuç verir. Bu yüzden `derinEsit` yazdık.
- **`let` paylaşımı:** öğrenci kodundaki üst düzey `let yas` ayrı bir betik olarak çalışan testten görünür, çünkü
  aynı bağlamdaki betikler aynı küresel sözcüksel ortamı paylaşır.
- **Güvenlik:** `node:vm` güvenlik sınırı değildir. Bu mini yalnızca kendi alıştırmalarımızı çalıştırır. Gerçek
  freeCodeCamp kodu öğrencinin kendi tarayıcısında çalıştırır; sunucuda güvenilmeyen kod çalıştıracaksan ayrı süreç,
  konteyner ve kaynak sınırı gerekir.

## Eşleme tablosu

| Mini'deki parça              | Gerçek depodaki karşılığı (dosya yolu)                                                                                 | Fark                                                                                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseChallenge`             | `tools/challenge-parser/parser/index.js` (unified + remark eklenti zinciri)                                            | Gerçekte markdown AST'si, HTML'e çevrilmiş açıklama, `challengeFiles` alanı, içe aktarma (`::import`), sınav/quiz/video türleri                                                                                                                   |
| İşaretçi doğrulama           | `tools/challenge-parser/parser/plugins/validate-sections.js`                                                           | Gerçek listede `--quizzes--`, `--scene--`, `--fillInTheBlank--` gibi 30'dan fazla işaretçi var                                                                                                                                                    |
| İpuçları                     | `plugins/add-tests.js`                                                                                                 | Gerçekte metin HTML'e çevrilir, i18n için ayrı ayrıştırıcı (`translation-parser`)                                                                                                                                                                 |
| Tohum + düzenlenebilir bölge | `plugins/add-seed.js` (`findRegionMarkers`, `editableRegionBoundaries`)                                                | Aynı kurallar (en fazla iki işaret, kapanmamış bölge hatası); gerçekte çok dosyalı tohum (ör. aynı bölümde `html` ve `css` kod blokları)                                                                                                          |
| Kancalar                     | `plugins/add-hooks.js`                                                                                                 | Aynı dört kanca, tek JS kod bloğu kuralı                                                                                                                                                                                                          |
| `runTests`                   | `client/src/templates/Challenges/redux/execute-challenge-saga.js` (`executeTests`), `utils/build.ts`, `utils/frame.ts` | Gerçekte tarayıcıda iframe/worker; derleme `packages/challenge-builder/src/build.ts` (`buildChallenge`); çalıştırıcı `@freecodecamp/curriculum-helpers` paketinden; Python için Pyodide (`tools/client-plugins/browser-scripts/python-worker.ts`) |
| `assertOlustur`              | chai `assert` (curriculum-helpers üzerinden)                                                                           | Bizimki 20 kadar yöntem                                                                                                                                                                                                                           |
| `cozumleriDogrula`           | `curriculum/src/test/test-challenges.js`                                                                               | Gerçekte tüm müfredat vitest + Puppeteer ile başsız Chrome'da koşar; her blok için test dosyası üretilir (`test-gen`)                                                                                                                             |
| `mufredatiYukle`             | `curriculum/src/build-curriculum.ts`, `build-superblock.ts` (`validateChallenges`), `get-challenges.ts`, `structure/`  | Gerçekte yalnızca kimlikler denetlenir (eksik, sahipsiz, yinelenen); blok JSON'undaki başlık insan içindir ve denetlenmez. Süper bloklarda `chapters → modules → blocks` (v9)                                                                     |
| Sertifika JSON               | `curriculum/challenges/english/certifications/*.yml`                                                                   | Gerçekte YAML                                                                                                                                                                                                                                     |
| `sertifikaTalepEt`           | `api/src/routes/protected/certificate.ts` (`/certificate/verify`)                                                      | Gerçekte Fastify rotası, Prisma ile MongoDB, kullanıcı adı ve onay kontrolleri                                                                                                                                                                    |
| Sertifika listesi            | `packages/shared/src/config/certification-settings.ts`                                                                 | Gerçekte güncel/eski/gelecek sertifika ayrımı                                                                                                                                                                                                     |

## Gerçek ölçeğe giden yol

1. **Tarayıcı:** çalıştırıcıyı Web Worker'a taşı (HTML/CSS meydan okumaları için iframe), editör olarak Monaco ekle.
2. **Çoklu dil:** Python için Pyodide, TypeScript için tarayıcıda derleme (gerçekte `typescript-worker.ts`).
3. **Kalıcılık:** kullanıcı, tamamlanan meydan okumalar ve sertifikalar için API + veritabanı.
4. **İçerik ölçeği:** 16.000'den fazla dosya için şema doğrulama (gerçek: `curriculum/schema/challenge-schema.js`),
   denetleyici (`curriculum/src/challenge-auditor`) ve CI'da tüm çözümlerin testi.
5. **Çeviri:** Crowdin akışları ve `i18n-curriculum` alt modülü.
