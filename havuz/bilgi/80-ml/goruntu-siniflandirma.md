---
baslik: Görüntü sınıflandırma
ozet: Aktarım öğrenmesiyle görüntü sınıflandırma; veri hazırlığı (EXIF, NFC sınıf adı, kişisel veri), yakın kopya sızıntısı, arka plan kısayolu ve veri artırma, dengesizlik ve değerlendirme; çalışan örneklerle.
etiketler: [makine-ogrenmesi, goruntu, aktarim-ogrenmesi, veri-artirma, sizinti, degerlendirme]
duzey: orta
guncellik: 2026-11
---

# Görüntü sınıflandırma

> Bu notu ne zaman okumalı: fotoğraflardan sınıf tahmin eden bir model kurulacakken (ürün türü, belge türü, hasar
> var/yok, bitki hastalığı…); "doğrulamada %98, kullanıcıların fotoğraflarında berbat" durumunda; veri artırma
> seçilirken.

## Temel fikir

- **Sıfırdan eğitmeyin.** Büyük bir veride önceden eğitilmiş bir görüntü modeli (omurga, backbone) alınır; ya
  çıkardığı gömmeler üstünde basit bir sınıflandırıcı eğitilir ya da son katmanları sizin verinizle ince ayarlanır
  (aktarım öğrenmesi, transfer learning). Sınıf başına birkaç yüz görüntü çoğu iş için başlangıçta yeter.
- **Sorunların çoğu veridedir:** aynı fotoğrafın kopyaları iki tarafa düşer (ölçüm şişer), sınıflar farklı yerde
  ya da cihazda çekilmiştir (model nesneyi değil arka planı öğrenir), telefon fotoğrafları yan döner (EXIF), klasör
  adları iki ayrı Unicode biçimindedir.
- **Ölçüm kullanımı taklit eder:** sınama görüntüleri, modelin göreceği yerden (yeni kullanıcı, yeni mağaza, yeni
  cihaz, yeni ay) gelir; sınıf başına duyarlılık ve hata görüntüleri gözle incelenir.

## Karar tablosu

| Durum | Yaklaşım | Neden |
| --- | --- | --- |
| Sınıf başına < 50 görüntü | Hazır gömme + lojistik regresyon (doğrusal yoklama, linear probe) ya da en yakın komşu | Az veride ince ayar ezberler |
| Sınıf başına 100–1000 | Omurgayı dondur, başlığı eğit; sonra son blokları küçük öğrenme oranıyla aç | Önce hızlı taban, sonra kontrollü uyum |
| Sınıf başına binlerce, alan çok farklı (röntgen, uydu, tarama) | Bütün ağı ince ayar | Önceden eğitilmiş özellikler alana tam uymaz |
| Sınıflar sürekli eklenecek | Gömme + en yakın komşu / benzerlik araması | Yeni sınıf için yeniden eğitim gerekmez ([gömmeler](gommeler-ve-benzerlik.md)) |
| Telefonda, ağsız çalışacak | Küçük omurga + ONNX ya da benzeri dışa aktarım; nicemleme | Boyut ve gecikme sınırı |
| "Bu ne?" yerine "kusur nerede?" | Sınıflandırma değil, nesne bulma / bölütleme | Yer bilgisi gerekir; bu notun dışı |
| Görüntüde metin var (fatura, tabela) | Önce metin tanıma (OCR) + metin sınıflandırma | Görüntü modeli yazıyı okumakta zayıftır ([belge girdisi](../85-llm/cok-modlu-ve-belge.md)) |
| Hata bedeli yüksek | "Emin değilim" eşiği + insan onayı | [Metin sınıflandırma](metin-siniflandirma.md)daki kapsama ↔ doğruluk kuralı aynen geçerli |

## Veri hazırlığı

