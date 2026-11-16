# Kararlar

Kısa kayıtlar: ne seçildi, neden, hangi seçenek neden elendi. Yeni karar en alta eklenir.

## K01 — Hugging Face yığını ve sürümler
transformers 5.23, peft 0.21.3, trl 1.18, datasets 5.2, sentence-transformers 6.3, accelerate 1.15, torch 2.15,
onnx 1.23 + onnxruntime 1.32 (`requirements.lock`, `uv pip compile --universal`). Bu sürümlerin API'leri
kurulu paketlerin kaynağından okunarak yazıldı ve çalıştırılarak doğrulandı (ör. transformers 5'te
`warmup_ratio` kalktı, `warmup_steps` oran kabul ediyor; `gradient_checkpointing` → `activation_checkpointing`).

## K02 — Sohbet kayıp maskesini kendimiz kuruyoruz
TRL'nin `assistant_only_loss` seçeneği şablonda `{% generation %}` işareti ister; modellerin çoğunda yoktur ve
TRL yalnız birebir tanıdığı şablonları yamalar. `tasks/chat/masking.py` şablonu **değiştirmeden** her şablonla
çalışır: asistan içeriğinin metindeki aralığı yer tutucuyla bulunur, belirteçler `offset_mapping` ile eşlenir,
sonuç çözülüp içerikle karşılaştırılır (emniyet). Doğrulama: Llama 3, Gemma 3, Phi-3 şablonlarında TRL'nin
eğitim şablonlarının maskesiyle **birebir** aynı; Qwen 2.5/3'te tek fark, TRL'nin "assistant" başlığından sonraki
satır sonunu da etiketlemesidir — o satır sonu çıkarımda üretim isteminin parçasıdır, bizim maske onu bilerek dışarıda
bırakır (`tests/test_chat_masking.py`).
Elenen: `DataCollatorForCompletionOnlyLM` (trl 1.x'te yok), yanıt şablonu dizgisiyle arama (belirteç sınırında kırılır).

## K03 — SFTTrainer'a önceden belirteçlenmiş veri
`input_ids` + `labels` (maskeli yerler −100) verilir; TRL etiketleri olduğu gibi kullanır (test:
`test_trl_bizim_kayip_maskemizi_aynen_kullanir`). Neden SFTTrainer: büyük sözlüklü modellerde çıkış logitlerini
parça parça hesaplar (bellek). Duyarlık bayrakları her zaman açıkça verilir (TRL `bf16`'yı varsayılan açar).

## K04 — Uzun örnek kırpılmaz, atılır
Kırpma yanıtın sonunu ve bitiş belirtecini keser; model durmayı öğrenemez. Atılan sayı ve önerilen azami uzunluk
(örneklerin %99'u, 32'nin katı) yazılır; `uzun_ornek = "hata"` ile durdurulabilir.

## K05 — LoRA: `all-linear`, yeni belirteç yok
Modül adı ezberlemek gerekmez. Dolgu belirteci yoksa eos kullanılır; gömme tablosu büyütülmez, bağdaştırıcı taban
modelle uyumlu kalır. Varsayılan r=16, alpha=32 (gerekçe: `docs/HIPERPARAMETRE.md`).

## K06 — ONNX: torch.export tabanlı aktarıcı
`torch.onnx.export(..., dynamo=True)`. Eski TorchScript aktarıcısı transformers 5'in maske kodunu sabit sayıp dolgulu
girdide 0,018 sapma üretti (ölçüldü); yeni aktarıcıda sapma 6e-8. Girdiler `input_ids`, `attention_mask`; yığın ve
uzunluk dinamik. Elenen: optimum (ek bağımlılık; sentence-transformers'ın ONNX arka ucu ona dayanıyor).

## K07 — int8: onnxruntime dinamik nicemleme
Ağırlıklar QInt8; ölçüm verisi gerekmez. Önce `quant_pre_process` denenir. Aktarım sonunda PyTorch'la en büyük fark
ve karar uyumu `onnx_bilgi.json`'a yazılır.

## K08 — Yakın yineleme: MinHash LSH + gerçek Jaccard (yalnız numpy)
5 karakterlik parçalar, 120 imza; bant ayarı eşikte yakalama olasılığı ≥ %99 olacak biçimde seçilir (test). Aday
çiftler gerçek Jaccard ile doğrulanır: yanlış birleştirme olmaz. Elenen: datasketch (bağımlılık), n² karşılaştırma.

## K09 — Komut satırı: argparse + Türkçeleştirme
typer/click de İngilizce metinler getirir ve bağımlılıktır. argparse'ın başlıkları, `-h/--yardim`, "kullanım:" ve
sık hata iletileri kendi alt sınıfımızda çevrilir; genel argparse modülüne dokunulmaz.

## K10 — Yapılandırma: TOML + Pydantic, tanınmayan anahtar hata
`tomllib` standart kütüphanededir. Alan adları TOML anahtarlarıyla aynı (Türkçe ASCII); yazım hatası sessizce yok
sayılmaz (`extra="forbid"`). Hazır ayarlar `yapilandirma/<görev>/<hazır>.toml`, tek değer `-D`.

## K11 — Öğretmen istemcisi: httpx
OpenAI uyumlu `/chat/completions` için ince bir istemci; openai SDK'sı eklenmedi (bağımlılık). Testlerde
`httpx.MockTransport` ve gerçek yerel bir HTTP sunucusu (kapı 0) kullanılır.

## K12 — Katalog: YAML + saklanan API doğrulaması
YAML'a yorum yazılabilir. Her kayıt `scripts/katalog_dogrula.py` ile API'den denetlenir, ham sonuç tarihli JSON olarak
saklanır; çevrimdışı test YAML'ı bu JSON'la karşılaştırır. Türkçe iddiası yalnız dil etiketi ya da model kartı kanıtıyla.

## K13 — GGUF başlığını kendimiz okuyoruz
`gguf` paketi `requests` vb. getirir; başlık biçimi basittir (`export/gguf_info.py`). Dönüştürme ise llama.cpp'nin
kendi betiğiyle yapılır (dönüştürücü yazmak bu temelin işi değil).

## K14 — Ollama şablonları birebir kopya, aile tanıma çıktıdan
Ollama deposundaki `.gotmpl`/`.json` dosyaları (MIT) değiştirilmeden saklanır, özetleri testte sabittir. Aile, şablon
metnine değil örnek bir sohbetin **çıktısına** bakılarak seçilir (aynı aileden farklı şablon sürümleri yakalanır).

## K15 — Bellek tahmini: kesin parametre sayısı + formül
Model ağırlıksız ("meta" aygıtında) kurularak toplam ve LoRA parametresi kesin sayılır (Qwen3-1.7B: 1,4 sn).
Etkinleştirme belleği formülle tahmin edilir; CPU'da bir ölçümle sabit pay 1 GB'a ayarlandı (`docs/DENEME_KAYDI.md`).

## K16 — Kodlayıcı görevlerinde tam ince ayar
Küçük kodlayıcılarda (≤ 600M) tam ince ayar yaygın, basit ve ONNX'e aktarımı doğrudandır. LoRA yalnız sohbette.

## K17 — Eşik doğrulamada seçilir, rapor testte verilir
İkili görevde olumlu sınıf = eğitimde az olan sınıf; eşik makro F1'i en yükselten aday (eşitlikte 0,5'e yakın).
İsteğe bağlı güven eşiği hedef doğruluğa göre ("belirsiz" kararı).

## K18 — Gömme: MNRL + NO_DUPLICATES, önce/sonra ölçüm
Yığın içi olumsuzlar; aynı olumlu belgeye bağlı sorgular aynı tarafa (sızıntı). Büyük yığın için önbellekli MNRL.
Zor olumsuz kazımı `relative_margin` ile (yanlış olumsuzu azaltmak için).

## K19 — Testlerde minik rastgele modeller
Tokenizer o anda eğitilir, ağırlıklar tohumlu rastgele; ağ yok, saniyeler. Gerçek modellerle duman testi ayrı ve
`INCE_AYAR_AG=1` ister.

## K20 — Xet indirmesini zorla kapatmıyoruz
Bu geliştirme ortamında Xet uç noktası takıldı; `HF_HUB_DISABLE_XET=1` ile çözüldü. Colab gibi ortamlarda Xet hızlı
olduğundan kapatmıyoruz; hata iletisi ve AGENTS "Sık yapılan hatalar" bunu öneriyor, duman testi kendisi açıyor.

## K21 — Damıtma bir örnek modüldür, eylem değil
Logit eşleme (T²·KL) en yalın denetlenebilir biçimdir; TRL'nin `DistillationTrainer` sınıfı bu temelde denenmedi.

## K22 — Varlık tanıma: ilk alt sözcük etiketlenir, ONNX yok
Yaygın uygulama; ONNX aktarımı bu temelin kapsamı dışında bırakıldı (README Sınırlar).

## K23 — Şartnameden bilinçli sapmalar
- Ek görevler: `varlik` (İYİ OLUR maddesi) ve `veri` (veri araçları için komut satırı).
- `uret` eylemi iki görevde: `sohbet uret` (talimat/yanıt) ve `gomme uret` (belgeden arama sorgusu).
- Kilit dosyası `requirements.lock` (uv; `uv.lock` değil) — pip ile de kurulabilsin diye.
- GGUF dönüştürme ve Ollama çalıştırması doğrulanamadı (README Sınırlar).
