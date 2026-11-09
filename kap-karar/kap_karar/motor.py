"""Karar motoru: bir olayın parametrelerini ağaçta yürütür, yolu ve sonucu döndürür."""

from __future__ import annotations

from typing import Any

from .agaclar import AGACLAR, agac
from .sema import Adim, Karar


def _kosul_tutar(op: str, deger: Any, hedef: Any) -> bool:
    if deger is None:
        return False
    try:
        if op == "==":
            return deger == hedef
        if op == "!=":
            return deger != hedef
        if op == "in":
            return deger in hedef
        if op == ">=":
            return float(deger) >= float(hedef)
        if op == ">":
            return float(deger) > float(hedef)
        if op == "<=":
            return float(deger) <= float(hedef)
        if op == "<":
            return float(deger) < float(hedef)
    except (TypeError, ValueError):
        return False
    raise ValueError(f"Bilinmeyen işleç: {op}")


def turet(tur: str, parametreler: dict[str, Any]) -> dict[str, Any]:
    """Ağacın 'turetilmis' tanımındaki alanları (a - b gibi) hesaplar."""
    p = dict(parametreler)
    for ad, (a, op, b) in agac(tur).get("turetilmis", {}).items():
        if p.get(ad) is not None:
            continue
        x, y = p.get(a), p.get(b)
        if x is None or y is None:
            continue
        try:
            p[ad] = float(x) - float(y) if op == "-" else float(x) + float(y)
        except (TypeError, ValueError):
            pass
    return p


def karar_ver(tur: str, parametreler: dict[str, Any] | None = None, guven: float = 0.7) -> Karar:
    a = agac(tur)
    p = turet(tur, parametreler or {})
    dugumler = a["dugumler"]
    konum = a["kok"]
    yol: list[Adim] = []
    eksik: list[str] = []
    ziyaret = 0
    while "sonuc" not in dugumler[konum]:
        ziyaret += 1
        if ziyaret > 50:
            raise RuntimeError(f"{tur}: ağaçta döngü ({konum})")
        d = dugumler[konum]
        deger = p.get(d["anahtar"])
        secilen = None
        for dal in d["dallar"]:
            if dal["kosul"] is None or _kosul_tutar(dal["kosul"][0], deger, dal["kosul"][1]):
                secilen = dal
                break
        if secilen is None:
            if deger is None:
                eksik.append(d["anahtar"])
                etiket = "bilinmiyor → varsayılan dal"
            else:
                etiket = "koşul tutmadı → varsayılan dal"
            sonraki = d["varsayilan"]
        else:
            etiket = secilen["etiket"]
            sonraki = secilen["sonraki"]
        yol.append(Adim(dugum=konum, soru=d["soru"], deger=deger, secilen=etiket))
        konum = sonraki
    y = dugumler[konum]
    # eksik parametre başına güven %15 düşer
    g = max(0.1, guven * (0.85 ** len(eksik)))
    return Karar(
        tur=tur, agac_adi=a["ad"], yol=yol, sonuc_kodu=konum, sonuc=y["sonuc"],
        egilim="belirsiz" if len(eksik) >= 2 and y["egilim"] != "notr" else y["egilim"],
        eylem=y["eylem"], gerekce=y["gerekce"], izlenecek=list(y.get("izlenecek", [])),
        etkilenen=list(y.get("etkilenen", [])), eksik=eksik, guven=round(g, 2),
    )


def _cocuklar(dugumler: dict[str, Any], kok: str) -> list[str]:
    gor: list[str] = []
    yigin = [kok]
    while yigin:
        k = yigin.pop()
        if k in gor:
            continue
        gor.append(k)
        d = dugumler[k]
        if "sonuc" in d:
            continue
        for dal in d["dallar"]:
            yigin.append(dal["sonraki"])
        yigin.append(d["varsayilan"])
    return gor


