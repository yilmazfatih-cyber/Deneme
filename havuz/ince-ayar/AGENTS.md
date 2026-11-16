# ince-ayar — model talimatları

## Bu temel ne yapar

Açık modelleri ince ayarlar: sohbet/talimat (nedensel dil modeli + LoRA → birleştir → GGUF + Ollama `Modelfile`),
metin sınıflandırma (kodlayıcı → ONNX + int8), gömme (karşıtsal eğitim → ONNX) ve varlık tanıma. Veri doğrulama,
sızıntısız ayrım, sentetik veri hattı (açık öğretmen model), doğrulanmış model kataloğu ve Colab defteri içerir.
Her şey `python -m ince_ayar <gorev> <eylem>` komutuyla ve TOML yapılandırmasıyla sürülür.

## Komutlar

Hepsi bu klasörden (`havuz/ince-ayar`) ve sanal ortamın Python'uyla (`.venv/bin/python`) çalışır.

| Komut                                                              | Ne yapar                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| `uv venv .venv && uv pip install --python .venv/bin/python -r requirements.lock && uv pip install --python .venv/bin/python --no-deps -e .` | kurulum (kilitten) |
| `python scripts/check.py`                                          | ruff + biçim + mypy + pytest (ağsız, ~1 dk)          |
| `python scripts/check.py --duzelt`                                 | önce otomatik düzeltme, sonra denetim                |
| `python scripts/duman_testi.py`                                    | gerçek küçük modellerle ağlı duman testi (~2 dk)     |
| `python scripts/katalog_dogrula.py --yaz`                          | kataloğu Hugging Face API'siyle doğrular, JSON yazar |
| `python -m ince_ayar <gorev> dogrula --hazir cpu-deneme`           | veri hataları, ayrım, uzunluklar, (sohbet) maske     |
| `python -m ince_ayar <gorev> egit --hazir colab-t4 --kuru`         | plan + tahmini bellek; eğitim başlamaz               |
| `python -m ince_ayar <gorev> egit --hazir … [-D bolum.anahtar=deger]` | eğitim (`--surdur`: son ara kayıttan sürdür)     |
| `python -m ince_ayar <gorev> degerlendir --hazir …`                | doğrulama/test ölçütleri                             |
| `python -m ince_ayar sohbet birlestir --model ÇIKTI --cikti KLASÖR`| LoRA'yı tabana katar                                 |
| `python -m ince_ayar sohbet disa-aktar --model BİRLEŞİK --cikti K --llama-cpp llama.cpp` | GGUF + Modelfile |
| `python -m ince_ayar siniflandirma disa-aktar --hazir …`           | ONNX + int8 + doğrulama                              |
| `python -m ince_ayar sohbet uret --ayar yapilandirma/uret/talimat.toml` | öğretmen modelle veri üretimi                   |
| `python -m ince_ayar veri ayir/sizinti/kart/donustur …`            | veri araçları (model gerekmez)                       |

Görevler: `sohbet`, `siniflandirma`, `gomme`, `varlik`, `veri`. Hazır ayarlar: `cpu-deneme`, `colab-t4`, `tek-gpu-24gb`.

## Harita

| Şunu değiştireceksen…                         | Şuraya bak                                                   |
| --------------------------------------------- | ------------------------------------------------------------ |
| Komut satırı, yeni görev kaydı                | `ince_ayar/registry.py`, `ince_ayar/tasks/<görev>/cli.py`    |
| Kullanıcıya görünen her metin, yardım         | `ince_ayar/messages.py` (tek sözlük)                         |
| Yapılandırma alanları                         | `ince_ayar/config.py` (ortak), `tasks/<görev>/config.py`, `yapilandirma/<görev>/*.toml` |
| Veri şeması ve satır hataları                 | `ince_ayar/data/records.py`, `data/validate.py`, `data/checks.py` |
| Sızıntısız ayrım, yinelemeler                 | `ince_ayar/data/split.py`, `data/neardup.py`                 |
| Sohbet kayıp maskesi (en hassas yer)          | `ince_ayar/tasks/chat/masking.py`                            |
| Sohbet eğitimi / değerlendirme / birleştirme  | `tasks/chat/train.py`, `evaluate.py`, `merge.py`             |
| GGUF + Ollama                                 | `tasks/chat/export.py`, `export/ollama.py`, `export/ollama_sablonlari/` |
| Sınıflandırma, eşik                           | `tasks/classification/*`, `tasks/classification/thresholds.py` |
| ONNX aktarımı ve torch'suz çıkarım            | `export/onnx.py`, `export/onnx_runtime.py`                   |
| Gömme                                         | `tasks/embedding/*`                                          |
| Ölçütler                                      | `ince_ayar/metrics/*.py`                                     |
| Donanım, duyarlık, 4-bit                      | `ince_ayar/hardware.py`                                      |
| Bellek tahmini, kuru çalıştırma planı         | `ince_ayar/memory.py`, `ince_ayar/plan.py`                   |
| Sentetik veri                                 | `ince_ayar/synth/*`, istemler `synth/istemler/*.txt`         |
| Model kataloğu                                | `katalog/modeller.yaml`, `ince_ayar/catalog.py`, `scripts/katalog_dogrula.py` |
| Minik test modelleri                          | `ince_ayar/tiny.py`                                          |

