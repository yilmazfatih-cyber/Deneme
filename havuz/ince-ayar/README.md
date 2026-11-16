# ince-ayar — açık modelleri işinize uydurma temeli

Küçük açık modelleri kendi işinize uydurmanın en etkili yolu **ince ayardır**. Bu temel, Hugging Face
yığınıyla (transformers + peft + trl + datasets + sentence-transformers) dört işi uçtan uca yapar:

| Görev           | Ne yapar                                                    | Çıktı                              |
| --------------- | ----------------------------------------------------------- | ---------------------------------- |
| `sohbet`        | Sohbet/talimat modelini LoRA ile eğitir                     | bağdaştırıcı → birleşik model → GGUF + Ollama `Modelfile` |
| `siniflandirma` | Metni sınıflara ayıran kodlayıcı modeli eğitir              | model + eşik → ONNX (+int8)        |
| `gomme`         | Arama/RAG için gömme (embedding) modelini alanınıza uydurur | sentence-transformers modeli → ONNX |
| `varlik`        | Metindeki kişi, yer… adlarını etiketlemeyi öğretir          | model                              |

Ayrıca: **veri araçları** (biçim doğrulayıcı, sızıntısız ayrım, veri kartı, dönüştürücü), **sentetik veri
hattı** (açık bir öğretmen modelle veri üretimi), **doğrulanmış model kataloğu** ve **Colab defteri**.

## 5 dakikada çalıştırma

```bash
cd havuz/ince-ayar
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.lock      # sürümleri sabit kurulum
uv pip install --python .venv/bin/python --no-deps -e .
.venv/bin/python -m ince_ayar --yardim
```

`uv` yoksa: `python -m venv .venv && .venv/bin/pip install -r requirements.lock && .venv/bin/pip install --no-deps -e .`

Ağsız, saniyeler süren deneme (minik rastgele model; hattın çalıştığını gösterir, model bir şey öğrenmez):

```bash
.venv/bin/python -m ince_ayar sohbet dogrula --hazir cpu-deneme     # veri + kayıp maskesi gösterimi
.venv/bin/python -m ince_ayar sohbet egit --hazir cpu-deneme --kuru # plan + tahmini bellek
.venv/bin/python -m ince_ayar sohbet egit --hazir cpu-deneme        # 3 adım eğitim, rapor.html
.venv/bin/python -m ince_ayar siniflandirma egit --hazir cpu-deneme
.venv/bin/python -m ince_ayar siniflandirma disa-aktar --hazir cpu-deneme   # ONNX + int8
```

Gerçek işte GPU'lu bir ortam kullanın: Colab/Kaggle için `defterler/ince_ayar_colab.ipynb`
(hazır ayar `colab-t4`), 24 GB'lık kart için `tek-gpu-24gb`. Kendi verinizi `-D veri.egitim=dosya.jsonl` ile verin.

Denetim (her değişiklikten sonra): `.venv/bin/python scripts/check.py`

## Neler var

- **Komut satırı:** `python -m ince_ayar <gorev> <eylem>`; eylemler `dogrula`, `egit` (`--kuru`, `--surdur`),
  `degerlendir`, `birlestir`, `disa-aktar`, `tahmin`, `uret`. Yardım ve hatalar Türkçe.
- **Hazır ayarlar** (`yapilandirma/<görev>/`): `cpu-deneme`, `colab-t4`, `tek-gpu-24gb`; tek değer `-D bolum.anahtar=deger`.
- **Doğru kayıp maskesi:** sohbette kayıp yalnız asistan yanıtlarında (ve yanıtı kapatan belirteçte); modelin
  kendi sohbet şablonuyla, şablonu değiştirmeden. TRL'nin kendi eğitim şablonlarıyla birebir karşılaştırılarak test edildi.
- **Sızıntısız ayrım:** yinelenen ve çok benzer örnekler (MinHash + gerçek Jaccard) ve aynı `grup` aynı tarafa gider.
- **Değerlendirme:** sohbette kayıp/şaşkınlık + tam eşleşme + ROUGE-L (bağımlılıksız) ve taban modelle karşılaştırma;
  sınıflandırmada doğruluk, makro F1, karışıklık matrisi, eşik ayarı; gömmede recall@k, MRR, nDCG (önce/sonra).
