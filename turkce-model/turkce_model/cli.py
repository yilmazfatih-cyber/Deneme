"""Komut satırı: ``python -m turkce_model <komut>``.

Sıra: tdk-indir → tdk-derlem → (meb-mmlu, meb-pdf) → tokenizer-egit → veri-hazirla → egit --asama tdk → egit --asama meb.
``durum`` her an nerede olduğunu ve sıradaki komutu söyler.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import sys
from dataclasses import fields
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
    if arg.ayarlar:
        yol = Path(arg.ayarlar)
    elif Path(VARSAYILAN_AYARLAR).is_file():
        yol = Path(VARSAYILAN_AYARLAR)
    else:
        raise AyarHatasi(
            f"{VARSAYILAN_AYARLAR} bulunamadı ({Path.cwd()}). Komutları turkce-model klasöründe çalıştır "
            "ya da --ayarlar <dosya> ver."
        )
    ayarlar = ayarlari_yukle(yol, arg.ayar)
    if arg.deney:
        ayarlar.deney = arg.deney
    return ayarlar


def _yol(ayarlar: Ayarlar, *parcalar: str) -> Path:
    return ayarlar.veri_klasoru.joinpath(*parcalar)


def _sayi(n: int | float) -> str:
    from .metin import binlik

    return binlik(n)


def _toml_degeri(deger) -> str:
    if isinstance(deger, bool):
        return "true" if deger else "false"
    if isinstance(deger, str):
        return f'"{deger}"'
    return str(deger)


# --------------------------------------------------------------------------------------------
# Veri komutları
# --------------------------------------------------------------------------------------------


def komut_tdk_indir(arg, ayarlar: Ayarlar) -> None:
    from . import tdk

    liste_yolu = _yol(ayarlar, "tdk", "kelimeler.txt")
    try:
        if liste_yolu.exists() and not arg.liste_yenile:
            kelimeler = tdk.kelime_listesi_oku(liste_yolu)
            print(f"Kelime listesi hazır: {_sayi(len(kelimeler))} madde başı ({liste_yolu})")
        else:
            kelimeler = tdk.kelime_listesi_indir(liste_yolu)
            print(f"Kelime listesi indirildi: {_sayi(len(kelimeler))} madde başı → {liste_yolu}")
        sayac = tdk.maddeleri_indir(
            kelimeler, _yol(ayarlar, "tdk", "maddeler.jsonl"), bekleme=arg.bekleme, ornek=arg.ornek, tohum=arg.tohum
        )
    except RuntimeError as e:  # ağ hatası ya da beklenmeyen veri biçimi
        raise AyarHatasi(str(e)) from e
    print(f"Sonuç: {tdk.sayac_metni(sayac)}")


def komut_tdk_derlem(arg, ayarlar: Ayarlar) -> None:
    from . import tdk

    maddeler_yolu = _yol(ayarlar, "tdk", "maddeler.jsonl")
    if not maddeler_yolu.exists():
        raise AyarHatasi("Önce TDK maddelerini indir: python -m turkce_model tdk-indir")
    maddeler = list(tdk.maddeleri_oku(maddeler_yolu))
    sayac = tdk.derlem_olustur(maddeler, _yol(ayarlar, "tdk", "derlem.jsonl"), yazar_ekle=arg.yazar)
    print(
        f"Derlem: {_sayi(sayac['egitim'])} eğitim + {_sayi(sayac['dogrulama'])} doğrulama belgesi, "
        f"{_sayi(sayac['karakter'])} karakter"
    )
    kelimeler = tdk.kelime_listesi_oku(_yol(ayarlar, "tdk", "kelimeler.txt"))
    kokler = tdk.kokleri_cikar(kelimeler, maddeler)
    tdk.kokleri_yaz(kokler, _yol(ayarlar, "tdk", "kokler.tsv"))
    turler: dict[str, int] = {}
    for _, _, tur in kokler:
        turler[tur] = turler.get(tur, 0) + 1
    tur_adlari = {"fiil": "fiil gövdesi", "kok": "madde başı", "ses": "ses değişimli", "kural": "kuralla", "daralma": "daralmalı"}
    dokum = ", ".join(f"{tur_adlari.get(t, t)} {_sayi(n)}" for t, n in sorted(turler.items(), key=lambda x: -x[1]))
    print(f"Kök sözlüğü: {_sayi(len(kokler))} biçim ({dokum}) → {_yol(ayarlar, 'tdk', 'kokler.tsv')}")


def komut_meb_mmlu(arg, ayarlar: Ayarlar) -> None:
    from . import meb

    try:
        sorular = meb.mmlu_indir(_yol(ayarlar, "meb", "turkishmmlu.jsonl"))
    except RuntimeError as e:  # ağ hatası ya da beklenmeyen veri biçimi
        raise AyarHatasi(str(e)) from e
    print(f"TurkishMMLU: {len(sorular)} soru. Yalnız değerlendirmede kullanılır, eğitime hiç girmez.")
    if _yol(ayarlar, "meb", "meb_pdf.jsonl").exists():
        print(
            "Not: meb_pdf.jsonl bundan önce üretilmiş. TurkishMMLU ile soru kökü aynı olan PDF soruları eğitimden "
            "çıkarılsın diye meb-pdf'i, sonra veri-hazirla'yı yeniden çalıştır; MEB modeli eğitildiyse "
            "egit --asama meb --uzerine-yaz ile yeniden eğit."
        )


def komut_meb_pdf(arg, ayarlar: Ayarlar) -> None:
    from . import meb

    klasor = Path(arg.klasor) if arg.klasor else _yol(ayarlar, "meb", "pdf")
    if not meb.pdf_dosyalari(klasor):  # .pdf ve .PDF, alt klasörler dahil
        raise AyarHatasi(
            f"{klasor} içinde PDF yok. MEB soru kitapçıklarını (cevap anahtarlı) tarayıcıyla indirip bu klasöre koy.\n"
            "Not: MEB ve EBA sitelerinin robots.txt dosyaları yapay zekâ tarayıcılarını ve botları yasakladığı için "
            "bu araç bu sitelerden indirme yapmaz. README'deki 'MEB soruları' bölümüne bak."
        )
    hedef = _yol(ayarlar, "meb", "meb_pdf.jsonl")
    # TurkishMMLU (değerlendirme) indirilmişse onunla soru kökü aynı olan PDF soruları eğitime alınmaz.
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
    bolumler = ", ".join(f"{ad} {dagilim[b]}" for b, ad in (("egitim", "eğitim"), ("dogrulama", "doğrulama"), ("test", "test")) if b in dagilim)
    print(f"{len(sorular)} soru → {hedef} ({bolumler})")
    if not mmlu_yolu.exists():
        print("İpucu: TurkishMMLU'yu (meb-mmlu) önce indirirsen onunla aynı sorular eğitimden çıkarılır.")


# --------------------------------------------------------------------------------------------
# Tokenizer ve veri hazırlama
# --------------------------------------------------------------------------------------------


def _tokenizer_metinleri(ayarlar: Ayarlar):
    """Tokenizer'ın eğitim metinleri: yalnız eğitim bölümleri (doğrulama ve test metinleri sözlüğe sızmaz)."""
    from . import tdk
    from .veri import dogrulamaya_mi, ek_metin_belgeleri

    derlem = _yol(ayarlar, "tdk", "derlem.jsonl")
    if not derlem.exists():
        raise AyarHatasi("TDK derlemi yok. Önce: tdk-indir, sonra tdk-derlem")
    yield from tdk.derlem_oku(derlem, "egitim")
    meb_yolu = _yol(ayarlar, "meb", "meb_pdf.jsonl")
    if meb_yolu.exists():
        from . import meb

        for s in meb.soru_oku(meb_yolu):
            if s.bolum == "egitim":
                yield meb.soru_metni(s)
    ek = _yol(ayarlar, "ek_metin")
    if ek.exists():
        for anahtar, paragraf in ek_metin_belgeleri(ek):
            if not dogrulamaya_mi("ek:" + anahtar):
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
    print("Kimlik blokları:", ", ".join(f"{k} {a}–{b - 1}" for k, (a, b) in tok.kategori_araliklari().items()))
    for ornek in ("Kitaplarımızdan biri masalardaydı.", "Aşağıdakilerden hangisi doğrudur?"):
        print(f"  {ornek} → {' '.join(tok.parca_listesi(ornek))}")


