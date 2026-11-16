"""Komut satırı ayrıştırıcısı (Türkçe yardım ve hata iletileri) ve komut yönlendirmesi.

Her alt komutun işi ``commands_*.py`` içindeki ``cmd_<ad>(args) -> int`` işlevindedir.
Çıkış kodu: 0 başarı, 1 veri sorunu (doğrulama hatası vb.), 2 kullanım hatası.
Genişletme: yeni komut için ``cmd_x`` işlevini yazın, ``_build`` içinde "YENİ KOMUT BURAYA"
satırının üstüne alt ayrıştırıcısını ekleyin ve ``tests/test_cli.py``ye bir test yazın.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any, NoReturn

from verihavuzu import __version__
from verihavuzu.cli import commands_data as data
from verihavuzu.cli import commands_net as net
from verihavuzu.sentetik.registry import GENERATORS

_TRANSLATIONS = [
    (r"the following arguments are required: (.*)", r"şu bağımsız değişkenler gerekli: \1"),
    (r"unrecognized arguments: (.*)", r"tanınmayan bağımsız değişkenler: \1"),
    (
        r"argument (\S+): invalid choice: (.*) \(choose from (.*)\)",
        r"\1: geçersiz seçim \2 (seçenekler: \3)",
    ),
    (r"argument (\S+): invalid (\w+) value: (.*)", r"\1: geçersiz değer \3"),
    (r"argument (\S+): expected one argument", r"\1: bir değer bekleniyordu"),
    (r"argument (\S+): expected at least one argument", r"\1: en az bir değer bekleniyordu"),
]


class _Formatter(argparse.RawDescriptionHelpFormatter):
    def add_usage(self, usage: Any, actions: Any, groups: Any, prefix: str | None = None) -> None:
        super().add_usage(usage, actions, groups, "kullanım: " if prefix is None else prefix)


class TurkishParser(argparse.ArgumentParser):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("formatter_class", _Formatter)
        kwargs["add_help"] = False
        super().__init__(*args, **kwargs)
        self._positionals.title = "konumsal bağımsız değişkenler"
        self._optionals.title = "seçenekler"
        self.add_argument("-h", "--help", action="help", help="bu yardımı gösterir ve çıkar")

    def error(self, message: str) -> NoReturn:
        for pattern, replacement in _TRANSLATIONS:
            message = re.sub(pattern, replacement, message)
        self.print_usage(sys.stderr)
        self.exit(2, f"{self.prog}: hata: {message}\nYardım için: {self.prog} --help\n")


def _report_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--rapor", type=Path, help="Türkçe Markdown rapor dosyası")
    parser.add_argument("--json", type=Path, help="makine okur JSON rapor dosyası")


def _add_data_commands(sub: Any) -> None:
    generators = "\n".join(
        f"  {g.ad:13s} {g.aciklama} (--adet: {g.adet_anlami}, varsayılan {g.varsayilan_adet})"
        for g in GENERATORS.values()
    )
    p = sub.add_parser(
        "uret",
        help="sentetik veri üretir",
        description="Sentetik (uydurma) veri üretir. Üreteçler:\n" + generators,
        epilog="Örnek: python -m verihavuzu uret eticaret --adet 300 --tohum 42 "
        "--cikti calisma/eticaret --sema",
    )
    p.add_argument("varlik", choices=sorted(GENERATORS), help="üreteç adı")
    p.add_argument("--adet", type=int, help="kaç kayıt (anlamı yukarıdaki listede)")
    p.add_argument("--tohum", type=int, default=42, help="rastgelelik tohumu (varsayılan 42)")
    p.add_argument(
        "--cikti", type=Path, default=Path("calisma/uretilen"), help="dosya ya da klasör"
    )
    p.add_argument("--bicim", choices=["csv", "jsonl", "json", "parquet"], default="csv")
    p.add_argument(
        "--excel-tr", action="store_true", help="CSV'yi ';' + BOM + ondalık virgülle yaz"
    )
    p.add_argument("--tablo", nargs="+", help="yalnız bu tabloları yaz")
    p.add_argument("--sema", action="store_true", help="her tablonun yanına <tablo>.sema.json yaz")
    p.add_argument(
        "--kirli", action="store_true", help="temiz + kirli + bozulma kaydı üç dosya yaz"
    )
    p.add_argument("--kirlilik", type=float, default=0.08, help="hücre başına bozulma olasılığı")
    p.add_argument("--ayar", type=Path, help="e-ticaret/fatura ayar dosyası (JSON)")
    p.set_defaults(func=data.cmd_uret)

    p = sub.add_parser("dogrula", help="dosyayı şemaya ve denetimlere göre doğrular")
    p.add_argument("dosya", type=Path, help="CSV, JSONL ya da JSON dosyası")
    p.add_argument("--sema", type=Path, help="<tablo>.sema.json (JSON Schema)")
    p.add_argument(
        "--denetim", type=Path, help="denetim dosyası (JSON; örnek: docs/ornek-denetimler.json)"
    )
    p.add_argument("--ondalik-virgul", action="store_true", help="CSV'de ondalık ayırıcı virgül")
    _report_options(p)
    p.set_defaults(func=data.cmd_dogrula)

    p = sub.add_parser("profil", help="sütun profili çıkarır (tür, eksik, dağılım, aykırı)")
    p.add_argument("dosya", type=Path)
    _report_options(p)
    p.set_defaults(func=data.cmd_profil)

    p = sub.add_parser("kayma", help="iki dosya arasında kayma (PSI, KS) ölçer")
    p.add_argument("referans", type=Path)
    p.add_argument("yeni", type=Path)
    p.add_argument("--sutun", nargs="+", help="yalnız bu sütunlar")
    _report_options(p)
    p.set_defaults(func=data.cmd_kayma)

    p = sub.add_parser("maskele", help="kişisel veriyi bulur ve maskeler")
    p.add_argument("dosya", type=Path)
    p.add_argument("--cikti", type=Path, help="maskelenmiş dosya (yoksa yalnız rapor)")
    p.add_argument("--yontem", choices=["maskele", "sil", "takma_ad", "bicimli"], default="maskele")
    p.add_argument("--sutun", nargs="+", help="yalnız bu sütunlar")
    _report_options(p)
    p.set_defaults(func=data.cmd_maskele)

    p = sub.add_parser(
        "temizle", help="boşluk, kodlama, tarih/sayı biçimi ve yinelemeleri temizler"
    )
    p.add_argument("dosya", type=Path)
    p.add_argument("--cikti", type=Path, required=True)
    p.add_argument("--degisiklikler", type=Path, help="değişiklik kaydı (JSONL)")
    p.add_argument(
        "--yineleme-sutunlari", nargs="+", help="bulanık yineleme için karşılaştırılacak sütunlar"
    )
    p.set_defaults(func=data.cmd_temizle)

    p = sub.add_parser("ayir", help="sızıntısız eğitim/test ayırması yapar")
    p.add_argument("dosya", type=Path)
    p.add_argument("--yontem", choices=["zaman", "grup", "katmanli"], required=True)
    p.add_argument("--sutun", required=True, help="zaman / grup / etiket sütunu")
    p.add_argument("--oran", type=float, default=0.2, help="test oranı (varsayılan 0,2)")
    p.add_argument("--tohum", type=int, default=0)
    p.add_argument("--bosluk-gun", type=int, default=0, help="zaman ayırmada eğitim–test arası gün")
    p.add_argument("--cikti", type=Path, required=True, help="egitim.* ve test.* yazılacak klasör")
    p.set_defaults(func=data.cmd_ayir)

    p = sub.add_parser("sozluk", help="şemadan Markdown veri sözlüğü üretir")
    p.add_argument("sema", type=Path, nargs="+")
    p.set_defaults(func=data.cmd_sozluk)


def _add_net_commands(sub: Any) -> None:
    p = sub.add_parser("katalog", help="açık veri kümeleri kataloğu")
    inner = p.add_subparsers(
        dest="katalog_komutu",
        required=True,
        metavar="{ara,listele,dogrula}",
        parser_class=TurkishParser,
    )
    search = inner.add_parser("ara", help="katalogda arar")
    search.add_argument("sorgu", nargs="*", help="sözcükler (hepsi geçmeli)")
    search.add_argument("--gorev")
    search.add_argument("--alan")
    search.add_argument("--dil")
    search.add_argument("--ticari", choices=["evet", "hayir", "belirsiz"])
    search.set_defaults(func=net.cmd_katalog_ara)
    inner.add_parser("listele", help="tüm kayıtları listeler").set_defaults(
        func=net.cmd_katalog_listele
    )
    verify = inner.add_parser("dogrula", help="kataloğu Hugging Face API'siyle doğrular (ağ ister)")
    verify.add_argument(
        "--cevrimdisi", action="store_true", help="ağsız: son doğrulamayla karşılaştır"
    )
    verify.set_defaults(func=net.cmd_katalog_dogrula)

    p = sub.add_parser("indir", help="katalogdaki bir kümeyi indirir (ağ ister)")
    p.add_argument("kimlik", help="ör. scikit-learn/iris")
    p.add_argument("--ornek", type=int, help="yalnız ilk N satırı al (en küçük dosyadan)")
    p.add_argument("--cikti", type=Path, default=Path("calisma/indirilen"))
    p.add_argument("--en-buyuk-mb", type=int, default=300)
    p.set_defaults(func=net.cmd_indir)

    p = sub.add_parser("hat", help="veri hatlarını listeler ve çalıştırır")
    inner = p.add_subparsers(
        dest="hat_komutu", required=True, metavar="{listele,calistir}", parser_class=TurkishParser
    )
    inner.add_parser("listele", help="kayıtlı hatlar").set_defaults(func=net.cmd_hat_listele)
    run = inner.add_parser("calistir", help="hattı çalıştırır (ağ ister)")
    run.add_argument("ad")
    run.add_argument("--baslangic", help="YYYY-AA-GG (yoksa kaldığı yerden)")
    run.add_argument("--bitis", help="YYYY-AA-GG (yoksa bugün)")
    run.add_argument("--depo", choices=["sqlite", "duckdb", "csv", "jsonl"], default="sqlite")
    run.add_argument("--depo-yolu", type=Path, help="varsayılan: calisma/hat/<ad>.<uzantı>")
    run.set_defaults(func=net.cmd_hat_calistir)


def _build() -> TurkishParser:
    parser = TurkishParser(
        prog="python -m verihavuzu",
        description="Veri havuzu: Türkçe başvuru verileri, sentetik veri, kalite denetimi, "
        "veri hattı, katalog.\n"
        "Her komutun ayrıntısı için: python -m verihavuzu <komut> --help",
    )
    parser.add_argument(
        "--surum", action="version", version=f"verihavuzu {__version__}", help="sürümü gösterir"
    )
    sub = parser.add_subparsers(
        dest="komut", required=True, metavar="<komut>", parser_class=TurkishParser, title="komutlar"
    )
    _add_data_commands(sub)
    _add_net_commands(sub)
    # YENİ KOMUT BURAYA
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build().parse_args(argv)
    try:
        result: int = args.func(args)
    except (FileNotFoundError, ValueError, KeyError, RuntimeError) as error:
        message = error.args[0] if isinstance(error, KeyError) and error.args else error
        print(f"hata: {message}", file=sys.stderr)
        return 1
    return result
