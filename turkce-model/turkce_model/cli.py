"""Komut satırı: ``python -m turkce_model <komut>``.

Sıra: tdk-indir → tdk-derlem → (meb-pdf, meb-mmlu) → tokenizer-egit → veri-hazirla → egit --asama tdk → egit --asama meb.
``durum`` her an nerede olduğunu ve sıradaki komutu söyler.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .ayarlar import (
    Ayarlar,
    AyarHatasi,
    GOMME_KARARLARI,
    KARAR_VER,
    ayarlari_yukle,
    gomme_uyarilari,
    gommeyi_dogrula,
)

VARSAYILAN_AYARLAR = "ayarlar.toml"


def _ayarlar(arg: argparse.Namespace) -> Ayarlar:
    yol = Path(arg.ayarlar) if arg.ayarlar else (Path(VARSAYILAN_AYARLAR) if Path(VARSAYILAN_AYARLAR).exists() else None)
    ayarlar = ayarlari_yukle(yol, arg.ayar)
    if arg.deney:
        ayarlar.deney = arg.deney
    return ayarlar


def _yol(ayarlar: Ayarlar, *parcalar: str) -> Path:
    return ayarlar.veri_klasoru.joinpath(*parcalar)


# --------------------------------------------------------------------------------------------
# Veri komutları
# --------------------------------------------------------------------------------------------


def komut_tdk_indir(arg, ayarlar: Ayarlar) -> None:
    from . import tdk

    liste_yolu = _yol(ayarlar, "tdk", "kelimeler.txt")
    if liste_yolu.exists() and not arg.liste_yenile:
        kelimeler = tdk.kelime_listesi_oku(liste_yolu)
        print(f"Kelime listesi hazır: {len(kelimeler)} madde başı ({liste_yolu})")
    else:
        kelimeler = tdk.kelime_listesi_indir(liste_yolu)
        print(f"Kelime listesi indirildi: {len(kelimeler)} madde başı → {liste_yolu}")
    sayac = tdk.maddeleri_indir(
        kelimeler, _yol(ayarlar, "tdk", "maddeler.jsonl"), bekleme=arg.bekleme, ornek=arg.ornek, tohum=arg.tohum
    )
    print(f"Sonuç: {sayac}")


def komut_tdk_derlem(arg, ayarlar: Ayarlar) -> None:
    from . import tdk

    maddeler_yolu = _yol(ayarlar, "tdk", "maddeler.jsonl")
    if not maddeler_yolu.exists():
        raise AyarHatasi("Önce TDK maddelerini indir: python -m turkce_model tdk-indir")
    maddeler = list(tdk.maddeleri_oku(maddeler_yolu))
    sayac = tdk.derlem_olustur(maddeler, _yol(ayarlar, "tdk", "derlem.jsonl"), yazar_ekle=arg.yazar)
    print(f"Derlem: {sayac['egitim']} eğitim + {sayac['dogrulama']} doğrulama belgesi, {sayac['karakter']:,} karakter")
    kelimeler = tdk.kelime_listesi_oku(_yol(ayarlar, "tdk", "kelimeler.txt"))
    kokler = tdk.kokleri_cikar(kelimeler, maddeler)
    tdk.kokleri_yaz(kokler, _yol(ayarlar, "tdk", "kokler.tsv"))
    turler: dict[str, int] = {}
    for _, _, tur in kokler:
        turler[tur] = turler.get(tur, 0) + 1
    print(f"Kök sözlüğü: {len(kokler)} biçim {turler} → {_yol(ayarlar, 'tdk', 'kokler.tsv')}")


def komut_meb_mmlu(arg, ayarlar: Ayarlar) -> None:
    from . import meb

    try:
        sorular = meb.mmlu_indir(_yol(ayarlar, "meb", "turkishmmlu.jsonl"))
    except RuntimeError as e:  # ağ hatası ya da beklenmeyen veri biçimi
        raise AyarHatasi(str(e)) from e
    print(f"TurkishMMLU: {len(sorular)} soru. Yalnız değerlendirmede kullanılır, eğitime hiç girmez.")
    if _yol(ayarlar, "meb", "meb_pdf.jsonl").exists():
        print("meb_pdf.jsonl bundan önce üretilmiş: meb-pdf'i yeniden çalıştır, TurkishMMLU ile aynı kökteki sorular eğitimden çıkarılsın.")


def komut_meb_pdf(arg, ayarlar: Ayarlar) -> None:
    from . import meb

    klasor = Path(arg.klasor) if arg.klasor else _yol(ayarlar, "meb", "pdf")
    if not meb.pdf_dosyalari(klasor):  # .pdf ve .PDF, alt klasörler dahil
        raise AyarHatasi(
            f"{klasor} içinde PDF yok. MEB soru kitapçıklarını (cevap anahtarlı) tarayıcıyla indirip bu klasöre koy.\n"
            "Not: odsgm.meb.gov.tr ve cdn.eba.gov.tr robots.txt dosyaları otomatik indirmeyi yasakladığı için bu araç "
            "MEB sitelerinden indirme yapmaz. README'deki 'MEB soruları' bölümüne bak."
        )
    hedef = _yol(ayarlar, "meb", "meb_pdf.jsonl")
    # TurkishMMLU (değerlendirme) indirilmişse onunla aynı kökteki PDF soruları eğitime alınmaz.
    mmlu_yolu = _yol(ayarlar, "meb", "turkishmmlu.jsonl")
    haric_kokler = [s.soru for s in meb.soru_oku(mmlu_yolu)] if mmlu_yolu.exists() else []
    try:
        rapor = meb.pdf_klasoru_ayristir(klasor, hedef, haric_kokler=haric_kokler)
    except (FileNotFoundError, RuntimeError) as e:  # pymupdf yok, hiçbir PDF okunamadı…
        raise AyarHatasi(str(e)) from e
    sorular = meb.bol(meb.soru_oku(hedef))
    meb.soru_yaz(sorular, hedef)
    dagilim: dict[str, int] = {}
    for s in sorular:
        dagilim[s.bolum] = dagilim.get(s.bolum, 0) + 1
    (hedef.with_suffix(".rapor.json")).write_text(json.dumps(rapor, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(sorular)} soru → {hedef} | bölümler: {dagilim}")


# --------------------------------------------------------------------------------------------
# Tokenizer ve veri hazırlama
# --------------------------------------------------------------------------------------------


def _tokenizer_metinleri(ayarlar: Ayarlar):
    from . import tdk

    derlem = _yol(ayarlar, "tdk", "derlem.jsonl")
    if not derlem.exists():
        raise AyarHatasi("TDK derlemi yok. Önce: tdk-indir, sonra tdk-derlem")
    yield from tdk.derlem_oku(derlem)
    meb_yolu = _yol(ayarlar, "meb", "meb_pdf.jsonl")
    if meb_yolu.exists():
        from . import meb

        for s in meb.soru_oku(meb_yolu):
            if s.bolum == "egitim":
                yield meb.soru_metni(s)
    ek = _yol(ayarlar, "ek_metin")
    if ek.exists():
        from .veri import ek_metin_belgeleri

        for _, paragraf in ek_metin_belgeleri(ek):
            yield paragraf


def komut_tokenizer_egit(arg, ayarlar: Ayarlar) -> None:
    from . import tdk
    from .egitim import tokenizer_klasoru
    from .tokenizer import egit

    kok_yolu = _yol(ayarlar, "tdk", "kokler.tsv")
    if not kok_yolu.exists():
        raise AyarHatasi("Kök sözlüğü yok. Önce: python -m turkce_model tdk-derlem")
    tok = egit(_tokenizer_metinleri(ayarlar), tdk.kokleri_oku(kok_yolu), ayarlar.tokenizer)
    klasor = tokenizer_klasoru(ayarlar)
    tok.kaydet(klasor)
    print(f"Kaydedildi: {klasor}/sozcukler.tsv (her token'ın kimliği, kategorisi, ana biçimi)")
    print("ID blokları:", ", ".join(f"{k} {a}–{b - 1}" for k, (a, b) in tok.kategori_araliklari().items()))
    for ornek in ("Kitaplarımızdan biri masalardaydı.", "Aşağıdakilerden hangisi doğrudur?"):
        print(f"  {ornek} → {' '.join(tok.parca_listesi(ornek))}")


def komut_tokenizer_dene(arg, ayarlar: Ayarlar) -> None:
    from .egitim import tokenizer_yukle

    tok = tokenizer_yukle(ayarlar)
    metin = " ".join(arg.metin) if arg.metin else sys.stdin.read()
    satirlar = tok.acikla(metin)
    genislik = max((len(p) for _, p, _ in satirlar), default=4)
    for kimlik, parca, kategori in satirlar:
        ek = ""
        ana = tok.analar[kimlik]
        if ana != kimlik:
            ek = f"  (ana: {tok.parcalar[ana]})"
        print(f"{kimlik:>6}  {parca!r:<{genislik + 2}}  {kategori}{ek}")
    print(f"{len(satirlar)} token | geri çözüm: {tok.decode([k for k, _, _ in satirlar])!r}")


def komut_veri_hazirla(arg, ayarlar: Ayarlar) -> None:
    from .egitim import tokenizer_yukle, veri_klasoru
    from .veri import AkisYazici, dogrulamaya_mi, ek_metin_belgeleri, meta_yaz, sorulari_kodla, tokenizer_imzasi

    tok = tokenizer_yukle(ayarlar)
    hedef = veri_klasoru(ayarlar)
    derlem = _yol(ayarlar, "tdk", "derlem.jsonl")
    if not derlem.exists():
        raise AyarHatasi("TDK derlemi yok. Önce: tdk-derlem")
    egitim, dogrulama = AkisYazici(hedef / "tdk_egitim.bin", tok), AkisYazici(hedef / "tdk_dogrulama.bin", tok)
    with derlem.open(encoding="utf-8") as f:
        for satir in f:
            kayit = json.loads(satir)
            (dogrulama if kayit["bolum"] == "dogrulama" else egitim).ekle(kayit["metin"])
    ek = _yol(ayarlar, "ek_metin")
    ek_sayi = 0
    if ek.exists():
        for anahtar, paragraf in ek_metin_belgeleri(ek):
            (dogrulama if dogrulamaya_mi("ek:" + anahtar) else egitim).ekle(paragraf)
            ek_sayi += 1
    meta = {"tokenizer": tokenizer_imzasi(tok), "tdk_egitim": egitim.kapat(), "tdk_dogrulama": dogrulama.kapat(), "ek_paragraf": ek_sayi}
    print(f"TDK akışı: eğitim {meta['tdk_egitim']['token']:,} token, doğrulama {meta['tdk_dogrulama']['token']:,} token")
    if ek_sayi:
        print(f"  (veri/ek_metin'den {ek_sayi} paragraf eklendi)")
    meb_yolu = _yol(ayarlar, "meb", "meb_pdf.jsonl")
    if meb_yolu.exists():
        from . import meb

        sorular = meb.soru_oku(meb_yolu)
        meb.soru_yaz(sorular, hedef / "meb_sorular.jsonl")
        for bolum in ("egitim", "dogrulama"):
            secili = [s for s in sorular if s.bolum == bolum]
            if secili:
                meta[f"meb_{bolum}"] = sorulari_kodla(tok, secili, hedef / f"meb_{bolum}.npz")
        meta["meb_test"] = {"soru": sum(1 for s in sorular if s.bolum == "test")}
        print(f"MEB soruları: {', '.join(f'{k} {v}' for k, v in meta.items() if k.startswith('meb_'))}")
    else:
        print("MEB soruları henüz yok (meb-pdf). Aşama 1 için gerekmez.")
    meta_yaz(hedef, meta)
    print(f"Hazır: {hedef}")


# --------------------------------------------------------------------------------------------
# Model komutları
# --------------------------------------------------------------------------------------------


def komut_hesapla(arg, ayarlar: Ayarlar) -> None:
    import torch

    from .egitim import hiz_olc, tokenizer_klasoru, veri_klasoru
    from .model import TurkceGPT
    from .veri import meta_oku

    gommeyi_dogrula(ayarlar.gomme, ayarlar.model)
    sozluk = ayarlar.tokenizer.boyut
    kategoriler = analar = bicimler = None
    if (tokenizer_klasoru(ayarlar) / "sozcukler.tsv").exists():
        from .egitim import tokenizer_yukle

        tok = tokenizer_yukle(ayarlar)
        sozluk, kategoriler, analar, bicimler = tok.boyut, tok.kategoriler, tok.analar, tok.bicimler
    else:
        kategoriler, analar, bicimler = [0] * sozluk, list(range(sozluk)), [0] * sozluk
        print(f"(Tokenizer henüz yok; sözlük boyutu ayarlardan: {sozluk})")
    with torch.device("meta"):
        model = TurkceGPT(ayarlar.gomme, ayarlar.model, sozluk, kategoriler, analar, bicimler)
    dokum = model.parametre_dokumu()
    print(f"Deney: {ayarlar.deney_adi}")
    print(f"Gömme kararları: {ayarlar.gomme}")
    print(f"Model: {ayarlar.model.katman} katman, {ayarlar.model.bas_sayisi(int(ayarlar.gomme.boyut))} baş × {ayarlar.model.bas_boyutu}, bağlam {ayarlar.model.baglam}")
    for ad, sayi in dokum.items():
        if sayi or ad in ("toplam", "gömme dışı"):
            print(f"  {ad:<24} {sayi:>14,}  ({sayi / max(dokum['toplam'], 1):5.1%})")
    print(f"  ağırlık + AdamW durumu (fp32): ~{dokum['toplam'] * 16 / 1e9:.2f} GB (etkinleştirmeler hariç)")
    meta = meta_oku(veri_klasoru(ayarlar))
    if meta:
        token = meta["tdk_egitim"]["token"]
        print(f"  TDK eğitim verisi: {token:,} token → parametre başına {token / dokum['toplam']:.2f} token")
        print("  (Chinchilla kuralı ~20 token/parametre önerir; altında kalınca ezberleme riski artar.)")
    for uyari in gomme_uyarilari(ayarlar.gomme):
        print(f"  ! {uyari}")
    if arg.olc:
        print("Hız ölçülüyor (rastgele veriyle birkaç adım)…")
        print(f"  {hiz_olc(ayarlar, sozluk)}")


def komut_egit(arg, ayarlar: Ayarlar) -> None:
    from .egitim import egit

    for uyari in gomme_uyarilari(ayarlar.gomme):
        print(f"! {uyari}")
    egit(ayarlar, arg.asama, devam=arg.devam, sifirdan=arg.sifirdan, cihaz=arg.cihaz)


def komut_degerlendir(arg, ayarlar: Ayarlar) -> None:
    from .egitim import degerlendir

    degerlendir(ayarlar, arg.asama, cihaz=arg.cihaz, kontrol_noktasi=Path(arg.model) if arg.model else None)


def _model_yukle(arg, ayarlar: Ayarlar):
    from .egitim import cihaz_sec, modeli_yukle, tokenizer_yukle

    tok = tokenizer_yukle(ayarlar)
    cihaz = arg.cihaz or cihaz_sec()
    if arg.model:
        yol = Path(arg.model)
    else:
        yol = next(
            (ayarlar.deney_klasoru / a / "en_iyi.pt" for a in ("meb", "tdk") if (ayarlar.deney_klasoru / a / "en_iyi.pt").exists()),
            None,
        )
        if yol is None:
            raise AyarHatasi(f"{ayarlar.deney_klasoru} altında eğitilmiş model yok. --model ile yol ver ya da önce eğit.")
    model, _ = modeli_yukle(yol, tok, cihaz)
    return model, tok, cihaz


def komut_uret(arg, ayarlar: Ayarlar) -> None:
    from .uretim import metin_uret

    model, tok, cihaz = _model_yukle(arg, ayarlar)
    istem = " ".join(arg.metin)
    print(istem + metin_uret(model, tok, istem, arg.uzunluk, arg.sicaklik, arg.ust_k, cihaz, arg.tohum))


def komut_tanimla(arg, ayarlar: Ayarlar) -> None:
    from .uretim import tanimla

    model, tok, cihaz = _model_yukle(arg, ayarlar)
    for kelime in arg.kelime:
        print(f"{kelime}\n{tanimla(model, tok, kelime, uzunluk=arg.uzunluk, sicaklik=arg.sicaklik, cihaz=cihaz, tohum=arg.tohum)}\n")


def komut_sor(arg, ayarlar: Ayarlar) -> None:
    import random

    from .meb import HARFLER, istem, soru_oku
    from .uretim import soru_cevapla

    model, tok, cihaz = _model_yukle(arg, ayarlar)
    kaynaklar = [ayarlar.cikti_klasoru / "veri" / "meb_sorular.jsonl", _yol(ayarlar, "meb", "turkishmmlu.jsonl")]
    sorular = [s for yol in kaynaklar if yol.exists() for s in soru_oku(yol) if s.bolum in ("test", "")]
    if not sorular:
        raise AyarHatasi("Test sorusu yok: meb-pdf ya da meb-mmlu çalıştır.")
    rnd = random.Random(arg.tohum)
    for s in rnd.sample(sorular, min(arg.adet, len(sorular))):
        print(istem(s))
        olasiliklar = soru_cevapla(model, tok, s, cihaz)
        secim = max(olasiliklar, key=lambda x: x[1])[0]
        print("  model: " + "  ".join(f"{h} %{100 * p:.0f}" for h, p in olasiliklar))
        print(f"  modelin seçimi {secim} | doğru cevap {HARFLER[s.cevap]} {'✓' if secim == HARFLER[s.cevap] else '·'}\n")


def komut_durum(arg, ayarlar: Ayarlar) -> None:
    from .egitim import tokenizer_klasoru, veri_klasoru

    v = ayarlar.veri_klasoru
    meb_hazir = (veri_klasoru(ayarlar) / "meb_egitim.npz").exists()
    adimlar = [
        ("TDK kelime listesi", v / "tdk" / "kelimeler.txt", "tdk-indir"),
        ("TDK maddeleri", v / "tdk" / "maddeler.jsonl", "tdk-indir (kaldığı yerden sürer)"),
        ("TDK derlemi + kök sözlüğü", v / "tdk" / "kokler.tsv", "tdk-derlem"),
        ("Tokenizer", tokenizer_klasoru(ayarlar) / "sozcukler.tsv", "tokenizer-egit"),
        ("Hazır veri", veri_klasoru(ayarlar) / "meta.json", "veri-hazirla"),
        ("Aşama 1 modeli (TDK)", ayarlar.deney_klasoru / "tdk" / "en_iyi.pt", "egit --asama tdk"),
        ("MEB soruları (elle indirilen PDF'ler)", v / "meb" / "meb_pdf.jsonl", "meb-pdf"),
        ("MEB soruları hazır veride", veri_klasoru(ayarlar) / "meb_egitim.npz", "veri-hazirla"),
        ("Aşama 2 modeli (MEB)", ayarlar.deney_klasoru / "meb" / "en_iyi.pt", "egit --asama meb"),
        ("TurkishMMLU (değerlendirme, isteğe bağlı)", v / "meb" / "turkishmmlu.jsonl", "meb-mmlu"),
    ]
    siradaki = None
    for ad, yol, komut in adimlar:
        var = yol.exists()
        print(f"  [{'x' if var else ' '}] {ad:<42} {komut if not var else ''}")
        if not var and siradaki is None and "isteğe bağlı" not in ad:
            siradaki = komut
    if not meb_hazir and (v / "meb" / "meb_pdf.jsonl").exists() and siradaki == "egit --asama meb":
        siradaki = "veri-hazirla"
    eksik = ayarlar.gomme.eksikler()
    if eksik:
        print(f"\nGömme kararları bekliyor ({len(eksik)}/{len(GOMME_KARARLARI)}): {', '.join(eksik)} → GOMME_KARARLARI.md")
    else:
        print(f"\nGömme kararları tamam. Deney adı: {ayarlar.deney_adi}")
    if siradaki:
        print(f"Sıradaki adım: python -m turkce_model {siradaki}")
    md = ayarlar.cikti_klasoru / "ilerleme.md"
    if md.exists():
        print(f"İlerleme tablosu: {md}")


# --------------------------------------------------------------------------------------------


def ayristirici() -> argparse.ArgumentParser:
    ana = argparse.ArgumentParser(prog="python -m turkce_model", description="Sıfırdan Türkçe dil modeli")
    ortak = argparse.ArgumentParser(add_help=False)
    ortak.add_argument("--ayarlar", help=f"Ayar dosyası (varsayılan: ./{VARSAYILAN_AYARLAR})")
    ortak.add_argument("--ayar", action="append", default=[], metavar="BOLUM.ALAN=DEGER", help="Ayarı geçersiz kıl (tekrarlanabilir)")
    ortak.add_argument("--deney", help="Deney adı (varsayılan: gömme kararlarından türetilir)")
    ortak.add_argument("--cihaz", choices=("cuda", "mps", "cpu"), help="Varsayılan: otomatik")
    alt = ana.add_subparsers(dest="komut", required=True)

    def ekle(ad: str, islev, yardim: str) -> argparse.ArgumentParser:
        p = alt.add_parser(ad, parents=[ortak], help=yardim, description=yardim)
        p.set_defaults(islev=islev)
        return p

    ekle("durum", komut_durum, "Hangi adımlar tamam, sıradaki komut ne?")
    p = ekle("tdk-indir", komut_tdk_indir, "TDK kelime listesini ve madde anlamlarını indir (kaldığı yerden sürer)")
    p.add_argument("--bekleme", type=float, default=0.35, help="İstekler arası bekleme, sn (varsayılan 0.35)")
    p.add_argument("--ornek", type=int, help="Yalnız N maddelik rastgele örneklem (deneme için)")
    p.add_argument("--tohum", type=int, default=0)
    p.add_argument("--liste-yenile", action="store_true", help="Kelime listesini yeniden indir")
    p = ekle("tdk-derlem", komut_tdk_derlem, "İndirilen maddelerden derlem ve kök sözlüğü üret")
    p.add_argument("--yazar", action="store_true", help="Örnek cümlelerin yazar adlarını da ekle")
    ekle("meb-mmlu", komut_meb_mmlu, "TurkishMMLU'nun açık 945 sorusunu indir (yalnız değerlendirme)")
    p = ekle("meb-pdf", komut_meb_pdf, "Elle indirilmiş MEB kitapçıklarını (PDF) ayrıştır")
    p.add_argument("--klasor", help="PDF klasörü (varsayılan: veri/meb/pdf)")
    ekle("tokenizer-egit", komut_tokenizer_egit, "Türkçe kök + ek tokenizer'ını eğit")
    p = ekle("tokenizer-dene", komut_tokenizer_dene, "Bir metnin token'larını, kimliklerini ve kategorilerini göster")
    p.add_argument("metin", nargs="*")
    ekle("veri-hazirla", komut_veri_hazirla, "Derlemi ve soruları token dizilerine çevir")
    p = ekle("hesapla", komut_hesapla, "Gömme kararlarının parametre ve bellek etkisini göster")
    p.add_argument("--olc", action="store_true", help="Bu bilgisayarda birkaç adımla hız da ölç")
    p = ekle("egit", komut_egit, "Modeli eğit")
    p.add_argument("--asama", choices=("tdk", "meb"), required=True)
    p.add_argument("--devam", action="store_true", help="Son kontrol noktasından sürdür")
    p.add_argument("--sifirdan", action="store_true", help="MEB aşamasını TDK modeli olmadan başlat")
    p = ekle("degerlendir", komut_degerlendir, "En iyi modeli değerlendir, ilerleme tablosuna ekle")
    p.add_argument("--asama", choices=("tdk", "meb"), default="tdk")
    p.add_argument("--model", help="Kontrol noktası yolu (varsayılan: deneyin en iyi modeli)")
    for ad, islev, yardim in (
        ("uret", komut_uret, "İstemden metin üret"),
        ("tanimla", komut_tanimla, "Model bir kelimeyi sözlük gibi tanımlasın"),
        ("sor", komut_sor, "Rastgele test sorularını modele sor"),
    ):
        p = ekle(ad, islev, yardim)
        p.add_argument("--model", help="Kontrol noktası (varsayılan: deneyin en iyi modeli)")
        p.add_argument("--tohum", type=int, default=None if ad != "sor" else 0)
        if ad == "uret":
            p.add_argument("metin", nargs="+")
        if ad == "tanimla":
            p.add_argument("kelime", nargs="+")
        if ad == "sor":
            p.add_argument("--adet", type=int, default=3)
        else:
            p.add_argument("--uzunluk", type=int, default=120)
            p.add_argument("--sicaklik", type=float, default=0.8)
            p.add_argument("--ust-k", type=int, default=50)
    return ana


def main(argv: list[str] | None = None) -> int:
    arg = ayristirici().parse_args(argv)
    try:
        ayarlar = _ayarlar(arg)
        arg.islev(arg, ayarlar)
    except AyarHatasi as e:
        print(f"\n{e}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nDurduruldu.", file=sys.stderr)
        return 130
    return 0


__all__ = ["main", "KARAR_VER"]
