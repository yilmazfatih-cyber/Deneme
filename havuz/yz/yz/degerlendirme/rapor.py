"""Raporlar: tek koşu (Markdown/HTML), modeller arası karşılaştırma tablosu, gerileme karşılaştırması.

HTML raporu tek dosyadır, dış bağımlılığı yoktur; bütün metinler `html.escape`'ten geçer.
Kim kullanır: cli.py (`degerlendir`, `karsilastir`, `degerlendir --onceki`).
Genişletme: yeni sütun → `_OZET_SUTUNLARI` listesine (başlık, değer işlevi) ekleyin.
"""

from __future__ import annotations

import html
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from yz.degerlendirme.kosu import KosuSonucu
from yz.metin import kirp


def _yuzde(x: float) -> str:
    return f"%{x * 100:.1f}"


def _maliyet(k: KosuSonucu) -> str:
    deger = k.maliyet
    return "bilinmiyor" if deger is None else f"{deger:.6f}"


_OZET_SUTUNLARI: list[tuple[str, Callable[[KosuSonucu], str]]] = [
    ("Model", lambda k: k.model),
    ("Doğruluk", lambda k: _yuzde(k.dogruluk)),
    ("Biçim geçerliliği", lambda k: _yuzde(k.bicim_gecerliligi)),
    ("Hata", lambda k: str(k.hata_sayisi)),
    ("Gecikme p50 (sn)", lambda k: f"{k.gecikme(50):.2f}"),
    ("Gecikme p95 (sn)", lambda k: f"{k.gecikme(95):.2f}"),
    ("Girdi belirteci", lambda k: str(k.belirtec[0])),
    ("Çıktı belirteci", lambda k: str(k.belirtec[1])),
    ("Maliyet", _maliyet),
]


def _md_tablo(basliklar: Sequence[str], satirlar: Sequence[Sequence[str]]) -> str:
    def hucre(metin: str) -> str:
        return metin.replace("|", "\\|").replace("\n", " ")

    govde = ["| " + " | ".join(basliklar) + " |", "|" + "---|" * len(basliklar)]
    govde.extend("| " + " | ".join(hucre(h) for h in satir) + " |" for satir in satirlar)
    return "\n".join(govde)


def karsilastirma_md(kosular: Sequence[KosuSonucu]) -> str:
    """Modeller arası karşılaştırma tablosu (Markdown)."""
    basliklar = [b for b, _ in _OZET_SUTUNLARI]
    satirlar = [[islev(k) for _, islev in _OZET_SUTUNLARI] for k in kosular]
    return _md_tablo(basliklar, satirlar)


def kosu_md(kosu: KosuSonucu, azami_cikti: int = 80) -> str:
    """Tek koşunun Markdown raporu: özet + örnek örnek sonuçlar."""
    parcalar = [
        f"# Değerlendirme: {kosu.gorev}",
        f"Sağlayıcı: `{kosu.saglayici}` · Zaman: {kosu.zaman} · Örnek: {len(kosu.ornekler)}",
        "",
        karsilastirma_md([kosu]),
        "",
        "## Örnekler",
        "",
    ]
    satirlar = []
    for o in kosu.ornekler:
        puanlar = ", ".join(f"{ad}={p['deger']:.2f}" for ad, p in o.puanlar.items())
        durum = "HATA" if o.hata else ("✓" if o.gecti else "✗")
        cikti = o.hata or kirp(o.cikti.replace("\n", " "), azami_cikti)
        satirlar.append([o.kimlik, durum, puanlar, f"{o.gecikme_sn:.2f}", cikti])
    parcalar.append(_md_tablo(["Kimlik", "Durum", "Puanlar", "Sn", "Çıktı"], satirlar))
    return "\n".join(parcalar) + "\n"


