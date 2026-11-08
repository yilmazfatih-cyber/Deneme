"""Abonelikle (Claude Code oturumu) etiketleme için iki komut: `etiket-bekleyen` ve `etiket-yukle`.

API anahtarı yerine zamanlanmış bir Claude Code oturumu görselleri geçici klasöre indirir, gözle bakar
(`Read` aracı), etiketleri JSON dosyasına yazar ve `etiket-yukle` ile veritabanına yükler; görseller silinir
(ADR-002, ADR-006). Yönerge: docs/ETIKET-OTURUMU.md.

Yükleme dosyası biçimi:
{
  "sezon": "SS27",
  "etiketleyen_model": "claude-code/<model>",
  "denetim": false,
  "kayitlar": [
    {"gorsel_id": "...", "parca_id": "l1-ust", "parca_konumu": "ust", "kategori": "kadin-ust",
     "siluet": "oversize", "kumas_gorunumu": "keten", "desen": "duz", ... }
  ]
}
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import date
from pathlib import Path

from moda_radar.gorsel.istem import ETIKET_EKSENLERI, eksenler, taksonomi_oku
from moda_radar.sema import Kaynak, KaynakTuru, NitelikKaydi

log = logging.getLogger(__name__)


def bekleyenler(depo, sezon: str, siniri: int, denetim: bool = False) -> list[dict]:
    from moda_radar.gorsel.komut import etiketlenecek_gorseller

    return etiketlenecek_gorseller(depo, sezon, denetim=denetim, siniri=siniri)


def _gorsel_bilgisi(depo, gorsel_id: str) -> dict | None:
    r = depo.baglanti.execute(
        "SELECT g.id, g.url, g.tarama_tarihi, d.sezon, d.marka FROM gorsel g JOIN defile d ON d.id = g.defile_id "
        "WHERE g.id = ?",
        (gorsel_id,),
    ).fetchone()
    return dict(r) if r else None


def dogrula_kayit(parca: dict, sozlukler: dict[str, list[str]]) -> tuple[dict[str, str] | None, int]:
    """Sözlük dışı değer → bilinmiyor (+1 uyarı); parca_konumu geçersizse kayıt düşer."""
    degerler, uyari = {}, 0
    for eksen in ETIKET_EKSENLERI:
        sozluk = sozlukler.get(eksen, [])
        d = parca.get(eksen)
        if d in sozluk:
            degerler[eksen] = d
            continue
        uyari += 1
        if eksen == "parca_konumu":
            return None, uyari
        if "bilinmiyor" in sozluk:
            degerler[eksen] = "bilinmiyor"
        else:
            varsayilan = NitelikKaydi.model_fields[eksen].default
            if isinstance(varsayilan, str) and varsayilan in sozluk:
                degerler[eksen] = varsayilan
    return degerler, uyari


def yukle(depo, dosya: Path) -> dict:
    """JSON dosyasındaki etiketleri parca_nitelik'e yazar. Dönüş: yazilan, dusen, uyari, bilinmeyen_gorsel."""
    veri = json.loads(dosya.read_text("utf-8"))
    sozlukler = eksenler(taksonomi_oku())
    model = veri.get("etiketleyen_model", "claude-code/bilinmiyor")
    denetim = bool(veri.get("denetim", False))
    gruplar: dict[str, list[NitelikKaydi]] = {}
    sayac = {"yazilan": 0, "dusen": 0, "uyari": 0, "bilinmeyen_gorsel": 0}
    for parca in veri.get("kayitlar", []):
        bilgi = _gorsel_bilgisi(depo, str(parca.get("gorsel_id", "")))
        if bilgi is None:
            sayac["bilinmeyen_gorsel"] += 1
            continue
        degerler, uyari = dogrula_kayit(parca, sozlukler)
        sayac["uyari"] += uyari
        if degerler is None:
            sayac["dusen"] += 1
            continue
        kayit = NitelikKaydi(
            kaynak=Kaynak(
                tur=KaynakTuru.PODYUM,
                url=bilgi["url"],
                tarama_tarihi=date.fromisoformat(str(bilgi["tarama_tarihi"])[:10]),
                sezon=bilgi["sezon"],
                marka=bilgi["marka"],
            ),
            parca_id=str(parca.get("parca_id") or f"{bilgi['id']}-{degerler['parca_konumu']}"),
            etiketleyen_model=model,
            denetim=denetim,
            **degerler,
        )
        gruplar.setdefault(bilgi["id"], []).append(kayit)
    for gorsel_id, kayitlar in gruplar.items():
        sayac["yazilan"] += depo.ekle_parca_nitelik(kayitlar, gorsel_id=gorsel_id)
    return sayac


def ekle(alt) -> list[str]:
    p = alt.add_parser("etiket-bekleyen", help="Henüz nitelik etiketi olmayan görsellerin listesi (JSON)")
    p.add_argument("--sezon", required=True)
    p.add_argument("--db", type=Path, default=Path("veri/moda.db"))
    p.add_argument("--siniri", type=int, default=40)
    p.add_argument("--denetim", action="store_true", help="denetim için %%5 örneklem")
    p = alt.add_parser("etiket-yukle", help="Oturumun yazdığı etiket JSON dosyasını veritabanına yükler")
    p.add_argument("dosya", type=Path)
    p.add_argument("--db", type=Path, default=Path("veri/moda.db"))
    return ["etiket-bekleyen", "etiket-yukle"]


def calistir(args) -> int:
    from moda_radar.veri.depo import Depo

    if not args.db.exists():
        print(f"veritabanı yok: {args.db}", file=sys.stderr)
        return 1
    depo = Depo(args.db)
    if args.komut == "etiket-bekleyen":
        liste = bekleyenler(depo, args.sezon, args.siniri, denetim=args.denetim)
        print(json.dumps({"sezon": args.sezon, "gorseller": liste}, ensure_ascii=False, indent=1, default=str))
        return 0
    sayac = yukle(depo, args.dosya)
    print(json.dumps(sayac, ensure_ascii=False))
    return 0 if sayac["yazilan"] else 1
