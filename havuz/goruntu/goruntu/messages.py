"""Sözlük: kullanıcının gördüğü bütün Türkçe iletiler tek yerde durur.

Kim kullanır: paketin her yeri `t("anahtar", ad=deger)` ile ileti üretir. Komut satırı yardım metinleri
de buradadır (`yardim.*` anahtarları). Bu dosya veridir; 300 satır sınırı ona uygulanmaz.

Kurallar (`tests/test_rules.py` denetler):
- Kodda kullanılan her anahtar burada vardır; burada olup kullanılmayan anahtar kalmaz.
- İletideki `{yer_tutucu}` adları çağrıdaki anahtar sözcüklerle aynıdır.
- İleti suçlamaz, ne yapılacağını söyler.

Genişletme: yeni ileti için ilgili bölüme satır ekleyin; anahtar `bolum.ad` biçimindedir.
"""

from __future__ import annotations

MESSAGES: dict[str, str] = {
    # ───────────── dosya ─────────────
    "dosya.yok": "Dosya bulunamadı: {yol}. Yolu ve çalıştığınız klasörü denetleyin.",
    "dosya.json_bozuk": "{yol} geçerli JSON değil ({ayrinti}).",
    "dosya.klasor_yok": "Klasör bulunamadı: {yol}. Yolu ve çalıştığınız klasörü denetleyin.",
    # ───────────── görüntü açma (hazirlik/loader.py) ─────────────
    "goruntu.yuklenen": "yüklenen görüntü",
    "goruntu.bulunamadi": "Görüntü dosyası bulunamadı: {yol}.",
    "goruntu.bos": "{ad}: dosya boş.",
    "goruntu.cok_buyuk_dosya": (
        "{ad}: dosya çok büyük ({mb} MB; sınır {sinir} MB). Görüntüyü küçültüp yeniden deneyin "
        "ya da sınırı yükseltin."
    ),
    "goruntu.piksel_siniri": (
        "{ad}: görüntü çok büyük ({gen}×{yuk} = {mp} MP; sınır {sinir} MP). Bu bir sıkıştırma "
        "bombası olabilir; gerçek bir fotoğrafsa önce küçültün ya da sınırı yükseltin."
    ),
    "goruntu.pil_siniri": (
        "{ad}: görüntü Pillow'un güvenlik sınırını (~179 MP) aşıyor; açılmadı. Önce küçültün."
    ),
    "goruntu.heic": (
        "{ad}: HEIC/HEIF biçimi desteklenmiyor. Telefonda kamera biçimini 'En Uyumlu' (JPEG) yapın "
        "ya da dosyayı JPEG'e çevirip yeniden deneyin."
    ),
    "goruntu.bicim_izinsiz": "{ad}: {bicim} biçimine izin verilmiyor. İzin verilenler: {izinli}.",
    "goruntu.taninmadi": "{ad}: görüntü olarak tanınmadı. İzin verilen biçimler: {izinli}.",
    "goruntu.bozuk": (
        "{ad}: görüntü bozuk ya da yarım ({ayrinti}). Dosyayı yeniden indirin ya da dışa aktarın."
    ),
    "goruntu.kip": "{ad}: {kip} renk kipi desteklenmiyor. Görüntüyü RGB olarak kaydedip deneyin.",
    # ───────────── kopya bulma ─────────────
    "kopya.taraniyor": "Görüntüler taranıyor",
    # ───────────── yapılandırma ─────────────
    "ayar.hazir_yok": "'{hazir}' adında hazır ayar yok. Seçenekler: {secenekler}.",
    "ayar.ikisi_birden": "--ayar ve --hazir birlikte verilemez; yalnız birini kullanın.",
    "ayar.eksik": ("Yapılandırma verin: `--hazir <ad>` ({secenekler}) ya da `--ayar dosya.toml`."),
    "ayar.degistir_bicim": (
        "-D değeri anlaşılamadı: '{girdi}'. Biçim: bolum.anahtar=deger (ör. -D egitim.donem=3)."
    ),
    "ayar.toml_bozuk": "{yol} geçerli TOML değil: {ayrinti}",
    "ayar.gecersiz": "{yol} içinde düzeltilmesi gerekenler:\n  {liste}",
    # ───────────── donanım ─────────────
    "donanim.duyarlik_yedek": (
        "{aygit} üzerinde {istenen} desteklenmiyor; fp32 ile devam ediliyor (yavaş ama güvenli)."
    ),
    "donanim.bf16_yok": "{aygit} bf16 desteklemiyor; fp16 + GradScaler kullanılıyor.",
    # ───────────── model ─────────────
    "model.bilinmeyen": (
        "'{taban}' timm'de bulunamadı. Katalogdaki adlardan birini yazın (`python -m goruntu "
        "modeller`) ya da `timm/<mimari>.<etiket>` biçimini denetleyin."
    ),
    "model.yuklenemedi": (
        "'{taban}' modeli kurulamadı ya da indirilemedi ({ayrinti}). Ağı denetleyin; indirme "
        "takılıyorsa HF_HUB_DISABLE_XET=1 ile yeniden deneyin."
    ),
    "model.klasor_yok": (
        "{yol} içinde eğitilmiş model yok (model.json + agirliklar.safetensors). Önce "
        "`python -m goruntu egit` çalıştırın ya da çıktı klasörünü verin."
    ),
    # ───────────── veri (sınıflandırma) ─────────────
    "veri.bulundu": "{sayi} görüntü, {sinif} sınıf bulundu; görüntüler denetlenip özetleniyor…",
    "veri.kok_dosyalari": (
        "{yol} kökündeki {sayi} görüntü bir sınıf klasöründe olmadığı için kullanılmadı."
    ),
    "veri.karisik_duzen": (
        "{yol}: hazır ayrım klasörleri (egitim/dogrulama/test) ile sınıf klasörleri karışık. "
        "Ya yalnız sınıf klasörleri ya da yalnız egitim/ + test/ (+ dogrulama/) kullanın."
    ),
    "veri.bos_sinif": "'{sinif}' klasöründe görüntü yok; bu sınıf atlandı.",
    "veri.az_sinif": (
        "{yol} içinde {sayi} sınıf bulundu; en az 2 sınıf klasörü gerekir "
        "(kök/<sınıf>/<görüntü>.jpg)."
    ),
    "veri.buyuk_kucuk": "Bu sınıflar yalnız harf büyüklüğüyle ayrışıyor, aynı olabilir: {siniflar}",
    "veri.az_ornek": "'{sinif}' sınıfında yalnız {sayi} görüntü var; güvenilir ölçüm için az.",
    "veri.dengesiz": (
        "Sınıflar dengesiz (en büyük {buyuk}, en küçük {kucuk} görüntü): doğruluğa değil makro "
        "F1'e bakın; `egitim.dengesizlik` açık kalsın."
    ),
    "veri.reddedilen": (
        "{sayi} dosya açılamadı ve eğitimden çıkarıldı (ayrıntı: çıktı klasöründe ayrim.json)."
    ),
    "veri.egitimde_yok": (
        "Şu sınıfların eğitimde hiç görüntüsü kalmadı: {siniflar}. Görüntüleri denetleyin."
    ),
    "veri.egitimde_bozuldu": "Eğitim sırasında görüntü açılamadı: {ayrinti}",
    # ───────────── ayrım ─────────────
    "ayrim.az_grup": (
        "Veri {parca} parçaya bölünemiyor: kopyalar ve gruplar birleşince yalnız {grup} grup kaldı. "
        "Daha çok görüntü ekleyin ya da oranları küçültün."
    ),
    "ayrim.sinif_egitime": "'{sinif}' sınıfı eğitimde hiç kalmadığı için bir grubu eğitime taşındı.",
    "ayrim.celiski": (
        "{sayi} yakın kopya çiftinin etiketleri farklı (aynı fotoğraf iki sınıfta?). Liste: "
        "ayrim.json → celiskiler."
    ),
    "ayrim.hazir_sizinti": (
        "Hazır ayrımda eğitim ile '{parca}' arasında {sayi} yakın kopya var: sonuç iyimser olabilir "
        "(ayrim.json → sizintilar). Kopyaları tek tarafa taşıyın."
    ),
    "ayrim.baslik": "Veri ayrımı (sınıf × parça):",
    "ayrim.sinif": "sınıf",
    "ayrim.toplam": "TOPLAM",
    "ayrim.kopya_ozeti": "Yakın kopya çifti: {sayi} (hepsi aynı parçada tutuldu).",
    # ───────────── eğitim ─────────────
    "egitim.donem": (
        "dönem {donem}  kayıp {kayip}  doğrulama: makro F1 {f1}, doğruluk {dogruluk}  "
        "(gövde {govde}, {sure} sn)"
    ),
    "egitim.erken_durdu": "Erken durdurma: {donem}. dönemde iyileşme yok; en iyi dönem {en_iyi}.",
    "egitim.bitti": "Bitti. Çıktılar: {yol} (rapor.txt, degerlendirme.json, model/).",
    "egitim.eski_paket": (
        "{yol} ÖNCEKİ modele ait; uygulamaya kopyalamadan önce `python -m goruntu disa-aktar` ile "
        "yeniden üretin."
    ),
    # ───────────── değerlendirme ─────────────
    "degerlendirme.bos": "Değerlendirilecek örnek yok.",
    "degerlendirme.ozet": "{sayi} örnek · doğruluk {dogruluk} · makro F1 {f1}",
    "degerlendirme.tablo_basliklari": "sınıf|kesinlik|duyarlılık|F1|örnek",
    "degerlendirme.matris": "Karışıklık matrisi (satır: gerçek, sütun: tahmin):",
    "degerlendirme.gercek": "gerçek \\ tahmin",
    "degerlendirme.ciftler": "En çok karıştırılanlar (gerçek → tahmin):",
    "degerlendirme.kalibrasyon": (
        "Kalibrasyon: sıcaklık {sicaklik} · ECE önce {once} → sonra {sonra}"
    ),
    "degerlendirme.kapsama": (
        "'Emin değilim' eşiği {esik}: kapsama {kapsama}, kapsanan örneklerde doğruluk {dogruluk}"
    ),
    "degerlendirme.test_yok": (
        "Test kümesi yok; sonuçlar eşiklerin ayarlandığı doğrulama kümesinde, yani iyimser."
    ),
    "degerlendirme.hedef_tutmadi": (
        "Hedef doğruluk {hedef} doğrulamada hiçbir eşikle sağlanamadı; 'emin değilim' eşiği kapalı."
    ),
    "degerlendirme.sicaklik_sinirda": (
        "Sıcaklık arama sınırına dayandı ({sicaklik}): model doğrulamada neredeyse rastgele ya da "
        "doğrulama kümesi çok küçük. Daha çok veri ya da daha uzun eğitim deneyin."
    ),
    "degerlendirme.kalibrasyon_az_veri": (
        "Doğrulama kümesi küçük ({sayi} < {en_az} örnek): sıcaklık ölçekleme atlandı (az veride "
        "kalibrasyonu bozabiliyor). Daha çok görüntü ekleyin ya da `veri.dogrulama_orani`nı artırın."
    ),
    "degerlendirme.esik_az_veri": (
        "'Emin değilim' eşiği yalnız {sayi} doğrulama örneğiyle seçildi; güvenilirliği düşük."
    ),
    "degerlendirme.esik_secildi": "'Emin değilim' eşiği {esik} seçildi (doğrulamada kapsama {kapsama}).",
    "degerlendirme.bilinmeyen_sinif": (
        "Değerlendirme verisinde modelin tanımadığı sınıflar var: {siniflar}."
    ),
    "degerlendirme.veri_gerekli": (
        "{yol} için kayıtlı test ayrımı (ayrim.json) bulunamadı; `--veri KLASOR` verin."
    ),
    "degerlendirme.atlandi": "{yol} atlandı: {ayrinti}",
    # ───────────── plan (kuru çalıştırma) ─────────────
    "plan.baslik": "Eğitim planı (kuru çalıştırma)",
    "plan.satir.taban": "taban model",
    "plan.satir.kip": "kip",
    "plan.kip.bas": "yalnız baş (gövde donuk)",
    "plan.kip.tam": "tam ince ayar",
    "plan.satir.aygit": "aygıt · duyarlık · iş parçacığı",
    "plan.satir.adim": "adım",
    "plan.adim_ayrinti": "{adim} adım (yığın {yigin}, öğrenme oranı {oran})",
    "plan.satir.dengesizlik": "dengesizlik",
    "plan.satir.cikti": "çıktı",
    "plan.satir.parametre": "parametre (toplam / eğitilen)",
    "plan.satir.girdi": "girdi boyutu",
    "plan.satir.flop": "ileri geçiş / görüntü",
    "plan.satir.bellek": "tahmini bellek",
    "plan.satir.sure_olcum": "tahmini süre (bu makinede ölçülen hızla)",
    "plan.satir.sure_hedef": "tahmini süre (hedef donanım, kaba)",
    "plan.aralik": "{dusuk}–{yuksek} GB",
    "plan.sigar": "→ {gb} GB'a SIĞAR",
    "plan.sinirda": "→ {gb} GB için SINIRDA (yığını küçültün)",
    "plan.sigmaz": "→ {gb} GB'a SIĞMAZ: `-D egitim.yigin=…` ile küçültün",
    "plan.saniye": "~{sn} saniye",
    "plan.dakika": "~{dk} dakika",
    "plan.saat": "~{saat} saat",
    "plan.profil_yok": "Model profili çıkarılamadı, bellek/süre kestirimi atlandı ({ayrinti}).",
    "plan.olcum_yok": "Hız ölçülemedi ({ayrinti}).",
    "plan.veri_okuma_haric": (
        "Süre, makinenin şu anki yüküyle ölçüldü (paylaşımlı makinede şişebilir); görüntü okuma "
        "dahil değil. Büyük fotoğrafları önce `hazirla` ile küçültün."
    ),
    "plan.uyarilar": "Uyarılar:",
    "plan.kuru_bitti": "Kuru çalıştırma: eğitim başlamadı. Aynı komutu `--kuru` olmadan çalıştırın.",
    # ───────────── ONNX ve paket ─────────────
    "onnx.on_islem_atlandi": "int8 öncesi şekil çıkarımı atlandı ({ayrinti}); doğrudan nicemleniyor.",
    "onnx.fark_buyuk": (
        "ONNX ile PyTorch çıktıları arasında beklenenden büyük fark ({fark}). paket.json → "
        "dogrulama alanına bakın."
    ),
    "onnx.bitti": "Paket yazıldı: {klasor} (PyTorch ile en büyük logit farkı {fark}).",
    "onnx.int8_ozet": "int8 sürümünün karar uyumu: {uyum}.",
    "onnx.int8_kazanc_yok": (
        "int8 sürümü yazılmadı: yalnız {oran} küçültüyor (evrişimli ağda dinamik int8 kazanç sağlamaz). "
        "fp32 paketi kullanın."
    ),
    "onnx.int8_uyum_dusuk": (
        "int8 sürümünün karar uyumu düşük ({uyum}): uygulamada KULLANMAYIN, fp32 paketi kullanın."
    ),
    "paket.int8_onerilmez": (
        "{yol}: bu int8 paketi dışa aktarımda PyTorch'la uyumsuz çıktı (paket.json → dogrulama); "
        "fp32 paketi kullanın."
    ),
    "paket.bozuk": "{yol}: paket üst verisi okunamadı ({ayrinti}). `disa-aktar` ile yeniden üretin.",
    "paket.ust_veri_yok": (
        "{yol} bu temelin paketi değil (goruntu.paket üst verisi ve paket.json yok). "
        "`python -m goruntu disa-aktar` ile üretin."
    ),
    "paket.bulunamadi": "{yol} içinde {dosya} bulunamadı. Önce `python -m goruntu disa-aktar` çalıştırın.",
    "paket.acilamadi": "{yol} açılamadı: {ayrinti}",
    "tahmin.emin_degil": "EMİN DEĞİLİM",
    # ───────────── hazırlık ve temizlik ─────────────
    "hazirla.isleniyor": "Görüntüler işleniyor",
    "hazirla.cikti_kaynak_icinde": (
        "Çıktı klasörü ({cikti}) kaynak klasörün ({kaynak}) içinde olamaz; kaynağın dışında bir klasör "
        "verin (yanlışlıkla üzerine yazmayı önler)."
    ),
    "hazirla.gecersiz_secenek": "--kalite 1-100 arasında, --boyut en az 1 olmalı.",
    "hazirla.ozet": (
        "{toplam} dosya: {islenen} işlendi, {reddedilen} atlandı. Kişisel üst veri bulunan: "
        "{kisisel_bulunan} (GPS konumlu: {gps_bulunan}); yönü düzeltilen: {yon_duzeltilen}."
    ),
    "hazirla.rapor": "Rapor: {yol}",
    "temizle.hedef_secin": (
        "Nereye yazılacağını seçin: `--cikti KLASOR` (önerilen, kaynak değişmez) ya da `--yerinde`."
    ),
    "temizle.yerinde_olmaz": (
        "{yol}: bu biçim yerinde temizlenemez (PNG'ye dönüşür); `--cikti KLASOR` kullanın."
    ),
    # ───────────── kopya komutları ─────────────
    "kopya.grup": "Grup {sira} ({sayi} görüntü):",
    "kopya.tut": "TUT",
    "kopya.kopya": "KOPYA (uzaklık {uzaklik})",
    "kopya.ozet": "{toplam} görüntüde {grup} kopya grubu; fazladan {fazla} görüntü.",
    "kopya.hedef_var": "{yol} zaten var; bu dosya taşınmadı.",
    "kopya.tasindi": (
        "{sayi} kopya {yol} klasörüne taşındı (silinmedi). Geri almak için: tasima_kaydi.json."
    ),
    "kopya.egitim_taraniyor": "Eğitim kümesi taranıyor",
    "kopya.sinama_taraniyor": "Sınama kümesi taranıyor",
    "kopya.sizinti_ozeti": (
        "Sınama kümesindeki {toplam} görüntüden {sayi} tanesinin eğitimde yakın kopyası var."
    ),
    # ───────────── arama ─────────────
    "arama.metin_desteklenmiyor": (
        "'{model}' modeli metinle arama yapamaz. Dizini `--model siglip2` (çok dilli) ya da "
        "`--model clip` ile yeniden kurun."
    ),
    "arama.model_yuklenemedi": (
        "Gömme modeli '{model}' yüklenemedi ({ayrinti}). Ağı denetleyin; indirme takılıyorsa "
        "HF_HUB_DISABLE_XET=1 ile yeniden deneyin."
    ),
    "arama.boyut_uyusmuyor": (
        "Vektör boyutu tutmuyor: dizin {dizin}, gelen {gelen}. Dizin başka bir modelle kurulmuş; "
        "aynı modeli kullanın ya da dizini yeniden kurun."
    ),
    "arama.dizin_yok": "{yol} bir dizin değil (dizin.json + vektorler.npy yok). Önce `indeksle` çalıştırın.",
    "arama.dizin_bozuk": "{yol} dizini okunamadı ({ayrinti}). Dizini `indeksle` ile yeniden kurun.",
    "arama.model_farkli": (
        "Bu dizin '{dizin}' modeliyle kurulmuş; '{model}' ile eklenemez. Başka bir --dizin klasörü verin."
    ),
    "arama.model_surumu": (
        "Dizin '{dizin}' modeliyle kurulmuş ama yüklenebilen model '{model}' (sürüm farklı). Sonuçlar "
        "yanlış olur; dizini `indeksle` ile yeniden kurun."
    ),
    "arama.dizinleniyor": "Dizinleniyor",
    "arama.atlandi": "{yol} atlandı: {ayrinti}",
    "arama.dizin_ozeti": "{eklenen} yeni görüntü eklendi; dizinde toplam {toplam} görüntü ({yol}).",
    "arama.az_etiket": "--etiketler en az iki etiket içermeli (virgülle ayırın).",
    # ───────────── katalog ve örnek veri ─────────────
    "katalog.gecersiz": "{yol} içinde düzeltilmesi gerekenler:\n  {liste}",
    "katalog.okunamadi": "{yol} okunamadı: {ayrinti}",
    "katalog.basliklar": "ad|kimlik|görev|boyut|lisans|ticari|girdi",
    "katalog.not": (
        "Lisanslar Hugging Face API'sinden doğrulandı (katalog/dogrulama-*.json). Ağırlık lisansı "
        "eğitim verisinin koşullarını kapsamaz; ticari kullanımdan önce model kartını okuyun."
    ),
    "ornek.gecersiz": "--sinif-basi ≥ 1, --boyut 16-1024, --kopya-orani 0-1 olmalı.",
    "ornek.bitti": "Örnek küme yazıldı: {yol} ({ozet}).",
    # ───────────── sunucu ─────────────
    "sunucu.bilesen_yok": "En az birini verin: `--model PAKET` (sınıflandırma) ya da `--dizin KLASOR` (arama).",
    "sunucu.anahtarsiz_dis_adres": (
        "{adres} adresinde API anahtarı olmadan çalışıyorsunuz; yerel kip dışarıdan gelen istekleri "
        "reddeder. Dışarı açmak için {ortam} ortam değişkenini verin."
    ),
    "sunucu.basliyor": "Sunucu: http://{adres}:{kapi} (durdurmak için Ctrl+C)",
    "sunucu.yerel_kip": (
        "Bu sunucu API anahtarı olmadan yerel kipte; yalnız bu bilgisayardan (127.0.0.1/localhost) "
        "açılabilir. Dışarı açmak için GORUNTU_API_ANAHTARI ortam değişkenini verin."
    ),
    "sunucu.baska_site": "Başka bir siteden gelen istek reddedildi (yerel kip).",
    "sunucu.anahtar": "API anahtarı eksik ya da yanlış. `Authorization: Bearer <anahtar>` gönderin.",
    "sunucu.govde_buyuk": "İstek gövdesi çok büyük (sınır {mb} MB).",
    "sunucu.model_yok": "Sınıflandırıcı yüklenmedi: sunucuyu `--model PAKET` ile başlatın.",
    "sunucu.dizin_yok": "Arama dizini yüklenmedi: sunucuyu `--dizin KLASOR` ile başlatın.",
    # ───────────── komut satırı ─────────────
    "cli.yardim_ipucu": "Yardım için: {komut} --yardim",
    "cli.kesildi": "Kullanıcı durdurdu.",
    # ───────────── yardım: genel ─────────────
    "yardim.genel": (
        "Görüntü temeli: güvenli hazırlık (EXIF yönü, kişisel üst veri temizliği), kopya bulma, "
        "sınıflandırma ince ayarı, ONNX, gömme ve arama."
    ),
    "yardim.genel_ornek": (
        "Örnek:\n  python -m goruntu ornek-veri veri/sekiller\n"
        "  python -m goruntu egit --hazir cpu-deneme --kuru\n"
        "  python -m goruntu egit --hazir cpu-deneme\n"
        "  python -m goruntu disa-aktar --model ciktilar/cpu-deneme"
    ),
    # ───────────── yardım: komutlar ─────────────
    "yardim.komut.hazirla": "Klasördeki görüntüleri yönlendirir, boyutlandırır, dönüştürür, üst veriyi siler",
    "yardim.komut.temizle": "Görüntülerden kişisel üst veriyi (GPS, kamera, yazar, XMP…) siler",
    "yardim.komut.kopya_bul": "Klasördeki kopya ve çok benzer görüntüleri gruplar (algısal özet)",
    "yardim.komut.sizinti": "Eğitim ile sınama kümesi arasında yakın kopya (sızıntı) arar",
    "yardim.komut.egit": "Sınıflandırıcı eğitir (--kuru: yalnız plan ve kestirim)",
    "yardim.komut.degerlendir": "Eğitilmiş modeli test kümesinde ya da verilen klasörde ölçer",
    "yardim.komut.tahmin": "Görüntülerin sınıfını tahmin eder (PyTorch ya da --onnx)",
    "yardim.komut.disa_aktar": "Modeli tek dosyalık ONNX paketine (+ int8) aktarır ve doğrular",
    "yardim.komut.indeksle": "Klasördeki görüntüleri gömüp arama dizinine ekler",
    "yardim.komut.ara": "Dizinde metinle arar",
    "yardim.komut.benzer": "Dizinde bir görüntüye en benzer görüntüleri bulur",
    "yardim.komut.sifir_atis": "Eğitimsiz, etiket adlarıyla sınıflandırır (CLIP/SigLIP)",
    "yardim.komut.arama_olc": "Sınıf klasörlü kümede arama başarısını ölçer (recall@k)",
    "yardim.komut.modeller": "Doğrulanmış model kataloğunu listeler",
    "yardim.komut.ornek_veri": "Programla şekil görüntüleri üretir (deneme kümesi)",
    "yardim.komut.sun": "HTTP sunucusunu başlatır (/siniflandir, /ara, /benzer)",
    # ───────────── yardım: seçenekler ─────────────
    "yardim.secenek.hazir": "hazır ayar adı",
    "yardim.secenek.ayar": "yapılandırma dosyası (TOML)",
    "yardim.secenek.degistir": "tek bir ayarı değiştirir, ör. -D egitim.donem=3 (birden çok verilebilir)",
    "yardim.secenek.kuru": "yalnız planı ve bellek/süre kestirimini yazar; eğitim başlamaz",
    "yardim.secenek.azami_piksel": "bir görüntünün en çok piksel sayısı (sıkıştırma bombasına karşı)",
    "yardim.secenek.azami_mb": "bir dosyanın en büyük boyutu (MB)",
    "yardim.secenek.json": "sonucu bu JSON dosyasına da yazar",
    "yardim.secenek.model": "eğitim çıktı klasörü, model/ klasörü ya da .onnx dosyası",
    "yardim.secenek.onnx": "PyTorch yerine ONNX paketiyle çalışır (torch gerekmez)",
    "yardim.secenek.int8": "ONNX'in int8 nicemlenmiş sürümünü kullanır",
    "yardim.secenek.veri": "sınıf klasörlü değerlendirme verisi (verilmezse eğitimdeki test ayrımı)",
    "yardim.secenek.goruntuler": "görüntü dosyaları ya da klasörler",
    "yardim.secenek.ilk": "gösterilecek en olası sınıf sayısı",
    "yardim.secenek.paket_cikti": "paket klasörü (varsayılan: <eğitim çıktısı>/paket)",
    "yardim.secenek.int8_yok": "int8 nicemlenmiş sürümü üretmez",
    "yardim.secenek.gomme_model": "gömme modeli: siglip2 (çok dilli), clip, histogram ya da HF kimliği",
    "yardim.secenek.klasor": "görüntü klasörü",
    "yardim.secenek.dizin": "arama dizini klasörü",
    "yardim.secenek.yigin": "bir seferde işlenen görüntü sayısı",
    "yardim.secenek.metin": "arama metni",
    "yardim.secenek.k": "sonuç sayısı",
    "yardim.secenek.sorgu_goruntu": "sorgu görüntüsü",
    "yardim.secenek.etiketler": 'virgülle ayrılmış etiketler, ör. "ayakkabı,çanta,saat"',
    "yardim.secenek.dil": "istem şablonlarının dili (tr: SigLIP 2 için; en: CLIP için)",
    "yardim.secenek.sinifli_klasor": "sınıf başına alt klasör içeren klasör",
    "yardim.secenek.girdi": "görüntü dosyası ya da klasörü",
    "yardim.secenek.cikti_klasor": "çıktı klasörü",
    "yardim.secenek.boyut": "hedef genişlik (kare kutuda kenar) piksel",
    "yardim.secenek.yukseklik": "hedef yükseklik (0: --boyut ile aynı)",
    "yardim.secenek.kip": "sigdir: kırpmadan sığdır · kirp: doldur ve ortadan kırp · doldur: kenarlara dolgu · kisa-kenar",
    "yardim.secenek.bicim": "çıktı biçimi (ayni: kaynağın biçimi)",
    "yardim.secenek.kalite": "kayıplı biçimlerde kalite",
    "yardim.secenek.kucuk_resim": "verilirse bu kenarda kare küçük resim de yazar (WebP)",
    "yardim.secenek.buyut": "küçük görüntüleri büyütmeye izin verir (varsayılan: büyütme yok)",
    "yardim.secenek.icc_sil": "renk profilini (ICC) de siler (varsayılan: korunur, renkler doğru kalsın)",
    "yardim.secenek.yerinde": "dosyaları yerinde temizler (önce yedek alın)",
    "yardim.secenek.rapor": "rapor JSON dosyasının yolu",
    "yardim.secenek.yontem": "algısal özet yöntemi",
    "yardim.secenek.esik": "en çok bu kadar bit farklıysa kopya sayılır (varsayılan: phash/dhash 8, ahash 6)",
    "yardim.secenek.tasi": "her gruptan en iyisi kalır, ötekiler bu klasöre taşınır (silinmez)",
    "yardim.secenek.egitim": "eğitim klasörü",
    "yardim.secenek.sinama": "sınama (test/doğrulama) klasörü",
    "yardim.secenek.gorev": "yalnız bu görevin modelleri",
    "yardim.secenek.sinif_basi": "sınıf başına görüntü sayısı",
    "yardim.secenek.kopya_orani": "yakın kopya eklenme oranı (kopya-farkında ayrımı göstermek için)",
    "yardim.secenek.tohum": "rastgelelik tohumu",
    "yardim.secenek.sun_model": "sınıflandırma paketi (.onnx ya da paket klasörü)",
    "yardim.secenek.adres": "dinlenecek adres (varsayılan yalnız bu bilgisayar)",
    "yardim.secenek.kapi": "kapı numarası",
}


def t(key: str, **values: object) -> str:
    """İletiyi yer tutucularıyla döndürür; anahtar yoksa hatanın yerini söyler."""
    try:
        template = MESSAGES[key]
    except KeyError as exc:
        raise KeyError(f"İleti anahtarı yok: {key!r} (goruntu/messages.py içine ekleyin)") from exc
    return template.format(**values)