def komut_tokenizer_dene(arg, ayarlar: Ayarlar) -> None:
    from .egitim import tokenizer_yukle
    from .metin import normallestir

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
    geri = tok.decode([k for k, _, _ in satirlar])
    print(f"{len(satirlar)} token | geri çözüm: {geri!r}")
    if geri != metin and geri == normallestir(metin):
        print("(Girdiden farkı yalnız normalleştirme: tırnak/tire sadeleşir, boşluklar toparlanır.)")


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
    # Ek metnin doğrulama payı ayrı bir akışa gider: TDK doğrulaması (ve BPC'si) deneyler arasında hep aynı kalır.
    ek = _yol(ayarlar, "ek_metin")
    ek_sayi = 0
    ek_dogrulama = None
    if ek.exists():
        for anahtar, paragraf in ek_metin_belgeleri(ek):
            if dogrulamaya_mi("ek:" + anahtar):
                if ek_dogrulama is None:
                    ek_dogrulama = AkisYazici(hedef / "ek_dogrulama.bin", tok)
                ek_dogrulama.ekle(paragraf)
            else:
                egitim.ekle(paragraf)
            ek_sayi += 1
    meta = {"tokenizer": tokenizer_imzasi(tok), "tdk_egitim": egitim.kapat(), "tdk_dogrulama": dogrulama.kapat(), "ek_paragraf": ek_sayi}
    if ek_dogrulama is not None:
        meta["ek_dogrulama"] = ek_dogrulama.kapat()
    else:
        (hedef / "ek_dogrulama.bin").unlink(missing_ok=True)
    print(
        f"Eğitim akışı: {_sayi(meta['tdk_egitim']['token'])} token | TDK doğrulama: "
        f"{_sayi(meta['tdk_dogrulama']['token'])} token"
    )
    if ek_sayi:
        ek_dog = meta.get("ek_dogrulama", {}).get("belge", 0)
        print(f"  veri/ek_metin: {ek_sayi} paragraf ({ek_sayi - ek_dog} eğitime, {ek_dog} ayrı ek doğrulamaya)")
    meb_yolu = _yol(ayarlar, "meb", "meb_pdf.jsonl")
    for eski in ("meb_egitim.npz", "meb_dogrulama.npz", "meb_sorular.jsonl"):
        (hedef / eski).unlink(missing_ok=True)  # eski MEB verisi kalmasın
    if meb_yolu.exists():
        from . import meb

        sorular = meb.soru_oku(meb_yolu)
        meb.soru_yaz(sorular, hedef / "meb_sorular.jsonl")
        parcalar = []
        for bolum, ad in (("egitim", "eğitim"), ("dogrulama", "doğrulama")):
            secili = [s for s in sorular if s.bolum == bolum]
            if secili:
                meta[f"meb_{bolum}"] = sorulari_kodla(tok, secili, hedef / f"meb_{bolum}.npz")
                parcalar.append(f"{ad} {meta[f'meb_{bolum}']['soru']} soru ({_sayi(meta[f'meb_{bolum}']['token'])} token)")
        meta["meb_test"] = {"soru": sum(1 for s in sorular if s.bolum == "test")}
        parcalar.append(f"test {meta['meb_test']['soru']} soru")
        print(f"MEB soruları: {', '.join(parcalar)}")
    else:
        print("MEB soruları henüz yok (meb-pdf). Aşama 1 için gerekmez.")
    meta_yaz(hedef, meta)
    print(f"Hazır: {hedef}")


