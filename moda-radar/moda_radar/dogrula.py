"""`python -m moda_radar dogrula`: content/ JSON'larını şemayla ve çapraz kurallarla doğrular."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from pydantic import ValidationError

from moda_radar.sema import SegmentDosyasi, TaksonomiDosyasi

KOK = Path(__file__).resolve().parent.parent
ICERIK = KOK / "content"


def dogrula(icerik: Path = ICERIK) -> list[str]:
    hatalar: list[str] = []
    try:
        seg = SegmentDosyasi.model_validate(json.loads((icerik / "segmentler.json").read_text("utf-8")))
    except (ValidationError, OSError, json.JSONDecodeError) as e:
        hatalar.append(f"segmentler.json: {e}")
        seg = None
    try:
        tak = TaksonomiDosyasi.model_validate(json.loads((icerik / "taksonomi.json").read_text("utf-8")))
    except (ValidationError, OSError, json.JSONDecodeError) as e:
        hatalar.append(f"taksonomi.json: {e}")
        tak = None
    try:
        yasak = json.loads((icerik / "tarama-yasak.json").read_text("utf-8"))
        if not isinstance(yasak.get("alanlar"), list):
            hatalar.append("tarama-yasak.json: 'alanlar' liste olmalı")
    except (OSError, json.JSONDecodeError) as e:
        hatalar.append(f"tarama-yasak.json: {e}")

    # Çapraz kurallar
    if seg is not None:
        beklenen = {"luks", "premium", "orta", "deger", "pazar"}
        kodlar = {s.kod for s in seg.segmentler}
        if seg.ulke == "TR" and kodlar != beklenen:
            hatalar.append(f"segmentler.json: TR için beklenen kodlar {sorted(beklenen)}, bulunan {sorted(kodlar)}")
        for s in seg.segmentler:
            if s.kod != "pazar" and not s.cipa_markalar:
                hatalar.append(f"segmentler.json: {s.kod} için çıpa marka gerekli")
            if s.kod == "pazar" and not s.oncu_kanallar:
                hatalar.append("segmentler.json: pazar için öncü kanal gerekli")
    if tak is not None:
        zorunlu = {"kategori", "parca_konumu", "siluet", "kumas_gorunumu", "desen", "detay", "renk_sayisi"}
        eksik = zorunlu - set(tak.eksenler)
        if eksik:
            hatalar.append(f"taksonomi.json: eksik eksenler {sorted(eksik)}")
    return hatalar


def main() -> int:
    hatalar = dogrula()
    if hatalar:
        print("İçerik doğrulama başarısız:", file=sys.stderr)
        for h in hatalar:
            print(f"  - {h}", file=sys.stderr)
        return 1
    print("İçerik doğrulandı: segmentler.json, taksonomi.json, tarama-yasak.json")
    return 0
