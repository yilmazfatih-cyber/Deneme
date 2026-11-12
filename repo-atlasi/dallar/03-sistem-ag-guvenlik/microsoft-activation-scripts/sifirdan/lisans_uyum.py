#!/usr/bin/env python3
"""lisans_uyum.py — yazılım varlık yönetimi (SAM) için lisans uyum karşılaştırması.

Soru: "Kurulu yazılımlarımız, satın aldığımız lisans haklarıyla örtüşüyor mu?"
Girdiler (UTF-8 CSV; Excel'in BOM'lu çıktısı da okunur):
  envanter.csv : cihaz, kullanici, yazilim, surum, yayinci, kurulum_tarihi
  haklar.csv   : yazilim, yayinci, olcut, adet, bitis, sozlesme_no
                 olcut: cihaz | kullanici | site   (bitis boşsa süresiz)
  eslesme.json : {"esanlamlilar": {...}, "ucretsiz": [...]}  ad normalleme kuralları
Çıktı: Markdown (ya da --json) rapor; eksik lisans varsa çıkış kodu 1.

Kavramlar ISO/IEC 19770-1'deki SAM süreçlerinin en küçük hâlidir:
envanter (ne kurulu) + hak kaydı (ne satın alındı) + uzlaştırma (fark).
"""

import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date

_SURUM = re.compile(r"\s+v?\d+(?:\.\d+)+$")  # "VLC media player 3.0.20" → "vlc media player"
YAKIN_GUN = 60


def normalle(ad, esanlamlilar):
    """Küçük harf, tek boşluk, sondaki sürüm numarası atılır; sonra eş anlamlı eşlemesi."""
    sade = _SURUM.sub("", " ".join(ad.strip().lower().split()))
    return esanlamlilar.get(sade, sade)


@dataclass
class Satir:
    yazilim: str
    olcut: str
    kullanim: int
    hak: int
    durum: str  # uyumlu | eksik | atil | kayitsiz | suresi_dolmus
    fark: int
    notlar: list = field(default_factory=list)
    cihazlar: list = field(default_factory=list)


def csv_oku(yol):
    with open(yol, encoding="utf-8-sig", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


def uzlastir(envanter, haklar, eslesme, bugun):
    es = {k.lower(): v.lower() for k, v in eslesme.get("esanlamlilar", {}).items()}
    ucretsiz = {normalle(a, es) for a in eslesme.get("ucretsiz", [])}

    kurulumlar = defaultdict(list)
    for r in envanter:
        ad = normalle(r["yazilim"], es)
        if ad not in ucretsiz:
            kurulumlar[ad].append(r)

    gecerli, notlar, olcutler = defaultdict(int), defaultdict(list), defaultdict(set)
    for h in haklar:
        ad = normalle(h["yazilim"], es)
        olcutler[ad].add(h["olcut"])
        bitis = date.fromisoformat(h["bitis"]) if h["bitis"] else None
        if bitis and bitis < bugun:
            notlar[ad].append(f"{h['sozlesme_no']}: {h['adet']} adetlik hakkın süresi {bitis} tarihinde doldu")
            continue
        if bitis and (bitis - bugun).days <= YAKIN_GUN:
            notlar[ad].append(f"{h['sozlesme_no']}: {(bitis - bugun).days} gün sonra bitiyor ({bitis})")
        gecerli[ad] += int(h["adet"])

    # Raporda görünen ad: önce sözleşmedeki yazım, yoksa envanterdeki (sürümsüz) yazım.
    gorunen = {}
    for h in haklar:
        gorunen.setdefault(normalle(h["yazilim"], es), h["yazilim"].strip())
    for ad, kayitlar in kurulumlar.items():
        gorunen.setdefault(ad, _SURUM.sub("", kayitlar[0]["yazilim"].strip()))

    satirlar = []
    for ad in sorted(set(kurulumlar) | set(olcutler)):
        if len(olcutler[ad]) > 1:
            notlar[ad].append("karışık ölçüt: " + ", ".join(sorted(olcutler[ad])) + " — sözleşmeyi inceleyin")
        olcut = min(olcutler[ad]) if olcutler[ad] else "cihaz"
        kayitlar = kurulumlar.get(ad, [])
        # Cihaz başına lisans → farklı cihaz sayısı; kullanıcı başına → farklı kullanıcı sayısı.
        anahtar = "kullanici" if olcut == "kullanici" else "cihaz"
        kullanim = len({r[anahtar].lower() for r in kayitlar})
        hak = gecerli.get(ad, 0)
        cihazlar = sorted({r["cihaz"] for r in kayitlar})
        if not olcutler[ad]:
            durum, fark = "kayitsiz", kullanim
        elif olcut == "site":
            durum, fark = ("uyumlu" if hak else "suresi_dolmus"), 0
        elif hak == 0 and kullanim:
            durum, fark = "suresi_dolmus", kullanim
        elif kullanim > hak:
            durum, fark = "eksik", kullanim - hak
        elif hak > kullanim:
            durum, fark = "atil", hak - kullanim
        else:
            durum, fark = "uyumlu", 0
        satirlar.append(Satir(gorunen[ad], olcut, kullanim, hak, durum, fark, notlar[ad], cihazlar))
    return satirlar


ACIKLAMA = {"eksik": "EKSİK LİSANS", "kayitsiz": "HAK KAYDI YOK", "suresi_dolmus": "SÜRESİ DOLMUŞ",
            "atil": "atıl hak", "uyumlu": "uyumlu"}


def markdown(satirlar):
    t = ["| Yazılım | Ölçüt | Kullanım | Geçerli hak | Durum | Fark |", "| --- | --- | ---: | ---: | --- | ---: |"]
    t += [f"| {s.yazilim} | {s.olcut} | {s.kullanim} | {s.hak} | {ACIKLAMA[s.durum]} | {s.fark} |" for s in satirlar]
    for s in satirlar:
        for n in s.notlar:
            t.append(f"- **{s.yazilim}:** {n}")
        if s.durum in ("eksik", "kayitsiz", "suresi_dolmus"):
            t.append(f"- **{s.yazilim}:** kurulu cihazlar: {', '.join(s.cihazlar)}")
    return "\n".join(t)


def riskli(satirlar):
    return any(s.durum in ("eksik", "kayitsiz", "suresi_dolmus") for s in satirlar)


def main(argv=None):
    p = argparse.ArgumentParser(description="Envanter ile lisans haklarını uzlaştırır")
    p.add_argument("envanter")
    p.add_argument("haklar")
    p.add_argument("--eslesme")
    p.add_argument("--bugun", type=date.fromisoformat, default=date.today())
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    eslesme = {}
    if a.eslesme:
        with open(a.eslesme, encoding="utf-8") as f:
            eslesme = json.load(f)
    satirlar = uzlastir(csv_oku(a.envanter), csv_oku(a.haklar), eslesme, a.bugun)
    print(json.dumps([asdict(s) for s in satirlar], ensure_ascii=False, indent=2) if a.json else markdown(satirlar))
    return 1 if riskli(satirlar) else 0


if __name__ == "__main__":
    sys.exit(main())
