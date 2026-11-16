# yz — model talimatları

## Bu temel ne yapar

Küçük dil modelleriyle (yerel ya da ucuz bulut) güvenilir uygulama yazmak için Python paketi `yz`:
tek arayüzlü sağlayıcı katmanı, şemaya uyan yapılı çıktı (katmanlı strateji + JSON onarımı),
araç kullanan ajan, belgeye soru sorma (RAG), görev kümesiyle ölçme ve model karşılaştırma,
kişisel veri maskeleme, MCP sunucusu ve sohbet sunucusu + tek dosyalık arayüz. Bütün testler
ağsız çalışır; model yerine `Sahte` sağlayıcı kullanılır.

## Komutlar

Hepsi bu klasörden (`havuz/yz`) çalışır.

| Komut | Ne yapar |
| --- | --- |
| `uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev]"` | Kurulum (dev: sunucu, mcp, belge, anthropic ekstraları dahil) |
| `uv pip install --python .venv/bin/python -r requirements.lock && uv pip install --python .venv/bin/python --no-deps -e .` | Kilit dosyasından birebir kurulum |
| `uv pip compile pyproject.toml --extra dev --extra e2e --python-version 3.11 --universal -o requirements.lock` | Bağımlılık değişince kilidi yeniden üret |
| `.venv/bin/python scripts/check.py` | **Tek komutluk denetim**: ruff + biçim + mypy + pytest (ağsız, ~1 dk) |
| `.venv/bin/python scripts/check.py --duzelt` | Önce otomatik düzeltilebilen lint/biçim hatalarını düzeltir |
| `.venv/bin/python -m pytest tests/test_x.py -q` | Tek test dosyası |
| `.venv/bin/python -m yz --yardim` | Komut satırı yardımı (Türkçe) |
| `.venv/bin/python -m yz sun --saglayici sahte` | Arayüzü modelsiz aç: http://127.0.0.1:8420 |
| `YZ_E2E=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium .venv/bin/python -m pytest tests/e2e` | Tarayıcı testi + ekran görüntüleri (önce `uv pip install -e ".[e2e]"`) |
| `YZ_CANLI=1 YZ_TABAN_URL=... YZ_MODEL=... .venv/bin/python -m pytest tests/test_canli.py` | Gerçek model ucuna karşı duman testi |

## Harita

| Şunu değiştireceksen | Şuraya bak |
| --- | --- |
| Model sunucusuna bağlanma, yeni sağlayıcı | `yz/saglayici/taban.py` (arayüz), `openai_uyumlu.py`, `openai_bicim.py` (tel biçimi), `kayit.py` (KURUCULAR) |
| Ayar dosyası alanları | `yz/ayar.py`, `yz.ornek.yaml` |
| Önbellek / günlük / maliyet / yeniden deneme | `yz/saglayici/onbellek.py`, `gunluk.py`, `maliyet.py`, `yeniden_dene.py` |
| Bozuk JSON onarımı | `yz/yapili/json_hosgorulu.py` (okuyucu), `json_onar.py` (aday seçimi) |
| Yapılı çıkarım katmanları | `yz/yapili/cikar.py`; şema düzeltmeleri ve hata iletileri `sema_araclari.py` |
| Örnek şemalar | `yz/yapili/semalar.py` |
| GBNF üretimi | `yz/yapili/gbnf.py` |
| Araç tanımı / izin / onay | `yz/arac/tanim.py`, `yz/arac/kutu.py`, `yz/ajan/onay.py` |
| Hazır araçlar | `yz/arac/hazir/` (hesap, zaman, dosya, sqlite, belge) |
| Ajan döngüsü, ReAct ayrıştırıcı, iş akışı | `yz/ajan/dongu.py`, `metin_kipi.py`, `is_akisi.py` |
| Belge yükleme, parçalama, arama | `yz/rag/yukleyici.py`, `parcala.py`, `bm25.py`, `gomme.py`, `dizin.py` |
| Kaynaklı yanıt, "belgede yok", uydurma denetimi | `yz/rag/yanit.py` |
| İstem metinleri (TR/EN) | `yz/istem/sablonlar.py` |
| Değerlendirme: puanlayıcı, görev türü, rapor | `yz/degerlendirme/puanlayici.py`, `kosu.py`, `rapor.py` |
| Kişisel veri maskeleme, süzgeçler | `yz/guvenlik/maske.py`, `dogrulama.py`, `suzgec.py` |
| MCP sunucusu / köprüsü | `yz/mcp/sunucu.py`, `yz/mcp/kopru.py` |
| Sunucu uçları | `yz/sunucu/uygulama.py`, `sohbet_ucu.py`, `vekil.py` |
| Arayüz ve metinleri | `yz/web/index.html`, `yz/web/sozluk.json` |
| Komut satırı | `yz/cli.py` (ayrıştırıcı), `yz/komutlar.py` (gövdeler) |
| Türkçe harf/kök/cümle işlemleri | `yz/metin.py` |

