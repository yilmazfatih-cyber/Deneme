# Küçük bir modelle çalışma rehberi

Bu rehber, havuzdaki temellerin üstüne **daha küçük bir dil modeliyle** iş yaptıracak olan proje sahibi içindir.
Programcı olmanız gerekmez; komut kopyalayıp çalıştırabilmeniz ve modelin ne yaptığını denetleyebilmeniz yeter.

## Temel fikir

Küçük bir model, boş bir sayfaya sağlam bir sistem kuramaz; ama **iyi kurulmuş bir sistemin içinde**, örnek
kopyalayıp uyarlayarak, denetim komutunun gösterdiği hatayı düzelterek çok iş görür. Havuzdaki her temel bunun için
yazıldı: zor kısımlar (güvenlik, eşitleme, sayısal doğruluk, Türkçe tuzakları) hazır ve testlerle korunuyor; kolay
kısımlar için örnek, üreteç ve tarif var.

Sizin işiniz üç şeydir:

1. **Görevi küçük tutmak.** Bir seferde tek iş.
2. **Modeli raylara oturtmak.** Önce temelin `AGENTS.md` dosyasını okutmak.
3. **Kanıt istemek.** "Yaptım" sözü değil, denetim komutunun yeşil çıktısı.

## Çalışma döngüsü

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ 1. Görevi tek cümleyle yazın          ("Görevlere etiket ekle") │
  │ 2. Modele AGENTS.md'yi okutun         (rehber/ISTEMLER.md §1)   │
  │ 3. Önce plan isteyin, sonra kod       (3–6 küçük adım)          │
  │ 4. Her adımdan sonra denetim          (npm run check / check.py)│
  │ 5. Kırmızıysa: hata çıktısını olduğu gibi modele verin          │
  │ 6. Yeşilse: kaydedin                  (git commit)              │
  └─────────────────────────────────────────────────────────────────┘
