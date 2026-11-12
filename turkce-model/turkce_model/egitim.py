"""Eğitim döngüsü: aşama 1 (TDK derlemi) ve aşama 2 (MEB soruları ile ince ayar)."""

from __future__ import annotations

import contextlib
import json
import math
import time
from dataclasses import asdict
from functools import partial
from pathlib import Path

import numpy as np
import torch

from .ayarlar import Ayarlar, AyarHatasi, EgitimAyarlari, GommeAyarlari, ModelAyarlari, gommeyi_dogrula
from .degerlendirme import akis_kaybi, bpc, coktan_secmeli, ilerleme_ekle
from .model import TurkceGPT
from .tokenizer import TurkceTokenizer
from .veri import AkisVeri, SoruVeri, meta_oku, tokenizer_imzasi

ASAMALAR = ("tdk", "meb")


def cihaz_sec() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def hassasiyet_sec(istenen: str, cihaz: str) -> str:
    if istenen != "otomatik":
        return istenen
    if cihaz == "cuda":
        return "bf16" if torch.cuda.is_bf16_supported() else "fp16"
    return "fp32"


def baglam_yoneticisi(cihaz: str, hassasiyet: str):
    if hassasiyet == "fp32":
        return contextlib.nullcontext
    tur = torch.bfloat16 if hassasiyet == "bf16" else torch.float16
    return partial(torch.autocast, device_type=cihaz, dtype=tur)


def ogrenme_orani(adim: int, toplam: int, ea: EgitimAyarlari) -> float:
    """Doğrusal ısınma + kosinüs düşüş (ogrenme_orani × min_oran'a kadar)."""
    if adim < ea.isinma_adimi:
        return ea.ogrenme_orani * (adim + 1) / ea.isinma_adimi
    oran = min(1.0, (adim - ea.isinma_adimi) / max(1, toplam - ea.isinma_adimi))
    katsayi = 0.5 * (1.0 + math.cos(math.pi * oran))
    return ea.ogrenme_orani * (ea.min_oran + (1.0 - ea.min_oran) * katsayi)


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
    return torch.load(yol, map_location=cihaz, weights_only=False)


