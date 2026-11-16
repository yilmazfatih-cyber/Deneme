"""Bağımlılıksız HTML eğitim raporu: özet tablo, kayıp eğrisi (satır içi SVG), örnek üretimler.

Kim kullanır: görevlerin `train.py` dosyaları eğitim sonunda `write_report` çağırır; çıktı tek bir
`rapor.html` dosyasıdır (dış kaynak, betik ya da yazı tipi indirmez; çevrimdışı açılır).

Güvenlik: rapora giren her metin (model çıktısı dahil) `html.escape` ile kaçışlanır.

Genişletme: yeni bir bölüm için `_section` ile bir HTML parçası üretip `build_report` içindeki
listeye ekleyin.
"""

from __future__ import annotations

import html
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from ince_ayar.messages import REPORT_FIELDS, headers, t

WIDTH, HEIGHT, MARGIN = 720, 260, 44
STYLE = """
:root { color-scheme: light dark; --ink: #1c2430; --soft: #5b6777; --line: #d5dbe3; --bg: #ffffff;
        --train: #2563eb; --eval: #d97706; }
@media (prefers-color-scheme: dark) {
  :root { --ink: #e6eaf0; --soft: #9aa6b5; --line: #354050; --bg: #12161c; --train: #7aa7ff;
          --eval: #f5b453; } }
body { font: 15px/1.5 system-ui, sans-serif; color: var(--ink); background: var(--bg);
       max-width: 860px; margin: 2rem auto; padding: 0 1rem; }
h1 { font-size: 1.5rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; vertical-align: top;
       padding: .35rem .6rem; border-bottom: 1px solid var(--line); }
th { color: var(--soft); font-weight: 600; white-space: nowrap; }
td.text { white-space: pre-wrap; word-break: break-word; }
svg { width: 100%; height: auto; } .note { color: var(--soft); }
"""


def summary_rows(summary: Mapping[str, Any], keys: Sequence[str]) -> list[tuple[str, Any]]:
    """Özet sözlüğünden rapor tablosu satırları; alan adları `messages.REPORT_FIELDS` içindedir."""
    return [(REPORT_FIELDS.get(key, key), summary.get(key)) for key in keys]


def _escape(value: Any) -> str:
    return html.escape(str(value), quote=True)


def _section(title: str, body: str) -> str:
    return f"<h2>{_escape(title)}</h2>\n{body}\n"


def _table(head: Sequence[str], rows: Sequence[Sequence[Any]], text_columns: bool = False) -> str:
    cell_class = ' class="text"' if text_columns else ""
    header = "".join(f"<th>{_escape(name)}</th>" for name in head)
    body = "".join(
        "<tr>" + "".join(f"<td{cell_class}>{_escape(cell)}</td>" for cell in row) + "</tr>"
        for row in rows
    )
    return f"<table><thead><tr>{header}</tr></thead><tbody>{body}</tbody></table>"


def _points(logs: Sequence[dict[str, Any]], key: str) -> list[tuple[float, float]]:
    return [(float(row["adim"]), float(row[key])) for row in logs if key in row and "adim" in row]


def loss_chart(logs: Sequence[dict[str, Any]]) -> str:
    """Eğitim ve doğrulama kaybını adım eksenine çizer; veri yoksa kısa bir not döndürür."""
    train, evaluation = _points(logs, "loss"), _points(logs, "eval_loss")
    values = train + evaluation
    if not values:
        return f'<p class="note">{_escape(t("rapor.egri_yok"))}</p>'
    x_max = max(1.0, *(x for x, _ in values))
    y_min, y_max = min(y for _, y in values), max(y for _, y in values)
    span = (y_max - y_min) or 1.0
    y_min, y_max = y_min - 0.05 * span, y_max + 0.05 * span

    def place(x: float, y: float) -> tuple[float, float]:
        px = MARGIN + x / x_max * (WIDTH - 2 * MARGIN)
        py = HEIGHT - MARGIN - (y - y_min) / (y_max - y_min) * (HEIGHT - 2 * MARGIN)
        return round(px, 1), round(py, 1)

    parts = [
        f'<svg viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="{_escape(t("rapor.egri"))}">'
    ]
    for tick in range(5):
        y_value = y_min + (y_max - y_min) * tick / 4
        _, py = place(0, y_value)
        parts.append(
            f'<line x1="{MARGIN}" x2="{WIDTH - MARGIN}" y1="{py}" y2="{py}" stroke="var(--line)"/>'
            f'<text x="{MARGIN - 6}" y="{py + 4}" text-anchor="end" font-size="11" '
            f'fill="var(--soft)">{y_value:.3g}</text>'
        )
        px, _ = place(x_max * tick / 4, y_min)
        parts.append(
            f'<text x="{px}" y="{HEIGHT - MARGIN + 16}" text-anchor="middle" font-size="11" '
            f'fill="var(--soft)">{x_max * tick / 4:.0f}</text>'
        )
    for series, color, label in ((train, "var(--train)", 0), (evaluation, "var(--eval)", 1)):
        if not series:
            continue
        path = " ".join(f"{px},{py}" for px, py in (place(x, y) for x, y in series))
        parts.append(f'<polyline points="{path}" fill="none" stroke="{color}" stroke-width="2"/>')
        parts.extend(
            f'<circle cx="{px}" cy="{py}" r="2.5" fill="{color}"/>'
            for px, py in (place(x, y) for x, y in series)
        )
        legend_x = MARGIN + 8 + label * 150
        name = headers("rapor.egri_adlari")[label]
        parts.append(
            f'<rect x="{legend_x}" y="12" width="12" height="3" fill="{color}"/>'
            f'<text x="{legend_x + 18}" y="17" font-size="12" fill="var(--ink)">{_escape(name)}</text>'
        )
    parts.append("</svg>")
    return "".join(parts)


def build_report(
    title: str,
    summary: Sequence[tuple[str, Any]],
    logs: Sequence[dict[str, Any]],
    samples: Sequence[dict[str, Any]],
    notes: Sequence[str],
) -> str:
    """Raporun tam HTML metnini üretir."""
    sample_head = headers("rapor.ornek_basliklari")
    sample_rows = [
        [
            row.get("adim", ""),
            row.get("girdi", ""),
            row.get("beklenen", ""),
            row.get("uretilen", ""),
        ]
        for row in samples
    ]
    sections = [
        _section(t("rapor.ozet"), _table(headers("rapor.ozet_basliklari"), list(summary))),
        _section(t("rapor.egri"), loss_chart(logs)),
    ]
    if sample_rows:
        sections.append(_section(t("rapor.ornekler"), _table(sample_head, sample_rows, True)))
    if notes:
        items = "".join(f"<li>{_escape(note)}</li>" for note in notes)
        sections.append(_section(t("rapor.uyarilar"), f"<ul>{items}</ul>"))
    return (
        '<!doctype html>\n<html lang="tr"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{_escape(title)}</title><style>{STYLE}</style></head><body>"
        f"<h1>{_escape(title)}</h1>\n{''.join(sections)}"
        f'<p class="note">{_escape(t("rapor.dipnot"))}</p></body></html>\n'
    )


def write_report(
    path: Path,
    title: str,
    summary: Sequence[tuple[str, Any]],
    logs: Sequence[dict[str, Any]],
    samples: Sequence[dict[str, Any]],
    notes: Sequence[str],
) -> Path:
    """Raporu dosyaya yazar ve yolunu döndürür."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(build_report(title, summary, logs, samples, notes), encoding="utf-8")
    return path