## Değişmez kurallar

1. Türkçe harf dönüşümü yalnız `yz.metin.kucuk_tr` / `buyuk_tr`; protokol sözcükleri için `kucuk_ascii`. `str.lower()/upper()` yasak — `tests/test_kurallar.py::test_turkce_harf_donusumu_yalniz_metin_modulunde`.
2. Her kaynak dosya Türkçe başlık yorumuyla açılır ve `Genişletme:` satırı içerir — `test_her_dosyanin_baslik_yorumu_var`.
3. `eval`/`exec`/`compile` yok; hesap için AST — `test_eval_exec_yok`, `tests/test_arac_hazir.py`.
4. Dosya ≤ 400 satır (hedef 300) — `test_dosya_uzunlugu`.
5. TODO, boş gövdeli işlev, yarım iş yok — `test_yarim_is_yok`.
6. Paket İÇİNDE her zaman tanımlandığı modülden içe aktar (`from yz.rag.gomme import KarmaGomme`), paket `__init__`'inden değil — `test_her_modul_temiz_durumdan_ice_aktarilir`.
7. Arayüz metni yalnız `yz/web/sozluk.json`'da; HTML'de `data-t="anahtar"` / `t("anahtar")` — `test_arayuz_sozlugu_eksiksiz`. Model ve kullanıcı metni HTML'e yalnız `textContent` ile basılır.
8. Her şablon iki dilde de (tr, en) aynı adla ve aynı değişkenlerle — `tests/test_istem.py::test_iki_dilde_ayni_sablonlar_ve_degiskenler`.
9. Kodda model adı, fiyat, adres yok; hepsi `yz.yaml`'da. Sırlar dosyaya yazılmaz, yalnız ortam değişkeni ADI — `test_ornek_ayar_dosyalari_sir_icermez`.
10. Günlüğe kişisel veri/sır yazılmaz (maskeli) — `tests/test_saglayici_ortak.py::test_gunluk_kisisel_veri_ve_sir_yazmaz`.
11. Dış girdi (model çıktısı dahil) güvenilmezdir: şemayla doğrulanır; araç hataları istisna değil gözlem olur — `tests/test_arac.py`, `tests/test_ajan.py`.
12. Tehlikeli araç onaysız çalışmaz (varsayılan ret) — `tests/test_arac.py::test_kutu_bilinmeyen_izinsiz_ve_onay`.
13. Testler ağsız; canlı testler `YZ_CANLI=1`, tarayıcı testleri `YZ_E2E=1` olmadan atlanır.
14. Örnek görev kümeleri 10–20 örnek ve biçim örneğidir; eğitim verisi yazılmaz — `tests/test_degerlendirme.py::test_ornek_gorev_kumeleri_gecerli`.

## Tarifler

### Yeni sağlayıcı ekle
Dosyalar: `ornekler/ollama_yerel.py` (kopyalanacak örnek), `yz/saglayici/kayit.py`, `yz.ornek.yaml`.
1. `ornekler/ollama_yerel.py`'yi `yz/saglayici/<ad>.py` olarak kopyalayın; `Saglayici`'dan türetin, `tur` adını verin, `_sohbet` (ve varsa `_sohbet_akisi`, `gom`, `modeller`) yazın. Tel biçimi OpenAI'ya benziyorsa `openai_bicim.yanit_coz` / `AkisBiriktirici`'yi kullanın.
2. `kayit.py`'de `_<ad>(ayar, anahtar, ortak)` kurucusunu yazıp `KURUCULAR`'a ekleyin (`# YENİ SAĞLAYICI BURAYA`).
3. `yz.ornek.yaml`'a bir profil örneği ekleyin.
4. Test: `tests/test_ornekler.py::test_ollama_yerel_istek_ve_yanit_bicimi` gibi `httpx.MockTransport` ile kayıtlı yanıt testi yazın.
Doğrulama: `.venv/bin/python scripts/check.py`.

