# yz — küçük dil modelleriyle güvenilir uygulama temeli

Küçük modeller (Ollama, llama.cpp, LM Studio, vLLM ya da ucuz bulut uçları) hızlı ve ucuzdur ama
JSON'u bozar, biçimden çıkar, araç çağrısında yanılır, uzun bağlamda dağılır ve uydurur. Bu temel
o zayıflıkları **mühendislikle** kapatır: doğrula-onar döngüleri, sıkı şemalar, geri çekilme
stratejileri ve en önemlisi **ölçme** ("Hangi küçük model benim işimi görür?").

## 5 dakikada çalıştırma

Bu klasörde (`havuz/yz`) sırayla:

```bash
uv venv .venv
uv pip install --python .venv/bin/python -e ".[dev]"
.venv/bin/python scripts/check.py                    # her şey yeşil mi? (ağ gerekmez)
.venv/bin/python -m yz sohbet --saglayici sahte -m "Merhaba"   # modelsiz deneme
.venv/bin/python -m yz sun --saglayici sahte         # tarayıcıda http://127.0.0.1:8420
```

`uv` yoksa: `python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"`.
Sürümleri birebir sabit kurmak için (kilit dosyası): `uv pip install --python .venv/bin/python -r requirements.lock`
ardından `uv pip install --python .venv/bin/python --no-deps -e .`

Gerçek bir modele bağlanmak için (ör. Ollama kuruluysa):

```bash
cp yz.ornek.yaml yz.yaml          # profilleri düzenleyin (adres, model adı)
.venv/bin/python -m yz modeller   # sunucudaki model adları
.venv/bin/python -m yz sohbet     # etkileşimli sohbet
```

Ya da dosyasız: `YZ_TABAN_URL=http://localhost:11434/v1 YZ_MODEL=<model> .venv/bin/python -m yz sohbet`.

## Ne var?

| Komut | Ne yapar |
| --- | --- |
| `python -m yz sohbet` | Akışlı sohbet; uzun konuşmayı özetleyerek bağlama sığdırır. `--arac` ile hesap/tarih araçlı ajan |
| `python -m yz indeksle KLASOR` | txt, md, html, pdf belgelerini dizinler (modelsiz çalışır) |
| `python -m yz sor "soru"` | Belgelere sorar; kaynak gösterir; belgede yoksa "yok" der; uydurma rakam/adı işaretler |
| `python -m yz cikar --sema ...` | Metinden şemaya uyan JSON çıkarır; hangi katmanın ve kaç onarımla başardığını raporlar |
| `python -m yz degerlendir gorevler/x.yaml` | Görev kümesini çalıştırıp puanlar → `rapor.md`, `rapor.html` |
| `python -m yz karsilastir gorevler/x.yaml --modeller a b` | Modelleri doğruluk, biçim geçerliliği, gecikme, belirteç ve maliyetle karşılaştırır |
| `python -m yz sun` | Sohbet arayüzü + OpenAI uyumlu vekil (önbellek, günlük, kişisel veri maskeleme) — kapı 8420 |
| `python -m yz mcp` | MCP sunucusu (hesap, tarih, belge araması) — kod ajanlarına bağlanır (`docs/MCP.md`) |

Kod düzeyinde parçalar (ayrıntı: `docs/MIMARI.md`):

- **Sağlayıcı katmanı** — tek arayüz `sohbet(...)`; OpenAI uyumlu (httpx), Anthropic (resmî SDK, isteğe bağlı), Sahte (testler/gösterim). Yeniden deneme, SSE ayrıştırıcı, kullanım ve maliyet sayacı, maskeli günlük, disk önbelleği.
- **Yapılı çıktı** — JSON şeması → (a) sunucunun şema desteği / GBNF dilbilgisi, (b) araç çağrısı, (c) istem + sağlam JSON onarıcı + onarım döngüsü, (d) alan alan soru. Türkçe sayı ("1.250,50") ve tarih ("15.03.2024") düzeltmesi.
- **Araç + ajan** — Python işlevinden araç; yerel ya da metin (ReAct) kipi; döngü/bütçe/adım korumaları; tehlikeli araçta insan onayı. Hazır araçlar: güvenli hesap makinesi, tarih, korumalı klasörde dosya okuma, salt-okunur SQLite, belge araması.
- **RAG** — Türkçe'ye duyarlı temizleme/parçalama, sıfırdan BM25, bağımlılıksız karma gömme, karma arama (RRF), kaynaklı yanıt, istem enjeksiyonu uyarısı, recall@k/MRR.
- **Değerlendirme**, **güvenlik** (TCKN/VKN/IBAN/kart sağlamalı maskeleme), **MCP**, **sohbet sunucusu + tek dosyalık arayüz**.

## Gerçek küçük modelle ne gördük?