```

Her temelin denetim komutu kendi `AGENTS.md` dosyasının başında yazar; hepsinin listesi için:

```bash
python havuz/araclar/denetle.py --liste
```

## Küçük model neyi iyi yapar, neyi yapamaz

| İş                                                                 | Küçük model | Not                                                         |
| ------------------------------------------------------------------ | ----------- | ----------------------------------------------------------- |
| Var olan bir örneği kopyalayıp uyarlamak (yeni varlık, sayfa, uç)   | iyi         | Üreteç varsa önce onu çalıştırtın (`npm run gen -- …`)       |
| Metin, renk, menü, içerik değiştirmek                              | iyi         | Temelin "tek ayar dosyası" ya da sözlük dosyasındadır        |
| Denetimin gösterdiği tek bir hatayı düzeltmek                      | çoğunlukla  | Hata çıktısının tamamını verin; kırpmayın                   |
| Bir dosyanın ne yaptığını açıklamak                                 | iyi         | "Sade Türkçeyle, 10 satırda" deyin                          |
| Yeni bir test yazmak (var olan testi örnek alarak)                  | iyi         |                                                             |
| Birden çok dosyaya yayılan büyük değişiklik                         | zayıf       | Adımlara bölün; her adım ayrı denetlensin                   |
| Kimlik, şifre, oturum, yetki kodu                                  | **dokundurmayın** | Hazır ve testli. Yalnız ayar ve metin değişsin        |
| Eşitleme protokolü (`uygulama/shared/src/sync.ts`, `replica.ts`)   | **dokundurmayın** | Uygunluk testleri bozulursa veri kaybolabilir         |
| Sayısal çekirdek (otomatik türev, dikkat, eğitim döngüsü)          | dikkatli    | Yalnız testi yazılmış küçük değişiklik                      |
| Mimariyi değiştirmek, kütüphane değiştirmek                        | yapamaz     | Böyle bir ihtiyaç varsa önce bir karar kaydı yazdırın        |

Her temelin `AGENTS.md` dosyasındaki **"Değişmez kurallar"** bölümü, o temelde dokunulmaması gereken yerleri ve
bunları koruyan testleri sayar.

## Modelin yoldan çıktığını nasıl anlarsınız

Şunlardan birini görürseniz **durun**:

- Aynı hata üç turdur değişmiyor.
- Model bir testi silmek, atlamak (`skip`) ya da beklentisini gevşetmek istiyor.
- "Basitleştirmek için" var olan bir özelliği kaldırıyor.
- Görevle ilgisi olmayan dosyaları değiştiriyor (git farkında bakın).
- Var olmayan bir komut, paket ya da işlev adı uyduruyor.
- "Tamamlandı" diyor ama denetim çıktısı göstermiyor.

Ne yapmalı:

```bash
git diff --stat          # model hangi dosyalara dokundu?
git restore .            # son kayıttan bu yana yapılan HER değişikliği geri al (yeni dosyalar kalır)
git clean -n             # silinecek yeni dosyaları önce göster; sonra gerekirse: git clean -f
```

Sonra görevi **daha küçük** bir parçayla yeniden başlatın ve modele hatanın tam metnini verin.

## Git ile güvende kalmak

Her yeşil adımdan sonra kaydedin; böylece her zaman çalışan bir noktaya dönebilirsiniz.

```bash
git add -A
git commit -m "Görevlere etiket alanı eklendi"
```

| Ne oldu                                      | Ne yapılır                                   |
| -------------------------------------------- | -------------------------------------------- |
| Son kayıttan beri her şeyi geri almak         | `git restore .`                              |
| Tek bir dosyayı geri almak                    | `git restore yol/dosya.ts`                   |
| Son kaydı geri almak (değişiklikler kalsın)   | `git reset --soft HEAD~1`                    |
| Eski bir hâle bakmak                          | `git log --oneline` sonra `git show <kimlik>` |
| Bir şeyi kaybettim sanıyorum                  | `git reflog` (git hemen hiçbir şeyi silmez)   |

## Modele bağlam vermek

Küçük modelin bağlamı dardır; doğru şeyi göstermek, çok şey göstermekten iyidir.

1. **Önce `AGENTS.md`.** Komutlar, harita, kurallar ve tarifler oradadır.
2. **İlgili dosyanın yolunu verin.** "Görev ekranı" değil, `web/src/features/tasks/TaskList.tsx`.
3. **Bilgi notu verin.** Havuzda konu konu çalışma kâğıtları var. İlgili bölümü bulun:

   ```bash
   python havuz/bilgi/araclar/ara.py "oturum çerezi nasıl güvenli olur"
   ```

   Çıkan bölümü modele okutun (ya da kopyalayıp yapıştırın). Notların "Küçük modele yaptırırken" bölümü, o konuda
   isteme ne yazılacağını söyler.
4. **Hata çıktısının tamamını verin.** Özellikle ilk hata satırı ve dosya:satır bilgisi önemlidir.

## Yalnız sohbet edebilen bir modelle (dosya okuyamıyorsa)

Bazı modeller yalnız sohbet eder; dosya okuyamaz, komut çalıştıramaz. O zaman aracı siz olursunuz:

1. İlgili `AGENTS.md` bölümünü ve değiştirilecek dosyanın tamamını sohbete yapıştırın.
2. Modelden **dosyanın yeni hâlinin tamamını** isteyin ("yalnız değişen kısmı değil").
3. Dosyayı kaydedip denetim komutunu çalıştırın; çıktıyı sohbete geri yapıştırın.
4. Yeşil olunca kaydedin.

## Hangi modeli seçmeli

Kod yazdıracağınız model için: **kod ajanı sınavını** kullanın ([`../sinav/`](../sinav/README.md)). Bu temellerde
15 gerçekçi görev vardır; her biri gizli testlerle puanlanır ve testi gevşetmek gibi hileler geçersiz sayılır.
Aynı görevleri her aday modele (en az iki deneme) verip `python havuz/sinav/sinav.py rapor` ile karşılaştırın.
Hızlı bir ilk deneme isterseniz tek bir görev yeter:

> `havuz/uygulama` temelinde üreteçle "notlar" varlığı ekle (`npm run gen -- entity notes --etiket Not`), not
> başlığı ve metin alanı olsun, `npm run check` yeşil olsun.

Uygulamanızın **içinde** kullanacağınız model için (ör. belgeye soru sorma, metinden bilgi çıkarma): `havuz/yz`
temelindeki karşılaştırma aracı adayları **sizin görevlerinizde** ölçer:

```bash
python -m yz karsilastir gorevler/json_cikarim.yaml --modeller <aday-1> <aday-2>
```

Sıralama tablolarına değil, kendi görevinizdeki sonuca bakın. En küçük yeterli modeli seçin.

## Yeni bir projeye başlamak

Bir temeli kendi projenize kopyalayın (gereksiz klasörler atlanır, sonraki adımlar yazılır):

```bash
python havuz/araclar/yeni_proje.py uygulama ../gorevlerim --git
```

Sonra yeni klasörde modelinize ilk iş olarak `AGENTS.md`'yi okutun.

## Sık sorunlar

| Belirti                                              | Olası neden                                 | Ne yapmalı                                                         |
| ---------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `command not found: npm` / `node`                    | Node.js kurulu değil                        | nodejs.org'dan güncel LTS sürümü kurun                             |
| `python: command not found`                          | Sanal ortam etkin değil                     | `source .venv/bin/activate` (Windows: `.venv\Scripts\activate`)    |
| Kurulum yarıda kesiliyor                             | Ağ ya da disk                               | Yeniden deneyin; `df -h` ile boş yere bakın                        |
| Denetim sizde yeşil, başka makinede kırmızı           | Sürüm farkı                                 | `node -v`, `python --version`; temelin `havuz.json` gereksinimine bakın |
| Model "test eski, güncelliyorum" diyor               | Çoğu zaman kod yanlıştır, test değil        | Testi değiştirmeden önce nedenini yazdırın; emin değilseniz reddedin |
| Hugging Face'ten indirme takılıyor                   | Xet aktarımı (bazı ağlarda)                 | `HF_HUB_DISABLE_XET=1` ile yeniden deneyin                         |
| Astro sunucusu kapanmıyor (`site` temeli)            | Astro, ajanla çalıştığını sezip arka plana alıyor | `npx astro dev stop`                                          |

## İlgili

- Bilgisayarınızı hazırlamak (Git, Node.js, Python): [`KURULUM.md`](KURULUM.md)
- Hazır istemler: [`ISTEMLER.md`](ISTEMLER.md)
- Havuzun kuralları: [`../STANDARTLAR.md`](../STANDARTLAR.md)
- Bilgi notları: [`../bilgi/`](../bilgi/) — yöntem notları özellikle işe yarar: hata ayıklama, işi parçalama,
  kod inceleme, test stratejisi
