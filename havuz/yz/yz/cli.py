"""Komut satırı: `python -m yz <komut>` — yardım metinleri Türkçedir.

Komutlar: sohbet, sor, indeksle, cikar, degerlendir, karsilastir, modeller, sun, mcp.
Her komutta ortak seçenekler: --ayar (yz.yaml yolu), --saglayici (profil), --model.
Hatalar: paketin kendi hataları (YzHatasi) kısa Türkçe iletiyle ve 2 çıkış koduyla biter;
beklenmeyen hatalarda tam iz gösterilir (modele yapıştırılabilsin diye).
Kim kullanır: `python -m yz`, `yz` betiği (pyproject [project.scripts]).
Genişletme: yeni komut → yz/komutlar.py'de `komut_xxx` yazın, aşağıda `alt.add_parser` ekleyin
ve tests/test_cli.py'ye bir çağrı testi koyun.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from typing import Any, NoReturn

from yz import komutlar
from yz.hatalar import YzHatasi


class _TurkceBicim(argparse.RawDescriptionHelpFormatter):
    def add_usage(
        self, usage: str | None, actions: Any, groups: Any, prefix: str | None = None
    ) -> None:
        super().add_usage(usage, actions, groups, "Kullanım: " if prefix is None else prefix)


_CEVIRI = (
    ("the following arguments are required", "şu argümanlar gerekli"),
    ("unrecognized arguments", "tanınmayan argümanlar"),
    ("invalid choice", "geçersiz seçim"),
    ("choose from", "seçenekler"),
    ("expected one argument", "bir değer bekleniyor"),
    ("expected at least one argument", "en az bir değer bekleniyor"),
    ("invalid int value", "geçersiz tam sayı"),
    ("argument", "argüman"),
)


class _TurkceAyristirici(argparse.ArgumentParser):
    def __init__(self, *args: Any, yardim: bool = True, **kwargs: Any) -> None:
        kwargs.setdefault("formatter_class", _TurkceBicim)
        kwargs["add_help"] = False
        super().__init__(*args, **kwargs)
        self._optionals.title = "seçenekler"
        self._positionals.title = "argümanlar"
        if yardim:
            self.add_argument("-h", "--yardim", action="help", help="bu yardımı göster ve çık")

    def error(self, message: str) -> NoReturn:
        for ingilizce, turkce in _CEVIRI:
            message = message.replace(ingilizce, turkce)
        self.print_usage(sys.stderr)
        self.exit(2, f"{self.prog}: hata: {message}\n(yardım için: {self.prog} --yardim)\n")


def _ortak() -> _TurkceAyristirici:
    ortak = _TurkceAyristirici(yardim=False)
    ortak.add_argument("--ayar", help="ayar dosyası (varsayılan: ./yz.yaml ya da YZ_AYAR)")
    ortak.add_argument(
        "--saglayici", help="yz.yaml'daki sağlayıcı profili ya da 'sahte' (modelsiz deneme)"
    )
    ortak.add_argument("--model", help="profildeki model adını bu çalıştırma için değiştirir")
    return ortak


def ayristirici_kur() -> argparse.ArgumentParser:
    ana = _TurkceAyristirici(
        prog="python -m yz",
        description="Küçük dil modelleriyle sohbet, belgeye soru, yapılı çıkarım ve ölçme.",
        epilog='Örnek: python -m yz sohbet --saglayici sahte -m "Merhaba"',
    )
    ana._positionals.title = "komutlar"
    alt = ana.add_subparsers(dest="komut", metavar="<komut>", parser_class=_TurkceAyristirici)
    ortak = _ortak()

    def ekle(ad: str, yardim: str) -> argparse.ArgumentParser:
        p: argparse.ArgumentParser = alt.add_parser(
            ad, help=yardim, description=yardim, parents=[ortak]
        )
        return p

    p = ekle("sohbet", "modelle sohbet (akışlı); --arac ile araç kullanan ajan")
    p.add_argument("-m", "--mesaj", help="tek mesaj gönderip çık (verilmezse etkileşimli)")
    p.add_argument("--sistem", help="sistem istemi")
    p.add_argument("--arac", action="store_true", help="hazır araçlarla (hesap, tarih) ajan kipi")
    p.add_argument("--mcp", help="ajana bir MCP sunucusunun araçlarını bağla (URL ya da komut)")
    p.add_argument("--dokum", help="ajan dökümünü bu .jsonl dosyasına yaz")
    p.set_defaults(islev=komutlar.komut_sohbet)

    p = ekle("indeksle", "klasördeki belgeleri dizinle (txt, md, html, pdf)")
    p.add_argument("klasor", help="belge klasörü")
    p.add_argument("--dizin", help="dizin klasörü (varsayılan: .yz/dizin)")
    p.add_argument("--gomme", choices=["karma", "saglayici"], default="karma",
                   help="karma: bağımlılıksız (varsayılan); saglayici: modelin /v1/embeddings ucu")  # fmt: skip
    p.add_argument("--sifirla", action="store_true", help="var olan dizini silip baştan kur")
    p.set_defaults(islev=komutlar.komut_indeksle)

    p = ekle("sor", "dizinlenmiş belgelere soru sor (kaynak gösterir)")
    p.add_argument("soru", nargs="?", help="soru")
    p.add_argument("--dizin", help="dizin klasörü (varsayılan: .yz/dizin)")
    p.add_argument("--k", type=int, default=4, help="kaç parça getirilsin (varsayılan 4)")
    p.add_argument("--kip", choices=["karma", "bm25", "vektor"], default="karma", help="arama kipi")
    p.add_argument("--getirme-olc", help="soru JSONL'i ile recall@k ve MRR ölç (model çağrılmaz)")
    p.add_argument("--json", action="store_true", help="sonucu JSON yaz")
    p.set_defaults(islev=komutlar.komut_sor)

    p = ekle("cikar", "metinden şemaya uyan JSON çıkar (katmanlı strateji + onarım)")
    p.add_argument(
        "--sema",
        required=True,
        help="paket.modul:Sinif (ör. yz.yapili.semalar:Fatura) ya da sema.json",
    )
    p.add_argument("--metin", help="metin (verilmezse --dosya ya da standart girdi)")
    p.add_argument("--dosya", help="metin dosyası")
    p.add_argument("--katmanlar", help="virgülle: sema,arac,istem,alan (varsayılan hepsi)")
    p.add_argument("--gbnf", action="store_true", help="yalnız llama.cpp GBNF dilbilgisini yaz")
    p.set_defaults(islev=komutlar.komut_cikar)

    p = ekle("degerlendir", "görev kümesini çalıştırıp puanla (rapor.md + rapor.html)")
    p.add_argument("tanim", help="koşu tanımı (ör. gorevler/siniflandirma.yaml)")
    p.add_argument("--sinir", type=int, help="yalnız ilk N örnek")
    p.add_argument("--es-zamanlilik", type=int, help="aynı anda kaç örnek (varsayılan YAML'daki)")
    p.add_argument("--onceki", help="gerileme karşılaştırması için önceki koşu klasörü")
    p.add_argument("--cikti", help="sonuç klasörü (varsayılan .yz/kosular/<ad>-<zaman>)")
    p.add_argument("--hakem", help="hakem puanlayıcısı için sağlayıcı profili")
    p.add_argument(
        "--onbellek", action="store_true", help="yanıt önbelleğini aç (tekrar koşular ücretsiz)"
    )
    p.set_defaults(islev=komutlar.komut_degerlendir)

    p = ekle(
        "karsilastir",
        "aynı görev kümesinde modelleri karşılaştır (doğruluk, biçim, gecikme, maliyet)",
    )
    p.add_argument("tanim", help="koşu tanımı (YAML)")
    p.add_argument("--saglayicilar", nargs="+", help="karşılaştırılacak profiller")
    p.add_argument("--modeller", nargs="+", help="aynı profilde karşılaştırılacak model adları")
    p.add_argument("--sinir", type=int, help="yalnız ilk N örnek")
    p.add_argument("--es-zamanlilik", type=int, help="aynı anda kaç örnek")
    p.add_argument("--onbellek", action="store_true", help="yanıt önbelleğini aç")
    p.set_defaults(islev=komutlar.komut_karsilastir)

    p = ekle("modeller", "sağlayıcının sunduğu modelleri listele")
    p.set_defaults(islev=komutlar.komut_modeller)

    p = ekle("sun", "sohbet sunucusunu ve web arayüzünü başlat (varsayılan kapı 8420)")
    p.add_argument("--adres", help="dinlenecek adres (varsayılan 127.0.0.1)")
    p.add_argument("--kapi", type=int, help="kapı (varsayılan 8420)")
    p.set_defaults(islev=komutlar.komut_sun)

    p = ekle("mcp", "MCP sunucusunu başlat (varsayılan stdio; --http ile Streamable HTTP)")
    p.add_argument("--klasor", help="belge araması ve dosya okuma için klasör")
    p.add_argument("--http", action="store_true", help="stdio yerine HTTP (/mcp) üzerinden sun")
    p.add_argument("--adres", default="127.0.0.1", help="HTTP adresi")
    p.add_argument("--kapi", type=int, default=8421, help="HTTP kapısı (varsayılan 8421)")
    p.set_defaults(islev=komutlar.komut_mcp)
    return ana


def main(argv: Sequence[str] | None = None) -> int:
    ayristirici = ayristirici_kur()
    args = ayristirici.parse_args(argv)
    if not getattr(args, "islev", None):
        ayristirici.print_help()
        return 0
    try:
        return int(args.islev(args))
    except YzHatasi as hata:
        sys.stderr.write(f"Hata: {hata}\n")
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
