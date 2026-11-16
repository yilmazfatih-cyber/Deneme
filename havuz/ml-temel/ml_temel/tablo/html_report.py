"""Bağımlılıksız HTML rapor: Markdown raporun HTML hâli + satır içi SVG çizimler.

Markdown'un yalnız raporda kullandığımız alt kümesi çevrilir (başlık, liste, tablo, kod bloğu,
**kalın**, `kod`). Bütün metin önce `html.escape` ile kaçışlanır (kullanıcı verisindeki sütun
adları sayfaya kod olarak sızamaz). Çizimler: aday modellerin ana ölçütü (± std), kalibrasyon
eğrisi (ikili sınıflama) ve permütasyon önemi. Tek dosyadır; internet gerektirmez.
Genişletme: yeni bir çizim için `_svg_*` biçiminde bir fonksiyon yazıp `render_html`'de ekleyin.
"""

from __future__ import annotations

import html
import re
from typing import Any

from ml_temel.tablo.messages import t
from ml_temel.tablo.report import num

_STYLE = """
:root { --fg:#1b1f24; --bg:#ffffff; --muted:#5b636e; --line:#d8dde3; --bar:#3b6fb6; }
@media (prefers-color-scheme: dark) {
  :root { --fg:#e6e9ee; --bg:#14171b; --muted:#a3abb6; --line:#39404a; --bar:#79a6e8; }
}
body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg);
       background: var(--bg); max-width: 60rem; margin: 2rem auto; padding: 0 1rem;
       line-height: 1.5; }
table { border-collapse: collapse; margin: 0.5rem 0 1rem; font-size: 0.92rem; }
th, td { border: 1px solid var(--line); padding: 0.3rem 0.6rem; text-align: left; }
code, pre { background: rgba(127,127,127,0.12); border-radius: 4px; padding: 0.1rem 0.3rem; }
pre { padding: 0.6rem; overflow-x: auto; }
svg text { fill: var(--fg); font-size: 12px; }
"""


def _inline(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)


def markdown_to_html(markdown: str) -> str:
    """Raporun Markdown alt kümesini HTML'e çevirir."""
    out: list[str] = []
    in_list = in_table = in_code = False
    for line in markdown.splitlines():
        if line.startswith("```"):
            out.append("</pre>" if in_code else "<pre>")
            in_code = not in_code
            continue
        if in_code:
            out.append(html.escape(line))
            continue
        if in_list and not line.startswith("- "):
            out.append("</ul>")
            in_list = False
        if in_table and not line.startswith("|"):
            out.append("</table>")
            in_table = False
        if line.startswith("## "):
            out.append(f"<h2>{_inline(line[3:])}</h2>")
        elif line.startswith("# "):
            out.append(f"<h1>{_inline(line[2:])}</h1>")
        elif line.startswith("- "):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{_inline(line[2:])}</li>")
        elif line.startswith("|"):
            if re.fullmatch(r"\|(-+\|)+", line.replace(" ", "")):
                continue
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            tag = "th" if not in_table else "td"
            if not in_table:
                out.append("<table>")
                in_table = True
            out.append("<tr>" + "".join(f"<{tag}>{_inline(c)}</{tag}>" for c in cells) + "</tr>")
        elif line.strip():
            out.append(f"<p>{_inline(line)}</p>")
    out.append("</ul>" if in_list else "")
    out.append("</table>" if in_table else "")
    return "\n".join(out)