Qwen2.5-0.5B-Instruct'ı (≈1 GB, Apache-2.0) CPU'da çalıştırıp denedik — ayrıntı ve rakamlar
`docs/GERCEK_MODEL_DENEMESI.md`'de. Özet:

- Model JSON'u 6 çıktının 5'inde kod çitine sardı; sağlam ayrıştırıcı hepsini kurtardı.
- Tarihleri Türkçe yazdı ve İngilizce hata iletisiyle 3 turda da düzeltemedi; Türkçe tarih
  düzeltmesi + Türkçe onarım iletisi eklendi, çıkarım başarısı 4/6'dan 6/6'ya çıktı.
- **Biçim geçerliliği doğruluk değildir**: şemaya uyan faturaların 4'ünden yalnız 1'inde numara,
  toplam ve para birimi birlikte doğruydu. Sınıflandırmada %40, özet denetiminde %50 (her soruya
  "Hayır"), araç kullanımında 1/10 (çoğunlukla yanlış araç) — bunları ancak `degerlendir` gösterdi.

## Klasörler

```
yz/            paket (saglayici, yapili, arac, ajan, rag, istem, degerlendirme, guvenlik, mcp, sunucu, web)
gorevler/      örnek görev kümeleri (biçim örneğidir, eğitim verisi değildir) + getirme soruları
ornekler/      kopyalanacak örnekler: yeni sağlayıcı, yeni araç, planlayıcı→yürütücü→denetçi
araclar/       hf_sunucu.py (küçük HF modeli için geliştirme sunucusu), gercek_deneme.py
scripts/       check.py (tek komutluk denetim), olc_vektor.py (ölçüm)
tests/         çevrimdışı testler; tests/e2e tarayıcı testi (YZ_E2E=1)
docs/          MIMARI, KARARLAR, KUCUK_MODEL_REHBERI, MCP, GERCEK_MODEL_DENEMESI, ekran/
```

Model için talimatlar: `AGENTS.md`. Ayar örneği: `yz.ornek.yaml`, `.env.example`.

## Sınırlar

- **Canlı uçlarla doğrulananlar sınırlıdır.** OpenAI uyumlu istemci yalnız kendi `araclar/hf_sunucu.py` sunucumuzla (transformers, Qwen2.5-0.5B) canlı denendi. Ollama, llama.cpp, LM Studio, vLLM, OpenRouter ve `havuz/dil-modeli` uçları **canlı denenmedi**; davranışları bu projelerin belgelerinden ve kayıtlı yanıt biçimlerinden test edildi.
- **Anthropic bağdaştırıcısı canlı API ile denenmedi** (anahtar yok); resmî SDK'ya sahte HTTP aktarımı verilerek test edildi. Model adı ve beta bayrağı `claude-api` becerisinin 2026-11-03 tarihli bilgisinden alındı.
- **GBNF dilbilgisi llama.cpp ile denenmedi**; testte bağımsız yazılmış bir eşleyiciyle doğrulandı. Şemadaki `minLength`, `pattern`, sayı aralıkları dilbilgisine yansımaz (Pydantic yakalar); isteğe bağlı alanlar dilbilgisinde zorunludur (model `null` yazar).
- **Kişisel veri maskeleme kural tabanlıdır**: TCKN, VKN, IBAN, kart (sağlamalı), telefon, e-posta ve API anahtarı biçimlerini tanır; **ad-soyad ve adres tanınmaz** (bunun için NER modeli gerekir).
- **Karma gömme anlam değil yazım benzerliği yakalar** (eş anlamlıları bulmaz). Anlamsal arama için `--gomme saglayici` (modelin `/v1/embeddings` ucu) ya da `yerel` ekstrası (sentence-transformers; bu ortamda kurulmadı/denenmedi).
- Vektör deposu kaba kuvvettir: ölçümle 100 bin parça × 768 boyutta arama ~22 ms, bellek ~293 MB (`scripts/olc_vektor.py`, 4 çekirdekli paylaşımlı Xeon 2,1 GHz). Yüz binlerce parçanın üstü için FAISS gibi bir dizin gerekir.
- Araç zaman aşımı iş parçacığını durduramaz (Python sınırı); süresi dolan araç arka planda bitene dek çalışır. Gerçekten durdurulması gereken iş için ayrı süreç kullanın.
- Belirteç sayıları sağlayıcı bildirmezse tahminidir (`tahmini=True`; Türkçe metinde Qwen belirteçleyicisiyle ölçülen ~3,2 karakter/belirteç yerine güvenli tarafta 2,6 kullanılır).
- Sohbet arayüzü tek kullanıcılık bir geliştirme arayüzüdür (oturum/hesap yönetimi yok). Sunucu varsayılan olarak yalnız `127.0.0.1`'de dinler; başka adres için API anahtarı zorunludur.
- PDF'ten yalnız metin katmanı okunur; taranmış (görüntü) PDF için OCR yoktur.
