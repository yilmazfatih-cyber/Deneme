"""Model kataloğunu (`katalog/modeller.yaml`) Hugging Face API'siyle doğrular ve sonucu saklar.

Kullanım (ağ gerekir; temel klasöründen):
    .venv/bin/python scripts/katalog_dogrula.py            denetler, uyuşmazlıkları yazar
    .venv/bin/python scripts/katalog_dogrula.py --yaz      ayrıca katalog/dogrulama-<tarih>.json yazar

Her kayıt için denetlenen: depo var mı, lisans etiketi, parametre sayısı (safetensors toplamı), erişim
(onaylı/açık), kütüphane etiketi, dil etiketlerinde Türkçe, model kartında "Turkish/Türkçe" ve
"multilingual" geçiyor mu. `turkce_metin` alanı kurallı yazılır:
"kanıt: …" → dil etiketi ya da kart Türkçe'yi anmalı; "çok dilli…" → kart "multilingual" demeli;
"kanıt yok" → Türkçe kanıtı olmamalı; "uygulanmaz" → yalnız sınıflandırma modelleri.
Kaynak: `havuz/ince-ayar/scripts/katalog_dogrula.py` (görüntü modellerine uyarlandı).

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

from goruntu.catalog import CatalogEntry, license_class, load_catalog  # noqa: E402
from goruntu.text_tr import lower_ascii  # noqa: E402

API = "https://huggingface.co/api/models/"
TURKISH_CODES = {"tr", "tur", "tur_latn", "turkish"}
TURKISH_WORDS = re.compile(r"\b(turkish|türkçe|turkce)\b", re.IGNORECASE)
MULTILINGUAL = re.compile(r"multilingual", re.IGNORECASE)


def fetch(client: httpx.Client, model_id: str) -> dict[str, Any]:
    """API'den depo bilgisini ve (erişilebiliyorsa) model kartını okur."""
    response = client.get(API + model_id, params={"blobs": "true"})
    if response.status_code != 200:
        return {"kimlik": model_id, "durum": f"HTTP {response.status_code}"}
    data = response.json()
    card = data.get("cardData") or {}
    tags = data.get("tags") or []
    license_id = card.get("license") or next(
        (x[8:] for x in tags if x.startswith("license:")), None
    )
    languages = card.get("language") or []
    languages = [languages] if isinstance(languages, str) else languages
    lowered = {lower_ascii(str(code)).replace("-", "_") for code in languages}
    weights = [
        s for s in data.get("siblings") or [] if s["rfilename"].endswith((".safetensors", ".bin"))
    ]
    readme = client.get(f"https://huggingface.co/{model_id}/raw/main/README.md")
    text = readme.text if readme.status_code == 200 else ""
    return {
        "kimlik": data.get("id", model_id),
        "durum": "var",
        "lisans": license_id,
        "parametre": (data.get("safetensors") or {}).get("total"),
        "erisim": "onayli" if data.get("gated") else "acik",
        "kutuphane": data.get("library_name"),
        "gorev_etiketi": data.get("pipeline_tag"),
        "dil_etiketinde_tr": bool(lowered & TURKISH_CODES),
        "kartta_turkce": bool(TURKISH_WORDS.search(text)),
        "kartta_cok_dilli": bool(MULTILINGUAL.search(text)),
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
            f"ticari: katalog {entry.ticari}, lisanstan {license_class(found['lisans'])}"
        )
    if entry.parametre != found["parametre"]:
        problems.append(f"parametre: katalog {entry.parametre}, HF {found['parametre']}")
    if entry.erisim != found["erisim"]:
        problems.append(f"erişim: katalog {entry.erisim}, HF {found['erisim']}")
    turkish = found["dil_etiketinde_tr"] or found["kartta_turkce"]
    claim = entry.turkce_metin
    if claim.startswith("kanıt:") and not turkish:
        problems.append("Türkçe kanıtı bulunamadı: `turkce_metin` alanını düzeltin")
    if claim.startswith("çok dilli") and not found["kartta_cok_dilli"]:
        problems.append("model kartı 'multilingual' demiyor")
    if claim == "kanıt yok" and turkish:
        problems.append("Türkçe kanıtı var: `turkce_metin` alanına 'kanıt: …' yazın")
    if claim == "uygulanmaz" and "gomme" in entry.gorev:
        problems.append("gömme modelinde `turkce_metin` 'uygulanmaz' olamaz")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="Katalogdaki modelleri HF API'siyle doğrular")
    parser.add_argument("--yaz", action="store_true", help="katalog/dogrulama-<tarih>.json yazar")
    args = parser.parse_args()
    results, failures = [], 0
    with httpx.Client(
        timeout=60, headers={"User-Agent": "goruntu-katalog"}, follow_redirects=True
    ) as client:
        for entry in load_catalog().modeller:
            found = fetch(client, entry.kimlik)
            problems = compare(entry, found)
            failures += bool(problems)
            results.append({**found, "sorunlar": problems})
            mark = "TAMAM" if not problems else "SORUN: " + "; ".join(problems)
            print(f"{entry.kimlik:52s} {found.get('lisans') or '-':12s} {mark}")
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
