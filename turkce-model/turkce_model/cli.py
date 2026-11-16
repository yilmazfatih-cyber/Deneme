"""Komut satırı: ``python -m turkce_model <komut>``.

Sıra: tdk-indir → tdk-derlem → (meb-mmlu, meb-pdf) → tokenizer-egit → veri-hazirla → egit --asama tdk → egit --asama meb.
``durum`` her an nerede olduğunu ve sıradaki komutu söyler.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import locale
import math
import os
import shlex
import subprocess
import sys
from dataclasses import dataclass, fields
from pathlib import Path

from .ayarlar import (
    Ayarlar,
    AyarHatasi,
    GOMME_KARARLARI,
    KARAR_VER,
    ayarlari_yukle,
    egitimi_dogrula,
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


def _tirnak(deger: str) -> str:
    """Kopyalanıp çalıştırılacak bir komuttaki değeri tırnaklar: Windows'ta çift tırnak, diğerlerinde kabuk kuralı."""
    if os.name == "nt":
        return subprocess.list2cmdline([deger])
    return shlex.quote(deger)


def _komut_eki(arg: argparse.Namespace, cihaz: bool = False) -> str:
    """Kullanıcıya yazılan komutların sonuna eklenen, deneyi seçen seçenekler: ``--ayarlar``, her ``--ayar``,
    ``--deney`` ve (``cihaz`` ise) ``--cihaz``. Böylece kopyalanan komut aynı ayar dosyasına ve deneye gider."""
    ek = ""
    if getattr(arg, "ayarlar", None):
        ek += f" --ayarlar {_tirnak(arg.ayarlar)}"
    for ayar in getattr(arg, "ayar", None) or []:
        ek += f" --ayar {_tirnak(ayar)}"
    if getattr(arg, "deney", None):
        ek += f" --deney {_tirnak(arg.deney)}"
    if cihaz and getattr(arg, "cihaz", None):
        ek += f" --cihaz {_tirnak(arg.cihaz)}"
    return ek


# --------------------------------------------------------------------------------------------
# Veri komutları
# --------------------------------------------------------------------------------------------


def komut_tdk_indir(arg, ayarlar: Ayarlar) -> int | None:
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
    # Ctrl+C ile kesildiyse 130: "tdk-indir && tdk-derlem" gibi bir zincir yarım indirmeyle sürmesin.
    return 130 if sayac.get("durduruldu") else None


def komut_tdk_derlem(arg, ayarlar: Ayarlar) -> None:
    from . import tdk

    maddeler_yolu = _yol(ayarlar, "tdk", "maddeler.jsonl")
    if not maddeler_yolu.exists():
        raise AyarHatasi("Önce TDK maddelerini indir: python -m turkce_model tdk-indir")
    kelimeler_yolu = _yol(ayarlar, "tdk", "kelimeler.txt")
    if not kelimeler_yolu.exists():  # hiçbir şey yazılmadan: derlem ile kök sözlüğü birbirinden kopmasın
        raise AyarHatasi(
            f"TDK kelime listesi yok ({kelimeler_yolu}); kök sözlüğü ondan çıkarılır. Önce: python -m turkce_model tdk-indir"
        )
    maddeler = list(tdk.maddeleri_oku(maddeler_yolu))
    sayac = tdk.derlem_olustur(maddeler, _yol(ayarlar, "tdk", "derlem.jsonl"), yazar_ekle=arg.yazar)
    print(
        f"Derlem: {_sayi(sayac['egitim'])} eğitim + {_sayi(sayac['dogrulama'])} doğrulama belgesi, "
        f"{_sayi(sayac['karakter'])} karakter"
    )
    kelimeler = tdk.kelime_listesi_oku(kelimeler_yolu)
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
    ayristirici = None
    if arg.ocr:  # OCR modülü kapalıysa (ya da adresi yerel değilse) burada, hiçbir şey yazılmadan durur
        from .moduller.komutlar import meb_ayristirici

        ayristirici = meb_ayristirici(ayarlar, arg.ocr)
    hedef = _yol(ayarlar, "meb", "meb_pdf.jsonl")
    # TurkishMMLU (değerlendirme) indirilmişse onunla soru kökü aynı olan PDF soruları eğitime alınmaz.
    mmlu_yolu = _yol(ayarlar, "meb", "turkishmmlu.jsonl")
    haric_kokler = [s.soru for s in meb.soru_oku(mmlu_yolu)] if mmlu_yolu.exists() else []
    try:
        rapor = meb.pdf_klasoru_ayristir(klasor, hedef, haric_kokler=haric_kokler, ayristirici=ayristirici)
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


def _standart_girdi() -> str:
    """Standart girdiyi okur: önce UTF-8 (BOM'lu da), olmazsa sistemin kod sayfasıyla (bozuk baytlar "�").

    Windows'ta yönlendirilmiş girdi sistemin kod sayfasıyla (cp1254) çözülür; Not Defteri'nin UTF-8 dosyası
    bozuk okunmasın ("Ş" çökertmesin) diye baytlar okunup önce UTF-8 denenir.
    """
    tampon = getattr(sys.stdin, "buffer", None)
    if tampon is None:  # bayt arayüzü olmayan girdi: zaten çözülmüş metin
        return sys.stdin.read()
    ham = tampon.read()
    try:
        return ham.decode("utf-8-sig")
    except UnicodeDecodeError:
        return ham.decode(locale.getpreferredencoding(False), errors="replace")


