"""Rapor yazımı: çok sayfalı Excel ve dış kaynak içermeyen tek dosyalık HTML."""

from __future__ import annotations

import html
from datetime import datetime
from pathlib import Path

import pandas as pd
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


def _excel_bicimle(ws) -> None:
    baslik_dolgu = PatternFill("solid", fgColor="1F3A5F")
    for hucre in ws[1]:
        hucre.font = Font(bold=True, color="FFFFFF")
        hucre.fill = baslik_dolgu
        hucre.alignment = Alignment(vertical="center")
    for sutun in ws.columns:
        en = max((len(str(h.value)) for h in sutun if h.value is not None), default=8)
        ws.column_dimensions[get_column_letter(sutun[0].column)].width = min(max(10, en + 2), 60)
    ws.freeze_panes = "A2"


def _tarihleri_sadelestir(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for s in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[s]):
            df[s] = df[s].dt.date
    return df


def excel_yaz(yol: Path, sayfalar: dict[str, pd.DataFrame]) -> None:
    with pd.ExcelWriter(yol, engine="openpyxl") as yazici:
        for ad, df in sayfalar.items():
            if df is None:
                continue
            df = _tarihleri_sadelestir(df) if not df.empty else df
            df.to_excel(yazici, sheet_name=ad[:31], index=False)
            _excel_bicimle(yazici.sheets[ad[:31]])


def _tl(x) -> str:
    try:
        return f"{float(x):,.2f} ₺".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return html.escape(str(x))


def _tablo_html(df: pd.DataFrame, para_sutunlari: set[str] | None = None, en_fazla: int = 300) -> str:
    if df is None or df.empty:
        return "<p class='bos'>Kayıt yok.</p>"
    para_sutunlari = para_sutunlari or set()
    df = _tarihleri_sadelestir(df).head(en_fazla)
    basliklar = "".join(f"<th>{html.escape(str(s))}</th>" for s in df.columns)
    satirlar = []
    for _, r in df.iterrows():
        hucreler = []
        for s in df.columns:
            v = r[s]
            if s in para_sutunlari or (isinstance(v, float) and s not in {"pay_yuzde"}):
                sinif = " class='neg'" if isinstance(v, (int, float)) and v < 0 else ""
                hucreler.append(f"<td{sinif}>{_tl(v)}</td>")
            else:
                hucreler.append(f"<td>{html.escape(str(v))}</td>")
        satirlar.append("<tr>" + "".join(hucreler) + "</tr>")
    not_ = f"<p class='bos'>İlk {en_fazla} satır gösteriliyor; tamamı Excel'de.</p>" if len(df) >= en_fazla else ""
    return f"<table><thead><tr>{basliklar}</tr></thead><tbody>{''.join(satirlar)}</tbody></table>{not_}"


def _cubuk_html(df: pd.DataFrame, etiket: str, gelen: str, giden: str) -> str:
    """Aylık gelen/giden için harici kütüphanesiz basit çubuk grafik."""
    if df is None or df.empty:
        return ""
    tavan = max(df[gelen].max(), df[giden].max(), 1.0)
    parcalar = []
    for _, r in df.iterrows():
        g = 100 * r[gelen] / tavan
        c = 100 * r[giden] / tavan
        parcalar.append(
            f"<div class='ay'><div class='etiket'>{html.escape(str(r[etiket]))}</div>"
            f"<div class='bar gelen' style='width:{g:.1f}%' title='Gelen {_tl(r[gelen])}'></div>"
            f"<div class='bar giden' style='width:{c:.1f}%' title='Giden {_tl(r[giden])}'></div></div>"
        )
    return "<div class='grafik'>" + "".join(parcalar) + "</div>"


def html_yaz(yol: Path, ozet: dict, bolumler: dict[str, pd.DataFrame], uyarilar: list[str]) -> None:
    ozet_html = "".join(
        f"<div class='kart'><div class='k'>{html.escape(str(k))}</div><div class='v'>"
        f"{_tl(v) if isinstance(v, float) else html.escape(str(v))}</div></div>"
        for k, v in ozet.items()
    )
    para = {"gonderilen", "alinan", "net", "gelen", "giden", "birikimli_net", "toplam", "tipik_tutar",
            "yillik_tahmin", "hacim", "tutar", "bakiye"}
    govde = []
    aylik = bolumler.get("Aylık Akış")
    if aylik is not None and not aylik.empty:
        govde.append("<h2>Aylık gelen / giden</h2>" + _cubuk_html(aylik, "ay", "gelen", "giden"))
    for baslik, df in bolumler.items():
        govde.append(f"<h2>{html.escape(baslik)}</h2>" + _tablo_html(df, para))
    uyari_html = ("<div class='uyari'><strong>Uyarılar</strong><ul>" +
                  "".join(f"<li>{html.escape(u)}</li>" for u in uyarilar) + "</ul></div>") if uyarilar else ""
    sayfa = f"""<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hesap Analizi</title>
<style>
:root{{--bg:#fff;--fg:#1b1b1b;--cizgi:#ddd;--vurgu:#1f3a5f;--gelen:#2e7d32;--giden:#b26a00;--neg:#9c2b2b;--kart:#f4f6f9}}
@media (prefers-color-scheme:dark){{:root{{--bg:#131518;--fg:#e8e8e8;--cizgi:#333;--vurgu:#9db7d9;--kart:#1d2127;--gelen:#6fbf73;--giden:#e0a84a;--neg:#e57373}}}}
body{{font-family:system-ui,sans-serif;margin:0;padding:16px;background:var(--bg);color:var(--fg);max-width:1200px;margin-inline:auto}}
h1{{color:var(--vurgu);margin:0 0 4px}} h2{{color:var(--vurgu);margin-top:32px;border-bottom:1px solid var(--cizgi);padding-bottom:4px}}
.alt{{opacity:.7;font-size:.9em;margin-bottom:16px}}
.ozet{{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}}
.kart{{background:var(--kart);border-radius:8px;padding:10px 12px}} .k{{font-size:.8em;opacity:.75}} .v{{font-size:1.15em;font-weight:600;margin-top:2px}}
table{{border-collapse:collapse;width:100%;font-size:.9em;overflow-x:auto;display:block}}
th,td{{border-bottom:1px solid var(--cizgi);padding:6px 8px;text-align:left;white-space:nowrap}} th{{background:var(--kart);position:sticky;top:0}}
td.neg{{color:var(--neg)}} .bos{{opacity:.7}}
.grafik{{display:flex;flex-direction:column;gap:6px}} .ay{{display:grid;grid-template-columns:70px 1fr;grid-auto-rows:8px;column-gap:8px;row-gap:2px;align-items:center}}
.etiket{{grid-row:span 2;font-size:.8em}} .bar{{height:8px;border-radius:4px}} .bar.gelen{{background:var(--gelen)}} .bar.giden{{background:var(--giden)}}
.uyari{{background:var(--kart);border-left:4px solid var(--giden);padding:8px 12px;margin:16px 0}}
footer{{margin-top:40px;font-size:.8em;opacity:.6}}
</style></head><body>
<h1>Hesap Analizi</h1>
<div class="alt">Oluşturulma: {datetime.now():%d.%m.%Y %H:%M} · Bu dosya hiçbir dış kaynak yüklemez; çevrimdışı açılır.</div>
<div class="ozet">{ozet_html}</div>
{uyari_html}
{''.join(govde)}
<footer>hesap-analiz · veriler yalnızca bu bilgisayarda işlendi.</footer>
</body></html>"""
    yol.write_text(sayfa, encoding="utf-8")
