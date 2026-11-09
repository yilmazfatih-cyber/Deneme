# Demo ERP — satış demosu kılavuzu

Yönetim arayüzündeki **Demo ERP** (`#/demo`) bölümü, tipik bir ERP'nin ekranlarına benzeyen (sol menü, liste/detay,
formlar) ve her ekranda platformun AI modüllerini düğme olarak gösteren gerçek çalışan sayfalardır.

- **Hiçbir şey sahte değildir.** Her düğme gerçek API'yi çağırır. Modül kurulu değilse ya da dil modeli (LLM) yoksa
  sunucunun döndüğü Türkçe hata ve "Mağaza'dan kur" bağlantısı gösterilir.
- **Hazır sorgular AI değildir.** Raporlar ekranındaki önceden yazılmış SQL'ler "Hazır sorgu" etiketi taşır.
- **Veri sentetiktir.** Örnek ERP (`aiplatform/erp/mock_erp.py`) ve bu klasördeki belgeler gerçek bir şirket veya kişi
  içermez; VKN'ler sağlama algoritmasıyla üretilmiştir.

## 1. Kurulum (dizüstü bilgisayar, GPU'suz)

```bash
pip install -e '.[dev]'            # platform
# model gerektirmeyen veya küçük modüller
aiplatform install kvkk-kalkani finans-hesap kayit-eslestirme pdf-ayristirma
# dil modeli (LLM) gerektiren düğmeler için: Qwen3.5-4B (GGUF, llama-server ile)
aiplatform install yazma-asistani
# isteğe bağlı: LLM kurulduktan sonra
aiplatform install ozetleme
aiplatform install dogal-dil-sql    # Qwen2.5-Coder-7B indirir
aiplatform install zaman-serisi     # Chronos-Bolt (küçük), satış tahmini
aiplatform serve --port 8080
```

> `aiplatform install` tek seferde bir modül alır; yukarıdaki döngü bu yüzdendir.
> Fatura Çıkarım (`fatura-cikarim`) ana model (Qwen3.5-35B-A3B) ve OCR bağımlılıklarıyla gelir; dizüstünde uygunluk
> raporuna bakın: `aiplatform check fatura-cikarim`. Kurulamıyorsa Gelen Evrak ekranında "AI ile oku" hata kartı
> gösterir; formu elle doldurup onay akışını yine gösterebilirsiniz (onay kaydında "elle girildi" yazar).

Tarayıcıda `http://localhost:8080/#/demo` → üstteki **Demo verisini kur** düğmesi. Bu düğme (`POST /api/demo/setup`):

1. Örnek ERP bağlantısını kurar (`ornek-erp`; varsa dokunmaz),
2. bu klasördeki 6 belgeyi `$AIP_DATA_DIR/demo/belgeler/` altına kopyalar,
3. gelen evrak kuyruğunu (`$AIP_DATA_DIR/demo/evrak.db`) doldurur,
4. mükerrer kayıt demosu için örnek ERP'ye benzer yazımlı iki cari ekler ("MÜŞTERİ 07 LTD ŞTİ", "TEDARİKÇİ 03 ANONİM ŞİRKETİ"),
5. hangi modüllerin kurulu olduğunu ve LLM sağlığını döner (üst bilgi çubuğunda görünür).

İşlem idempotenttir; tekrar basmak veriyi çoğaltmaz. Demoyu sıfırlamak için platformu durdurup
`$AIP_DATA_DIR/demo/` klasörünü ve `$AIP_DATA_DIR/ornek_erp.db` dosyasını silin, ERP sayfasından "Örnek ERP" bağlantısını kaldırın.

## 2. 15 dakikalık demo senaryosu

