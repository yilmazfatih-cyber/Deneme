# Mimari

## Katmanlar ve bağımlılık yönü

```
                    cli.py / komutlar.py          sunucu/ (FastAPI)        mcp/ (MCP SDK)
                              │                         │                       │
        ┌─────────────────────┼─────────────┬───────────┼──────────┬────────────┘
        ▼                     ▼             ▼           ▼          ▼
  degerlendirme/          ajan/          rag/yanit   yapili/cikar   arac/hazir
   (koşu, puan,      (döngü, metin     (kaynaklı    (katmanlar +   (hesap, zaman,
    rapor, karşılaş.)   kipi, onay)      yanıt)       onarım)        dosya, sqlite, belge)
        │                     │             │           │          │
        └──────────┬──────────┴──────┬──────┴─────┬─────┴────┬─────┘
                   ▼                 ▼            ▼          ▼
              saglayici/          istem/       rag/ (dizin,   arac/ (tanım, kutu)
       (taban, openai_uyumlu,   (şablonlar,    bm25, gömme,
        anthropic, sahte, sse,   bütçe, bellek, vektör, parçala,
        önbellek, günlük, maliyet) az-örnek)   yükleyici)
                   │                 │            │
                   └─────────┬───────┴────────────┘
                             ▼
     yapili/json_onar, json_hosgorulu, sema_araclari, gbnf   guvenlik/ (maske, süzgeç, izin)
                             │                                   │
                             └──────────────┬────────────────────┘
                                            ▼
                         metin.py (Türkçe harf, kök, cümle)  hatalar.py  ayar.py
```

Kural: oklar yalnız aşağı doğrudur. Alt düzey modüller (json_onar, gomme, sablonlar, metin)
üst düzey modülleri içe aktarmaz. `yapili`, `rag`, `istem` paketleri hem alt hem üst düzey
modül içerdiği için `__init__`'leri tembeldir (`yz/tembel.py`); kural testi her modülü boş bir
içe aktarma durumundan yükler (`tests/test_kurallar.py`).

## Veri akışları

### 1. Sohbet çağrısı (`Saglayici.sohbet`)

```
mesajlar (str | dict | Mesaj) ─► istek_kur ─► SohbetIstegi (doğrulanmış, tek biçim)
   ─► önbellek anahtarı (yalnız sıcaklık 0 ya da tohumlu)  ─► isabet: Yanit (onbellekten=True)
   ─► bağdaştırıcı._sohbet / _sohbet_akisi
          OpenAIUyumlu: govde_kur → httpx → (hata → yeniden_dene / alan at) → yanit_coz / SSE → AkisBiriktirici
          Anthropic:    mesajlari_cevir → resmî SDK → _yanit_coz
          Sahte:        betik / kural
   ─► _tamamla: gecikme, kullanım (yoksa tahmin), önbelleğe yaz, sayaç + maliyet, maskeli günlük
```

### 2. Yapılı çıkarım (`cikar`)

```
metin ─► katman "sema"  (yanit_bicimi=şema → response_format / GBNF / Ollama format)
     │      └► desteklenmiyor → atla
     ├► katman "arac"   (şema = aracın parametresi; arac_secimi zorunlu; $ref açılır)
     ├► katman "istem"  (alan listesi + örnek iskelet)
     │      her katmanda: json_ayikla (çit, virgül, tırnak, yorum, kesik…) → sema_ile_duzelt
     │      (anahtar eşleme, Türkçe sayı/tarih, enum, tek öğe→liste) → Pydantic doğrulama
     │      → hata: Türkçe eyleme dönük ileti modele geri → en çok N onarım turu
     └► katman "alan"   (her alanı ayrı kısa soruyla; karmaşık alan için alt şema)
  ─► CikarimSonucu(deger, katman, denemeler[], kullanim) → rapor()
```

### 3. Ajan (`Ajan.calistir`)

```
görev ─► [sistem istemi] ─► model (araç tanımlarıyla)
   ├ araç çağrısı ─► AracKutusu.cagir: bilinmeyen? izinli? tehlikeli→ doğrula → onay(doğrulanmış) →
   │                 Arac.yurut (onaylanan argümanla) ; değilse Arac.calistir
   │                  (doğrula+düzelt → iş parçacığında zaman aşımlı çalıştır → metin; hata=gözlem)
   │  ─► tekrar sayacı (aynı ad+argüman) → sınır aşılırsa uyarı, yine tekrarsa "dongu"
   ├ metinle araç çağrısı (<tool_call>, Eylem:, hesapla(...)) ─► metin kipine geç
   ├ DesteklenmiyorHatasi ─► metin kipine geç (ReAct istemi, "Gözlem:" durdurucu)
   └ yanıt ─► bitti
 sınırlar: azami_adim (→ araçsız son yanıt), belirtec_butcesi, ardisik_hata_siniri, boş yanıt, ret
```

