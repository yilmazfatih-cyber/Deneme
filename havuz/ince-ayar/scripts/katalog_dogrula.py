"""Model kataloğunu (`katalog/modeller.yaml`) Hugging Face API'siyle doğrular ve sonucu saklar.

Kullanım (ağ gerekir; temel klasöründen):
    .venv/bin/python scripts/katalog_dogrula.py            denetler, uyuşmazlıkları yazar
    .venv/bin/python scripts/katalog_dogrula.py --yaz      ayrıca katalog/dogrulama-<tarih>.json yazar

Her kayıt için denetlenen: depo var mı, lisans etiketi, parametre sayısı (safetensors toplamı), erişim
(onaylı/açık), dil etiketlerinde Türkçe var mı ve model kartında (README) Türkçe anılıyor mu.
Katalogdaki `turkce` alanı "kanıt: …" ile başlıyorsa bu iki kanıttan biri bulunmalıdır; yoksa
alan "kanıt yok" olmalıdır. `ticari` alanı lisans etiketinden çıkarılan sınıfla aynı olmalıdır.

Genişletme: yeni bir denetim için `compare` işlevine bir koşul ve ileti ekleyin.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ince_ayar.catalog import CatalogEntry, license_class, load_catalog  # noqa: E402
from ince_ayar.text_tr import lower_ascii  # noqa: E402

API = "https://huggingface.co/api/models/"
TURKISH_CODES = {"tr", "tur", "tur_latn", "turkish"}
TURKISH_WORDS = re.compile(r"\b(turkish|türkçe|turkce)\b", re.IGNORECASE)


def fetch(client: httpx.Client, model_id: str) -> dict[str, Any]:
    """API'den depo bilgisini ve (erişilebiliyorsa) model kartını okur."""
    response = client.get(API + model_id, params={"blobs": "true"})
    if response.status_code != 200:
        return {"kimlik": model_id, "durum": f"HTTP {response.status_code}"}
    data = response.json()
    card = data.get("cardData") or {}
    tags = data.get("tags") or []
    license_id = card.get("license") or next(
        (t[8:] for t in tags if t.startswith("license:")), None
    )
    languages = card.get("language") or []
    languages = [languages] if isinstance(languages, str) else languages
    lowered = {lower_ascii(str(code)).replace("-", "_") for code in languages}
    weights = [
        s for s in data.get("siblings") or [] if s["rfilename"].endswith((".safetensors", ".bin"))
    ]
    readme = client.get(f"https://huggingface.co/{model_id}/raw/main/README.md")
    return {
        "kimlik": data.get("id", model_id),
        "durum": "var",
        "lisans": license_id,
        "lisans_adi": card.get("license_name"),
        "parametre": (data.get("safetensors") or {}).get("total"),
        "erisim": "onayli" if data.get("gated") else "acik",
        "gorev_etiketi": data.get("pipeline_tag"),
        "kutuphane": data.get("library_name"),
        "dil_etiketi_sayisi": len(languages),
        "dil_etiketinde_tr": bool(lowered & TURKISH_CODES),
        "kartta_turkce": bool(TURKISH_WORDS.search(readme.text))
        if readme.status_code == 200
        else None,
        "agirlik_mb": round(sum(s.get("size") or 0 for s in weights) / 1e6),
        "son_degisiklik": str(data.get("lastModified", ""))[:10],
        "surum": data.get("sha"),
    }


def compare(entry: CatalogEntry, found: dict[str, Any]) -> list[str]:
    """Katalog kaydı ile API sonucu arasındaki uyuşmazlıklar (boş liste: sorun yok)."""
    if found.get("durum") != "var":
        return [f"depoya ulaşılamadı ({found.get('durum')})"]
    problems = []
    if entry.lisans != found["lisans"]:
        problems.append(f"lisans: katalog {entry.lisans}, HF {found['lisans']}")
    if entry.ticari != license_class(found["lisans"]):
        problems.append(
            f"ticari: katalog {entry.ticari}, lisanstan çıkan {license_class(found['lisans'])}"
        )
    if entry.parametre != found["parametre"]:
        problems.append(f"parametre: katalog {entry.parametre}, HF {found['parametre']}")
    if entry.erisim != found["erisim"]:
        problems.append(f"erişim: katalog {entry.erisim}, HF {found['erisim']}")
    evidence = found["dil_etiketinde_tr"] or bool(found["kartta_turkce"])
    if entry.turkce.startswith("kanıt:") and not evidence:
        problems.append("Türkçe kanıtı bulunamadı: `turkce` alanını 'kanıt yok' yapın")
    if not entry.turkce.startswith("kanıt:") and evidence:
        problems.append("Türkçe kanıtı var: `turkce` alanına 'kanıt: …' yazın")
    if "dil etiketlerinde" in entry.turkce and not found["dil_etiketinde_tr"]:
        problems.append("dil etiketlerinde Türkçe yok; kanıtın kaynağını düzeltin")
    if "model kartında" in entry.turkce and not found["kartta_turkce"]:
        problems.append("model kartı Türkçe'yi anmıyor; kanıtın kaynağını düzeltin")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Katalogdaki modelleri Hugging Face API'siyle doğrular"
    )
    parser.add_argument(
        "--yaz", action="store_true", help="sonucu katalog/dogrulama-<tarih>.json dosyasına yazar"
    )
    args = parser.parse_args()
    catalog = load_catalog()
    results, failures = [], 0
    with httpx.Client(
        timeout=60, headers={"User-Agent": "ince-ayar-katalog"}, follow_redirects=True
    ) as client:
        for entry in catalog.modeller:
            found = fetch(client, entry.kimlik)
            problems = compare(entry, found)
            failures += bool(problems)
            results.append({**found, "sorunlar": problems})
            mark = "TAMAM" if not problems else "SORUN: " + "; ".join(problems)
            print(f"{entry.kimlik:58s} {found.get('lisans') or '-':14s} {mark}")
    today = date.today().isoformat()
    if args.yaz:
        target = ROOT / "katalog" / f"dogrulama-{today}.json"
        payload = {"tarih": today, "kaynak": API, "modeller": results}
        target.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"\nyazıldı: {target.relative_to(ROOT)}")
    print(f"\n{len(results)} model denetlendi, {failures} kayıtta sorun var")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