| Dk | Ekran | Tıkla | Söyle |
| --- | --- | --- | --- |
| 0–1 | Demo ERP başlığı | Durum rozetlerini göster | "Bu bizim ERP'nize eklenti olarak oturan yerel AI platformu. İnternete veri gitmiyor. Hangi modülün kurulu olduğu burada görünüyor." |
| 1–4 | **Cari Kartlar** | Arama kutusuna "müşteri 07" → **Mükerrer kayıtları bul** | "Aynı firma iki kez açılmış: 'Müşteri 07 Ltd. Şti.' ve 'MÜŞTERİ 07 LTD ŞTİ'. Türkçe kısaltmaları normalize ediyor, model gerektirmiyor, saniyenin altında." Bir satıra tıkla → sağ panel: aylık çubuklar, faturalar. LLM varsa **Bu cariyi özetle**: "Modele giden metin şu — SQL'den üretildi, açıp gösterebilirim." |
| 4–8 | **Gelen Evrak** | `fatura_tedarikci04_2026-11.pdf` → **AI ile oku** | "PDF'in metin katmanını okuyor, yerel model alanları çıkarıyor, toplamları ve VKN'yi kod doğruluyor. Bakın: genel toplam 100 TL fazla basılmış, sarı uyarı." Sonra `fatura_tedarikci01` → oku → alanları göster → **ERP'ye öneri kayıt aç**. "ERP'ye doğrudan yazmıyor; insan onayına düşüyor." Taranmış görüntü (PNG) seçeneği: "Kâğıt fatura taranmışsa OCR yolu." Sözleşmede **Özetle**. |
| 8–9 | **Onay Kutusu** | Önerinin kaynağını, doğrulama rozetini göster → **Onayla** | "Kim önerdi, hangi belgeden, doğrulama sonucu ne — hepsi kayıtlı. Onaylayınca ERP'ye yazılıyor." |
| 9–10 | **Faturalar** | **Onay bekliyor** sekmesi | "İşte ERP'deki yeni kayıt, 'onay_bekliyor' durumunda; muhasebe kendi akışında kesinleştirir." |
| 10–12 | **Raporlar** | Örnek soruya tıkla → **Sor** (dry run açık/kapalı) | "Soru SQL'e çevriliyor; SQL'i görüyorsunuz, tek SELECT, izinli tablolar, salt-okunur kullanıcı." **Tahmin** → "Gelecek 6 ay, alt-üst aralık ve geri test hatası." Hazır sorgulardan biri: "Bunlar AI değil, hazır SQL — etiketli." |
| 12–13 | **Nakit ve Yatırım** | **Hesapla** | "Geri ödeme, NBD, İVO deterministik motorla; model gerekmiyor, sonuç her seferinde aynı. Dil modeli yalnız soruyu anlamak için." |
| 13–15 | **KVKK Göstergesi** | **Maskele** | "TCKN, IBAN, telefon, e-posta modele gitmeden yer tutucuya dönüyor; eşleme şifreli olarak bu makinede kalıyor. Sağdaki sayılar denetim günlüğünden: kaç çağrı, kaç varlık maskelendi." |

Her ekranın sağ üstündeki **Bu ekranda AI nerede?** kutusu, o ekrandaki AI düğmelerini ve neyin AI olmadığını
tek cümleyle anlatır — toplantıda okunabilir.

## 3. LLM yoksa neler çalışır

