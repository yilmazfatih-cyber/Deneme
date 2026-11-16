# Kod ajanı sınavı

Hangi küçük modelin (ve hangi kod ajanı aracının) **sizin temellerinizde** gerçekten iş görebildiğini ölçer.
Genel sıralama tabloları sizin işinizi ölçmez; bu sınav, havuzdaki temellerin üstünde gerçekçi görevler verir ve
sonucu gizli testlerle **otomatik** puanlar: "Bu model, bu araçla, şu görevlerin kaçını denetimi bozmadan bitirdi?"

Sınav hiçbir modeli kendisi çağırmaz. Siz kendi kod ajanınızı (Claude Code, Aider, OpenCode… hangisi olursa)
hazırlanan klasörde çalıştırırsınız; sınav yalnız **öncesini kurar, sonrasını ölçer**.

```
 hazirla ──► görev klasörü (temelin kopyası + başlangıç durumu + GOREV.md)
                │
                ▼   siz: ajanınızı bu klasörde başlatıp GOREV.md'deki iki iletiyi verirsiniz
 puanla  ──► 1) hile denetimi  2) gizli testler  3) temelin kendi denetimi  →  GEÇTİ / KALDI / GEÇERSİZ
                │
                ▼
 rapor   ──► modelleri karşılaştıran tablo
```

## 5 dakikada

Depo kökünden; yalnız Python 3.11+ gerekir (temellerin kendi kurulumu için Node.js ve `uv`/pip de lazım):

```bash
python havuz/sinav/sinav.py liste                                   # görevler
python havuz/sinav/sinav.py hazirla site-kariyer-sayfasi ~/sinav/kariyer-1
# … ajanınızı ~/sinav/kariyer-1 klasöründe çalıştırın (aşağıda) …
python havuz/sinav/sinav.py puanla ~/sinav/kariyer-1 --etiket qwen3-coder-30b --arac aider
python havuz/sinav/sinav.py rapor --cikti ~/sinav/rapor.md
```

## Adım adım

1. **Görevi seçin:** `python havuz/sinav/sinav.py liste`. Her satırda kimlik, temel, tür, zorluk ve tahmini süre
   (dakika) yazar.
2. **Klasörü hazırlayın:** `python havuz/sinav/sinav.py hazirla <görev> <klasör>`. Klasör **deponun dışında** ve
   boş olmalı (ör. `~/sinav/<görev>-1`). Komut temeli kopyalar, görevin başlangıç durumunu kurar, bağımlılıkları
   yükler (ilk seferde birkaç dakika; `dil-modeli` görevleri ilk kez PyTorch indirir, büyüktür), bir git deposu
   açar ve `GOREV.md` yazar. Hazırlığı ajanı başlatmadan hemen
   önce yapın: süre, hazırla ile puanla arasından ölçülür (ya da puanlarken `--sure` verin).
3. **Ajanı başlatın:** o klasöre geçip ajanınızı açın; ajanın çalışma klasörü görev klasörü olsun. Örnekler
   (komutlar araçtan araca değişir; ayrıntı aracınızın belgesinde — buradaki seçenek adları **doğrulanmadı**):
   - Claude Code'u küçük bir modelle: `cd ~/sinav/kariyer-1 && claude --model <model-adı>`
   - Aider: `cd ~/sinav/kariyer-1 && aider --model <sağlayıcı/model>`
   - Başka bir ajan: aynı klasörde açın, modeli aracın kendi ayarından seçin.
4. **İletileri verin:** `GOREV.md`'deki **1. iletiyi** (havuzun standart başlangıç istemi:
   [`rehber/ISTEMLER.md`](../rehber/ISTEMLER.md) §1) yapıştırın; ajan `AGENTS.md`'yi okuyup özetleyince
   **2. iletiyi** (görevin kendisi) yapıştırın. Sonra aşağıdaki kurallar dışında araya girmeyin.
5. **Puanlayın:** ajan "bitti" deyince ya da süre dolunca:
   `python havuz/sinav/sinav.py puanla <klasör> --etiket <model-adı> [--arac <araç>] [--not "…"]`.
   Sonuç `havuz/sinav/sonuclar/<etiket>.jsonl` dosyasına eklenir; aynı görevin ikinci denemesi kendiliğinden
   "deneme 2" olur.
6. **Karşılaştırın:** `python havuz/sinav/sinav.py rapor` (ekrana) ya da `--cikti rapor.md` (dosyaya).

