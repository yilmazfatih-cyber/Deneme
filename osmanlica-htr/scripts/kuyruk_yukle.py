"""Hazırlanan sayfa belgelerini telefon sayfasına yüklemeye hazırlar.

İki mod:
- dosya (varsayılan): sprite PNG'leri gri JPEG'e çevrilip `web/kuyruk/<kimlik>.jpg` olarak yazılır; belgeye
  `sprite_yol: "kuyruk/<kimlik>.jpg"` konur. Görüntüler artifact'a yayımlanan dosyalar olarak gider
  (Artifact publish, files: {"kuyruk/<kimlik>.jpg": "web/kuyruk/<kimlik>.jpg", ...}), kimlik eşlemesi gerekmez.
- asset: `--eslesme asset_eslesme.json` ({"<kimlik>.png": "<asset id>"}) ile belgeye `sprite: <id>` konur.

Her iki modda ArtifactData `batch` için 50'şerlik `writes` dosyaları üretilir (op: set, collection: sayfalar).

Kullanım:
  python scripts/kuyruk_yukle.py --kuyruk veri/kuyruk_web --web web --cikti veri/kuyruk_web/batch
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kuyruk", default="veri/kuyruk_web")
    ap.add_argument("--web", default="web")
    ap.add_argument("--eslesme", default=None, help="asset modu için id eşlemesi")
    ap.add_argument("--cikti", default=None)
    ap.add_argument("--grup", type=int, default=50)
    ap.add_argument("--kalite", type=int, default=82)
    a = ap.parse_args()
    kuyruk = Path(a.kuyruk)
    cikti = Path(a.cikti or (kuyruk / "batch"))
    cikti.mkdir(parents=True, exist_ok=True)
    eslesme = json.loads(Path(a.eslesme).read_text(encoding="utf-8")) if a.eslesme else None
    kdir = Path(a.web) / "kuyruk"
    if eslesme is None:
        kdir.mkdir(parents=True, exist_ok=True)
    yazmalar, eksik, toplam = [], [], 0
    for js in sorted(kuyruk.glob("*.json")):
        if js.name == "asset_eslesme.json":
            continue
        kimlik = js.stem
        govde = json.loads(js.read_text(encoding="utf-8"))
        if eslesme is not None:
            aid = eslesme.get(kimlik + ".png")
            if not aid:
                eksik.append(kimlik)
                continue
            govde["sprite"] = aid
        else:
            png = kuyruk / f"{kimlik}.png"
            if not png.exists():
                eksik.append(kimlik)
                continue
            jpg = kdir / f"{kimlik}.jpg"
            Image.open(png).convert("L").save(jpg, quality=a.kalite, optimize=True, progressive=True)
            toplam += jpg.stat().st_size
            govde["sprite_yol"] = f"kuyruk/{kimlik}.jpg"
            govde.pop("sprite", None)
        hazir = cikti / f"{kimlik}.doc.json"
        hazir.write_text(json.dumps(govde, ensure_ascii=False), encoding="utf-8")
        yazmalar.append({"op": "set", "collection": "sayfalar", "doc_id": kimlik, "file_path": str(hazir.resolve())})
    for eski in cikti.glob("batch_*.json"):
        eski.unlink()
    for i in range(0, len(yazmalar), a.grup):
        (cikti / f"batch_{i // a.grup + 1:02d}.json").write_text(json.dumps(yazmalar[i : i + a.grup], ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(yazmalar)} belge, {(len(yazmalar) + a.grup - 1) // a.grup} batch → {cikti}; eksik: {len(eksik)} {eksik[:3]}")
    if eslesme is None:
        print(f"JPEG toplam {toplam / 1e6:.1f} MB → {kdir}")


if __name__ == "__main__":
    main()
