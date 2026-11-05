# text2sql kiti — bağımsız inceleme (denetçi)

Tarih: 2026-11-05 · İnceleyen: denetçi · Kapsam: `text2sql/` altındaki commit edilmemiş tüm dosyalar ve kök `README.md`'deki tek satır.

**Özet**

1. **Testler:** `python -m pytest text2sql/tests -q` → **79 geçti, 1 atlandı.** Atlanan test SQLAlchemy ister. `[db]` ek paketi kurulunca **80/80** geçiyor.
2. **Lint:** `ruff check text2sql` → **All checks passed!** `prettier --check` **çalıştırılamadı**: kökte `node_modules` yok, `npx` ile indirmeye izin verilmedi. Elle ölçünce `MODEL_SECIMI.md` tablolarının hizasız olduğu görüldü (bkz. Ö6).
3. **Bulgu sayısı:** Engel **1** · Önemli **8** · Öneri **22**.
4. **Genel karar:** **düzeltme gerekir.** Python tarafı sağlam: hatalar hızlı ve Türkçe, `mode=ro` URI'si doğru. Ama Windows kurulumu 3. adımda takılıyor, PostgreSQL'de salt okunur korumasının bir açığı var.
5. Engel ve Önemli bulgular kapanınca kit yeniden incelenmeli. Öneriler `docs/ROADMAP.md` birikim listesine yazılmalı.

Ne denendi: CLI sahte arka uçla çalıştırıldı (`bilgi`, `sor`, `--sadece-sql`, `--json`, `sema`, `degerlendir`, `sohbet`). Yazma sorgusu üreten sahte yanıtlar, olmayan dosya, `[db]` paketi kurulu değilken ve kuruluyken PostgreSQL/MySQL adresi, kapalı Ollama, yanıt vermeyen Ollama (3 sn zaman aşımı) ve bağlantıyı kapatan sahte sunucu da denendi. Ayrıca Türkçe karakter, boşluk, `#`, `?` ve `%20` içeren bir SQLite yolu denendi. `bash -n kur.sh` hatasız. PowerShell olmadığı için `kur.ps1` yalnızca satır satır okundu.

---

## Engel

### E1 — Windows'ta kurulumun 3. adımı varsayılan ayarlarda çalışmıyor

- **Önem:** Engel
- **Yer:** `README.md:72` (`.\.venv\Scripts\Activate.ps1`), `kur.ps1:173`, `README.md:289-290`
- **Sorun:** Windows 10/11 istemcilerinde varsayılan yürütme ilkesi `Restricted`. `kur.ps1`, `-ExecutionPolicy Bypass` ile yalnızca kendi süreci için açılıyor. Kullanıcı sonra kendi PowerShell penceresinde `.\.venv\Scripts\Activate.ps1` yazınca "running scripts is disabled on this system" hatası alır. "Sorun giderme" bölümü yalnızca `kur.ps1` için Bypass öneriyor, etkinleştirme betiğini anmıyor. Hedef kullanıcının belgelenmiş 3 adımlık yolu son adımda kırılıyor; `text2sql` komutu bulunamıyor.
- **Somut düzeltme:** README'de ve `kur.ps1` son mesajında 3. adımı şöyle verin: önce bir kez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, sonra `.\.venv\Scripts\Activate.ps1`. Bunu istemeyenler için iki seçenek de ekleyin: cmd'de `.venv\Scripts\activate.bat`, ya da etkinleştirmeden doğrudan `.\.venv\Scripts\text2sql.exe sor ...`. "Sorun giderme" maddesini de buna göre genişletin.

---

## Önemli

### Ö1 — PostgreSQL'de salt okunur koruması aşılabiliyor (ters bölü + çoklu ifade + COMMIT)