# --------------------------------------------------------------------------------------------
# Model komutları
# --------------------------------------------------------------------------------------------


def _bellek_gb(cihaz: str) -> float | None:
    """Cihazın toplam belleği (GB); bilinmiyorsa None."""
    if cihaz == "cuda":
        import torch

        return torch.cuda.get_device_properties(0).total_memory / 1e9
    with contextlib.suppress(AttributeError, ValueError, OSError):
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1e9
    return None


def komut_hesapla(arg, ayarlar: Ayarlar) -> None:
    import torch

    from .egitim import cihaz_dogrula, egitim_bellegi_gb, hiz_olc, tokenizer_klasoru, veri_klasoru
    from .model import TurkceGPT
    from .veri import meta_oku

    gommeyi_dogrula(ayarlar.gomme, ayarlar.model)
    cihaz = cihaz_dogrula(arg.cihaz)
    sozluk = ayarlar.tokenizer.boyut
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
    g, m = ayarlar.gomme, ayarlar.model
    print(f"Deney: {ayarlar.deney_adi}")
    print("Gömme kararları: " + ", ".join(f"{f.name} = {_toml_degeri(getattr(g, f.name))}" for f in fields(g)))
    print(f"Model: {m.katman} katman, {m.bas_sayisi(int(g.boyut))} baş × {m.bas_boyutu}, bağlam {m.baglam}, sözlük {sozluk}")
    for ad, sayi in dokum.items():
        if sayi or ad in ("toplam", "gömme dışı"):
            print(f"  {ad:<24} {_sayi(sayi):>14}  (%{100 * sayi / max(dokum['toplam'], 1):5.1f})")
    agirlik = dokum["toplam"] * 16 / 1e9
    etkin = egitim_bellegi_gb(ayarlar, sozluk)
    print(
        f"  Eğitim belleği (yaklaşık, fp32): ağırlık + AdamW ~{agirlik:.2f} GB, aktivasyon + logit ~{etkin:.1f} GB "
        f"(yığın {ayarlar.tdk.yigin} × bağlam {m.baglam} × sözlük {sozluk})"
    )
    toplam_bellek = _bellek_gb(cihaz)
    if toplam_bellek and agirlik + etkin > 0.7 * toplam_bellek:
        print(
            f"  ! Bu, cihazın belleği (~{toplam_bellek:.0f} GB) için fazla olabilir: egitim.tdk.yigin'i küçült, "
            "egitim.tdk.birikim'i aynı oranda büyüt (yığın × birikim aynı kalırsa eğitim aynı kalır)."
        )
    meta = meta_oku(veri_klasoru(ayarlar))
    if meta:
        token = meta["tdk_egitim"]["token"]
        print(f"  Eğitim verisi: {_sayi(token)} token → parametre başına {token / dokum['toplam']:.2f} token")
        print("  (Chinchilla kuralı ~20 token/parametre önerir; altında kalınca ezberleme riski artar.)")
    for uyari in gomme_uyarilari(ayarlar.gomme):
        print(f"  ! {uyari}")
    if arg.olc:
        print("Hız ölçülüyor (rastgele veriyle birkaç adım)…")
        h = hiz_olc(ayarlar, sozluk, cihaz=cihaz)
        satir = (
            f"  {h['cihaz']} ({h['hassasiyet']}), yığın {h['yigin']}: saniyede ~{_sayi(round(h['token_sn']))} token, "
            f"adım başına {h['adim_sn']:.2f} sn"
        )
        if "en_yuksek_bellek_gb" in h:
            satir += f", en yüksek GPU belleği {h['en_yuksek_bellek_gb']:.1f} GB"
        print(satir)


