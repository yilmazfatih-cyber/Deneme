"""Eğitim döngüsü: aşama 1 (TDK derlemi) ve aşama 2 (MEB soruları ile ince ayar)."""

from __future__ import annotations

import contextlib
import json
import math
import os
import pickle
import time
import zipfile
from dataclasses import asdict, replace
from functools import partial
from pathlib import Path

import numpy as np
import torch

from .ayarlar import (
    HASSASIYETLER,
    Ayarlar,
    AyarHatasi,
    EgitimAyarlari,
    GommeAyarlari,
    ModelAyarlari,
    egitimi_dogrula,
    gommeyi_dogrula,
)
from .degerlendirme import akis_kaybi, bpc, coktan_secmeli, ilerleme_ekle
from .metin import binlik
from .model import TurkceGPT
from .tokenizer import PAD, TurkceTokenizer
from .veri import AkisVeri, SoruVeri, meta_oku, tokenizer_gomme_imzasi, tokenizer_imzasi

ASAMALAR = ("tdk", "meb")
CIHAZLAR = ("cpu", "cuda", "mps")
_AUTOCAST_TURLERI = {"bf16": torch.bfloat16, "fp16": torch.float16}

# --devam'da değiştirilemeyen eğitim ayarları: adım sayısını, öğrenme oranı eğrisini ya da veri akışını belirlerler.
# Diğerleri (degerlendirme_her, degerlendirme_yigini, erken_durdurma, hassasiyet, derle) bir notla değişebilir.
KILITLI_EGITIM_ALANLARI = (
    "donem",
    "en_fazla_adim",
    "yigin",
    "birikim",
    "ogrenme_orani",
    "min_oran",
    "isinma_adimi",
    "agirlik_azaltma",
    "gradyan_kirpma",
    "tohum",
    "kayip",
    "tdk_karisim",
)

BOLUM_ADLARI = {"dogrulama": "doğrulama", "test": "test"}


def cihaz_sec() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def cihaz_dogrula(cihaz: str | None) -> str:
    """İstenen cihaz bu bilgisayarda kullanılabilir mi? ``None`` ise en iyisini seçer."""
    if cihaz is None:
        return cihaz_sec()
    if cihaz not in CIHAZLAR:
        raise AyarHatasi(f"Bilinmeyen cihaz: {cihaz!r} ({' | '.join(CIHAZLAR)})")
    if cihaz == "cuda" and not torch.cuda.is_available():
        raise AyarHatasi(
            "--cihaz cuda seçildi ama CUDA kullanılamıyor: NVIDIA ekran kartı, sürücüsü ya da CUDA destekli PyTorch "
            "yok. README'deki 'Kurulum' bölümüne bak ya da --cihaz vermeden otomatik seçime bırak."
        )
    if cihaz == "mps" and not (getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()):
        raise AyarHatasi("--cihaz mps seçildi ama MPS kullanılamıyor (Apple Silicon'lu Mac ve MPS destekli PyTorch gerekir).")
    return cihaz


def hassasiyet_sec(istenen: str, cihaz: str) -> str:
    if istenen not in HASSASIYETLER:
        raise AyarHatasi(f"hassasiyet şunlardan biri olmalı: {', '.join(HASSASIYETLER)} (şu an: {istenen!r})")
    if istenen != "otomatik":
        return istenen
    if cihaz == "cuda":
        return "bf16" if torch.cuda.is_bf16_supported() else "fp16"
    return "fp32"


def baglam_yoneticisi(cihaz: str, hassasiyet: str):
    if hassasiyet == "fp32":
        return contextlib.nullcontext
    if hassasiyet not in _AUTOCAST_TURLERI:
        raise AyarHatasi(f"Bilinmeyen hassasiyet: {hassasiyet!r} (fp32 | bf16 | fp16)")
    return partial(torch.autocast, device_type=cihaz, dtype=_AUTOCAST_TURLERI[hassasiyet])


def ogrenme_orani(adim: int, toplam: int, ea: EgitimAyarlari) -> float:
    """Doğrusal ısınma + kosinüs düşüş (ogrenme_orani × min_oran'a kadar)."""
    if adim < ea.isinma_adimi:
        return ea.ogrenme_orani * (adim + 1) / ea.isinma_adimi
    oran = min(1.0, (adim - ea.isinma_adimi) / max(1, toplam - ea.isinma_adimi))
    katsayi = 0.5 * (1.0 + math.cos(math.pi * oran))
    return ea.ogrenme_orani * (ea.min_oran + (1.0 - ea.min_oran) * katsayi)


