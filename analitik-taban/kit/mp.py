#!/usr/bin/env python3
"""Mixpanel komutları: kısa Türkçe tablolar basar, ham yanıtları yerel/veri/ altına yazar.

Keşif   kontrol · sozluk [--ice-aktar DOSYA] · ara TERIM · degerler OLAY OZELLIK
Sayılar seri OLAY... · kirilim OLAY --on OZELLIK · kpi [--donem gun|hafta|ay]
Neden   neden OLAY | neden --pay OLAY --payda OLAY [--donem gun|hafta|28g] | neden --csv DOSYA
Huni    huni AD|ID [--on OZ] [--onceki] · huni --liste · huni-yerel ADIM1 ADIM2 ... [--pencere 1g]
Diğer   tutunma DOGUM [DONUS] · kayitli RAPOR_ID · deney DENEY_ADI --donusum OLAY
Ortak   --aralik 28g|BAS:BIT · --filtre 'k=v' (= != > < >= <= ~) · --where IFADE · --limit N · --rapor · --taze
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analitik import (  # noqa: E402
    analiz,
    baglam,
    bicim,
    boru_kapandi,
    csvoku,
    istatistik,
    rapor,
    sozluk,
    utf8_cikti,
)
from analitik import ayarlar as A  # noqa: E402
from analitik.istemci import ApiHatasi  # noqa: E402
from analitik.mixpanel import Mixpanel, filtre_ifadesi  # noqa: E402

Aralik = Tuple[dt.date, dt.date]
GUN = dt.timedelta(days=1)


class KomutHatasi(Exception):
    pass


# --- ortak yardımcılar ----------------------------------------------------------------------------


def _ortam(arg, api: bool = True) -> Tuple[A.Ayarlar, Optional[Mixpanel]]:
    ayar = A.yukle()
    if not api:
        return ayar, None
    kaynak = ayar["mixpanel"].get("kaynak", "api")
    kimlik = ayar.gizli("MIXPANEL_SA_USER") or ayar.gizli("MIXPANEL_API_SECRET")
    if not ayar.demo and kaynak in ("mcp", "csv") and not kimlik:
        raise KomutHatasi(
            f"Mixpanel kaynağı '{kaynak}': bu komut API kimliği ister. Veriyi `veri-cekici` alt ajanıyla (MCP) ya da "
            "CSV dışa aktarımıyla alın (`python3 kit/ozet.py`, `mp.py neden --csv`)."
        )
    return ayar, Mixpanel(ayar, taze=getattr(arg, "taze", False))


def _aralik(ifade: Optional[str], bugun: dt.date, varsayilan: str = "28g") -> Aralik:
    ifade = (ifade or varsayilan).strip().lower()
    if ifade == "hafta":
        ifade = "7g"
    eslesme = re.fullmatch(r"(\d+)g", ifade)
    if eslesme:
        n = int(eslesme.group(1))
        dun = bugun - GUN
        return dun - dt.timedelta(days=n - 1), dun
    return analiz.aralik_coz(ifade)


def _onceki(aralik: Aralik) -> Aralik:
    n = (aralik[1] - aralik[0]).days + 1
    return aralik[0] - dt.timedelta(days=n), aralik[0] - GUN


def _gun(aralik: Aralik) -> int:
    return (aralik[1] - aralik[0]).days + 1


def _seg(ad: str) -> str:
    return analiz.TANIMSIZ if str(ad).strip() in ("", "undefined", "null", "None") else str(ad)


def _sayi(x, ondalik: int = 0) -> str:
    return bicim.sayi(x, ondalik)


def _z(x) -> str:
    return bicim.BOS if x is None else bicim.sayi(x, 1)


def _pencere_sn(ifade: str) -> float:
    eslesme = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*(g|gün|s|sa|saat|dk|d)", ifade.strip().lower())
    if not eslesme:
        raise KomutHatasi("Pencere '1g' (gün), '6s' (saat) ya da '30dk' biçiminde olmalı.")
    deger = float(eslesme.group(1).replace(",", "."))
    birim = eslesme.group(2)
    return deger * (86400 if birim in ("g", "gün") else 3600 if birim in ("s", "sa", "saat") else 60)


def _epoch_yerel(gun: dt.date, ayar: A.Ayarlar) -> float:
    return (gun - dt.date(1970, 1, 1)).days * 86400 - ayar.ofset * 3600


def _cikti(satirlar: List[str], ayar: A.Ayarlar, arg, konu: str, baslik: str, ham=None) -> None:
    govde = "\n".join(s for s in satirlar if s is not None)
    rapor_yolu = rapor.yaz(ayar, konu, baslik, govde) if getattr(arg, "rapor", False) else None
    print(govde)
    alt = rapor.alt_bilgi(ham, rapor_yolu)
    if alt:
        print(alt)


def _filtre_metni(where: Optional[str]) -> str:
    return f" · filtre: {bicim.kisalt(where, 90)}" if where else ""


# --- keşif ----------------------------------------------------------------------------------------


def k_kontrol(arg) -> None:
    ayar = A.yukle()
    mp_ayar = ayar["mixpanel"]
    kaynak = "DEMO (sentetik)" if ayar.demo else mp_ayar.get("kaynak", "api")
    print(f"Mod: {kaynak} · bölge {mp_ayar.get('bolge')} · bugün (proje saati UTC{ayar.ofset:+g}): {ayar.bugun()}")
    _, mp = _ortam(arg)
    mp.onbellek.dizin = None
    for satir in mp.kontrol():
        print("✓ " + satir)


def k_sozluk(arg) -> None:
    if arg.ice_aktar:
        ayar, mp = _ortam(arg, api=False)
        s = sozluk.ice_aktar(Path(arg.ice_aktar))
        sorgu = 0
    else:
        ayar, mp = _ortam(arg)
        s = sozluk.kur_api(mp, ozellik_olay_sayisi=arg.ozellik_olay)
        sorgu = mp.sorgu_sayisi
    yol = sozluk.kaydet(ayar, s)
    baglam.yaz(ayar)
    print(f"Sözlük: {len(s['olaylar'])} olay ({s['kaynak']}) → {A.goreli(yol)} · {sorgu} API sorgusu")
    print("En sık: " + ", ".join(o["ad"] for o in s["olaylar"][:15]))
    print("CLAUDE.local.md güncellendi.")


def k_ara(arg) -> None:
    ayar = A.yukle()
    s = sozluk.yukle(ayar)
    if not s:
        raise KomutHatasi("Sözlük yok: python3 kit/mp.py sozluk (MCP/CSV için: --ice-aktar DOSYA)")
    if arg.olay:
        o = sozluk.olay(s, arg.terim)
        if not o:
            raise KomutHatasi(f"Sözlükte '{arg.terim}' adlı olay yok; `mp.py ara {arg.terim}` deneyin.")
        print(f"{o['ad']} · 30 gün: {_sayi(o.get('hacim'))} · {o.get('aciklama') or 'açıklama yok'}")
        print("Özellikler: " + (", ".join(o.get("ozellikler") or []) or "(kayıtlı değil; `mp.py sozluk` ile kurun)"))
        return
    sonuc = sozluk.ara(s, arg.terim, limit=arg.limit)
    if sonuc["olaylar"]:
        satirlar = [
            [
                o["ad"],
                _sayi(o.get("hacim")),
                bicim.kisalt(", ".join(o.get("ozellikler") or []), 60),
                bicim.kisalt(o.get("aciklama") or "", 40),
            ]
            for o in sonuc["olaylar"]
        ]
        print(bicim.tablo(["olay", "30 gün", "özellikler", "açıklama"], satirlar, hizala="lrll"))
    if sonuc["ozellikler"]:
        print("Özellikler: " + "; ".join(f"`{oz}` ({', '.join(ol[:3])})" for oz, ol in sonuc["ozellikler"]))
    if not sonuc["olaylar"] and not sonuc["ozellikler"]:
        oneriler = ", ".join(sonuc["oneriler"]) or "yok"
        print(f"'{arg.terim}' bulunamadı. Yakın adlar: {oneriler}")


def k_degerler(arg) -> None:
    _, mp = _ortam(arg)
    degerler = mp.ozellik_degerleri(arg.olay, arg.ozellik, limit=arg.limit)
    print(
        f"`{arg.ozellik}` değerleri · {arg.olay} · son 31 gün, sıklık sırası ({len(degerler)}): "
        + ", ".join(_seg(d) for d in degerler)
    )


# --- sayılar --------------------------------------------------------------------------------------


def _bol(seri: Dict[str, float], aralik: Aralik) -> List[float]:
    gunler = analiz.gunler(aralik)
    return [float(seri.get(g, 0) or 0) for g in gunler]


def k_seri(arg) -> None:
    ayar, mp = _ortam(arg)
    a_ = _aralik(arg.aralik, mp.bugun)
    b_ = _onceki(a_)
    where = filtre_ifadesi(arg.filtre, arg.where)
    if where:
        seriler = {o: mp.toplam_serisi(o, arg.tip, b_[0], a_[1], "day", where) for o in arg.olaylar}
    else:
        seriler = mp.olay_serisi(arg.olaylar, arg.tip, "day", b_[0], a_[1])
    ham = A.ham_kaydet(ayar, "seri", seriler)
    tekil = arg.tip == "unique"
    olcu = "günlük ort. tekil" if tekil else "toplam"
    satirlar = []
    for olay in arg.olaylar:
        s = seriler.get(olay, {})
        a_degerler, b_degerler = _bol(s, a_), _bol(s, b_)
        a_top, b_top = sum(a_degerler), sum(b_degerler)
        bolen_a, bolen_b = (len(a_degerler), len(b_degerler)) if tekil else (1, 1)
        satirlar.append(
            [
                olay,
                _sayi(a_top / bolen_a),
                _sayi(b_top / bolen_b),
                bicim.degisim(a_top, b_top),
                _z(istatistik.sayim_z(a_top, b_top)),
                bicim.kivilcim(a_degerler[-30:]),
            ]
        )
    cikti = [
        f"SERİ · {olcu} · A {analiz.aralik_metni(a_)} vs B {analiz.aralik_metni(b_)}{_filtre_metni(where)}",
        bicim.tablo(["olay", "A", "B", "Δ%", "z", "A günlük eğilim"], satirlar, hizala="lrrrrl"),
    ]
    if arg.tablo:
        gunler = analiz.gunler(a_)[-arg.limit :]
        tablo = [[g] + [_sayi(seriler.get(o, {}).get(g, 0)) for o in arg.olaylar] for g in gunler]
        cikti.append(bicim.tablo(["gün"] + list(arg.olaylar), tablo))
    _cikti(cikti, ayar, arg, "seri-" + "-".join(arg.olaylar), "Olay serisi", ham)


def k_kirilim(arg) -> None:
    ayar, mp = _ortam(arg)
    a_ = _aralik(arg.aralik, mp.bugun)
    b_ = _onceki(a_)
    where = filtre_ifadesi(arg.filtre, arg.where)
    veri = mp.kirilim(arg.olay, arg.on, b_[0], a_[1], arg.tip, "day", where, limit=100)
    ham = A.ham_kaydet(ayar, f"kirilim-{arg.olay}-{arg.on}", veri)
    a = {_seg(s): analiz.topla_aralik(seri, a_) for s, seri in veri.items()}
    b = {_seg(s): analiz.topla_aralik(seri, b_) for s, seri in veri.items()}
    k = analiz.katki(a, b)
    tekil = arg.tip == "unique"
    bolen = _gun(a_) if tekil else 1
    toplam_a = k["a_toplam"] or 1
    satirlar = sorted(k["satirlar"], key=lambda s: -s["a"])
    gosterilen, kalan = satirlar[: arg.limit], satirlar[arg.limit :]
    tablo = [
        [
            bicim.kisalt(s["segment"], 32),
            _sayi(s["a"] / bolen),
            bicim.yuzde(s["a"] / toplam_a),
            _sayi(s["b"] / bolen),
            bicim.degisim(s["a"], s["b"]),
            _z(s["sapma_z"]),
        ]
        for s in gosterilen
    ]
    if kalan:
        ka, kb = sum(s["a"] for s in kalan), sum(s["b"] for s in kalan)
        tablo.append(
            [
                f"(diğer {len(kalan)})",
                _sayi(ka / bolen),
                bicim.yuzde(ka / toplam_a),
                _sayi(kb / bolen),
                bicim.degisim(ka, kb),
                bicim.BOS,
            ]
        )
    tablo.append(
        [
            "TOPLAM",
            _sayi(k["a_toplam"] / bolen),
            "%100",
            _sayi(k["b_toplam"] / bolen),
            bicim.degisim(k["a_toplam"], k["b_toplam"]),
            _z(k["z"]),
        ]
    )
    olcu = "günlük ort. tekil" if tekil else "toplam"
    cikti = [
        f"KIRILIM · {arg.olay} × {arg.on} · {olcu} · A {analiz.aralik_metni(a_)} vs B {analiz.aralik_metni(b_)}"
        f"{_filtre_metni(where)}",
        bicim.tablo(["segment", "A", "pay", "B", "Δ%", "sapma z"], tablo, hizala="lrrrrr"),
    ]
    if len(veri) >= 100:
        cikti.append("Not: 100 segment sınırına ulaşıldı; çok küçük segmentler listede olmayabilir.")
    _cikti(cikti, ayar, arg, f"kirilim-{arg.olay}-{arg.on}", f"Kırılım: {arg.olay} × {arg.on}", ham)


# --- neden ----------------------------------------------------------------------------------------


def _neden_csv(yol: Path) -> Tuple[Dict[str, Dict], bool]:
    basliklar, satirlar = csvoku.oku(yol)
    kucuk = [b.strip().lower() for b in basliklar]
    oran = "pay_a" in kucuk
    gerekli = ["boyut", "segment"] + (["pay_a", "payda_a", "pay_b", "payda_b"] if oran else ["a", "b"])
    eksik = [g for g in gerekli if g not in kucuk]
    if eksik:
        raise KomutHatasi(f"CSV sütunları eksik: {', '.join(eksik)} (gereken: {', '.join(gerekli)})")
    boyutlar: Dict[str, Dict] = defaultdict(lambda: defaultdict(dict))
    for s in satirlar:
        kayit = dict(zip(kucuk, s))
        for alan in gerekli[2:]:
            boyutlar[kayit["boyut"]][alan][_seg(kayit["segment"])] = csvoku.sayiya(kayit[alan]) or 0.0
    return boyutlar, oran


def k_neden(arg) -> None:
    oran_modu = bool(arg.pay and arg.payda)
    if not (arg.olay or oran_modu or arg.csv):
        raise KomutHatasi('Bir olay verin (`neden "Purchase"`), ya da --pay ve --payda, ya da --csv.')
    ayar, mp = _ortam(arg, api=not arg.csv)
    bugun = ayar.bugun()
    if arg.a and arg.b:
        a_, b_, etiket = analiz.aralik_coz(arg.a), analiz.aralik_coz(arg.b), "özel aralık"
    else:
        a_, b_, etiket = analiz.donem_coz(arg.donem, bugun)
    bas, bit = min(a_[0], b_[0]), max(a_[1], b_[1])
    boyutlar = [b.strip() for b in arg.boyutlar.split(",")] if arg.boyutlar else list(ayar.get("boyutlar") or [])
    where = filtre_ifadesi(arg.filtre, arg.where)
    tip = arg.tip or ("unique" if oran_modu else "general")
    sonuclar: Dict[str, Dict] = {}
    ham_veri: Dict[str, Dict] = {}
    if arg.csv:
        csv_boyutlar, oran_modu = _neden_csv(Path(arg.csv))
        for boyut, alanlar in csv_boyutlar.items():
            if oran_modu:
                sonuclar[boyut] = analiz.oran_ayristir(
                    alanlar["pay_a"], alanlar["payda_a"], alanlar["pay_b"], alanlar["payda_b"]
                )
            else:
                toplam_a = alanlar["a"].pop("(toplam)", None)
                toplam_b = alanlar["b"].pop("(toplam)", None)
                sonuclar[boyut] = analiz.katki(alanlar["a"], alanlar["b"], toplam_a, toplam_b)
        metrik = f"CSV: {Path(arg.csv).name}"
    elif oran_modu:
        for boyut in boyutlar:
            pay = mp.kirilim(arg.pay, boyut, bas, bit, tip, "day", where, 100)
            payda = mp.kirilim(arg.payda, boyut, bas, bit, tip, "day", where, 100)
            ham_veri[boyut] = {"pay": pay, "payda": payda}
            sonuclar[boyut] = analiz.oran_ayristir(
                {_seg(s): analiz.topla_aralik(v, a_) for s, v in pay.items()},
                {_seg(s): analiz.topla_aralik(v, a_) for s, v in payda.items()},
                {_seg(s): analiz.topla_aralik(v, b_) for s, v in pay.items()},
                {_seg(s): analiz.topla_aralik(v, b_) for s, v in payda.items()},
            )
        metrik = f"{arg.pay} / {arg.payda} ({'tekil' if tip == 'unique' else 'toplam'})"
    else:
        toplam = mp.toplam_serisi(arg.olay, tip, bas, bit, "day", where)
        a_top, b_top = analiz.topla_aralik(toplam, a_), analiz.topla_aralik(toplam, b_)
        ham_veri["_toplam"] = toplam
        for boyut in boyutlar:
            veri = mp.kirilim(arg.olay, boyut, bas, bit, tip, "day", where, 100)
            ham_veri[boyut] = veri
            sonuclar[boyut] = analiz.katki(
                {_seg(s): analiz.topla_aralik(v, a_) for s, v in veri.items()},
                {_seg(s): analiz.topla_aralik(v, b_) for s, v in veri.items()},
                a_top,
                b_top,
            )
        metrik = f"{arg.olay} ({'tekil, gün toplamı' if tip == 'unique' else 'toplam'})"
    ham = A.ham_kaydet(ayar, "neden", ham_veri) if ham_veri else None
    if not sonuclar:
        raise KomutHatasi("Boyut yok: ayarlar.json → boyutlar ya da --boyutlar '$os,mp_country_code'.")

    cikti = [
        f"NEDEN · {metrik} · A {analiz.aralik_metni(a_)} vs B {analiz.aralik_metni(b_)} ({etiket})"
        f"{_filtre_metni(where)}"
    ]
    if oran_modu:
        cikti += _neden_oran(sonuclar, arg.limit)
    else:
        cikti += _neden_sayim(sonuclar, arg.limit)
    notlar = rapor.gunluk_notlari(ayar, min(a_[0], b_[0]) - dt.timedelta(days=7), max(a_[1], b_[1]) + GUN)
    if notlar:
        cikti.append("Günlük (yerel/notlar.md): " + " · ".join(notlar))
    _cikti(cikti, ayar, arg, "neden-" + (arg.olay or arg.pay or "csv"), f"Neden analizi: {metrik}", ham)


def _boyut_ozeti(k: Dict) -> Dict:
    """Bir boyutta değişimin yoğunlaşıp yoğunlaşmadığı: Σ sapma z² ~ ki-kare; yeni/kaybolan segment payı."""
    satirlar = [s for s in k["satirlar"] if s["segment"] != analiz.DIGER]
    ki = sum(s["sapma_z"] ** 2 for s in satirlar)
    p = istatistik.ki_kare_p(ki, max(1, len(satirlar) - 1)) if len(satirlar) > 1 else 1.0
    yeni = sum(s["a"] for s in satirlar if s["a"] > 0 and s["b"] < 0.25 * s["a"])
    kaybolan = sum(s["b"] for s in satirlar if s["b"] > 0 and s["a"] < 0.25 * s["b"])
    kayma = max(yeni / k["a_toplam"] if k["a_toplam"] else 0, kaybolan / k["b_toplam"] if k["b_toplam"] else 0)
    en = max(satirlar, key=lambda s: abs(s["sapma_z"])) if satirlar else None
    return {"satirlar": satirlar, "p": p, "kayma": kayma, "en": en}


def _neden_sayim(sonuclar: Dict[str, Dict], limit: int) -> List[str]:
    ilk = next(iter(sonuclar.values()))
    z = ilk["z"]
    if not ilk["a_toplam"] and not ilk["b_toplam"]:
        raise KomutHatasi("İki dönemde de veri yok: olay adını `mp.py ara` ile, filtreyi ve tarihleri kontrol edin.")
    karar = "gürültü sınırında (|z| < 2): yorumlamayın" if abs(z) < 2 else "anlamlı değişim"
    cikti = [
        f"Toplam: B {_sayi(ilk['b_toplam'])} → A {_sayi(ilk['a_toplam'])} "
        f"({bicim.degisim(ilk['a_toplam'], ilk['b_toplam'])}, fark {_sayi(ilk['fark'])}; z={_z(z)}) — {karar}"
    ]
    yogun, kayma, duz, adaylar = [], [], [], []
    for boyut, k in sonuclar.items():
        o = _boyut_ozeti(k)
        if not o["satirlar"]:
            continue
        if o["kayma"] >= 0.2:
            kayma.append((boyut, o))
            continue
        (yogun if o["p"] < 0.01 else duz).append((boyut, o))
        adaylar += [(boyut, s) for s in o["satirlar"]]
    adaylar.sort(key=lambda bs: -abs(bs[1]["sapma_z"]))
    secilen = [bs for bs in adaylar if abs(bs[1]["sapma_z"]) >= 2][:limit] or adaylar[: min(5, limit)]
    tablo = [
        [
            boyut,
            bicim.kisalt(s["segment"], 28),
            _sayi(s["b"]),
            _sayi(s["a"]),
            bicim.degisim(s["a"], s["b"]),
            bicim.yuzde(s["katki"], 0) if s["katki"] is not None else bicim.BOS,
            _z(s["sapma_z"]),
        ]
        for boyut, s in secilen
    ]
    if tablo and (abs(z) >= 2 or yogun):
        cikti.append(bicim.tablo(["boyut", "segment", "B", "A", "Δ%", "katkı", "sapma z"], tablo, hizala="llrrrrr"))
    if yogun:
        yogun.sort(key=lambda bo: bo[1]["p"])
        cikti.append(
            "Yoğunlaşma: "
            + "; ".join(
                f"{b} (p={bicim.sayi(o['p'], 4)}; {bicim.kisalt(o['en']['segment'], 20)} "
                f"{bicim.degisim(o['en']['a'], o['en']['b'])}, katkı {bicim.yuzde(o['en']['katki'], 0)})"
                for b, o in yogun
            )
        )
    if kayma:
        cikti.append(
            "Karma kayması (yeni/kaybolan segmentler; sürüm geçişi ya da kampanya — sayımla yorumlanmaz, "
            "oranla bakın `--pay/--payda`): " + ", ".join(f"{b} ({bicim.yuzde(o['kayma'], 0)})" for b, o in kayma)
        )
    if duz:
        cikti.append("Düz (genelle aynı oranda değişmiş, neden değil): " + ", ".join(b for b, _ in duz))
    cikti.append(
        "katkı = segment farkının toplam farka payı · sapma z = genelle aynı oranda değişseydi beklenenden sapma"
    )
    return cikti


def _neden_oran(sonuclar: Dict[str, Dict], limit: int) -> List[str]:
    ilk = next(iter(sonuclar.values()))
    if ilk["oran_a"] is None or ilk["oran_b"] is None:
        raise KomutHatasi("Payda olayında veri yok: olay adlarını `mp.py ara` ile ve dönemi kontrol edin.")
    karar = "" if ilk["z"] is None else (" — gürültü sınırında (|z| < 2)" if abs(ilk["z"]) < 2 else " — anlamlı")
    cikti = [
        f"Oran: B {bicim.yuzde(ilk['oran_b'])} → A {bicim.yuzde(ilk['oran_a'])} ({bicim.puan(ilk['fark'])}; "
        f"z={_z(ilk['z'])}){karar}"
    ]
    adaylar = []
    ozet = []
    for boyut, s in sonuclar.items():
        if not s["satirlar"]:
            continue
        cikti.append(
            f"- {boyut}: karma etkisi {bicim.puan(s['karma_toplam'], 2)}, segment içi oran etkisi "
            f"{bicim.puan(s['oran_toplam'], 2)}"
        )
        ozet.append((boyut, s["satirlar"][0]))
        adaylar += [(boyut, r) for r in s["satirlar"]]
    adaylar.sort(key=lambda br: -abs(br[1]["toplam_etki"]))
    tablo = [
        [
            boyut,
            bicim.kisalt(r["segment"], 26),
            f"{bicim.yuzde(r['pay_b'], 0)}→{bicim.yuzde(r['pay_a'], 0)}",
            bicim.yuzde(r["oran_b"]),
            bicim.yuzde(r["oran_a"]),
            bicim.puan(r["karma"], 2),
            bicim.puan(r["oran_etkisi"], 2),
            _z(r["z"]),
        ]
        for boyut, r in adaylar[:limit]
    ]
    cikti.append(
        bicim.tablo(
            ["boyut", "segment", "payda payı B→A", "oran B", "oran A", "karma", "oran etkisi", "z"],
            tablo,
            hizala="llrrrrrr",
        )
    )
    cikti.append(
        "karma = payı değişen segmentin oranının ortalamadan farkı kadar etki (düşük oranlı segment büyürse "
        "negatif) · oran etkisi = segmentin kendi oranındaki değişim · z = segment oranı A vs B"
    )
    return cikti


# --- KPI ------------------------------------------------------------------------------------------


def _kpi_araligi(donem: str, bugun: dt.date, adet: int) -> Tuple[str, Aralik]:
    dun = bugun - GUN
    if donem == "gun":
        n = max(adet, 8)
        return "day", (dun - dt.timedelta(days=n - 1), dun)
    if donem == "hafta":
        bit = bugun - dt.timedelta(days=bugun.weekday() + 1)
        return "week", (bit - dt.timedelta(days=7 * adet - 1), bit)
    if donem == "ay":
        bit = bugun.replace(day=1) - GUN
        bas = bit.replace(day=1)
        for _ in range(adet - 1):
            bas = (bas - GUN).replace(day=1)
        return "month", (bas, bit)
    raise KomutHatasi("Dönem gun, hafta ya da ay olmalı.")


def _tam_kovalar(anahtarlar: Sequence[str], birim: str, aralik: Aralik) -> List[str]:
    sonuc = []
    for anahtar in sorted(set(anahtarlar)):
        try:
            bas = dt.date.fromisoformat(anahtar[:10])
        except ValueError:
            continue
        if birim == "week":
            bit = bas + dt.timedelta(days=6)
        elif birim == "month":
            bit = (bas.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - GUN
        else:
            bit = bas
        if bas >= aralik[0] and bit <= aralik[1]:
            sonuc.append(anahtar)
    return sonuc


def k_kpi(arg) -> None:
    ayar, mp = _ortam(arg)
    kpiler = ayar.get("kpiler") or []
    if not kpiler:
        raise KomutHatasi("yerel/ayarlar.json → kpiler boş. Örnek: kit/ornekler/ayarlar.json")
    birim, aralik = _kpi_araligi(arg.donem, mp.bugun, arg.adet)
    gruplar: Dict[str, List[str]] = defaultdict(list)
    for k in kpiler:
        tip = k.get("tip", "general")
        for olay in [k["pay"], k["payda"]] if k.get("pay") else [k["olay"]]:
            if olay not in gruplar[tip]:
                gruplar[tip].append(olay)
    seriler = {tip: mp.olay_serisi(olaylar, tip, birim, *aralik) for tip, olaylar in gruplar.items()}
    ham = A.ham_kaydet(ayar, f"kpi-{arg.donem}", seriler)
    anahtarlar = [t for g in seriler.values() for s in g.values() for t in s]
    if birim == "day":
        kovalar = analiz.gunler(aralik)
    else:
        kovalar = _tam_kovalar(anahtarlar, birim, aralik)
    if len(kovalar) < 2:
        raise KomutHatasi("Kıyas için en az iki tam dönem gerekiyor; --adet değerini artırın.")
    kiyas = -8 if birim == "day" and len(kovalar) >= 8 else -2
    esik, z_esik = float(ayar["esikler"].get("degisim", 0.1)), float(ayar["esikler"].get("z", 3))
    tablo = []
    isaretli = []
    for k in kpiler:
        tip = k.get("tip", "general")
        g = seriler[tip]
        if k.get("pay"):
            pay = [g.get(k["pay"], {}).get(t, 0) for t in kovalar]
            payda = [g.get(k["payda"], {}).get(t, 0) for t in kovalar]
            degerler = [p / d if d else None for p, d in zip(pay, payda)]
            son, once = degerler[-1], degerler[kiyas]
            z = None
            if pay[-1] <= payda[-1] and pay[kiyas] <= payda[kiyas]:
                z = istatistik.iki_oran_testi(int(pay[kiyas]), int(payda[kiyas]), int(pay[-1]), int(payda[-1]))["z"]
            fark = bicim.puan(son - once) if son is not None and once is not None else bicim.BOS
            goreli = (son / once - 1) if son and once else 0
            son_m, once_m = bicim.yuzde(son), bicim.yuzde(once)
        else:
            degerler = [g.get(k["olay"], {}).get(t, 0) for t in kovalar]
            son, once = degerler[-1], degerler[kiyas]
            z = istatistik.sayim_z(son, once)
            fark = bicim.degisim(son, once)
            goreli = (son / once - 1) if once else 0
            son_m, once_m = _sayi(son), _sayi(once)
        uyari = abs(goreli) >= esik and z is not None and abs(z) >= z_esik
        if uyari:
            isaretli.append(k["ad"])
        tablo.append([k["ad"], son_m, once_m, fark, _z(z), bicim.kivilcim(degerler), "⚠" if uyari else ""])
    etiket = {"day": "günlük", "week": "haftalık", "month": "aylık"}[birim]
    kiyas_metni = "geçen haftanın aynı günü" if kiyas == -8 else "önceki dönem"
    cikti = [
        f"KPI · {etiket} · son dönem {kovalar[-1]} · kıyas: {kiyas_metni} ({kovalar[kiyas]}) · "
        f"{len(kovalar)} dönem eğilimi · eşik |Δ| ≥ {bicim.yuzde(esik, 0)} ve |z| ≥ {_sayi(z_esik)}",
        bicim.tablo(["KPI", "son", "önceki", "Δ", "z", "eğilim", ""], tablo, hizala="lrrrrll"),
        ("⚠ " + ", ".join(isaretli)) if isaretli else "Olağan dışı değişim yok.",
    ]
    _cikti(cikti, ayar, arg, f"kpi-{arg.donem}", f"KPI raporu ({etiket}, {kovalar[-1]})", ham)


# --- huniler --------------------------------------------------------------------------------------


def _huni_coz(yanit) -> Dict:
    toplam: List[float] = []
    segmentler: Dict[str, List[float]] = defaultdict(list)
    adlar: List[str] = []
    sureler: List[Optional[float]] = []

    def ekle(hedef: List[float], adimlar) -> None:
        sayilar = [float((a or {}).get("count") or 0) for a in adimlar]
        if not hedef:
            hedef.extend(sayilar)
        else:
            for i, n in enumerate(sayilar[: len(hedef)]):
                hedef[i] += n

    for _, v in sorted(((yanit or {}).get("data") or {}).items()):
        if isinstance(v, dict) and "steps" in v:
            genel, segs = v["steps"], {}
        elif isinstance(v, dict) and "$overall" in v:
            genel, segs = v["$overall"], {k: s for k, s in v.items() if k != "$overall"}
        elif isinstance(v, list):
            genel, segs = v, {}
        else:
            continue
        if not adlar:
            adlar = [
                str(a.get("step_label") or a.get("event") or a.get("goal") or f"adım {i + 1}")
                for i, a in enumerate(genel)
            ]
            sureler = [a.get("avg_time_from_start") for a in genel]
        ekle(toplam, genel)
        for s, adimlar in segs.items():
            if isinstance(adimlar, list):
                ekle(segmentler[_seg(s)], adimlar)
    return {"toplam": toplam, "segmentler": dict(segmentler), "adlar": adlar, "sureler": sureler}


def _huni_tablosu(c: Dict, sure_etiketi: str = "ort. süre*") -> List[str]:
    satirlar = analiz.huni_satirlari(c["toplam"])
    tablo = []
    for i, (ad, s) in enumerate(zip(c["adlar"], satirlar)):
        sure = c["sureler"][i] if i < len(c["sureler"]) else None
        tablo.append(
            [
                str(i + 1),
                bicim.kisalt(ad, 30),
                _sayi(s["n"]),
                bicim.yuzde(s["adim_donusum"]),
                bicim.yuzde(s["toplam_donusum"]),
                _sayi(s["kayip"]),
                bicim.sure(sure) if i else bicim.BOS,
            ]
        )
    cikti = [
        bicim.tablo(
            ["#", "adım", "kullanıcı", "adım dön.", "toplam dön.", "kayıp", sure_etiketi], tablo, hizala="rlrrrrr"
        )
    ]
    if len(satirlar) > 1:
        en = min(
            range(1, len(satirlar)),
            key=lambda i: satirlar[i]["adim_donusum"] if satirlar[i]["adim_donusum"] is not None else 1,
        )
        cikti.append(
            f"En zayıf adım: {en}→{en + 1} {c['adlar'][en - 1]} → {c['adlar'][en]} "
            f"(dönüşüm {bicim.yuzde(satirlar[en]['adim_donusum'])}, kayıp {_sayi(satirlar[en]['kayip'])})"
        )
    return cikti


def _huni_segmentleri(c: Dict, limit: int) -> List[str]:
    if not c["segmentler"] or not c["toplam"]:
        return []
    n_top, x_top = c["toplam"][0], c["toplam"][-1]
    genel = x_top / n_top if n_top else 0
    tablo = []
    for seg, sayilar in sorted(c["segmentler"].items(), key=lambda kv: -kv[1][0])[:limit]:
        n, x = sayilar[0], sayilar[-1]
        if not n:
            continue
        z = istatistik.iki_oran_testi(int(x_top - x), int(n_top - n), int(x), int(n))["z"] if n_top > n else None
        tablo.append(
            [
                bicim.kisalt(seg, 28),
                _sayi(n),
                bicim.yuzde(x / n),
                bicim.puan(x / n - genel),
                _z(z),
                "⚠" if z is not None and z <= -3 else "",
            ]
        )
    return [
        f"Kırılım (genel toplam dönüşüm {bicim.yuzde(genel)}; z = segment vs geri kalan):",
        bicim.tablo(["segment", "başlayan", "toplam dön.", "genelden fark", "z", ""], tablo, hizala="lrrrrl"),
    ]


def _huni_kimligi(ayar: A.Ayarlar, mp: Mixpanel, ref: str) -> Tuple[int, str]:
    if str(ref).isdigit():
        ad = next((k for k, v in (ayar.get("huniler") or {}).items() if str(v) == str(ref)), f"huni {ref}")
        return int(ref), ad
    for ad, kimlik in (ayar.get("huniler") or {}).items():
        if ad.lower() == ref.lower() and kimlik:
            return int(kimlik), ad
    liste = mp.huni_listesi()
    adaylar = [h for h in liste if ref.lower() in str(h.get("name", "")).lower()]
    if len(adaylar) == 1:
        return int(adaylar[0]["funnel_id"]), adaylar[0]["name"]
    secenekler = ", ".join(f"{h.get('name')}={h.get('funnel_id')}" for h in (adaylar or liste)[:12])
    raise KomutHatasi(f"Huni '{ref}' tek anlamlı bulunamadı. Seçenekler: {secenekler}")


def k_huni(arg) -> None:
    ayar, mp = _ortam(arg)
    if arg.liste or not arg.huni:
        liste = mp.huni_listesi()
        print(bicim.tablo(["ID", "ad"], [[str(h.get("funnel_id")), h.get("name")] for h in liste[:40]], hizala="rl"))
        return
    kimlik, ad = _huni_kimligi(ayar, mp, arg.huni)
    a_ = _aralik(arg.aralik, mp.bugun)
    where = filtre_ifadesi(arg.filtre, arg.where)
    yanit = mp.huni(kimlik, a_[0], a_[1], arg.on, where, limit=max(arg.limit, 10))
    ham = A.ham_kaydet(ayar, f"huni-{kimlik}", yanit)
    c = _huni_coz(yanit)
    if not c["toplam"]:
        raise KomutHatasi("Huni yanıtı boş: aralıkta veri yok ya da huni tanımı değişmiş.")
    cikti = [
        f"HUNİ · {ad} ({kimlik}) · {analiz.aralik_metni(a_)} · tekil kullanıcı, kayıtlı dönüşüm penceresi"
        f"{_filtre_metni(where)}"
    ]
    cikti += _huni_tablosu(c)
    if arg.onceki:
        b_ = _onceki(a_)
        cb = _huni_coz(mp.huni(kimlik, b_[0], b_[1], None, where))
        if cb["toplam"]:
            sa, sb = analiz.huni_satirlari(c["toplam"]), analiz.huni_satirlari(cb["toplam"])
            tablo = []
            for i in range(1, min(len(sa), len(sb))):
                z = istatistik.iki_oran_testi(
                    int(cb["toplam"][i]), int(cb["toplam"][i - 1]), int(c["toplam"][i]), int(c["toplam"][i - 1])
                )["z"]
                tablo.append(
                    [
                        f"{i}→{i + 1}",
                        bicim.yuzde(sb[i]["adim_donusum"]),
                        bicim.yuzde(sa[i]["adim_donusum"]),
                        bicim.puan((sa[i]["adim_donusum"] or 0) - (sb[i]["adim_donusum"] or 0)),
                        _z(z),
                    ]
                )
            cikti.append(f"Önceki dönem ({analiz.aralik_metni(b_)}) ile adım dönüşümü:")
            cikti.append(bicim.tablo(["adım", "önceki", "şimdi", "fark", "z"], tablo, hizala="lrrrr"))
    cikti += _huni_segmentleri(c, arg.limit)
    if a_[1] >= mp.bugun - dt.timedelta(days=7):
        cikti.append(
            "Not: aralık son 7 günü içeriyor; dönüşüm penceresi henüz kapanmamış girişler son dönemin "
            "oranını düşük gösterebilir (önceki dönemle kıyas bu yüzden temkinli okunmalı)."
        )
    cikti.append("*ilk adımdan itibaren ortalama süre (Mixpanel)")
    _cikti(cikti, ayar, arg, f"huni-{ad}", f"Huni: {ad}", ham)


def k_huni_yerel(arg) -> None:
    ayar, mp = _ortam(arg)
    adimlar = list(arg.adimlar)
    if len(adimlar) < 2:
        raise KomutHatasi("En az iki adım verin.")
    a_ = _aralik(arg.aralik, mp.bugun, "7g")
    pencere = _pencere_sn(arg.pencere)
    pencere_gun = math.ceil(pencere / 86400)
    cek_bas, cek_bit = a_[0] - GUN, min(a_[1] + dt.timedelta(days=pencere_gun + 1), mp.bugun)
    where = filtre_ifadesi(arg.filtre, arg.where)
    sayac = [0]

    def akis():
        for olay in mp.olay_akisi(list(dict.fromkeys(adimlar)), cek_bas, cek_bit, where, arg.azami_olay):
            sayac[0] += 1
            p = olay.get("properties") or {}
            t = float(p.get("time") or 0)
            if t > 1e11:
                t /= 1000.0
            kirilim = p.get(arg.on) if arg.on and olay["event"] == adimlar[0] else None
            yield (str(p.get("distinct_id")), olay["event"], t, kirilim)

    sonuc = analiz.huni_hesapla(
        akis(), adimlar, pencere, _epoch_yerel(a_[0], ayar), _epoch_yerel(a_[1] + GUN, ayar) - 1
    )
    c = {
        "toplam": sonuc["toplam"],
        "adlar": adimlar,
        "sureler": sonuc["medyan_sure"],
        "segmentler": {_seg(k): v for k, v in sonuc["segmentler"].items()} if arg.on else {},
    }
    cikti = [
        f"HUNİ (ham olaylardan) · {' → '.join(adimlar)} · {analiz.aralik_metni(a_)} · pencere {arg.pencere} · "
        f"tekil kullanıcı · {_sayi(sayac[0])} olay indirildi{_filtre_metni(where)}"
    ]
    cikti += _huni_tablosu(c, "medyan süre*")
    cikti += _huni_segmentleri(c, arg.limit)
    acik = (a_[1] + dt.timedelta(days=pencere_gun) - (mp.bugun - GUN)).days
    if acik > 0:
        cikti.append(
            f"Not: son {min(acik, _gun(a_))} giriş gününün {arg.pencere} penceresi henüz dolmadı; "
            "bu günlerin dönüşümü olduğundan düşük görünür."
        )
    cikti.append(
        "*ilk adımdan itibaren medyan süre · kimlik birleştirme Mixpanel arayüzünden farklıysa sayılar az sapabilir"
    )
    _cikti(cikti, ayar, arg, "huni-yerel", "Huni (ham olaylardan)")


# --- tutunma ---------------------------------------------------------------------------------------


def _tutunma_noktalari(birim: str, sayi: int) -> List[int]:
    adaylar = [1, 3, 7, 14, 30] if birim == "day" else [1, 2, 4, 8, 12]
    return [i for i in adaylar if i <= sayi] or [1]


def k_tutunma(arg) -> None:
    ayar, mp = _ortam(arg)
    birim = {"gun": "day", "gün": "day", "hafta": "week", "ay": "month"}.get(arg.birim, arg.birim)
    varsayilan = {"day": "30g", "week": "56g", "month": "180g"}[birim]
    a_ = _aralik(arg.aralik, mp.bugun, varsayilan)
    where = filtre_ifadesi(arg.filtre, arg.where)
    yanit = mp.tutunma(arg.dogum, arg.donus, a_[0], a_[1], birim, arg.sayi, arg.on, where, limit=arg.limit)
    ham = A.ham_kaydet(ayar, "tutunma", yanit)
    harf = {"day": "G", "week": "H", "month": "A"}[birim]
    noktalar = _tutunma_noktalari(birim, arg.sayi)
    duz = {k: v for k, v in (yanit or {}).items() if isinstance(v, dict) and "counts" in v}
    cikti = [
        f"TUTUNMA · {arg.dogum} → {arg.donus or arg.dogum} · {analiz.aralik_metni(a_)} kohortları · "
        f"{'günlük' if birim == 'day' else 'haftalık' if birim == 'week' else 'aylık'}{_filtre_metni(where)}"
    ]
    if duz:
        ozet = analiz.tutunma_ozet(duz)
        tablo = []
        for tarih, v in sorted(duz.items())[-arg.limit :]:
            ilk = v.get("first") or 0
            sayilar = v.get("counts") or []
            tablo.append(
                [tarih, _sayi(ilk)]
                + [bicim.yuzde(sayilar[i] / ilk, 0) if ilk and i < len(sayilar) else "" for i in noktalar]
            )
        tablo.append(
            ["ağırlıklı ort.", _sayi(ozet["toplam_kullanici"])]
            + [bicim.yuzde(ozet["ortalama"][i], 1) if i < len(ozet["ortalama"]) else "" for i in noktalar]
        )
        cikti.append(bicim.tablo(["kohort", "kişi"] + [f"{harf}{i}" for i in noktalar], tablo))
        secilen = sorted(set(range(1, 8)) | set(noktalar) | {10, 21, 30})
        egri = " · ".join(
            f"{harf}{i} {bicim.yuzde(ozet['ortalama'][i])}"
            for i in secilen
            if i < len(ozet["ortalama"]) and ozet["ortalama"][i] is not None
        )
        cikti.append(f"Eğri: {egri}")
    else:
        segmentli: Dict[str, Dict[str, Dict]] = defaultdict(dict)
        for tarih, v in (yanit or {}).items():
            if isinstance(v, dict):
                for seg, kayit in v.items():
                    if isinstance(kayit, dict) and "counts" in kayit:
                        segmentli[_seg(seg)][tarih] = kayit
        if not segmentli:
            raise KomutHatasi("Tutunma yanıtı boş ya da tanınmadı; ham yanıt: " + A.goreli(ham))
        tablo = []
        for seg, kohortlar in sorted(segmentli.items(), key=lambda kv: -sum(k.get("first", 0) for k in kv[1].values()))[
            : arg.limit
        ]:
            ozet = analiz.tutunma_ozet(kohortlar)
            tablo.append(
                [bicim.kisalt(seg, 26), _sayi(ozet["toplam_kullanici"])]
                + [
                    bicim.yuzde(ozet["ortalama"][i])
                    if i < len(ozet["ortalama"]) and ozet["ortalama"][i] is not None
                    else ""
                    for i in noktalar
                ]
            )
        cikti.append(bicim.tablo([arg.on, "kişi"] + [f"{harf}{i}" for i in noktalar], tablo))
    cikti.append(
        f"Son kohortlar henüz tamamlanmamış aralıkları içermez "
        f"({harf}0 = ilk {'24 saat' if birim == 'day' else 'dönem'})."
    )
    _cikti(cikti, ayar, arg, f"tutunma-{arg.dogum}", f"Tutunma: {arg.dogum}", ham)


# --- kayıtlı rapor ---------------------------------------------------------------------------------


def _yapraklar(dugum, yol=()) -> List[Tuple[Tuple[str, ...], Dict[str, float]]]:
    if not isinstance(dugum, dict):
        return []
    sayisal = {k: v for k, v in dugum.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
    sonuc = [(yol, sayisal)] if sayisal else []
    for k, v in dugum.items():
        if isinstance(v, dict):
            sonuc += _yapraklar(v, yol + (str(k),))
    return sonuc


def k_kayitli(arg) -> None:
    ayar, mp = _ortam(arg)
    yanit = mp.kayitli_rapor(arg.rapor_id)
    ham = A.ham_kaydet(ayar, f"kayitli-{arg.rapor_id}", yanit)
    aralik = (yanit or {}).get("date_range") or {}
    basliklar = (yanit or {}).get("headers") or []
    seri = (yanit or {}).get("series") or {}
    cikti = [
        f"KAYITLI RAPOR {arg.rapor_id} · {str(aralik.get('from_date', '?'))[:10]} → "
        f"{str(aralik.get('to_date', '?'))[:10]} · başlıklar: {' / '.join(basliklar) or '-'}"
    ]
    for ad, govde in seri.items():
        if (
            isinstance(govde, dict)
            and "count" in govde
            and ("overall_conv_ratio" in govde or "step_conv_ratio" in govde)
        ):
            adimlar = sorted(
                govde["count"].keys(),
                key=lambda s: int(re.match(r"\s*(\d+)", s).group(1)) if re.match(r"\s*(\d+)", s) else 0,
            )
            c = {
                "toplam": [
                    float(next(iter((govde["count"][a] or {"all": 0}).values())) or 0)
                    if isinstance(govde["count"][a], dict)
                    else float(govde["count"][a] or 0)
                    for a in adimlar
                ],
                "adlar": [re.sub(r"^\s*\d+\.\s*", "", a) for a in adimlar],
                "sureler": [
                    ((govde.get("avg_time_from_start") or {}).get(a) or {}).get("all")
                    if isinstance((govde.get("avg_time_from_start") or {}).get(a), dict)
                    else None
                    for a in adimlar
                ],
                "segmentler": {},
            }
            cikti.append(f"Huni: {ad}")
            cikti += _huni_tablosu(c)
            continue
        if isinstance(govde, dict) and any(isinstance(v, dict) and "counts" in v for v in govde.values()):
            kohortlar = {
                k: v for k, v in govde.items() if isinstance(v, dict) and "counts" in v and not k.startswith("$")
            }
            ozet = analiz.tutunma_ozet(kohortlar)
            egri = " · ".join(f"{i}: {bicim.yuzde(o)}" for i, o in enumerate(ozet["ortalama"]) if o is not None)
            cikti.append(f"Tutunma: {ad} · {_sayi(ozet['toplam_kullanici'])} kişi · {egri}")
            continue
    tablo = []
    for yol, degerler in _yapraklar({k: v for k, v in seri.items()}):
        if not yol or any(
            a
            in ("count", "step_conv_ratio", "overall_conv_ratio", "avg_time", "avg_time_from_start", "counts", "rates")
            for a in yol
        ):
            continue
        etiket = " · ".join("(genel)" if p == "$overall" else p for p in yol)
        if "all" in degerler and len(degerler) == 1:
            tablo.append(
                (
                    degerler["all"],
                    [
                        bicim.kisalt(etiket, 50),
                        _sayi(degerler["all"], 2 if degerler["all"] % 1 else 0),
                        bicim.BOS,
                        bicim.BOS,
                        "",
                    ],
                )
            )
            continue
        zaman = sorted(k for k in degerler if re.match(r"\d{4}-\d{2}-\d{2}", k))
        if not zaman:
            continue
        vals = [degerler[k] for k in zaman]
        tablo.append(
            (
                sum(vals),
                [
                    bicim.kisalt(etiket, 50),
                    _sayi(sum(vals)),
                    _sayi(vals[-1]),
                    bicim.degisim(vals[-1], vals[-2]) if len(vals) > 1 else bicim.BOS,
                    bicim.kivilcim(vals[-30:]),
                ],
            )
        )
    if tablo and all(t[1][2] == bicim.BOS and t[1][4] == "" for t in tablo):
        genel = max((t[0] for t in tablo if "(genel)" in t[1][0]), default=None) or sum(t[0] for t in tablo)
        tablo.sort(key=lambda t: -t[0])
        cikti.append(
            bicim.tablo(
                ["seri", "değer", "pay"],
                [[t[1][0], t[1][1], bicim.yuzde(t[0] / genel if genel else None)] for t in tablo[: arg.limit]],
                hizala="lrr",
            )
        )
    elif tablo:
        tablo.sort(key=lambda t: -t[0])
        cikti.append(
            bicim.tablo(
                ["seri", "toplam", "son", "son Δ%", "eğilim"], [t[1] for t in tablo[: arg.limit]], hizala="lrrrl"
            )
        )
        if len(tablo) > arg.limit:
            cikti.append(f"(+{len(tablo) - arg.limit} seri daha; --limit ile artırın)")
    _cikti(cikti, ayar, arg, f"kayitli-{arg.rapor_id}", f"Kayıtlı rapor {arg.rapor_id}", ham)


# --- deney -----------------------------------------------------------------------------------------

_KONTROL = re.compile(r"kontrol|control|original|baseline|varsay|^a$", re.I)


def k_deney(arg) -> None:
    ayar, mp = _ortam(arg)
    d = ayar.get("deney") or {}
    maruz = arg.maruz or d.get("maruz_olay") or "$experiment_started"
    deney_oz = arg.deney_ozelligi or d.get("deney_ozelligi") or "Experiment name"
    grup = arg.grup or d.get("grup_ozelligi") or "Variant name"
    a_ = _aralik(arg.aralik, mp.bugun)
    pencere = _pencere_sn(arg.pencere)
    gruplar: Dict[str, List[int]] = {}
    ilk_maruz: Optional[dt.date] = None
    if arg.huni_id:
        c = _huni_coz(mp.huni(int(arg.huni_id), a_[0], a_[1], grup, None, limit=20))
        for seg, sayilar in c["segmentler"].items():
            gruplar[seg] = [int(sayilar[0]), int(sayilar[-1])]
        kaynak = f"kayıtlı huni {arg.huni_id} (1. adım maruziyet olmalı)"
    else:
        where = f"properties[{json.dumps(deney_oz, ensure_ascii=False)}] == {json.dumps(arg.deney, ensure_ascii=False)}"
        g_bas, g_bit = _epoch_yerel(a_[0], ayar), _epoch_yerel(a_[1] + GUN, ayar)
        kullanici: Dict[str, Tuple[float, str]] = {}
        for olay in mp.olay_akisi([maruz], a_[0] - GUN, a_[1] + GUN, where):
            p = olay.get("properties") or {}
            t = float(p.get("time") or 0)
            t = t / 1000.0 if t > 1e11 else t
            if not g_bas <= t < g_bit:
                continue
            uid = str(p.get("distinct_id"))
            if uid not in kullanici or t < kullanici[uid][0]:
                kullanici[uid] = (t, _seg(p.get(grup)))
        if not kullanici:
            raise KomutHatasi(
                f"'{arg.deney}' için maruziyet bulunamadı ({maruz}, {deney_oz}). Adı ve aralığı kontrol edin."
            )
        ilk_maruz = dt.date(1970, 1, 1) + dt.timedelta(
            seconds=min(t for t, _ in kullanici.values()) + ayar.ofset * 3600
        )
        son_gun = min(a_[1] + dt.timedelta(days=math.ceil(pencere / 86400)), mp.bugun - GUN)
        donusenler = set()
        for olay in mp.olay_akisi([arg.donusum], a_[0] - GUN, son_gun + GUN):
            p = olay.get("properties") or {}
            uid = str(p.get("distinct_id"))
            if uid not in kullanici or uid in donusenler:
                continue
            t = float(p.get("time") or 0)
            t = t / 1000.0 if t > 1e11 else t
            if kullanici[uid][0] <= t <= kullanici[uid][0] + pencere:
                donusenler.add(uid)
        for uid, (_, varyant) in kullanici.items():
            kayit = gruplar.setdefault(varyant, [0, 0])
            kayit[0] += 1
            kayit[1] += uid in donusenler
        kaynak = f"ham olaylar; maruz `{maruz}` ({deney_oz} = {arg.deney}); dönüşüm penceresi {arg.pencere}"
    if len(gruplar) < 2:
        raise KomutHatasi(f"En az iki varyant gerekiyor; bulunan: {', '.join(gruplar) or 'yok'}")
    kontrol = arg.kontrol or next((g for g in sorted(gruplar) if _KONTROL.search(g)), sorted(gruplar)[0])
    if kontrol not in gruplar:
        raise KomutHatasi(f"Kontrol varyantı '{kontrol}' yok; varyantlar: {', '.join(gruplar)}")
    n_k, x_k = gruplar[kontrol]
    etiket = kontrol if "kontrol" in kontrol.lower() or "control" in kontrol.lower() else f"{kontrol} (kontrol)"
    tablo = [[etiket, _sayi(n_k), _sayi(x_k), bicim.yuzde(x_k / n_k if n_k else None, 2), "", "", "", ""]]
    karar_satirlari = []
    for varyant in sorted(g for g in gruplar if g != kontrol):
        n, x = gruplar[varyant]
        t = istatistik.iki_oran_testi(x_k, n_k, x, n)
        tablo.append(
            [
                varyant,
                _sayi(n),
                _sayi(x),
                bicim.yuzde(t["p_b"], 2),
                bicim.puan(t["fark"], 2),
                bicim.yuzde(t["goreli"], 1, isaret=True),
                f"{bicim.puan(t['ga_alt'], 2)} … {bicim.puan(t['ga_ust'], 2)}",
                bicim.sayi(t["p_degeri"], 4) if t["p_degeri"] is not None else bicim.BOS,
            ]
        )
        anlamli = t["p_degeri"] is not None and t["p_degeri"] < 0.05 and (t["ga_alt"] > 0 or t["ga_ust"] < 0)
        if anlamli:
            yon = "ARTIŞ" if t["fark"] > 0 else "DÜŞÜŞ"
            karar_satirlari.append(
                f"{varyant}: ANLAMLI {yon} — göreli {bicim.yuzde(t['goreli'], 1, isaret=True)}, "
                f"fark {bicim.puan(t['fark'], 2)} (%95 GA {bicim.puan(t['ga_alt'], 2)} … "
                f"{bicim.puan(t['ga_ust'], 2)})."
            )
        else:
            m = istatistik.mde(min(n, n_k), x_k / n_k if n_k else 0)
            karar_satirlari.append(
                f"{varyant}: HENÜZ BELİRSİZ — p={bicim.sayi(t['p_degeri'] or 1, 3)}; bu örneklemle "
                f"ancak ±{bicim.puan(m, 2).lstrip('+')} fark saptanabilir."
            )
    srm = istatistik.srm_testi([gruplar[g][0] for g in sorted(gruplar)])
    sure_gun = (a_[1] - (ilk_maruz or a_[0])).days + 1
    cikti = [
        f"DENEY · {arg.deney} · dönüşüm `{arg.donusum}` · {analiz.aralik_metni(a_)} · {kaynak}",
        bicim.tablo(
            ["varyant", "kullanıcı", "dönüşen", "oran", "fark", "göreli", "%95 GA (fark)", "p"],
            tablo,
            hizala="lrrrrrrr",
        ),
    ]
    if srm["p_degeri"] < 0.001:
        cikti.append(
            f"⚠ SRM: χ²={bicim.sayi(srm['ki_kare'], 1)}, p<0,001 — varyant dağılımı beklenenden sapıyor. "
            "SONUÇ GÜVENİLMEZ; atama/izleme kontrol edilmeli."
        )
    else:
        cikti.append(f"SRM: p={bicim.sayi(srm['p_degeri'], 3)} — dağılım eşit bölünmeyle uyumlu.")
        cikti += karar_satirlari
    acik = (a_[1] + dt.timedelta(days=math.ceil(pencere / 86400)) - (mp.bugun - GUN)).days
    if not arg.huni_id and acik > 0:
        cikti.append(
            f"Not: son {min(acik, sure_gun)} günün maruziyetlerinde {arg.pencere} pencere dolmadı; mutlak "
            "oranlar düşük görünür, varyantlar eşit etkilendiği için kıyas geçerlidir."
        )
    if sure_gun < 7:
        cikti.append(
            f"Not: test {sure_gun} gündür açık; 7 günden kısa sürede yenilik ve haftanın günü etkisi olabilir."
        )
    _cikti(cikti, ayar, arg, f"deney-{arg.deney}", f"Deney: {arg.deney}")


# --- argümanlar ------------------------------------------------------------------------------------


def _ortak(p: argparse.ArgumentParser, filtre: bool = True, aralik: bool = True, limit: int = 10) -> None:
    if aralik:
        p.add_argument("--aralik", help="28g (son 28 tam gün) ya da 2026-10-01:2026-10-31")
    if filtre:
        p.add_argument("--filtre", action="append", default=[], help="'$os=Android', 'plan!=free', 'url~odeme'")
        p.add_argument("--where", help="ham Mixpanel ifadesi")
    p.add_argument("--limit", type=int, default=limit, help=f"satır sınırı (varsayılan {limit})")
    p.add_argument("--rapor", action="store_true", help="yerel/raporlar/ altına Markdown rapor yaz")
    p.add_argument("--taze", action="store_true", help="önbelleği atla")


def ayristirici() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="mp.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    alt = ap.add_subparsers(dest="komut", required=True)

    p = alt.add_parser("kontrol", help="kimlik ve bağlantı denetimi")
    p.set_defaults(func=k_kontrol)

    p = alt.add_parser("sozluk", help="yerel olay sözlüğünü kur")
    p.add_argument("--ice-aktar", help="MCP/CSV ile hazırlanmış dosyadan (CSV/JSON)")
    p.add_argument("--ozellik-olay", type=int, default=20, help="özellikleri alınacak en sık olay sayısı")
    p.add_argument("--taze", action="store_true")
    p.set_defaults(func=k_sozluk)

    p = alt.add_parser("ara", help="sözlükte olay/özellik ara")
    p.add_argument("terim")
    p.add_argument("--olay", action="store_true", help="terimi tam olay adı say, tüm özelliklerini göster")
    p.add_argument("--limit", type=int, default=12)
    p.set_defaults(func=k_ara)

    p = alt.add_parser("degerler", help="bir özelliğin en sık değerleri")
    p.add_argument("olay")
    p.add_argument("ozellik")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--taze", action="store_true")
    p.set_defaults(func=k_degerler)

    p = alt.add_parser("seri", help="olay(lar)ın dönem toplamı, kıyas ve eğilim")
    p.add_argument("olaylar", nargs="+")
    p.add_argument("--tip", choices=["general", "unique"], default="general")
    p.add_argument("--tablo", action="store_true", help="gün gün tablo da bas")
    _ortak(p, limit=14)
    p.set_defaults(func=k_seri)

    p = alt.add_parser("kirilim", help="bir olayın özelliğe göre kırılımı")
    p.add_argument("olay")
    p.add_argument("--on", required=True, help="özellik adı, ör. $os")
    p.add_argument("--tip", choices=["general", "unique"], default="general")
    _ortak(p)
    p.set_defaults(func=k_kirilim)

    p = alt.add_parser("neden", help="değişimin hangi segmentte yoğunlaştığı")
    p.add_argument("olay", nargs="?")
    p.add_argument("--pay")
    p.add_argument("--payda")
    p.add_argument("--donem", default="gun", help="gun | hafta | 28g")
    p.add_argument("--a", help="özel A aralığı BAS:BIT")
    p.add_argument("--b", help="özel B aralığı BAS:BIT")
    p.add_argument("--boyutlar", help="virgülle: $os,mp_country_code")
    p.add_argument("--tip", choices=["general", "unique"])
    p.add_argument("--csv", help="MCP/CSV köprüsü: boyut,segment,a,b (ya da pay_a,payda_a,pay_b,payda_b)")
    _ortak(p, aralik=False, limit=8)
    p.set_defaults(func=k_neden)

    p = alt.add_parser("kpi", help="ayarlar.json KPI'ları için dönem raporu")
    p.add_argument("--donem", choices=["gun", "hafta", "ay"], default="hafta")
    p.add_argument("--adet", type=int, default=8, help="eğilim için dönem sayısı")
    _ortak(p, filtre=False, aralik=False)
    p.set_defaults(func=k_kpi)

    p = alt.add_parser("huni", help="kayıtlı huni (ad ya da ID)")
    p.add_argument("huni", nargs="?")
    p.add_argument("--liste", action="store_true")
    p.add_argument("--on", help="kırılım özelliği")
    p.add_argument("--onceki", action="store_true", help="önceki eşit dönemle kıyasla")
    _ortak(p, limit=8)
    p.set_defaults(func=k_huni)

    p = alt.add_parser("huni-yerel", help="ham olaylardan geçici huni")
    p.add_argument("adimlar", nargs="+")
    p.add_argument("--pencere", default="1g", help="1g, 6s, 30dk")
    p.add_argument("--on", help="1. adım olayının özelliğiyle kırılım")
    p.add_argument("--azami-olay", type=int, default=2_000_000)
    _ortak(p, limit=8)
    p.set_defaults(func=k_huni_yerel)

    p = alt.add_parser("tutunma", help="kohort tutunması")
    p.add_argument("dogum")
    p.add_argument("donus", nargs="?")
    p.add_argument("--birim", default="day", help="day | week | month (gun/hafta/ay)")
    p.add_argument("--sayi", type=int, default=14, help="aralık sayısı")
    p.add_argument("--on", help="kırılım özelliği")
    _ortak(p, limit=8)
    p.set_defaults(func=k_tutunma)

    p = alt.add_parser("kayitli", help="kayıtlı Insights raporu (URL'deki ID)")
    p.add_argument("rapor_id", type=int)
    p.add_argument("--limit", type=int, default=12)
    p.add_argument("--rapor", action="store_true")
    p.add_argument("--taze", action="store_true")
    p.set_defaults(func=k_kayitli)

    p = alt.add_parser("deney", help="A/B testi sonucu")
    p.add_argument("deney", help="deney adı (Experiment name değeri)")
    p.add_argument("--donusum", required=True, help="dönüşüm olayı")
    p.add_argument("--maruz")
    p.add_argument("--deney-ozelligi")
    p.add_argument("--grup")
    p.add_argument("--kontrol")
    p.add_argument("--pencere", default="14g", help="maruziyetten sonra dönüşüm penceresi")
    p.add_argument("--huni-id", help="maruz→dönüşüm kayıtlı hunisi (varyanta göre kırılır)")
    p.add_argument("--aralik")
    p.add_argument("--rapor", action="store_true")
    p.add_argument("--taze", action="store_true")
    p.set_defaults(func=k_deney)
    return ap


def main(argv=None) -> int:
    utf8_cikti()
    arg = ayristirici().parse_args(argv)
    try:
        arg.func(arg)
    except (ApiHatasi, A.AyarHatasi, KomutHatasi, ValueError) as hata:
        print(f"HATA: {hata}")
        return 2
    except KeyboardInterrupt:
        print("İptal edildi.")
        return 130
    except BrokenPipeError:
        return boru_kapandi()
    return 0


if __name__ == "__main__":
    sys.exit(main())