def komut_egit(arg, ayarlar: Ayarlar) -> int:
    from .egitim import egit

    gommeyi_dogrula(ayarlar.gomme, ayarlar.model)  # uyarılardan önce: geçersiz değerde açıklamalı hata
    for uyari in gomme_uyarilari(ayarlar.gomme):
        print(f"! {uyari}")
    sonuc = egit(ayarlar, arg.asama, devam=arg.devam, sifirdan=arg.sifirdan, cihaz=arg.cihaz, uzerine_yaz=arg.uzerine_yaz)
    return 130 if sonuc.get("durduruldu") else 0


def komut_degerlendir(arg, ayarlar: Ayarlar) -> None:
    from .egitim import degerlendir

    degerlendir(ayarlar, arg.asama, cihaz=arg.cihaz, kontrol_noktasi=Path(arg.model) if arg.model else None)


def _model_yukle(arg, ayarlar: Ayarlar):
    from .egitim import cihaz_dogrula, modeli_yukle, tokenizer_yukle

    tok = tokenizer_yukle(ayarlar)
    cihaz = cihaz_dogrula(arg.cihaz)
    if arg.model:
        yol = Path(arg.model)
    else:
        adaylar = [ayarlar.deney_klasoru / a / "en_iyi.pt" for a in ("meb", "tdk")]
        yol = next((y for y in adaylar if y.exists()), None)
        if yol is None:
            raise AyarHatasi(
                f"Bu deneyde eğitilmiş model yok ({ayarlar.deney_klasoru}). Önce eğit; başka bir deney için "
                "--deney <ad>, belirli bir dosya için --model <yol> ver."
            )
    model, kn = modeli_yukle(yol, tok, cihaz)
    print(f"(Model: {yol}, aşama {kn.get('asama', '?')}, adım {kn.get('adim', '?')})", file=sys.stderr)
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
        tanim = tanimla(model, tok, kelime, uzunluk=arg.uzunluk, sicaklik=arg.sicaklik, ust_k=arg.ust_k, cihaz=cihaz, tohum=arg.tohum)
        print(f"{kelime}\n{tanim}\n")


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
        print(f"  modelin seçimi {secim} | doğru cevap {HARFLER[s.cevap]} {'(doğru)' if secim == HARFLER[s.cevap] else ''}\n")


