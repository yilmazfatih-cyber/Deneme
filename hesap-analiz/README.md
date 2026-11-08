# hesap-analiz

Banka hesap dökümlerini ve kredi kartı ekstrelerini **tamamen bu bilgisayarda** analiz eden araç.
Ağa çıkmaz, bulut yapay zekâ kullanmaz, veriyi hiçbir yere göndermez.

Ne yapar:

- Farklı bankaların Excel / CSV dökümlerini tek standart tabloya çevirir, örtüşen dönemleri ayıklar.
- Açıklamalardan **kişi ve kurumları** çıkarır; "AYŞE KAYA" ile "AYSE KAYA" gibi yazımları birleştirir.
- Her kişi için **gönderilen / alınan / net** dengesi ve ay ay zaman çizelgesi üretir.
- Harcamaları kurallarla **kategorilere** ayırır (kira, fatura, market, abonelik ...).
- Aylık gelen/giden, kategori dağılımı, **düzenli ödemeler** (abonelik, taksit) ve en büyük karşı tarafları çıkarır.
- Sonucu çok sayfalı **Excel** ve dış kaynak yüklemeyen tek dosyalık **HTML** rapor olarak yazar.

## Gizlilik nasıl sağlanıyor

| Katman | Ne yapıyor |
| --- | --- |
| Ağ kilidi | Araç çalışırken süreç genelinde soket açmak ve alan adı çözmek engellenir. Herhangi bir kütüphane ağa çıkmaya kalkarsa işlem hata vererek durur (`hesap_analiz/guvenlik.py`). |
| Bağımlılıklar | Yalnızca pandas, openpyxl, pyyaml, rapidfuzz. Hiçbiri telemetri göndermez. |
| Çıktılar | HTML raporu CSS dahil her şeyi kendi içinde taşır; `http://` veya `https://` içermez. |
| Depo | `girdi/`, `rapor/` ve `kisiler.csv` `.gitignore` ile dışarıda tutulur; kişisel veri depoya giremez. |

Kişi anlamlandırma kural tabanlıdır, büyük dil modeli gerekmez. İstenirse yalnızca yerel çalışan bir model
eklenebilir ama şu haliyle ihtiyaç yok.

## Kurulum

```bash
cd hesap-analiz
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Kullanım

1. Ekstreleri `girdi/` klasörüne kopyala (`.xlsx`, `.xls`, `.csv`).
2. Çalıştır:

```bash
python -m hesap_analiz            # girdi/ okur, rapor/ altına yazar
python -m hesap_analiz /yol/ekstreler --cikti /yol/rapor
```

3. `rapor/hesap-analizi.xlsx` ve `rapor/hesap-analizi.html` dosyalarını aç.

### Kişileri onaylama

İlk çalıştırmada `kisiler.csv` oluşur. Kişiler üstte, `onay = bekliyor` olarak listelenir:

```
ham_ad,kanonik_ad,tur,onay,ornek_aciklama
AHMET YILMAZ,AHMET YILMAZ,kisi,bekliyor,FAST GIDEN - ALICI: AHMET YILMAZ ...
MEHMET DEMIR,MEHMET DEMIR,kisi,bekliyor,EFT GIDEN - ALICI: MEHMET DEMİR ... KIRA
```

- `kanonik_ad` sütununa istediğin adı yaz (ör. `EV SAHİBİ`, `KARDEŞİM`).
- `tur` sütununu `kisi` ya da `kurum` yap. Kurumlar kişi dengesinden çıkar.
- `onay` sütununa `evet` yaz. Bir sonraki çalıştırmada uygulanır ve bir daha sorulmaz.
- Aynı kişiye ait iki farklı ham ad varsa ikisine de aynı `kanonik_ad` yaz; tek satırda birleşir.

### Yeni banka ekleme

`bankalar/` altındaki `.yaml` dosyaları sütun adlarını eşler. Genel şablon çoğu dökümle çalışır.
Uymayan bir döküm için `bankalar/genel.yaml` dosyasını kopyalayıp sütun adlarını düzelt:

```yaml
ad: Bankam
tur: hesap            # hesap | kart
oncelik: 10
tanima: [Bankam]      # dosya adında ya da başlıkta geçerse bu şablon seçilir
sutunlar:
  tarih: [İşlem Tarihi]
  aciklama: [Açıklama]
  tutar: [Tutar]      # ya da ayrı borc / alacak sütunları
  bakiye: [Bakiye]
isaret_ters: false    # kart ekstresinde harcama pozitif yazılıyorsa true
```

Başlık satırının kaçıncı satırda olduğu önemli değil; araç ilk 40 satırda tarih ve açıklama başlıklarını arar.

### Kategori kuralları

`kurallar/kategoriler.yaml` içindeki anahtar kelimeler kelime sınırında aranır; ilk uyan kural kazanır.
Kendi marketini veya kiracını eklemek için ilgili kategoriye kelime eklemen yeterli.
`karsi_taraf: belirsiz` yazılan kategorilerde (ör. Kira) kişi/kurum kararı ad tahminine bırakılır.

## Rapor sayfaları

| Sayfa | İçerik |
| --- | --- |
| Özet | Dönem, işlem sayısı, toplam gelen/giden, aylık ortalamalar, kart harcaması |
| Kişi Dengesi | Kişi başına gönderilen, alınan, net, işlem sayısı, ilk/son işlem, durum |
| Kişi Zaman Çizelgesi | Kişi × ay net akış |
| Aylık Akış | Ay bazında gelen, giden, net, birikimli net |
| Kategori Dağılımı / Kategori Aylık | Kategori toplamları ve yüzdeleri; giden kategorilerin ay ay dökümü |
| Düzenli Ödemeler | Haftalık / aylık / üç aylık / yıllık tekrar eden ödemeler ve yıllık tahmin |
| En Büyük Karşı Taraflar | Hacme göre ilk 15 |
| Onay Bekleyen | `kisiler.csv` içindeki onaysız satırlar |
| Tüm İşlemler | Standart tablo: tarih, açıklama, tutar, yön, banka, karşı taraf, kategori, sayılır |

Kart ekstresi de okunduysa kredi kartı ödemeleri iç transfer sayılır ve gelir/gider toplamına katılmaz
(kart harcamaları zaten gider olarak sayılır). `sayilir` sütunu bunu gösterir.

## Örnek veriyle deneme

Gerçek veri içermeyen 12 aylık uydurma ekstreler üretip çalıştırmak için:

```bash
python ornek/ornek_uret.py ornek/veri
python -m hesap_analiz ornek/veri --cikti ornek/rapor --kisiler ornek/kisiler.csv
```

## Test

```bash
python -m pytest -q
```

## Sınırlar

- Çekim, taksit bölme veya döviz dönüşümü yapılmaz; tutarlar dökümde ne yazıyorsa odur.
- Kişi adı çıkarımı açıklama metnine dayanır. Banka adı maskeliyorsa (`A*** Y***`) eşleme yapılamaz; `kisiler.csv` ile elle düzeltilir.
- "Net" bir kişiyle aranızdaki borç ilişkisini değil, hesaplar arasındaki para akışını gösterir. Yorum size aittir.
