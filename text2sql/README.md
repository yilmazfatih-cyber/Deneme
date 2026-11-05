# text2sql — Türkçe sorudan SQL, tamamen kendi bilgisayarınızda

`text2sql`, kendi veritabanınıza Türkçe (ya da İngilizce) soru sormanızı sağlayan küçük bir komut
satırı aracıdır. Soruyu, bilgisayarınızda çalışan **~1,5 milyar parametreli** açık bir modele
(varsayılan: Qwen2.5-Coder-1.5B-Instruct, Apache-2.0) verir; model SQL yazar, araç bu SQL'i
**salt okunur** çalıştırır ve sonucu tablo olarak gösterir.

````
"İstanbul'daki müşteriler kimler?"
        │
        ▼
şema çıkarma (tablolar, sütunlar, anahtarlar, tablo başına 2 örnek satır)
        │
        ▼
istem: talimat + lehçe (SQLite / PostgreSQL / MySQL) + CREATE TABLE ... + soru
        │
        ▼
yerel model (Ollama ya da llama.cpp, GPU varsa GPU'da)  ──►  ```sql SELECT ... ```
        │
        ▼
SQL ayıklama → yazma sorgusu mu? (INSERT/UPDATE/DELETE/DROP ... reddedilir)
        │
        ▼
salt okunur çalıştırma (en çok 200 satır) ── hata verirse: hata mesajı modele bir kez geri verilir
        │
        ▼
sonuç tablosu (ya da --json)
````

Gizlilik: Her şey yerelde çalışır. Soru, şema ve veriler bilgisayarınızdan çıkmaz; telemetri,
hesap ya da bulut çağrısı yoktur. İnternet yalnızca kurulumda (Python paketi ve model indirme) gerekir.

## Donanım

| Bellek                 | Önerilen model                                                                         | Ağırlık        | Not                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| GPU yok (yalnızca CPU) | `qwen2.5-coder:1.5b` (Q4_K_M, varsayılan); daha hızlısı `qwen2.5-coder:0.5b`           | ≈ 1 GB         | 8 GB RAM yeter; soru başına birkaç saniye                               |
| 4 GB VRAM              | `qwen2.5-coder:1.5b` Q4_K_M ya da `qwen2.5-coder:1.5b-instruct-q8_0`; profil `slm-sql` | 1–1,6 GB       | fp16 (3,1 GB) sınırda, önerilmez                                        |
| 6 GB VRAM              | `qwen2.5-coder:1.5b-instruct-q8_0` ya da `-fp16`                                       | 1,6–3,1 GB     | uzun şemalar için `num_ctx` 8192                                        |
| 8 GB VRAM              | `qwen2.5-coder:1.5b-instruct-fp16` ya da profil `buyuk` (7B Q4_K_M)                    | 3,1 / ≈ 4,7 GB | 7B: üretici skorlarına göre en yüksek SQL kalitesi; bu araçla denenmedi |
| 12 GB ve üstü          | profil `buyuk`, Arctic-Text2SQL-R1-7B Q8_0                                             | ≈ 8 GB         | büyük şemalar rahat sığar                                               |

Çalışırken ağırlığa ek olarak ≈ 0,3–1 GB bağlam belleği gerekir. Değerler tahmindir; gerçek kullanımı
`ollama ps` gösterir. `text2sql bilgi` ekran kartınızı (`nvidia-smi`) okuyup bu tablodan öneri yazar.
`q8_0` / `fp16` etiket adları Ollama kütüphanesindeki adlandırmaya göre yazıldı, bu depoda denenmedi.

Uyarı: Qwen2.5-Coder ailesinin **3B** sürümü Apache-2.0 değil, "Qwen Research" lisanslıdır. Büyütmek
isterseniz 3B yerine 7B'ye (Apache-2.0) bakın. Adayların tamamı, skorlar ve kaynaklar:
[`docs/MODEL_SECIMI.md`](docs/MODEL_SECIMI.md).

## Model profilleri

| Profil              | Model                                                   | Lisans                                                  | Ne zaman                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qwen` (varsayılan) | Qwen2.5-Coder-1.5B-Instruct · `qwen2.5-coder:1.5b`      | Apache-2.0                                              | Türkçe sorular için daha güvenli, kurulumu en kolay                                                                                                                                                                                                                                                                          |
| `slm-sql`           | SLM-SQL-1.5B · `hf.co/frizynn/SLM-SQL-1.5B-GGUF:Q4_K_M` | kart tutarsız (apache-2.0 yalnızca bir PR revizyonunda) | SQL için ince ayarlı. Üretici BIRD dev %67 bildiriyor, ama bu skor çok örnekli, düzeltmeli çıkarımla alındı; text2sql tek çağrı yapar ve modelin kendi istem şablonunu değil kendi istemini kullanır, bu yüzden skor daha düşük olur (doğrulanmadı). İngilizce eğitimli, **Türkçe sorularda doğrulanmadı**. Topluluk GGUF'u. |
| `prem`              | prem-1B-SQL (deepseek-coder-1.3b tabanlı)               | MIT (kartta; meta veride apache-2.0 da geçiyor)         | Alternatif; 2024 tarihli. GGUF'u elle indirilir (aşağıda).                                                                                                                                                                                                                                                                   |
| `buyuk`             | Snowflake Arctic-Text2SQL-R1-7B Q4_K_M                  | Apache-2.0                                              | 8 GB+ VRAM. Resmî Ollama etiketi doğrulanamadı; bir topluluk GGUF'u gerekir. **Bu araçla denenmedi** (akıl yürütme çıktısı için yanıt sınırı 2048).                                                                                                                                                                          |

Hangisinin sizin sorularınızda daha iyi olduğunu `text2sql degerlendir` ile kendi GPU'nuzda ölçün (aşağıda).

## Kurulum (3 adım)

Gerekenler: Python 3.10 ya da üstü ve [Ollama](https://ollama.com/download) (betik yoksa kurmayı önerir).

Disk (tahmin): Ollama'nın kendisi ≈ 1–4 GB (Windows ve Linux'ta GPU kitaplıkları dahil), Python ortamı
≈ 50 MB, üstüne model: `qwen` ve `slm-sql` ≈ 1 GB; `prem` ≈ 0,8 GB'lık GGUF + Ollama'daki kopyası ≈ 1,6 GB;
`buyuk` bir `hf.co/...` etiketiyle ≈ 4,7 GB, yerel GGUF dosyasından kurulursa dosya + Ollama kopyası ≈ 9,5 GB.

### Windows (PowerShell)

```powershell
git clone <bu-depo> ; cd <depo>\text2sql
powershell -ExecutionPolicy Bypass -File .\kur.ps1
.\.venv\Scripts\text2sql.exe sor --db ornek\dukkan.sqlite "Kaç müşteri var?"
```

3. adımda programı etkinleştirmeden, doğrudan `.venv\Scripts\text2sql.exe` ile çağırıyoruz; bunun için
   hiçbir ayar gerekmez. Kısaca `text2sql` yazmak isterseniz her yeni pencerede ortamı etkinleştirin:

- cmd'de: `.venv\Scripts\activate.bat`
- PowerShell'de: `.\.venv\Scripts\Activate.ps1`. Windows'ta betik çalıştırma varsayılan olarak kapalıdır;
  "running scripts is disabled" hatası alırsanız bir kez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
  çalıştırın (yalnızca sizin kullanıcınız için yerel betiklere izin verir).

Ollama yoksa betik `winget install Ollama.Ollama` komutunu önerir ve onayınızla çalıştırır. NVIDIA
sürücüsü güncelse Ollama GPU'yu kendisi kullanır; CUDA ayrıca kurulmaz.

### Linux

```bash
git clone <bu-depo> && cd <depo>/text2sql
./kur.sh
source .venv/bin/activate
```

Ollama yoksa betik resmi kurulum betiğini (`curl -fsSL https://ollama.com/install.sh | sh`)
çalıştırmadan önce sorar. Debian/Ubuntu'da `python3-venv` paketi gerekir (`sudo apt install python3-venv`);
yoksa betik yarım kalan `.venv`'i siler ve bunu söyler. `source` her yeni terminalde tekrarlanır.

### macOS

```bash
git clone <bu-depo> && cd <depo>/text2sql
./kur.sh                     # Ollama yoksa: https://ollama.com/download ya da brew install ollama
source .venv/bin/activate
```

Apple Silicon'da Ollama Metal'i kendisi kullanır.

Kurulum betiği şunları yapar (tekrar çalıştırmak güvenlidir, yapılmış adımlar atlanır):
Python sürümünü denetler → `.venv` oluşturup `pip install -e .` yapar → örnek veritabanını hazırlar →
Ollama'yı denetler, çalışmıyorsa başlatır → taban modeli indirir (`ollama pull`) → `FROM` satırı
profile göre yazılmış `.Modelfile.olusan` dosyasıyla `ollama create <profilin model adı>` (`text2sql`,
`text2sql-slm` …; model aynı Modelfile ile zaten varsa atlanır) → `text2sql bilgi` ve örnek bir soruyla dener.

Seçenekler: `--profil slm-sql` (Windows: `-Profil slm-sql`, ya da `MODEL_PROFIL` ortam değişkeni),
`--ollamasiz` (yalnızca Python kısmı), `--evet` (soruları onaylı say). Çıkış kodları betiğin başında yazılıdır.

## Kullanım

```bash
text2sql sor --db ornek/dukkan.sqlite "Kaç müşteri var?"
text2sql sor --db ornek/dukkan.sqlite "En çok sipariş veren müşteri kim?"
text2sql sor --db ornek/dukkan.sqlite --sadece-sql "Mart 2025'te kaç sipariş verildi?"
text2sql sor --db ornek/dukkan.sqlite --json "Stokta kalmayan ürünler hangileri?"
text2sql sohbet --db ornek/dukkan.sqlite          # etkileşimli; önceki 3 soru-SQL çifti istemde kalır
text2sql sema --db ornek/dukkan.sqlite            # modele giden şemayı göster
text2sql bilgi                                    # ayarlar, GPU, Ollama ve model durumu
text2sql ornek-db --zorla                         # örnek veritabanını yeniden oluştur
```

Örnek çıktı:

```
SQL:
  SELECT ad, fiyat FROM urunler ORDER BY fiyat DESC LIMIT 3;

ad              | fiyat
----------------+------
Yün battaniye   |  1890
Nevresim takımı |  1450
Döküm tava      |   890

(3 satır)
```

`sor` ve `sohbet` seçenekleri:

| Seçenek                            | Varsayılan              | Ne yapar                                                                                                                                |
| ---------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `--db`                             | `TEXT2SQL_DB`           | SQLite dosyası ya da bağlantı adresi                                                                                                    |
| `--lehce`                          | adresten                | `sqlite`, `postgresql`, `mysql`                                                                                                         |
| `--ornek-satir N`                  | 2                       | istemde tablo başına N örnek satır. Model, "İstanbul" / "iptal" gibi değerlerin veride nasıl yazıldığını görür; büyük şemalarda 0 verin |
| `--tablolar a,b`                   | hepsi                   | yalnızca bu tabloları isteme koy (büyük şemalar için)                                                                                   |
| `--sadece-sql`                     | kapalı                  | SQL'i yaz, çalıştırma                                                                                                                   |
| `--json`                           | kapalı                  | sonucu JSON yaz (`soru`, `sql`, `sutunlar`, `satirlar`, `kesildi`)                                                                      |
| `--limit N`                        | 200                     | en çok N satır göster                                                                                                                   |
| `--deneme N`                       | 1                       | sorgu hata verirse hatayı modele verip N kez yeniden dene                                                                               |
| `--yaz`                            | kapalı                  | yazma sorgularına izin ver (aşağıya bakın)                                                                                              |
| `--ornekler DOSYA`                 | yok                     | kendi örnek soru/SQL çiftleriniz; `ornek/sorular.md` biçiminde. Küçük modelde doğruluğu belirgin artırır                                |
| `--model`, `--profil`, `--backend` | profil `qwen`, `ollama` | model seçimi (aşağıda)                                                                                                                  |

Çıkış kodları: 0 başarı · 1 model ya da sorgu hatası · 2 kullanım/ayar hatası · 3 yazma sorgusu reddedildi.

### Güvenlik: salt okunur çalıştırma

`--yaz` verilmedikçe: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `ATTACH`, `VACUUM`, `REINDEX`,
okuma dışı `PRAGMA`'lar, `SELECT ... INTO` ve içinde yazma geçen `WITH` sorguları çalıştırılmadan reddedilir;
reddedilen SQL ekrana yazılır. `REPLACE(ad, 'a', 'b')` gibi işlevler okuma sayılır. Ayrıca SQLite dosyası
salt okunur açılır (`file:...?mode=ro`); PostgreSQL'de bağlantı oturum düzeyinde salt okunurdur
(`default_transaction_read_only=on`), MySQL'de oturum `SET SESSION TRANSACTION READ ONLY` ile açılır.
Modelin yanıtından yalnızca ilk ifade alınır; çalıştırılacak sorguda yine de birden çok ifade görülürse
(`--yaz` verilse bile) hiç çalıştırılmaz. `--sadece-sql` ile yazma sorgusu yalnızca gösterilir, uyarı verilir. Yine de kendi
veritabanınızda **yalnızca okuma yetkisi olan bir kullanıcı** kullanmanız en sağlam yoldur.

## Kendi veritabanınız

```bash
# SQLite
text2sql sor --db C:\veriler\muhasebe.db "Bu ay kaç fatura kesildi?"
text2sql sor --db sqlite:///veriler/muhasebe.db "..."

# PostgreSQL ve MySQL / MariaDB için önce ek paket:
pip install -e ".[db]"            # SQLAlchemy + psycopg 3 + PyMySQL
text2sql sor --db postgresql://okuyucu:parola@localhost:5432/dukkan "Geçen ay en çok satan ürün?"
text2sql sor --db mysql://okuyucu:parola@localhost:3306/dukkan "Geçen ay en çok satan ürün?"
```

Parolanın komut geçmişine yazılmaması için adresi ortam değişkenine koyun:
`export TEXT2SQL_DB=postgresql://...` (PowerShell: `$env:TEXT2SQL_DB = "postgresql://..."`), sonra `--db` vermeyin.
PostgreSQL'de varsayılan şema (`public`) okunur; başka bir şema için adrese
`?options=-csearch_path%3Dsema_adi` ekleyin.

İpuçları:

- Küçük model şemadaki adları kullanır. Sütun adları anlamlıysa (`siparis_tarihi`, `durum`) sonuç iyileşir.
  SQLite'ta `CREATE TABLE` içindeki `-- açıklama` yorumları da isteme girer
  (ör. `durum TEXT -- 'kargoda' | 'iptal'`).
- Çok tablolu şemalarda `--tablolar` ile ilgili tabloları seçin; istem 4096 belirteci aşarsa model
  şemanın başını unutur (araç bunu uyarır). Ya da `num_ctx` değerini 8192 yapın (aşağıda).
- Sık sorduğunuz soru tiplerini `sorular.md` biçiminde bir dosyaya yazıp `--ornekler` ile verin.

## Model değiştirme

```bash
text2sql sor --profil slm-sql --db ornek/dukkan.sqlite "Kaç müşteri var?"   # ya da --model slm-sql
export TEXT2SQL_PROFIL=slm-sql                                               # bu terminal için (PowerShell: $env:TEXT2SQL_PROFIL = "slm-sql")
```

Seçimin her terminalde geçerli olması için çalıştığınız klasördeki `text2sql.toml` dosyasına `profil = "slm-sql"` yazın.
Bir profili ilk kez kullanmadan önce kurun: `./kur.sh --profil slm-sql` (Windows: `.\kur.ps1 -Profil slm-sql`).
Betik o profilin modelini indirir ve Ollama'da `text2sql-slm` adıyla oluşturur.

Aynı modelin başka bir nicemlemesi (ör. 6 GB kart için Q8_0):

```bash
TEXT2SQL_BASE_MODEL=qwen2.5-coder:1.5b-instruct-q8_0 ./kur.sh
# PowerShell: $env:TEXT2SQL_BASE_MODEL = "qwen2.5-coder:1.5b-instruct-q8_0"; .\kur.ps1
```

**prem**: GGUF dosyasını `QuantFactory/prem-1B-SQL-GGUF` ya da `tensorblock/prem-1B-SQL-GGUF`
deposundan indirin (dosya adlarını deponun dosya listesinden denetleyin; bu depodan doğrulanamadı),
`models/prem-1B-SQL.Q4_K_M.gguf` olarak kaydedin, sonra `./kur.sh --profil prem`. Şablon `Modelfile.prem` içindedir.

**slm-sql**: Model kartı kendi istem şablonunu tanımlar; text2sql ise tüm modellerde kendi istemini kullanır.
Üreticinin %67'lik skoru çok örnekli, düzeltmeli bir çıkarımla alınmıştır; tek çağrılı bu araçta daha düşük
bir sonuç bekleyin. Karar vermeden önce `degerlendir` ile `qwen` profiliyle kıyaslayın.

**buyuk**: Bu profil bu araçla hiç denenmedi. Arctic-Text2SQL-R1 R1 tarzı eğitilmiş bir model; SQL'den önce
`<think>…</think>` akıl yürütmesi yazabilir. text2sql bu bölümü atar, yanıtta `<think>`/`<answer>` etiketi varsa birden çok SQL bloğundan sonuncusunu (yoksa her zaman ilkini)
alır ve bu profilde yanıt sınırını 2048 belirteç yapar. İlk denemede `--json` ile çıktıya bakın.
Arctic-Text2SQL-R1-7B için resmî Ollama etiketi doğrulanamadı. Hugging Face'te bir topluluk GGUF'u bulun ve
ya `models/Arctic-Text2SQL-R1-7B-Q4_K_M.gguf` olarak kaydedin ya da `hf.co/...` etiketini verin:
`TEXT2SQL_BASE_MODEL=hf.co/<kullanici>/<depo>:Q4_K_M ./kur.sh --profil buyuk`.

**Ollama'sız (llama.cpp)**: herhangi bir GGUF dosyasıyla doğrudan çalışır.

```bash
pip install -e ".[gguf]"                                   # yalnızca CPU
CMAKE_ARGS="-DGGML_CUDA=on" pip install -e ".[gguf]"       # NVIDIA GPU (CUDA Toolkit gerekir)
# PowerShell: $env:CMAKE_ARGS = "-DGGML_CUDA=on"; pip install -e ".[gguf]"
text2sql sor --model models/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf --db ornek/dukkan.sqlite "Kaç müşteri var?"
```

Varsayılan modelin resmi GGUF'u: `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF`, dosya
`qwen2.5-coder-1.5b-instruct-q4_k_m.gguf` (≈ 986 MB).

### İki modeli kıyaslama

```bash
text2sql degerlendir --db ornek/dukkan.sqlite                    # varsayılan profil
text2sql degerlendir --db ornek/dukkan.sqlite --profil slm-sql
text2sql degerlendir --db benim.db --sorular benim_sorularim.md --json rapor.json
```

Her sorunun modelin ürettiği SQL'i ile beklenen SQL'i çalıştırılır, sonuçlar (satır sırası ve sütun
sırası gözetmeden) karşılaştırılır; soru başına doğru/yanlış ve toplam puan yazılır. Örnek dosyadaki
10 soru başlangıç için yeterlidir; karar vermeden önce kendi verinizden 20–30 soru yazmanız önerilir.

### Ayar dosyası

Komutu çalıştırdığınız klasöre `text2sql.toml` koyabilirsiniz (örnek: `text2sql.toml.ornek`).
Öncelik: varsayılanlar < profil < `text2sql.toml` < ortam değişkenleri < komut satırı.

| Ortam değişkeni       | Ne yapar                                            |
| --------------------- | --------------------------------------------------- |
| `TEXT2SQL_PROFIL`     | `qwen`, `slm-sql`, `prem`, `buyuk`                  |
| `TEXT2SQL_MODEL`      | Ollama'daki model adı (varsayılan `text2sql`)       |
| `TEXT2SQL_BASE_MODEL` | kurulumun indireceği taban etiket                   |
| `TEXT2SQL_BACKEND`    | `ollama`, `llamacpp`, `sahte` (yalnızca test)       |
| `TEXT2SQL_GGUF`       | llama.cpp için GGUF yolu                            |
| `TEXT2SQL_NUM_CTX`    | bağlam penceresi (varsayılan 4096)                  |
| `TEXT2SQL_TIMEOUT`    | model yanıtı için en uzun bekleme, saniye (180)     |
| `TEXT2SQL_DB`         | `--db` verilmezse kullanılacak veritabanı           |
| `OLLAMA_HOST`         | Ollama adresi (varsayılan `http://localhost:11434`) |

`num_ctx` değerini Ollama modeli için kalıcı değiştirmek isterseniz `Modelfile` içindeki satırı da
değiştirip kurulumu yeniden çalıştırın.

## Sorun giderme

**"Ollama sunucusuna ulaşılamadı"** — Ollama kurulu mu? `ollama --version`. Kuruluysa sunucuyu başlatın:
Windows'ta Başlat menüsünden Ollama'yı açın; Linux/macOS'ta `ollama serve`. Başka bir makinedeyse
`OLLAMA_HOST=http://adres:11434`. İndirme: https://ollama.com/download

**"Ollama'da model bulunamadı"** — kullandığınız profille kurulum betiğini yeniden çalıştırın:
`./kur.sh --profil <profil>` (Windows: `.\kur.ps1 -Profil <profil>`). Elle kurmak için `FROM` satırını
profile göre yazdırın: `python -m text2sql.config --profil <profil> modelfile_text > .Modelfile.olusan`, sonra
`ollama create <model adı> -f .Modelfile.olusan`. `Modelfile`'ı doğrudan kullanmak yalnızca `qwen` profili için doğrudur.

**GPU kullanılmıyor** — `ollama ps` çıktısındaki `PROCESSOR` sütunu `100% GPU` göstermeli.
NVIDIA sürücüsünü güncelleyin (`nvidia-smi` çalışmalı). Model + bağlam VRAM'e sığmazsa Ollama bir
kısmını CPU'ya kaydırır: daha küçük nicemleme seçin ya da `num_ctx` değerini düşürün. Dizüstünde
Windows'un uygulamayı tümleşik GPU'ya atamadığını denetleyin (Ayarlar → Ekran → Grafik).

**Çok yavaş** — ilk soru modeli belleğe yüklediği için yavaştır; sonrakiler hızlanır. Hâlâ yavaşsa:
GPU kullanılıyor mu (yukarıda), `--ornek-satir 0` ve `--tablolar` ile istemi kısaltın, CPU'daysanız
`TEXT2SQL_BASE_MODEL=qwen2.5-coder:0.5b ./kur.sh` ile daha küçük modeli deneyin. Zaman aşımı için
`TEXT2SQL_TIMEOUT=600`.

**SQL yanlış** — önce `text2sql sema --db ...` ile modelin gördüğü şemaya bakın. Sonra sırayla:
soruyu tablo/sütun adlarına yakın yazın ("siparişler tablosunda durumu iptal olanlar"), `--ornek-satir 3`
deneyin, `--tablolar` ile gereksiz tabloları çıkarın, `--ornekler` ile benzer soruların doğru SQL'ini
verin, `--profil slm-sql` ya da (8 GB+ VRAM) `--profil buyuk` deneyin (ikisi de Türkçe sorularda ölçülmedi;
önce `degerlendir` ile kıyaslayın). 1,5B modeller tek tablolu ve
basit birleşimli sorularda iyidir; çok adımlı analitik sorularda yanılabilir. Sonucu her zaman SQL'e
bakarak doğrulayın.

**"Bu sorgu veriyi değiştirebilir"** — model bir yazma sorgusu üretti ve güvenlik için çalıştırılmadı.
Bilerek veri değiştirmek istiyorsanız `--yaz` ekleyin (önce yedek alın).

**Windows'ta Türkçe karakterler bozuk** — Windows Terminal ya da PowerShell 7 kullanın; eski konsolda
`chcp 65001` çalıştırın.

**PowerShell betiği açılmıyor ("running scripts is disabled")** — kurulum betiğini
`powershell -ExecutionPolicy Bypass -File .\kur.ps1` ile başlatın; sistem ayarı değişmez. Aynı hata
`.\.venv\Scripts\Activate.ps1` için çıkarsa: ya programı doğrudan çağırın (`.\.venv\Scripts\text2sql.exe ...`),
ya cmd'de `.venv\Scripts\activate.bat` kullanın, ya da bir kez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Benzer araçlar

Bu iş için bir çerçeveye gerek yok; buradaki ince CLI (şema → istem → yerel model → salt okunur
çalıştırma) yeterli. Daha fazlasını isteyenler için: [`premsql`](https://github.com/premAI-io/premsql)
(MIT, Ollama desteği var, 2024'ten beri durgun) ve [`sqlchat`](https://github.com/sqlchat/sqlchat)
(MIT, sohbet arayüzü; Ollama'yı OpenAI uyumlu uç nokta olarak kullanır). `vanna` Mart 2026'da arşivlendi.

## Sınırlar

- Model doğruluğu üretici skorlarına dayanır; Türkçe sorularda hiçbir model bu depoda ölçülmedi.
  `text2sql degerlendir` bunun için var.
- Okuma denetimi bir SQL ayrıştırıcısı değildir; yan etkili işlevleri (ör. PostgreSQL'de
  `pg_terminate_backend`) tanımaz. Bu yüzden salt okunur bağlantı ve okuma yetkili kullanıcı önerilir.
- PostgreSQL ve MySQL yolu SQLAlchemy ile yazıldı ve SQLite adresiyle sınandı; gerçek bir PostgreSQL /
  MySQL sunucusunda bu depoda denenmedi.
- Satır sınırı sorguyu değiştirmez; çok büyük sonuçlar yine veritabanında hesaplanır. Sorgu süre sınırı
  30 saniyedir.

## Testler

```bash
pip install -e ".[dev]"
python -m pytest tests -q      # ağ ve model gerekmez; sahte arka uç kullanılır
ruff check .
```

## Dizin yapısı

```
text2sql/
├── README.md
├── kur.sh, kur.ps1          kurulum betikleri
├── Modelfile                Ollama modeli (qwen, slm-sql, buyuk profilleri)
├── Modelfile.prem           prem-1B-SQL için şablonlu Modelfile
├── text2sql.toml.ornek      ayar dosyası örneği
├── pyproject.toml
├── docs/MODEL_SECIMI.md     model araştırması ve kaynaklar
├── ornek/
│   ├── sema.sql, olustur.py örnek dükkan veritabanı (sehirler, musteriler, urunler, siparisler, siparis_kalemleri)
│   ├── dukkan.sqlite        üretilmiş hali (≈ 32 KB)
│   └── sorular.md           10 örnek soru ve beklenen SQL
├── text2sql/
│   ├── cli.py               komutlar: sor, sohbet, sema, bilgi, ornek-db, degerlendir
│   ├── config.py            ayarlar ve model profilleri
│   ├── backends.py          Ollama (HTTP), llama.cpp, sahte arka uç
│   ├── schema.py            şema çıkarma ve DDL
│   ├── prompt.py            istem
│   ├── sqlutil.py           SQL ayıklama, ifade bölme, okuma denetimi
│   ├── run.py               güvenli çalıştırma
│   ├── pipeline.py          soru → SQL → sonuç, hata geri beslemesi
│   ├── evaluate.py          degerlendir
│   ├── examples.py          sorular.md ayrıştırıcı
│   └── hardware.py          GPU algılama ve öneri
└── tests/
```
