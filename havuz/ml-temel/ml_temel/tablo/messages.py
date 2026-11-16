"""Kullanıcıya görünen bütün Türkçe metinler (komut satırı yardımı, ileti, rapor başlıkları).

Kural (STANDARTLAR §3): arayüz metni koda gömülmez, bu sözlükte durur. Kodda `t("anahtar", ...)`
ile kullanılır; `{ad}` yer tutucuları `str.format` ile doldurulur. Kural testi
(`tests/test_rules.py`) kodda kullanılan her anahtarın burada olduğunu denetler.
Genişletme: yeni metin = buraya yeni anahtar + kodda `t("yeni_anahtar")`.
"""

from __future__ import annotations

from typing import Any

METIN: dict[str, str] = {
    # --- komut satırı ---------------------------------------------------------------------
    "cli_aciklama": "ml-temel: CSV dosyasından sızıntısız değerlendirilmiş tahmin modeli ve rapor.",
    "cli_egit": "CSV'den model eğitir; model dosyası, rapor ve model kartı yazar.",
    "cli_tahmin": "Kayıtlı modelle yeni bir CSV için tahmin üretir.",
    "cli_degerlendir": "Kayıtlı modeli etiketli yeni bir CSV üzerinde ölçer (güven aralığıyla).",
    "cli_rapor": "Kayıtlı modelin raporunu yeniden yazar (Markdown, istenirse HTML).",
    "arg_veri": "girdi CSV dosyası (Türkçe Excel biçimi de olur: ';' ayırıcı, ondalık virgül)",
    "arg_hedef": "tahmin edilecek sütunun adı",
    "arg_zaman": "zaman sütunu: verilirse eğitim hep geçmiş, sınama hep gelecek olur",
    "arg_grup": "grup sütunu (ör. müşteri no): bir grubun satırları ayrılmaz",
    "arg_gorev": "görev türünü zorla: siniflandirma ya da regresyon (verilmezse sezilir)",
    "arg_pozitif": "ikili sınıflamada 'pozitif' sayılacak sınıf (verilmezse sezilir)",
    "arg_cikti_klasor": "çıktı klasörü (varsayılan: ciktilar/<veri adı>)",
    "arg_hizli": "daha az ağaç ve kat: hızlı deneme için (sonuçlar daha kaba olur)",
    "arg_tohum": "rastgelelik tohumu (aynı tohum = aynı sonuç)",
    "arg_modeller": "denenecek modeller, virgülle: dogrusal,orman,artirma",
    "arg_ayirici": "CSV ayırıcısını zorla (verilmezse sezilir)",
    "arg_ondalik": "ondalık işaretini zorla: ',' ya da '.' (verilmezse sezilir)",
    "arg_model": "egit komutunun yazdığı model dosyası (model.npz)",
    "arg_cikti_dosya": "çıktı dosyası",
    "arg_html": "Markdown'a ek olarak bağımlılıksız HTML rapor da yaz",
    "ilerleme_okundu": "Okundu: {satir} satır, {sutun} sütun ({bicim}).",
    "ilerleme_model": "Çapraz doğrulama: {model} ...",
    "ilerleme_bitti": "Bitti ({sure} sn). En iyi model: {model}.",
    "yazildi": "Yazıldı: {yol}",
    "tahmin_yazildi": "{satir} satır için tahmin yazıldı: {yol}",
    "arg_esik": "ikili sınıflamada 'pozitif' demek için olasılık eşiği (varsayılan: modeldeki)",
    "degerlendirme_baslik": "# Değerlendirme: {dosya} ({satir} satır)",
    "degerlendirme_tablo": "| Ölçüt | Değer | %95 güven aralığı |",
    "hedef_yok_degerlendir": "Değerlendirme için '{hedef}' sütunu dolu olmalı.",
    "bilinmeyen_sinif": "Hedefte modelin bilmediği sınıflar var: {siniflar}. Modelin sınıfları: "
    "{bilinen}.",
    "hata_genel": "Hata: {ileti}",
    "hata_ipucu": "İpucu: hata metnini bir modele yapıştırıp sorabilirsiniz.",
    # --- CSV ve şema hataları -------------------------------------------------------------
    "csv_bos": "CSV dosyası boş ya da yalnız başlık satırı içeriyor: {yol}",
    "csv_fazla_hucre": (
        "{satir}. satırda başlıktan fazla hücre var ({hucre} > {baslik}). Ayırıcı yanlış "
        "sezilmiş olabilir: --ayirici ';' ya da --ayirici ',' ile deneyin."
    ),
    "csv_kodlama": "Dosya UTF-8 değil; Windows Türkçe (cp1254) olarak okundu.",
    "hedef_yok": "'{hedef}' adlı sütun yok. Var olan sütunlar: {sutunlar}",
    "hedef_bos": "Hedef sütununda ('{hedef}') hiç dolu değer yok.",
    "hedef_tek_sinif": "Hedefte yalnız bir sınıf var ({sinif}); öğrenilecek bir şey yok.",
    "hedef_az_sinif": (
        "Bazı sınıflarda çok az örnek var ({siniflar}). Her sınıfta en az {gerekli} örnek olmalı: "
        "bu sınıfları birleştirin ya da çıkarın."
    ),
    "az_veri": "Yalnız {satir} satır var; anlamlı bir değerlendirme için en az {gerekli} gerekir.",
    "sutun_eksik": (
        "Modelin beklediği sütunlar dosyada yok: {sutunlar}. Eğitimdeki sütun adlarının aynısını "
        "kullanın."
    ),
    "gorev_gecersiz": "--gorev 'siniflandirma' ya da 'regresyon' olmalı; verilen: {gorev}",
    "pozitif_yok": "--pozitif '{deger}' hedefte yok. Sınıflar: {siniflar}",
    "model_adi_gecersiz": "Bilinmeyen model adı: {ad}. Seçenekler: {secenekler}",
    "hata_aday_yok": "Hiçbir aday model değerlendirilemedi; uyarılara bakın.",
    # --- model adları ------------------------------------------------------------------------
    "model_taban": "Taban çizgisi",
    "model_dogrusal": "Doğrusal model",
    "model_orman": "Rastgele orman",
    "model_artirma": "Gradyan artırma",
    # --- uyarılar (rapora girer) -----------------------------------------------------------
    "uyari_aday_hata": "{model} değerlendirilemedi: {hata}",
    "uyari_atilan": "Modele alınmayan sütunlar: {sutunlar}.",
    "uyari_eksik_hedef": "Hedefi boş olan {satir} satır çıkarıldı.",
    "uyari_dengesiz": (
        "Sınıflar dengesiz: en küçük sınıf ('{sinif}') verinin %{oran}'i. Doğruluk yerine "
        "ROC-AUC, PR-AUC ve dengeli doğruluğa bakın."
    ),
    "uyari_kucuk": (
        "Sınama kümesi küçük ({satir} satır): güven aralıkları geniş, sonuçları temkinli okuyun."
    ),
    "uyari_sizinti_skor": (
        "Sınama başarısı şüphe uyandıracak kadar yüksek ({olcut} = {deger}). Hedefi "
        "doğrudan ya da dolaylı olarak içeren bir sütun (sızıntı) olabilir; sütunları gözden "
        "geçirin."
    ),
    "uyari_sizinti_onem": (
        "'{sutun}' tek başına başarının çok büyük kısmını taşıyor. Bu bilgi tahmin anında "
        "gerçekten elde var mı? Yoksa sızıntıdır ve sütun çıkarılmalıdır."
    ),
    "uyari_kopya": (
        "Sınama satırlarının %{oran}'i eğitimde birebir var (kopya satırlar). Sonuçlar "
        "iyimser olabilir; kopyaları temizleyin ya da --grup kullanın."
    ),
    "uyari_taban": (
        "En iyi model taban çizgisini anlamlı biçimde geçemedi: sütunlar hedef hakkında yeterli "
        "bilgi taşımıyor olabilir."
    ),
    "uyari_zaman_grup": (
        "Hem --zaman hem --grup verildi: ayrım zamana göre yapıldı; aynı grup hem eğitimde hem "
        "sınamada bulunabilir."
    ),
    # --- ölçüt adları ve kısa anlamları ----------------------------------------------------
    "olcut_roc_auc": "ROC-AUC",
    "olcut_pr_auc": "PR-AUC",
    "olcut_log_loss": "Log-kayıp",
    "olcut_brier": "Brier",
    "olcut_accuracy": "Doğruluk",
    "olcut_balanced_accuracy": "Dengeli doğruluk",
    "olcut_f1": "F1",
    "olcut_f1_macro": "F1 (makro)",
    "olcut_rmse": "RMSE",
    "olcut_mae": "MAE",
    "olcut_r2": "R²",
    "anlam_roc_auc": "Rastgele bir pozitifin rastgele bir negatiften yüksek puan alma olasılığı "
    "(0,5 = yazı-tura, 1 = kusursuz). Büyük iyidir.",
    "anlam_pr_auc": "Pozitifleri yakalarken isabet; taban değeri pozitif oranıdır. Büyük iyidir.",
    "anlam_log_loss": "Olasılıkların ne kadar doğru olduğu; kendinden emin yanlışları ağır "
    "cezalandırır. Küçük iyidir.",
    "anlam_brier": "Olasılık ile gerçekleşen (0/1) arasındaki ortalama kare fark. Küçük iyidir.",
    "anlam_accuracy": "Doğru tahmin oranı. Dengesiz sınıflarda yanıltıcıdır. Büyük iyidir.",
    "anlam_balanced_accuracy": "Sınıf başına isabetlerin ortalaması. Büyük iyidir.",
    "anlam_f1": "Pozitif sınıf için kesinlik ve duyarlılığın dengesi (eşik 0,5). Büyük iyidir.",
    "anlam_f1_macro": "Her sınıfın F1 değerinin ortalaması. Büyük iyidir.",
    "anlam_rmse": "Tipik hata (büyük hataları daha ağır sayar), hedefle aynı birimde. "
    "Küçük iyidir.",
    "anlam_mae": "Ortalama mutlak hata, hedefle aynı birimde. Küçük iyidir.",
    "anlam_r2": "Hedefteki değişkenliğin açıklanan payı (0 = ortalama kadar, 1 = kusursuz). "
    "Büyük iyidir.",
    # --- ayrım stratejileri ------------------------------------------------------------------
    "ayrim_zaman": "Zamana göre: satırlar '{sutun}' sütununa göre sıralandı; sınama kümesi en "
    "yeni %{oran} satır. Çapraz doğrulamada eğitim hep geçmişte, doğrulama hep gelecekte "
    "(TimeSeriesSplit).",
    "ayrim_grup": "Gruplu: '{sutun}' sütunundaki bir grubun bütün satırları ya eğitimde ya "
    "sınamada (GroupKFold). Model aynı müşteriyi/kişiyi 'tanıyarak' puan kazanamaz.",
    "ayrim_katmanli": "Katmanlı rastgele: sınıf oranları eğitim, sınama ve her katta korundu "
    "(StratifiedKFold).",
    "ayrim_rastgele": "Rastgele: satırlar karıştırılıp bölündü (KFold).",
    "gorev_siniflandirma_ikili": "İkili sınıflandırma: '{pozitif}' olma olasılığı tahmin edilir.",
    "gorev_siniflandirma_cok": "Çok sınıflı sınıflandırma ({sayi} sınıf).",
    "gorev_regresyon": "Regresyon: sayısal değer tahmini.",
    "kalibrasyon_yok": "yok (model olasılıkları zaten yeterince doğru bulundu)",
    "yontem_yok": "düzeltmesiz",
    "yontem_sigmoid": "sigmoid",
    "yontem_isotonic": "izotonik",
    "kalibrasyon_sigmoid": "sigmoid (Platt): olasılıkların log-oranı doğrusal olarak düzeltildi",
    "kalibrasyon_isotonic": "izotonik: olasılıklar artan basamaklı bir eşlemeyle düzeltildi",
    "yorum_roc_auc": "Model, rastgele seçilmiş bir '{pozitif}' satırına rastgele seçilmiş bir "
    "diğer satırdan %{yuzde:.0f} olasılıkla daha yüksek risk veriyor.",
    "yorum_log_loss": "Çok sınıflı log-kayıp {deger}; taban çizgisi {taban}.",
    "yorum_rmse": "Tahminler gerçek değerden tipik olarak ±{deger} sapıyor (taban çizgisi "
    "±{taban}).",
    # --- rapor -----------------------------------------------------------------------------
    "rapor_baslik": "# Model raporu: '{hedef}' tahmini",
    "rapor_altbilgi": "Oluşturma: {tarih} · ml-temel {surum} · Veri: `{dosya}` ({satir} satır × "
    "{sutun} sütun; {bicim})",
    "bolum_ozet": "## Özet",
    "bolum_uyarilar": "## Uyarılar",
    "bolum_veri": "## Veri",
    "bolum_yontem": "## Değerlendirme yöntemi",
    "bolum_adaylar": "## Aday modeller (çapraz doğrulama)",
    "bolum_sinama": "## Sınama sonuçları",
    "bolum_kalibrasyon": "## Olasılık kalibrasyonu",
    "bolum_esik": "## Karar eşiği ve karışıklık matrisi",
    "bolum_onem": "## Sütun önemleri (permütasyon)",
    "bolum_kullanim": "## Nasıl kullanılır",
    "bolum_sinirlar": "## Sınırlar",
    "ozet_gorev": "- **Görev:** {metin}",
    "ozet_model": "- **Seçilen model:** {model} — {olcut} = {ort} ± {std} ({kat} katlı çapraz "
    "doğrulama)",
    "ozet_sinama": "- **Sınama kümesi** ({satir} satır, model seçiminde hiç kullanılmadı): "
    "{olcut} = {deger} (%95 GA {alt}–{ust}); taban çizgisi {taban}",
    "ozet_yorum": "- {metin}",
    "uyari_yok": "Uyarı yok.",
    "veri_tablo_baslik": "| Sütun | Tür | Eksik | Farklı değer | Not |",
    "veri_hedef_dagilim": "Hedef dağılımı: {dagilim}.",
    "veri_hedef_ozet": "Hedef: ortalama {ortalama}, standart sapma {std}, en küçük {en_kucuk}, "
    "en büyük {en_buyuk}.",
    "yontem_ayrim": "- **Ayrım:** {metin}",
    "yontem_sinama": "- **Sınama kümesi:** {satir} satır; model ve ayarlar seçilene kadar hiç "
    "kullanılmadı.",
    "yontem_cv": "- **Çapraz doğrulama:** {kat} kat, eğitim kümesinin ({satir} satır) içinde. "
    "Ön işleme (doldurma, ölçekleme, kodlama, TF-IDF) her katta yalnız o katın eğitim satırlarıyla "
    "uyduruldu.",
    "yontem_ana": "- **Ana ölçüt:** {olcut} — {anlam}",
    "yontem_zamansiz": "- Zamanı boş olan {satir} satır değerlendirmeye alınmadı.",
    "adaylar_not": "Kalın satır seçilen modeldir. Değerler katların ortalaması ± standart "
    "sapmasıdır; süre bütün katların toplamıdır.",
    "adaylar_sure": "Süre (sn)",
    "sinama_baslik": "| Ölçüt | Model | %95 güven aralığı | Taban çizgisi | Anlamı |",
    "sinama_not": "Güven aralıkları sınama satırlarının yerine koyarak yeniden örneklenmesiyle "
    "(önyükleme) hesaplandı.",
    "regresyon_hata": "Mutlak hata: ortanca {ortanca}, satırların %90'ında en çok {yuzde90}, en "
    "büyük {en_buyuk}.",
    "kalibrasyon_secim": "- **Seçilen düzeltme:** {metin}",
    "kalibrasyon_adaylar": "- Kat dışı log-kayıp (eğitim kümesinde): {liste}",
    "kalibrasyon_ece": "- Beklenen kalibrasyon hatası (ECE, sınamada): düzeltmeden önce {once}, "
    "sonra {sonra}. 0,02 altı iyi sayılır; küçük sınama kümesinde gürültülüdür.",
    "kalibrasyon_tablo_baslik": "| Tahmin edilen olasılık (ort.) | Gerçekleşen oran | Satır |",
    "esik_aciklama": "Model her satır için '{pozitif}' olasılığı verir; olasılık eşiği aşarsa "
    "'{pozitif}' denir. Varsayılan eşik 0,5. Kat dışı tahminlerde F1'i en büyükleyen eşik {f1}; "
    "yanlış alarm ile kaçırılan vaka arasındaki maliyete göre `tahmin --esik` ile "
    "değiştirebilirsiniz.",
    "esik_matris": "**Eşik {esik}** (satırlar gerçek, sütunlar tahmin):",
    "onem_aciklama": "Sınama kümesinde bir sütun karıştırıldığında ana ölçütün ({olcut}) ortalama "
    "kötüleşmesi ({tekrar} tekrar). Sıfıra yakın ya da negatif: model o sütuna dayanmıyor. "
    "Önem neden-sonuç göstermez.",
    "onem_tablo_baslik": "| Sütun | Kötüleşme | ± | |",
    "kullanim_tahmin": "Yeni veri için tahmin (aynı sütunlar; hedef sütunu gerekmez):",
    "kullanim_degerlendir": "Etiketli yeni veride ölçüm (güven aralığıyla):",
    "sinirlar_metni": "- Sonuçlar bu veri ve bu dönem için geçerlidir; veri değiştikçe (yeni "
    "ürün, yeni müşteri kitlesi) model yeniden eğitilmeli ve yeniden ölçülmelidir.\n"
    "- Permütasyon önemi modelin neye dayandığını gösterir; neden-sonuç ilişkisi göstermez.\n"
    "- Güven aralıkları yalnız sınama örneklemindeki belirsizliği kapsar; veri toplama "
    "sürecindeki yanlılıkları kapsamaz.\n"
    "- Çok sınıflı görevlerde olasılık kalibrasyonu yapılmaz.",
    # --- model kartı --------------------------------------------------------------------------
    "kart_baslik": "# Model kartı: '{hedef}' tahmini",
    "kart_ayrinti": "## Model ayrıntıları\n- Tür: {model} (ml-temel {surum}, yalnız numpy)\n"
    "- Oluşturma: {tarih}\n- Girdi sütunları: {sutunlar}\n- Çıktı: {cikti}",
    "kart_cikti_ikili": "'{pozitif}' olasılığı ve eşik {esik} ile etiket",
    "kart_cikti_cok": "sınıf olasılıkları ve en olası sınıf",
    "kart_cikti_regresyon": "sayısal tahmin",
    "kart_amac": "## Amaçlanan kullanım\n- Karar DESTEĞİ: hangi kayıtlara öncelik verileceğini "
    "sıralamak, beklenen değeri kestirmek.\n- Eğitim verisine benzeyen veride kullanılmalıdır "
    "(aynı sütunlar, aynı tanımlar, benzer dönem).",
    "kart_disi": "## Kapsam dışı kullanım\n- Tek başına otomatik karar (işten çıkarma, kredi "
    "reddi, tedavi kararı gibi) vermek.\n- Eğitim verisinden çok farklı kitlelere ya da dönemlere "
    "uygulamak.",
    "kart_veri": "## Eğitim verisi\n- Kaynak: `{dosya}`; {satir} satır.\n- Ayrım: {ayrim}",
    "kart_olcutler": "## Ölçümler (sınama kümesi, %95 GA)",
    "kart_etik": "## Etik ve adalet\n- Modelde kişisel ya da hassas olabilecek sütunlar: "
    "{sutunlar}. Bu sütunların gruplar arasında haksız fark yaratıp yaratmadığını (ör. bölgeye "
    "göre hata oranları) ayrıca inceleyin.\n- Model geçmişteki kararları ve önyargıları yeniden "
    "üretebilir.",
    "kart_bakim": "## Bakım\n- Veri ya da iş süreci değiştiğinde yeniden eğitin: "
    "`python -m ml_temel egit ...`.\n- Yeni etiketli veri geldikçe `degerlendir` ile ölçümü "
    "yenileyin; başarı güven aralığının altına düşerse modeli yenileyin.",
    "kart_hassas_yok": "(otomatik tespit edilmedi; sütun adlarını kendiniz gözden geçirin)",
}


def t(key: str, **values: Any) -> str:
    """Sözlükten metni alır ve yer tutucuları doldurur."""
    if key not in METIN:
        raise KeyError(f"Metin sözlüğünde '{key}' yok: ml_temel/tablo/messages.py'ye ekleyin.")
    return METIN[key].format(**values) if values else METIN[key]
