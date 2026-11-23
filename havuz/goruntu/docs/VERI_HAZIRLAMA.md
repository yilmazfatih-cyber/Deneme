# Veri hazırlama: kendi fotoğraflarınızla doğru veri kümesi

## 1. Klasör düzeni

```
urunler/
├─ ayakkabı/   foto1.jpg foto2.jpg …
├─ çanta/      …
└─ saat/       …            (alt klasör serbest: saat/urun-12/on.jpg)
```

Sınıf adı = klasör adı (Türkçe karakter serbest; macOS'un ayrışık "ç"si otomatik düzeltilir). Gizli dosyalar,
`._dosya` (macOS) ve `__MACOSX` atlanır. Hazır bir ayrımınız varsa `egitim/`, `test/` (isteğe bağlı
`dogrulama/`) klasörleri altında aynı düzen; o zaman ayrım değiştirilmez, yalnız sızıntı uyarısı verilir.

## 2. Kaç görüntü gerekir? (TAHMİN — ölçülmedi)

Aşağıdakiler yaygın deneyime dayanan **kaba tahminlerdir**, bu temelde gerçek ürün verisiyle ölçülmedi:

| Durum | Sınıf başına | Kip |
| --- | ---: | --- |
| Belirgin farklı sınıflar (ayakkabı / çanta / saat) | 30–100 | `cpu-kucuk` (yalnız baş) |
| Birbirine benzeyen sınıflar (spor ayakkabı / koşu ayakkabısı) | 200–500+ | `colab-t4` (tam ince ayar) |
| Güvenilir test ölçümü için test kümesinde | ≥ 30 | — |
| Sıcaklık ölçekleme için doğrulamada (toplam) | ≥ 50 | aksi hâlde otomatik atlanır |

En iyi yol: az veriyle başlayın, `rapor.txt`'deki karışıklık matrisine bakın, en çok karışan sınıflara veri
ekleyin. Duman testinde sentetik şekillerde sınıf başına ~32 eğitim görüntüsü %95+ verdi (kolay küme).

## 3. Etiketleme

- Her görüntü TEK sınıfa aittir. Birden çok ürün içeren fotoğrafları çıkarın ya da kırpın.
- Sınıf tanımını yazın ("çanta: sırt çantası dahil mi?") ve tutarlı uygulayın.
- Eğitimden sonra `degerlendirme.json` → `en_emin_yanlislar`: modelin çok emin olup yanıldığı dosyalar
  çoğu kez ETİKET HATASIdır; elle bakıp düzeltin.
- `ayrim.json` → `celiskiler`: neredeyse aynı fotoğraf iki farklı sınıfta — biri yanlış etiketli olabilir.
- Yalnız harf büyüklüğüyle ayrışan sınıflar ("Çanta" / "çanta") için uyarı verilir: birleştirin.

## 4. Sızıntı (en sık yapılan, en pahalı hata)

Aynı fotoğrafın kopyası (küçültülmüş, yeniden sıkıştırılmış, hafif kırpılmış) hem eğitimde hem testte
olursa test başarısı olduğundan yüksek çıkar; uygulamada düşer. Bu temel:
- yakın kopyaları (pHash, 5 kırpma varyantı, eşik 8) AYNI parçaya koyar,
- `-D veri.grup_deseni="^([^_]+)_"` ile aynı ürünün farklı açılardan fotoğraflarını AYNI parçaya koyar
  (dosya adları `urun12_on.jpg`, `urun12_arka.jpg` gibiyse). Alt klasöre göre: `"^([^/]+)/"`.
- Hazır ayrımda: `python -m goruntu sizinti --egitim veri/egitim --sinama veri/test` (sızıntı varsa çıkış 1).
Yakalanmayanlar: aynı ürünün FARKLI çekilmiş fotoğrafları (grup deseni verin), döndürülmüş/aynalanmış
kopyalar, tek kenardan çok kırpılmış kopyalar.

## 5. Dengesizlik

Bir sınıfta 500, ötekinde 30 görüntü varsa model çoğunluğa kayar. Varsayılan `agirlikli-kayip` (az olan
sınıfın hatası daha pahalı); alternatif `dengeli-ornekleme`. Doğruluğa DEĞİL makro F1'e ve sınıf başına
duyarlılığa bakın. Az sınıfa veri eklemek her yöntemden iyidir.

## 6. Gizlilik (kullanıcı fotoğrafları)

- Telefon fotoğrafları GPS konumu, cihaz seri numarası, tarih, ad, düzenleme geçmişi taşıyabilir; EXIF
  içindeki küçük resim kırpılmadan ÖNCEKİ hâli gösterebilir.
- `python -m goruntu temizle gelen/ --cikti temiz/` — üst veri silinir, yön piksellere uygulanır, rapor
  yalnız "GPS var/yok" der (değer yazmaz).
- `hazirla` aynı temizliği boyutlandırmayla birlikte yapar. Sunucu yüklemeleri kalıcı olarak yazılmaz;
  ancak FastAPI/Starlette 1 MB'ı aşan yüklemeyi istek süresince geçici dosyada tutar (istek bitince silinir).
- Eğitim verisi olarak kullanıcı fotoğrafı topluyorsanız açık rıza alın; yüzleri/plakaları içeren
  görüntüler bu temelde bulanıklaştırılmaz (Sınırlar).

## 7. Hız

Büyük fotoğraflar (12 MP) her dönem yeniden çözülür; önce küçültün:
`python -m goruntu hazirla urunler urunler_512 --boyut 512 --bicim jpeg`. Eğitimde JPEG'ler zaten
DCT düzeyinde küçültülerek çözülür; değerlendirme/çıkarım tam çözer (ONNX ile birebirlik için).