| Adım | Ne yapılır | Atlanırsa |
| --- | --- | --- |
| Yön (EXIF) | Okurken EXIF yönünü uygula (Pillow: `ImageOps.exif_transpose`) | Telefon fotoğrafları yan/ters; model "yan yatmış" dünyayı öğrenir |
| Renk kipi | `convert("RGB")`: gri, RGBA, CMYK, paletli görüntüler tek biçime | Kanal sayısı hatası ya da sessizce bozuk renk |
| Bozuk dosya | Her dosyayı açıp doğrula; açılmayanı ayrı listeye | Eğitim ortada çöker |
| Sınıf adı | Klasör adlarını NFC'ye çevir (aşağıda) | Aynı sınıf iki sınıf olur |
| Yakın kopya | Algısal özet (dHash/pHash) ile grupla, grupları ayır (aşağıda) | Sınama puanı şişer |
| Kişisel veri | Yüz, plaka, ekran görüntüsündeki ad/telefon: amaç dışıysa bulanıklaştır ya da çıkar; EXIF'teki konum ve cihaz bilgisini sil | KVKK riski ([KVKK pratiği](../50-guvenlik/kvkk-pratik.md)) |
| Lisans | İnternetten toplanan görüntünün ve önceden eğitilmiş ağırlığın kullanım koşulunu kaydet | Ticari üründe kullanılamayan veri/model (doğrulanmadı ise "doğrulanmadı" yazın) |

macOS dosya adlarını çoğu zaman ayrışık (NFD) yazar; Windows ve Linux birleşik (NFC). Aynı veri iki bilgisayarda
toplanınca:

```python calistir
import unicodedata
from collections import Counter

# Aynı veri iki bilgisayarda toplanmış; macOS dosya adını çoğu zaman ayrışık (NFD) yazar
folders = ["çiçek", "ağaç", unicodedata.normalize("NFD", "çiçek"), "ağaç"]
as_read = Counter(folders)
as_classes = Counter(unicodedata.normalize("NFC", name) for name in folders)
print(f"klasörden okunan sınıf sayısı: {len(as_read)}, NFC sonrası: {len(as_classes)}")
print("göze aynı iki ad eşit mi?", folders[0] == folders[2], "· uzunluklar:", len(folders[0]), len(folders[2]))
assert len(as_read) == 3 and len(as_classes) == 2
```

```cikti
klasörden okunan sınıf sayısı: 3, NFC sonrası: 2
göze aynı iki ad eşit mi? False · uzunluklar: 5 7
```

Sınıf listesi eğitimden önce yazdırılıp gözle okunur; beklenenden fazla sınıf varsa önce buna bakın
([Unicode ve kodlama](../10-diller/unicode-ve-kodlama.md)).

## Yakın kopya: ölçümü şişiren sızıntı

Aynı ürünün iki açıdan çekilmiş fotoğrafı, yeniden boyutlanmış ya da yeniden kaydedilmiş kopyası, ardışık kareler…
Rastgele ayrımda bunların biri eğitime, öteki sınamaya düşer ve model "tanır". Birebir özet (MD5) bunları bulmaz;
algısal özet (dHash: küçültülmüş gri görüntüde komşu piksellerin karşılaştırması, 64 bit) bulur:

