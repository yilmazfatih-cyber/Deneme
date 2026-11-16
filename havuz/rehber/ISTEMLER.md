# Hazır istemler

Kopyalayıp `<...>` yerlerini doldurun. İstemler küçük modeller için yazıldı: kısa, kesin, tek görevli; her biri
modelden **kanıt** (denetim çıktısı) ister. Komutlar havuzdaki temellerde gerçekten vardır.

Genel kural: bir istemde **tek görev**. Görev büyükse önce §2 ile plana böldürün, sonra adımları tek tek verin.

---

## 1. Oturum başlangıcı (her yeni sohbette ilk ileti)

```text
Bu depoda <temel klasörü, ör. havuz/uygulama> içinde çalışacaksın.
1. Önce <temel klasörü>/AGENTS.md dosyasını baştan sona oku. Oradaki "Değişmez kurallar"a uy.
2. Yalnız bu klasörün içindeki dosyaları değiştir.
3. Her değişiklikten sonra denetim komutunu çalıştır: <ör. npm run check>. Çıktının son satırlarını bana göster.
4. Testi silme, atlama ya da beklentisini gevşetme. Test kırmızıysa nedenini bul ve kodu düzelt.
5. Emin olmadığın bir komut, paket ya da işlev adı uydurma; dosyada ara (grep) ya da bana sor.
6. Bitince: hangi dosyaları neden değiştirdiğini 3–6 maddede yaz.
Şimdilik yalnız AGENTS.md'yi oku ve bana bu temelin ne yaptığını 5 maddede özetle.
```

## 2. Planlama (kod yazdırmadan)

```text
Görev: <tek cümle, ör. görevlere etiket eklemek istiyorum: her görevin birden çok etiketi olabilsin>.
Kod yazma. Önce:
- AGENTS.md'deki ilgili tarifi bul ve adını yaz.
- İşi 3–6 küçük adıma böl. Her adım için: dokunulacak dosyalar, yapılacak değişiklik, adımın sonunda çalışacak
  denetim komutu.
- Riskli gördüğün yeri ve emin olmadığın noktaları ayrıca yaz.
```

Plan iyiyse: "1. adımı yap, denetimi çalıştır, çıktıyı göster, dur." deyin. Sonra 2. adım…

## 3. Hata düzeltme

```text
Şu komut başarısız oluyor: <komut>
Çıktı:
<çıktının TAMAMINI buraya yapıştırın>

1. Önce hatanın nedenini 2–3 cümleyle açıkla (hangi dosya, hangi satır, neden).
2. Sonra en küçük düzeltmeyi yap. Testi değiştirme; test yanlışsa önce bana gerekçesini yaz ve onay iste.
3. Komutu yeniden çalıştır ve sonucu göster.
Aynı hata ikinci kez çıkarsa dur ve neyi denediğini anlat.
```

## 4. Açıklatma

```text
<dosya yolu> dosyasını oku ve sade Türkçeyle anlat:
- Bu dosya ne işe yarıyor (2 cümle)?
- Kim çağırıyor, o neyi çağırıyor?
- Burada bir şey değiştirmek istesem nelere dikkat etmeliyim?
Kod değiştirme.
```

## 5. İnceleme (model kendi işini denetlesin)

```text
`git diff` çıktısını oku ve şu listeyle denetle; her madde için "tamam" ya da bulduğun sorunu yaz:
1. Görevle ilgisi olmayan bir dosya değişmiş mi?
2. Bir test silinmiş, atlanmış ya da gevşetilmiş mi?
3. Kullanıcıya görünen metin koda gömülmüş mü (sözlük dosyası yerine)?
4. Türkçe büyük/küçük harf için düz toUpperCase/toLowerCase/.upper()/.lower() kullanılmış mı?
5. Dışarıdan gelen veri (form, istek, dosya) doğrulanmadan kullanılmış mı?
6. Yarım bırakılmış iş (TODO, boş işlev) kalmış mı?
Sorun bulursan düzelt ve denetimi yeniden çalıştır.
```

---

## Uygulama (`havuz/uygulama`)

### Yeni bir kayıt türü (varlık) ekle

```text
AGENTS.md'deki "yeni varlık" tarifini izle.
Varlık: <çoğul İngilizce ad, ör. notes>, görünen ad: <ör. Not>.
Alanlar: <ör. başlık (zorunlu, en çok 120 karakter), metin (isteğe bağlı), sabitlendi mi (evet/hayır)>.
1. Üreteci çalıştır: npm run gen -- entity <ad> --etiket <Görünen ad>
2. Üretilen şema dosyasında alanları yukarıdaki gibi düzenle; zorunlu olmayan her alana varsayılan değer ver.
3. Üretilen ekranı görevler örneğine (web/src/features/tasks) bakarak tamamla.
4. npm run check yeşil olsun; çıktıyı göster.
```