_STIL = (
    "body{font-family:system-ui,sans-serif;margin:1.5rem;color:#1d1d1f;background:#fff}"
    "table{border-collapse:collapse;margin:1rem 0;font-size:.9rem}"
    "th,td{border:1px solid #d0d0d7;padding:.35rem .6rem;text-align:left;vertical-align:top}"
    "th{background:#f3f3f6}.gecti{color:#0a7a3e}.kaldi{color:#b3261e}"
    "@media(prefers-color-scheme:dark){body{background:#151518;color:#e8e8ec}"
    "th{background:#26262b}th,td{border-color:#3a3a40}}"
)


def _html_tablo(basliklar: Sequence[str], satirlar: Sequence[Sequence[str]]) -> str:
    ust = "".join(f"<th>{html.escape(b)}</th>" for b in basliklar)
    govde = "".join(
        "<tr>" + "".join(f"<td>{html.escape(h)}</td>" for h in satir) + "</tr>"
        for satir in satirlar
    )
    return f"<table><thead><tr>{ust}</tr></thead><tbody>{govde}</tbody></table>"


def kosu_html(kosu: KosuSonucu) -> str:
    """Tek koşunun bağımsız HTML raporu."""
    ozet = _html_tablo([b for b, _ in _OZET_SUTUNLARI], [[f(kosu) for _, f in _OZET_SUTUNLARI]])
    satirlar = [
        [
            o.kimlik,
            "HATA" if o.hata else ("geçti" if o.gecti else "kaldı"),
            ", ".join(
                f"{ad}={p['deger']:.2f} {p['aciklama']}".strip() for ad, p in o.puanlar.items()
            ),
            f"{o.gecikme_sn:.2f}",
            o.girdi,
            str(o.beklenen),
            o.hata or o.cikti,
        ]
        for o in kosu.ornekler
    ]
    ayrinti = _html_tablo(
        ["Kimlik", "Durum", "Puanlar", "Sn", "Girdi", "Beklenen", "Çıktı"], satirlar
    )
    baslik = html.escape(f"Değerlendirme: {kosu.gorev} — {kosu.model}")
    return (
        f'<!doctype html><html lang="tr"><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{baslik}</title><style>{_STIL}</style><h1>{baslik}</h1>"
        f"<p>Sağlayıcı: {html.escape(kosu.saglayici)} · {html.escape(kosu.zaman)}</p>"
        f"{ozet}<h2>Örnekler</h2>{ayrinti}</html>\n"
    )


@dataclass
class Gerileme:
    """İki koşu arasındaki fark (aynı görev kümesi)."""

    bozulan: list[str]  # önce geçen, şimdi kalan örnekler
    duzelen: list[str]
    dogruluk_farki: float
    bicim_farki: float
    gecikme_farki: float

    @property
    def gerileme_var(self) -> bool:
        return bool(self.bozulan) or self.dogruluk_farki < 0

    def md(self) -> str:
        satirlar = [
            "## Gerileme karşılaştırması",
            f"- Doğruluk farkı: {self.dogruluk_farki * 100:+.1f} puan",
            f"- Biçim geçerliliği farkı: {self.bicim_farki * 100:+.1f} puan",
            f"- Gecikme (p50) farkı: {self.gecikme_farki:+.2f} sn",
            f"- Bozulan örnekler ({len(self.bozulan)}): {', '.join(self.bozulan) or '-'}",
            f"- Düzelen örnekler ({len(self.duzelen)}): {', '.join(self.duzelen) or '-'}",
        ]
        return "\n".join(satirlar) + "\n"


def gerileme_bul(onceki: KosuSonucu, sonraki: KosuSonucu) -> Gerileme:
    eski = {o.kimlik: o.gecti for o in onceki.ornekler}
    yeni = {o.kimlik: o.gecti for o in sonraki.ornekler}
    ortak = [k for k in yeni if k in eski]
    return Gerileme(
        bozulan=[k for k in ortak if eski[k] and not yeni[k]],
        duzelen=[k for k in ortak if not eski[k] and yeni[k]],
        dogruluk_farki=sonraki.dogruluk - onceki.dogruluk,
        bicim_farki=sonraki.bicim_gecerliligi - onceki.bicim_gecerliligi,
        gecikme_farki=sonraki.gecikme(50) - onceki.gecikme(50),
    )
