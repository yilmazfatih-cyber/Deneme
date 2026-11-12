"""RNK-EPUB'dan (Latin harfli Risale-i Nur Külliyatı) telefon sayfasının "bilinen metin" dosyasını üretir.

Kullanım:
  python scripts/risale_metin.py veri/ham/risale/RNK-EPUB/Sozler.epub sozler "Sözler"
  python scripts/risale_metin.py "veri/ham/risale/RNK-EPUB/Asayı musa.epub" asa "Asâ-yı Mûsâ"

Çıktı: web/kuyruk/metin/<kimlik>.json = {ad, kaynak, kelimeler: [...], paragraf: [her paragrafın ilk kelime indeksi]}.
Sayfa belgelerindeki t_bas ve etiketlerdeki bas/son bu dosyanın kelime indeksleridir: dosya değişirse kuyruk
(scripts/risale_kuyruk.py) yeniden üretilmeli, etiketlenmiş satırların bas/son değerleri de yeniden hizalanmalıdır.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK))

from osmanlica_htr.risale import epub_paragraflar, kelime_akisi  # noqa: E402

KAYNAK = "Risale-i Nur Külliyatı, Latin harfli EPUB (archive.org RNK-EPUB)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("epub")
    ap.add_argument("kimlik", help="Çıktı adı: web/kuyruk/metin/<kimlik>.json")
    ap.add_argument("ad", help="Eserin görünen adı")
    ap.add_argument("--cikti", default=str(KOK / "web" / "kuyruk" / "metin"))
    a = ap.parse_args()
    kelimeler, paragraf = kelime_akisi(epub_paragraflar(Path(a.epub)))
    hedef = Path(a.cikti) / f"{a.kimlik}.json"
    hedef.parent.mkdir(parents=True, exist_ok=True)
    hedef.write_text(json.dumps({"ad": a.ad, "kaynak": KAYNAK, "kelimeler": kelimeler, "paragraf": paragraf},
                                ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{hedef}: {len(kelimeler)} kelime, {len(paragraf)} paragraf")


if __name__ == "__main__":
    main()
