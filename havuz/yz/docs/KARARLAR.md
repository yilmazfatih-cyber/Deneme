# Kararlar

Kısa kayıtlar: ne seçildi, neden; hangi seçenek neden elendi.

## K-01 OpenAI uyumlu istemci: httpx ile doğrudan (openai SDK değil)
Ollama, llama.cpp, LM Studio, vLLM, OpenRouter ve `havuz/dil-modeli` aynı uç biçimini konuşur
ama küçük farklar gösterir (eksik `usage`, `content` parça listesi, argümanın dizgi ya da nesne
gelmesi, `reasoning_content`/`thinking`, `timings`, NDJSON akış, desteklenmeyen alanı 400 ile
reddetme). Doğrudan httpx ile bu farkları tek yerde (`openai_bicim.py`) hoş görmek, SDK'nın katı
modellerine uymaya çalışmaktan kolaydır. Elendi: `openai` SDK (katı yanıt doğrulaması ve ek bağımlılık).

## K-02 Varsayılanlar küçük modele göre
Sıcaklık 0, çıktı sınırı profilde 1024, kısa numaralı kurallı istemler, örnek iskelet. Yanıt
önbelleği yalnız belirlenimci isteklerde (sıcaklık 0 ya da tohum) çalışır.

## K-03 Yapılı çıktı katman sırası: sema → arac → istem → alan
Sunucunun kısıtlı çözümlemesi (json_schema, Ollama `format`, llama.cpp GBNF) varsa en güvenilir
yol odur. Yoksa araç çağrısı (birçok sunucu araç şablonunu destekler), o da yoksa istem + onarım.
"alan" katmanı en yavaştır (alan başına bir çağrı) ama en küçük modellerde bile çalışır.
Sunucu bir katmanı desteklemiyorsa (400/422/501 ya da `DesteklenmiyorHatasi`) katman atlanır;
bağlantı hataları ise atlatılmaz (her katmanda tekrarlanacağı için) — kullanıcıya hemen döner.

## K-04 Sağlam JSON ayrıştırıcı: elle yazılmış hoşgörülü okuyucu
Düzenli ifadeyle yama, dizgi içindeki virgül/parantezleri bozar. Harf harf okuyan özyinelemeli
okuyucu (derinlik sınırı 64) tek/akıllı tırnak, tırnaksız anahtar/değer, sondaki/eksik virgül,
yorum, Python sabitleri, kaçışsız iç tırnak, ham satır sonu ve kesik çıktıyı hoş görür; yaptığı
her onarımı not eder (rapor ve ölçüm için). Elendi: `json-repair` paketi (bağımlılık; notları
vermiyor; Türkçe özel durumları — "0532…" baştaki sıfır — bizim kuralımızla daha kolay).

## K-05 GBNF üretimi: sadeleştirilmiş, alanlar sabit sırada ve zorunlu
İsteğe bağlı alanların bütün alt kümelerini dilbilgisine dökmek kural sayısını patlatır ve
küçük modeli kararsız bırakır. Alanlar şemadaki sırayla zorunludur; boş olabilecek alan `null`
alır. Boşluk en çok bir karakterdir (sonsuz satır sonu döngüsüne karşı). Uzunluk/desen
kısıtları dilbilgisine girmez, Pydantic yakalar. llama.cpp'nin kendi `json_schema` alanı da
vardır; biz GBNF'i açıkça üretiyoruz ki görülebilsin (`yz cikar --gbnf`) ve başka GBNF
tüketicilerinde de kullanılabilsin. Doğrulama: llama.cpp ile DENENMEDİ; testte bağımsız eşleyici.

