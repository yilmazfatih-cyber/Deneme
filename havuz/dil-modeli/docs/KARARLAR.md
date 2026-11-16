# Kararlar

Kısa kayıtlar: ne seçildi, neden, ne elendi.

1. **LLaMA ailesi mimari (RMSNorm, RoPE, SwiGLU, GQA, yanlılıksız).** Verildi. Getirisi: ağırlıklar
   yalnız ad değiştirerek `transformers` `LlamaForCausalLM`'e ve oradan GGUF/Ollama'ya gider. RoPE
   HF'nin "yarıyı döndür" düzeninde yazıldı ki HF aktarımında permütasyon gerekmesin.

2. **Tokenizer saf Python, HF `tokenizer.json` alt kümesiyle.** Verildi. Ön-bölme sınıfları için
   `regex` paketi (`\p{L}`) yerine **kod noktası tablosu** seçildi: (a) bağımlılık yok, (b) Python
   (`unicodedata` 15.1), JS (tarayıcıya göre değişir) ve HF Rust (Unicode 16) arasında ~4.400 yeni
   kod noktasında fark ölçüldü; tablo üçünü aynı yapar. Tablo HF `tokenizers` davranışından üretilir.

3. **BPE eşitlik kuralı HF ile aynı** (en sık; eşitlikte küçük kimlik çifti). Getirisi: saf Python
   ve `--hizli` (Rust) eğitimi bire bir aynı sözlüğü verir; testte kanıtlanır.

4. **Özel belirteç adları ASCII** (`<|kullanici|>`, `<|asistan|>`…). Türkçe harf (`ı`) HF'nin
   ByteLevel çözücüsünde yanlış bayta dönüştüğü için (özel belirteç içeriği bayt eşlemesinden
   geçirilir) ASCII zorunlu kılındı ve doğrulamayla korunuyor. 9 yedek belirteç sözlük boyutunu
   değiştirmeden yeni rol eklemeye yer bırakır.

5. **Kullanıcı metni özel belirteç üretemez** (`allow_special=False` varsayılan). Sohbet ve sunucu
   istemlerinde rol belirteçleri kimlik olarak eklenir. HF tarafında `apply_chat_template` içerikteki
   "<|bitti|>" gibi yazıları belirtece çevirir; içerik böyle yazı içermedikçe iki taraf aynı
   kimlikleri üretir (test). Bu fark README "Sınırlar" bölümünde de yazılı.

6. **Veri: `np.memmap` + `meta.json`; belge bazında doğrulama ayrımı** (`crc32(tohum:sıra)`).
   Getirisi: bellekten büyük derlem, belirlenimci ayrım, aynı belgenin iki tarafa düşmemesi.
   Uzun .txt dosyası 100.000 karakterlik parçalarla akar; parçalar satır sonunda kesilir.

7. **Eğitim rastgeleliği adım numarasından türetilir** (global üreteç durumu kaydetmek yerine).
   Getirisi: sürdürme bire bir; yalnız ağırlık + Adam durumu + birkaç sayı yeterli.

8. **Denetim noktası `torch.save` + `weights_only=True`; model dosyaları `safetensors`.** Pickle
   yükleme kodu çalıştıramaz; dağıtılan model dosyalarında kod yoktur.

9. **Karışık duyarlık yalnız CUDA'da.** CPU'da bf16 autocast hız kazandırmıyor ve sayısal fark
   getiriyor; MPS'de destek değişken. `precision="auto"` CPU/MPS'de fp32 seçer.

10. **Sunucu: FastAPI + tek kilit.** Küçük modelde paralel üretim 2 iş parçacıklı CPU'yu bölüştürür,
    gecikmeyi artırır; sıra ve geri basınç daha öngörülebilir. Akış SSE (OpenAI istemcileri bunu
    bekler). Bilinmeyen istek alanları yok sayılır (istemciler çok alan yollar), anlamı değiştiren
    desteklenmeyen alanlar (`n>1`, `tools`) 400 ile reddedilir. `max_tokens` sunucu sınırına kırpılır.

