"""Eğitim günlüğünden (gunluk.jsonl) bağımlılıksız HTML rapor: kayıp eğrisi, hız, örnekler.

Grafik satır içi SVG'dir; dosya internetsiz açılır. Metinler `web/tr.json` sözlüğünden gelir,
model çıktıları HTML'e kaçışlanarak yazılır. Komut: `python -m dil_modeli rapor --egitim <klasör>`.

Genişletme: Yeni bir eğri için `_chart` çağrısına bir seri ekleyin (ör. öğrenme oranı).
"""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

from .train_state import read_log

WORDS = Path(__file__).parent / "web" / "tr.json"
COLORS = ("#2563eb", "#dc2626")
Series = tuple[str, list[tuple[float, float]]]


def _scale(value: float, low: float, high: float, size: float) -> float:
    return 0.0 if high == low else (value - low) / (high - low) * size


def _text(x: float, y: float, value: str, anchor: str = "middle", size: int = 11) -> str:
    position = f'x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" font-size="{size}"'
    return f"<text {position}>{html.escape(value)}</text>"


def _chart(series: list[Series], width: int = 720, height: int = 300, label_x: str = "") -> str:
    """Basit çizgi grafiği (SVG): eksen etiketleri, kılavuz çizgileri, her seri bir çizgi."""
    points = [p for _, data in series for p in data]
    if not points:
        return ""
    x_low, x_high = min(p[0] for p in points), max(p[0] for p in points)
    y_low, y_high = min(p[1] for p in points), max(p[1] for p in points)
    pad = 48
    inner_w, inner_h = width - 2 * pad, height - 2 * pad

    def at(x: float, y: float) -> tuple[float, float]:
        return pad + _scale(x, x_low, x_high, inner_w), height - pad - _scale(
            y, y_low, y_high, inner_h
        )

    parts = [f'<svg viewBox="0 0 {width} {height}" role="img" width="100%">']
    for i in range(5):  # kılavuz çizgileri ve eksen etiketleri
        y_value = y_low + (y_high - y_low) * i / 4
        x_value = x_low + (x_high - x_low) * i / 4
        _, y = at(x_low, y_value)
        x, _ = at(x_value, y_low)
        parts.append(
            f'<line x1="{pad}" x2="{width - pad}" y1="{y:.1f}" y2="{y:.1f}" stroke="#8884"/>'
        )
        label = f"{y_value:.0f}" if y_high - y_low > 100 else f"{y_value:.2f}"
        parts.append(_text(pad - 6, y + 4, label, anchor="end"))
        parts.append(_text(x, height - pad + 16, f"{x_value:.0f}"))
    parts.append(_text(width / 2, height - 8, label_x, size=12))
    for index, (name, data) in enumerate(series):
        color = COLORS[index % len(COLORS)]
        coords = " ".join("{:.1f},{:.1f}".format(*at(x, y)) for x, y in data)
        parts.append(f'<polyline fill="none" stroke="{color}" stroke-width="2" points="{coords}"/>')
        legend = f'x="{pad + 8}" y="{pad - 20 + 16 * index}" fill="{color}" font-size="12"'
        parts.append(f"<text {legend}>— {html.escape(name)}</text>")
    parts.append("</svg>")
    return "".join(parts)


def build_report(run_dir: str | Path) -> str:
    """Eğitim klasöründen rapor HTML'i üretir."""
    words: dict[str, str] = json.loads(WORDS.read_text(encoding="utf-8"))
    rows = read_log(run_dir)
    train = [(row["step"], row["loss"]) for row in rows if "loss" in row]
    val = [(row["step"], row["val_loss"]) for row in rows if "val_loss" in row]
    speed = [(row["step"], row["tokens_per_sec"]) for row in rows if "tokens_per_sec" in row]
    samples = [(row["step"], row["sample"]) for row in rows if "sample" in row]
    elapsed = [row["elapsed_sec"] for row in rows if "elapsed_sec" in row]
    summary: dict[str, Any] = {
        words["rapor_son_adim"]: train[-1][0] if train else 0,
        words["rapor_en_iyi"]: f"{min(v for _, v in val):.4f}" if val else "-",
        words["rapor_sure"]: f"{elapsed[-1] / 60:.1f}" if elapsed else "-",
    }
    summary_rows = "".join(
        f"<tr><th>{html.escape(str(k))}</th><td>{html.escape(str(v))}</td></tr>"
        for k, v in summary.items()
    )
    sample_rows = "".join(
        f"<tr><th>{step}</th><td><pre>{html.escape(text)}</pre></td></tr>" for step, text in samples
    )
    curves = _chart(
        [(words["rapor_egitim"], train), (words["rapor_dogrulama"], val)],
        label_x=words["rapor_adim"],
    )
    speeds = _chart([(words["rapor_hiz"], speed)], height=200, label_x=words["rapor_adim"])
    return f"""<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(words["rapor_baslik"])}</title>
<style>body{{font:15px/1.5 system-ui,sans-serif;max-width:52rem;margin:0 auto;padding:1rem}}
th{{text-align:left;padding-right:1rem;vertical-align:top}}pre{{white-space:pre-wrap;margin:0}}</style></head>
<body><h1>{html.escape(words["rapor_baslik"])}</h1>
<h2>{html.escape(words["rapor_ozet"])}</h2><table>{summary_rows}</table>
<h2>{html.escape(words["rapor_kayip"])}</h2>{curves}<p>{html.escape(words["rapor_okuma"])}</p>
<h2>{html.escape(words["rapor_hiz"])}</h2>{speeds}
<h2>{html.escape(words["rapor_ornekler"])}</h2><table>{sample_rows}</table>
</body></html>
"""