### Yeni araç ekle
Dosyalar: `ornekler/kendi_aracim.py` (örnek), kendi modülünüz, `tests/`.
1. Tip ipuçlu bir işlev yazın; belge dizgisinin ilk paragrafı kısa eylem cümlesi, `Args:` bölümünde her parametre.
2. Hata durumunda istisna fırlatın (ileti modele gözlem olur). Dünyayı değiştiren araç: `Arac(islev, tehlikeli=True)`.
3. `Arac(islev)` ya da `@arac` ile sarın; `AracKutusu([...], onay=...)` ya da `Ajan(saglayici, [...])`'a verin.
4. Testte `arac.calistir({...})` ile hem başarılı hem hatalı argümanı sınayın.
Doğrulama: `.venv/bin/python -m pytest tests/test_ornekler.py -q` ve `scripts/check.py`.

### Kendi belgelerine soru sordur
1. `.venv/bin/python -m yz indeksle /yol/belgelerim` (dizin `.yz/dizin`'e yazılır).
2. `.venv/bin/python -m yz sor "Sorum?"` — yanıt, kaynaklar ve uyarılar (dayanaksız rakam/ad, enjeksiyon) yazılır.
3. Getirme kalitesini ölçün: `gorevler/getirme/sorular.jsonl` biçiminde 10+ soru yazıp `python -m yz sor --getirme-olc sorular.jsonl` (karma/bm25/vektor kiplerini karşılaştırır).
4. Anlamsal arama gerekiyorsa: yz.yaml'da `gomme_modeli` verip `indeksle --gomme saglayici --sifirla`.
Kod: `RagHatti(RagDizini.yukle(".yz/dizin"), saglayici).sor("...")`.

### Yeni çıkarım şeması
1. `yz/yapili/semalar.py`'deki bir sınıfı kopyalayın (≤ 8 alan, her alana `Field(description=...)`, sabit seçenek için `Literal`, olmayabilecek alan `X | None = None`).
2. Deneyin: `.venv/bin/python -m yz cikar --sema yz.yapili.semalar:YeniSema --metin "..."` (rapor stderr'e yazılır).
3. llama.cpp kullanıyorsanız dilbilgisini görün: `... cikar --sema ... --gbnf`.
4. Kural testi: `tests/test_yapili.py::test_ornek_semalar_kucuk_model_kurallarina_uyar`.

### Yeni değerlendirme kümesi
1. `gorevler/siniflandirma.yaml` + `.jsonl`'yi kopyalayın. JSONL satırı: `{"kimlik", "girdi", "beklenen", ...ek alanlar}` (ek alanlar istemde `{alan}` olarak kullanılabilir).
2. YAML'da `gorev` (sohbet/cikarim/arac/rag), `istem`, `puanlayicilar` (tam_eslesme, icerme, duzenli_ifade, json_sema, sayisal, gomme_benzerligi, hakem) seçin.
3. `.venv/bin/python -m yz degerlendir gorevler/yeni.yaml --saglayici sahte --sinir 3` ile biçimi doğrulayın; sonra gerçek modelle koşun.
4. Gerileme: `degerlendir ... --onceki .yz/kosular/<önceki-klasör>`.

### İki modeli karşılaştır
1. İki profil tanımlayın (yz.yaml) ya da aynı sunucuda iki model adı kullanın.
2. `.venv/bin/python -m yz karsilastir gorevler/json_cikarim.yaml --modeller qwen2.5:0.5b qwen2.5:1.5b` ya da `--saglayicilar ollama openrouter`.
3. Tekrar koşularda ücret ödememek için `--onbellek`. Maliyet sütunu için yz.yaml `fiyatlar`'ı doldurun.
4. Tablo ve kayıtlar `.yz/kosular/karsilastirma-<ad>-<zaman>/` altında.

### Ollama'ya / `havuz/dil-modeli` sunucusuna bağlan
1. Ollama: `ollama serve`, `ollama pull <model>`; yz.yaml'da `ollama` profili (`taban_url: http://localhost:11434/v1`). Bağlam uzunluğu için Ollama'ya özgü alan gerekiyorsa `ornekler/ollama_yerel.py`.
2. `havuz/dil-modeli`: o temelin sunucusunu kendi talimatıyla başlatın (kapı 8430); yz.yaml'daki `dil_modeli` profili (`taban_url: http://localhost:8430/v1`, `yapili_kip: kapali`).
3. `.venv/bin/python -m yz modeller --saglayici <profil>` ile bağlantıyı ve model adını doğrulayın.

### MCP aracını bir kod ajanına bağla
Ayrıntı: `docs/MCP.md`. Kısaca stdio: komut `<bu klasör>/.venv/bin/python`, argümanlar `-m yz mcp --klasor <belge klasörü>`. HTTP: `python -m yz mcp --http --kapi 8421` → `http://127.0.0.1:8421/mcp`. Yeni araç yayımlamak için `mcp_sunucusu_kur(ek_araclar=[...])`.

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `ImportError: ... partially initialized module` | Paket içinde `from yz.rag import X` gibi paket `__init__`'inden içe aktarma | Tanımlandığı modülden alın: `from yz.rag.dizin import RagDizini` |
| Kural testi: "Yasaklı harf dönüşümü" | `.lower()` / `.upper()` kullanıldı | `kucuk_tr` (Türkçe metin) ya da `kucuk_ascii` (protokol sözcüğü) |
| `Sahte sağlayıcının betiği bitti` | Testteki betik, kodun yaptığı çağrı sayısından kısa | Betiğe yanıt ekleyin ya da döngünün neden fazladan çağrı yaptığına bakın |
| `DesteklenmiyorHatasi` (response_format/tools) | Sunucu yapılı çıktıyı ya da araçları desteklemiyor | Beklenen durum: `cikar` sonraki katmana, `Ajan` metin kipine geçer; yz.yaml'da `yapili_kip: kapali` ile hiç denememek de mümkün |
| Çıkarım "tarih YYYY-AA-GG" hatasında takılıyor | Model tarihi farklı biçimde yazıyor | `sema_araclari.tarih_iso` zaten çevirir; yeni biçimse oraya ekleyin + test |
| `404 ... python -m yz modeller` | Model adı yanlış | `python -m yz modeller` çıktısındaki adı yz.yaml'a yazın |
| Arayüz 401 veriyor | `YZ_SUNUCU_ANAHTARI` tanımlı | Arayüzde anahtarı girin ya da başlıkta `Authorization: Bearer <anahtar>` |
| `mypy`: "Returning Any" | `sohbet(**sozluk)` dönüşü `Any` | Değişkene tip verin: `yanit: Yanit = saglayici.sohbet(...)` |
| RAG "belgede yok" diyor ama bilgi var | İlgililik eşiği/sözcük uyumsuzluğu | `sor --kip bm25` ve `--getirme-olc` ile ölçün; `RagHatti(asgari_benzerlik=...)` ya da `--gomme saglayici` |

## Bitti tanımı

- [ ] `.venv/bin/python scripts/check.py` yeşil (ağsız, ~2 dakikanın altında)
- [ ] Yeni kod için `Sahte` sağlayıcıyla çevrimdışı test var (mutlu yol + en az bir hata yolu)
- [ ] Yeni dosyanın başlık yorumu ve `Genişletme:` satırı var
- [ ] Kayıt dosyalarında (`KURUCULAR`, `PUANLAYICILAR`, `_KATMAN_ISLEVLERI`, `OKUYUCULAR`, `_KIPLER`) yeni öğe `BURAYA` yorumunun üstünde
- [ ] Kullanıcıya dönük ileti Türkçe ve ne yapılacağını söylüyor
- [ ] Doğrulanmamış bilgi (model adı, fiyat, sürüm) "doğrulanmadı" diye işaretli; README "Sınırlar" güncel
- [ ] Arayüz değiştiyse: `tests/e2e` koşuldu, `docs/ekran/` görüntüleri yenilendi