## K-06 Anthropic: resmî SDK, sıcaklık gönderilmez, zorunlu araç seçimi istemle
`claude-api` becerisine göre (2026-11-03): SDK 2.x API sürümü `2026-10-21`'i gönderir ve bu sürümde
`temperature/top_p/top_k` her modelde 400 döner; güncel modellerde zorunlu `tool_choice` da 400
döner. Bu yüzden sıcaklık yok sayılır, "zorunlu" araç seçimi sistem istemine talimat olarak
eklenir (`zorunlu_arac_destegi=True` ile gerçek alan gönderilebilir). Ret (`refusal`) bitiş
nedeni ayrıdır; `ret_yedegi_beta` verilirse sunucu tarafı yedek (`fallbacks: "default"`) açılır
(örnek ayarda açık). Model adı koda gömülmez. CANLI API İLE DENENMEDİ.

## K-07 Ajan: yerel araç çağrısı + metin (ReAct) yedeği, kip kendiliğinden değişir
Birçok küçük model ya da sunucu araç çağrısını desteklemez ya da aracı düz metinle "çağırır"
(`<tool_call>…`, `hesapla("2+2")`). `oto` kipte bunlar algılanıp metin kipine geçilir. Metin
kipinde "Gözlem:" durdurucudur (model kendi gözlemini uydurmasın); uydurduysa kesilir.
Döngü koruması aynı araç+argümanın sayısına bakar (uyarı → durdurma).

## K-08 RAG: sıfırdan BM25 + bağımlılıksız karma gömme + RRF
BM25 Türkçe eklere duyarlı kök kırpmayla (ad çekim ekleri; fiil ekleri bilerek yok — "fatura"
gibi kökleri fazla kırpıyordu) ve ASCII katlamayla (ödeme=odeme, Invoice=invoice) çalışır.
Karma gömme (karakter 3–5 gram + kelime kökü, işaretli karma, TF-IDF) modelsiz çalışır; anlam
değil yazım benzerliği yakalar. İkisi RRF ile birleşir (ölçek ayarı gerekmez). Örnek getirme
kümesinde (10 soru) recall@3 üç kipte de 1,0; MRR bm25 0,93 · vektör 1,0 · karma 0,95
(`python -m yz sor --getirme-olc gorevler/getirme/sorular.jsonl --k 3`; küçük ve kolay bir küme,
genellenemez — kendi belgelerinizle ölçün).

## K-09 Belirteç tahmini: 2,6 karakter/belirteç (güvenli taraf)
Qwen2.5 belirteçleyicisiyle depodaki 5 Türkçe Markdown belgesinde ölçülen ortalama 3,18
karakter/belirteçtir (aralık 2,69–3,65; `tokenizers` ile sayıldı). Bütçe taşmasın diye tahmin
bilerek fazla sayar (2,6). Gerçek sayı modele göre değişir.

## K-10 Kişisel veri: kural + sağlama, geri açılabilir yer tutucular
TCKN/VKN/IBAN/kart sağlama algoritmasıyla doğrulanır (yanlış alarm azalır; VKN algoritması
ikinci, bağımsız bir gerçeklemeyle 2000 rastgele numarada karşılaştırıldı). Yer tutucular
`[TCKN_1]` biçimindedir ve oturum boyunca tutarlıdır; model bozsa da (`[tckn 1]`) açılır; akışta
parçalanan yer tutucu bekletilir. Ad-soyad/adres TANINMAZ (NER gerekir; kapsam dışı).

## K-11 Vektör deposu: numpy kaba kuvvet
Ölçüm (`scripts/olc_vektor.py`, 4 çekirdekli paylaşımlı Intel Xeon 2,1 GHz, 2 iş parçacığı):

| Parça | Boyut | Arama, k=10 | Matris belleği |
| --- | --- | --- | --- |
| 10.000 | 384 | 1,3 ms | 15 MB |
| 100.000 | 384 | 19,1 ms | 146 MB |
| 200.000 | 384 | 44,9 ms | 293 MB |
| 100.000 | 768 | 22,3 ms | 293 MB |
| 200.000 | 768 | 93,0 ms | 586 MB |

