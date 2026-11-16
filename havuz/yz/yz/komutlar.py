"""Komut satırı komutlarının gövdeleri (ayrıştırma cli.py'dedir).

Her komut `(args) -> int` imzalı bir işlevdir; 0 başarı demektir. Çıktı insan içindir (Türkçe);
`--json` seçeneği olan komutlar makine için JSON da yazar.
Kim kullanır: cli.py.
Genişletme: yeni komut → burada `komut_xxx(args)` yazın, cli.py'de alt ayrıştırıcısını ekleyin.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from yz.ayar import Ayarlar, ayarlari_yukle
from yz.hatalar import AyarHatasi
from yz.saglayici.kayit import saglayici_olustur
from yz.saglayici.taban import Saglayici


def _ayarlar(args: argparse.Namespace) -> Ayarlar:
    ayarlar = ayarlari_yukle(getattr(args, "ayar", None))
    if getattr(args, "onbellek", False):
        ayarlar.onbellek = True
    return ayarlar


def _saglayici(args: argparse.Namespace, ayarlar: Ayarlar | None = None) -> Saglayici:
    ayarlar = ayarlar or _ayarlar(args)
    return saglayici_olustur(
        ayarlar, getattr(args, "saglayici", None), model=getattr(args, "model", None)
    )


def _yaz(metin: str = "", son: str = "\n") -> None:
    sys.stdout.write(metin + son)
    sys.stdout.flush()


# ----------------------------------------------------------------------------- sohbet


def komut_sohbet(args: argparse.Namespace) -> int:
    from yz.istem.bellek import OzetleyenBellek
    from yz.saglayici.tipler import Mesaj

    saglayici = _saglayici(args)
    if args.arac or args.mcp:
        return _arac_sohbeti(args, saglayici)
    bellek = OzetleyenBellek(saglayici, sistem=args.sistem or "Kısa, doğru ve Türkçe yanıt ver.")
    mesajlar = [args.mesaj] if args.mesaj else None
    while True:
        if mesajlar is not None:
            if not mesajlar:
                return 0
            metin = mesajlar.pop(0)
        else:
            try:
                metin = input("\nSiz: ").strip()
            except (EOFError, KeyboardInterrupt):
                _yaz()
                return 0
            if metin in ("", "/cik", "/çık", "/q"):
                return 0
        bellek.ekle(Mesaj.kullanici(metin))
        _yaz("Yanıt: ", son="")
        parcalar: list[str] = []
        for parca in saglayici.sohbet(bellek.mesajlar(), akis=True):
            if parca.son is None:
                parcalar.append(parca.metin)
                _yaz(parca.metin, son="")
        _yaz()
        bellek.ekle(Mesaj.asistan("".join(parcalar)))


def _arac_sohbeti(args: argparse.Namespace, saglayici: Saglayici) -> int:
    from contextlib import ExitStack

    from yz.ajan.dongu import Ajan
    from yz.ajan.onay import konsoldan_sor
    from yz.arac.hazir import hesap_araci, zaman_araclari
    from yz.arac.kutu import AracKutusu

    with ExitStack() as yigin:
        araclar = [hesap_araci, *zaman_araclari()]
        if args.mcp:
            from yz.mcp.kopru import McpKoprusu

            araclar.extend(yigin.enter_context(McpKoprusu(_mcp_hedefi(args.mcp))).araclar())
        ajan = Ajan(saglayici, AracKutusu(araclar, onay=konsoldan_sor()), sistem=args.sistem,
                    olay=lambda a: _yaz(f"  [{a.arac}] {a.argumanlar} → {a.icerik[:200]}") if a.tur == "arac" else None)  # fmt: skip
        gorev = args.mesaj or input("Görev: ").strip()
        sonuc = ajan.calistir(gorev)
        _yaz(f"\nYanıt: {sonuc.yanit}\n(durma nedeni: {sonuc.durma_nedeni}, kip: {sonuc.kip}, "
             f"{sonuc.kullanim.toplam} belirteç)")  # fmt: skip
        if args.dokum:
            sonuc.dokum_kaydet(args.dokum)
            _yaz(f"Döküm yazıldı: {args.dokum} (görüntülemek için sunucuda /kayit.html)")
    return 0


def _mcp_hedefi(hedef: str) -> Any:
    from mcp import StdioServerParameters

    if hedef.startswith(("http://", "https://")):
        return hedef
    parcalar = hedef.split()
    return StdioServerParameters(command=parcalar[0], args=parcalar[1:])


# ----------------------------------------------------------------------------- RAG


def komut_indeksle(args: argparse.Namespace) -> int:
    from yz.rag.dizin import RagDizini
    from yz.rag.gomme import KarmaGomme, SaglayiciGomme
    from yz.rag.yukleyici import klasor_yukle

    ayarlar = _ayarlar(args)
    klasor = Path(args.dizin) if args.dizin else ayarlar.veri_dizini / "dizin"
    if (klasor / "meta.json").is_file() and not args.sifirla:
        dizin = RagDizini.yukle(
            klasor, _saglayici(args, ayarlar) if args.gomme == "saglayici" else None
        )
    else:
        gomme = (
            SaglayiciGomme(_saglayici(args, ayarlar), args.model or "")
            if args.gomme == "saglayici"
            else KarmaGomme()
        )
        dizin = RagDizini(gomme)
    belgeler = klasor_yukle(args.klasor)
    eklenen = dizin.ekle(belgeler)
    dizin.kaydet(klasor)
    _yaz(f"{len(belgeler)} belge okundu, {eklenen} yeni parça eklendi. Dizin: {klasor} "
         f"(toplam {len(dizin)} parça, {len(dizin.belgeler)} belge)")  # fmt: skip
    return 0


def komut_sor(args: argparse.Namespace) -> int:
    from yz.rag.degerlendir import getirme_olc, sorulari_yukle
    from yz.rag.dizin import RagDizini
    from yz.rag.yanit import RagHatti

    ayarlar = _ayarlar(args)
    klasor = Path(args.dizin) if args.dizin else ayarlar.veri_dizini / "dizin"
    dizin = RagDizini.yukle(klasor, _saglayici(args, ayarlar))
    if args.getirme_olc:
        sorular = sorulari_yukle(args.getirme_olc)
        for kip in ("bm25", "vektor", "karma"):
            _yaz(f"{kip:7} {getirme_olc(dizin, sorular, args.k, kip).ozet()}")
        return 0
    if not args.soru:
        raise AyarHatasi('Soru verilmedi: python -m yz sor "sorunuz"')
    sonuc = RagHatti(dizin, _saglayici(args, ayarlar), k=args.k, kip=args.kip).sor(args.soru)
    if args.json:
        _yaz(json.dumps({"yanit": sonuc.yanit, "atiflar": sonuc.atiflar, "belgede_yok": sonuc.belgede_yok,
                         "uyarilar": sonuc.uyarilar, "kaynaklar": sonuc.kaynakca()}, ensure_ascii=False, indent=2))  # fmt: skip
        return 0
    _yaz(sonuc.yanit)
    for satir in sonuc.kaynakca():
        _yaz(f"  {satir}")
    for uyari in sonuc.uyarilar:
        _yaz(f"  ⚠ {uyari}")
    return 0


# ----------------------------------------------------------------------------- yapılı çıkarım


def komut_cikar(args: argparse.Namespace) -> int:
    from yz.degerlendirme.tanim import sema_yukle
    from yz.yapili.cikar import Cikarici
    from yz.yapili.gbnf import semadan_gbnf

    sema = sema_yukle(args.sema)
    if args.gbnf:
        _yaz(semadan_gbnf(sema.model_json_schema()), son="")
        return 0
    metin = Path(args.dosya).read_text(encoding="utf-8") if args.dosya else args.metin
    if not metin:
        metin = sys.stdin.read()
    katmanlar = args.katmanlar.split(",") if args.katmanlar else None
    cikarici = Cikarici(_saglayici(args), sema, **({"katmanlar": katmanlar} if katmanlar else {}))
    sonuc = cikarici.cikar(metin)
    if sonuc.deger is not None:
        _yaz(sonuc.deger.model_dump_json(indent=2))
    sys.stderr.write(sonuc.rapor() + "\n")
    return 0 if sonuc.basarili else 1


# ----------------------------------------------------------------------------- değerlendirme


def _kosu_klasoru(ayarlar: Ayarlar, ad: str) -> Path:
    import time

    return ayarlar.veri_dizini / "kosular" / f"{ad}-{time.strftime('%Y%m%d-%H%M%S')}"


def komut_degerlendir(args: argparse.Namespace) -> int:
    from yz.degerlendirme.kosu import KosuSonucu, kosu_yap
    from yz.degerlendirme.rapor import gerileme_bul, kosu_html, kosu_md
    from yz.degerlendirme.tanim import tanim_yukle

    ayarlar = _ayarlar(args)
    tanim = tanim_yukle(args.tanim)
    hakem = saglayici_olustur(ayarlar, args.hakem) if args.hakem else None
    kosu = kosu_yap(tanim, _saglayici(args, ayarlar), sinir=args.sinir, es_zamanlilik=args.es_zamanlilik,
                    hakem=hakem, ilerleme=lambda o: _yaz("." if o.gecti else ("H" if o.hata else "x"), son=""))  # fmt: skip
    _yaz()
    klasor = Path(args.cikti) if args.cikti else _kosu_klasoru(ayarlar, tanim.ad)
    kosu.kaydet(klasor)
    rapor = kosu_md(kosu)
    if args.onceki:
        rapor += "\n" + gerileme_bul(KosuSonucu.yukle(args.onceki), kosu).md()
    (klasor / "rapor.md").write_text(rapor, encoding="utf-8")
    (klasor / "rapor.html").write_text(kosu_html(kosu), encoding="utf-8")
    _yaz(rapor)
    _yaz(f"Kayıt: {klasor} (rapor.md, rapor.html, sonuclar.jsonl)")
    return 0


def komut_karsilastir(args: argparse.Namespace) -> int:
    from yz.degerlendirme.karsilastir import karsilastir, karsilastirma_raporu
    from yz.degerlendirme.tanim import tanim_yukle

    ayarlar = _ayarlar(args)
    tanim = tanim_yukle(args.tanim)
    profiller = args.saglayicilar or tanim.saglayicilar
    if args.modeller:
        saglayicilar = [
            saglayici_olustur(ayarlar, (profiller or [None])[0], model=m) for m in args.modeller
        ]
    elif profiller:
        saglayicilar = [saglayici_olustur(ayarlar, p) for p in profiller]
    else:
        raise AyarHatasi(
            "Karşılaştırılacak sağlayıcı yok: --saglayicilar a b ya da --modeller m1 m2 verin."
        )
    klasor = _kosu_klasoru(ayarlar, f"karsilastirma-{tanim.ad}")
    kosular = karsilastir(tanim, saglayicilar, sinir=args.sinir, es_zamanlilik=args.es_zamanlilik,
                          kayit_klasoru=klasor, ilerleme=lambda _m, o: _yaz("." if o.gecti else "x", son=""))  # fmt: skip
    _yaz()
    rapor = karsilastirma_raporu(tanim, kosular)
    klasor.mkdir(parents=True, exist_ok=True)
    (klasor / "karsilastirma.md").write_text(rapor, encoding="utf-8")
    _yaz(rapor)
    _yaz(f"Kayıt: {klasor}")
    return 0


# ----------------------------------------------------------------------------- diğer


def komut_modeller(args: argparse.Namespace) -> int:
    for model in _saglayici(args).modeller():
        _yaz(model.kimlik + (f"  ({model.sahip})" if model.sahip else ""))
    return 0


def komut_sun(args: argparse.Namespace) -> int:
    import uvicorn

    from yz.sunucu.durum import yerel_adres_mi
    from yz.sunucu.uygulama import uygulama_kur

    ayarlar = _ayarlar(args)
    if args.saglayici:
        ayarlar.varsayilan = args.saglayici
    adres = args.adres or ayarlar.sunucu.adres
    kapi = args.kapi if args.kapi is not None else ayarlar.sunucu.kapi
    uygulama = uygulama_kur(ayarlar)
    if not yerel_adres_mi(adres) and uygulama.state.durum.api_anahtari is None:
        raise AyarHatasi(
            f"{adres} adresine açmak için API anahtarı gerekli: {ayarlar.sunucu.api_anahtari_ortam} "
            "ortam değişkenini verin (yalnız bu bilgisayardan erişim için --adres 127.0.0.1)."
        )
    _yaz(f"Sohbet arayüzü: http://{adres}:{kapi}/  (durdurmak için Ctrl+C)")
    uvicorn.run(uygulama, host=adres, port=kapi, log_level="warning")
    return 0


def komut_mcp(args: argparse.Namespace) -> int:
    from yz.mcp.sunucu import calistir, mcp_sunucusu_kur

    sunucu = mcp_sunucusu_kur(belge_klasoru=args.klasor)
    if args.http:
        sys.stderr.write(f"MCP (Streamable HTTP): http://{args.adres}:{args.kapi}/mcp\n")
    calistir(sunucu, http=args.http, adres=args.adres, kapi=args.kapi)
    return 0
