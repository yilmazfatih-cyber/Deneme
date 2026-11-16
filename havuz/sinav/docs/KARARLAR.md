# Kararlar

Kısa kayıtlar: ne seçildi, neden, hangi seçenek neden elendi.

## K01 — Sınav modeli kendisi çağırmaz

Akış `hazirla` → (sahibi kendi ajanını çalıştırır) → `puanla`. **Neden:** sahibinin kullanacağı araç (Claude Code,
Aider, OpenCode…) ve model değişebilir; ölçülmek istenen tam da "bu araç + bu model" ikilisidir. Sınavın içinde bir
ajan döngüsü yazmak hem bir aracı dayatır hem API anahtarı ister. **Elenen:** `yz` temelinin ajanıyla otomatik
koşu — o, sahibinin kullanacağı kod ajanını ölçmez.

## K02 — Yalnız standart kütüphane; havuzun ortak araçları içe aktarılır

Kopyalama `araclar/yeni_proje.py`'nin atlama kurallarıyla, Python ortamı `araclar/denetle.py`'nin `python_kur`'uyla
kurulur. **Bilinçli sapma (STANDARTLAR §2 bağımsızlık):** sınav tanımı gereği temellere bağımlıdır; tek başına
kopyalanmaz. Görev klasörü, sahibinin `yeni_proje.py` ile açacağı projeyle aynı olsun diye aynı kod kullanılır.

## K03 — Görev klasörü düzeni: `<klasör>/GOREV.md` + `<klasör>/<temel>/`

