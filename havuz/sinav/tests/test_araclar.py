"""Yardımcı modüllerin testleri: komut çalıştırma (süre sınırı), başlangıç istemi, düzenleme yardımcıları,
gorev.toml doğrulaması.
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from exam.edit import EditError, insert_before, remove_between, replace
from exam.prompt import PromptError, start_prompt, task_file
from exam.runner import run
from exam.tasks import TaskError, load_task


def test_sure_siniri_surec_grubunu_durdurur(tmp_path: Path) -> None:
    started = time.monotonic()
    result = run("sleep 30 & sleep 30", tmp_path, tmp_path / "log.txt", timeout_s=1)
    assert result.timed_out
    assert not result.ok
    assert time.monotonic() - started < 15
    assert "SÜRE SINIRI" in result.tail()


def test_komut_ciktisi_gunluge_yazilir(tmp_path: Path) -> None:
    result = run(["python3", "-c", "print('merhaba')"], tmp_path, tmp_path / "a" / "log.txt")
    assert result.ok
    assert "merhaba" in result.tail()


def test_baslangic_istemi_istemler_dosyasindan() -> None:
    prompt = start_prompt("uygulama", "cd uygulama && npm run check")
    assert prompt.startswith("Bu depoda uygulama içinde çalışacaksın.")
    assert "uygulama/AGENTS.md" in prompt
    assert "cd uygulama && npm run check" in prompt
    text = task_file("Başlık", prompt, "Görev metni.", "/tmp/k", "kimlik")
    assert text.count("````text") == 2


def test_istem_bicimi_bozuksa_acik_hata(tmp_path: Path) -> None:
    broken = tmp_path / "ISTEMLER.md"
    broken.write_text("# Başka\n\n## 1. Oturum\n\nmetin yok\n", encoding="utf-8")
    with pytest.raises(PromptError, match="text bloğu"):
        start_prompt("x", "y", broken)
    broken.write_text("## 1. Oturum\n\n```text\nBu <bilinmeyen yer> var.\n```\n", encoding="utf-8")
    with pytest.raises(PromptError, match="yer tutucu"):
        start_prompt("x", "y", broken)


def test_duzenleme_yardimcilari_tam_eslesme_ister(tmp_path: Path) -> None:
    path = tmp_path / "a.txt"
    path.write_text("bir\niki\niki\nüç\n", encoding="utf-8")
    with pytest.raises(EditError, match="2 kez bulundu"):
        replace(path, "iki", "IKI")
    replace(path, "iki", "İKİ", count=2)
    insert_before(path, "üç\n", "ara\n")
    with pytest.raises(EditError, match="tek değil"):
        remove_between(path, "İKİ\n", "ara")
    removed = remove_between(path, "bir\n", "ara")
    assert removed == "bir\nİKİ\nİKİ\n"
    assert path.read_text(encoding="utf-8") == "ara\nüç\n"
    with pytest.raises(EditError):
        replace(tmp_path / "yok.txt", "a", "b")


def _task_dir(tmp_path: Path, toml: str) -> Path:
    folder = tmp_path / "ornek-gorev"
    (folder / "gizli").mkdir(parents=True)
    (folder / "gizli" / "t.py").write_text("x = 1\n", encoding="utf-8")
    for name in ("GOREV.md", "hazirla.py", "cozum.py"):
        (folder / name).write_text("x\n", encoding="utf-8")
    (folder / "gorev.toml").write_text(toml, encoding="utf-8")
    return folder


BASE = """kimlik = "ornek-gorev"
baslik = "B"
temel = "veri"
zorluk = "kolay"
tur = "hata"
tahmini_sure_dk = 5
aciklama = "a"
"""
HIDDEN = '[[gizli]]\nad = "t"\nkomut = "python -m pytest x"\ndosyalar = { "t.py" = "tests/test_sinav_x.py" }\n'


def test_gorev_tanimi_dogrulanir(tmp_path: Path) -> None:
    task = load_task(_task_dir(tmp_path, BASE + HIDDEN))
    assert task.hidden[0].files == {"t.py": "tests/test_sinav_x.py"}
    for bad, message in (
        (BASE + "fazla = 1\n" + HIDDEN, "bilinmeyen"),
        (BASE.replace('"kolay"', '"cok-zor"') + HIDDEN, "zorluk"),
        (BASE, "en az bir"),
        (BASE + HIDDEN.replace("test_sinav_x", "test_x"), "sinav"),
        (BASE.replace('"ornek-gorev"', '"baska"') + HIDDEN, "klasör adıyla"),
    ):
        with pytest.raises(TaskError, match=message):
            load_task(_task_dir(tmp_path / message, bad))