### Var olan varlığa alan ekle

```text
<varlık, ör. tasks> varlığına <alan, ör. "etiketler: metin listesi, en çok 10"> alanını ekle.
Kural: yeni alan .default(...) ile varsayılan değer almalı (eski kayıtlar bozulmasın). Alan silme, tür değiştirme.
Formu ve listeyi güncelle; metinleri sözlük dosyasına ekle. npm run check yeşil olsun.
```

### Yeni sayfa

```text
Yeni sayfa: <ad, ör. raporlar>, başlık: <ör. Raporlar>.
npm run gen -- page <ad> --baslik "<Başlık>" ile oluştur; içeriği <ne gösterecek> olsun.
Metinler web/src/i18n/tr.json'a. npm run check yeşil olsun.
```

## Web sitesi (`havuz/site`)

```text
Yeni blog yazısı aç: npm run new -- blog "<Başlık>"
Açılan dosyaya şu konuda <kısa/orta> bir yazı yaz: <konu>. Ön bilgideki alanları şemaya uygun doldur
(açıklama 50–160 karakter). npm run check yeşil olsun.
```

```text
Sitenin adını, açıklamasını, menüsünü ve marka rengini değiştir: yalnız src/site.config.ts dosyasını düzenle.
Yeni değerler: ad <...>, açıklama <...>, renk <#rrggbb>, menü: <...>. npm run check yeşil olsun.
```

## Veri (`havuz/veri`)

```text
<dosya.csv> dosyasını incele ve temizle:
1. python -m verihavuzu profil <dosya.csv> --rapor calisma/profil.md
2. Raporu oku; sorunları (eksik, yinelenen, biçim) 5 maddede özetle.
3. python -m verihavuzu temizle <dosya.csv> --cikti calisma/temiz.csv --degisiklikler calisma/degisiklikler.csv
4. Ne değiştiğini özetle. Kişisel veri varsa söyle; maskelemeyi önermeden yapma.
```

## Tablodan tahmin modeli (`havuz/ml-temel`)

```text
<dosya.csv> dosyasındaki <hedef sütun> sütununu tahmin eden bir model eğit:
python -m ml_temel egit --veri <dosya.csv> --hedef <sütun> --html
(Tarih sütunu varsa --zaman <sütun>, aynı müşterinin birden çok satırı varsa --grup <sütun> ekle.)
Sonra raporu oku ve bana sade Türkçeyle anlat: taban çizgisine göre ne kadar iyi, en önemli 3 sütun hangisi,
sızıntı uyarısı var mı, bu modele güvenmeden önce neye bakmalıyım.
```

## Belgelerine soru sordurma (`havuz/yz`)

```text
<klasör> içindeki belgeleri dizinle ve şu soruyu sor:
python -m yz indeksle <klasör>
python -m yz sor "<soru>"
Yanıtı ve gösterdiği kaynakları bana ver. Belgede yoksa "belgede yok" demesi doğrudur; uydurtma.
```

## Kendi metniyle dil modeli eğitme (`havuz/dil-modeli`)

```text
AGENTS.md'deki "kendi metninle eğit" tarifini izle. Metinler: veri/ham/ klasöründe.
1. Tokenizer: python -m dil_modeli tokenizer-egit --girdi veri/ham/ --cikti calisma/tok.json --sozluk 8192
2. Veri: python -m dil_modeli veri-hazirla --girdi veri/ham/ --tokenizer calisma/tok.json --cikti veri/hazir
3. Yapılandırmayı yapilandirma/cpu-deneme.toml'dan kopyala, yolları düzelt, eğitimi başlat.
Her adımın çıktısını göster. Eğitim sürerken kaybın düşüp düşmediğini yorumla.
```

## Açık modeli ince ayarlama (`havuz/ince-ayar`)

```text
Önce veriyi doğrula: python -m ince_ayar veri dogrula --bicim sohbet --girdi <veri.jsonl>
Hata varsa satır numaralarıyla listele ve düzeltmeyi öner (veriyi kendin uydurma).
Sonra kuru çalıştırma: python -m ince_ayar sohbet egit --hazir colab-t4 --kuru -D veri.egitim=<veri.jsonl>
Tahmini bellek ve süreyi bana açıkla.
```

## Yeni proje

```text
havuz/<temel> temelinden yeni bir proje başlatıyoruz:
python havuz/araclar/yeni_proje.py <temel> ../<proje-adı> --git
Sonra yeni klasörde AGENTS.md'yi oku ve kurulum + denetim komutlarını çalıştır; ikisinin de çıktısını göster.
```