```python calistir
import hashlib
import random

rng = random.Random(12)
W, H = 9, 8  # fark özeti (dHash) için küçültülmüş boyut: 9 × 8 gri görüntü


def base_photo():
    return [[rng.uniform(0, 255) for _ in range(W)] for _ in range(H)]


def variant(img):  # aynı fotoğrafın başka kopyası: parlaklık ve hafif gürültü (yeniden kaydetme)
    gain = rng.uniform(0.85, 1.15)
    return [[min(255.0, max(0.0, v * gain + rng.gauss(0, 4))) for v in row] for row in img]


def dhash(img):  # her satırda komşu piksel karşılaştırması → 64 bit
    bits = [row[x] > row[x + 1] for row in img for x in range(W - 1)]
    return sum(1 << i for i, bit in enumerate(bits) if bit)


def near(a, b, limit=6):
    return bin(a ^ b).count("1") <= limit


photos = []  # (asıl fotoğraf kimliği, görüntü); kimliği gerçek veride BİLMEYİZ
for photo_id in range(150):
    img = base_photo()
    photos += [(photo_id, img)] + [(photo_id, variant(img)) for _ in range(rng.randint(0, 3))]
rng.shuffle(photos)
cut = int(0.8 * len(photos))


def leaks(train, test):
    md5 = lambda img: hashlib.md5(bytes(int(v) for row in img for v in row)).hexdigest()
    train_md5, train_dh = {md5(img) for _, img in train}, [dhash(img) for _, img in train]
    exact = sum(md5(img) in train_md5 for _, img in test)
    close = sum(any(near(dhash(img), h) for h in train_dh) for _, img in test)
    return f"{len(test)} sınama görüntüsünün {exact} tanesinin birebir, {close} tanesinin yakın kopyası eğitimde"


print("rastgele ayrım:", leaks(photos[:cut], photos[cut:]))
group = []  # yakın kopyaları grupla: her görüntü, kendine yakın ilk görüntünün grubuna girer
for i, (_, img) in enumerate(photos):
    h = dhash(img)
    group.append(next((group[j] for j in range(i) if near(h, dhash(photos[j][1]))), i))
test_groups = set(sorted(set(group), key=lambda g: random.Random(g).random())[: len(set(group)) // 5])
train = [p for p, g in zip(photos, group) if g not in test_groups]
test = [p for p, g in zip(photos, group) if g in test_groups]
print("gruplu ayrım:  ", leaks(train, test))
assert len(set(group)) == 150  # gruplama asıl 150 fotoğrafı buldu
```

```cikti
rastgele ayrım: 79 sınama görüntüsünün 0 tanesinin birebir, 70 tanesinin yakın kopyası eğitimde
gruplu ayrım:   77 sınama görüntüsünün 0 tanesinin birebir, 0 tanesinin yakın kopyası eğitimde
```

Kurallar: önce grupla, sonra **grupları** ayır ([ayrım ve çapraz doğrulama](ayrim-ve-capraz-dogrulama.md)). Eşik
(burada 6 bit) veriye göre değişir: bilinen birkaç kopya çiftinin ve birkaç farklı çiftin uzaklığına bakıp seçin;
gerçek fotoğraflarda düz bölgeler bitleri oynatır. Aynı kişiye/ürüne/hastaya ait farklı fotoğraflar da bir gruptur:
gruplama ölçütü "aynı varlık"tır, yalnız "aynı piksel" değil.

## Kısayol öğrenme ve veri artırma

Sınıflar farklı ortamlarda toplanmışsa (bir sınıf aydınlık depoda, öteki karanlık atölyede) model nesneyi değil
ortamı öğrenir. Aynı ortamdan gelen sınama bunu **göstermez**. 4 × 4 piksellik oyuncak görüntü: ortadaki 4 piksel
nesne (zayıf işaret), kalan 12 piksel arka plan (odanın ışığı):

```python calistir
import random

rng = random.Random(21)
CENTER = {5, 6, 9, 10}  # 4 × 4 görüntünün ortadaki 4 pikseli nesne; kalan 12 piksel arka plan


def background(bright):  # çekim yerinin ışığı arka planı belirler
    return [(1.0 if bright else -1.0) + rng.gauss(0, 1) for _ in range(16)]


def photo(label, bright_room):
    signal = 0.6 if label else -0.6  # nesnenin zayıf ama gerçek işareti
    bg = background(bright_room)
    return [signal + rng.gauss(0, 1) if i in CENTER else bg[i] for i in range(16)], label


def collect(n, p_same_room):  # sınıf 1 aydınlık, sınıf 0 karanlık odada çekilmiş olma olasılığı
    rows = []
    for _ in range(n):
        label = rng.random() < 0.5
        rows.append(photo(label, (rng.random() < p_same_room) == label))
    return rows


def swap_background(rows):  # artırma: nesneyi koru, arka planı rastgele bir odayla değiştir
    out = []
    for x, y in rows:
        bg = background(rng.random() < 0.5)
        out.append(([v if i in CENTER else bg[i] for i, v in enumerate(x)], y))
    return out


def centroid_model(rows):  # en yakın merkez sınıflandırıcı
    mean = lambda c: [sum(x[i] for x, y in rows if y == c) / sum(1 for _, y in rows if y == c) for i in range(16)]
    m1, m0 = mean(True), mean(False)
    d = lambda x, m: sum((a - b) ** 2 for a, b in zip(x, m))
    return lambda x: d(x, m1) < d(x, m0)


accuracy = lambda model, rows: sum(model(x) == y for x, y in rows) / len(rows)
train = collect(2000, 0.9)  # toplama hatası: sınıflar çoğunlukla farklı odalarda çekilmiş
same_place, new_place = collect(2000, 0.9), collect(2000, 0.5)  # yeni yerde oda sınıfla ilgisiz
for name, data in (("düz eğitim", train), ("arka planı değiştirilmiş", swap_background(train))):
    model = centroid_model(data)
    print(f"{name:24s} aynı yerde: {accuracy(model, same_place):.2f}   yeni yerde: {accuracy(model, new_place):.2f}")
```

