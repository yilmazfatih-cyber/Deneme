# Osmanlıca HTR — rik'a için küçük satır/kelime tanıma modeli

Osmanlıca (öncelik: **rik'a** el yazısı) satır ve kelime görüntülerini Arap harfli metne çeviren, ~1,9 M parametreli
CRNN+CTC modeli ve onu gerçek veriyle büyütmek için bir **A/B/C/D etiketleme döngüsü**.

- Model telefona sığar: fp32 7,8 MB, **int8 ONNX 2,0 MB**.
- Gerçek veri yokken yazı tiplerinden (4'ü rik'a) sentetik veriyle **ön eğitim**; sonra sizin etiketlerinizle ince ayar.
- Etiketleme: sayfa → satır (→ kaba kelime) kesilir, model her kesit için **A / B / C** önerir, doğrusu yoksa **D** ile
  yazarsınız. Her etiket anında eğitim manifestine düşer; "Modeli güncelle" düğmesi ince ayarı arka planda başlatır.
- Neden klasik OCR olmuyor, güncel Arapça HTR/OCR depoları ve veri kümeleri: [`docs/arastirma.md`](docs/arastirma.md).

![etiketleme arayüzü](docs/etiketleme-arayuzu.png)

## Kurulum

```bash
cd osmanlica-htr
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[disa,test]"          # torch, numpy, pillow, scipy (+ onnx, pytest)
python -m pytest -q tests              # 8 test
```

GPU gerekmez; CPU'da çalışır (GPU varsa otomatik kullanılır). Yazı tipleri `fonts/` içinde gelir (SIL OFL).

## Hızlı akış (gerçek veriyle)

```bash
# 1) Sentetik ön eğitim verisi (bir kez, ~3 dk)
osm sentez --adet 24000 --cikti veri/sentez_v0

# 2) Ön eğitim (CPU'da 24k örnek × 10 dönem ≈ birkaç saat; GPU'da dakikalar)
osm egit --manifest veri/sentez_v0/manifest.jsonl --cikti cikti/v0 --donem 10 --ogrenme-orani 2e-3

# 3) Sayfalarınızı satırlara böl, etiket kuyruğuna ekle
osm bolut belgeler/ --duzey satir            # ya da --duzey kelime (kaba kelime kesimi)
#    eScriptorium/Transkribus'tan PAGE-XML varsa satırlar oradan alınır:
osm bolut belgeler/ --pagexml belgeler/page/

# 4) Etiketle: tarayıcıda http://127.0.0.1:8765
osm etiketle --model cikti/v0/model.pt
#    1/2/3 → A/B/C · Enter → D'yi kaydet · S atla · X kesim bozuk · Z geri al · "Modeli güncelle" → ince ayar

# 5) İnce ayar (arayüzdeki düğme de aynısını yapar)
osm egit --manifest veri/etiket_manifest.jsonl --manifest veri/sentez_v0/manifest.jsonl \
         --sentez-ust-sinir 4000 --baslangic cikti/v0/model.pt --cikti veri/model_ince --donem 8 --ogrenme-orani 5e-4

# 6) Tahmin ve dışa aktarma
osm tahmin satir.png --model veri/model_ince/model.pt --kelimeler    # A/B/C + kelime kutuları
osm disa --model veri/model_ince/model.pt --int8                      # ONNX + int8
```

Etiketleme sunucusu modeli dosya değiştiğinde kendiliğinden yeniler; ince ayar bitince öneriler yeni modelden gelir.

## Tasarım kararları

| Karar | Gerekçe |
| --- | --- |
| **Satır düzeyi CTC**, karakter kesme yok | Rik'a bitişik ve ligatür ağırlıklı; karakter kesen OCR motorları Arapça el yazısında %90'ın üzerinde hata verir (bkz. araştırma). |
| **Kelime sınırı = CTC'deki boşluk sembolü** | Satırdaki boşluklara bakarak kelime bölme rik'ada güvenilmez: 6 yazı tipi, 150 satırlık ölçümde en iyi eşik bile satırların yalnızca ~%50'sinde doğru kelime sayısını buldu. Model boşluğu bir karakter gibi öğrenir; `tahmin.kelime_kutulari` zaman eksenini piksele çevirir. |
| **Çıktı Arap harfli**; Latin çevriyazı yok | İki işi tek modele yüklemek veriyi böler; çevriyazı ayrı, kural tabanlı bir adım olabilir. |
| Harekeler atılır, ى/ي/ی tek sembole, ک→ك | Arşiv belgelerinde hareke yok; son konumda üç ye aynı görünür, ayrı etiketlemek CTC'yi şaşırtır (`alfabe.normallestir`). |
| **1,9 M parametre** (6 konv. blok + 2 katman BiLSTM 128) | 100–1.000 satırlık düşük kaynak rejiminde CRNN+CTC Transformer'ı geçer (Al-azzawi vd. 2026); int8'de 2 MB. |
| Gerçek örnekler eğitimde ×4 tekrarlanır | Az sayıda gerçek etiket sentetik yığının içinde kaybolmasın. |
| Etiketleme birimi varsayılan **satır** | Kaba kelime kesimi rik'ada hatalı; satır etiketi hem daha güvenilir hem kelime bilgisini (boşluk) taşır. |

## Klasör yapısı

```
osmanlica_htr/
  alfabe.py    Osmanlıca alfabe, normalleştirme, kodlama
  sentez.py    yazı tiplerinden sentetik kelime/satır üretimi + el yazısı bozulmaları
  bolut.py     sayfa → satır → kaba kelime (Sauvola, eğim düzeltme, izdüşüm); PAGE-XML içe aktarma
  veri.py      ön işleme (yükseklik 64), manifest, Dataset, CER
  model.py     CRNN+CTC, kaydet/yükle
  kodcoz.py    açgözlü ve ön-ek ışın araması (A/B/C için farklı top-k)
  egit.py      eğitim döngüsü (OneCycle, en iyi CER'i kaydeder)
  tahmin.py    Tahminci, CTC hizalamasından kelime kutuları
  etiketle.py  yalnızca stdlib ile etiketleme sunucusu (A/B/C/D, geri al, arka planda ince ayar)
  cli.py       `osm` komutları
fonts/         17 Arap harfli OFL yazı tipi (4 rik'a)
metin/         sentetik veri için ~1.700 kelimelik Osmanlıca tohum sözlük (kendi listenizi ekleyin)
veri/          (git dışı) sentetik veri, kırpımlar, kuyruk, etiketler, ince ayar modelleri
docs/          araştırma raporu, ekran görüntüsü
```

## Veri biçimleri

- **Manifest** (`manifest.jsonl`): `{"dosya": "goruntuler/x.png", "metin": "دولت علیه", "kaynak": "sentez|etiket"}`.
  Yollar manifestin klasörüne görelidir; birden çok manifest birleştirilebilir.
- **Kuyruk** (`veri/kuyruk.jsonl`): bölütleyicinin ürettiği öğeler (kimlik, kesit dosyası, satır bağlamı, kutular, tür).
- **Etiketler** (`veri/etiketler.jsonl`): her karar (`secim`: A/B/C/D/atla/bozuk, `metin`, zaman). Son satır silinerek geri alınır.
- **Etiket manifesti** (`veri/etiket_manifest.jsonl`): etiketlerden otomatik türetilen eğitim manifesti (`kaynak: etiket`).

Kendi verinizi elle hazırlayacaksanız yalnızca manifest biçimine uymanız yeterlidir.

## Beklentiler ve sınırlar

- Sentetik ön eğitim yazı tipi rik'asını öğretir; **gerçek el yazısını öğretmez**. İlk gerçek etiketlerde öneriler
  zayıf olacaktır; 200–300 satırdan sonra A/B/C'nin isabeti belirgin biçimde artar, 1.000+ satırda kullanışlı olur.
  Literatürde rik'a için %10–15 CER iyi bir sonuçtur.
- Bölütleyici düzgün taranmış, tek sütunlu belgeler içindir. Kenar notları, eğik satırlar ve iç içe yazılar için
  eScriptorium'da (Kraken `blla`) bölütleyip PAGE-XML'i `--pagexml` ile verin.
- Cumhurbaşkanlığı Devlet Arşivleri gibi kaynaklardaki görüntülerin kullanım koşullarını kontrol edin; yazı tipleri OFL'dir.

## Yol haritası

1. Etiketlenen satırlardan zorlanmış hizalama ile otomatik kelime kırpımı (veriyi kelime düzeyinde çoğaltma).
2. Hafif bir karakter n-gram dil modeliyle ışın araması (A/B/C'nin daha anlamlı olması).
3. Muharaf (CC BY-NC-SA, çoğunluk ruk'a) ve OpenITI Osmanlıca baskı satırlarıyla ek ön eğitim seçeneği.
4. Tarayıcıda çalışan ONNX Runtime Web demo (Köprü PWA ile aynı çevrimdışı ilke).