## Değişmez kurallar

1. Kullanıcıya görünen metin koda gömülmez; `messages.py`'deki `t("anahtar", ...)` ile gelir. — `tests/test_rules.py` (anahtar var mı, kullanılmayan var mı, yer tutucular uyuşuyor mu)
2. Python'un `.lower()/.upper()/.casefold()/.title()` çağrıları yasak; `text_tr.lower_tr/upper_tr/lower_ascii` kullanılır. — `test_python_buyuk_kucuk_harf_cagrisi_yasak`
3. Her kaynak dosya `Genişletme:` satırlı Türkçe başlıkla açılır ve 300 satırı aşmaz (`messages.py` hariç). — `test_kaynak_dosya_basligi_ve_uzunlugu`
4. Sohbette kayıp **yalnız** asistan yanıtlarında; şablon değiştirilmez; uzun örnek kırpılmaz, atılır. — `tests/test_chat_masking.py`, `test_trl_bizim_kayip_maskemizi_aynen_kullanir`
5. Değerlendirme verisi eğitimle sızıntısızdır (yineleme + grup aynı tarafta). — `tests/test_neardup_split.py`
6. Her model görevi üç hazır ayara sahiptir ve ayarlar şemadan geçer; tabanları katalogdadır. — `test_her_gorevin_uc_hazir_ayari_gecerli`, `tests/test_catalog.py`
7. Katalogdaki her kayıt saklanan API doğrulamasıyla birebir aynıdır; ticari olmayan lisans açıkça işaretlidir. — `tests/test_catalog.py`
8. Örnek veri birkaç on satırı geçmez ve `ornekler/kaynaklar.json` içinde kaynağı yazılıdır. Eğitim verisi elle yazılmaz: açık lisanslı küme ya da öğretmen modelle üretim. — `test_ornek_veri_kaynak_kaydi_ve_boyutu`
9. Testler ağsızdır; ağ isteyen test `@pytest.mark.ag` ile işaretlenir. — `tests/conftest.py` (HF çevrimdışı kipi)
10. Ağır kütüphaneler (torch, transformers…) eylemin içinde içe aktarılır; `--yardim` anında açılır. — `tests/test_cli.py`
11. Defterdeki her komut gerçek komut satırında vardır. — `tests/test_notebook.py`
12. Yarım iş yok: `TODO`, boş `pass` gövdeli işlev bulunmaz. — `test_yarim_is_yok`

## Tarifler

### 1. Kendi sohbet verinle LoRA
Dosyalar: `veri/sohbet.jsonl` (sizin), `yapilandirma/sohbet/colab-t4.toml` (gerekirse kopyası).
1. Veriyi `{"messages": [{"role": "user", …}, {"role": "assistant", …}]}` satırlarına getirin. Başka biçimdeyse:
   `python -m ince_ayar veri donustur --kaynak-bicim alpaca --girdi a.json --cikti veri/sohbet.jsonl`
2. `python -m ince_ayar veri dogrula --bicim sohbet --girdi veri/sohbet.jsonl` — hataları satır numarasıyla düzeltin.
3. `python -m ince_ayar sohbet dogrula --hazir colab-t4 -D veri.egitim=veri/sohbet.jsonl` — maskeyi gözle denetleyin.
4. `… sohbet egit --hazir colab-t4 -D veri.egitim=veri/sohbet.jsonl --kuru` — "sığar" görün; sığmıyorsa `docs/HIPERPARAMETRE.md`.
5. Aynı komutu `--kuru` olmadan çalıştırın; sonra `… sohbet degerlendir --hazir colab-t4 --karsilastir`.
Doğrulama: `ciktilar/sohbet-t4/rapor.html` ve `degerlendirme.json` içinde ince ayarlı model tabandan iyi olmalı.