def komut_tokenizer_dene(arg, ayarlar: Ayarlar) -> None:
    from .egitim import tokenizer_yukle
    from .metin import normallestir

    tok = tokenizer_yukle(ayarlar)
    metin = " ".join(arg.metin) if arg.metin else _standart_girdi()
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
    from .veri import (
        VERI_SURUMU,
        AkisYazici,
        dogrulamaya_mi,
        dosya_imzasi,
        ek_metin_belgeleri,
        meta_yaz,
        sorulari_kodla,
        tokenizer_imzasi,
    )

    tok = tokenizer_yukle(ayarlar)
    hedef = veri_klasoru(ayarlar)
    derlem = _yol(ayarlar, "tdk", "derlem.jsonl")
    if not derlem.exists():
        raise AyarHatasi("TDK derlemi yok. Önce: tdk-derlem")
    # Önce eski meta silinir: yarıda kesilirse boşaltılmış akışların yanında eski meta.json kalmaz ("Hazır veri yok").
    (hedef / "meta.json").unlink(missing_ok=True)
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
    meta = {
        "surum": VERI_SURUMU,
        "tokenizer": tokenizer_imzasi(tok),
        "tdk_egitim": egitim.kapat(),
        "tdk_dogrulama": dogrulama.kapat(),
        "ek_paragraf": ek_sayi,
    }
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
    # Az önce yazılan dosyaların içerik imzaları: eğitim ve durum, verinin değişip değişmediğini bunlardan anlar.
    dosyalar = {
        "tdk_egitim": "tdk_egitim.bin",
        "tdk_dogrulama": "tdk_dogrulama.bin",
        "ek_dogrulama": "ek_dogrulama.bin",
        "meb_egitim": "meb_egitim.npz",
        "meb_dogrulama": "meb_dogrulama.npz",
    }
    meta["imza"] = {ad: dosya_imzasi(hedef / dosya) for ad, dosya in dosyalar.items() if (hedef / dosya).exists()}
    meta_yaz(hedef, meta)
    print(f"Hazır: {hedef}")


# --------------------------------------------------------------------------------------------
# Model komutları
# --------------------------------------------------------------------------------------------


def _windows_bellegi_gb() -> float | None:
    """Windows'ta toplam fiziksel bellek (``GlobalMemoryStatusEx``, GB); okunamazsa None (yalnız uyarı içindir)."""
    try:
        import ctypes

        class _Bellek(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        durum = _Bellek()
        durum.dwLength = ctypes.sizeof(_Bellek)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(durum)):
            return None
        return durum.ullTotalPhys / 1e9 or None
    except Exception:  # noqa: BLE001 — bellek bilgisi yalnız uyarı içindir; okunamazsa uyarı atlanır
        return None


def _bellek_gb(cihaz: str) -> float | None:
    """Cihazın toplam belleği (GB); bilinmiyorsa None."""
    if cihaz == "cuda":
        import torch

        return torch.cuda.get_device_properties(0).total_memory / 1e9
    if sys.platform == "win32":  # Windows'ta os.sysconf yok
        return _windows_bellegi_gb()
    with contextlib.suppress(AttributeError, ValueError, OSError):
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1e9
    return None


def komut_hesapla(arg, ayarlar: Ayarlar) -> None:
    import torch

    from .egitim import cihaz_dogrula, egitim_bellegi_gb, hiz_olc, tokenizer_klasoru, veri_klasoru
    from .model import TurkceGPT
    from .veri import meta_oku

    gommeyi_dogrula(ayarlar.gomme, ayarlar.model)
    # Bellek ve hız hesabı eğitim ayarlarını kullanır: yanlış değer egit'teki gibi açıklamalı hata versin.
    egitimi_dogrula(ayarlar.tdk, "tdk")
    egitimi_dogrula(ayarlar.meb, "meb")
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
    tdk, meb = ayarlar.tdk, ayarlar.meb
    etkin = egitim_bellegi_gb(ayarlar, sozluk, yigin=tdk.yigin)
    # Aşama 2'de yığınların bir kısmı tam bağlamlık TDK pencereleridir: bellek egitim.meb.yigin ile ölçeklenir.
    etkin_meb = egitim_bellegi_gb(ayarlar, sozluk, yigin=meb.yigin)
    print(
        f"  Eğitim belleği (yaklaşık, fp32): ağırlık + AdamW ~{agirlik:.2f} GB, aktivasyon + logit ~{etkin:.1f} GB "
        f"(aşama 1: yığın {tdk.yigin} × bağlam {m.baglam} × sözlük {sozluk})"
    )
    print(
        f"  Aşama 2 (MEB): aktivasyon + logit ~{etkin_meb:.1f} GB (yığın {meb.yigin}; TDK karışım yığınları "
        "tam bağlamdır)"
    )
    print(
        f"  Eğitim sonundaki tam değerlendirme {min(16, tdk.yigin)} pencerelik yığınlarla yapılır "
        "(egitim.tdk.yigin, en fazla 16)."
    )
    toplam_bellek = _bellek_gb(cihaz)
    if toplam_bellek and agirlik + max(etkin, etkin_meb) > 0.7 * toplam_bellek:
        bolum = "egitim.meb" if etkin_meb > etkin else "egitim.tdk"
        print(
            f"  ! Bu, cihazın belleği (~{toplam_bellek:.0f} GB) için fazla olabilir: {bolum}.yigin'i küçült, "
            f"{bolum}.birikim'i aynı oranda büyüt (yığın × birikim aynı kalırsa adım başına dizi sayısı ve eğitim "
            "sırasındaki doğrulama kümesi aynı kalır)."
        )
    meta = meta_oku(veri_klasoru(ayarlar))
    token = (meta.get("tdk_egitim") or {}).get("token") if meta else None
    if isinstance(token, int) and token > 0:
        print(f"  Eğitim verisi: {_sayi(token)} token → parametre başına {token / dokum['toplam']:.2f} token")
        print("  (Chinchilla kuralı ~20 token/parametre önerir; altında kalınca ezberleme riski artar.)")
    for uyari in gomme_uyarilari(ayarlar.gomme):
        print(f"  ! {uyari}")
    if arg.olc:
        print("Hız ölçülüyor (rastgele veriyle birkaç adım)…")
        h = hiz_olc(ayarlar, sozluk, cihaz=cihaz)
        # hiz_olc tek bir mikro yığını ölçer; bir eğitim adımı birikim kadar mikro yığındır.
        adim_sn = h["adim_sn"] * tdk.birikim
        satir = (
            f"  {h['cihaz']} ({h['hassasiyet']}): saniyede ~{_sayi(round(h['token_sn']))} token, adım başına "
            f"(yığın {tdk.yigin} × birikim {tdk.birikim}) ~{adim_sn:.2f} sn"
        )
        if "en_yuksek_bellek_gb" in h:
            satir += f", en yüksek GPU belleği {h['en_yuksek_bellek_gb']:.1f} GB"
        print(satir)


