# Veritabanı: gerçek satır görüntüleri ve çevriyazıları

`osm veri hepsi` komutu aşağıdaki açık kaynakları indirir, satır kırpımlarına çevirir ve tek bir
`veri/veritabani.jsonl` dosyasında toplar (her satır: `dosya`, `metin`, `kaynak`, `dil`, `yazi`, `tur`, `lisans`).
Görüntüler depoya girmez (`veri/` git dışıdır); bu belge ve kod yeniden üretmeye yeter. Toplam indirme ≈ 6,5 GB,
disk ≈ 12 GB (zip'ler silinebilir).

## Kaynaklar ve sayılar (8 Kasım 2026)

| kaynak | dil | yazı | tür | satır | karakter | lisans | ne işe yarar |
|---|---|---|---|---|---|---|---|
| **Muharaf** ([Zenodo](https://zenodo.org/records/11492215), [HF](https://huggingface.co/datasets/aamijar/muharaf-public), [makale](https://arxiv.org/abs/2406.09630)) | Arapça | **rik'a** (çoğunluk) | el yazısı, 19.–21. yy mektup ve resmî yazışma | 24.494 | 1.169.338 | CC BY-NC-SA 4.0 | Rik'a harf şekillerini gerçek el yazısından öğretir; Osmanlıca rik'anın en yakın açık akrabası |
| **OpenITI arabic_print_data** ([GitHub](https://github.com/OpenITI/arabic_print_data)), yalnızca `ottoman_*` yazı tipleri | Osmanlıca + Arapça | nesih | matbu, ALTO XML satır poligonları | 9.893 | 446.465 | OpenITI, araştırma | Osmanlıca kelime dağarcığı, پ چ ژ گ ڭ harfleri, Osmanlı yazım alışkanlıkları |
| **OpenITI MAKHZAN** ([Zenodo](https://zenodo.org/records/16410106)), yalnızca "Ottoman Turkish" belgeler (Doc82, Doc3391, Doc6398…) | Osmanlıca | nesih | el yazması (Revnaḳ-ı Būstān, Dāsitān-i Kesik Baş, Menāḳıb-ı Emīr Sulṭān…) | 3.465 | 160.713 | CC BY-NC-SA 4.0 | Osmanlıca el yazısı, tek gerçek Osmanlıca el yazması kaynağı |
| **Toplam** | | | | **37.852** | **1.776.516** | | |

Eğitimde Latin harf içeren 913 satır (Muharaf'taki iki dilli satırlar) dışarıda bırakılır.

### Bulunamayan / alınamayan

- **Osmanlıca rik'a + çevriyazı**: açık bir küme yok (bkz. `docs/arastirma.md`). Azra/Hokkabaz ekibinin seti yayımlanmamış.
  Bu boşluğu sizin arşiv sayfalarınız ve A/B/C/D etiketleme döngüsü dolduracak.
- **Wikimedia Commons "Documents of the Ottoman Empire"** (271 dosya + alt kategoriler: Hatt-ı hümayun, Defter, resmî
  belgeler): kategori listesi alınabildi ama `upload.wikimedia.org` bu oturumun ağından yanıt vermedi (bağlantı açılıyor,
  0 bayt). Kod hazır: `osm veri commons` kendi bilgisayarınızda çalışır; çevriyazısı yoktur, etiket kuyruğu için ham sayfa verir.
- **Devlet Arşivleri (katalog.devletarsivleri.gov.tr)**: oturum/giriş gerektirir, programatik indirme yok; sayfaları
  siz indirip `osm bolut` ile kuyruğa eklersiniz.

## Yeniden üretme

```bash
osm veri muharaf      # HF parquet → png + manifest  (1,3 GB indirme)
osm veri openiti      # git clone (13 GB!) → yalnızca ottoman_* klasörleri kullanılır; sonrası silinebilir
osm veri makhzan      # 4 GB zip → yalnızca Osmanlıca Doc*.zip çıkarılır
osm veri commons      # isteğe bağlı, ham sayfalar
osm veri birlestir    # veri/veritabani.jsonl + veri/veritabani.md (özet tablo)
```

## Ön işleme kuralları (`alfabe.normallestir`)

- Sunum biçimleri (FExx) çözülür; ى / ي / ی → ی; ک → ك; ۀ → ه; Farsça rakamlar → Arapça-Hint rakamları.
- Harekeler ve birleşik med/hemze işaretleri (U+064B–U+0652, U+0653–U+0655, U+0670) atılır.
- Çevriyazı düzenleme imleri `{ } [ ] * " ● • | < > _` atılır (görüntüde karşılığı yok).
- Tatvil (ـ) atılır.

## Lisans notu

Muharaf ve MAKHZAN **CC BY-NC-SA**: ticari kullanım yok, türev çalışmalar aynı lisansla. Bu verilerle eğitilen bir modeli
ticari üründe kullanmadan önce yalnızca kendi etiketlerinizle (veya OpenITI/sentetik veriyle) yeniden eğitmeniz gerekir.