### 2. Sınıflandırıcı eğit ve ONNX'le sun
1. CSV/JSONL: `metin`, `etiket` sütunları. `python -m ince_ayar siniflandirma dogrula --hazir colab-t4 -D veri.egitim=veri/talepler.csv`
2. Dengesiz veride `-D egitim.dengesizlik="agirlikli-kayip"` (varsayılan hazır ayarlarda açık).
3. `… siniflandirma egit --hazir colab-t4 -D veri.egitim=…` → test raporu (doğruluk, makro F1, karışıklık matrisi).
4. `… siniflandirma disa-aktar --hazir colab-t4` → `ciktilar/siniflandirma-t4/onnx/`.
5. Başka bir uygulamada (torch gerekmez): `from ince_ayar.export.onnx_runtime import OnnxClassifier;
   OnnxClassifier(Path("…/onnx"), int8=True).predict(["metin"])`. torch ve transformers gerekmez
   (onnxruntime + tokenizers + numpy + paketin çekirdek bağımlılıkları; `tests/test_cli.py` bunu denetler).
Doğrulama: `onnx_bilgi.json` içinde `fp32_en_buyuk_fark` < 1e-4, `int8_karar_uyumu` yüksek.

### 3. Gömme modelini alanına uydur
1. Çiftler: `{"sorgu": …, "olumlu": …, "olumsuz": …(isteğe bağlı)}`. Çift yoksa belgelerden üretin (tarif 7, `gomme uret`).
2. `… gomme egit --hazir colab-t4 -D veri.egitim=veri/ciftler.jsonl` → tablo: taban (önce) ↔ ince ayarlı (sonra).
3. Gerçekçi ölçüm için `-D veri.ek_belgeler=veri/belgeler.txt` (rakip belgeler) verin.
4. `havuz/yz` RAG'ında kullanmak: o temel sorguya önek eklemez; modeli **öneksiz** eğitin (`-D model.sorgu_oneki="" -D model.belge_oneki=""`), sonra yz'de model adı olarak `ciktilar/gomme-t4/model` klasörünü verin.

### 4. Colab'da çalıştır
`defterler/ince_ayar_colab.ipynb` dosyasını Colab'da açın → T4 seçin → hücreleri sırayla çalıştırın.
Depo adresi defterin 3. hücresindedir (başka depoya taşıdıysanız değiştirin; `havuz.json` yer tutucuları).

### 5. Sonucu Ollama'da kullan
1. `… sohbet birlestir --model ciktilar/sohbet-t4 --cikti ciktilar/birlesik`
2. `git clone --depth 1 https://github.com/ggml-org/llama.cpp && pip install sentencepiece`
   (llama.cpp'nin `requirements` dosyasını bu ortama KURMAYIN: transformers'ı eski sürüme indirir.)
3. `… sohbet disa-aktar --model ciktilar/birlesik --cikti ciktilar/gguf --llama-cpp llama.cpp --ad benim-modelim`
4. GGUF + Modelfile'ı Ollama'nın olduğu makineye taşıyın: `cd ciktilar/gguf && ollama create benim-modelim -f Modelfile && ollama run benim-modelim`
Bu adımlar bu temelde **çalıştırılmadı** (README Sınırlar); sorun çıkarsa hata metniyle birlikte bildirin.

### 6. Yeni görev ekle
`ince_ayar/registry.py` başlığındaki 5 adımı izleyin. En yakın örnek: sınıflandırma (`tasks/classification/`).
Yeni iletiler `messages.py`'ye, hazır ayarlar `yapilandirma/<görev>/` altına; uçtan uca test `tests/test_encoder_pipelines.py` örneğiyle.
Doğrulama: `python scripts/check.py` (kural testleri eksik hazır ayarı/iletiyi yakalar).