```cikti
düz eğitim               aynı yerde: 0.90   yeni yerde: 0.51
arka planı değiştirilmiş aynı yerde: 0.91   yeni yerde: 0.87
```

Düz eğitim aynı yerde %90 alıyor, yeni yerde yazı tura. Asıl çare **toplamayı düzeltmektir** (her sınıftan her
ortamda, her cihazla çekim); artırma ikinci yoldur ve ancak kısayolu bozan türdense işe yarar. Sınama kümesinin bir
parçası mutlaka "yeni yer/cihaz/kullanıcı"dan gelsin; kısayol yalnız orada görünür.

| Artırma | Ne zaman güvenli | Ne zaman etiketi ya da anlamı bozar |
| --- | --- | --- |
| Yatay çevirme | Doğal nesneler, ürün fotoğrafı | Yön taşıyan sınıflar (sol/sağ ok, sol/sağ el), yazılı görüntüler |
| Dikey çevirme, 90° döndürme | Uydu, mikroskop, yukarıdan çekim | Günlük fotoğraf (gökyüzü aşağıda olmaz) |
| Rastgele kırpma + boyutlama | Nesne görüntünün büyük kısmını kaplıyorsa | Küçük nesne ya da kusur kırpılıp dışarıda kalabilir |
| Parlaklık, karşıtlık, renk oynatma | Işık koşulları değişkense | Sınıf renkle tanımlıysa (olgun/ham meyve, pas, yanık) |
| Bulanıklık, sıkıştırma gürültüsü | Kullanıcı fotoğrafları düşük kaliteliyse | İnce dokuya dayalı sınıflar (kumaş kusuru) |
| Arka plan değiştirme, kopyala-yapıştır | Nesne maskesi varsa, kısayol şüphesi varsa | Maske kötüyse kenar izleri yeni kısayol olur |

Kural: artırmayı **yalnız eğitimde** uygulayın; doğrulama ve sınama görüntüleri yalnız boyutlanır ve
normalleştirilir. Artırılmış 20 görüntüyü kaydedip gözle bakın: etiketi hâlâ doğru mu?

## Aktarım öğrenmesi: kalıp

API'ler torchvision 0.29 ve timm 1.0 kurulu bir ortamda denetlendi (Kasım 2026); ağırlık indirilip eğitim **bu
ortamda koşulmadı**. Aşamalar:

```python
# Gösterim amaçlı iskelet; kurulu sürümün belgesinden doğrulayın.
import torch
from PIL import Image, ImageOps
from torchvision.models import ResNet18_Weights, resnet18
from torchvision.transforms import v2

weights = ResNet18_Weights.DEFAULT
model = resnet18(weights=weights)
evaluate_tf = weights.transforms()  # omurganın beklediği boyut + normalleştirme; KENDİNİZ yazmayın
train_tf = v2.Compose([v2.RandomResizedCrop(224, scale=(0.6, 1.0)), v2.RandomHorizontalFlip(),
                       v2.ColorJitter(0.2, 0.2, 0.2), evaluate_tf])  # artırma yalnız eğitimde

def load(path):
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")  # yön + renk kipi

# 1. aşama: omurga donuk, yalnız yeni başlık eğitilir
for p in model.parameters():
    p.requires_grad = False
model.fc = torch.nn.Linear(model.fc.in_features, num_classes)
optimizer = torch.optim.AdamW(model.fc.parameters(), lr=1e-3)
# 2. aşama: son blok(lar) açılır, omurgaya ~10 kat küçük öğrenme oranı; erken durdurma doğrulamada
# Tahminde: model.eval() + torch.no_grad(); yoksa normalleştirme katmanları eğitim kipinde kalır.
```

