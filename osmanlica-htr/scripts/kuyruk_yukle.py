"""Hazırlanan sayfa belgelerine sprite asset id'lerini işler ve ArtifactData `batch` çağrıları için
`writes` JSON dosyaları üretir (50'şer).

Kullanım:
  python scripts/kuyruk_yukle.py --kuyruk veri/kuyruk_web --eslesme veri/kuyruk_web/asset_eslesme.json --cikti veri/kuyruk_web/batch
`asset_eslesme.json`: {"<kimlik>.png": "<32 haneli asset id>", ...}  (Artifact asset yükleme sonuçlarından)
Çıktı: batch_01.json, batch_02.json ... her biri ArtifactData batch `writes` listesi (op: set, collection: sayfalar).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kuyruk", default="veri/kuyruk_web")
    ap.add_argument("--eslesme", required=True)
    ap.add_argument("--cikti", default=None)
    ap.add_argument("--grup", type=int, default=50)
    a = ap.parse_args()
    kuyruk = Path(a.kuyruk)
    cikti = Path(a.cikti or (kuyruk / "batch"))
    cikti.mkdir(parents=True, exist_ok=True)
    eslesme = json.loads(Path(a.eslesme).read_text(encoding="utf-8"))
    yazmalar = []
    eksik = []
    for js in sorted(kuyruk.glob("*.json")):
        if js.name in ("asset_eslesme.json",) or js.parent != kuyruk:
            continue
        kimlik = js.stem
        aid = eslesme.get(kimlik + ".png")
        if not aid:
            eksik.append(kimlik)
            continue
        govde = json.loads(js.read_text(encoding="utf-8"))
        govde["sprite"] = aid
        hazir = cikti / f"{kimlik}.doc.json"
        hazir.write_text(json.dumps(govde, ensure_ascii=False), encoding="utf-8")
        yazmalar.append({"op": "set", "collection": "sayfalar", "doc_id": kimlik, "file_path": str(hazir.resolve())})
    for i in range(0, len(yazmalar), a.grup):
        (cikti / f"batch_{i // a.grup + 1:02d}.json").write_text(json.dumps(yazmalar[i : i + a.grup], ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(yazmalar)} belge, {(len(yazmalar) + a.grup - 1) // a.grup} batch dosyası → {cikti}; eşleşmeyen: {len(eksik)} {eksik[:5]}")


if __name__ == "__main__":
    main()
