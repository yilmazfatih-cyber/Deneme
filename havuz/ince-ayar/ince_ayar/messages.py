"""Sözlük: kullanıcının gördüğü bütün Türkçe iletiler tek yerde durur.

Kim kullanır: paketin her yeri `t("anahtar", ad=deger)` ile ileti üretir; tablo başlıkları için
`headers("anahtar")`. Komut satırı yardım metinleri de buradadır (`yardim.*` anahtarları).
Bu dosya veridir; 300 satır sınırı ona uygulanmaz (kural testinde istisna olarak yazılıdır).

Kurallar (`tests/test_rules.py` denetler):
- Kodda kullanılan her anahtar burada vardır; burada olup kullanılmayan anahtar kalmaz.
- İletideki `{yer_tutucu}` adları çağrıdaki anahtar sözcüklerle aynıdır.
- İleti suçlamaz, ne yapılacağını söyler.

Genişletme: yeni ileti için ilgili bölüme satır ekleyin; anahtar `bolum.ad` biçimindedir.
"""

from __future__ import annotations

MESSAGES: dict[str, str] = {
    # ───────────── dosya okuma ─────────────
    "dosya.yok": "Dosya bulunamadı: {yol}. Yolu ve çalıştığınız klasörü denetleyin.",
    "dosya.kodlama": (
        "{yol} dosyası {kodlama} olarak okunamadı (büyük olasılıkla Windows-1254). Excel'de "
        "'CSV UTF-8' olarak yeniden kaydedin ya da `--kodlama cp1254` verin."
    ),
    "dosya.uzanti": "{yol}: desteklenen uzantılar .jsonl, .csv ve .tsv.",
    "dosya.json_bozuk": "{yol} geçerli JSON değil ({ayrinti}).",
    # ───────────── veri doğrulama (satır hataları) ─────────────
    "veri.json_gecersiz": "geçerli JSON değil ({ayrinti}); her satır tek bir JSON nesnesi olmalı",
    "veri.json_nesne_degil": "satır bir JSON nesnesi olmalı ({{…}} ile başlayıp bitmeli)",
    "veri.csv_fazla_sutun": "başlıktakinden fazla sütun var (metindeki ayırıcıyı tırnak içine alın)",
    "veri.okunamadi": "satır okunamadı",
    "veri.bos_metin": "boş olamaz",
    "veri.sohbet.sistem_yeri": "`messages[{sira}]`: system iletisi yalnız en başta olabilir",
    "veri.sohbet.sira": (
        "`messages[{sira}]` rolü {beklenen} olmalı (roller user/assistant diye sırayla gider); "
        "şu an: {bulunan}"
    ),
    "veri.sohbet.son_asistan": "`messages` son öğesi asistan olmalı (şu an: {bulunan})",
    "veri.gomme.bos_olumsuz": "`olumsuz` içinde boş metin var",
    "veri.gomme.olumsuz_esit": "`olumsuz` metni `olumlu` ile aynı olamaz",
    "veri.varlik.uzunluk": (
        "`sozcukler` ({sozcuk}) ile `etiketler` ({etiket}) aynı uzunlukta olmalı"
    ),
    "veri.varlik.bicim": "`etiketler[{sira}]` = '{etiket}': etiket 'O', 'B-AD' ya da 'I-AD' olmalı",
    "veri.varlik.sira": (
        "`etiketler[{sira}]` = '{etiket}': 'I-' etiketi aynı türden 'B-' ya da 'I-' ardından gelir"
    ),
    # ───────────── veri doğrulama (dosya düzeyi) ─────────────
    "veri.bos_dosya": "{yol} içinde hiç örnek yok.",
    "veri.daha_fazla_hata": "… ve {sayi} hata daha",
    "veri.hatali": "{yol} içinde {sayi} hata var; düzeltip yeniden deneyin:\n  {liste}",
    "veri.baska_bicim": (
        "Dosya başka bir biçimde görünüyor (alanlar: {alanlar}). Önce çevirin: "
        "`python -m ince_ayar veri donustur --kaynak-bicim alpaca --girdi … --cikti …`"
    ),
    "veri.alan_adlari": "Alan adları {gereken} olmalı; dosyadaki alanlar: {bulunan}.",
    # ───────────── veri uyarıları ─────────────
    "veri.uyari.benzerleri": "… bu türden {sayi} uyarı daha var",
    "veri.uyari.yinelenen": "{ilk}. satırla aynı (yinelenen örnek)",
    "veri.uyari.bosluk": "asistan yanıtının başında/sonunda boşluk var; kırpmanız önerilir",
    "veri.uyari.tek_sinif": "Veride tek sınıf var ('{etiket}'); sınıflandırıcı en az iki sınıf ister.",
    "veri.uyari.az_ornek": (
        "'{etiket}' sınıfında yalnız {sayi} örnek var; bu sınıf doğrulamada ölçülemez."
    ),
    "veri.uyari.dengesiz": (
        "Sınıflar dengesiz: '{buyuk}' {buyuk_sayi} örnek, '{kucuk}' {kucuk_sayi} örnek. "
        '`[egitim] dengesizlik = "agirlikli-kayip"` deneyin ve doğruluğa değil makro F1\'e bakın.'
    ),
    "veri.uyari.etiket_yazimi": (
        "Bu etiketler yalnız harf büyüklüğüyle ayrışıyor, aynı sınıf olabilir: {etiketler}"
    ),
    "veri.uyari.celisen_etiket": (
        "{ilk}. satırla aynı metin ama etiket farklı ('{etiket}' ↔ '{ilk_etiket}')"
    ),
    "veri.uyari.sorgu_esit_olumlu": "sorgu ile olumlu metin aynı; model bundan bir şey öğrenmez",
    "veri.uyari.varlik_yok": "Hiçbir örnekte varlık etiketi yok (hepsi 'O').",
    # ───────────── ayrım ─────────────
    "ayrim.egitim_orani": "Eğitim oranı sıfırdan büyük olmalı.",
    "ayrim.bos": "Bölünecek örnek yok.",
    "ayrim.az_grup": (
        "Veri {parca} parçaya bölünemiyor: yinelemeler ve gruplar birleşince yalnız {grup} "
        "bağımsız grup kaldı. Daha fazla (farklı) örnek ekleyin."
    ),
    "ayrim.etiket_egitime": "'{etiket}' sınıfı eğitimde hiç kalmıyordu; bir grubu eğitime alındı.",
    # ───────────── uzunluk istatistikleri ─────────────
    "istatistik.kirpma": (
        "UYARI: {sayi} örnek ({oran}) azami uzunluğu ({sinir} belirteç) aşıyor. Örneklerin "
        "%99'unu sığdırmak için azami uzunluğu {oneri} yapın."
    ),
    "istatistik.sigiyor": "Bütün örnekler azami uzunluğa ({sinir} belirteç) sığıyor.",
    # ───────────── yapılandırma ─────────────
    "ayar.hazir_yok": (
        "'{hazir}' hazır ayarı '{gorev}' görevi için bulunamadı. Seçenekler: {secenekler}."
    ),
    "ayar.ikisi_birden": "`--ayar` ve `--hazir` birlikte verilemez; birini seçin.",
    "ayar.eksik": (
        "Yapılandırma gerekli: `--hazir cpu-deneme` ya da `--ayar yapilandirma/{gorev}/….toml` verin."
    ),
    "ayar.degistir_bicim": "`-D` değeri 'bolum.anahtar=deger' biçiminde olmalı; verilen: {girdi}",
    "ayar.toml_bozuk": "{yol} geçerli TOML değil: {ayrinti}",
    "ayar.gecersiz": "{yol} yapılandırması geçersiz:\n  {liste}",
    # ───────────── donanım ─────────────
    "donanim.duyarlik_yedek": (
        "{istenen} duyarlığı istendi ama aygıt {aygit}; fp32 ile sürülüyor (yalnız daha yavaş)."
    ),
    "donanim.bf16_yok": "{aygit} gerçek bf16 desteklemiyor; fp16 kullanılıyor.",
    "donanim.dort_bit_gpu": (
        "4-bit yükleme CUDA'lı bir GPU ister; bu ortamda aygıt: {aygit}. `-D model.dort_bit=false` "
        "ile çalıştırın ya da komutu GPU'lu bir ortamda (Colab/Kaggle) koşturun."
    ),
    "donanim.dort_bit_paket": (
        "4-bit yükleme için `bitsandbytes` paketi gerekli: `pip install bitsandbytes`."
    ),
    # ───────────── sohbet: şablon ve kayıp maskesi ─────────────
    "sohbet.sablon_yok": (
        "Bu modelin tokenizer'ında sohbet şablonu yok (taban model bir sohbet modeli olmayabilir). "
        "Bir sohbet/instruct modeli seçin ya da `[model] sohbet_sablonu` ile .jinja dosyası verin."
    ),
    "sohbet.sablon_hatasi": (
        "Sohbet şablonu bu örneği kabul etmedi: {ayrinti}. Bazı modeller system rolünü ya da "
        "art arda aynı rolü desteklemez; veriyi şablona uygun hâle getirin."
    ),
    "sohbet.hizalama": (
        "Sohbet şablonu `messages[{sira}]` asistan içeriğini değiştirerek yazıyor; kayıp maskesi "
        "güvenle kurulamadı. Örneği çıkarın ya da içeriği sadeleştirin."
    ),
    "sohbet.hizli_tokenizer": (
        "Bu tokenizer 'hızlı' (tokenizers tabanlı) değil; kayıp maskesi karakter konumlarına "
        "dayandığı için hızlı tokenizer gerekir."
    ),
    "sohbet.maske_dogrulanamadi": (
        "Kayıp maskesi doğrulanamadı: etiketlenen belirteçler asistan yanıtını vermiyor."
    ),
    # ───────────── komut satırı ─────────────
    "cli.kesildi": "Durduruldu (Ctrl+C). Eğitimi kaldığı yerden sürdürmek için aynı komuta `--surdur` ekleyin.",
    "cli.yardim_ipucu": "Yardım için: {komut} --yardim",
    # ───────────── model yükleme ─────────────
    "model.klasor_yok": (
        "{yol} içinde model bulunamadı (config.json ya da adapter_config.json yok). Eğitimin "
        "`cikti` klasörünü ya da model klasörünü verin."
    ),
    "model.taban_bilinmiyor": "{yol} bağdaştırıcısının taban modeli bulunamadı; `--taban` ile verin.",
    "model.yuklenemedi": (
        "Model yüklenemedi: {model}. Kimliği/yolu, ağ erişimini ve (onaylı modellerde) "
        "`huggingface-cli login` girişini denetleyin. İndirme takılıyorsa `HF_HUB_DISABLE_XET=1` "
        "ortam değişkeniyle yeniden deneyin. Ayrıntı: {ayrinti}"
    ),
    # ───────────── eğitim ─────────────
    "egitim.basliyor": "Eğitim başlıyor · aygıt: {aygit} · CPU iş parçacığı: {is_parcacigi}",
    "egitim.bitti": "Bitti. Model: {yol}\nRapor: {rapor}",
    "egitim.degerlendirme": "adım {adim} · doğrulama kaybı {kayip}",
    "egitim.ilerleme": "adım {adim}/{toplam} · kayıp {kayip} · öğrenme oranı {oran}",
    "egitim.kaydedildi": "Koşu dosyaları yazıldı: {yol}",
    "ayrim.sizinti": (
        "Doğrulama dosyasındaki {toplam} örnekten {sayi} tanesi eğitimdekine çok benziyor "
        "(sızıntı); ölçütler iyimser çıkar. `python -m ince_ayar veri sizinti` ile inceleyin."
    ),
    # ───────────── plan (kuru çalıştırma) ─────────────
    "plan.baslik": "Eğitim planı ({gorev})",
    "plan.kuru_bitti": "Kuru çalıştırma: eğitim başlatılmadı. Gerçek eğitim için `--kuru` olmadan çalıştırın.",
    "plan.uyarilar": "Uyarılar:",
    "plan.lora": "LoRA (r={r}, alpha={alpha}, hedef={hedef})",
    "plan.tam_ince_ayar": "Tam ince ayar (bütün ağırlıklar eğitilir)",
    "plan.ornek_sayilari": "eğitim {egitim} · doğrulama {dogrulama} · uzunluk nedeniyle atılan {atilan}",
    "plan.ornek_uclu": "eğitim {egitim} · doğrulama {dogrulama} · test {test}",
    "plan.adim_ayrinti": "{adim} güncelleme adımı · etkin yığın {yigin} · öğrenme oranı {oran}",
    "plan.hedef_kart": "{gb} GB'lık GPU (hazır ayarın hedefi; bu aygıtta ölçülmedi)",
    "plan.bellek_aralik": "≈ {dusuk}–{yuksek} GB (tahmin, ölçüm değil)",
    "plan.bellek_yok": "Bellek tahmini yapılamadı (model yapılandırması okunamadı): {ayrinti}",
    "plan.sigar": "→ {gb} GB'a sığar",
    "plan.sinirda": (
        "→ {gb} GB'ta sınırda: bellek hatası alırsanız yığını yarıya indirip biriktirmeyi iki "
        "katına çıkarın"
    ),
    "plan.sigmaz": (
        "→ {gb} GB'a SIĞMAZ: yığını küçültüp biriktirmeyi büyütün, azami uzunluğu kısaltın ya da "
        "`dort_bit = true` deneyin"
    ),
    "plan.satir.gorev": "Görev",
    "plan.satir.taban": "Taban model",
    "plan.satir.yontem": "Yöntem",
    "plan.satir.aygit": "Aygıt / duyarlık",
    "plan.satir.ornek": "Örnek",
    "plan.satir.etiketler": "Etiketler",
    "plan.satir.dengesizlik": "Dengesizlik yöntemi",
    "plan.satir.adim": "Adım",
    "plan.satir.cikti": "Çıktı klasörü",
    "plan.satir.hedef": "Bellek hedefi",
    "plan.satir.egitilen": "Eğitilen parametre",
    "plan.satir.agirlik": "Bellek: ağırlıklar",
    "plan.satir.egitilen_bellek": "Bellek: eğitilenler (+gradyan, AdamW)",
    "plan.satir.etkinlestirme": "Bellek: etkinleştirmeler",
    "plan.satir.sabit": "Bellek: sabit pay",
    "plan.satir.toplam": "Bellek: toplam",
    "plan.satir.varsayim": "Varsayımlar",
    # ───────────── rapor ─────────────
    "rapor.baslik": "İnce ayar raporu: {gorev}",
    "rapor.ozet": "Özet",
    "rapor.ozet_basliklari": "alan|değer",
    "rapor.egri": "Kayıp eğrisi",
    "rapor.egri_adlari": "eğitim kaybı|doğrulama kaybı",
    "rapor.egri_yok": "Kayıp kaydı yok (çok kısa koşu).",
    "rapor.ornekler": "Eğitim sırasında örnek üretimler",
    "rapor.ornek_basliklari": "adım|girdi|beklenen|üretilen",
    "rapor.uyarilar": "Uyarılar",
    "rapor.dipnot": (
        "Bu rapor ince_ayar tarafından üretildi; ölçümler yalnız bu koşunun doğrulama/test "
        "kümesine aittir."
    ),
    # ───────────── doğrulama komutları ─────────────
    "dogrula.ozet": "{dosya}: {egitim} eğitim + {dogrulama} doğrulama örneği",
    "dogrula.ayrim": (
        "Ayrım: {grup} bağımsız grup · {tam} tam yineleme · {yakin} yakın yineleme çifti "
        "(aynı tarafa konuldu)"
    ),
    "dogrula.tokenizer_yok": "Belirteç istatistiği atlandı (tokenizer yüklenemedi): {ayrinti}",
    "dogrula.maske_baslik": (
        "İlk eğitim örneğinin kayıp maskesi (⟦…⟧ içi öğrenilir, gerisi yalnız bağlamdır):"
    ),
    "dogrula.tamam": "Doğrulama tamam.",
    "istatistik.baslik": "Belirteç uzunlukları ({ad})",
    # ───────────── sohbet: veri ─────────────
    "sohbet.uzun_atildi": (
        "{ad}: {sayi} örnek {sinir} belirteci aştığı için çıkarıldı (kırpılsaydı yanıt yarım "
        "kalırdı). Hepsini almak için `-D veri.azami_uzunluk={oneri}`."
    ),
    "sohbet.uzun_hata": (
        "{ad}: {sayi} örnek {sinir} belirteci aşıyor (satırlar: {satirlar}). "
        "`-D veri.azami_uzunluk={oneri}` verin ya da örnekleri kısaltın."
    ),
    "sohbet.hepsi_uzun": (
        "{ad} kümesindeki örneklerin hiçbiri {sinir} belirtece sığmıyor; `[veri] azami_uzunluk` "
        "değerini büyütün."
    ),
    "sohbet.kapanis_yok": (
        "Sohbet şablonu asistan yanıtını özel bir bitiş belirteciyle kapatmıyor; model durmayı zor "
        "öğrenebilir. Üretimde `--azami-yeni` ile sınırlayın."
    ),
    "sohbet.birlesen_baslangic": (
        "Bazı örneklerde yanıtın ilk belirteci istemin son karakteriyle birleşiyor; o belirteç "
        "bağlam sayıldı (etkisi küçüktür)."
    ),
    "sohbet.ozel_belirtec_metni": (
        "{sayi} örneğin metninde özel belirteç yazısı (ör. <|im_end|>) geçiyor; şablonu bozabilir, "
        "temizleyin."
    ),
    # ───────────── değerlendirme ─────────────
    "degerlendirme.veri_yok": (
        "Değerlendirilecek örnek yok: doğrulama dosyası verilmemiş ve ayrımda doğrulama payı boş "
        "kaldı. `--veri dosya.jsonl` verin."
    ),
    "degerlendirme.kaydedildi": "Değerlendirme sonucu yazıldı: {yol}",
    # ───────────── birleştirme ve dışa aktarım ─────────────
    "birlestir.bagdastirici_degil": (
        "{yol} içinde LoRA bağdaştırıcısı (adapter_config.json) yok; bu zaten tam bir model. "
        "Birleştirmeye gerek yok: doğrudan `disa-aktar` çalıştırın."
    ),
    "birlestir.basliyor": "Birleştiriliyor: taban {taban} + bağdaştırıcı {bagdastirici}",
    "birlestir.dogrulama": (
        "Doğrulama: birleşik model ile bağdaştırıcılı model arasındaki en büyük logit farkı {fark}"
    ),
    "birlestir.bitti": "Birleştirilmiş model kaydedildi: {yol}",
    "birlestir.dusuk_duyarlik": (
        "Model {duyarlik} duyarlıkta birleştirildi; bu duyarlıkta ~1 logite varan farklar "
        "yuvarlamadan beklenir (hata değildir). Tam karşılaştırma için `--duyarlik fp32` kullanın."
    ),
    "disa.once_birlestir": (
        "{yol} bir LoRA bağdaştırıcısı; GGUF için önce birleştirin: "
        "`python -m ince_ayar sohbet birlestir --model {yol} --cikti ciktilar/birlesik`"
    ),
    "disa.tur_gecersiz": (
        "GGUF türü '{tur}' desteklenmiyor. Seçenekler: {secenekler}. Daha küçük nicemler "
        "(Q4_K_M) için `--nicem` kullanın."
    ),
    "disa.llama_cpp_yok": (
        "llama.cpp bulunamadı; GGUF üretilmedi (yalnız Modelfile yazılıyor). Edinmek için: "
        "`git clone https://github.com/ggml-org/llama.cpp` sonra `--llama-cpp llama.cpp` verin "
        "ya da {ortam} ortam değişkenini ayarlayın."
    ),
    "disa.donusturucu_ipucu": (
        "Dönüştürücünün Python paketleri eksik olabilir. llama.cpp'nin gereksinim dosyası "
        "transformers'ı eski bir sürüme sabitler; bu ortamı bozmamak için yalnız eksik olanı kurun "
        "(ör. `pip install sentencepiece`) ya da ayrı bir ortamda `pip install -r {gereksinim}`."
    ),
    "disa.komut_basarisiz": "Komut {kod} çıkış koduyla başarısız oldu. {ipucu}",
    "disa.nicem_yok": (
        "{nicem} nicemlemesi için derlenmiş `llama-quantize` gerekli (llama.cpp içinde "
        "`cmake -B build && cmake --build build --target llama-quantize`). Şimdilik dönüştürülen "
        "GGUF kullanılıyor."
    ),
    "disa.nicem_ipucu": "llama-quantize çalışmadı; nicem adını (ör. Q4_K_M) ve llama.cpp derlemesini denetleyin.",
    "disa.lisans_notu": (
        "Bu model {model} klasöründen üretildi. Lisansı taban modelin ve eğitim verisinin "
        "lisansına bağlıdır; dağıtmadan önce ikisini de denetleyin."
    ),
    "disa.gguf_ozet": (
        "GGUF: {yol} · mimari {mimari} · {tensor_sayisi} tensör · sözlük {sozluk} · "
        "şablon var: {sohbet_sablonu_var} · {boyut_mb} MB"
    ),
    "disa.bitti": (
        "Modelfile yazıldı: {modelfile} (şablon ailesi: {aile}). Ollama'da, Modelfile'ın "
        "klasöründe: `ollama create {ad} -f Modelfile` ve `ollama run {ad}` (bu makinede denenmedi)."
    ),
    "onnx.aktariliyor": "ONNX'e aktarılıyor: {yol}",
    "onnx.bitti": "ONNX hazır: {yol} · PyTorch ile en büyük fark {fark}",
    "onnx.int8_sonuc": "int8: en büyük fark {fark} · PyTorch kararlarıyla uyum {uyum}",
    "onnx.on_islem_atlandi": "int8 öncesi şekil çıkarımı atlandı ({ayrinti}); nicemleme yine yapılıyor.",
    "onnx.klasor_yok": "{yol} içinde model.onnx yok; önce `disa-aktar` çalıştırın.",
    "onnx.dosya_yok": "{yol} bulunamadı; önce `disa-aktar` çalıştırın (int8 için `[disa_aktarim] int8 = true`).",
    # ───────────── tahmin ─────────────
    "tahmin.girdi_yok": "Tahmin için girdi yok: `--mesaj`/`--metin` ya da `--girdi dosya` verin.",
    "tahmin.satir_atlandi": "{satir}. satır atlandı (beklenen alan yok).",
    "tahmin.yazildi": "{sayi} tahmin yazıldı: {yol}",
    # ───────────── sınıflandırma ─────────────
    "siniflandirma.tek_sinif": "Eğitim kümesinde tek sınıf var; sınıflandırıcı en az iki sınıf ister.",
    "siniflandirma.bilinmeyen_etiket": (
        "Doğrulama/test kümesinde eğitimde hiç görülmeyen etiket var: {etiketler}. Bu etiketlerden "
        "eğitim verisine örnek ekleyin."
    ),
    "siniflandirma.test_yok": (
        "Test kümesi yok: eşik ve rapor aynı doğrulama kümesinde; sonuç iyimserdir. `test_orani` verin."
    ),
    "siniflandirma.rapor_baslik": "Değerlendirme ({kume}, {ornek} örnek)",
    "siniflandirma.kapsama": (
        "Güven eşiği {esik}: örneklerin {kapsama} kadarı yanıtlanıyor; yanıtlananlarda doğruluk {dogruluk}"
    ),
    # ───────────── gömme ve varlık tanıma ─────────────
    "gomme.dogrulama_yok": (
        "Değerlendirme için doğrulama çifti yok; `dogrulama_orani` değerini büyütün ya da "
        "`[veri] dogrulama` dosyası verin."
    ),
    "gomme.derlem": "{sorgu} sorgu, {belge} belgelik derlemde arandı.",
    "gomme.dogrula_ozet": (
        "{egitim} eğitim çifti ({olumsuz} tanesinde zor olumsuz var) · {dogrulama} doğrulama sorgusu "
        "· derlemde {belge} belge"
    ),
    "gomme.arama_girdi_yok": "En az bir `--sorgu` ve boş olmayan bir `--belgeler` dosyası verin.",
    "gomme.sorgu_basligi": "Sorgu: {sorgu}",
    "varlik.dogrula_ozet": "{egitim} eğitim + {dogrulama} doğrulama cümlesi · varlık türleri: {turler}",
    # ───────────── veri araçları ─────────────
    "veri.gecerli": "{yol}: {sayi} geçerli örnek.",
    "veri.ayrildi": "Ayrıldı: {boyutlar} · {grup} bağımsız grup · {yol}",
    "veri.sizinti_sonuc": "Test dosyasındaki {toplam} örnekten {sayi} tanesi eğitimdekine çok benziyor (sızıntı).",
    "veri.kart_uzunluk": (
        "Belirteç uzunluğu modele bağlıdır: görevin `dogrula` komutunun çıktısını buraya ekleyin."
    ),
    "veri.kart_yazildi": "Veri kartı yazıldı: {yol}. **DOLDURUN** yazan yerleri tamamlayın.",
    "veri.donusturuldu": (
        "{sayi} satır çevrildi: {yol}. Şimdi denetleyin: "
        "`python -m ince_ayar veri dogrula --bicim sohbet --girdi {yol}`"
    ),
    "donustur.alan_yok": "Satırda `{alan}` alanı yok ya da biçimi beklenenden farklı.",
    "donustur.rol_bilinmiyor": "Tanınmayan konuşmacı rolü: {rol} (beklenen: human, gpt, system).",
    # ───────────── sentetik veri ─────────────
    "uret.tarif_uyusmaz": "'{gorev} uret' komutu '{beklenen}' tarifini bekliyor; yapılandırmadaki tarif '{bulunan}'.",
    "uret.tohum_bos": "`konu` ya da `belge` alanlarından en az biri dolu olmalı.",
    "uret.belge_gerekli": "Bu tarif `belge` alanı ister (sorgular belgeden üretilir).",
    "uret.kimlik_yineleniyor": "`kimlik` '{kimlik}' birden çok satırda var; her tohumun kimliği benzersiz olmalı.",
    "uret.tohum_hatali": "{yol} tohum dosyasında hata var:\n  {liste}",
    "uret.kuru": "Kuru çalıştırma: {tohum} tohum, istem sürümü {surum} ({ozet}). İlk istem:",
    "uret.ilerleme": "tohum {sira}/{toplam} · kabul edilen toplam {kabul}",
    "uret.bitti": (
        "Üretim bitti: {istek} istek → {aday} aday → {kabul} kabul. Ret nedenleri: {ret}\n"
        "Veri: {cikti}\nReddedilenler: {reddedilen}\nKayıt: {kayit}\n"
        "Eğitimden önce örneklerin bir kısmını gözle okuyun ve `dogrula` çalıştırın."
    ),
    "uret.istek_reddedildi": (
        "Öğretmen sunucusu isteği reddetti (HTTP {kod}): {govde}. Model adını (`ollama list`) ve "
        "uç noktayı denetleyin."
    ),
    "uret.yanit_bicimi": "Öğretmen sunucusunun yanıtı OpenAI biçiminde değil: {ayrinti}",
    "uret.ulasilamadi": (
        "Öğretmen sunucusuna ulaşılamadı: {adres} ({deneme} deneme; son sorun: {sorun}). "
        "Sunucu çalışıyor mu (ör. `ollama serve`)?"
    ),
    "uret.lisans.ticari_degil": (
        "Öğretmen lisansı '{lisans}' ticari kullanıma kapalı: bu modelle üretilen veri ticari bir "
        "üründe kullanılamaz. Ticari olmayan bir iş içinse `[ogretmen] ticari_olmayan_kullanim = "
        "true` ile onaylayın; değilse Apache-2.0/MIT lisanslı bir öğretmen seçin."
    ),
    "uret.lisans.ticari_degil_onayli": (
        "Ticari olmayan kullanım onaylandı: '{lisans}' lisanslı öğretmenin verisi yalnız ticari "
        "olmayan işte kullanılabilir."
    ),
    "uret.lisans.kosullu": (
        "Öğretmen lisansı '{lisans}' modele özel/koşullu. Çıktıların başka bir modeli eğitmekte ve "
        "ticari kullanımı kısıtlanmış olabilir: lisans metnini okuyun (doğrulanmadı)."
    ),
    "uret.lisans.katalogda_yok": (
        "'{kimlik}' katalogda yok; lisans çapraz denetimi yapılamadı. Önce `katalog/modeller.yaml` "
        "dosyasına ekleyip `scripts/katalog_dogrula.py` ile doğrulayın."
    ),
    "uret.lisans.uyusmaz": (
        "'{kimlik}' için katalogdaki lisans '{katalog}', yapılandırmadaki '{ayar}'. Lisansı model "
        "kartından denetleyip düzeltin."
    ),
    # ───────────── damıtma ─────────────
    "damitma.sozluk_farkli": (
        "Öğretmen ve öğrenci aynı tokenizer'ı (aynı belirteç sözlüğünü) kullanmıyor; logitler "
        "eşlenemez. Aynı aileden iki model seçin (ör. Qwen/Qwen3-1.7B → Qwen/Qwen3-0.6B)."
    ),
    # ───────────── katalog ─────────────
    "katalog.gecersiz": "{yol} katalog şemasına uymuyor:\n  {liste}",
    "katalog.okunamadi": "{yol} okunamadı: {ayrinti}",
    # ───────────── yardım: genel ve görevler ─────────────
    "yardim.genel": (
        "Açık modelleri ince ayarlama aracı. Önce görevi, sonra eylemi seçin. Her eylemin kendi "
        "yardımı vardır: python -m ince_ayar sohbet egit --yardim"
    ),
    "yardim.genel_ornek": (
        "örnekler:\n"
        "  python -m ince_ayar sohbet dogrula --hazir cpu-deneme\n"
        "  python -m ince_ayar sohbet egit --hazir colab-t4 --kuru\n"
        "  python -m ince_ayar siniflandirma egit --hazir cpu-deneme\n"
        "  python -m ince_ayar veri ayir --bicim sohbet --girdi veri.jsonl --cikti veri/bolunmus"
    ),
    "yardim.gorev.sohbet": "sohbet/talimat ince ayarı (nedensel dil modeli + LoRA)",
    "yardim.gorev.sohbet_aciklama": (
        "Sohbet modeli ince ayarı: modelin kendi sohbet şablonu, kayıp yalnız asistan yanıtlarında, "
        "LoRA (isteğe bağlı 4-bit), birleştirme, GGUF ve Ollama Modelfile."
    ),
    "yardim.gorev.siniflandirma": "metin sınıflandırma (kodlayıcı model, ONNX'e aktarım)",
    "yardim.gorev.siniflandirma_aciklama": (
        "Metin sınıflandırma: katmanlı sızıntısız ayrım, dengesizlik seçenekleri, makro F1, "
        "karışıklık matrisi, eşik ayarı, ONNX (+int8) ve onnxruntime ile CPU çıkarımı."
    ),
    "yardim.gorev.gomme": "gömme (embedding) modelini alana uydurma",
    "yardim.gorev.gomme_aciklama": (
        "Gömme ince ayarı: (sorgu, olumlu[, olumsuz]) çiftleriyle karşıtsal eğitim, recall@k ve "
        "MRR ile önce/sonra ölçümü, ONNX'e aktarım."
    ),
    "yardim.gorev.varlik": "varlık tanıma (kişi, yer… etiketleme)",
    "yardim.gorev.varlik_aciklama": "Belirteç sınıflandırma (BIO etiketleri) ve varlık düzeyi F1.",
    "yardim.gorev.veri": "veri araçları (doğrulama, sızıntısız ayrım, veri kartı, dönüştürme)",
    "yardim.gorev.veri_aciklama": "Model gerektirmeyen veri araçları; anında çalışır.",
    # ───────────── yardım: eylemler ─────────────
    "yardim.eylem.dogrula": "veriyi doğrular; ayrımı, uzunlukları ve (sohbette) kayıp maskesini gösterir",
    "yardim.eylem.egit": "eğitir; önce planı ve tahmini belleği yazar (--kuru: yalnız plan)",
    "yardim.eylem.degerlendir": "eğitilmiş modeli doğrulama/test verisinde ölçer",
    "yardim.eylem.birlestir": "LoRA bağdaştırıcısını taban modele katar (GGUF'tan önce gerekli)",
    "yardim.eylem.disa_aktar_sohbet": "birleştirilmiş modeli GGUF'a çevirir ve Ollama Modelfile yazar",
    "yardim.eylem.disa_aktar_onnx": "modeli ONNX'e (ve int8'e) aktarır, PyTorch çıktısıyla karşılaştırır",
    "yardim.eylem.tahmin": "eğitilmiş modelle tahmin yapar",
    "yardim.eylem.tahmin_gomme": "sorgu için belge listesinde en benzer belgeleri bulur",
    "yardim.eylem.tahmin_varlik": "metindeki varlıkları (kişi, yer…) listeler",
    "yardim.eylem.uret_talimat": "açık bir öğretmen modelle talimat/yanıt verisi üretir",
    "yardim.eylem.uret_sorgu": "açık bir öğretmen modelle belgelerden arama sorgusu üretir",
    "yardim.eylem.veri_dogrula": "dosyanın biçimini doğrular (model gerekmez)",
    "yardim.eylem.ayir": "veriyi sızıntısız biçimde eğitim/doğrulama/test olarak böler",
    "yardim.eylem.sizinti": "iki dosya arasında yinelenen/çok benzer örnek sayar",
    "yardim.eylem.kart": "veri kümesi kartı (VERI_KARTI.md) üretir",
    "yardim.eylem.donustur": "alpaca/sharegpt/istem-tamamlama biçimini sohbet biçimine çevirir",
    # ───────────── yardım: seçenekler ─────────────
    "yardim.secenek.hazir": "donanım hazır ayarı: cpu-deneme, colab-t4, tek-gpu-24gb",
    "yardim.secenek.ayar": "kendi TOML yapılandırma dosyanız (--hazir yerine)",
    "yardim.secenek.degistir": "tek bir değeri değiştirir, ör. -D egitim.yigin=8 (birden çok verilebilir)",
    "yardim.secenek.kuru": "veriyi doğrular, planı ve tahmini belleği yazar; eğitimi başlatmaz",
    "yardim.secenek.surdur": "son ara kayıttan (denetim/) eğitimi sürdürür",
    "yardim.secenek.model": "model klasörü (varsayılan: yapılandırmadaki egitim.cikti)",
    "yardim.secenek.veri": "değerlendirme dosyası (varsayılan: doğrulama/test ayrımı)",
    "yardim.secenek.karsilastir": "aynı veride taban modeli de ölçer (bağdaştırıcı kapatılarak)",
    "yardim.secenek.cikti": "çıktı klasörü",
    "yardim.secenek.cikti_dosya": "çıktı dosyası",
    "yardim.secenek.onnx_cikti": "ONNX klasörü (varsayılan: <egitim.cikti>/onnx)",
    "yardim.secenek.taban": "taban model (varsayılan: bağdaştırıcının kaydındaki)",
    "yardim.secenek.duyarlik": "birleştirme duyarlığı (oto: modelin kendi duyarlığı)",
    "yardim.secenek.birlestir_dogrula": "birleşik ve bağdaştırıcılı modelin çıktısını karşılaştırır",
    "yardim.secenek.llama_cpp": "llama.cpp klasörü (convert_hf_to_gguf.py burada aranır)",
    "yardim.secenek.gguf_tur": "GGUF türü: q8_0 (varsayılan), f16, bf16, f32",
    "yardim.secenek.nicem": "ek nicemleme, ör. Q4_K_M (derlenmiş llama-quantize gerekir)",
    "yardim.secenek.ad": "ad (dosya adlarında ve Ollama komutunda kullanılır)",
    "yardim.secenek.sistem": "sistem iletisi",
    "yardim.secenek.baglam": "Ollama bağlam uzunluğu (num_ctx)",
    "yardim.secenek.mesaj": "kullanıcı iletisi",
    "yardim.secenek.girdi": "girdi dosyası",
    "yardim.secenek.azami_yeni": "üretilecek en çok belirteç",
    "yardim.secenek.metin": "sınıflandırılacak metin (birden çok verilebilir)",
    "yardim.secenek.onnx": "PyTorch yerine ONNX modelini (onnxruntime) kullanır",
    "yardim.secenek.azami_uzunluk": "azami belirteç uzunluğu",
    "yardim.secenek.sorgu": "arama sorgusu (birden çok verilebilir)",
    "yardim.secenek.belgeler": "belge dosyası: .txt (satır başına bir belge) ya da .jsonl (metin alanı)",
    "yardim.secenek.k": "listelenecek belge sayısı",
    "yardim.secenek.sorgu_oneki": "sorgu öneki (ör. 'query: ')",
    "yardim.secenek.belge_oneki": "belge öneki (ör. 'passage: ')",
    "yardim.secenek.uret_ayar": "üretim yapılandırması, ör. yapilandirma/uret/talimat.toml",
    "yardim.secenek.sinir": "yalnız ilk N tohumu işler (deneme için)",
    "yardim.secenek.devam": "yarıda kalan üretimi sürdürür (tamamlanan tohumları atlar)",
    "yardim.secenek.uret_kuru": "öğretmene istek atmaz; tohumları doğrular ve ilk istemi gösterir",
    "yardim.secenek.bicim": "veri biçimi",
    "yardim.secenek.kodlama": "dosya kodlaması (Türkçe Excel CSV'si için: cp1254)",
    "yardim.secenek.grup_alani": "aynı tarafta tutulacak örnekleri gösteren alan adı",
    "yardim.secenek.oranlar": "eğitim,doğrulama,test oranları (ör. 0.8,0.1,0.1)",
    "yardim.secenek.benzerlik": "yakın yineleme eşiği (Jaccard, 0.5–1.0)",
    "yardim.secenek.tohum": "rastgelelik tohumu",
    "yardim.secenek.egitim_dosyasi": "eğitim dosyası",
    "yardim.secenek.test_dosyasi": "test dosyası",
    "yardim.secenek.lisans": "verinin lisansı",
    "yardim.secenek.kaynak": "verinin kaynağı",
    "yardim.secenek.dil": "verinin dili",
    "yardim.secenek.kaynak_bicim": "girdi dosyasının biçimi",
    # ───────────── tablo başlıkları ─────────────
    "siniflandirma.tablo": "sınıf|kesinlik|duyarlılık|F1|örnek",
    "siniflandirma.matris": "gerçek \\ tahmin|Karışıklık matrisi (satır: gerçek, sütun: tahmin)",
    "siniflandirma.ozet": "doğruluk|makro F1",
}

# Rapor özet tablosundaki alan adları (`report/html.py` içindeki `summary_rows` kullanır).
REPORT_FIELDS: dict[str, str] = {
    "taban": "Taban model",
    "yontem": "Yöntem",
    "adim": "Adım",
    "egitim_kaybi": "Eğitim kaybı",
    "dogrulama_kaybi": "Doğrulama kaybı",
    "degerlendirme_kumesi": "Değerlendirme kümesi",
    "dogruluk": "Doğruluk",
    "makro_f1": "Makro F1",
    "varlik_f1": "Varlık F1",
    "sure_sn": "Süre (sn)",
}


def t(key: str, **params: object) -> str:
    """Sözlükten iletiyi alır ve yer tutucuları doldurur."""
    return MESSAGES[key].format(**params)


def headers(key: str) -> list[str]:
    """`|` ile ayrılmış başlık listesini döndürür (tablo başlıkları için)."""
    return MESSAGES[key].split("|")