# --------------------------------------------------------------------------------------------
# Durum
# --------------------------------------------------------------------------------------------


def _zaman(yol: Path) -> float | None:
    try:
        return yol.stat().st_mtime
    except OSError:
        return None


def _eski_mi(cikti: Path, girdiler: list[Path]) -> bool:
    """Çıktı, girdilerinden en az birinden daha eski mi (girdi sonradan değişmiş)?"""
    z = _zaman(cikti)
    return z is not None and any((g := _zaman(girdi)) is not None and g > z + 1 for girdi in girdiler)


def komut_durum(arg, ayarlar: Ayarlar) -> None:
    from . import meb, tdk
    from .egitim import egitim_durumu_oku, tokenizer_klasoru, veri_klasoru

    v, vk, dk = ayarlar.veri_klasoru, veri_klasoru(ayarlar), ayarlar.deney_klasoru
    kelimeler, maddeler = v / "tdk" / "kelimeler.txt", v / "tdk" / "maddeler.jsonl"
    derlem, kokler = v / "tdk" / "derlem.jsonl", v / "tdk" / "kokler.tsv"
    mmlu, meb_pdf = v / "meb" / "turkishmmlu.jsonl", v / "meb" / "meb_pdf.jsonl"
    sozcukler, meta = tokenizer_klasoru(ayarlar) / "sozcukler.tsv", vk / "meta.json"
    ayar_yolu = Path(arg.ayarlar).resolve() if arg.ayarlar else ayarlar.kok / VARSAYILAN_AYARLAR
    print(f"Ayarlar: {ayar_yolu}")

    def adim(yol: Path, komut: str, girdiler: tuple[Path, ...] = (), eksik_notu: str = "") -> tuple[str, str, str | None]:
        """(işaret, not, önerilecek komut): girdisi çıktısından yeni olan adım eskimiştir."""
        if not yol.exists():
            return " ", komut + eksik_notu, komut
        if _eski_mi(yol, list(girdiler)):
            return "~", f"girdileri sonradan değişti → yeniden: {komut}", komut
        return "x", "", None

    def model_adimi(asama: str) -> tuple[str, str, str | None]:
        yol, komut = dk / asama / "en_iyi.pt", f"egit --asama {asama}"
        durum = egitim_durumu_oku(dk / asama) or {}
        ilerleme = f"adım {durum.get('adim')}/{durum.get('toplam_adim')}" if durum else ""
        if yol.exists() and _eski_mi(yol, [sozcukler]):
            return "~", f"tokenizer sonradan değişti → yeniden: {komut} --uzerine-yaz", f"{komut} --uzerine-yaz"
        if durum.get("durum") in ("suruyor", "durduruldu"):
            return ("~" if yol.exists() else " "), f"{ilerleme}, bitmedi → sürdür: {komut} --devam", f"{komut} --devam"
        if yol.exists():
            return "x", ilerleme + (" (erken durdurma)" if durum.get("durum") == "erken_durdu" else ""), None
        return " ", komut, komut

    if maddeler.exists():
        n = tdk.indirilen_sayisi(maddeler)
        toplam = len(tdk.kelime_listesi_oku(kelimeler)) if kelimeler.exists() else 0
        if toplam and n < toplam:  # örneklem: sürdürmeyi engellemez, yalnız bilgi
            madde_adimi = ("~", f"{_sayi(n)}/{_sayi(toplam)} madde; tamamı için: tdk-indir (kaldığı yerden sürer)", None)
        else:
            madde_adimi = ("x", f"{_sayi(n)} madde", None)
    else:
        madde_adimi = (" ", "tdk-indir", "tdk-indir")

    # README'deki sırayla. Aşama 1 zinciri sıradaki adımı belirler; MEB adımları aşama 2 içindir.
    kelime_adimi = adim(kelimeler, "tdk-indir")
    if kelimeler.exists():
        kelime_adimi = ("x", f"{_sayi(len(tdk.kelime_listesi_oku(kelimeler)))} madde başı", None)
    asama1 = [
        ("TDK kelime listesi", *kelime_adimi),
        ("TDK maddeleri", *madde_adimi),
        ("TDK derlemi + kök sözlüğü", *adim(kokler, "tdk-derlem", (maddeler,))),
    ]
    meb_adimlari = [
        ("TurkishMMLU (yalnız değerlendirme)", *adim(mmlu, "meb-mmlu", (), "  (isteğe bağlı; meb-pdf'ten önce)")),
        ("MEB soruları (elle indirilen PDF'ler)", *adim(meb_pdf, "meb-pdf", (mmlu,), "  (aşama 2 için)")),
    ]
    asama1_devam = [
        ("Tokenizer", *adim(sozcukler, "tokenizer-egit", (kokler, derlem))),
        ("Hazır veri", *adim(meta, "veri-hazirla", (sozcukler, derlem))),
        ("Aşama 1 modeli (TDK)", *model_adimi("tdk")),
    ]
    asama2 = []
    if meb_pdf.exists():
        asama2.append(("MEB soruları hazır veride", *adim(vk / "meb_egitim.npz", "veri-hazirla", (meb_pdf, sozcukler))))
    asama2.append(("Aşama 2 modeli (MEB)", *model_adimi("meb")))

    for ad, isaret, not_, _ in asama1 + meb_adimlari + asama1_devam + asama2:
        print(f"  [{isaret}] {ad:<40} {not_}")

    siradaki = next((k for _, _, _, k in asama1 + asama1_devam if k), None)
    if siradaki is None:
        # Aşama 2: TurkishMMLU yalnız meb-pdf'ten önce önerilir (aynı soruların eğitimden çıkarılması için).
        meb_sirasi = (meb_adimlari if not meb_pdf.exists() else meb_adimlari[1:]) + asama2
        siradaki = next((k for _, _, _, k in meb_sirasi if k), None)
    elif siradaki == "tokenizer-egit" and not meb_pdf.exists():
        print("\nİpucu: MEB kitapçıklarını tokenizer'dan önce eklersen (meb-mmlu, meb-pdf) soru kelimeleri de sözlüğe girer.")
    eksik = ayarlar.gomme.eksikler()
    if eksik:
        print(f"\nGömme kararları bekliyor ({len(eksik)}/{len(GOMME_KARARLARI)}): {', '.join(eksik)} → GOMME_KARARLARI.md")
    else:
        print(f"\nGömme kararları tamam. Deney adı: {ayarlar.deney_adi}")
    if eksik and (siradaki is None or siradaki.startswith("egit")):
        print("Sıradaki adım: ayarlar.toml'daki [gomme] kararlarını doldur (GOMME_KARARLARI.md)")
    elif siradaki:
        print(f"Sıradaki adım: python -m turkce_model {siradaki}")
        if siradaki == "meb-pdf" and not meb.pdf_dosyalari(v / "meb" / "pdf"):
            print("  (önce MEB kitapçıklarını tarayıcıyla indirip veri/meb/pdf klasörüne koy; README, 3. adım)")
    else:
        print("Bütün adımlar tamam. Sonuçlar için: python -m turkce_model degerlendir")
        if not mmlu.exists():
            print("İsteğe bağlı: python -m turkce_model meb-mmlu (eğitimde hiç görülmemiş sorularla ölçüm)")
    md = ayarlar.cikti_klasoru / "ilerleme.md"
    if md.exists():
        print(f"İlerleme tablosu: {md}")


