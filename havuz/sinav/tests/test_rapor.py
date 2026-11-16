"""Rapor (exam/report.py) ve sonuç dosyası (exam/results.py) testleri: elle kurulmuş sonuç kayıtlarıyla."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from exam import results
from exam.report import build_report
from exam.tasks import all_tasks


def _entry(label: str, task: str, attempt: int, verdict: str, **extra: Any) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "etiket": label,
        "gorev": task,
        "deneme": attempt,
        "sonuc": verdict,
        "zorluk": "kolay",
        "kalan": ["gizli:x"] if verdict == "kaldi" else [],
        "ihlaller": [{"dosya": "tests/a.py", "neden": "korunan dosya silindi", "ayrinti": ""}]
        if verdict == "gecersiz"
        else [],
        "sure_dk": 10.0,
        "degisiklik": {"eklenen_satir": 5, "silinen_satir": 1},
        "istem_ozeti": "abc",
        "gorev_ozeti": "g1",
    }
    entry.update(extra)
    return entry


def test_bos_rapor() -> None:
    assert "Henüz sonuç yok" in build_report([], [], datetime(2026, 11, 16))


def test_ozet_matris_ve_nedenler() -> None:
    tasks = all_tasks()
    first, second = tasks[0].id, tasks[1].id
    entries = [
        _entry("model-a", first, 1, "gecti"),
        _entry("model-a", first, 2, "kaldi"),
        _entry("model-a", second, 1, "gecersiz"),
        _entry(
            "model-b",
            first,
            1,
            "gecti",
            istem_ozeti="baska",
            uyarilar=[{"dosya": "x.py", "neden": "susturma", "ayrinti": "a.upper()  # tr-ok"}],
        ),
    ]
    text = build_report(entries, tasks, datetime(2026, 11, 16, 12, 0))
    assert "| `model-a` | 3 | 1/3 (%33) | 1 | 1/2 | 0/2 |" in text
    assert f"| {first} |" in text
    assert "✓✗" in text
    assert "⚠" in text
    assert "korunan dosya silindi" in text
    assert "farklı başlangıç istemleriyle" in text
    assert "2'den az deneme" in text
    assert "hiç denenmemiş" in text
    assert "# tr-ok" in text


def test_etiket_dosya_adi_ve_deneme_sirasi() -> None:
    assert results.label_file("qwen2.5:7b + aider").name == "qwen2.5-7b-aider.jsonl"
    assert results.next_attempt("m", "g") == 1
    results.append({"etiket": "m", "gorev": "g", "deneme": 1, "sonuc": "gecti"})
    results.append({"etiket": "m", "gorev": "g", "deneme": 2, "sonuc": "kaldi"})
    assert results.next_attempt("m", "g") == 3
    assert [e["deneme"] for e in results.all_entries()] == [1, 2]