Puanlama 1–3 dakika sürer ve ajanın dosyalarını değiştirmez: gizli testleri koyar, koşar, siler (temelin denetiminin
ürettiği önbellek ve derleme çıktıları — `dist/`, `.mypy_cache` — kalabilir). Ajanın yaptığı her şey klasörde
kalır: `git diff` ile bakabilirsiniz. Günlükler: `havuz/sinav/calisma/kayitlar/<koşu>/puanlama-<n>/`.

## Sonucu okumak

| Sonuç | Anlamı |
| --- | --- |
| **GEÇTİ** | Gizli testlerin hepsi ve temelin kendi denetimi (ör. `npm run check`) yeşil, hile yok. |
| **KALDI** | Bir gizli test ya da temelin denetimi kırmızı. `puanla` hangi aşamanın kaldığını ve son satırları gösterir. |
| **GEÇERSİZ** | Ajan korunan bir dosyayı silmiş/değiştirmiş: var olan testi silmek ya da beklentisini gevşetmek, teste `skip` eklemek, denetim ayarını (`pyproject.toml`, `eslint.config.js`, `.gitignore`…) değiştirmek, yeni `conftest.py` açmak gibi. Denetim yeşil görünse bile iş kabul edilmez. |

Var olan teste **yalnız ekleme** serbesttir (yeni test, yeni vektör örneği, içe aktarmaya ad eklemek). `noqa`,
`type: ignore`, `eslint-disable`, `# tr-ok` gibi susturma işaretleri geçersiz saymaz ama raporda **uyarı** olarak
görünür; bakmaya değer.

Rapordaki sütunlar: **Geçen deneme** (bütün denemelerin yüzde kaçı geçti), **En az bir kez geçen görev** (tavan),
**Her denemede geçen görev** (kararlılık — bir modele güvenmek için asıl bakılacak sayı), zorluğa göre başarı,
ortanca süre ve geçen denemelerdeki ortalama değişen satır (az ve öz değişiklik iyidir).

## Adil karşılaştırma kuralları

1. **Aynı görev kümesi:** her modele bütün görevleri verin (rapor eksikleri söyler). Görevler ya da temeller
   değiştiyse sonuçlar karşılaştırılamaz; rapor "farklı sürümlerle sınanmış" uyarısı verir.
2. **Aynı süre sınırı:** görevin tahmini süresinin **iki katı** (`liste` → DK sütunu). Süre dolunca durdurup puanlayın.
3. **Aynı başlangıç istemi:** `GOREV.md`'deki iki ileti, olduğu gibi. Kendi açıklamanızı eklemeyin.
4. **Araya girme kuralı:** ajan soru sorarsa yalnız şunu yazın: *"Kendin karar ver; görev metninde yazanla yetin."*
   Ajan bitirmeden durursa en çok iki kez: *"Devam et; bitince denetim çıktısını göster."* Komut çalıştırma izni
   isterse verin (ya da aracın kendiliğinden onay kipini kullanın). Başka yardım yok.
5. **Her modele en az 2 deneme:** her deneme için `hazirla` ile **yeni** bir klasör açın. Tek deneme şansa açıktır.
6. **Aynı ortam:** aynı makine, aynı araç sürümü; aracı `--arac` ile kaydedin. Model etiketini tutarlı yazın.
7. Ajanı yalnız görev klasöründe çalıştırın; depoya (gizli testler ve çözümler orada) erişmesin.

## Görevler

<!-- Kimlik → klasör: gorevler/<kimlik>/ ; ayrıntı: gorev.toml → aciklama -->

