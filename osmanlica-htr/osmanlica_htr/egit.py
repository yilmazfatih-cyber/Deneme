"""Eğitim döngüsü: CTC kaybı, CER ile doğrulama, en iyi modeli kaydetme."""

from __future__ import annotations

import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader

from .alfabe import Alfabe
from .kodcoz import acgozlu
from .model import CRNN, model_kaydet, model_yukle
from .veri import SatirVeriSeti, kec_cer, manifest_oku, toplayici


def _cer_hesapla(model, loader, alfabe, cihaz, en_fazla: int | None = None):
    model.eval()
    uzaklik = uzunluk = n = 0
    with torch.no_grad():
        for x, _, girdi_uz, _, metinler in loader:
            logp = model(x.to(cihaz)).cpu().numpy()  # T, B, C
            for b, gercek in enumerate(metinler):
                T = int(girdi_uz[b])
                tah = alfabe.coz(acgozlu(logp[:T, b], alfabe.blank))
                d, u = kec_cer(tah, gercek)
                uzaklik += d
                uzunluk += u
                n += 1
            if en_fazla and n >= en_fazla:
                break
    model.train()
    return uzaklik / max(1, uzunluk)


def egit(
    manifestler: list[Path],
    cikti: Path,
    baslangic: Path | None = None,
    donem: int = 20,
    parti: int = 32,
    ogrenme_orani: float = 1e-3,
    dogrulama_orani: float = 0.05,
    kanal: int = 32,
    gizli: int = 128,
    katman: int = 2,
    tohum: int = 0,
    cihaz: str | None = None,
    gercek_agirlik: int = 4,
    isci: int = 2,
    sentez_ust_sinir: int | None = None,
    acik_ust_sinir: int | None = None,
    ara_kayit_adim: int = 300,
    gunluk=print,
) -> Path:
    """Birden çok manifesti birleştirip eğitir. `kaynak == "etiket"` olan (gerçek) örnekler `gercek_agirlik` kat tekrarlanır."""
    random.seed(tohum)
    torch.manual_seed(tohum)
    cihaz = cihaz or ("cuda" if torch.cuda.is_available() else "cpu")
    cikti = Path(cikti)
    cikti.mkdir(parents=True, exist_ok=True)

    kayitlar = []
    for m in manifestler:
        kayitlar.extend(manifest_oku(Path(m)))
    import re

    latin = [k for k in kayitlar if re.search(r"[A-Za-z]", k["metin"])]
    if latin:
        gunluk(f"Latin harf içeren {len(latin)} satır dışarıda bırakıldı")
        kayitlar = [k for k in kayitlar if not re.search(r"[A-Za-z]", k["metin"])]
    if not kayitlar:
        raise SystemExit("Eğitilecek örnek yok.")
    gercek = [k for k in kayitlar if k.get("kaynak") == "etiket"]
    sentez = [k for k in kayitlar if k.get("kaynak") == "sentez"]
    acik = [k for k in kayitlar if k.get("kaynak") not in ("etiket", "sentez")]  # Muharaf, OpenITI, MAKHZAN...
    if sentez_ust_sinir is not None and len(sentez) > sentez_ust_sinir:
        random.Random(tohum).shuffle(sentez)
        sentez = sentez[:sentez_ust_sinir]
        kayitlar = sentez + acik + gercek
    if acik_ust_sinir is not None and len(acik) > acik_ust_sinir:
        random.Random(tohum + 1).shuffle(acik)
        acik = acik[:acik_ust_sinir]
        kayitlar = sentez + acik + gercek
    gunluk(f"örnek: {len(sentez)} sentetik + {len(acik)} açık veri + {len(gercek)} kendi etiketimiz (×{gercek_agirlik})")

    if baslangic:
        model, alfabe, meta = model_yukle(baslangic, cihaz)
        bilinmeyen = set()
        for k in kayitlar:
            bilinmeyen |= alfabe.bilinmeyenler(k["metin"])
        if bilinmeyen:
            gunluk(f"uyarı: başlangıç modelinin alfabesinde olmayan karakterler atlanacak: {''.join(sorted(bilinmeyen))}")
        gunluk(f"başlangıç modeli: {baslangic} ({model.parametre_sayisi():,} parametre)")
    else:
        alfabe = Alfabe.metinlerden([k["metin"] for k in kayitlar])
        model = CRNN(len(alfabe), kanal=kanal, gizli=gizli, katman=katman).to(cihaz)
        meta = {}
        gunluk(f"yeni model: {model.parametre_sayisi():,} parametre, {len(alfabe)} sınıf")

    # Doğrulama kümesi: gerçek varsa gerçekten, yoksa sentetikten
    rng = random.Random(tohum)
    havuz = gercek if len(gercek) >= 40 else (acik if len(acik) >= 200 else kayitlar)
    havuz = list(havuz)
    rng.shuffle(havuz)
    n_dog = max(16, int(len(havuz) * dogrulama_orani)) if len(havuz) > 32 else max(1, len(havuz) // 5)
    dogrulama = havuz[:n_dog]
    dog_kimlik = {id(k) for k in dogrulama}
    egitim = [k for k in sentez + acik if id(k) not in dog_kimlik] + [k for k in gercek if id(k) not in dog_kimlik] * gercek_agirlik

    ds_e = SatirVeriSeti(egitim, alfabe, egitim=True)
    ds_d = SatirVeriSeti(dogrulama, alfabe, egitim=False)
    dl_e = DataLoader(ds_e, batch_size=parti, shuffle=True, collate_fn=toplayici, num_workers=isci, drop_last=False)
    dl_d = DataLoader(ds_d, batch_size=parti, shuffle=False, collate_fn=toplayici, num_workers=0)

    kayip_fn = nn.CTCLoss(blank=alfabe.blank, zero_infinity=True)
    opt = torch.optim.AdamW(model.parameters(), lr=ogrenme_orani, weight_decay=1e-4)
    adim_toplam = max(1, donem * len(dl_e))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=ogrenme_orani, total_steps=adim_toplam, pct_start=0.1)

    en_iyi = float("inf")
    en_iyi_yol = cikti / "model.pt"
    gecmis = []
    model.train()
    for d in range(1, donem + 1):
        t0 = time.time()
        toplam = adet = 0
        for x, y, girdi_uz, hedef_uz, _ in dl_e:
            x = x.to(cihaz)
            logp = model(x)
            T = logp.shape[0]
            girdi_uz = torch.clamp(girdi_uz, max=T)
            kayip = kayip_fn(logp, y, girdi_uz, hedef_uz)
            opt.zero_grad(set_to_none=True)
            kayip.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
            sched.step()
            toplam += kayip.item()
            adet += 1
            if ara_kayit_adim and adet % ara_kayit_adim == 0:
                model_kaydet(cikti / "ara.pt", model, alfabe, {**meta, "donem": d, "adim": adet, "kayip": toplam / adet})
                gunluk(f"  ara kayıt: dönem {d} adım {adet} kayıp {toplam / adet:.3f}")
        cer = _cer_hesapla(model, dl_d, alfabe, cihaz)
        gecmis.append({"donem": d, "kayip": toplam / max(1, adet), "cer": cer, "sure": time.time() - t0})
        gunluk(f"dönem {d:3d}/{donem}  kayıp {toplam / max(1, adet):.3f}  doğrulama CER {cer * 100:.2f}%  ({time.time() - t0:.0f} sn)")
        if cer < en_iyi:
            en_iyi = cer
            model_kaydet(en_iyi_yol, model, alfabe, {**meta, "cer": cer, "donem": d, "ornek": len(egitim), "gercek": len(gercek)})
    model_kaydet(cikti / "son.pt", model, alfabe, {**meta, "cer": cer, "donem": donem})
    (cikti / "gecmis.json").write_text(json.dumps(gecmis, ensure_ascii=False, indent=1), encoding="utf-8")
    gunluk(f"en iyi doğrulama CER {en_iyi * 100:.2f}% → {en_iyi_yol}")
    return en_iyi_yol