def modeli_yukle(yol: Path, tok: TurkceTokenizer, cihaz: str) -> tuple[TurkceGPT, dict]:
    """Kaydedilmiş modeli, kendi ayarlarıyla kurar (ayarlar.toml sonradan değişmiş olabilir)."""
    kn = kontrol_noktasi_yukle(yol, cihaz)
    if kn.get("tokenizer") != tokenizer_imzasi(tok):
        raise AyarHatasi(f"{yol} başka bir tokenizer'la eğitilmiş; bu tokenizer'la kullanılamaz.")
    g = GommeAyarlari(**kn["ayarlar"]["gomme"])
    m = ModelAyarlari(**kn["ayarlar"]["model"])
    model = model_kur(g, m, tok)
    model.load_state_dict(kn["model"])
    return model.to(cihaz), kn


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
) -> dict:
    if asama not in ASAMALAR:
        raise AyarHatasi(f"Aşama {asama!r} değil; şunlardan biri: {', '.join(ASAMALAR)}")
    gommeyi_dogrula(ayarlar.gomme, ayarlar.model)
    ea: EgitimAyarlari = getattr(ayarlar, asama)
    cihaz = cihaz or cihaz_sec()
    hassasiyet = hassasiyet_sec(ea.hassasiyet, cihaz)
    ctx = baglam_yoneticisi(cihaz, hassasiyet)
    torch.manual_seed(ea.tohum)
    uretec = np.random.default_rng(ea.tohum)

    tok = tokenizer_yukle(ayarlar)
    meta = hazir_veri(ayarlar, tok)
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
    klasor.mkdir(parents=True, exist_ok=True)
    son_yol, en_iyi_yol = klasor / "son.pt", klasor / "en_iyi.pt"

    model = model_kur(ayarlar.gomme, ayarlar.model, tok).to(cihaz)
    baslangic_adim, en_iyi, sabir, gorulen = 0, math.inf, 0, 0
    kn = None
    if devam and son_yol.exists():
        kn = kontrol_noktasi_yukle(son_yol, cihaz)
        model.load_state_dict(kn["model"])
        baslangic_adim, en_iyi, gorulen = kn["adim"], kn["en_iyi"], kn.get("gorulen_token", 0)
        yaz(f"Kaldığı yerden devam: adım {baslangic_adim}")
    elif asama == "meb" and not sifirdan:
        kaynak = ayarlar.deney_klasoru / "tdk" / "en_iyi.pt"
        if not kaynak.exists():
            raise AyarHatasi(
                f"MEB aşaması TDK modelinden başlar ama {kaynak} yok. Önce 'egit --asama tdk' çalıştır "
                "ya da bilerek sıfırdan başlamak için --sifirdan ekle."
            )
        model.load_state_dict(kontrol_noktasi_yukle(kaynak, cihaz)["model"])
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

    yaz(
        f"Aşama {asama} | cihaz {cihaz} ({hassasiyet}) | deney {ayarlar.deney_adi}\n"
        f"  parametre: {dokum['toplam'] / 1e6:.2f} M (gömme dışı {dokum['gömme dışı'] / 1e6:.2f} M) | "
        f"sözlük {tok.boyut} | bağlam {baglam_uzunlugu}\n"
        f"  TDK eğitim akışı {len(tdk_egitim):,} token | toplam {toplam_adim} adım"
    )
    oran = len(tdk_egitim) / max(dokum["toplam"], 1)
    if asama == "tdk" and oran < 2:
        yaz(
            f"  Not: eğitim verisi parametre başına yalnız {oran:.2f} token. Model veriyi ezberleyebilir; doğrulama "
            "kaybını izle (erken durdurma açık), daha küçük boyut ya da ek metin (veri/ek_metin) düşün."
        )

    iyilestirici = model.iyilestirici(ea.ogrenme_orani, ea.agirlik_azaltma, cihaz)
    if kn is not None and "iyilestirici" in kn:
        iyilestirici.load_state_dict(kn["iyilestirici"])
    olcekleyici = torch.amp.GradScaler(enabled=(hassasiyet == "fp16" and cihaz == "cuda"))
    calisan = torch.compile(model) if ea.derle and cihaz == "cuda" else model

    sabit_dogrulama = [tdk_dogrulama.yigin(ea.yigin, baglam_uzunlugu, np.random.default_rng(0)) for _ in range(ea.degerlendirme_yigini)]
    if meb_dogrulama is not None and len(meb_dogrulama):
        secim_uretec = np.random.default_rng(1)
        meb_sabit = [
            meb_dogrulama.yigin(ea.yigin, baglam_uzunlugu, secim_uretec, ea.kayip) for _ in range(ea.degerlendirme_yigini)
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

    def kaydet(yol: Path, adim: int) -> None:
        torch.save(
            {
                "model": model.state_dict(),
                "iyilestirici": iyilestirici.state_dict(),
                "adim": adim,
                "en_iyi": en_iyi,
                "gorulen_token": gorulen,
                "asama": asama,
                "ayarlar": ayarlar.sozluk(),
                "tokenizer": tokenizer_imzasi(tok),
            },
            yol,
        )

    gunluk = (klasor / "gunluk.jsonl").open("a", encoding="utf-8")
    model.train()
    basla = time.time()
    # Kayıp cihazda biriktirilir; her mikro adımda .item() GPU'yu bekletirdi.
    son_kayit_zamani, toplanan_kayip, toplanan_sayi = basla, torch.zeros((), device=cihaz), 0
    adim = baslangic_adim
    durdu = False
    try:
        for adim in range(baslangic_adim, toplam_adim):
            lr = ogrenme_orani(adim, toplam_adim, ea)
            for grup in iyilestirici.param_groups:
                grup["lr"] = lr
            for _ in range(ea.birikim):
                if asama == "meb" and uretec.random() >= ea.tdk_karisim:
                    x, y = meb_egitim.yigin(ea.yigin, baglam_uzunlugu, uretec, ea.kayip)
                else:
                    x, y = tdk_egitim.yigin(ea.yigin, baglam_uzunlugu, uretec)
                x, y = x.to(cihaz, non_blocking=True), y.to(cihaz, non_blocking=True)
                with ctx():
                    _, kayip = calisan(x, y)
                olcekleyici.scale(kayip / ea.birikim).backward()
                toplanan_kayip += kayip.detach().float()
                toplanan_sayi += 1
                gorulen += int((y != -100).sum())
            if ea.gradyan_kirpma:
                olcekleyici.unscale_(iyilestirici)
                torch.nn.utils.clip_grad_norm_(model.parameters(), ea.gradyan_kirpma)
            olcekleyici.step(iyilestirici)
            olcekleyici.update()
            iyilestirici.zero_grad(set_to_none=True)

            son_adim = adim + 1 == toplam_adim
            if (adim + 1) % ea.degerlendirme_her == 0 or son_adim:
                d = dogrulama()
                gecen = time.time() - son_kayit_zamani
                kayit = {
                    "adim": adim + 1,
                    "ogrenme_orani": lr,
                    "egitim_kaybi": float(toplanan_kayip) / max(toplanan_sayi, 1),
                    **d,
                    "gorulen_token": gorulen,
                    "sure_sn": round(time.time() - basla, 1),
                    "token_sn": round(toplanan_sayi * ea.yigin * baglam_uzunlugu / max(gecen, 1e-9)),
                }
                gunluk.write(json.dumps(kayit, ensure_ascii=False) + "\n")
                gunluk.flush()
                ana = d.get("meb_kayip", d["tdk_kayip"]) if asama == "meb" else d["tdk_kayip"]
                ek = "".join(f" | {k} {v:.4f}" for k, v in d.items())
                yaz(f"  adım {adim + 1}/{toplam_adim} | lr {lr:.2e} | eğitim {kayit['egitim_kaybi']:.4f}{ek} | {kayit['token_sn']} tok/sn")
                toplanan_kayip, toplanan_sayi, son_kayit_zamani = torch.zeros((), device=cihaz), 0, time.time()
                if ana < en_iyi:
                    en_iyi, sabir = ana, 0
                    kaydet(en_iyi_yol, adim + 1)
                else:
                    sabir += 1
                kaydet(son_yol, adim + 1)
                if ea.erken_durdurma and sabir >= ea.erken_durdurma:
                    yaz(f"  Erken durdurma: {sabir} değerlendirmedir doğrulama kaybı iyileşmiyor (en iyi {en_iyi:.4f}).")
                    durdu = True
                    break
    except KeyboardInterrupt:
        yaz("\nDurduruldu. Son kontrol noktası kaydediliyor; --devam ile sürdürebilirsin.")
        kaydet(son_yol, adim)
        durdu = True
    finally:
        gunluk.close()

    yaz(f"Eğitim bitti ({(time.time() - basla) / 60:.1f} dk). En iyi model: {en_iyi_yol}")
    sonuc = degerlendir(ayarlar, asama, cihaz=cihaz, yaz=yaz, gorulen_token=gorulen)
    sonuc["erken_durdu"] = durdu
    return sonuc


def degerlendir(
    ayarlar: Ayarlar,
    asama: str,
    cihaz: str | None = None,
    yaz=print,
    gorulen_token: int | None = None,
    kontrol_noktasi: Path | None = None,
) -> dict:
    """En iyi kontrol noktasını tam değerlendirir ve ilerleme tablosuna ekler."""
    cihaz = cihaz or cihaz_sec()
    tok = tokenizer_yukle(ayarlar)
    meta = hazir_veri(ayarlar, tok)
    yol = kontrol_noktasi or ayarlar.deney_klasoru / asama / "en_iyi.pt"
    if not yol.exists() and kontrol_noktasi is None:
        yol = ayarlar.deney_klasoru / asama / "son.pt"  # hiç değerlendirme yapılmadan durdurulduysa
    if not yol.exists():
        raise AyarHatasi(f"Değerlendirilecek model yok: {yol}")
    model, kn = modeli_yukle(yol, tok, cihaz)
    ctx = baglam_yoneticisi(cihaz, hassasiyet_sec(getattr(ayarlar, asama).hassasiyet, cihaz))
    vk = veri_klasoru(ayarlar)
    akis = akis_kaybi(model, AkisVeri(vk / "tdk_dogrulama.bin", tok.boyut), cihaz, ctx)
    sonuc = {
        "deney": ayarlar.deney_adi,
        "asama": asama,
        "adim": kn.get("adim"),
        "parametre": model.parametre_dokumu()["toplam"],
        "parametre_gomme_disi": model.parametre_dokumu()["gömme dışı"],
        "gorulen_token": gorulen_token if gorulen_token is not None else kn.get("gorulen_token"),
        "dogrulama_kaybi": akis["kayip"],
        "sasirma": akis["sasirma"],
        "bpc": bpc(akis["toplam_nll"], meta["tdk_dogrulama"]["karakter"]),
        "gomme": asdict(GommeAyarlari(**kn["ayarlar"]["gomme"])),
    }
    yaz(f"TDK doğrulama: kayıp {akis['kayip']:.4f} | şaşkınlık {akis['sasirma']:.1f} | BPC {sonuc['bpc']:.3f}")
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
                    f"MEB {bolum}: {cs['n']} soru | doğruluk metin %{100 * cs['dogruluk_metin']:.1f}, "
                    f"harf %{100 * cs['dogruluk_harf']:.1f} | rastgele %{100 * cs['rastgele']:.1f}"
                )
    mmlu_yolu = ayarlar.veri_klasoru / "meb" / "turkishmmlu.jsonl"
    if mmlu_yolu.exists():
        from .meb import soru_oku

        cs = coktan_secmeli(model, tok, soru_oku(mmlu_yolu), cihaz, ctx)
        sonuc["mmlu"] = cs
        yaz(
            f"TurkishMMLU (hiç eğitilmedi): {cs['n']} soru | doğruluk metin %{100 * cs['dogruluk_metin']:.1f}, "
            f"harf %{100 * cs['dogruluk_harf']:.1f} | rastgele %{100 * cs['rastgele']:.1f}"
        )
    md = ilerleme_ekle(ayarlar.cikti_klasoru, sonuc)
    yaz(f"İlerleme tablosu güncellendi: {md}")
    return sonuc


def hiz_olc(ayarlar: Ayarlar, sozluk_boyutu: int, adim: int = 5, cihaz: str | None = None) -> dict:
    """Rastgele veriyle birkaç eğitim adımı: saniyede token ve (CUDA'da) en yüksek bellek."""
    cihaz = cihaz or cihaz_sec()
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
    sureler = []
    for i in range(adim + 1):
        x = torch.randint(0, sozluk_boyutu, (ea.yigin, t), device=cihaz)
        bas = time.time()
        with ctx():
            _, kayip = model(x, x)
        kayip.backward()
        opt.step()
        opt.zero_grad(set_to_none=True)
        if cihaz == "cuda":
            torch.cuda.synchronize()
        if i:  # ilk adım ısınmadır
            sureler.append(time.time() - bas)
    sn = sum(sureler) / len(sureler)
    sonuc = {"cihaz": cihaz, "hassasiyet": hassasiyet, "token_sn": ea.yigin * t / sn, "adim_sn": sn}
    if cihaz == "cuda":
        sonuc["en_yuksek_bellek_gb"] = torch.cuda.max_memory_allocated() / 1e9
    return sonuc