Ajan görev klasöründe başlar; temel bir alt klasördedir — tıpkı gerçek depoda `havuz/<temel>` gibi ve
`rehber/ISTEMLER.md` §1'in "Bu depoda <temel> içinde çalışacaksın" cümlesine uygun. **Neden:** `GOREV.md` temelin
içinde olsaydı temelin biçim denetimine (Prettier `--check .`, kutuphane'de `../*.md`) girer, ajanın işiyle ilgisiz
bir nedenle denetimi kırabilirdi. Okuma görevlerinin yanıtı ise temelin içinde `YANIT.txt`'dir: başlangıç istemi
"yalnız bu klasörün içindeki dosyaları değiştir" der; `.txt` biçim denetimine girmez.

## K04 — Hazırlık kaydı görev klasörünün dışında durur

`calisma/kayitlar/<koşu>/`: başlangıç özetleri (SHA-256), başlangıç anlık görüntüsü (`.tar.gz`), puanlama
günlükleri. Görev klasöründe yalnız tek satırlık `.sinav-kosu` işaret dosyası vardır (silinirse kayıt klasör
yoluyla bulunur). **Neden:** ajan kendi klasöründeki her şeyi değiştirebilir; ölçünün dayanağı ona açık olmamalı.

## K05 — Hile denetimi: değişmez / yalnız ekleme / yeni yasak

- **Değişmez:** yapılandırma ve denetim dosyaları (`package.json`, `pyproject.toml`, kilitler, `tsconfig`, ESLint,
  Prettier, Vitest, `scripts/check.py`, `.gitignore`, `conftest.py`) ve temellerin kural testleri.
- **Yalnız ekleme:** var olan testler ve test verisi (vektörler). **Neden:** hatayı düzelten ajanın regresyon testi
  eklemesi iyi bir davranıştır; cezalandırılmamalı. Satır silmek/değiştirmek ve eklenen satırda `skip`, `.only`,
  `xfail`, `autouse`, `vi.mock` ihlaldir; aynı adlı Python testi (eskisini gölgeler) ihlaldir.
- Hoşgörü: listeye öğe eklerken var olan satırın sonuna virgül eklemek ve bir içe aktarmaya ad eklemek (çok satırlı
  içe aktarma tek satır sayılır). JSON test verisi yapısal karşılaştırılır (eski her öğe yeni dosyada aynen var mı).
- **Yeni yasak:** `conftest.py`, `pytest.ini`, `setup.cfg`, alt klasörde `.prettierignore`/`.gitignore`,
  `vitest.config.*`, `sitecustomize.py`…
- **Elenen:** "korunan dosyaya hiç dokunulmaz" (iyi davranışı cezalandırır) ve "denetimi başlangıçtaki ayarlarla
  ayrı bir kopyada koş" (bağımlılık klasörleri ve düzenlenebilir kurulumlar mutlak yol taşır; kopya kırılgan).

## K06 — Puanlama sırası: bütünlük → gizli testler → temelin denetimi

Ucuzdan pahalıya. Sahibi için hepsi koşar (hangi aşamanın kaldığını görsün); `--dur` ve `dogrula` ilk başarısızlıkta
durur. Temelin denetimi `havuz.json → denetle` komutlarıdır: "denetimi bozmadan bitirdi mi" sorusunun karşılığı.

## K07 — Hata görevlerinde hatayı yakalayan test çıkarılır (zayıflatılmaz)

Gerçekçi bir hata mevcut testlerden kaçmış olmalı. Hazırlık, hatayı yakalayan test satırlarını **siler** (ve
kullanılmaz kalan içe aktarmayı). **Neden:** testi zayıflatmak (`<` → `<=`) seçilseydi, ajanın onu yeniden
sıkılaştırması "var olan satırı değiştirmek" sayılır, iyi davranış geçersiz çıkardı.

## K08 — Görev betikleri Python (yama dosyası değil)

`hazirla.py` / `cozum.py` / `hile.py`, `exam/edit.py`'nin tam eşleşmeli yardımcılarını kullanır: aranan metin tam
beklenen sayıda yoksa açık bir `EditError` verir. Çözüm betiği üreteç ya da biçimleyici de çalıştırabilir (gerçek
çözüm yolu). **Elenen:** `.patch` dosyaları — bağlam kayınca hata iletisi belirsiz; üreteç çalıştıramaz.

## K09 — Başlangıç istemi `rehber/ISTEMLER.md` §1'den çalışma anında okunur

Tek kaynak: istem değişirse görevler kendiliğinden günceldir. Metnin özeti hazırlık kaydına ve sonuca yazılır;
rapor farklı istemlerle alınmış sonuçları ayrıca belirtir (adil karşılaştırma).

## K10 — Süre hazırla→puanla arasıdır; `--sure` ile ezilir

Ajan aracını sınav başlatmadığı için ajanın gerçek çalışma süresini bilemez. README, hazırlığın ajandan hemen
önce yapılmasını önerir.

## K11 — Ortam değişkeniyle sınanan hatalar (`[[gizli]] ortam`)

Saat dilimi hatası (uygulama-gece-yarisi) makinenin saat dilimine göre görünür ya da görünmez. Gizli test
`TZ=Europe/Istanbul` ve `TZ=America/New_York` ile iki kez koşar: ölçüm makineden bağımsız olur ve "3 saat ekle"
gibi yamalar geçmez.

## K12 — Hızlı denetim / uzun denetim ayrımı

Hızlı denetim (`scripts/check.py`, ~10 sn): görev tanımları, dağılım, görev metinleri, her hazırlığın temelin
şimdiki hâline uygulanabilmesi, hile denetimi ve rapor birim testleri, kurulumsuz hazırla→puanla hattı. Tam
doğrulama (`dogrula`, görev başına 1–3 dk, bağımlılık kurar) `uzunDenetim`dedir (`SINAV_TAM=1` pytest).

## K13 — Görev seçimi

15 görev, 7 temel (uygulama, site, kutuphane, yz, ml-temel, veri, dil-modeli); 4 kolay, 6 orta, 5 zor; türler:
6 özellik, 4 hata, 1 değişiklik, 2 okuma, 2 tuzak (notlar ve paylaştırma görevlerinde de tuzak öğesi var).
`algoritma` ve `sifirdan/*` yazılırken bilinçli olarak dışarıda bırakıldı; `ince-ayar` (GPU/ağ isteyen işler
ağırlıkta) seçilmedi. Görevler küçük modellerin bilinen zayıflıklarını hedefler: Türkçe harf ve ek, kayan noktalı
para, saat dilimi, birden çok dosyaya yayılan tarif, testi gevşetme eğilimi, belgede yazan ama uygulanmamış tasarım.