| Ekran | Düğme | Modül | LLM yokken |
| --- | --- | --- | --- |
| Cari Kartlar | Liste, arama, detay | — (salt-okunur SQL) | Çalışır |
| Cari Kartlar | Mükerrer kayıtları bul | kayit-eslestirme | **Çalışır** (RapidFuzz; modül kurulu olmalı) |
| Cari Kartlar | Bu cariyi özetle | ozetleme | Hata kartı (LLM gerekir) |
| Gelen Evrak | Kuyruk, PDF/PNG önizleme | — | Çalışır |
| Gelen Evrak | AI ile oku | fatura-cikarim | Hata kartı (kurulu değil 409 / hazır değil 503) |
| Gelen Evrak | Özetle (sözleşme) | ozetleme | Hata kartı |
| Gelen Evrak | ERP'ye öneri kayıt aç | — (onay kuyruğu) | **Çalışır** (alanlar elle girilebilir) |
| Faturalar | Liste, filtre | — | Çalışır |
| Raporlar | Doğal dilde sor | dogal-dil-sql | Hata kartı |
| Raporlar | Tahmin | zaman-serisi | **Çalışır** (modül kuruluysa; Chronos yoksa mevsimsel naif taban çizgisi) |
| Raporlar | Hazır sorgular | — (hazır SQL) | Çalışır |
| Nakit ve Yatırım | Hesapla (geri ödeme, NBD, İVO) | finans-hesap | **Çalışır** (kurulu değilse ekrandaki "Kur" düğmesi kurar ve yeniden dener) |
| Nakit ve Yatırım | Doğal dilde sor | finans-hesap | Hata kartı |
| Onay Kutusu | Onayla / Reddet | — | Çalışır (örnek ERP'ye gerçekten yazar) |
| KVKK Göstergesi | Maskele | KVKK Kalkanı (yerleşik kurallar) | **Çalışır** (TCKN/IBAN/telefon/e-posta; ad-soyad için kvkk-kalkani NER modeli gerekir) |
| KVKK Göstergesi | Denetim özeti | — | Çalışır |

## 4. Örnek belgeler

`python -m aiplatform.erp.demo_assets docs/demo/` ile üretilir (reportlab + DejaVuSans; `AIP_DEMO_FONT` ile başka TTF
verilebilir). Tedarikçi unvanları ve VKN'ler örnek ERP'deki cari kartlarıyla birebir aynıdır; kalem açıklamalarında stok
kodu (URN-xxxx) geçer, öneri kayıt bu kodla eşlenir.

| Dosya | Tür | Not |
| --- | --- | --- |
| `fatura_tedarikci01_2026-10.pdf` (+ `_tarama.png`) | Fatura | Tek KDV oranı (%20); PNG kopyası OCR yolu için |
| `fatura_tedarikci02_2026-10.pdf` | Fatura | Karışık KDV (%20, %10), "e-Fatura" şablonu |
| `fatura_tedarikci03_2026-11.pdf` (+ `_tarama.png`) | Fatura | Üç KDV oranı (%20, %1, %10), kompakt şablon |
| `fatura_tedarikci04_2026-11.pdf` | Fatura | **Genel toplam bilerek 100,00 TL fazla** → doğrulama uyarısı |
| `irsaliye_tedarikci01_2026-11.pdf` | İrsaliye | Fiyatsız sevk irsaliyesi |
| `sozlesme_tedarikci05.pdf` | Sözleşme | 2 sayfa: süre, ödeme, ceza, KVKK, fesih maddeleri |

`manifest.json` her belgenin beklenen değerlerini (`beklenen`) içerir; yalnız testler ve doğruluk ölçümü içindir,
arayüzde AI sonucu gibi gösterilmez. `ekran/` klasöründe her ekranın 1280×860 görüntüsü vardır (LLM'siz makinede alındı).

## 5. API özeti (`/api/demo`)

| Yöntem | Yol | Açıklama |
| --- | --- | --- |
| POST | `/setup` | Kurulum (idempotent); bağlantı, evrak sayısı, modül durumları, LLM sağlığı |
| GET | `/durum` | Yan etkisiz durum |
| GET | `/evrak`, `/evrak/{id}` | Kuyruk; ayrıntıda çıkarım ve öneri |
| GET | `/evrak/{id}/file[?goruntu=true]`, `/evrak/{id}/sayfa/{n}.png` | Dosya; sayfa önizlemesi |
| POST | `/evrak/{id}/oku` `{"kaynak": "pdf"\|"goruntu"}` | `fatura-cikarim/extract`; hata aynen iletilir |
| POST | `/evrak/{id}/ozetle` | Sözleşme özeti (`ozetleme`) |
| POST | `/evrak/{id}/oner` `{"fields", "lines"}` | 202 + `approval_id`; onaylanınca `fatura_oneri_olustur` |
| GET | `/cari?q=`, `/cari/{id}` · POST `/cari/{id}/ozetle`, `/cari/mukerrer` | Cari kartlar ve AI düğmeleri |
| GET | `/fatura?durum=tumu\|onay_bekliyor\|odenmemis&cari_id=`, `/stok`, `/satis-aylik` | Salt-okunur listeler |
| GET | `/hazir-sorgular` · POST `/hazir-sorgular/{id}/calistir` | Etiketli hazır SQL |