def komut_egit(arg, ayarlar: Ayarlar) -> int:
    from .egitim import egit

    gommeyi_dogrula(ayarlar.gomme, ayarlar.model)  # uyarılardan önce: geçersiz değerde açıklamalı hata
    for uyari in gomme_uyarilari(ayarlar.gomme):
        print(f"! {uyari}")
    sonuc = egit(
        ayarlar,
        arg.asama,
        devam=arg.devam,
        sifirdan=arg.sifirdan,
        cihaz=arg.cihaz,
        uzerine_yaz=arg.uzerine_yaz,
        komut_eki=_komut_eki(arg, cihaz=True),  # yazılan sürdürme/değerlendirme komutları aynı deneye gitsin
    )
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
    # Modelin gördüğü istem yazılır: normalleştirme sondaki boşluğu ve satır sonunu siler; ham istem yazılsaydı
    # kelimeyi sürdüren devam ayrı bir kelime gibi, yeni kelime çift boşlukla görünürdü.
    onek = tok.decode(tok.encode(istem, bos=True))
    print(onek + metin_uret(model, tok, istem, arg.uzunluk, arg.sicaklik, arg.ust_k, cihaz, arg.tohum))


def komut_tanimla(arg, ayarlar: Ayarlar) -> None:
    from .uretim import tanimla

    model, tok, cihaz = _model_yukle(arg, ayarlar)
    for kelime in arg.kelime:
        tanim = tanimla(model, tok, kelime, uzunluk=arg.uzunluk, sicaklik=arg.sicaklik, ust_k=arg.ust_k, cihaz=cihaz, tohum=arg.tohum)
        print(f"{kelime}\n{tanim}\n")


def _olasilik_satiri(olasiliklar: list[tuple[str, float]]) -> tuple[str, str]:
    """``sor`` çıktısı: (modelin şık olasılıkları satırı, modelin seçtiği harf)."""
    secim = max(olasiliklar, key=lambda x: x[1])[0]
    return "  model: " + "  ".join(f"{h} %{100 * p:.0f}" for h, p in olasiliklar), secim


def komut_sor(arg, ayarlar: Ayarlar) -> None:
    import random

    from .meb import HARFLER, istem, soru_oku
    from .uretim import soru_cevapla

    if arg.resim:
        from .moduller.komutlar import resimden_soru

        # Önce fotoğraf okunur: OCR modülü kapalıysa ya da sunucuya ulaşılamazsa model hiç yüklenmeden durur.
        soru = resimden_soru(arg.resim, ayarlar)
        model, tok, cihaz = _model_yukle(arg, ayarlar)
        print(istem(soru))
        satir, secim = _olasilik_satiri(soru_cevapla(model, tok, soru, cihaz))
        print(satir)
        print(f"  modelin seçimi {secim} (soru fotoğraftan okundu; doğru cevap bilinmiyor)\n")
        return
    model, tok, cihaz = _model_yukle(arg, ayarlar)
    kaynaklar = [ayarlar.cikti_klasoru / "veri" / "meb_sorular.jsonl", _yol(ayarlar, "meb", "turkishmmlu.jsonl")]
    sorular = [s for yol in kaynaklar if yol.exists() for s in soru_oku(yol) if s.bolum in ("test", "")]
    if not sorular:
        raise AyarHatasi("Test sorusu yok: meb-pdf ya da meb-mmlu çalıştır.")
    rnd = random.Random(arg.tohum)
    for s in rnd.sample(sorular, min(arg.adet, len(sorular))):
        print(istem(s))
        satir, secim = _olasilik_satiri(soru_cevapla(model, tok, s, cihaz))
        print(satir)
        print(f"  modelin seçimi {secim} | doğru cevap {HARFLER[s.cevap]} {'(doğru)' if secim == HARFLER[s.cevap] else ''}\n")