def kisa_egitim_ayarlari(ea: EgitimAyarlari, toplam_adim: int) -> tuple[int, int]:
    """Kısa eğitimlerde değerlendirme aralığı ve ısınma: ``(her, isinma)``.

    Değerlendirme en az ~10 kez yapılır (yoksa erken durdurma ve en iyi model seçimi çalışmaz); ısınma toplam
    adımın beşte birini geçmez (yoksa öğrenme oranı hedefine hiç ulaşmaz). Uzun eğitimlerde ayarlar aynen kalır.
    Yalnız ayarlardan ve veri boyundan türediği için ``--devam`` ile tutarlıdır.
    """
    her = min(ea.degerlendirme_her, max(1, toplam_adim // 10))
    isinma = min(ea.isinma_adimi, max(1, toplam_adim // 5))
    return her, isinma


# --------------------------------------------------------------------------------------------
# Yollar ve yükleme
# --------------------------------------------------------------------------------------------


def tokenizer_klasoru(ayarlar: Ayarlar) -> Path:
    return ayarlar.cikti_klasoru / "tokenizer"


def veri_klasoru(ayarlar: Ayarlar) -> Path:
    return ayarlar.cikti_klasoru / "veri"


def tokenizer_yukle(ayarlar: Ayarlar) -> TurkceTokenizer:
    klasor = tokenizer_klasoru(ayarlar)
    if not (klasor / "sozcukler.tsv").exists():
        raise AyarHatasi(f"Tokenizer bulunamadı ({klasor}). Önce: python -m turkce_model tokenizer-egit")
    return TurkceTokenizer.yukle(klasor)


def hazir_veri(ayarlar: Ayarlar, tok: TurkceTokenizer) -> dict:
    klasor = veri_klasoru(ayarlar)
    meta = meta_oku(klasor)
    if meta is None:
        raise AyarHatasi(f"Hazır veri yok ({klasor}). Önce: python -m turkce_model veri-hazirla")
    if meta.get("tokenizer") != tokenizer_imzasi(tok):
        raise AyarHatasi("Veri başka bir tokenizer'la hazırlanmış. Yeniden çalıştır: python -m turkce_model veri-hazirla")
    return meta


def model_kur(gomme: GommeAyarlari, model_ayar: ModelAyarlari, tok: TurkceTokenizer) -> TurkceGPT:
    gommeyi_dogrula(gomme, model_ayar)
    return TurkceGPT.tokenizer_ile(gomme, model_ayar, tok)


def kontrol_noktasi_yukle(yol: Path, cihaz: str = "cpu") -> dict:
    """Kontrol noktasını yükler. ``weights_only``: dosyada yalnız tensör ve basit değerler olabilir, başkasından
    gelen bir dosya kod çalıştıramaz. Bozuk ya da yarım dosya açıklamalı ``AyarHatasi`` verir."""
    yol = Path(yol)
    if not yol.is_file():
        raise AyarHatasi(f"Model dosyası yok: {yol}")
    try:
        kn = torch.load(yol, map_location=cihaz, weights_only=True)
    except (pickle.UnpicklingError, RuntimeError, EOFError, OSError, ValueError, zipfile.BadZipFile) as e:
        raise AyarHatasi(
            f"{yol} okunamadı: geçerli bir turkce-model kontrol noktası değil ya da yarım yazılmış/bozuk. "
            f"({str(e).splitlines()[0][:200] if str(e) else type(e).__name__})"
        ) from e
    if not isinstance(kn, dict) or "model" not in kn or "ayarlar" not in kn:
        raise AyarHatasi(f"{yol} bir turkce-model kontrol noktası değil.")
    return kn


def guvenli_kaydet(veri: dict, yol: Path) -> None:
    """Önce geçici dosyaya yazar, sonra yerine taşır: yazarken kesilse de eski dosya sağlam kalır."""
    gecici = yol.with_name(yol.name + ".yaziliyor")
    torch.save(veri, gecici)
    os.replace(gecici, yol)


def egitim_durumu_oku(klasor: Path) -> dict | None:
    """Bir aşamanın ``durum.json`` dosyası: ``{"durum": "suruyor" | "bitti" | "erken_durdu" | "durduruldu", ...}``."""
    yol = klasor / "durum.json"
    try:
        return json.loads(yol.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _egitim_durumu_yaz(klasor: Path, durum: dict) -> None:
    gecici = klasor / "durum.json.yaziliyor"
    gecici.write_text(json.dumps(durum, ensure_ascii=False), encoding="utf-8")
    os.replace(gecici, klasor / "durum.json")


def tokenizer_uyumu(kn: dict, tok: TurkceTokenizer, yol: Path) -> None:
    """Kontrol noktası bu tokenizer'la kullanılabilir mi? Parçalar aynı olmalı; model biçim paylaşımı ya da
    kategori gömmesi kullanıyorsa ana/biçim/kategori bağları da aynı olmalı (bunlar yüklenirken yeniden kurulur)."""
    if kn.get("tokenizer") != tokenizer_imzasi(tok):
        raise AyarHatasi(f"{yol} başka bir tokenizer'la eğitilmiş; bu tokenizer'la kullanılamaz.")
    g = kn.get("ayarlar", {}).get("gomme", {})
    kayitli = kn.get("tokenizer_gomme")
    if (g.get("bicim_paylasimi") or g.get("kategori_gommesi")) and kayitli and kayitli != tokenizer_gomme_imzasi(tok):
        raise AyarHatasi(
            f"{yol}: tokenizer'ın parçaları aynı ama ana/biçim/kategori bağları değişmiş (tokenizer yeniden eğitilmiş). "
            "Bu model biçim paylaşımı ya da kategori gömmesi kullandığı için yeniden eğitilmeli."
        )


def ayar_farklari(kayitli: dict, ayarlar: Ayarlar, devam: bool) -> list[str]:
    """Kontrol noktasının mimari ayarlarıyla şimdiki ayarlar arasındaki farklar.

    ``--devam`` için her şey aynı olmalı. MEB aşaması TDK modelinden başlarken dropout ve başlatma std'si
    farklı olabilir (ağırlıkların biçimini değiştirmezler).
    """
    serbest = set() if devam else {("gomme", "dropout"), ("gomme", "baslatma_std"), ("model", "dropout")}
    farklar = []
    for bolum in ("gomme", "model"):
        eski, yeni = kayitli.get(bolum, {}), asdict(getattr(ayarlar, bolum))
        for alan in sorted(set(eski) | set(yeni)):
            if (bolum, alan) not in serbest and eski.get(alan) != yeni.get(alan):
                farklar.append(f"{bolum}.{alan}: kayıtlı {eski.get(alan)!r}, şimdi {yeni.get(alan)!r}")
    return farklar


def egitim_farklari(kayitli: dict, ea: EgitimAyarlari, asama: str) -> tuple[list[str], list[str]]:
    """``--devam`` için ``egitim.<aşama>`` farkları: ``(engelleyenler, bilgi_notlari)``."""
    engel: list[str] = []
    bilgi: list[str] = []
    yeni = asdict(ea)
    for alan in sorted(set(kayitli) | set(yeni)):
        if kayitli.get(alan) != yeni.get(alan):
            satir = f"egitim.{asama}.{alan}: kayıtlı {kayitli.get(alan)!r}, şimdi {yeni.get(alan)!r}"
            (engel if alan in KILITLI_EGITIM_ALANLARI else bilgi).append(satir)
    return engel, bilgi


def durumu_yukle(model: TurkceGPT, kn: dict, yol: Path) -> None:
    try:
        model.load_state_dict(kn["model"])
    except RuntimeError as e:
        raise AyarHatasi(f"{yol} bu modele yüklenemedi (mimari ya da tokenizer farklı): {str(e)[:300]}") from e


def modeli_yukle(yol: Path, tok: TurkceTokenizer, cihaz: str) -> tuple[TurkceGPT, dict]:
    """Kaydedilmiş modeli, kendi ayarlarıyla kurar (ayarlar.toml sonradan değişmiş olabilir)."""
    kn = kontrol_noktasi_yukle(yol, cihaz)
    tokenizer_uyumu(kn, tok, yol)
    try:
        g = GommeAyarlari(**kn["ayarlar"]["gomme"])
        m = ModelAyarlari(**kn["ayarlar"]["model"])
    except (KeyError, TypeError) as e:
        raise AyarHatasi(f"{yol}: kayıtlı ayarlar bu sürümle okunamadı ({e}).") from e
    model = model_kur(g, m, tok)
    durumu_yukle(model, kn, yol)
    return model.to(cihaz), kn


def _rng_durumu(uretec: np.random.Generator, cihaz: str) -> dict:
    durum: dict = {"numpy": uretec.bit_generator.state, "torch": torch.get_rng_state()}
    if cihaz == "cuda":
        durum["cuda"] = torch.cuda.get_rng_state_all()
    elif cihaz == "mps":
        durum["mps"] = torch.mps.get_rng_state()
    return durum


def _rng_geri_yukle(durum: dict, uretec: np.random.Generator, cihaz: str) -> None:
    uretec.bit_generator.state = durum["numpy"]
    torch.set_rng_state(durum["torch"].cpu())  # kontrol noktası cihaza yüklendi; RNG durumu CPU'da olmalı
    if cihaz == "cuda" and durum.get("cuda"):
        torch.cuda.set_rng_state_all([s.cpu() for s in durum["cuda"]])
    elif cihaz == "mps" and durum.get("mps") is not None:
        torch.mps.set_rng_state(durum["mps"].cpu())


def _dogrulama_metni(d: dict) -> str:
    parcalar = [f"TDK kaybı {d['tdk_kayip']:.4f}"]
    if "meb_kayip" in d:
        parcalar.append(f"MEB kaybı {d['meb_kayip']:.4f}")
    if "meb_dogruluk_metin" in d:
        parcalar.append(
            f"MEB doğr. metin %{100 * d['meb_dogruluk_metin']:.1f} / harf %{100 * d['meb_dogruluk_harf']:.1f}"
        )
    return " | ".join(parcalar)


# --------------------------------------------------------------------------------------------
# Eğitim
# --------------------------------------------------------------------------------------------


def egit(
    ayarlar: Ayarlar,
    asama: str,
    devam: bool = False,
    sifirdan: bool = False,
    cihaz: str | None = None,
    yaz=print,
    uzerine_yaz: bool = False,
) -> dict:
    if asama not in ASAMALAR:
        raise AyarHatasi(f"Aşama {asama!r} değil; şunlardan biri: {', '.join(ASAMALAR)}")
    gommeyi_dogrula(ayarlar.gomme, ayarlar.model)
    ea: EgitimAyarlari = egitimi_dogrula(getattr(ayarlar, asama), asama)
    cihaz = cihaz_dogrula(cihaz)
    hassasiyet = hassasiyet_sec(ea.hassasiyet, cihaz)
    ctx = baglam_yoneticisi(cihaz, hassasiyet)

    tok = tokenizer_yukle(ayarlar)
    hazir_veri(ayarlar, tok)
    vk = veri_klasoru(ayarlar)
    tdk_egitim = AkisVeri(vk / "tdk_egitim.bin", tok.boyut)
    tdk_dogrulama = AkisVeri(vk / "tdk_dogrulama.bin", tok.boyut)
    for ad, akis in (("eğitim", tdk_egitim), ("doğrulama", tdk_dogrulama)):
        if len(akis) < ayarlar.model.baglam + 2:
            raise AyarHatasi(
                f"TDK {ad} akışı çok kısa ({len(akis)} token, bağlam {ayarlar.model.baglam}). Daha fazla madde indir "
                "(tdk-indir) ya da model.baglam'ı küçült."
            )
    meb_egitim = meb_dogrulama = None
    dogrulama_sorulari: list = []
    if asama == "meb":
        if not (vk / "meb_egitim.npz").exists():
            raise AyarHatasi("MEB soruları hazırlanmamış. Önce: meb-pdf (ve/veya meb-mmlu), sonra veri-hazirla")
        meb_egitim = SoruVeri(vk / "meb_egitim.npz")
        meb_dogrulama = SoruVeri(vk / "meb_dogrulama.npz") if (vk / "meb_dogrulama.npz").exists() else None
        from .meb import soru_oku

        dogrulama_sorulari = [s for s in soru_oku(vk / "meb_sorular.jsonl") if s.bolum == "dogrulama"]

    klasor = ayarlar.deney_klasoru / asama
    son_yol, en_iyi_yol = klasor / "son.pt", klasor / "en_iyi.pt"
    if son_yol.exists() and not devam and not uzerine_yaz:
        raise AyarHatasi(
            f"{klasor} içinde zaten bir eğitim var. Sürdürmek için --devam, silip baştan başlamak için "
            "--uzerine-yaz, ayrı tutmak için --deney <ad> kullan."
        )

    torch.manual_seed(ea.tohum)
    uretec = np.random.default_rng(ea.tohum)
    model = model_kur(ayarlar.gomme, ayarlar.model, tok).to(cihaz)
    baslangic_adim, en_iyi, sabir, gorulen = 0, math.inf, 0, 0
    kn = None
    if devam:
        if son_yol.exists():
            kn = kontrol_noktasi_yukle(son_yol, cihaz)
            tokenizer_uyumu(kn, tok, son_yol)
            farklar = ayar_farklari(kn["ayarlar"], ayarlar, devam=True)
            engel, bilgi = egitim_farklari(kn["ayarlar"].get(asama, {}), ea, asama)
            if farklar or engel:
                raise AyarHatasi(
                    "--devam için bu ayarlar kaydedilen eğitimle aynı olmalı (mimariyi, adım sayısını ya da öğrenme "
                    "oranı eğrisini belirlerler). Farklar:\n  • " + "\n  • ".join(farklar + engel)
                    + "\nYeni ayarlarla ayrı bir deney için --deney <ad> kullan."
                )
            for satir in bilgi:
                yaz(f"  Not: {satir} (sürdürürken değişebilir)")
            durumu_yukle(model, kn, son_yol)
            baslangic_adim, en_iyi = int(kn["adim"]), float(kn["en_iyi"])
            gorulen, sabir = int(kn.get("gorulen_token", 0)), int(kn.get("sabir", 0))
        else:
            yaz(f"Not: {son_yol} yok; sürdürülecek eğitim bulunamadı, baştan başlanıyor.")
    if kn is None and asama == "meb" and not sifirdan:
        kaynak = ayarlar.deney_klasoru / "tdk" / "en_iyi.pt"
        if not kaynak.exists():
            raise AyarHatasi(
                f"MEB aşaması TDK modelinden başlar ama {kaynak} yok. Önce 'egit --asama tdk' çalıştır "
                "ya da bilerek sıfırdan başlamak için --sifirdan ekle."
            )
        tdk_kn = kontrol_noktasi_yukle(kaynak, cihaz)
        tokenizer_uyumu(tdk_kn, tok, kaynak)
        farklar = ayar_farklari(tdk_kn["ayarlar"], ayarlar, devam=False)
        if farklar:
            raise AyarHatasi("TDK modelinin mimarisi şimdiki ayarlardan farklı:\n  • " + "\n  • ".join(farklar))
        durumu_yukle(model, tdk_kn, kaynak)
        gorulen = int(tdk_kn.get("gorulen_token", 0))  # görülen token birikimlidir: TDK aşaması dahil
        del tdk_kn
        yaz(f"TDK modelinden başlanıyor: {kaynak}")

    dokum = model.parametre_dokumu()
    baglam_uzunlugu = ayarlar.model.baglam
    adim_basina_token = ea.yigin * ea.birikim * baglam_uzunlugu
    if asama == "tdk":
        toplam_adim = math.ceil(ea.donem * len(tdk_egitim) / adim_basina_token)
    else:
        meb_adim = math.ceil(ea.donem * len(meb_egitim) / (ea.yigin * ea.birikim))
        toplam_adim = math.ceil(meb_adim / max(1e-6, 1.0 - ea.tdk_karisim))
    if ea.en_fazla_adim:
        toplam_adim = min(toplam_adim, ea.en_fazla_adim)
    toplam_adim = max(toplam_adim, 1)
    if kn is not None and kn.get("toplam_adim") not in (None, toplam_adim):
        raise AyarHatasi(
            f"Hazır veri değişmiş: bu eğitim {kn['toplam_adim']} adım olarak başlamıştı, şimdiki veriyle {toplam_adim} "
            "adım ediyor (veri-hazirla yeniden çalıştırılmış olabilir). Sürdürmek tutarsız olur; yeni bir deney için "
            "--deney <ad>, baştan başlamak için --uzerine-yaz kullan."
        )
    if kn is not None and (baslangic_adim >= toplam_adim or (ea.erken_durdurma and sabir >= ea.erken_durdurma)):
        neden = "erken durdurmayla" if baslangic_adim < toplam_adim else f"adım {baslangic_adim}/{toplam_adim}"
        yaz(
            f"Bu eğitim zaten bitmiş ({neden}); sürdürülecek adım yok.\n"
            f"Değerlendirmek için: python -m turkce_model degerlendir --asama {asama}"
        )
        return {"zaten_bitti": True, "adim": baslangic_adim}
    her, isinma = kisa_egitim_ayarlari(ea, toplam_adim)
    ea_lr = replace(ea, isinma_adimi=isinma)

    yaz(
        f"Aşama {asama} | cihaz {cihaz} ({hassasiyet}) | deney {ayarlar.deney_adi}\n"
        f"  parametre: {dokum['toplam'] / 1e6:.2f} M (gömme dışı {dokum['gömme dışı'] / 1e6:.2f} M) | "
        f"sözlük {tok.boyut} | bağlam {baglam_uzunlugu}\n"
        f"  Eğitim akışı {binlik(len(tdk_egitim))} token | toplam {binlik(toplam_adim)} adım"
    )
    if her < ea.degerlendirme_her:
        yaz(f"  Not: eğitim kısa; değerlendirme {ea.degerlendirme_her} yerine her {her} adımda bir yapılacak.")
    if isinma < ea.isinma_adimi:
        yaz(f"  Not: ısınma {ea.isinma_adimi} yerine {isinma} adım (toplam adımın en fazla beşte biri).")
    if kn is not None:
        yaz(f"Kaldığı yerden devam: adım {baslangic_adim}/{toplam_adim}")
    oran = len(tdk_egitim) / max(dokum["toplam"], 1)
    if asama == "tdk" and oran < 2:
        yaz(
            f"  Not: eğitim verisi parametre başına yalnız {oran:.2f} token. Model veriyi ezberleyebilir; doğrulama "
            "kaybını izle (erken durdurma açık), daha küçük boyut ya da ek metin (veri/ek_metin) düşün."
        )

    iyilestirici = model.iyilestirici(ea.ogrenme_orani, ea.agirlik_azaltma, cihaz)
    olcekleyici = torch.amp.GradScaler(cihaz, enabled=(hassasiyet == "fp16"))  # fp16'da kayıp ölçekleme şart
    if kn is not None:
        if "iyilestirici" in kn:
            iyilestirici.load_state_dict(kn["iyilestirici"])
        if olcekleyici.is_enabled() and kn.get("olcekleyici"):
            olcekleyici.load_state_dict(kn["olcekleyici"])
        if kn.get("rng"):
            _rng_geri_yukle(kn["rng"], uretec, cihaz)
        else:  # eski kontrol noktası: RNG durumu yok; en azından ilk adımların yığınları tekrarlanmasın
            uretec = np.random.default_rng([ea.tohum, baslangic_adim])
            torch.manual_seed(ea.tohum + baslangic_adim)
        del kn
    calisan = torch.compile(model) if ea.derle and cihaz == "cuda" else model

    secim = np.random.default_rng(0)  # sabit doğrulama yığınları: her değerlendirmede aynı, birbirinden farklı
    sabit_dogrulama = [tdk_dogrulama.yigin(ea.yigin, baglam_uzunlugu, secim) for _ in range(ea.degerlendirme_yigini)]
    if meb_dogrulama is not None and len(meb_dogrulama):
        secim = np.random.default_rng(1)
        meb_sabit = [
            meb_dogrulama.yigin(ea.yigin, baglam_uzunlugu, secim, ea.kayip) for _ in range(ea.degerlendirme_yigini)
        ]
    else:
        meb_sabit = []

    def dogrulama() -> dict:
        model.eval()
        sonuc: dict = {}
        with torch.no_grad():
            kayiplar = []
            for x, y in sabit_dogrulama:
                with ctx():
                    _, k = calisan(x.to(cihaz), y.to(cihaz))
                kayiplar.append(float(k))
            sonuc["tdk_kayip"] = sum(kayiplar) / len(kayiplar)
            if meb_sabit:
                kayiplar = []
                for x, y in meb_sabit:
                    with ctx():
                        _, k = calisan(x.to(cihaz), y.to(cihaz))
                    kayiplar.append(float(k))
                sonuc["meb_kayip"] = sum(kayiplar) / len(kayiplar)
        if dogrulama_sorulari:
            cs = coktan_secmeli(model, tok, dogrulama_sorulari, cihaz, ctx, en_fazla=200)
            sonuc["meb_dogruluk_metin"], sonuc["meb_dogruluk_harf"] = cs["dogruluk_metin"], cs["dogruluk_harf"]
        model.train()
        return sonuc

    def kaydet(yol: Path, adim: int, en_iyi_deger: float, sabir_deger: int) -> None:
        guvenli_kaydet(
            {
                "model": model.state_dict(),
                "iyilestirici": iyilestirici.state_dict(),
                "olcekleyici": olcekleyici.state_dict(),
                "rng": _rng_durumu(uretec, cihaz),
                "adim": adim,
                "toplam_adim": toplam_adim,
                "en_iyi": en_iyi_deger,
                "sabir": sabir_deger,
                "gorulen_token": gorulen,
                "asama": asama,
                "ayarlar": ayarlar.sozluk(),
                "tokenizer": tokenizer_imzasi(tok),
                "tokenizer_gomme": tokenizer_gomme_imzasi(tok),
            },
            yol,
        )

    def durum_yaz(durum: str, adim: int) -> None:
        _egitim_durumu_yaz(
            klasor,
            {"durum": durum, "adim": adim, "toplam_adim": toplam_adim, "zaman": time.strftime("%Y-%m-%d %H:%M")},
        )

    # Eski eğitim yalnız bütün denetimler geçtikten sonra silinir (--uzerine-yaz): yeni eğitim başlayamazsa eskisi kalır.
    klasor.mkdir(parents=True, exist_ok=True)
    if uzerine_yaz and not devam:
        for eski in (son_yol, en_iyi_yol, klasor / "gunluk.jsonl", klasor / "durum.json"):
            eski.unlink(missing_ok=True)
    for yarim in klasor.glob("*.yaziliyor"):
        yarim.unlink(missing_ok=True)
    durum_yaz("suruyor", baslangic_adim)

    gunluk = (klasor / "gunluk.jsonl").open("a", encoding="utf-8")
    model.train()
    basla = time.time()
    # Kayıp cihazda biriktirilir; her mikro adımda .item() GPU'yu bekletirdi.
    son_kayit_zamani, toplanan_kayip, toplanan_sayi, toplanan_token = basla, torch.zeros((), device=cihaz), 0, 0
    tamamlanan = baslangic_adim
    erken_durdu = durduruldu = False
    try:
        for adim in range(baslangic_adim, toplam_adim):
            lr = ogrenme_orani(adim, toplam_adim, ea_lr)
            for grup in iyilestirici.param_groups:
                grup["lr"] = lr
            adim_token = 0
            for _ in range(ea.birikim):
                if asama == "meb" and uretec.random() >= ea.tdk_karisim:
                    x, y = meb_egitim.yigin(ea.yigin, baglam_uzunlugu, uretec, ea.kayip)
                else:
                    x, y = tdk_egitim.yigin(ea.yigin, baglam_uzunlugu, uretec)
                adim_token += int((x != PAD).sum())  # CPU'da sayılır: cihazı bekletmez
                x, y = x.to(cihaz, non_blocking=True), y.to(cihaz, non_blocking=True)
                with ctx():
                    _, kayip = calisan(x, y)
                olcekleyici.scale(kayip / ea.birikim).backward()
                toplanan_kayip += kayip.detach().float()
                toplanan_sayi += 1
            if ea.gradyan_kirpma:
                olcekleyici.unscale_(iyilestirici)
                torch.nn.utils.clip_grad_norm_(model.parameters(), ea.gradyan_kirpma)
            olcekleyici.step(iyilestirici)
            olcekleyici.update()
            iyilestirici.zero_grad(set_to_none=True)
            tamamlanan = adim + 1
            gorulen += adim_token
            toplanan_token += adim_token

            if tamamlanan % her == 0 or tamamlanan == toplam_adim:
                gecen = time.time() - son_kayit_zamani  # değerlendirme süresi hıza katılmaz
                egitim_kaybi = float(toplanan_kayip) / max(toplanan_sayi, 1)
                d = dogrulama()
                kayit = {
                    "adim": tamamlanan,
                    "ogrenme_orani": lr,
                    "egitim_kaybi": egitim_kaybi,
                    **d,
                    "gorulen_token": gorulen,
                    "sure_sn": round(time.time() - basla, 1),
                    "token_sn": round(toplanan_token / max(gecen, 1e-9)),
                }
                gunluk.write(json.dumps(kayit, ensure_ascii=False) + "\n")
                gunluk.flush()
                ana = d.get("meb_kayip", d["tdk_kayip"]) if asama == "meb" else d["tdk_kayip"]
                yaz(
                    f"  adım {tamamlanan}/{toplam_adim} | öğrenme oranı {lr:.2e} | eğitim kaybı {egitim_kaybi:.4f} | "
                    f"{_dogrulama_metni(d)} | {binlik(kayit['token_sn'])} token/sn"
                )
                if ana < en_iyi:
                    kaydet(en_iyi_yol, tamamlanan, ana, 0)
                    en_iyi, sabir = ana, 0
                else:
                    sabir += 1
                erken_durdu = bool(ea.erken_durdurma and sabir >= ea.erken_durdurma)
                kaydet(son_yol, tamamlanan, en_iyi, sabir)
                durum_yaz("erken_durdu" if erken_durdu else ("bitti" if tamamlanan == toplam_adim else "suruyor"), tamamlanan)
                toplanan_kayip, toplanan_sayi, toplanan_token = torch.zeros((), device=cihaz), 0, 0
                son_kayit_zamani = time.time()
                if erken_durdu:
                    yaz(f"  Erken durdurma: {sabir} değerlendirmedir doğrulama kaybı iyileşmiyor (en iyi {en_iyi:.4f}).")
                    break
    except KeyboardInterrupt:
        durduruldu = True
    finally:
        gunluk.close()
    if durduruldu:
        if tamamlanan > baslangic_adim:
            kaydet(son_yol, tamamlanan, en_iyi, sabir)
            durum_yaz("durduruldu", tamamlanan)
            yaz(f"\nDurduruldu: adım {tamamlanan}/{toplam_adim} kaydedildi.")
        else:
            durum_yaz("durduruldu", baslangic_adim)
            yaz("\nDurduruldu (bu oturumda tamamlanan adım yok).")
        if son_yol.exists():
            yaz(f"Sürdürmek için: python -m turkce_model egit --asama {asama} --devam")
        if en_iyi_yol.exists():
            yaz(f"O ana kadarki en iyi modeli değerlendirmek için: python -m turkce_model degerlendir --asama {asama}")
        return {"durduruldu": True, "adim": tamamlanan}

    yaz(f"Eğitim bitti ({(time.time() - basla) / 60:.1f} dk). En iyi model: {en_iyi_yol}")
    sonuc = degerlendir(ayarlar, asama, cihaz=cihaz, yaz=yaz)
    sonuc["erken_durdu"] = erken_durdu
    return sonuc


def degerlendir(
    ayarlar: Ayarlar,
    asama: str | None = None,
    cihaz: str | None = None,
    yaz=print,
    kontrol_noktasi: Path | None = None,
) -> dict:
    """Bir kontrol noktasını tam değerlendirir ve ilerleme tablosuna ekler.

    Varsayılan: deneyin en iyi modeli; ``asama`` verilmezse MEB modeli varsa o, yoksa TDK modeli. ``kontrol_noktasi``
    verilirse aşama ve deney adı dosyanın kendi kaydından alınır.
    """
    cihaz = cihaz_dogrula(cihaz)
    if asama is not None and asama not in ASAMALAR:
        raise AyarHatasi(f"Aşama {asama!r} değil; şunlardan biri: {', '.join(ASAMALAR)}")
    tok = tokenizer_yukle(ayarlar)
    meta = hazir_veri(ayarlar, tok)
    klasor = None
    if kontrol_noktasi is None:
        if asama is None:
            meb_var = any((ayarlar.deney_klasoru / "meb" / ad).exists() for ad in ("en_iyi.pt", "son.pt"))
            asama = "meb" if meb_var else "tdk"
        klasor = ayarlar.deney_klasoru / asama
        yol = klasor / "en_iyi.pt"
        if not yol.exists():
            yol = klasor / "son.pt"  # hiç değerlendirme yapılmadan durdurulduysa
        if not yol.exists():
            raise AyarHatasi(
                f"Değerlendirilecek model yok ({klasor}). Önce 'egit --asama {asama}' çalıştır; başka bir deney için "
                "--deney <ad>, belirli bir dosya için --model <yol> ver."
            )
    else:
        yol = Path(kontrol_noktasi)
    model, kn = modeli_yukle(yol, tok, cihaz)
    deney = ayarlar.deney_adi
    if kontrol_noktasi is not None:
        if asama is None:
            asama = kn.get("asama") if kn.get("asama") in ASAMALAR else "tdk"
        kayitli = kn["ayarlar"]
        kendi = Ayarlar(
            gomme=GommeAyarlari(**kayitli["gomme"]), model=ModelAyarlari(**kayitli["model"]), deney=kayitli.get("deney", "")
        )
        deney = f"{kendi.deney_adi} ({yol.name})"
    ctx = baglam_yoneticisi(cihaz, hassasiyet_sec(getattr(ayarlar, asama).hassasiyet, cihaz))
    vk = veri_klasoru(ayarlar)
    yaz(f"Değerlendirilen model: {yol} (aşama {asama}, adım {kn.get('adim')})")
    akis = akis_kaybi(model, AkisVeri(vk / "tdk_dogrulama.bin", tok.boyut), cihaz, ctx)
    dokum = model.parametre_dokumu()
    sonuc = {
        "deney": deney,
        "asama": asama,
        "adim": kn.get("adim"),
        "parametre": dokum["toplam"],
        "parametre_gomme_disi": dokum["gömme dışı"],
        "gorulen_token": kn.get("gorulen_token"),  # değerlendirilen kontrol noktasının kendi sayısı
        "sozluk": {"boyut": tok.boyut, "imza": tokenizer_imzasi(tok)},
        "ek_paragraf": meta.get("ek_paragraf", 0),
        "dogrulama_kaybi": akis["kayip"],
        "sasirma": akis["sasirma"],
        "bpc": bpc(akis["toplam_nll"], meta["tdk_dogrulama"]["karakter"]),
        "gomme": asdict(GommeAyarlari(**kn["ayarlar"]["gomme"])),
    }
    if klasor is not None:
        durum = egitim_durumu_oku(klasor)
        if durum and durum.get("durum") in ("suruyor", "durduruldu"):
            sonuc["durduruldu"] = True  # eğitim bitmeden değerlendirildi
    yaz(f"TDK doğrulama: kayıp {akis['kayip']:.4f} | şaşkınlık {akis['sasirma']:.1f} | BPC {sonuc['bpc']:.3f}")
    ek_meta = meta.get("ek_dogrulama") or {}
    if ek_meta.get("karakter") and (vk / "ek_dogrulama.bin").exists():
        ek_akis = akis_kaybi(model, AkisVeri(vk / "ek_dogrulama.bin", tok.boyut), cihaz, ctx)
        sonuc["bpc_ek"] = bpc(ek_akis["toplam_nll"], ek_meta["karakter"])
        yaz(f"Ek metin doğrulama: kayıp {ek_akis['kayip']:.4f} | BPC {sonuc['bpc_ek']:.3f}")
    soru_yolu = vk / "meb_sorular.jsonl"
    if soru_yolu.exists():
        from .meb import soru_oku

        sorular = soru_oku(soru_yolu)
        for bolum, anahtar in (("dogrulama", "meb_dogrulama"), ("test", "meb_test")):
            secili = [s for s in sorular if s.bolum == bolum]
            if secili:
                cs = coktan_secmeli(model, tok, secili, cihaz, ctx)
                sonuc[anahtar] = cs
                yaz(
                    f"MEB {BOLUM_ADLARI[bolum]}: {cs['n']} soru | doğruluk metin %{100 * cs['dogruluk_metin']:.1f}, "
                    f"harf %{100 * cs['dogruluk_harf']:.1f} | rastgele tahmin %{100 * cs['rastgele']:.1f}"
                )
    mmlu_yolu = ayarlar.veri_klasoru / "meb" / "turkishmmlu.jsonl"
    if mmlu_yolu.exists():
        from .meb import soru_oku

        cs = coktan_secmeli(model, tok, soru_oku(mmlu_yolu), cihaz, ctx)
        sonuc["mmlu"] = cs
        yaz(
            f"TurkishMMLU (eğitimde hiç kullanılmadı): {cs['n']} soru | doğruluk metin %{100 * cs['dogruluk_metin']:.1f}, "
            f"harf %{100 * cs['dogruluk_harf']:.1f} | rastgele tahmin %{100 * cs['rastgele']:.1f}"
        )
    md = ilerleme_ekle(ayarlar.cikti_klasoru, sonuc)
    yaz(f"İlerleme tablosu güncellendi: {md}")
    return sonuc


def egitim_bellegi_gb(ayarlar: Ayarlar, sozluk_boyutu: int, yigin: int | None = None) -> float:
    """Eğitimde aktivasyon + logit belleğinin kaba tahmini (fp32, GB). Ağırlık ve AdamW durumu hariç.

    Bir dizi başına: çıkış logit'leri ve kopyaları (~5 × sözlük) + her katmanda ~20 × boyut ve dikkat matrisleri.
    Ölçümlere uyar (256 boyut, 6 katman, sözlük 32 000, bağlam 512: dizi başına ~0,46 GB).
    """
    yigin = yigin or ayarlar.tdk.yigin
    t, d, m = ayarlar.model.baglam, int(ayarlar.gomme.boyut), ayarlar.model
    bas = max(1, m.bas_sayisi(d))
    return yigin * t * 4 * (5 * sozluk_boyutu + m.katman * (20 * d + 3 * bas * t)) / 1e9


def hiz_olc(ayarlar: Ayarlar, sozluk_boyutu: int, adim: int = 5, cihaz: str | None = None) -> dict:
    """Rastgele veriyle birkaç eğitim adımı: saniyede token ve (CUDA'da) en yüksek bellek."""
    cihaz = cihaz_dogrula(cihaz)
    ea = ayarlar.tdk
    hassasiyet = hassasiyet_sec(ea.hassasiyet, cihaz)
    ctx = baglam_yoneticisi(cihaz, hassasiyet)
    from .tokenizer import KAT

    kategoriler = [KAT["kok"]] * sozluk_boyutu
    model = TurkceGPT(ayarlar.gomme, ayarlar.model, sozluk_boyutu, kategoriler, list(range(sozluk_boyutu)), [0] * sozluk_boyutu).to(cihaz)
    opt = model.iyilestirici(ea.ogrenme_orani, ea.agirlik_azaltma, cihaz)
    t = ayarlar.model.baglam
    if cihaz == "cuda":
        torch.cuda.reset_peak_memory_stats()

    def bekle() -> None:  # GPU işleri eşzamansızdır; süre ölçmeden önce bitmelerini bekle
        if cihaz == "cuda":
            torch.cuda.synchronize()
        elif cihaz == "mps":
            torch.mps.synchronize()

    sureler = []
    for i in range(adim + 1):
        x = torch.randint(0, sozluk_boyutu, (ea.yigin, t), device=cihaz)
        bekle()
        bas = time.time()
        with ctx():
            _, kayip = model(x, x)
        kayip.backward()
        opt.step()
        opt.zero_grad(set_to_none=True)
        bekle()
        if i:  # ilk adım ısınmadır
            sureler.append(time.time() - bas)
    sn = sum(sureler) / len(sureler)
    sonuc = {"cihaz": cihaz, "hassasiyet": hassasiyet, "token_sn": ea.yigin * t / sn, "adim_sn": sn, "yigin": ea.yigin}
    if cihaz == "cuda":
        sonuc["en_yuksek_bellek_gb"] = torch.cuda.max_memory_allocated() / 1e9
    return sonuc