### 7. Sentetik veri üret (öğretmen model)
1. Öğretmeni katalogdan seçin (`gorev` içinde `ogretmen`, `ticari: evet`). Ollama: `ollama pull qwen3:8b && ollama serve`.
2. Tohum dosyası: `{"kimlik": "…", "konu": "…", "belge": "…"}` (bkz. `ornekler/tohumlar.jsonl`).
3. `… sohbet uret --ayar yapilandirma/uret/talimat.toml --kuru` (istemi gösterir) → `--sinir 2` ile deneyin → tam koşu.
4. Çıktıyı gözle okuyun; `…reddedilen.jsonl` dosyasındaki nedenlere bakın; `grup_alani = "grup"` ile eğitin.
İstemi değiştirirseniz yeni sürüm adıyla kaydedin (`talimat-v2.txt`) ve `-D istem=…` verin.

### 8. Damıtma (öğretmen → öğrenci)
`ince_ayar/tasks/chat/distill.py` örneğini kopyalayın. Öğretmen ve öğrenci aynı tokenizer'ı paylaşmalı
(katalogda `damitma`: Qwen3-1.7B → Qwen3-0.6B). Test: `tests/test_distill.py`.

### 9. Kataloğa model ekle
`katalog/modeller.yaml` içine kayıt yazın (`ticari` alanını lisanstan çıkarın) → `python scripts/katalog_dogrula.py --yaz`
→ `SORUN` satırı kalmayana kadar düzeltin → `python scripts/check.py`.

## Sık yapılan hatalar

| Belirti                                                    | Neden                                                     | Çözüm |
| ---------------------------------------------------------- | --------------------------------------------------------- | ----- |
| "`messages` son öğesi asistan olmalı"                      | Satır kullanıcı iletisiyle bitiyor                        | Son yanıtı ekleyin ya da satırı çıkarın |
| "… dosyası utf-8 olarak okunamadı"                         | Türkçe Excel CSV'si (Windows-1254)                        | `--kodlama cp1254` ya da "CSV UTF-8" kaydet |
| "N örnek … belirteci aştığı için çıkarıldı"                | Azami uzunluk kısa                                        | İletideki `-D veri.azami_uzunluk=…` önerisini kullanın |
| Model yanıtı bitmiyor, kendini tekrarlıyor                 | Şablon bitiş belirteci öğretilmemiş / eski eos            | `dogrula` maskesinde ⟦…⟧ bitiş belirtecini içermeli; `birlestir` eos'u günceller |
| `--kuru` "SIĞMAZ" diyor                                    | Yığın/uzunluk büyük                                       | `-D egitim.yigin=1 -D egitim.biriktirme=16`, `gradyan_denetimi = true`, GPU'da `-D model.dort_bit=true` |
| "4-bit yükleme CUDA'lı bir GPU ister"                      | CPU'da `dort_bit = true`                                  | `-D model.dort_bit=false` ya da GPU'da çalıştırın |
| Model indirmesi dakikalarca sürüp "Can't load the model"   | Xet depolama uç noktası ağda engelli                       | `HF_HUB_DISABLE_XET=1` ile yeniden deneyin |
| "Sohbet şablonu bu örneği kabul etmedi … system"           | Model system rolünü desteklemiyor (ör. eski Gemma)        | System iletisini ilk kullanıcı iletisine katın |
| Birleştirmede "~1 logit fark" uyarısı                      | bf16 yuvarlaması (hata değil)                             | Tam karşılaştırma için `--duyarlik fp32` |
| Doğrulama ölçütleri şüpheli iyi                            | Sızıntı (aynı/benzer örnek iki tarafta)                   | `veri sizinti` çalıştırın, `grup_alani` verin |
| `uret` "ticari kullanıma kapalı" diye duruyor              | Öğretmen lisansı CC-BY-NC vb.                             | Apache-2.0/MIT öğretmen seçin |
| Kural testi "Sözlükte olmayan anahtarlar"                  | Yeni `t("…")` anahtarı eklenmemiş                          | `messages.py` içine ekleyin |

## Bitti tanımı

- [ ] `python scripts/check.py` yeşil (ruff, biçim, mypy, pytest)
- [ ] Yeni/değişen davranışın testi var (minik modelle uçtan uca ya da birim)
- [ ] Kullanıcı metinleri `messages.py`'de, Türkçe, suçlamayan ve ne yapılacağını söyleyen
- [ ] Yeni model/taban kullandıysanız katalogda ve `katalog_dogrula.py` temiz
- [ ] GPU'da ya da ağda denenmeyen her şey README "Sınırlar"da yazılı
- [ ] Yeni karar `docs/KARARLAR.md`'de kısa kayıt olarak var