Sonuç: ~100 bin parçaya kadar etkileşimli kullanım için yeterli; asıl darboğaz gömme üretimidir
(karma gömme ~267 parça/sn, BM25 dizinleme ~1400 parça/sn; aynı makine, ~790 karakterlik
parçalar). Daha büyük derlem için FAISS/hnswlib eklenmeli (bağımlılık; şimdilik gereksiz).

## K-12 Değerlendirme: YAML + JSONL, iş parçacığı havuzu
Görev kümesi düz metin dosyalarıdır (insan ve model kolay düzenler). Eşzamanlılık iş parçacığıyla
(httpx eşzamanlı istemci, GIL sorun değil; çağrılar G/Ç'de bekler). "Doğru" sayılma: eşik 1 ise
bütün puanlayıcılar geçmeli; değilse ağırlıklı ortalama ≥ eşik. Biçim geçerliliği ayrı ölçülür
(json_sema puanlayıcısı + bitiş nedeni) — küçük modelde biçim ve doğruluk ayrı sorunlardır.

## K-13 MCP: resmî `mcp` 2.x `MCPServer`; araçlar paketin kendi `Arac`'ları
Kurulu SDK'dan doğrulandı: `FastMCP` 2.x'te `MCPServer` oldu; istemci `mcp.Client` (URL,
`StdioServerParameters` ya da süreç içi sunucu alır). Araç hatası `ToolError` ile yükseltilir —
düz istisnada SDK iletiyi gizliyor ("Error executing tool"). Tehlikeli araçlar yayımlanmaz
(MCP tarafında onay kancası yok). Ajan köprüsü arka planda olay döngüsü çalıştırır.

## K-14 Sunucu: FastAPI, SSE, varsayılan 127.0.0.1, CORS kapalı
API anahtarı tanımlı değilse yalnız yerel adrese açılır (komut, başka adrese anahtarsız açmayı
reddeder). Arayüz tek HTML dosyası + `sozluk.json`; derleme yok; model metni `textContent`.

## K-15 Arayüz metinleri ayrı sözlükte
STANDARTLAR §3: kullanıcının gördüğü metin koda gömülmez. `index.html` ve `kayit.html`,
`sozluk.json`'u yükler; kural testi kullanılan her anahtarın sözlükte olduğunu denetler.

## K-16 Döngüsel içe aktarmaya karşı tembel paket `__init__`'leri
`istem → rag → saglayici → yapili → istem` döngüsü gerçek bir hata olarak yakalandı. Alt düzey
modül barındıran üç paketin (`yapili`, `rag`, `istem`) `__init__`'i PEP 562 `__getattr__` ile
tembeldir; tip denetleyici için `TYPE_CHECKING` içe aktarması vardır. Elendi: paket içi modülleri
taşımak (yollar herkesin bildiği yerde kalsın).

## K-17 Gerçek model denemesi: Qwen2.5-0.5B-Instruct, transformers, CPU
≤ ~1 GB, Apache-2.0, sohbet şablonu araçları destekliyor (Hugging Face API'den doğrulandı: sürüm
`7ae5576`, `model.safetensors` 988 MB). Geliştirme sunucusu `response_format`'u bilerek 400 ile
reddeder (geri çekilme yollarını sınamak için). Ayrı geçici sanal ortamda koşuldu; depoya model
dosyası girmez. Sonuçlar: `docs/GERCEK_MODEL_DENEMESI.md`.

## K-18 Bağımlılıklar
Çekirdek: httpx, pydantic, numpy, pyyaml (YAML görev tanımı ve ayar dosyası için; ~300 satırlık
güvenli ayrıştırıcıyı yazmaktan iyidir). Ekstralar: `sunucu` (fastapi, uvicorn, python-multipart),
`mcp`, `belge` (pypdf), `anthropic`, `yerel` (sentence-transformers; denenmedi), `e2e` (playwright).
