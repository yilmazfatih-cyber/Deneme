"""``ornekler/`` klasöründeki hazır kümelerin tanımı, üretimi ve veri kartları.

Her örnek bir komut satırı çağrısıdır (``python -m verihavuzu uret …``); üretim aynı çağrıyı
süreç içinde çalıştırır, sonra her klasöre ``VERI_KARTI.md`` ve köke ``uretim.json`` (komut, tohum,
dosya boyutu, satır sayısı, SHA-256) yazar. ``tests/test_ornekler.py`` aynı komutları geçici
klasörde yeniden çalıştırıp dosyaların BAYT BAYT aynı olduğunu doğrular.
Genişletme: yeni örnek için ``EXAMPLES``e bir kayıt ekleyin, ``python scripts/build_examples.py``
çalıştırın ve boyut sınırını (dosya ≤ ~1 MB, toplam ≤ ~8 MB) denetleyin.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from verihavuzu import __version__
from verihavuzu.files import json_text, write_text_atomic
from verihavuzu.kalite.dictionary import data_dictionary_markdown
from verihavuzu.kalite.schema import load_contract

MANIFEST = "uretim.json"
CARD = "VERI_KARTI.md"


@dataclass(frozen=True)
class Example:
    ad: str
    amac: str
    arguman: list[str]
    yapi: list[str] = field(default_factory=list)  # bilinen yapı / doğru cevaplar

    @property
    def tohum(self) -> int:
        return int(self.arguman[self.arguman.index("--tohum") + 1])

    def argv(self, out_dir: Path) -> list[str]:
        return [*self.arguman, "--cikti", str(out_dir / self.ad)]

    def command(self) -> str:
        return "python -m verihavuzu " + " ".join([*self.arguman, "--cikti", f"ornekler/{self.ad}"])


EXAMPLES = [
    Example(
        "kisiler",
        "Kişi tablosu: doğrulama, profil, maskeleme ve yineleme alıştırması.",
        ["uret", "kisiler", "--adet", "500", "--tohum", "42", "--sema"],
        [
            "İlçe her zaman ile bağlıdır; posta kodunun ilk iki hanesi plakadır.",
            "TCKN, e-posta benzersizdir; TCKN sağlaması geçerlidir ama numaralar uydurmadır.",
        ],
    ),
    Example(
        "sirketler",
        "Şirket tablosu: VKN, IBAN ve unvan alanları.",
        ["uret", "sirketler", "--adet", "200", "--tohum", "42", "--sema"],
        ["Telefonun alan kodu şirketin ilinindir; IBAN banka kodu tr/banka_kodlari.json'dandır."],
    ),
    Example(
        "eticaret",
        "İlişkisel e-ticaret: müşteri → sipariş → kalem → iade (+ ürünler).",
        ["uret", "eticaret", "--adet", "300", "--tohum", "42", "--sema"],
        [
            "siparisler.ara_toplam = Σ siparis_kalemleri.tutar; "
            "toplam = ara_toplam + kargo_ucreti.",
            "Kampanya günlerinde sipariş sayısı belirgin yüksektir (Kasım kampanyası ×4).",
            "Ürün popülerliği Zipf dağılımlıdır (populerlik_sirasi 1 en çok satan).",
            "Haftalık desen: Cumartesi en yoğun gün; aylık desen: Kasım–Aralık en yoğun aylar.",
            "İade yalnız teslim edilmiş siparişte olur; iade_tarihi > teslim_tarihi.",
        ],
    ),
    Example(
        "faturalar",
        "Excel-TR biçiminde (';', BOM, ondalık virgül) faturalar ve kalemleri.",
        ["uret", "faturalar", "--adet", "80", "--tohum", "42", "--excel-tr", "--sema"],
        [
            "Her kalemde matrah + kdv_tutari = tutar; faturada matrah + kdv_tutari = genel_toplam.",
            "KDV oranları %1/%10/%20 (ayarla değiştirilebilir); ürün–oran eşlemesi kurgusaldır.",
        ],
    ),
    Example(
        "banka",
        "Banka hesapları ve 12 aylık hareketler (JSONL).",
        ["uret", "banka", "--adet", "10", "--tohum", "42", "--bicim", "jsonl", "--sema"],
        [
            "Her hesapta bakiye[i] = bakiye[i−1] + tutar[i] ve bakiye hiç eksiye düşmez.",
            "Doğalgaz faturası Kasım–Mart aylarında yüksektir.",
        ],
    ),
    Example(
        "zaman_serisi",
        "İki günlük seri: eğilim, mevsimsellik, tatil etkisi, etiketli anomali.",
        ["uret", "zaman_serisi", "--adet", "730", "--tohum", "42", "--sema"],
        [
            "beklenen = egilim × haftalik_etki × yillik_etki × (tatilse 0,55).",
            "anomali=true satırlar gerçek cevaptır (ani_artis, ani_dusus, seviye_kaymasi, eksik).",
        ],
    ),
    Example(
        "churn",
        "Nedensel yapısı bilinen müşteri kaybı kümesi (model sınaması için).",
        ["uret", "churn", "--adet", "5000", "--tohum", "42", "--sema"],
        [
            "Gerçek katsayılar (logit): sabit −1,2 · aylık sözleşme +1,1 · kıdem_ay −0,04 · "
            "destek_talebi +0,35 · ödeme_gecikmesi +0,55 · kullanım_saat −0,03 · "
            "aylık_ücret/100 +0,08.",
            "eposta_acma_orani, yas, bolge, rastgele_ozellik churn'e DOĞRUDAN etki etmez; "
            "eposta_acma_orani gizli bir 'ilgi' değişkeni üzerinden kullanımla ilişkilidir.",
            "gercek_olasilik yalnız değerlendirme içindir; modele girdi yapmayın (sızıntı).",
        ],
    ),
    Example(
        "destek",
        "Kalıptan üretilmiş kısa destek talepleri (tablo/arayüz denemesi).",
        ["uret", "destek", "--adet", "600", "--tohum", "42", "--sema"],
        [
            "Metinler ~40 kalıptan üretilir; dil modeli eğitim verisi değildir.",
            "Açık taleplerde cozum_suresi_saat ve memnuniyet boştur.",
        ],
    ),
    Example(
        "web_olaylari",
        "Web oturumları ve satın alma hunisi (JSONL).",
        ["uret", "web_olaylari", "--adet", "800", "--tohum", "42", "--bicim", "jsonl", "--sema"],
        [
            "Huni: sayfa_goruntuleme → urun_goruntuleme → sepete_ekle → odeme_baslat → satin_al.",
            "Bir oturumda olaylar zamanla artar; satin_al varsa öncesinde odeme_baslat vardır.",
        ],
    ),
    Example(
        "kirli_faturalar",
        "Kirli veri: temiz karşılık + bozulma kaydıyla temizleme alıştırması.",
        [
            "uret",
            "faturalar",
            "--adet",
            "40",
            "--tohum",
            "7",
            "--tablo",
            "faturalar",
            "--kirli",
            "--kirlilik",
            "0.08",
            "--sema",
        ],
        [
            "faturalar.bozulmalar.jsonl her bozulmanın satırını, sütununu, türünü, temiz ve kirli "
            "değerini taşır; kirli satır k'nin temiz karşılığı "
            "k − (önceki yineleme satırı sayısı).",
            "Bozulmalar: eksik, yineleme, yazım hatası, tarih biçimi, ondalık, mojibake, boşluk.",
            "faturalar.sema.json TEMİZ verinin şemasıdır; kirli dosya bilerek ona uymaz.",
        ],
    ),
]


def _row_count(path: Path) -> int:
    data = path.read_bytes()
    if path.suffix == ".jsonl":
        return data.count(b"\n")
    if path.suffix == ".csv":
        return data.count(b"\n") - 1
    return 0


def file_records(folder: Path) -> list[dict[str, Any]]:
    records = []
    for path in sorted(folder.iterdir()):
        if path.name == CARD:
            continue
        data = path.read_bytes()
        records.append(
            {
                "ad": path.name,
                "satir": _row_count(path),
                "bayt": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    return records


def render_card(example: Example, folder: Path) -> str:
    files = file_records(folder)
    lines = [
        f"# Veri kartı: {example.ad}",
        "",
        "> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek "
        "değildir; numaraların yalnız sağlama haneleri geçerlidir. "
        "Gerçek bir kişiyi tanımlamak için kullanmayın.",
        "",
        "## Amaç",
        "",
        example.amac,
        "",
        "## Üretim",
        "",
        f"- Komut: `{example.command()}`",
        f"- Tohum: {example.tohum} · üreteç: verihavuzu {__version__}",
        "- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).",
        "",
        "## Dosyalar",
        "",
        "| Dosya | Satır | Bayt |",
        "| --- | --- | --- |",
    ]
    lines += [f"| `{f['ad']}` | {f['satir'] or '-'} | {f['bayt']} |" for f in files]
    lines += ["", "## Bilinen yapı ve doğru cevaplar", ""] + [f"- {item}" for item in example.yapi]
    lines += ["", "## Sütunlar", ""]
    for schema in sorted(folder.glob("*.sema.json")):
        lines.append(data_dictionary_markdown(load_contract(schema), heading_level=3))
    lines += [
        "## Sınırlar",
        "",
        "- Dağılımlar ve oranlar KURGUSALDIR; "
        "gerçek bir nüfus, pazar ya da kurum istatistiği değildir.",
        "- Ad/soyad listeleri ve adres kalıpları `tr/` klasöründendir; sıklık bilgisi taşımaz.",
        "",
        "## Lisans",
        "",
        "Bu depodaki kodla üretildi; üçüncü taraf içerik ya da gerçek kişi verisi içermez. "
        "Deponun lisansı proje sahibince belirlenir.",
        "",
    ]
    return "\n".join(lines)


def build_example(example: Example, out_dir: Path) -> Path:
    """Örneği ``out_dir/<ad>`` klasörüne üretir ve veri kartını yazar."""
    from verihavuzu.cli.main import main  # döngüsel içe aktarmayı önler

    folder = out_dir / example.ad
    if folder.exists():
        for path in folder.iterdir():
            path.unlink()
    with contextlib.redirect_stdout(io.StringIO()):
        code = main(example.argv(out_dir))
    if code != 0:
        raise RuntimeError(f"{example.ad} üretilemedi (çıkış kodu {code}).")
    write_text_atomic(folder / CARD, render_card(example, folder))
    return folder


def build_all(out_dir: Path) -> dict[str, Any]:
    manifest: dict[str, Any] = {"surum": __version__, "kumeler": []}
    for example in EXAMPLES:
        folder = build_example(example, out_dir)
        manifest["kumeler"].append(
            {
                "ad": example.ad,
                "komut": example.command(),
                "tohum": example.tohum,
                "dosyalar": file_records(folder),
            }
        )
    write_text_atomic(out_dir / MANIFEST, json_text(manifest))
    return manifest