- **Rapor:** her eğitim `rapor.html` (kayıp eğrisi, örnek üretimler), `ozet.json` (sürümler, tohum, süre) bırakır.
- **Sentetik veri:** Ollama/vLLM/llama.cpp gibi OpenAI uyumlu uç noktadaki açık bir öğretmenle; süzgeçler, tohum,
  istem sürümü ve satır başına kaynak kaydı; ticari kullanıma kapalı öğretmen lisansında durur.
- **Model kataloğu:** `katalog/modeller.yaml` — 35 model, her biri 16 Kasım 2026'da Hugging Face API'siyle doğrulandı
  (`katalog/dogrulama-2026-11-16.json`); ticari kullanıma kapalı olanlar açıkça işaretli.
- **Damıtma örneği:** `ince_ayar/tasks/chat/distill.py` (öğretmen → öğrenci logit eşleme).

Ayrıntılar: [AGENTS.md](AGENTS.md) (tarifler), [docs/NE_ZAMAN_INCE_AYAR.md](docs/NE_ZAMAN_INCE_AYAR.md),
[docs/HIPERPARAMETRE.md](docs/HIPERPARAMETRE.md), [docs/DEGERLENDIRME.md](docs/DEGERLENDIRME.md),
[docs/MIMARI.md](docs/MIMARI.md), [docs/KARARLAR.md](docs/KARARLAR.md), [docs/DENEME_KAYDI.md](docs/DENEME_KAYDI.md).

## Sınırlar

Dürüst liste — burada yazan şeyler **denenmedi** ya da **eksik**:

- **GPU'da hiç çalıştırılmadı.** Geliştirme makinesinde GPU yoktu. CUDA yolları (fp16/bf16 seçimi, 4-bit/QLoRA,
  `prepare_model_for_kbit_training`, `colab-t4` ve `tek-gpu-24gb` hazır ayarlarıyla gerçek eğitim) yalnız sahte
  donanım nesnesiyle birim testinden geçti. Colab defterinin komutları biçim olarak test edildi, T4'te koşturulmadı.
- **Bellek tahmini bir ölçüm değildir.** Formül CPU'da tek bir ölçümle karşılaştırıldı (SmolLM2-135M, bkz.
  `docs/DENEME_KAYDI.md`); GPU belleğiyle karşılaştırılmadı. Sınırdaysa küçük bir koşuyla deneyin.
- **GGUF dönüştürme bu ortamda çalıştırılmadı.** llama.cpp'nin dönüştürücüsünü çalıştırmak bu oturumda izin
  sisteminde engellendi; `disa-aktar` komutu dönüştürücüyü çağıran ve `Modelfile` yazan kısımdır, GGUF üretimi
  ve `llama-quantize` (Q4_K_M) **doğrulanmadı**. GGUF başlık okuyucusu elle yazılmış bir dosyayla test edildi.
- **Ollama'da denenmedi.** `Modelfile` şablonları Ollama deposundaki dosyaların birebir kopyasıdır ama
  `ollama create/run` çalıştırılmadı. Tanınmayan şablon ailesinde `TEMPLATE` yazılmaz (Ollama'nın GGUF'tan
  çıkarımı doğrulanmadı).
- **Kalite iddiası yok.** Örnek veriler birkaç on satırlık fikstürdür; testler hattın **çalıştığını** gösterir,
  modelin iyi öğrendiğini göstermez. Katalogdaki "kanıt: dil etiketlerinde tr" Türkçe'de iyi olduğu anlamına gelmez.
- **Araç çağrısı (tool calling) ve çok kipli (resimli) sohbet verisi** desteklenmez; şablonlar yalnız
  `system/user/assistant` metin iletileriyle sınanır.
- **Varlık tanımada ONNX'e aktarım yok**; sözcük bölme boşluğa göredir.
- **Sentetik veri hattı** gerçek bir öğretmen sunucusuyla denenmedi (testler sahte uç noktayla). Ollama etiketi
  `qwen3:8b` doğrulanmadı. Dil süzgeci bir sezgidir (Türkçe harfsiz kısa metni reddedebilir). Sunucular `seed`
  verilse de bit düzeyinde aynı çıktıyı garanti etmez.
- **Xet indirme sorunu:** bu ortamda Hugging Face'in Xet depolama uç noktası takıldı; `HF_HUB_DISABLE_XET=1` ile
  indirme çalıştı. Benzer bir ağda indirme dakikalarca sürerse bu değişkeni verin.
- Çoklu GPU (DDP/FSDP/DeepSpeed), paketleme (packing) ve akışlı (streaming) veri desteklenmez.