- **Önce doğrusal yoklama:** omurgadan gömme çıkarıp lojistik regresyon eğitmek dakikalar sürer ve sağlam bir taban
  verir. İnce ayar bu tabanı kat yayılımından fazla geçmiyorsa gerek yoktur.
- **Ön işleme omurgayla eşleşmeli:** girdi boyutu, normalleştirme ortalaması/sapması, renk sırası. Yanlış
  normalleştirmede model çalışır ama başarı sessizce düşer.
- **Öğrenme oranı:** başlık için 1e-3 civarı, açılan omurga katmanları için 1e-5–1e-4 (başlangıç; doğrulamayla
  ayarlayın, [hiperparametre arama](hiperparametre-arama.md)). Büyük oran önceden öğrenilmiş özellikleri bozar.
- Bellek ve süre hesabı, GPU gereği: [hesaplama ve donanım](hesaplama-ve-donanim.md).

## Dengesizlik ve değerlendirme

- Sınıf başına görüntü sayısını yazdırın. Az sınıf için önce **veri toplayın**; sonra sınıf ağırlıklı kayıp ya da
  dengeli örnekleme. Olasılık kullanılacaksa yeniden örnekleme sonrası kalibrasyona bakın
  ([kalibrasyon](kalibrasyon-ve-olasilik.md)).
- Doğruluk değil **sınıf başına duyarlılık** ve karışıklık matrisi; tek sayı gerekiyorsa makro F1
  ([değerlendirme ölçütleri](degerlendirme-olcutleri.md)).
- **Dilimler:** cihaz, ışık, kaynak (kullanıcı yüklemesi / stüdyo), yüklenme ayı. Toplam iyi, bir dilim çöküyorsa
  sorun genellikle toplamadadır ([hata analizi](hata-analizi.md)).
- **Hata galerisi:** her sınıf için en emin yanlış 20 görüntüyü ızgara olarak kaydedip bakın. Etiket hatası, yanlış
  kırpma, yan dönmüş fotoğraf, kısayol en hızlı böyle görülür.
- "Bilinmeyen" girdi: model hiç görmediği türden bir fotoğrafa da bir sınıf verir. Ya "diğer" sınıfı için gerçek
  örnekler toplayın ya da güven eşiğiyle "emin değilim" deyin; ikisini de sınama kümesinde ölçün.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Doğrulama %98, kullanıcı fotoğraflarında kötü | Yakın kopya sızıntısı ya da kısayol (arka plan, cihaz) | Gruplu ayrım; yeni yer/cihazdan sınama dilimi |
| Telefon fotoğraflarında başarı düşük, stüdyoda iyi | EXIF yönü uygulanmamış; çözünürlük/sıkıştırma farkı | `exif_transpose`; kullanıcı fotoğraflarıyla eğitim ve sınama |
| Sınıf sayısı beklenenden fazla | NFD/NFC klasör adları, büyük/küçük harf farkı | Adları NFC'ye çevirin; sınıf listesini yazdırın |
| Eğitimde iyi, tahminde rastgeleye yakın | Tahminde farklı ön işleme ya da `model.eval()` unutuldu | Ön işlemeyi tek işlevde tutun; değerlendirme kipini açın |
| İnce ayardan sonra taban modelden kötü | Öğrenme oranı yüksek; omurga bozuldu | Önce dondurulmuş başlık; omurgaya küçük oran |
| Çevirme artırmasından sonra iki sınıf karışıyor | Yön taşıyan sınıflar | O artırmayı kaldırın; artırılmış örneklere bakın |
| Model en sık sınıfı her yerde söylüyor | Ağır dengesizlik | Az sınıfa veri; ağırlıklı kayıp; sınıf başına ölçüt |
| Doğrulama ölçütü dönemden döneme zıplıyor | Doğrulama kümesi çok küçük | Daha büyük doğrulama; güven aralığı |
| Yüz/plaka içeren görüntüler depoda | Kişisel veri amaç dışı toplandı | Bulanıklaştırın ya da çıkarın; EXIF konumunu silin |