# --------------------------------------------------------------------------------------------
# Durum
# --------------------------------------------------------------------------------------------

# Her aşamanın eğitim verisi (meta.json "imza" anahtarı; durum.json "veri" bununla karşılaştırılır).
_EGITIM_AKISI = {"tdk": "tdk_egitim", "meb": "meb_egitim"}


def _zaman(yol: Path) -> float | None:
    try:
        return yol.stat().st_mtime
    except OSError:
        return None


def _eski_mi(cikti: Path, girdiler: list[Path]) -> bool:
    """Çıktı, girdilerinden en az birinden daha eski mi (girdi sonradan değişmiş)?"""
    z = _zaman(cikti)
    return z is not None and any((g := _zaman(girdi)) is not None and g > z + 1 for girdi in girdiler)


def _agac(klasor: Path) -> list[Path]:
    """Klasörün kendisi ve altındaki her dosya ve klasör (klasör yoksa boş). Eklenen ya da silinen bir dosya
    bulunduğu klasörün zamanını da yeniler; zamanı eski bir dosya kopyalansa da fark edilir."""
    if not klasor.is_dir():
        return []
    return [klasor, *klasor.rglob("*")]


def _tokenizer_imzasi_oku(klasor: Path) -> str | None:
    """Kayıtlı tokenizer'ın imzası (``veri.tokenizer_imzasi``); dosya yoksa ya da okunamıyorsa None."""
    from .tokenizer import TurkceTokenizer
    from .veri import tokenizer_imzasi

    try:
        return tokenizer_imzasi(TurkceTokenizer.yukle(klasor))
    except Exception:  # noqa: BLE001 — yarım ya da bozuk sözlük dosyası: durum çökmez, "okunamadı" der
        return None


@dataclass
class _Adim:
    """``durum``daki bir satır."""

    ad: str
    isaret: str = "x"
    """Boşluk: yok; "~": yenilenmeli, yarım ya da sürüyor; "x": tamam."""
    not_: str = ""
    komut: str | None = None
    """Önerilen komut (seçenek eki olmadan); varsa "Sıradaki adım" adayıdır."""
    yenilenecek: bool = False
    """Bu adım yapılacak, yeniden yapılacak ya da şu an değişiyor: ona bağlı adımlar da yenilenecek."""
    suruyor: bool = False
    """Aşama şu an bir süreçte eğitiliyor."""