def agac_metni(tur: str, vurgu_yolu: list[str] | None = None) -> str:
    """Ağacı metin olarak çizer. vurgu_yolu verilirse o düğümler ► ile işaretlenir."""
    a = agac(tur)
    d = a["dugumler"]
    vurgu = set(vurgu_yolu or [])
    satirlar = [f"{a['ad']}  [{tur}]"]
    if a.get("kap_turu"):
        satirlar.append(f"KAP türü: {a['kap_turu']}")
    satirlar.append("")

    def ciz(k: str, girinti: str, son: bool, etiket: str | None, derinlik: int) -> None:
        isaret = "►" if k in vurgu else " "
        dal = "└─" if son else "├─"
        baslik = f"{etiket}  →  " if etiket else ""
        n = d[k]
        if "sonuc" in n:
            satirlar.append(f"{girinti}{dal}{isaret}{baslik}[{n['egilim'].upper()}] {n['sonuc']}")
            satirlar.append(f"{girinti}{'   ' if son else '│  '}     eylem: {n['eylem']}")
            return
        satirlar.append(f"{girinti}{dal}{isaret}{baslik}? {n['soru']}  ({n['anahtar']})")
        yeni = girinti + ("   " if son else "│  ")
        dallar = n["dallar"]
        if derinlik > 12:
            satirlar.append(f"{yeni}└─ …")
            return
        for i, b in enumerate(dallar):
            ciz(b["sonraki"], yeni, i == len(dallar) - 1, b["etiket"], derinlik + 1)

    kok = a["kok"]
    n = d[kok]
    satirlar.append(f"{'►' if kok in vurgu else ' '}? {n['soru']}  ({n['anahtar']})")
    for i, b in enumerate(n["dallar"]):
        ciz(b["sonraki"], "", i == len(n["dallar"]) - 1, b["etiket"], 1)
    satirlar.append("")
    satirlar.append("Parametreler: " + "; ".join(f"{k} = {v}" for k, v in a["parametreler"].items()))
    return "\n".join(satirlar)


def karar_metni(k: Karar) -> str:
    s = [f"Ağaç: {k.agac_adi} [{k.tur}]", "Yol:"]
    for i, adim in enumerate(k.yol, 1):
        deger = "bilinmiyor" if adim.deger is None else adim.deger
        s.append(f"  {i}. {adim.soru}  → {deger}  ⇒ {adim.secilen}")
    s.append(f"Sonuç [{k.egilim.upper()}]: {k.sonuc}")
    s.append(f"Gerekçe: {k.gerekce}")
    s.append(f"Ne yapılır: {k.eylem}")
    if k.etkilenen:
        s.append("Etkilenen sektörler: " + ", ".join(k.etkilenen))
    if k.izlenecek:
        s.append("İzlenecek: " + ", ".join(k.izlenecek))
    if k.eksik:
        s.append("Eksik parametreler (verilirse karar netleşir): " + ", ".join(k.eksik))
    s.append(f"Güven: {k.guven}")
    return "\n".join(s)


def tum_agaclari_dogrula() -> list[str]:
    """Her ağaçta: kök var, tüm 'sonraki' hedefleri tanımlı, her yaprak erişilebilir."""
    hatalar: list[str] = []
    for tur, a in AGACLAR.items():
        d = a["dugumler"]
        if a["kok"] not in d:
            hatalar.append(f"{tur}: kök {a['kok']} yok")
            continue
        for k, n in d.items():
            if "sonuc" in n:
                continue
            hedefler = [b["sonraki"] for b in n["dallar"]] + [n["varsayilan"]]
            for h in hedefler:
                if h not in d:
                    hatalar.append(f"{tur}.{k}: hedef {h} yok")
            if n["anahtar"] not in a["parametreler"] and n["anahtar"] not in a.get("turetilmis", {}):
                hatalar.append(f"{tur}.{k}: parametre {n['anahtar']} tanımsız")
        erisilen = set(_cocuklar(d, a["kok"]))
        for k in d:
            if k not in erisilen:
                hatalar.append(f"{tur}.{k}: erişilemeyen düğüm")
    return hatalar