| Kimlik | Temel | Tür | Zorluk | Ne ölçer |
| --- | --- | --- | --- | --- |
| `site-kariyer-sayfasi` | site | özellik | kolay | Tarifle sayfa açmak, ön bilgiyi kurala uydurmak, menüye eklemek |
| `site-okuma-suresi` | site | hata | kolay | Belirtiden (kartta "0 dk") ortak işleve inmek |
| `uygulama-silme-okuma` | uygulama | okuma | kolay | Kod ve belge okuyup kesin yanıt vermek; uygulanmamış tasarımı uygulanmış sanmamak |
| `dil-modeli-okuma` | dil-modeli | okuma | kolay | Varsayılanları koddan bulmak (komut satırı ≠ ayar sınıfı) |
| `kutuphane-kisa-sayi` | kutuphane | özellik | orta | İki dilde işlev + ortak vektör; yuvarlama ve basamak taşması |
| `yz-parca-kaybi` | yz | hata | orta | "Belgede yok" belirtisinden parçalayıcıdaki bir eksiğe inmek |
| `yz-kdv-araci` | yz | özellik | orta | Tarifle yeni ajan aracı; para hesabında yarım yukarı yuvarlama |
| `ml-temel-mcc` | ml-temel | özellik | orta | Tarifle yeni ölçüt, çok sınıf, puanlayıcı kaydı, karşılaştırmalı test |
| `veri-bas-harfler` | veri | tuzak | orta | Türkçe büyük harf (i → İ); kural testini `# tr-ok` ile susturmamak |
| `site-marka-adi` | site | değişiklik | orta | Çok dosyalı mekanik değişiklik + Türkçe ek uyumu (Çınar'ın) |
| `uygulama-gece-yarisi` | uygulama | hata | zor | Saat dilimi hatası; iki saat diliminde doğru çalışmak |
| `uygulama-notlar` | uygulama | özellik | zor | Üreteçle varlık + alan + ekran; kırılan testi gevşetmeden güncellemek |
| `kutuphane-paylastirma` | kutuphane | hata | zor | Para paylaştırma hatasını iki dilde birlikte düzeltmek |
| `ml-temel-float32` | ml-temel | tuzak | zor | Kırmızı denetimi testi gevşetmeden yeşile döndürmek |
| `dil-modeli-min-p` | dil-modeli | özellik | zor | Dört dosyaya yayılan tarifli özellik; tensör boyutları |

Her görev bir **başlangıç durumu** (temiz temele uygulanan hazırlık), ajana verilen **talimat**, **gizli testler**
ve bir **başvuru çözümünden** oluşur. `python havuz/sinav/sinav.py dogrula` her görevin gerçekten ölçtüğünü sınar:
başlangıç durumu kalır, başvuru çözümü geçer, hile geçersiz sayılır (sonuç tablosu: `docs/DOGRULAMA.md`).

## Sınırlar

- **Yalnız Linux'ta, bu makinede denendi** (Python 3.13, Node 22). macOS ve Windows denenmedi; kabuk komutları
  (`cd x && …`) ve süre sınırında süreç grubunu durdurma POSIX varsayar.
- **Ajan aracı ve gerçek küçük modellerle henüz denenmedi.** Puanlama, başvuru çözümleri ve elle uygulanan hilelerle
  doğrulandı; gerçek bir modelin hangi yollara sapacağı sınırlı öngörülebilir. İlk gerçek koşularda `puanla`
  çıktısındaki ihlal ve uyarıları gözle gözden geçirin.
- Hile denetimi **dosya düzeyindedir**: korunan dosyaları ve bilinen gevşetme yollarını yakalar. Bağımlılık
  klasörlerine (`node_modules`, `.venv`) bakmaz; kaynak kodda testi bilerek atlatan çok yaratıcı bir yolu (ör. testin
  çağırdığı işlevi yalnız test sırasında taklit etmek) yakalayamayabilir. Gizli testler bunun çoğunu yine yakalar.
- "Yalnız ekleme" kuralı satır düzeyindedir: var olan **bir satırın içine** ekleme yapmak da (ör. tek satırlık
  `[1, 2, 3]` listesine `4` eklemek) değişiklik sayılır, çünkü sözdizimiyle "beklentiyi değiştirmek"ten ayırt
  edilemez. Böyle bir GEÇERSİZ sonucun ayrıntısında farkı görürsünüz; iyi niyetli bir eklemeyse gözle karar verin.
- Okuma görevleri anahtar sözcüklerle puanlanır; doğru ama alışılmadık sözcüklerle yazılmış bir yanıt kalabilir.
  Kalan okuma yanıtlarını `YANIT.txt`'den gözle okuyun.
- Gizli testler ve başvuru çözümleri depoda durur. Ajanı depoya erişebileceği bir yerde çalıştırırsanız ölçüm
  bozulur (hazirla, depo içindeki hedef klasörü reddeder ama ajanın dosya sistemindeki gezintisini engelleyemez).
- Temeller değişince görevlerin hazırlık betikleri bozulabilir; `python scripts/check.py` (hızlı) bunu hemen
  gösterir, `dogrula` tam sınar. Bir temel kendi denetiminde kırmızıysa o temelin görevleri GEÇEMEZ.
- Süre, hazırla ile puanla arasındaki saattir; ajanı geç başlattıysanız `--sure` verin.