def komut_durum(arg, ayarlar: Ayarlar) -> None:
    """Her adımın durumu ve sıradaki komut.

    Eskime içerikle anlaşılır: hazır veri ve modeller, kaydettikleri tokenizer ve veri imzalarıyla şimdiki
    dosyalar karşılaştırılarak; imzası olmayan eski kayıtlarda ve ham veri adımlarında dosya zamanlarıyla. Bir
    adım yenilenecekse ona bağlı adımlar da "önceki adım yenilenecek" olur. Yazılan her komut bu çağrının
    ``--ayarlar`` / ``--ayar`` / ``--deney`` seçeneklerini taşır.
    """
    from . import meb, tdk
    from .egitim import (
        ASAMALAR,
        BITMIS_DURUMLAR,
        YARIM_DURUMLAR,
        egitim_durumu_oku,
        egitim_suruyor_mu,
        tokenizer_klasoru,
        veri_klasoru,
    )
    from .veri import VERI_SURUMU, meta_oku

    ek = _komut_eki(arg)
    v, vk, dk = ayarlar.veri_klasoru, veri_klasoru(ayarlar), ayarlar.deney_klasoru
    kelimeler, maddeler = v / "tdk" / "kelimeler.txt", v / "tdk" / "maddeler.jsonl"
    derlem, kokler = v / "tdk" / "derlem.jsonl", v / "tdk" / "kokler.tsv"
    mmlu, meb_pdf = v / "meb" / "turkishmmlu.jsonl", v / "meb" / "meb_pdf.jsonl"
    ek_metin = v / "ek_metin"
    sozcukler, meta_yolu = tokenizer_klasoru(ayarlar) / "sozcukler.tsv", vk / "meta.json"
    ayar_yolu = Path(arg.ayarlar).resolve() if arg.ayarlar else ayarlar.kok / VARSAYILAN_AYARLAR
    print(f"Ayarlar: {ayar_yolu}")

    def adim(ad: str, ciktilar: Path | tuple[Path, ...], komut: str, girdiler=(), eksik_notu: str = "") -> _Adim:
        """Dosya üreten adım: çıktılarından biri yoksa yapılacak, bir girdisi çıktısından yeniyse yenilenecek."""
        ciktilar = ciktilar if isinstance(ciktilar, tuple) else (ciktilar,)
        if not all(c.exists() for c in ciktilar):
            return _Adim(ad, " ", f"{komut}{ek}{eksik_notu}", komut, yenilenecek=True)
        if any(_eski_mi(c, list(girdiler)) for c in ciktilar):
            return _Adim(ad, "~", f"girdileri sonradan değişti → yeniden: {komut}{ek}", komut, yenilenecek=True)
        return _Adim(ad)

    def yay(a: _Adim, *onceki: bool) -> _Adim:
        """Bağlı olduğu adımlardan biri yenilenecekse bu adım da yenilenecek; kendi girdileri temizse (``x``)
        "önceki adım yenilenecek" olarak gösterilir. Kendi notu olan ya da eksik adım notunu korur."""
        if any(onceki):
            a.yenilenecek = True
            if a.isaret == "x":
                a.isaret = "~"
                a.not_ = f"{a.not_}; önceki adım yenilenecek" if a.not_ else "önceki adım yenilenecek"
        return a

    # --- TDK: kelime listesi, maddeler, derlem + kök sözlüğü ---------------------------------------
    toplam = len(tdk.kelime_listesi_oku(kelimeler)) if kelimeler.exists() else 0
    if kelimeler.exists():
        kelime = _Adim("TDK kelime listesi", "x", f"{_sayi(toplam)} madde başı")
    else:
        kelime = adim("TDK kelime listesi", kelimeler, "tdk-indir")
    n = tdk.indirilen_sayisi(maddeler) if maddeler.exists() else 0
    if not maddeler.exists():
        madde = adim("TDK maddeleri", maddeler, "tdk-indir")
    elif toplam and n < toplam:  # örneklem: sürdürmeyi engellemez, yalnız bilgi
        madde = _Adim("TDK maddeleri", "~", f"{_sayi(n)}/{_sayi(toplam)} madde; tamamı için: tdk-indir{ek} (kaldığı yerden sürer)")
    else:
        madde = _Adim("TDK maddeleri", "x", f"{_sayi(n)} madde")
    # tdk-derlem ikisini birlikte yazar; tokenizer ve veri-hazirla derleme, tokenizer kök sözlüğüne bakar.
    derlem_adimi = adim("TDK derlemi + kök sözlüğü", (kokler, derlem), "tdk-derlem", (maddeler, kelimeler))
    yay(derlem_adimi, kelime.yenilenecek, madde.yenilenecek)

    # --- MEB soruları (aşama 2) --------------------------------------------------------------------
    mmlu_adimi = adim("TurkishMMLU (yalnız değerlendirme)", mmlu, "meb-mmlu", (), "  (isteğe bağlı; meb-pdf'ten önce)")
    pdfler = meb.pdf_dosyalari(v / "meb" / "pdf")
    # TurkishMMLU sonradan indirildiyse onunla aynı sorular hâlâ eğitimdedir; sonradan eklenen kitapçık da okunmamıştır.
    meb_pdf_adimi = adim("MEB soruları (elle indirilen PDF'ler)", meb_pdf, "meb-pdf", (mmlu, *pdfler), "  (aşama 2 için)")
    meb_pdf_eski = meb_pdf_adimi.isaret == "~"

    # --- Tokenizer: imzası bir kez hesaplanır --------------------------------------------------------
    tok_imza = _tokenizer_imzasi_oku(sozcukler.parent) if sozcukler.exists() else None
    if sozcukler.exists() and tok_imza is None:
        tokenizer = _Adim("Tokenizer", "~", f"sozcukler.tsv okunamadı → yeniden: tokenizer-egit{ek}", "tokenizer-egit", True)
    else:
        tokenizer = adim("Tokenizer", sozcukler, "tokenizer-egit", (kokler, derlem, *_agac(ek_metin)))
    yay(tokenizer, derlem_adimi.yenilenecek)

    # --- Hazır veri: TDK kısmı (TDK modelini etkiler) ve MEB kısmı (yalnız MEB modelini) ayrı izlenir ---
    meta = meta_oku(vk) if meta_yolu.exists() else None
    hazir_tdk = hazir_meb = False
    if meta is None:
        hazir = adim("Hazır veri", meta_yolu, "veri-hazirla")
        if meta_yolu.exists():  # var ama okunamıyor (yarım ya da bozuk)
            hazir = _Adim("Hazır veri", "~", f"meta.json okunamadı → yeniden: veri-hazirla{ek}", "veri-hazirla", True)
        hazir_tdk = hazir_meb = True
    else:
        nedenler: list[str] = []
        if tok_imza is not None and meta.get("tokenizer") != tok_imza:
            nedenler.append("başka bir tokenizer'la hazırlanmış")
        surum = meta.get("surum", 1)
        if not isinstance(surum, int) or surum < VERI_SURUMU:
            nedenler.append("eski biçim")
        if not all((vk / f).exists() for f in ("tdk_egitim.bin", "tdk_dogrulama.bin")):
            nedenler.append("akış dosyası eksik")
        if _eski_mi(meta_yolu, [derlem, *_agac(ek_metin)]):
            nedenler.append("derlem ya da ek metin sonradan değişti")
        elif isinstance(meta.get("ek_paragraf"), int) and meta["ek_paragraf"] > 0 and not ek_metin.exists():
            nedenler.append("veri/ek_metin kaldırılmış")
        hazir_tdk = bool(nedenler)
        if _eski_mi(meta_yolu, [meb_pdf]):
            nedenler.append("MEB soruları sonradan değişti")
            hazir_meb = True
        if nedenler:
            hazir = _Adim("Hazır veri", "~", f"{', '.join(nedenler)} → yeniden: veri-hazirla{ek}", "veri-hazirla", True)
        else:
            hazir = _Adim("Hazır veri", "x", "MEB soruları dahil" if meta.get("meb_egitim") else "")
    onceki = tokenizer.yenilenecek or derlem_adimi.yenilenecek
    yay(hazir, onceki, meb_pdf_eski)
    hazir_tdk = hazir_tdk or onceki
    hazir_meb = hazir_meb or hazir_tdk or meb_pdf_eski
    imzalar = meta.get("imza") if meta is not None and isinstance(meta.get("imza"), dict) else None

    # --- Modeller ---------------------------------------------------------------------------------
    tdk_durumu = egitim_durumu_oku(dk / "tdk") or {}

    def icerik_eskimesi(asama: str, durum: dict, kayit: Path, baslangic: bool = True) -> str | None:
        """Model, kaydettiği tokenizer'dan, eğitim verisinden ya da (MEB) başladığı TDK modelinden farklı
        olanlarla mı duruyor? İmzası olmayan eski koşularda tokenizer dosyasının zamanına bakılır."""
        if not durum.get("tokenizer"):
            return "tokenizer sonradan değişti" if _eski_mi(kayit, [sozcukler]) else None
        if tok_imza is not None and durum["tokenizer"] != tok_imza:
            return "tokenizer değişti"
        if imzalar is not None and durum.get("veri") != imzalar.get(_EGITIM_AKISI[asama]):
            return "hazır veri değişti"
        b = durum.get("baslangic")
        if baslangic and asama == "meb" and isinstance(b, dict):
            if tdk_durumu.get("kosu"):
                if (b.get("kosu"), b.get("adim")) != (tdk_durumu.get("kosu"), tdk_durumu.get("en_iyi_adim")):
                    return "TDK modeli değişti"
            elif _eski_mi(kayit, [dk / "tdk" / "en_iyi.pt"]):  # TDK koşusu eski sürümden: kimliği yok
                return "TDK modeli değişti"
        return None

    def model_adimi(asama: str, ad: str) -> _Adim:
        klasor = dk / asama
        komut = f"egit --asama {asama}"
        durum = egitim_durumu_oku(klasor) or {}
        ilerleme = f"adım {durum.get('adim')}/{durum.get('toplam_adim')}" if durum else ""
        if egitim_suruyor_mu(klasor):  # kilit tutuluyor: bir süreç bu aşamada çalışıyor (komut önerilmez)
            if durum.get("durum") in BITMIS_DURUMLAR:
                metin = f"eğitim bitti ({ilerleme}), son değerlendirme şu an sürüyor"
            elif durum:
                metin = f"eğitim şu an sürüyor ({ilerleme}, son kayıt {durum.get('zaman', '?')})"
            else:  # yeni başladı: henüz durum.json yazılmadı
                metin = "eğitim şu an başlıyor"
            return _Adim(ad, "~", metin, yenilenecek=True, suruyor=True)
        en_iyi, son = klasor / "en_iyi.pt", klasor / "son.pt"
        kayit = en_iyi if en_iyi.exists() else son if son.exists() else None
        if kayit is None:
            return _Adim(ad, " ", f"{komut}{ek}", komut, yenilenecek=True)
        neden = icerik_eskimesi(asama, durum, kayit)
        if neden:
            return _Adim(ad, "~", f"{neden} → yeniden: {komut} --uzerine-yaz{ek}", f"{komut} --uzerine-yaz", True)
        if durum.get("durum") in YARIM_DURUMLAR:  # "suruyor" ama kilit yok: süreç öldürülmüş
            if son.exists():
                return _Adim(ad, "~", f"{ilerleme}, bitmedi → sürdür: {komut} --devam{ek}", f"{komut} --devam", True)
            return _Adim(
                ad, "~", f"{ilerleme}, bitmedi ve son.pt yok → yeniden: {komut} --uzerine-yaz{ek}", f"{komut} --uzerine-yaz", True
            )
        erken = " (erken durdurma)" if durum.get("durum") == "erken_durdu" else ""
        if durum.get("durum") in BITMIS_DURUMLAR and durum.get("degerlendirildi") is False:
            komut = f"degerlendir --asama {asama}"
            return _Adim(ad, "~", f"{ilerleme}{erken}, değerlendirilmedi → {komut}{ek}", komut)
        return _Adim(ad, "x", ilerleme + erken)

    tdk_model = yay(model_adimi("tdk", "Aşama 1 modeli (TDK)"), tokenizer.yenilenecek, hazir_tdk)
    meb_durumu = egitim_durumu_oku(dk / "meb") or {}
    tdkye_bagli = not ("baslangic" in meb_durumu and meb_durumu["baslangic"] is None)  # --sifirdan değilse
    meb_model = yay(
        model_adimi("meb", "Aşama 2 modeli (MEB)"), tokenizer.yenilenecek, hazir_meb, tdkye_bagli and tdk_model.yenilenecek
    )

    for a in (kelime, madde, derlem_adimi, mmlu_adimi, meb_pdf_adimi, tokenizer, hazir, tdk_model, meb_model):
        print(f"  [{a.isaret}] {a.ad:<40} {a.not_}".rstrip())

    # --- Başka deneyler: yarıda kalanlar listelenir; sürenler ortak tokenizer'ı ve hazır veriyi kullanır --
    suren_bu = [ad for a, ad in ((tdk_model, "bu deneyin TDK aşaması"), (meb_model, "bu deneyin MEB aşaması")) if a.suruyor]
    suren = list(suren_bu)  # + başka deneylerde süren aşamalar
    yarim: list[str] = []
    ayarlar_eki = f" --ayarlar {_tirnak(arg.ayarlar)}" if arg.ayarlar else ""
    deneyler = ayarlar.cikti_klasoru / "deneyler"
    baskalari = sorted(p for p in deneyler.iterdir() if p.is_dir() and p.name != dk.name) if deneyler.is_dir() else []
    for d in baskalari:
        for asama in ASAMALAR:
            klasor = d / asama
            if egitim_suruyor_mu(klasor):
                suren.append(f"{d.name} / {asama}")
                continue
            bilgi = egitim_durumu_oku(klasor) or {}
            if bilgi.get("durum") not in YARIM_DURUMLAR or not (klasor / "son.pt").exists():
                continue
            ilerleme = f"adım {bilgi.get('adim')}/{bilgi.get('toplam_adim')}"
            neden = icerik_eskimesi(asama, bilgi, klasor / "son.pt", baslangic=False)
            if neden:  # --devam bu durumda reddedilir
                yarim.append(f"  {d.name} / {asama}: {ilerleme}; {neden}, sürdürülemez")
            else:
                yarim.append(
                    f"  {d.name} / {asama}: {ilerleme} → egit --asama {asama} --devam --deney {_tirnak(d.name)}{ayarlar_eki}"
                )
    if yarim:
        print("Yarıda kalan başka deneyler:")
        print("\n".join(yarim))

    # --- Sıradaki adım: aşama 1 zinciri önce; TurkishMMLU yalnız meb-pdf'ten önce önerilir ------------
    adaylar = [kelime, madde, derlem_adimi, tokenizer, hazir, tdk_model]
    adaylar += ([] if meb_pdf.exists() else [mmlu_adimi]) + [meb_pdf_adimi, meb_model]
    sira = next((a for a in adaylar if a.komut), None)
    siradaki = sira.komut if sira is not None else None
    if siradaki == "tokenizer-egit" and not meb_pdf.exists():
        print("\nİpucu: MEB kitapçıklarını tokenizer'dan önce eklersen (meb-mmlu, meb-pdf) soru kelimeleri de sözlüğe girer.")
    eksik = ayarlar.gomme.eksikler()
    if eksik:
        print(f"\nGömme kararları bekliyor ({len(eksik)}/{len(GOMME_KARARLARI)}): {', '.join(eksik)} → GOMME_KARARLARI.md")
    else:
        print(f"\nGömme kararları tamam. Deney adı: {ayarlar.deney_adi}")
    mod = ayarlar.moduller
    if mod.ocr.model or mod.metin.model:  # sunucuya bağlanılmaz; sınamak modul-dene'nin işi
        roller = ", ".join(f"{rol} {getattr(mod, rol).model or 'kapalı'}" for rol in ("ocr", "metin"))
        print(f"Modüller: {roller} (sınamak için: python -m turkce_model modul-dene{ek})")

    # Süren bir eğitim tokenizer'ı ve hazır veriyi okur (veri-hazirla akışları boşaltır); MEB aşaması da TDK
    # modelinden başlar. Bunlar eğitim bitene kadar önerilmez.
    engel = None
    if suren and (sira is tokenizer or sira is hazir):
        engel = f"{', '.join(suren)} tokenizer'ı ve hazır veriyi kullanıyor"
    elif sira is meb_model and tdk_model.suruyor:
        engel = "MEB aşaması TDK modelinden başlar"
    if eksik and (siradaki is None or siradaki.startswith("egit")):
        print(f"Sıradaki adım: {ayar_yolu.name}'daki [gomme] kararlarını doldur (GOMME_KARARLARI.md)")
    elif siradaki and engel:
        print(f"Sıradaki adım: önce süren eğitimin bitmesini bekle ({engel}); sonra: python -m turkce_model {siradaki}{ek}")
    elif siradaki:
        print(f"Sıradaki adım: python -m turkce_model {siradaki}{ek}")
        if siradaki == "meb-pdf" and not pdfler:
            print("  (önce MEB kitapçıklarını tarayıcıyla indirip veri/meb/pdf klasörüne koy; README, 3. adım)")
    elif suren_bu:
        print(f"Sıradaki adım: süren eğitimin bitmesini bekle ({', '.join(suren_bu)}); sonra yeniden: python -m turkce_model durum{ek}")
    else:
        print(f"Bütün adımlar tamam. Sonuçlar için: python -m turkce_model degerlendir{ek}")
        if not mmlu.exists():
            print(f"İsteğe bağlı: python -m turkce_model meb-mmlu{ek} (eğitimde hiç görülmemiş sorularla ölçüm)")
    md = ayarlar.cikti_klasoru / "ilerleme.md"
    if md.exists():
        print(f"İlerleme tablosu: {md}")