### 4. RAG (`RagHatti.sor`)

```
belgeler ─► yükle (txt/md/html/pdf; cp1254 yedeği) ─► temizle (yumuşak tire, bölünmüş kelime,
 sayfa no, tekrarlanan üst/alt bilgi) ─► parçala (başlık yolu, paragraf/cümle, örtüşme)
 ─► BM25 (Türkçe kök + ASCII katlama) + gömme (KarmaGomme | /v1/embeddings | sentence-transformers)

soru ─► BM25 sırası + vektör sırası ─► RRF ─► (isteğe bağlı yeniden sıralama kancası)
 ─► ilgililik eşiği (BM25>0 ya da kosinüs ≥ eşik) ─► hiçbiri yoksa model ÇAĞRILMADAN "belgede yok"
 ─► enjeksiyon taraması (uyar / istenirse dışla) ─► bağlam bütçesine sığdır
 ─► numaralı, ayraçlı kaynaklarla istem ─► model
 ─► yankı temizleme (kopyalanan başlık/ayraç/soru) ─► atıflar (yoksa birebir cümle eşleşmesi)
 ─► "belgede yok" tanıma ─► dayanaksız rakam/özel ad denetimi ─► SorYaniti(uyarılar…)
```

### 5. Değerlendirme

```
YAML (KosuTanimi) + JSONL (Ornek) ─► _Baglam (şema, araçlar, RAG dizini)
 ─► ThreadPoolExecutor(es_zamanlilik) ─► görev türüne göre çalıştırıcı ─► puanlayıcılar
 ─► OrnekSonucu (geçti, puanlar, biçim geçerli, gecikme, belirteç, maliyet, notlar)
 ─► KosuSonucu (doğruluk, biçim, p50/p95, belirteç, maliyet) ─► md/html, gerileme, karşılaştırma
```

### 6. Sunucu

```
her istek ─► IstekKapisi (gövde okunmadan: yerel kipte ad/köken, anahtar kipinde anahtar, gövde sınırı)
tarayıcı (yz/web/index.html) ─► /api/sohbet (SSE: parca, arac, kaynaklar, son, hata)
                                 (kip=arac: araç çıktısı da modele maskeli gider; ekranda açılır)
OpenAI istemcisi ─► /v1/chat/completions ─► maskele (içerik + araç çağrısı argümanları) ─► sağlayıcı
                    (önbellek, günlük) ─► maskeyi aç
                                            (akışta parçalanmış yer tutucu AkisMaskeAcici ile bekletilir)
belge yükleme ─► /api/belge ─► dizine ekle ─► .yz/dizin'e kaydet
```

## Durum ve dosyalar

| Yer | İçerik | Kim yazar |
| --- | --- | --- |
| `.yz/onbellek/` | yanıt önbelleği (istek özeti → JSON) | `DiskOnbellek` |
| `.yz/gunluk.jsonl` | maskeli istek/yanıt günlüğü | `IstekGunlugu` |
| `.yz/dizin/` | `parcalar.jsonl`, `vektorler.npy`, `meta.json` | `RagDizini.kaydet` |
| `.yz/kosular/` | değerlendirme ve karşılaştırma sonuçları | `komutlar.py` |

`.yz/` depoya girmez; içinde kişisel veri olabilir (önbellek düz metindir).

## Eşzamanlılık

- `OpenAIUyumlu` tek `httpx.Client` kullanır (iş parçacığı güvenli). Değerlendirme örnekleri iş parçacığı havuzunda koşar; sayaç, günlük ve dizin kilitlidir; önbellek atomik yazar.
- Araçlar ayrı (daemon) iş parçacığında zaman aşımıyla çalışır.
- MCP köprüsü kendi olay döngüsünü arka planda çalıştırır; eşzamanlı ajan çağrıları `run_coroutine_threadsafe` ile gider.
- Sunucu akışları eşzamanlı üreteçtir (Starlette iş parçacığı havuzunda yürütür); araçlı kipte ajan ayrı iş parçacığında koşar, olaylar kuyrukla akar.
