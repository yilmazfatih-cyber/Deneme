"""Testler için ortak yardımcılar: geçici klasörde beceri üretmek.

Kötü niyetli ya da bozuk örnek becerileri depoya koymuyoruz; testler onları çalışırken geçici
klasörde üretir. Böylece depoyu okuyan bir ajan bu metinleri talimat sanamaz (superpowers'ın
tests/skill-layout dersi).
"""

from __future__ import annotations

import tempfile
from pathlib import Path

ORNEKLER = Path(__file__).resolve().parent.parent / 'ornek-beceriler'


def beceri_yaz(kok: Path, ad: str, onbilgi: str, govde: str = '# Başlık\n', dosyalar: dict | None = None) -> Path:
    """kok/ad/SKILL.md ve isteğe bağlı ek dosyaları yazar; beceri klasörünü döndürür."""
    dizin = kok / ad
    dizin.mkdir(parents=True, exist_ok=True)
    (dizin / 'SKILL.md').write_text(f'---\n{onbilgi}\n---\n{govde}', encoding='utf-8')
    for goreli, icerik in (dosyalar or {}).items():
        yol = dizin / goreli
        yol.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(icerik, bytes):
            yol.write_bytes(icerik)
        else:
            yol.write_text(icerik, encoding='utf-8')
    return dizin


class GeciciKlasor:
    """with GeciciKlasor() as kok: ... — test bitince klasör silinir."""

    def __enter__(self) -> Path:
        self._td = tempfile.TemporaryDirectory()
        return Path(self._td.name)

    def __exit__(self, *_):
        self._td.cleanup()
