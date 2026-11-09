"""Wikimedia Commons'tan aday dosyaları (kategori ağacı + metin aramaları) ve üst verilerini toplar.

Hız sınırına (429, maxlag) saygılı: her istek arası bekleme, Retry-After'a uyma, artımlı kayıt.
Kullanım:
  python scripts/commons_topla.py --cikti veri/ham/commons/meta.json \
      --kategori "Documents of the Ottoman Empire" --derinlik 2 --arama "Osmanlıca mektup"
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

UA = "OsmanlicaHTR/0.1 (acik kaynak arastirma; github.com/yilmazfatih-cyber/Deneme)"
ATLA = re.compile(r" by (century|decade|year|country|city|type|collection|language)$")


def api(params: dict, bekle: float = 1.2, deneme: int = 8) -> dict:
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json", "maxlag": 5})
    for i in range(deneme):
        time.sleep(bekle)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                j = json.loads(r.read())
                ra = r.headers.get("Retry-After")
            if "error" in j:
                time.sleep(float(ra or 5))
                continue
            return j
        except urllib.error.HTTPError as e:
            time.sleep(float(e.headers.get("Retry-After") or 0) or 5 * (i + 1))
        except Exception:  # noqa: BLE001
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"API başarısız: {params}")


def kategori_tara(kok: str, derinlik: int, dosyalar: dict, gorulen: set, gunluk=print):
    if kok in gorulen or ATLA.search(kok):
        return
    gorulen.add(kok)
    devam: dict = {}
    while True:
        j = api({"action": "query", "list": "categorymembers", "cmtitle": kok, "cmlimit": 500, **devam})
        uyeler = j.get("query", {}).get("categorymembers", [])
        for m in uyeler:
            if m["ns"] == 6:
                dosyalar.setdefault(m["title"], set()).add(kok[9:])
            elif m["ns"] == 14 and derinlik > 0:
                kategori_tara(m["title"], derinlik - 1, dosyalar, gorulen, gunluk)
        gunluk(f"  {kok[9:]}: {sum(1 for u in uyeler if u['ns'] == 6)} dosya")
        if "continue" in j:
            devam = {"cmcontinue": j["continue"]["cmcontinue"]}
        else:
            break


def ustveri(basliklar: list[str], gunluk=print) -> dict:
    meta = {}
    for i in range(0, len(basliklar), 50):
        j = api({"action": "query", "prop": "imageinfo|categories", "titles": "|".join(basliklar[i : i + 50]), "iiprop": "url|mime|size|extmetadata", "iiurlwidth": 2000, "cllimit": 500})
        for p in j.get("query", {}).get("pages", {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            em = ii.get("extmetadata", {})
            meta[p["title"]] = {
                "mime": ii.get("mime"), "w": ii.get("width"), "h": ii.get("height"), "boyut": ii.get("size"), "url": ii.get("url"), "thumb": ii.get("thumburl"),
                "lisans": (em.get("LicenseShortName") or {}).get("value", ""),
                "aciklama": re.sub(r"<[^>]+>", "", (em.get("ImageDescription") or {}).get("value", ""))[:400],
                "tarih": (em.get("DateTimeOriginal") or {}).get("value", "")[:60],
                "kategoriler": [c["title"][9:] for c in p.get("categories", [])],
            }
        gunluk(f"  üst veri {min(i + 50, len(basliklar))}/{len(basliklar)}")
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cikti", required=True)
    ap.add_argument("--kategori", action="append", default=[])
    ap.add_argument("--arama", action="append", default=[])
    ap.add_argument("--derinlik", type=int, default=2)
    a = ap.parse_args()
    cikti = Path(a.cikti)
    mevcut = json.loads(cikti.read_text(encoding="utf-8")) if cikti.exists() else {}
    dosyalar: dict[str, set] = {}
    gorulen: set = set()
    for k in a.kategori:
        kategori_tara("Category:" + k, a.derinlik, dosyalar, gorulen)
    for q in a.arama:
        j = api({"action": "query", "list": "search", "srsearch": q, "srnamespace": 6, "srlimit": 50})
        for m in j.get("query", {}).get("search", []):
            dosyalar.setdefault(m["title"], set()).add("arama:" + q)
        print(f"  arama '{q}': {len(j.get('query', {}).get('search', []))}")
    yeni = [t for t in sorted(dosyalar) if t not in mevcut]
    print(f"aday {len(dosyalar)}, yeni {len(yeni)}")
    meta = ustveri(yeni)
    for t, m in meta.items():
        m["kaynak_kat"] = sorted(dosyalar.get(t, []))
        mevcut[t] = m
    for t in dosyalar:
        if t in mevcut:
            mevcut[t]["kaynak_kat"] = sorted(set(mevcut[t].get("kaynak_kat", [])) | dosyalar[t])
    cikti.parent.mkdir(parents=True, exist_ok=True)
    cikti.write_text(json.dumps(mevcut, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"toplam {len(mevcut)} kayıt → {cikti}")


if __name__ == "__main__":
    main()
