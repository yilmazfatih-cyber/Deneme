"""Sezon paleti raporu (Markdown). Kod önde, ad parantezde ve "Pantone adı" ibaresiyle (ADR-001)."""

from __future__ import annotations

from moda_radar.sema import PaletSatiri

GUVEN_ETIKETI = {"eslesme": "eşleşme", "yakin": "yakın", "yaklasik": "yaklaşık"}
YON_ETIKETI = {"giris": "giriş", "yukselis": "yükseliş", "zirve": "zirve", "cikis": "çıkış", "duz": "düz"}


def _sayi(x: float, basamak: int = 1) -> str:
    """Türkçe ondalık virgülü."""
    return f"{x:.{basamak}f}".replace(".", ",")


def _isaretli(x: float) -> str:
    return ("+" if x > 0 else "") + _sayi(x)


def _hucre(metin: str) -> str:
    return metin.replace("|", "\\|")


def palet_markdown(satirlar: list[PaletSatiri]) -> str:
    """Palet tablosu. Sütunlar: kod · (Pantone adı) · hex · Lab · ΔE · podyum payı · fark · yön · marka sayısı ·
    segment raf tahmini · ikinci aday."""
    basliklar = [
        "TCX kodu",
        "(Pantone adı)",
        "hex",
        "Lab (L / a / b)",
        "ΔE2000",
        "podyum payı",
        "önceki sezona fark (puan)",
        "yön",
        "marka sayısı",
        "segment raf tahmini",
        "ikinci aday",
    ]
    satir_md = [
        "| " + " | ".join(basliklar) + " |",
        "|" + "|".join(["---"] * len(basliklar)) + "|",
    ]
    for s in satirlar:
        p, iki = s.pantone, s.ikinci_aday
        ad = f"(Pantone adı: {p.ad})" if p.ad else "(Pantone adı yok)"
        lab = f"{_sayi(s.kume_merkezi.L)} / {_sayi(s.kume_merkezi.a)} / {_sayi(s.kume_merkezi.b)}"
        de = f"{_sayi(p.delta_e, 2)} ({GUVEN_ETIKETI[p.guven]})"
        raf = "; ".join(f"{k}: {v}" for k, v in s.segment_raf_tahmini.items()) or "—"
        iki_metin = f"{iki.kod} · ΔE {_sayi(iki.delta_e, 2)}"
        hucreler = [
            p.kod,
            ad,
            s.hex,
            lab,
            de,
            f"%{_sayi(s.podyum_payi * 100)}",
            _isaretli(s.onceki_sezon_farki),
            YON_ETIKETI.get(str(s.yon), str(s.yon)),
            str(s.marka_sayisi),
            raf,
            iki_metin,
        ]
        satir_md.append("| " + " | ".join(_hucre(h) for h in hucreler) + " |")
    if not satirlar:
        satir_md.append("| " + " | ".join(["—"] * len(basliklar)) + " |")
    notlar = [
        "",
        "ΔE2000 güveni: ≤ 3 eşleşme, 3–5 yakın, > 5 yaklaşık. İkinci en yakın aday her satırda verilir.",
        "Hex → Lab dönüşümü sRGB/D65 varsayımıyladır; basılı Pantone renginden sapma olabilir (ADR-001).",
        "Pantone adları Pantone LLC telifidir; yalnızca okunabilirlik için, koddan sonra ve parantez içinde verilir.",
    ]
    return "\n".join(satir_md + notlar) + "\n"