## Denetim listesi

- [ ] Görüntüler EXIF yönü uygulanıp RGB'ye çevrilerek okunuyor; açılmayan dosyalar ayrı listede.
- [ ] Sınıf adları NFC; sınıf listesi ve sınıf başına sayılar yazdırıldı.
- [ ] Yakın kopyalar algısal özetle gruplandı; ayrım grup bazında; sınamada eğitime yakın kopya sayısı 0.
- [ ] Sınama kümesinin bir parçası yeni yer/cihaz/kullanıcıdan geliyor ve ayrı raporlanıyor.
- [ ] Artırmalar yalnız eğitimde; her birinin etiketi bozmadığı örnek görüntülerle denetlendi.
- [ ] Doğrusal yoklama tabanı ölçüldü; ince ayarın kazancı kat yayılımıyla karşılaştırıldı.
- [ ] Sınıf başına duyarlılık, karışıklık matrisi ve hata galerisi incelendi.
- [ ] Kişisel veri ve lisans (görüntü ve ağırlık) kaydı tutuldu.

## Küçük modele yaptırırken

- **İsteme yazın:** "Görüntüleri `ImageOps.exif_transpose(...).convert('RGB')` ile oku. Sınıf adlarını NFC'ye çevir.
  Ayırmadan önce dHash ile yakın kopyaları grupla ve grupları ayır; sınamada eğitime yakın kopya sayısını yazdır.
  Önce omurga donuk doğrusal yoklama yap; ön işleme için omurganın kendi dönüşümünü kullan. Artırma yalnız eğitimde."
- **Modelin tipik hatası:** `torchvision.datasets.ImageFolder` ile rastgele ayırıp kopyaları iki tarafa koyar;
  normalleştirme değerlerini ezberden yazar; artırmayı doğrulamaya da uygular; `model.eval()` unutur; yön taşıyan
  sınıflara yatay çevirme koyar; doğruluk tek sayısıyla yetinir.
- **Çıktıda denetleyin:** ayrımın gruplu olduğu; doğrulama dönüşümünde rastgele işlem olmadığı; tahmin kodunda
  `eval()` ve `no_grad`; sınıf başına ölçüt tablosu.
- **Sorun:** "Bu model hangi fotoğraflara uygulanacak ve sınama fotoğrafları onlara benziyor mu?"

## İlgili

- [Derin öğrenme temelleri](derin-ogrenme-temelleri.md) · [Hesaplama ve donanım](hesaplama-ve-donanim.md) ·
  [Hiperparametre arama](hiperparametre-arama.md)
- [Veri sızıntısı](veri-sizintisi.md) — yinelenen kayıt · [Ayrım ve çapraz doğrulama](ayrim-ve-capraz-dogrulama.md)
  — gruplu ayrım
- [Gömmeler ve benzerlik araması](gommeler-ve-benzerlik.md) — gömme + en yakın komşu, görüntü araması
- [Etiketleme ve aktif öğrenme](etiketleme-ve-aktif-ogrenme.md) · [Hata analizi](hata-analizi.md)
- Havuzdaki görüntü temeli (yazılıyor): [`goruntu`](../../goruntu/README.md) — güvenli hazırlık (EXIF, gizlilik),
  kopya bulma, sınıflandırma ince ayarı, ONNX, gömme ve arama
- Sıfırdan küçük evrişimli ağ (numpy): [`ml-temel/ornekler/06_sekil_evrisim.py`](../../ml-temel/ornekler/06_sekil_evrisim.py)