# --------------------------------------------------------------------------------------------


def _sayi_turu(tur: type, en_az: int):
    """argparse türü: ``tur``'e çevirir; ``en_az``'dan küçük ya da sonlu olmayan değeri Türkçe iletiyle reddeder
    (argparse 2 ile çıkar; eksi sayılar izleme dökümüne dönüşmez)."""

    def cevir(metin: str):
        try:
            x = tur(metin)
        except ValueError:
            raise argparse.ArgumentTypeError(f"{'tam sayı' if tur is int else 'sayı'} olmalı: {metin!r}") from None
        if not math.isfinite(x) or x < en_az:
            raise argparse.ArgumentTypeError(f"{en_az} ya da daha büyük olmalı (şu an: {metin})")
        return x

    return cevir


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
    p.add_argument("--bekleme", type=_sayi_turu(float, 0), default=0.35, help="İstekler arası bekleme, sn (varsayılan 0.35)")
    p.add_argument("--ornek", type=_sayi_turu(int, 1), help="Yalnız N maddelik rastgele örneklem (deneme için)")
    p.add_argument("--tohum", type=int, default=0, help="Örneklem için rastgelelik tohumu")
    p.add_argument("--liste-yenile", action="store_true", help="Kelime listesini yeniden indir")
    p = ekle("tdk-derlem", komut_tdk_derlem, "İndirilen maddelerden derlem ve kök sözlüğü üret")
    p.add_argument("--yazar", action="store_true", help="Örnek cümlelerin yazar adlarını da ekle")
    ekle("meb-mmlu", komut_meb_mmlu, "TurkishMMLU'nun açık sorularını indir (944 soru; yalnız değerlendirme)")
    p = ekle("meb-pdf", komut_meb_pdf, "Elle indirilmiş MEB kitapçıklarını (PDF) ayrıştır")
    p.add_argument("--klasor", help="PDF klasörü (varsayılan: veri/meb/pdf)")
    p.add_argument(
        "--ocr",
        nargs="?",
        const="gerekirse",
        choices=("gerekirse", "hepsi"),
        help="Metin katmanı olmayan (taranmış) kitapçıkları OCR modülüyle oku; 'hepsi': bütün kitapçıkları "
        "([moduller.ocr] model gerekir)",
    )
    ekle("tokenizer-egit", komut_tokenizer_egit, "Türkçe kök + ek tokenizer'ını eğit")
    p = ekle("tokenizer-dene", komut_tokenizer_dene, "Bir metnin token'larını, kimliklerini ve kategorilerini göster")
    p.add_argument("metin", nargs="*", help="Metin (verilmezse standart girdiden okunur; UTF-8 önerilir)")
    ekle("veri-hazirla", komut_veri_hazirla, "Derlemi ve soruları token dizilerine çevir")
    p = ekle("hesapla", komut_hesapla, "Gömme kararlarının parametre ve bellek etkisini göster")
    p.add_argument("--olc", action="store_true", help="Bu bilgisayarda birkaç adımla hız da ölç")
    p = ekle("egit", komut_egit, "Modeli eğit")
    p.add_argument("--asama", choices=("tdk", "meb"), required=True, help="tdk: sözlükle ön eğitim, meb: sorularla ince ayar")
    secim = p.add_mutually_exclusive_group()  # biri sürdürür, öteki baştan başlar: birlikte anlamsız
    secim.add_argument("--devam", action="store_true", help="Son kontrol noktasından sürdür")
    secim.add_argument("--uzerine-yaz", action="store_true", help="Bu deneyin bu aşamadaki eski eğitimini silip baştan başla")
    p.add_argument("--sifirdan", action="store_true", help="MEB aşamasını TDK modeli olmadan başlat")
    p = ekle("degerlendir", komut_degerlendir, "Modeli değerlendir, sonucu ilerleme tablosuna ekle")
    p.add_argument(
        "--asama",
        choices=("tdk", "meb"),
        help="Varsayılan: deneyde MEB modeli varsa meb, yoksa tdk. --model ile birlikte verme: aşama dosyanın kendi "
        "kaydından okunur",
    )
    p.add_argument("--model", help="Kontrol noktası yolu (varsayılan: deneyin en iyi modeli)")
    for ad, islev, yardim in (
        ("uret", komut_uret, "İstemden metin üret"),
        ("tanimla", komut_tanimla, "Model bir kelimeyi sözlük gibi tanımlasın"),
        ("sor", komut_sor, "Rastgele test sorularını (ya da bir fotoğraftaki soruyu) modele sor"),
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
            p.add_argument("--adet", type=_sayi_turu(int, 1), default=3, help="Kaç soru sorulsun (varsayılan 3; --resim ile yok sayılır)")
            p.add_argument(
                "--resim",
                help="Soruyu bu fotoğraftan oku ve yalnız onu sor (OCR modülü gerekir; doğru cevap bilinmez, --adet yok sayılır)",
            )
        else:
            p.add_argument("--uzunluk", type=_sayi_turu(int, 1), default=120, help="En fazla kaç token üretilsin (varsayılan 120)")
            p.add_argument("--sicaklik", type=float, default=0.8, help="Örnekleme sıcaklığı; 0 en olası token (varsayılan 0.8)")
            p.add_argument(
                "--ust-k", type=_sayi_turu(int, 0), default=50, help="Yalnız en olası k token arasından seç; 0 = sınırsız (varsayılan 50)"
            )
    # İsteğe bağlı DeepSeek modülleri: modul-liste, modul-dene, ocr, modul-kiyas (ortak seçeneklerle).
    from .moduller.komutlar import komutlari_ekle

    komutlari_ekle(ekle)
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
