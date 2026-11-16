"""Sözlük: kullanıcının gördüğü bütün Türkçe iletiler tek yerde durur.

Kim kullanır: paketin her yeri `t("anahtar", ad=deger)` ile ileti üretir; tablo başlıkları için
`headers("anahtar")`. Komut satırı yardım metinleri `cli.py` içindedir (argparse tanımıyla yan yana).

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
        "`python -m ince_ayar veri donustur --bicim alpaca|sharegpt --girdi … --cikti …`"
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
        "`[egitim] dengesizlik = \"agirlikli-kayip\"` deneyin ve doğruluğa değil makro F1'e bakın."
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
    "istatistik.basliklar": "örnek|en az|ortalama|p50|p90|p95|p99|en çok",
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
    # ───────────── tablo başlıkları ─────────────
    "siniflandirma.tablo": "sınıf|kesinlik|duyarlılık|F1|örnek",
    "siniflandirma.matris": "gerçek \\ tahmin|Karışıklık matrisi (satır: gerçek, sütun: tahmin)",
    "siniflandirma.ozet": "doğruluk|makro F1",
}


def t(key: str, **params: object) -> str:
    """Sözlükten iletiyi alır ve yer tutucuları doldurur."""
    return MESSAGES[key].format(**params)


def headers(key: str) -> list[str]:
    """`|` ile ayrılmış başlık listesini döndürür (tablo başlıkları için)."""
    return MESSAGES[key].split("|")