11. **Tarayıcı biçimi kendi ikili dosyamız** (safetensors/GGUF yerine). JS'te ayrıştırması 20
    satır; 4 bayt hiza ile `Float32Array` görünümü kopyasız açılır; int8 satır ölçeği basit ve
    bu modelde kalite kaybı ölçülemedi. float16 → float32 açma JS'te elle (Node 22'de `Float16Array` yok).

12. **`node --test tarayici/` için `tarayici/package.json` → `main: testler.js`.** Node 22 klasör
    argümanını taramıyor, klasörün giriş dosyasını çalıştırıyor; giriş dosyası bütün testleri içe
    aktarır (kural testi eksik import'u yakalar).

13. **Tarayıcı uçtan uca testi `playwright-core` + `node:test`** (`@playwright/test` yerine): daha az
    bağımlılık, aynı test çalıştırıcı. Statik sunucu testin içinde, boş kapıda. Dış ağ istekleri
    engellenip sayılır (internetsiz çalıştığının kanıtı); axe ile erişilebilirlik taranır.

14. **Örnek model boyutu `bebek` (1,33 M), sözlük 4.096.** Ölçüm (2 iş parçacığı, 16×256 yığın):
    dim128/4 katman 9.650 belirteç/sn, dim192/4 katman 6.780, dim192/6 katman 4.960, dim256/4 katman
    4.740. 15 dakikalık bütçede en çok veriyi en küçük model görüyor; 8.192 sözlük çıkış katmanı
    yüzünden ~%40 yavaş, karakter başına sıkıştırma kazancı (%16) bunu karşılamıyor.

15. **Örnek veri: Türkçe Vikipedi (`wikimedia/wikipedia`, 20231101.tr), sürüm sabit.** Lisans HF
    API'den okundu (cc-by-sa-3.0, gfdl). Dosyanın tamamı (340 MB) yerine Parquet satır grupları
    aralıklı istekle okunur (~25 MB indirme).

16. **Makine dosyalarında İngilizce anahtar, insan kayıtlarında Türkçe anahtar.** `meta.json`,
    `gunluk.jsonl`, `config.json`, `manifest.json` kodla birlikte okunur (İngilizce, değişken
    adlarıyla aynı); `egitim-kaydi.json`, `*.kaynak.json` insan içindir (Türkçe, ASCII).

17. **Komut modülleri tembel yüklenir** (`cli.py` kayıt defterinde modül adı). `egit` sunucu ve HF
    kütüphanelerini yüklemez; kayıt defteri hâlâ tek dosya ve testle denetlenir.

18. **`pydantic` çekirdek bağımlılık.** Sohbet verisi sınırda şemayla doğrulanır (standart §6.6);
    FastAPI zaten ona bağlı.

19. **ONNX ve GGUF isteğe bağlı ekstralar** (`.[onnx]`, `.[gguf]`). Ağırdırlar ve çekirdek kullanım
    için gerekmezler. ONNX eşliği uzun denetimde.

20. **GGUF için llama.cpp'nin kendi dönüştürücüsü + küçük sarmalayıcı** (kendi GGUF yazıcımız yerine).
    Dönüştürücü bilinmeyen tokenizer özetini reddeder; ön-bölmemiz birebir GPT-2 olduğundan
    sarmalayıcı yalnız o durumda `gpt-2` döndürür. llama.cpp derlemek bu ortamda yapılmadı; dosya
    numpy ile llama.cpp'nin hesap düzeninde doğrulanır.

21. **Elenenler:** `sentencepiece` (Türkçe için iyi ama ayrı C++ bağımlılık; bayt düzeyi BPE HF/
    llama.cpp/tarayıcıda daha kolay taşınıyor); `datasets` kütüphanesi (yalnız birkaç Parquet satır
    grubu gerekti, `huggingface_hub` + `pyarrow` yetti); WebGPU (kapsam ve test ortamı yok; düz JS
    bu model boyutunda saniyede ~230 belirteç üretiyor — başsız Chromium, e2e ölçümü).
