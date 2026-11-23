"""Test ortak ayarı: tarifcik paketini kurulum olmadan da içe aktarılabilir yapar; sahte havuz kurar.

`sahte_havuz` fikstürü: içinde `ornek` adlı küçük bir temel (havuz.json + iki dosya) bulunan geçici bir
havuz kökü açar ve TARIF_HAVUZ ortam değişkenini ona yöneltir (gerçek havuza dokunulmaz).
Genişletme: başka testlerin de ihtiyaç duyduğu yeni bir sahte yapı → buraya fikstür olarak ekleyin.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

KOK = Path(__file__).resolve().parent.parent
if str(KOK) not in sys.path:
    sys.path.insert(0, str(KOK))


@pytest.fixture
def sahte_havuz(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    havuz = tmp_path / "havuz"
    temel = havuz / "ornek"
    (temel / "src").mkdir(parents=True)
    (temel / "havuz.json").write_text(
        json.dumps({"ad": "ornek", "kopyalamaHaric": ["ciktilar", "*.tmp"]}), encoding="utf-8"
    )
    (temel / "src" / "app.ts").write_text("satir 1\nsatir 2\nsatir 3\n", encoding="utf-8")
    (temel / "README.md").write_text("# Örnek\n\nmetin\n", encoding="utf-8")
    monkeypatch.setenv("TARIF_HAVUZ", str(havuz))
    return havuz


def tarif_yaz(klasor: Path, temeller: list[str], ek: list[str] | None = None) -> Path:
    """Geçici bir tarif klasörü (tarif.json + boş betikler + README) yazar."""
    klasor.mkdir(parents=True, exist_ok=True)
    veri = {
        "ad": klasor.name,
        "baslik": "Deneme tarifi",
        "ozet": "Test için.",
        "temeller": temeller,
        "ekKlasorler": ek or [],
        "sure": "~1 dk",
        "zorluk": "kolay",
    }
    (klasor / "tarif.json").write_text(json.dumps(veri), encoding="utf-8")
    for ad in ("uygula.py", "dogrula.py"):
        (klasor / ad).write_text('"""Deneme."""\n', encoding="utf-8")
    return klasor
