"""`rapor`: sonuç dosyalarından modelleri karşılaştıran Markdown tablo üretir.

Bölümler: (1) özet — model başına deneme, geçme oranı, geçersiz sayısı, zorluğa göre başarı, süre;
(2) görev × model tablosu — her deneme bir işaret (✓ geçti, ✗ kaldı, ⚠ geçersiz);
(3) kalan ve geçersiz denemelerin nedeni; (4) adil karşılaştırma uyarıları (eksik deneme, farklı istem…).
Genişletme: yeni bir sütun için `_summary_row`'a hesap, başlık satırına ad ekleyin.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from exam.tasks import TUR_ADLARI, ZORLUKLAR, Task

MARK = {"gecti": "✓", "kaldi": "✗", "gecersiz": "⚠"}
Entry = dict[str, Any]


def _pct(part: int, whole: int) -> str:
    return f"{part}/{whole} (%{round(100 * part / whole)})" if whole else "—"


def _summary_row(label: str, entries: Sequence[Entry]) -> str:
    by_task: dict[str, list[Entry]] = defaultdict(list)
    for entry in entries:
        by_task[str(entry["gorev"])].append(entry)
    passed = sum(1 for e in entries if e["sonuc"] == "gecti")
    invalid = sum(1 for e in entries if e["sonuc"] == "gecersiz")
    any_pass = sum(1 for items in by_task.values() if any(e["sonuc"] == "gecti" for e in items))
    all_pass = sum(1 for items in by_task.values() if all(e["sonuc"] == "gecti" for e in items))
    per_level = []
    for level in ZORLUKLAR:
        items = [e for e in entries if e.get("zorluk") == level]
        ok = sum(1 for e in items if e["sonuc"] == "gecti")
        per_level.append(f"{ok}/{len(items)}" if items else "—")
    minutes = [float(e.get("sure_dk") or 0) for e in entries]
    lines = [
        int(e.get("degisiklik", {}).get("eklenen_satir", 0))
        + int(e.get("degisiklik", {}).get("silinen_satir", 0))
        for e in entries
        if e["sonuc"] == "gecti"
    ]
    return (
        f"| `{label}` | {len(entries)} | {_pct(passed, len(entries))} | {invalid} | "
        f"{any_pass}/{len(by_task)} | {all_pass}/{len(by_task)} | {' · '.join(per_level)} | "
        f"{statistics.median(minutes):.0f} | {round(statistics.mean(lines)) if lines else '—'} |"
    )


def _warnings(by_label: dict[str, list[Entry]], tasks: Sequence[Task]) -> list[str]:
    notes = []
    task_ids = {task.id for task in tasks}
    for label, entries in by_label.items():
        counts: dict[str, int] = defaultdict(int)
        for entry in entries:
            counts[str(entry["gorev"])] += 1
        missing = sorted(task_ids - set(counts))
        single = sorted(task for task, count in counts.items() if count < 2)
        if missing:
            notes.append(
                f"`{label}`: {len(missing)} görev hiç denenmemiş ({', '.join(missing[:6])}…)."
            )
        if single:
            notes.append(
                f"`{label}`: {len(single)} görevde 2'den az deneme var; tek deneme şansa açıktır."
            )
    prompts = {e.get("istem_ozeti") for items in by_label.values() for e in items}
    if len(prompts) > 1:
        notes.append("Sonuçlar farklı başlangıç istemleriyle (ISTEMLER.md §1 sürümleri) alınmış.")
    versions: dict[str, set[str]] = defaultdict(set)
    for items in by_label.values():
        for entry in items:
            versions[str(entry["gorev"])].add(str(entry.get("gorev_ozeti")))
    changed = sorted(task for task, digests in versions.items() if len(digests) > 1)
    if changed:
        notes.append(f"Şu görevler farklı sürümleriyle sınanmış: {', '.join(changed)}.")
    return notes


def _failure_lines(label: str, entries: Sequence[Entry]) -> list[str]:
    lines = []
    for entry in entries:
        if entry["sonuc"] == "gecti":
            continue
        if entry["sonuc"] == "gecersiz":
            reasons = "; ".join(
                f"{v['dosya']}: {v['neden']}" for v in entry.get("ihlaller", [])[:2]
            )
            lines.append(
                f"- `{label}` · {entry['gorev']} #{entry['deneme']} — ⚠ geçersiz: {reasons}"
            )
        else:
            failed = ", ".join(str(name) for name in entry.get("kalan", [])[:3])
            lines.append(f"- `{label}` · {entry['gorev']} #{entry['deneme']} — ✗ kalan: {failed}")
    return lines


def build_report(entries: Sequence[Entry], tasks: Sequence[Task], now: datetime) -> str:
    by_label: dict[str, list[Entry]] = defaultdict(list)
    for entry in sorted(
        entries, key=lambda e: (str(e["etiket"]), str(e["gorev"]), int(e["deneme"]))
    ):
        by_label[str(entry["etiket"])].append(entry)
    out = [f"# Sınav raporu — {now:%Y-%m-%d %H:%M}", ""]
    if not by_label:
        out.append(
            "Henüz sonuç yok. Önce `python havuz/sinav/sinav.py puanla <klasör> --etiket <model>`."
        )
        return "\n".join(out) + "\n"
    out += [
        "## Özet",
        "",
        "| Model | Deneme | Geçen deneme | Geçersiz | En az bir kez geçen görev | Her denemede geçen görev "
        "| Kolay · Orta · Zor | Süre (dk, ortanca) | Değişen satır (geçenlerde, ort.) |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |",
    ]
    out += [_summary_row(label, items) for label, items in by_label.items()]
    labels = list(by_label)
    known = {task.id: task for task in tasks}
    task_ids = sorted(
        {str(e["gorev"]) for e in entries} | set(known),
        key=lambda t: (ZORLUKLAR.index(known[t].difficulty) if t in known else 9, t),
    )
    out += [
        "",
        "## Görev × model",
        "",
        "✓ geçti · ✗ kaldı · ⚠ geçersiz (hile denetimi) · boş: denenmedi",
        "",
    ]
    out.append("| Görev | Temel | Tür | Zorluk | " + " | ".join(f"`{x}`" for x in labels) + " |")
    out.append("| --- | --- | --- | --- | " + " | ".join("---" for _ in labels) + " |")
    for task_id in task_ids:
        task = known.get(task_id)
        cells = []
        for label in labels:
            marks = [
                MARK.get(str(e["sonuc"]), "?") for e in by_label[label] if e["gorev"] == task_id
            ]
            cells.append("".join(marks))
        meta = (
            f"{task.foundation} | {TUR_ADLARI[task.kind]} | {task.difficulty}"
            if task
            else "? | ? | ?"
        )
        out.append(f"| {task_id} | {meta} | " + " | ".join(cells) + " |")
    failures = [line for label, items in by_label.items() for line in _failure_lines(label, items)]
    if failures:
        out += ["", "## Kalan ve geçersiz denemeler", "", *failures]
    warned = [
        f"- `{label}` · {e['gorev']} #{e['deneme']} — "
        + "; ".join(f"{w['dosya']}: {w['ayrinti'][:60]}" for w in e.get("uyarilar", [])[:2])
        for label, items in by_label.items()
        for e in items
        if e.get("uyarilar")
    ]
    if warned:
        out += ["", "## Susturma uyarıları (noqa, type: ignore, # tr-ok…)", "", *warned]
    notes = _warnings(by_label, tasks)
    if notes:
        out += ["", "## Adil karşılaştırma uyarıları", "", *(f"- {note}" for note in notes)]
    out += [
        "",
        'Okuma: "Her denemede geçen görev" kararlılığı, "en az bir kez geçen" tavanı gösterir. '
        "Geçersiz deneme, test ya da denetim gevşetilmiş demektir; o modelle çalışırken testleri koruyun.",
    ]
    return "\n".join(out) + "\n"