# --------------------------------------------------------------------------------------------


def ayristirici() -> argparse.ArgumentParser:
    ana = argparse.ArgumentParser(prog="python -m turkce_model", description="Sıfırdan Türkçe dil modeli")
    ortak = argparse.ArgumentParser(add_help=False)
    ortak.add_argument("--ayarlar", help=f"Ayar dosyası (varsayılan: ./{VARSAYILAN_AYARLAR})")
    ortak.add_argument("--ayar", action="append", default=[], metavar="BOLUM.ALAN=DEGER", help="Ayarı geçersiz kıl (tekrarlanabilir)")
    ortak.add_argument("--deney", help="Deney adı; deneyin klasörünü seçer (varsayılan: ayarlardan türetilir)")
    ortak.add_argument("--cihaz", choices=("cuda", "mps", "cpu"), help="Varsayılan: otomatik (cuda > mps > cpu)")
    alt = ana.add_subparsers(dest="komut", required=True, metavar="komut")

    def ekle(ad: str, islev, yardim: str) -> argparse.ArgumentParser:
        p = alt.add_parser(ad, parents=[ortak], help=yardim, description=yardim)
        p.set_defaults(islev=islev)
        return p

    ekle("durum", komut_durum, "Hangi adımlar tamam, sıradaki komut ne?")
    p = ekle("tdk-indir", komut_tdk_indir, "TDK kelime listesini ve madde anlamlarını indir (kaldığı yerden sürer)")
    p.add_argument("--bekleme", type=float, default=0.35, help="İstekler arası bekleme, sn (varsayılan 0.35)")
    p.add_argument("--ornek", type=int, help="Yalnız N maddelik rastgele örneklem (deneme için)")
    p.add_argument("--tohum", type=int, default=0, help="Örneklem için rastgelelik tohumu")
    p.add_argument("--liste-yenile", action="store_true", help="Kelime listesini yeniden indir")
    p = ekle("tdk-derlem", komut_tdk_derlem, "İndirilen maddelerden derlem ve kök sözlüğü üret")
    p.add_argument("--yazar", action="store_true", help="Örnek cümlelerin yazar adlarını da ekle")
    ekle("meb-mmlu", komut_meb_mmlu, "TurkishMMLU'nun açık sorularını indir (944 soru; yalnız değerlendirme)")
    p = ekle("meb-pdf", komut_meb_pdf, "Elle indirilmiş MEB kitapçıklarını (PDF) ayrıştır")
    p.add_argument("--klasor", help="PDF klasörü (varsayılan: veri/meb/pdf)")
    ekle("tokenizer-egit", komut_tokenizer_egit, "Türkçe kök + ek tokenizer'ını eğit")
    p = ekle("tokenizer-dene", komut_tokenizer_dene, "Bir metnin token'larını, kimliklerini ve kategorilerini göster")
    p.add_argument("metin", nargs="*", help="Metin (verilmezse standart girdiden okunur)")
    ekle("veri-hazirla", komut_veri_hazirla, "Derlemi ve soruları token dizilerine çevir")
    p = ekle("hesapla", komut_hesapla, "Gömme kararlarının parametre ve bellek etkisini göster")
    p.add_argument("--olc", action="store_true", help="Bu bilgisayarda birkaç adımla hız da ölç")
    p = ekle("egit", komut_egit, "Modeli eğit")
    p.add_argument("--asama", choices=("tdk", "meb"), required=True, help="tdk: sözlükle ön eğitim, meb: sorularla ince ayar")
    p.add_argument("--devam", action="store_true", help="Son kontrol noktasından sürdür")
    p.add_argument("--uzerine-yaz", action="store_true", help="Bu deneyin bu aşamadaki eski eğitimini silip baştan başla")
    p.add_argument("--sifirdan", action="store_true", help="MEB aşamasını TDK modeli olmadan başlat")
    p = ekle("degerlendir", komut_degerlendir, "Modeli değerlendir, sonucu ilerleme tablosuna ekle")
    p.add_argument("--asama", choices=("tdk", "meb"), help="Varsayılan: deneyde MEB modeli varsa meb, yoksa tdk")
    p.add_argument("--model", help="Kontrol noktası yolu (varsayılan: deneyin en iyi modeli)")
    for ad, islev, yardim in (
        ("uret", komut_uret, "İstemden metin üret"),
        ("tanimla", komut_tanimla, "Model bir kelimeyi sözlük gibi tanımlasın"),
        ("sor", komut_sor, "Rastgele test sorularını modele sor"),
    ):
        p = ekle(ad, islev, yardim)
        p.add_argument("--model", help="Kontrol noktası (varsayılan: deneyin en iyi modeli; önce MEB, yoksa TDK)")
        p.add_argument(
            "--tohum", type=int, default=None if ad != "sor" else 0, help="Rastgelelik tohumu (aynı tohum, aynı çıktı)"
        )
        if ad == "uret":
            p.add_argument("metin", nargs="+", help="Modelin sürdüreceği başlangıç metni")
        if ad == "tanimla":
            p.add_argument("kelime", nargs="+", help="Tanımlanacak kelime(ler)")
        if ad == "sor":
            p.add_argument("--adet", type=int, default=3, help="Kaç soru sorulsun (varsayılan 3)")
        else:
            p.add_argument("--uzunluk", type=int, default=120, help="En fazla kaç token üretilsin (varsayılan 120)")
            p.add_argument("--sicaklik", type=float, default=0.8, help="Örnekleme sıcaklığı; 0 en olası token (varsayılan 0.8)")
            p.add_argument("--ust-k", type=int, default=50, help="Yalnız en olası k token arasından seç (varsayılan 50)")
    return ana


def main(argv: list[str] | None = None) -> int:
    # Windows'ta çıktı dosyaya ya da boruya yönlendirilince kod sayfası (cp1254/cp1252) "→", "▁" gibi işaretleri
    # yazamaz; çökmek yerine kaçış dizisi yazılsın. Türkçe harfler cp1254'te olduğu gibi kalır.
    yeniden = getattr(sys.stdout, "reconfigure", None)
    if yeniden is not None:
        with contextlib.suppress(Exception):
            yeniden(errors="backslashreplace")
    arg = ayristirici().parse_args(argv)
    try:
        ayarlar = _ayarlar(arg)
        kod = arg.islev(arg, ayarlar)
    except AyarHatasi as e:
        print(f"\n{e}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nDurduruldu.", file=sys.stderr)
        return 130
    return kod or 0


__all__ = ["main", "KARAR_VER"]