- **Önem:** Önemli
- **Yer:** `text2sql/sqlutil.py:60-62` (her tek tırnaklı dizgide `\'` kaçışı), `text2sql/run.py:302-311`, `README.md:155-158`
- **Sorun:** Sözcük çözümleyici `\'` dizisini her lehçede kaçış sayıyor. PostgreSQL'de ise `standard_conforming_strings=on` varsayılan, yani `'\'` kendi başına tam bir dizgi. Örnek: `SELECT '\'; COMMIT; DROP TABLE musteriler; --'`. Çözümleyici bunu tek ifade ve tek kelime (`SELECT`) olarak görür ve "okuma" der. psycopg 3, parametresiz `execute()` çağrısında basit sorgu protokolünü kullanıyor (`psycopg/_cursor_base.py`: "it can execute more than one statement in a single query"). SQLAlchemy `exec_driver_sql` de parametre yoksa `cursor.execute(statement)` çağırıyor. Sonuçta `COMMIT`, `READ ONLY` işlemini bitirir; `DROP` yeni, yazılabilir örtük işlemde çalışır ve kalıcı olur. Sondaki `rollback()` hiçbir şeyi geri almaz. SQLite'ta `sqlite3` tek ifade sınırı bunu durduruyor ("You can only execute one statement at a time", denendi). PyMySQL'de `MULTI_STATEMENTS` kapalı. Ama README'deki "yalnızca ilki çalışır" ve "işlem READ ONLY" sözleri PostgreSQL için doğru değil. Kötü niyet gerekmez: örnek satırlardaki veri ya da soru modeli böyle bir çıktıya itebilir.
- **Somut düzeltme:** (1) `tokenize` lehçeyi bilsin: `\` kaçışı yalnızca MySQL'de ve PostgreSQL'in `E'...'` dizgilerinde geçerli olsun. (2) `run.execute` içinde `len(split_statements(sql)) != 1` ise çalıştırmadan reddedin; bu bir savunma katmanı daha ekler. (3) PostgreSQL'de koruma oturum düzeyinde olsun: `create_engine(..., connect_args={"options": "-c default_transaction_read_only=on"})` ya da `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`. Böylece `COMMIT`'ten sonra da geçerli kalır. (4) Bu örnek için bir test ekleyin.

### Ö2 — `REPLACE()` dizgi işlevi yazma sayılıyor; hata mesajı yanlış türü gösteriyor

- **Önem:** Önemli
- **Yer:** `text2sql/sqlutil.py:24-27` (`WRITE_WORDS` içinde `REPLACE`), `:141`, `:146`
- **Sorun:** `SELECT REPLACE(ad, 'İ', 'I') AS ad FROM sehirler` çıkış kodu 3 ile reddediliyor (denendi). `REPLACE()` SQLite, PostgreSQL ve MySQL'de sık kullanılan bir okuma işlevi; Türkçe metin temizlemede de çok geçer. Ret yeniden denenmediği için model hatasını düzeltemiyor. Mesaj da "Bu sorgu veriyi değiştirebilir (SELECT)" diyor. `WITH ... DELETE` için de "(WITH)" yazıyor. Kullanıcı neyin sakıncalı bulunduğunu anlayamıyor.
- **Somut düzeltme:** Bir okuma ifadesinin içinde `REPLACE` (MySQL'de `INSERT` de) kelimesinden hemen sonra `(` geliyorsa onu işlev sayıp yazma listesinden çıkarın. `REPLACE INTO` ifade başı olarak zaten yakalanıyor. `ensure_read_only` mesajında ilk kelimeyi değil, eşleşen yazma kelimesini gösterin; ör. "(DELETE, WITH içinde)". `test_sqlutil.py`'ye `REPLACE(...)` ile olumlu bir örnek ekleyin.

### Ö3 — Tek satırlık kod çiti ters tırnaklarla birlikte SQL'e giriyor

- **Önem:** Önemli
- **Yer:** `text2sql/sqlutil.py:36` (`_FENCE_RE` dil adından sonra satır sonu istiyor), `:172-176`
- **Sorun:** Model ` ```sql SELECT COUNT(*) FROM musteriler``` ` biçiminde yanıt verince çıkan SQL `SELECT COUNT(*) FROM musteriler```` oluyor. Sorgu `unrecognized token: "```"` hatasıyla düşüyor; yeniden denemede de aynı biçim gelirse soru hiç yanıtlanmıyor (denendi). Küçük modeller bu biçimi zaman zaman üretir.
- **Somut düzeltme:** `_FENCE_RE`'de dil adından sonra satır sonu yerine `\s+` de kabul edin. Ayrıca `extract_statements` sonucunun sonundaki ve başındaki `` ` `` karakterlerini temizleyin. Bu iki biçim için test ekleyin.

### Ö4 — `kur.sh` yarım kalan `.venv` yüzünden Debian/Ubuntu'da kendini onaramıyor

- **Önem:** Önemli
- **Yer:** `kur.sh:52-58`
- **Sorun:** `python3-venv` paketi kurulu değilken `python3 -m venv .venv` hata verir ama `.venv/bin/python` bağlantısını yerinde bırakır. Kullanıcı README'nin dediği gibi `sudo apt install python3-venv` yapıp betiği yeniden çalıştırınca `[ ! -x .venv/bin/python ]` yanlış çıkar ve venv adımı atlanır. Ardından `.venv/bin/python -m pip` "No module named pip" ile düşer ve betik yanıltıcı bir mesaj gösterir: "pip güncellenemedi (internet bağlantısını denetleyin)". Betiğin "Tekrar tekrar çalıştırılabilir" sözü bu yaygın durumda tutmuyor.
- **Somut düzeltme:** Bu denetimi `if ! .venv/bin/python -m pip --version >/dev/null 2>&1; then rm -rf .venv; "$PYTHON" -m venv .venv || hata ...; fi` biçiminde yazın. Hata mesajını da "pip çalışmadı; `rm -rf .venv` ile silip yeniden deneyin" yapın. `kur.ps1:59` için de aynı denetim olsun: `& $Py -m pip --version`.

### Ö5 — "Model bulunamadı" mesajındaki elle kurulum komutu, qwen dışı profillerde sessizce yanlış model kuruyor

- **Önem:** Önemli
- **Yer:** `text2sql/backends.py:50-52` (`ollama create {model} -f Modelfile`), `text2sql/cli.py:220` (`-f {s.modelfile}`), `README.md:263-264`
- **Sorun:** `Modelfile` içinde `FROM qwen2.5-coder:1.5b` sabit yazılı. `slm-sql` ya da `buyuk` profilindeki kullanıcı önerilen `ollama create text2sql-slm -f Modelfile` komutunu çalıştırırsa, Qwen tabanlı bir model SLM-SQL adıyla oluşur. Hiçbir hata çıkmaz ve `degerlendir` iki "farklı" modeli kıyasladığını sanır. `FROM` satırını profile göre değiştiren yol (`text2sql.config modelfile_text`) bu kısa yoldan atlanıyor.
- **Somut düzeltme:** İki mesaj da şunu önersin: `./kur.sh --profil <profil>` (Windows: `.\kur.ps1 -Profil <profil>`). Elle yol isteyenlere `python -m text2sql.config --profil <profil> modelfile_text > .Modelfile.olusan && ollama create <model> -f .Modelfile.olusan` verilsin. Profil adı `Settings`'ten gelsin. README "Sorun giderme" maddesi de aynı biçimde düzeltilsin.

### Ö6 — `docs/MODEL_SECIMI.md` tabloları hizasız; kökteki `npm run check` düşer

- **Önem:** Önemli
- **Yer:** `docs/MODEL_SECIMI.md:20-27, 44-52, 83-97, 116-122, 126-130, 139-145, 155-164`
- **Sorun:** Bu tablolardaki satır uzunlukları farklı. Örneğin 20-27. satırlarda 109 ve 112 karakter, 83-97. satırlarda 181'den 355'e kadar değişiyor. Prettier 3, varsayılan `proseWrap` ile markdown tablolarını her zaman hizalar. Kökteki `format:check` (`prettier --check .`) `text2sql/` klasörünü dışlamıyor; `.prettierignore` içinde yok. Kit commit edilince Köprü'nün otomatik kalite kapısı (`npm run check`) düşer. Prettier burada çalıştırılamadı (bkz. özet); `README.md` tabloları elle ölçümde hizalı çıktı.
- **Somut düzeltme:** `npm ci && npx prettier --write text2sql/README.md text2sql/docs/MODEL_SECIMI.md text2sql/docs/INCELEME.md text2sql/ornek/sorular.md` çalıştırıp `npm run format:check` ile doğrulayın. Ya da kit bilinçli olarak Köprü kapısının dışında tutulacaksa `.prettierignore`'a `text2sql/` ekleyin; bu kararı ürün sorumlusu vermeli.

### Ö7 — SLM-SQL için "BIRD dev %67" iddiası MODEL_SECIMI'deki çekinceyi taşımıyor

- **Önem:** Önemli
- **Yer:** `README.md:56`, `text2sql/config.py:90` (`bilgi` çıktısına da giriyor)
- **Sorun:** `MODEL_SECIMI.md` §1 açıkça şunu söylüyor: bu skor tek geçişte alınmıyor. 16 örnek ve 8 düzeltme adımlı "corrective self-consistency" ile alınıyor; "basit tek çağrılı bir CLI'de beklenen skor daha düşük olur". Ayrıca "istem şablonu kartta tanımlı; ona uyulmazsa kalite düşebilir" diyor. Bu kit tek çağrı yapıyor ve kendi istemini kullanıyor. README ve `bilgi` ise yalnızca "%67 (üretici)" yazıyor; kullanıcı model seçerken yanılabilir.
- **Somut düzeltme:** İki yere de şu notu ekleyin: "üretici, çok örnekli çıkarımla; bu araçta tek çağrı, skor daha düşük olur, doğrulanmadı". README'ye de "SLM-SQL kendi istem şablonunu ister, text2sql kendi istemini kullanır" uyarısını ekleyin.

### Ö8 — Akıl yürütme çıktısı veren modellerde ilk kod çiti ve 512 belirteç sınırı riski (`buyuk` profili)

- **Önem:** Önemli. Varsayımı bu depoda doğrulanmadı; düzeltmesi ucuz.
- **Yer:** `text2sql/sqlutil.py:166-171` (ilk uygun çit seçiliyor), `text2sql/config.py:168` (`max_tokens = 512`), `Modelfile:14` (`num_predict 512`)
- **Sorun:** Arctic-Text2SQL-R1 (adındaki "R1"'den de anlaşıldığı gibi) R1 tarzı, pekiştirmeli öğrenmeyle eğitilmiş bir model. Bu modeller genellikle önce `<think>…</think>` ile akıl yürütür, SQL'i en sonda verir. `MODEL_SECIMI.md` çıktı biçimini anlatmıyor, yani bu bir varsayım. Varsayım doğruysa iki sorun çıkar. (1) Düşünme bölümündeki taslak SQL çiti "ilk çit" olarak seçilir. (2) 512 belirteç düşünmeye harcanır, SQL hiç gelmez ve sonuç "SQL bulunamadı" olur. `bilgi`, 8 GB ve üstü kartlara bu profili öneriyor.
- **Somut düzeltme:** `extract_statements` başında `<think>.*?</think>` bölümünü silin; kapanmamış `<think>` varsa sonrasını atın. Birden çok uygun çit varsa sonuncusunu seçin, ya da `</think>`/`<answer>` sonrasındaki ilk çiti. `PROFILES`'a profil başına `max_tokens` ekleyin (ör. `buyuk` için 2048) ve `Modelfile` `num_predict` değerini buna göre ayarlayın. İlk gerçek GPU denemesinde `--json` ile ham yanıtı kaydedip biçimi doğrulayın.

---

## Öneri

Bu maddeler `docs/ROADMAP.md` birikim listesine yazılmalı.

| #   | Yer                                                    | Bulgu                                                                                                                                                                                                                                          | Somut düzeltme                                                                                                                                                        |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `sqlutil.py:137-138`                                   | `PRAGMA user_version(5)` ve `PRAGMA journal_mode(WAL)` gibi işlev biçimli PRAGMA'lar sözcük denetiminden geçiyor. Yalnızca `mode=ro` koruyor; mesaj da "--yaz ekleyin" diye yönlendiriyor (denendi).                                           | Okuma PRAGMA'ları için izin listesi kullanın (`table_info`, `table_xinfo`, `index_list`, `index_info`, `foreign_key_list`, `database_list`); geri kalanı yazma sayın. |
| 2   | `sqlutil.py:46-98`                                     | PostgreSQL `$$…$$` ve `$tag$…$tag$` dizgileri tanınmıyor; içlerindeki `;` ifadeyi bölüyor. Güvenli yönde bir hata, ama sorgu bozuluyor.                                                                                                        | `tokenize`'a dolar tırnağı ekleyin (yalnızca PostgreSQL lehçesinde).                                                                                                  |
| 3   | `sqlutil.py:236-243`                                   | SQL kelimesiyle başlayan açıklama satırı ("Where clause omitted because none needed.") sorgunun sonunda kalıyor.                                                                                                                               | `_is_prose_line`: satırın 4'ten fazla kelimesi varsa ve noktayla bitiyorsa, SQL kelimesiyle başlasa da açıklama sayın.                                                |
| 4   | `pipeline.py:321-322`, `cli.py:338-342`                | `ReadOnlyError` reddedilen SQL'i göstermiyor; `--sadece-sql` modunda da yazma SQL'i görülemiyor. README "Sonucu her zaman SQL'e bakarak doğrulayın" diyor.                                                                                     | Reddedilen SQL'i stderr'e yazın. `--sadece-sql` modunda çalıştırma olmadığı için yalnızca uyarı verip SQL'i gösterin.                                                 |
| 5   | `pipeline.py:313-316`                                  | Son denemede SQL bulunamazsa `ans.sql` önceki denemenin SQL'i olarak kalıyor; çıktı yanlış SQL ile yeni hatayı birlikte gösteriyor.                                                                                                            | `SQLNotFoundError` dalında `ans.sql = ""` yapın.                                                                                                                      |
| 6   | `backends.py:40-68`                                    | Sunucu bağlantıyı yanıt vermeden kapatırsa `http.client.RemoteDisconnected` (OSError) yakalanmıyor ve Python izi çıkıyor (sahte sunucuyla denendi).                                                                                            | `except (ConnectionError, http.client.HTTPException)` ekleyip "Ollama bağlantıyı kesti; `ollama ps` ve günlüğe bakın" mesajı verin.                                   |
| 7   | `cli.py:156-160`                                       | `sohbet` sırasında model beklenirken Ctrl+C tüm oturumu kapatıyor ve geçmiş kayboluyor.                                                                                                                                                        | `_ask` çağrısını `KeyboardInterrupt` için sarın; "İptal edildi" yazıp isteme dönün.                                                                                   |
| 8   | `cli.py:255-270`                                       | `degerlendir`, `--tablolar` ve `--ornekler` seçeneklerini yok sayıyor ve her zaman 0 ile çıkıyor.                                                                                                                                              | `tables` değerini geçirin; puan sıfırsa ya da arka uç hatası varsa sıfırdan farklı kodla çıkın.                                                                       |
| 9   | `kur.ps1:32-36`                                        | `Sor`, etkileşimsiz oturumu denetlemiyor (`kur.sh:34` denetliyor).                                                                                                                                                                             | `if (-not [Environment]::UserInteractive -or [Console]::IsInputRedirected) { return $false }`                                                                         |
| 10  | `kur.ps1:22`                                           | `Set-Location -Path` joker karakter yorumluyor; içinde `[` olan klon yolunda düşer.                                                                                                                                                            | `-LiteralPath $PSScriptRoot`                                                                                                                                          |
| 11  | `kur.sh:126-127`, `kur.ps1:159-161`, `README.md:64-65` | `ollama create` her çalıştırmada yeniden yapılıyor. Yerel GGUF profillerinde 4,7 GB'lık dosya her seferinde yeniden özetleniyor ve Ollama deposunda ikinci bir kopyası oluşuyor. "≈ 2 GB boş disk" bu profiller ve Ollama'nın kendisi için az. | Model varsa ve `.Modelfile.olusan` değişmediyse adımı atlayın. README'de disk gereksinimini profile göre verin (Ollama kurulumu dahil).                               |
| 12  | `kur.sh:142`, `kur.ps1:176`                            | Profil seçimi kalıcı olmuyor; `export` yalnızca o oturumda geçerli. Yeni terminalde `text2sql sor` varsayılan `text2sql` modelini arar.                                                                                                        | Betik `--profil` verildiğinde, dosya yoksa `text2sql.toml` dosyasına `profil = "<ad>"` yazsın ve bunu söylesin.                                                       |
| 13  | `config.py:218-223`                                    | `TEXT2SQL_GGUF` boşluk içeren mutlak bir yolsa `FROM` satırı tırnaksız yazılıyor.                                                                                                                                                              | Yolu Modelfile'a tırnak içinde yazın ya da boşluklu yol için uyarı verin; Ollama'da deneyip doğrulayın.                                                               |
| 14  | `Modelfile:18`                                         | Yorum, olmayan bir dosyayı gösteriyor: `tests/test_modelfile.py`. Denetim aslında `tests/test_schema_prompt.py` içinde.                                                                                                                        | Yorumu düzeltin.                                                                                                                                                      |
| 15  | `README.md:99-102`                                     | Betik adımları "`ollama create text2sql -f Modelfile`" diye anlatılıyor. Gerçekte profile göre ad (`text2sql-slm` …) ve `.Modelfile.olusan` kullanılıyor.                                                                                      | Metni koda uydurun.                                                                                                                                                   |
| 16  | `README.md:144`                                        | `--json` anahtar listesinde `deneme`, `hata`, `notlar` ve `etkilenen_satir` eksik.                                                                                                                                                             | Tabloyu `Answer.to_dict` ile eşitleyin.                                                                                                                               |
| 17  | `README.md:67-73`, `:213-218`                          | Windows için Git'in gerektiği yazılmamış. `llama-cpp-python` paketinin Windows'ta CPU sürümü için bile Visual Studio Build Tools istediği de belirtilmemiş. Her yeni terminalde etkinleştirmenin tekrarlanması gerektiği de yok.               | "Gerekenler" kısmına `winget install Git.Git` ekleyin. llama.cpp bölümüne derleyici notu ekleyin. "Yeni pencerede önce etkinleştirin" cümlesini ekleyin.              |
| 18  | `cli.py:196-200`, `hardware.py:159-161`                | `bilgi`, `q8_0`/`fp16` etiketini öneriyor ama nasıl uygulanacağını söylemiyor. AMD kartta bellek bilinmediği için "GPU yok" önerisi çıkıyor.                                                                                                   | Öneri satırına `TEXT2SQL_BASE_MODEL=<etiket> ./kur.sh` ekleyin. AMD için "bellek bilinmiyor; varsayılan Q4_K_M" yazın.                                                |
| 19  | `pyproject.toml:17`, `tests/test_schema_prompt.py:64`  | `[dev]` kurulumunda SQLAlchemy yolu test edilmiyor (1 test atlanıyor). README "SQLite adresiyle sınandı" diyor, ama bu yalnızca `[db]` kuruluysa doğru.                                                                                        | `dev` ekine `sqlalchemy>=2.0` ekleyin.                                                                                                                                |
| 20  | `README.md:58`, `:209`                                 | `buyuk` için "Resmi Ollama etiketi yok" deniyor; `config.py:106` ise "doğrulanmadı" diyor. MODEL_SECIMI bu konuda bir şey söylemiyor.                                                                                                          | "Resmî Ollama etiketi doğrulanamadı" yazın.                                                                                                                           |
| 21  | `config.py:98`, `README.md:57`                         | prem lisansı yalnızca "MIT" diye yazılmış. MODEL_SECIMI: "MIT (kartta; meta veride apache-2.0 da geçiyor)". "2024'ten beri güncellenmedi" bilgisi MODEL_SECIMI'de model için değil, `premsql` deposu için var.                                 | Lisans notunu MODEL_SECIMI ile eşitleyin. Güncelleme cümlesini kaynakla destekleyin ya da kaldırın.                                                                   |
| 22  | README, `hardware.py`, `config.py`; kök `CLAUDE.md`    | Yazımda tutarsızlıklar var: "Resmi"/"resmî", "nicemleme"/"niceleme". Kök `CLAUDE.md` klasör sahipliği tablosunda `text2sql/` yok.                                                                                                              | Tek bir yazım seçin. Sahiplik tablosuna `text2sql/` satırını ürün sorumlusu eklesin.                                                                                  |

---

## Doğrulanan ve sorunsuz bulunanlar (kayıt için)

- Kapalı Ollama: 0,1 saniyede şu Türkçe mesajla çıkıyor: "Ollama sunucusuna ulaşılamadı … ollama serve". Çıkış kodu 1, Python izi yok. Yanıt vermeyen adres: "Model 3 saniyede yanıt vermedi." mesajı veriliyor.
- Olmayan dosya: "Veritabanı dosyası bulunamadı", kod 2. Metin dosyası verilince: "SQLite dosyası okunamadı: file is not a database", kod 2. `[db]` paketi yokken PostgreSQL/MySQL adresi: `pip install -e ".[db]"` önerisi, kod 2. Paket varken kapalı sunucu: kısa bağlantı hatası, kod 2.
- `DELETE`, `WITH … DELETE`, `ATTACH`, `REPLACE INTO`, `SELECT … INTO`, `EXPLAIN ANALYZE DELETE` çıkış kodu 3 ile reddediliyor. Yorum içindeki `; DELETE` zararsız. Dizgi içindeki `;` ifadeyi bölmüyor. `<|im_end|>` temizleniyor. Açıklama + çit, `WITH` CTE, küçük harfli SQL ve `SQL:` etiketi doğru ayıklanıyor.
- SQLite salt okunur URI'si (`Path.resolve().as_uri() + "?mode=ro"`) şu yolda doğru çalıştı: `Masaüstü dir #1?x/d b%20.sqlite`. Sorgu süre sınırı ilerleme işleyicisiyle, satır sınırı `fetchmany(limit+1)` ile uygulanıyor.
- Modelfile sözdizimi geçerli (`FROM`, `PARAMETER`, `SYSTEM """…"""`, prem'de `TEMPLATE`). Qwen için durdurma belirteçleri `<|im_end|>` ve `<|endoftext|>` doğru. `num_ctx 4096` 4 GB kart için uygun: 1,5B'de KV önbelleği ≈ 0,12 GB (MODEL_SECIMI §3 hesabıyla tutarlı). `SYSTEM` metni `prompt.py` ile eşit ve bir test bunu denetliyor.
- Model etiketleri, boyutlar ve lisanslar (`qwen2.5-coder:1.5b`, ≈ 986 MB, Apache-2.0; `hf.co/frizynn/SLM-SQL-1.5B-GGUF:Q4_K_M`; Arctic 7B Q4_K_M ≈ 4,7 GB, Apache-2.0; 3B "Qwen Research" uyarısı) README, `config.py` ve `hardware.py`'de MODEL_SECIMI ile tutarlı. İstisnalar Ö7, Öneri 20 ve Öneri 21'de.
- `kur.ps1` UTF-8 BOM'lu ve CRLF içermiyor. PowerShell 7'ye özgü sözdizimi yok (`??`, üçlü işleç, `&&` yok). Her yerel komuttan sonra `$LASTEXITCODE` denetleniyor. `kur.sh` `set -euo pipefail` kullanıyor, tırnaklama doğru, etkileşimsiz oturumda soru sormuyor. İki betik de model adlarını `text2sql.config`'ten okuyor; sabit yazılmış ad yok.

---

## Tur 2

Tarih: 2026-11-05 · İnceleyen: denetçi · Kapsam: geliştiricinin "kapandı" dediği E1, Ö1–Ö8 ve uygulanan Öneriler. Denemeler 1. turdakiyle aynı yöntemle, sıfırdan yapıldı.

**Özet**

1. **Testler:** `pip install -e 'text2sql[dev,db]'` sonrası `python -m pytest text2sql/tests -q` → **118 geçti**, atlanan yok.
2. **Lint ve biçim:** `ruff check text2sql` → All checks passed! · `bash -n text2sql/kur.sh` → hatasız · `npx prettier --check text2sql README.md` → "All matched files use Prettier code style!"
3. **Durum:** E1 ve Ö1–Ö8 **kapandı** (9/9). Ö1 ve Ö8 kod ve testle kapandı; gerçek PostgreSQL sunucusu ve gerçek Arctic modeli bu ortamda denenemedi.
4. **Yeni bulgu:** 1 Önemli (R1, `--lehce` regresyonu), 3 Öneri.
5. **Genel karar:** **düzeltme gerekir.** Tek engel R1; o kapanınca kit hazır.

### Bulgu durumu

- **E1 — Kapandı.** `README.md` 3. adımı artık `.\.venv\Scripts\text2sql.exe sor ...`; bu adım hiçbir ilke ayarı istemiyor. `activate.bat` ve `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` seçenekleri hem README'de hem `kur.ps1:199-206` kapanış mesajında var. "Sorun giderme" maddesi de `Activate.ps1` durumunu kapsıyor.
- **Ö1 — Kapandı (kodla; canlı PostgreSQL ile denenmedi).** `SELECT '\'; COMMIT; DROP TABLE t; --'` artık dört kipte de (`postgresql`, `mysql`, lehçesiz, `sqlite`) "Sorguda birden çok SQL ifadesi var" ile reddediliyor. Ret `run.execute` içinde, `--yaz` verilse de uygulanıyor. Ayıklama PostgreSQL kipinde ilk ifadeyi `SELECT '\'` olarak alıyor. `E'\''` dizgisi doğru tanınıyor. PostgreSQL motoru salt okunur kipte `options=-c default_transaction_read_only=on` ile açılıyor (`schema.py:106-107`); koruma `COMMIT` sonrasında da sürüyor. Sunucu lehçelerinde iki yorum (`postgresql` ve `mysql`) birlikte deneniyor ve biri bile sakıncalıysa sorgu reddediliyor. Bu temkinli ve doğru bir seçim.
- **Ö2 — Kapandı.** `SELECT REPLACE(ad, 'İ', 'I') ...` çalışıyor, çıkış kodu 0. Arada boşluk olsa da (`replace (`) ve MySQL `INSERT(...)` işlevinde de geçiyor. `REPLACE INTO` hâlâ reddediliyor. Mesajda artık eşleşen kelime var, ör. "(DELETE, WITH içinde)". Altında "Reddedilen SQL:" bloğu basılıyor.
- **Ö3 — Kapandı.** ` ```sql SELECT ... ``` ` ve ` ```SELECT ...``` ` biçimleri ters tırnaksız ayıklanıp çalışıyor. MySQL `` `ad` `` tanımlayıcıları korunuyor.
- **Ö4 — Kapandı.** `kur.sh` (`:52-60`) gerçekten denendi: bozuk `.venv/bin/python` içeren bir kopyada `./kur.sh --ollamasiz` önce "Yarım kalmış .venv bulundu" dedi, ortamı silip yeniden kurdu ve sürdü. Venv oluşturma ya da pip başarısız olursa `.venv` siliniyor ve doğru mesaj gösteriliyor. `kur.ps1` (`:59-78`) aynı mantıkla satır satır okundu.
- **Ö5 — Kapandı.** `install_hint` (`backends.py:102-108`) profile göre doğru öneriyi veriyor; sahte 404 sunucusuyla `--profil slm-sql` denendi: "Kurmak için: ./kur.sh --profil slm-sql ... ollama create text2sql-slm -f .Modelfile.olusan". `bilgi` de aynı yardımcıyı kullanıyor. README `:288-290` "Modelfile'ı doğrudan kullanmak yalnızca qwen için doğrudur" diyor.
- **Ö6 — Kapandı.** Prettier denetimi geçiyor (yukarıda).
- **Ö7 — Kapandı.** `README.md:56`, `:226-227` ve `config.py:53-54` (`bilgi` çıktısı) çok örnekli çıkarım çekincesini, tek çağrıyı ve kartın istem şablonunun kullanılmadığını söylüyor.
- **Ö8 — Kapandı (kodla; gerçek modelle doğrulanmadı).** `<think>…</think>` siliniyor; kapanmamış `<think>` sonrası atılıyor; `<answer>` etiketleri kaldırılıyor; birden çok çit varsa sonuncusu seçiliyor. Denendi: taslak `SELECT 1` düşünme bölümünde, son çit `SELECT COUNT(*) ... urunler` → 15 satırlık doğru sonuç. `buyuk` profilinde `max_tokens` 2048; `modelfile_text` çıktısında `PARAMETER num_predict 2048` var. README, profilin "bu araçla denenmediğini" yazıyor.

Uygulanan Öneriler (denetlendi):

- `RemoteDisconnected` artık yakalanıyor: bağlantıyı kesen sunucuyla kod 1 ve Türkçe mesaj, Python izi yok.
- PRAGMA izin listesi çalışıyor: `PRAGMA user_version(5)` çıkış kodu 3 ile reddediliyor; `table_info` ve `main.table_info` geçiyor.
- `ATTACH`, `VACUUM`, `REINDEX` reddediliyor.
- `Modelfile:19` yorumu artık doğru test dosyasını gösteriyor.
- `ollama create` aynı Modelfile ile tekrarlanmıyor; işaret dosyası `.gitignore`'da.
- README'de disk tahmini profile göre veriliyor; "resmî Ollama etiketi doğrulanamadı" ve prem lisans notu MODEL_SECIMI ile tutarlı.
- `--sadece-sql` modunda yazma SQL'i gösterilip not düşülüyor.

### Yeni bulgular

#### R1 — `--lehce` artık sorgunun hangi sürücüyle çalışacağını belirliyor; uyuşmazlıkta her sorgu düşüyor

- **Önem:** Önemli (bu turda eklenen regresyon)
- **Yer:** `text2sql/run.py:31-38`, `text2sql/pipeline.py:87` (`execute(..., dialect=self.dialect)`)
- **Sorun:** 1. turda `execute` lehçeyi her zaman adresten çıkarıyordu (`detect_dialect(db)`). Şimdi pipeline `--lehce` değerini geçiriyor ve bu değer çalıştırma yolunu seçiyor. Denendi: `sor --db ornek/dukkan.sqlite --lehce postgresql` ve `--lehce mysql` → "Bağlantı adresi geçersiz: Could not parse SQLAlchemy URL", kod 2. Tersinde (PostgreSQL adresi + `--lehce sqlite`) SQLite dosya yoluna gider ve "dosya bulunamadı" der. `--lehce` README'de belgeli bir seçenek ve yalnızca otomatik algılamadan farklı olduğunda bir işe yarıyor; şimdi tam o durumda bozuluyor. Ayrıca `guard_modes` da bu değere bağlı: `--lehce sqlite` verilen bir MySQL adresinde ters bölü yorumu denenmiyor. Bu şu an açık bir delik değil, çünkü sorgu zaten çalışmıyor; ama güvenlik kararını kullanıcının istem ayarına bağlamak kırılgan.
- **Somut düzeltme:** `run.execute` içinde çalıştırma yolunu ve `guard_modes` lehçesini her zaman `detect_dialect(db)` ile seçin. `--lehce` yalnızca isteme (`build_messages`) ve ayıklamaya gitsin. İsterseniz denetimde iki lehçenin birleşimi kullanılsın. `--lehce` uyuşmazlığı için bir CLI testi ekleyin.

#### Öneriler (birikim listesine)

- **Öneri — `sqlutil.py:223-227`:** "Son çit" kuralı her yanıta uygulanıyor. Akıl yürütmesiz bir modelin "Ayrıca şöyle de süzebilirsiniz:" diyerek yazdığı ikinci, istenmemiş sorgu seçiliyor (denendi). **Düzeltme:** Son çiti yalnızca yanıtta `<think>`/`<answer>` varken seçin; yoksa ilk çiti alıp "birden çok çit vardı" notu düşün.
- **Öneri — `kur.sh:134-139`, `kur.ps1:179-189`:** Atlama işareti yalnızca Modelfile metnine bakıyor. Aynı yoldaki GGUF dosyası değiştirilirse ya da taban etiket yeniden çekilirse model yeniden oluşturulmuyor. **Düzeltme:** İşarete GGUF dosyasının boyut/tarihini (ya da `ollama show --modelfile` FROM özetini) ekleyin, ya da `--zorla` seçeneği verin.
- **Öneri — `kur.ps1:67`:** `.venv` başka bir pencerede etkinse `Remove-Item` kilitli `python.exe` yüzünden başarısız olur. Betik `Continue` kipiyle sürer ve sonra pip adımında yanıltıcı bir hatayla düşer. **Düzeltme:** `Remove-Item ... -ErrorAction Stop` kullanıp `try/catch` içinde "açık terminalleri kapatın" mesajı verin.

**Karar:** düzeltme gerekir. Tek açık iş R1; kapanınca kit **hazır** sayılabilir. Öneriler `docs/ROADMAP.md` birikim listesine yazılmalı.
