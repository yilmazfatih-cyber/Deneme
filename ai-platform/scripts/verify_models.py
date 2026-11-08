#!/usr/bin/env python3
"""Katalogdaki her modelin Hugging Face deposunu, lisansını ve parametre sayısını API ile doğrular.

Kullanım:  python scripts/verify_models.py [--write docs/model_dogrulama_YYYY-AA-GG.json]
Ağ gerekir (huggingface.co). Katalogdaki `license_class` ve `params_b` ile uyuşmazlıkları listeler.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aiplatform.catalog import LicenseClass, load_catalog  # noqa: E402

PERMISSIVE = {"apache-2.0", "mit", "bsd-3-clause", "cc-by-4.0", "openrail", "bsd"}
NONCOMMERCIAL = {"cc-by-nc-4.0", "cc-by-nc-sa-4.0", "cc-by-nc-nd-4.0", "cpml"}


def hf_info(repo: str) -> dict | None:
    req = urllib.request.Request(f"https://huggingface.co/api/models/{repo}", headers={"User-Agent": "aiplatform-verify"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}"}
    except Exception as e:  # ağ yok vb.
        return {"error": type(e).__name__}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", help="sonuç JSON dosyası")
    args = ap.parse_args()

    catalog = load_catalog()
    results = []
    problems = 0
    for model in catalog.models.values():
        repos = sorted({a.hf_repo for a in model.artifacts if a.hf_repo})
        for repo in repos:
            info = hf_info(repo)
            row = {"model_id": model.id, "repo": repo, "checked": date.today().isoformat()}
            if info is None or "error" in info:
                row["status"] = (info or {}).get("error", "bilinmiyor")
                problems += 1
            else:
                lic = (info.get("cardData") or {}).get("license") or next(
                    (t[8:] for t in info.get("tags", []) if t.startswith("license:")), None
                )
                total = (info.get("safetensors") or {}).get("total")
                row.update(status="OK", license=lic, params=total, gated=info.get("gated", False))
                if lic in NONCOMMERCIAL and model.license_class != LicenseClass.noncommercial:
                    row["warning"] = "HF lisansı ticari kullanımı yasaklıyor, katalog sınıfı farklı"
                    problems += 1
                if total and model.params_b and abs(total / 1e9 - model.params_b) / model.params_b > 0.15:
                    row["warning"] = f"parametre sayısı uyuşmuyor: HF {total/1e9:.2f}B, katalog {model.params_b}B"
                    problems += 1
            results.append(row)
            flag = "" if row["status"] == "OK" and "warning" not in row else "  <-- KONTROL"
            print(f"{model.id:28s} {repo:55s} {row['status']:8s} {row.get('license') or '':14s}{flag}")

    if args.write:
        Path(args.write).write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nyazıldı: {args.write}")
    print(f"\n{len(results)} depo denetlendi, {problems} sorun")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