def _svg_bars(labels: list[str], values: list[float], errors: list[float], title: str) -> str:
    """Yatay çubuk grafik (± hata çizgisiyle)."""
    width, row, left = 640, 26, 190
    top = max([abs(v) + abs(e) for v, e in zip(values, errors, strict=True)] + [1e-12])
    scale = (width - left - 60) / top
    parts = [
        f'<svg role="img" aria-label="{html.escape(title)}" width="{width}" '
        f'height="{row * len(labels) + 30}" xmlns="http://www.w3.org/2000/svg">',
        f'<text x="0" y="14">{html.escape(title)}</text>',
    ]
    for i, (label, value, error) in enumerate(zip(labels, values, errors, strict=True)):
        y = 24 + i * row
        length = max(value, 0.0) * scale
        parts.append(f'<text x="0" y="{y + 14}">{html.escape(label[:28])}</text>')
        parts.append(
            f'<rect x="{left}" y="{y + 3}" width="{length:.1f}" height="16" fill="var(--bar)"/>'
        )
        if error > 0:
            lo, hi = left + max(value - error, 0) * scale, left + (value + error) * scale
            parts.append(
                f'<line x1="{lo:.1f}" x2="{hi:.1f}" y1="{y + 11}" y2="{y + 11}" '
                'stroke="var(--fg)" stroke-width="1.5"/>'
            )
        parts.append(f'<text x="{left + length + 6:.1f}" y="{y + 15}">{num(value)}</text>')
    parts.append("</svg>")
    return "".join(parts)


def _svg_reliability(rows: list[dict[str, Any]], title: str) -> str:
    """Kalibrasyon eğrisi: köşegen = kusursuz; noktalar = (tahmin, gerçekleşen)."""
    size, pad = 320, 36
    span = size - 2 * pad

    def point(p: float, o: float) -> tuple[float, float]:
        return pad + p * span, size - pad - o * span

    parts = [
        f'<svg role="img" aria-label="{html.escape(title)}" width="{size}" height="{size}" '
        'xmlns="http://www.w3.org/2000/svg">',
        f'<text x="{pad}" y="16">{html.escape(title)}</text>',
        f'<rect x="{pad}" y="{pad}" width="{span}" height="{span}" fill="none" '
        'stroke="var(--line)"/>',
        f'<line x1="{pad}" y1="{size - pad}" x2="{size - pad}" y2="{pad}" stroke="var(--muted)" '
        'stroke-dasharray="4 4"/>',
    ]
    coords = [point(r["tahmin"], r["gercek"]) for r in rows]
    if coords:
        path = " ".join(f"{x:.1f},{y:.1f}" for x, y in coords)
        parts.append(
            f'<polyline points="{path}" fill="none" stroke="var(--bar)" stroke-width="2"/>'
        )
        parts += [
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="var(--bar)"/>' for x, y in coords
        ]
    parts.append(
        f'<text x="{pad}" y="{size - 8}">0</text><text x="{size - pad - 6}" y="{size - 8}">1</text>'
    )
    parts.append("</svg>")
    return "".join(parts)


def render_html(results: dict[str, Any], markdown: str) -> str:
    """Tam HTML sayfası."""
    metric = results["ana_olcut"]
    charts = []
    rows = results["cv"]
    charts.append(
        _svg_bars(
            [t(f"model_{r['model']}") for r in rows],
            [r["olcutler"][metric]["ort"] for r in rows],
            [r["olcutler"][metric]["std"] for r in rows],
            f"{t(f'olcut_{metric}')} (çapraz doğrulama, ort. ± std)",
        )
    )
    table = results["sinama"].get("kalibrasyon_tablosu")
    if table:
        charts.append(_svg_reliability(table["sonra"], "Kalibrasyon (sınama kümesi)"))
    importance = list(results["onem"][:12])
    if importance:
        charts.append(
            _svg_bars(
                [str(item["sutun"]) for item in importance],
                [float(item["ort"]) for item in importance],
                [float(item["std"]) for item in importance],
                "Permütasyon önemi (sınama kümesi)",
            )
        )
    title = html.escape(t("rapor_baslik", hedef=results["veri"]["hedef"]).lstrip("# "))
    figures = "".join(f"<figure>{chart}</figure>" for chart in charts)
    return (
        f'<!doctype html><html lang="tr"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{title}</title><style>{_STYLE}</style></head><body>"
        f"{markdown_to_html(markdown)}<h2>Çizimler</h2>{figures}</body></html>"
    )
