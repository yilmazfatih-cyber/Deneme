"""archive.org IIIF manifestlerinden sayfa listesi çıkarır ve sayfa görüntülerini indirir.

Kullanım:
  python scripts/iiif_risale.py liste <manifest.json>                       # sayfa sırası, dosya adı, servis kimliği
  python scripts/iiif_risale.py indir <manifest.json> <hedef> --genislik 1600 [--sayfalar 0-50,60]
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = "OsmanlicaHTR/0.1 (acik kaynak arastirma)"


def sayfalar(manifest: Path) -> list[dict]:
    m = json.loads(manifest.read_text(encoding="utf-8"))
    out = []

    def gez(o):
        for it in o.get("items", []):
            if it.get("type") == "Canvas":
                try:
                    body = it["items"][0]["items"][0]["body"]
                    svc = body["service"][0]["id"]
                except (KeyError, IndexError):
                    continue
                cozulmus = urllib.parse.unquote(svc)
                parcalar = cozulmus.split("/iiif/3/", 1)[-1].split("/")
                dosya = parcalar[1].replace("_jp2.zip", "") if len(parcalar) > 1 else ""
                out.append({"sira": len(out), "etiket": next(iter((it.get("label") or {}).values()), [""])[0], "servis": svc, "dosya": dosya,
                            "w": it.get("width"), "h": it.get("height")})
            elif it.get("type") in ("Manifest", "Range", "Collection"):
                gez(it)

    gez(m)
    return out


def indir(url: str, hedef: Path, deneme: int = 5) -> None:
    for i in range(deneme):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120) as r:
                hedef.write_bytes(r.read())
            return
        except Exception as e:  # noqa: BLE001
            if i == deneme - 1:
                raise
            time.sleep(3 * (i + 1))


def aralik(s: str, n: int) -> list[int]:
    if not s:
        return list(range(n))
    out = []
    for p in s.split(","):
        if "-" in p:
            a, b = p.split("-")
            out += list(range(int(a), min(n, int(b) + 1)))
        else:
            out.append(int(p))
    return [i for i in out if 0 <= i < n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("komut", choices=["liste", "indir"])
    ap.add_argument("manifest")
    ap.add_argument("hedef", nargs="?")
    ap.add_argument("--genislik", type=int, default=1600)
    ap.add_argument("--sayfalar", default="")
    ap.add_argument("--bekle", type=float, default=0.5)
    a = ap.parse_args()
    s = sayfalar(Path(a.manifest))
    if a.komut == "liste":
        import collections

        print(len(s), "sayfa;", collections.Counter(x["dosya"] for x in s))
        return
    hedef = Path(a.hedef)
    hedef.mkdir(parents=True, exist_ok=True)
    for i in aralik(a.sayfalar, len(s)):
        x = s[i]
        yol = hedef / f"{i:04d}.jpg"
        if yol.exists() and yol.stat().st_size > 0:
            continue
        boyut = "max" if (x.get("w") and a.genislik >= x["w"]) else f"{a.genislik},"
        indir(f"{x['servis']}/full/{boyut}/0/default.jpg", yol)
        time.sleep(a.bekle)
    (hedef / "sayfalar.json").write_text(json.dumps(s, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(aralik(a.sayfalar, len(s)))} sayfa → {hedef}")


if __name__ == "__main__":
    main()
