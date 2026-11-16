#!/usr/bin/env python3
"""Bilgi notlarını doğrular ve dizinini üretir. Yalnız Python standart kütüphanesi kullanır.

Ne denetler (her `*.md` notu için; biçim kuralları: ../BICIM.md):
  1. Ön bilgi (front matter): baslik, ozet, etiketler, duzey, guncellik alanları var ve geçerli mi.
  2. Yapı: tek bir `#` başlığı var ve `baslik` ile aynı mı; zorunlu bölümler var mı; uzunluk sınırlar içinde mi.
  3. Bağlantılar: göreli bağlantıların gösterdiği dosyalar var mı.
  4. Kod: `calistir` işaretli kod blokları gerçekten çalışıyor mu (ve varsa `cikti` bloğuyla aynı çıktıyı veriyor mu).

Kullanım:
  python araclar/dogrula.py                 # bütün notlar
  python araclar/dogrula.py 10-diller       # yalnız bir küme ya da dosya
  python araclar/dogrula.py --kod-yok       # kodları çalıştırmadan (hızlı)
  python araclar/dogrula.py --indeks        # doğrula + INDEX.md ve indeks.json dosyalarını yeniden üret

Genişletme: yeni bir çalıştırılabilir dil eklemek için RUNNERS sözlüğüne bir satır ve gerekirse bir işlev ekleyin.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEVELS = {"temel", "orta", "ileri"}
REQUIRED_FIELDS = ("baslik", "ozet", "etiketler", "duzey", "guncellik")
REQUIRED_SECTIONS = ("Tuzaklar", "Denetim listesi", "Küçük modele yaptırırken")
MIN_LINES, MAX_LINES = 60, 520
SKIP_FILES = {"README.md", "BICIM.md", "INDEX.md", "AGENTS.md"}
SKIP_DIRS = {"araclar", "node_modules", ".venv", "__pycache__"}
TIMEOUT_S = 30

FENCE_RE = re.compile(r"^(?P<indent> {0,3})(?P<fence>`{3,})(?P<info>[^`]*)$")
LINK_RE = re.compile(r"(?<!\!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
GUNCELLIK_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
TAG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


@dataclass
class CodeBlock:
    lang: str
    flags: list[str]
    code: str
    line: int


@dataclass
class Note:
    path: Path
    meta: dict[str, object] = field(default_factory=dict)
    body_lines: list[str] = field(default_factory=list)
    blocks: list[CodeBlock] = field(default_factory=list)
    headings: list[tuple[int, str, int]] = field(default_factory=list)  # (düzey, metin, satır)
    body_start: int = 0  # gövdenin dosyadaki ilk satırının sıfır tabanlı dizini

    @property
    def rel(self) -> str:
        return self.path.relative_to(ROOT).as_posix()


def unquote(value: str) -> str:
    """Değer iki ucundan aynı tırnakla sarılıysa tırnakları kaldırır; içerikteki tırnaklara dokunmaz."""
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1]
    return value


def parse_front_matter(lines: list[str]) -> tuple[dict[str, object], int]:
    """Basit YAML alt kümesi: `anahtar: değer` ve `anahtar: [a, b]`. Bitiş satırının dizinini de döndürür."""
    if not lines or lines[0].strip() != "---":
        raise ValueError("ön bilgi yok: dosya `---` satırıyla başlamalı")
    meta: dict[str, object] = {}
    for index in range(1, len(lines)):
        line = lines[index].rstrip()
        if line.strip() == "---":
            return meta, index + 1
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"ön bilgi satırı anlaşılmadı ({index + 1}. satır): {line!r}")
        key, _, raw = line.partition(":")
        value = raw.split(" #", 1)[0].strip()
        if value.startswith("[") and value.endswith("]"):
            meta[key.strip()] = [unquote(item.strip()) for item in value[1:-1].split(",") if item.strip()]
        else:
            meta[key.strip()] = unquote(value)
    raise ValueError("ön bilgi kapanmamış: ikinci `---` satırı yok")


def parse_note(path: Path) -> Note:
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    note = Note(path=path)
    note.meta, start = parse_front_matter(lines)
    note.body_lines = lines[start:]
    note.body_start = start
    fence: str | None = None
    info = ""
    buffer: list[str] = []
    block_line = 0
    for offset, line in enumerate(note.body_lines):
        number = start + offset + 1
        match = FENCE_RE.match(line)
        if fence is None:
            if match:
                fence, info, buffer, block_line = match.group("fence"), match.group("info").strip(), [], number
            else:
                heading = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
                if heading:
                    note.headings.append((len(heading.group(1)), heading.group(2), number))
        elif match and match.group("fence").startswith(fence) and not match.group("info").strip():
            parts = info.split()
            note.blocks.append(CodeBlock(parts[0] if parts else "", parts[1:], "\n".join(buffer), block_line))
            fence = None
        else:
            buffer.append(line)
    if fence is not None:
        raise ValueError(f"kapanmamış kod bloğu ({block_line}. satır)")
    return note


def check_meta(note: Note) -> list[str]:
    errors = [f"ön bilgide `{name}` alanı eksik" for name in REQUIRED_FIELDS if not note.meta.get(name)]
    if errors:
        return errors
    if note.meta["duzey"] not in LEVELS:
        errors.append(f"`duzey` şunlardan biri olmalı: {', '.join(sorted(LEVELS))}")
    if not GUNCELLIK_RE.match(str(note.meta["guncellik"])):
        errors.append("`guncellik` YYYY-AA biçiminde olmalı (ör. 2026-11)")
    tags = note.meta["etiketler"]
    if not isinstance(tags, list) or not 2 <= len(tags) <= 8:
        errors.append("`etiketler` 2–8 öğeli bir liste olmalı: [react, durum]")
    elif any(not TAG_RE.match(tag) for tag in tags):
        errors.append("etiketler küçük harf, rakam ve tire içerebilir (Türkçe harf yok): [veri-tabani, sql]")
    summary = str(note.meta["ozet"])
    if not 30 <= len(summary) <= 220:
        errors.append(f"`ozet` 30–220 karakter olmalı (şimdi {len(summary)})")
    return errors


def check_structure(note: Note) -> list[str]:
    errors: list[str] = []
    h1 = [text for level, text, _ in note.headings if level == 1]
    if len(h1) != 1:
        errors.append(f"tam bir tane `# başlık` olmalı (şimdi {len(h1)})")
    elif h1[0] != note.meta.get("baslik"):
        errors.append(f"`# {h1[0]}` başlığı ön bilgideki `baslik` ile aynı olmalı")
    h2 = [text for level, text, _ in note.headings if level == 2]
    for required in REQUIRED_SECTIONS:
        if required not in h2:
            errors.append(f"zorunlu bölüm eksik: `## {required}`")
    total = len(note.body_lines)
    if not MIN_LINES <= total <= MAX_LINES:
        errors.append(f"not {MIN_LINES}–{MAX_LINES} satır olmalı (şimdi {total}); uzunsa iki nota bölün")
    return errors


def check_links(note: Note) -> list[str]:
    errors: list[str] = []
    in_fence = False
    for offset, line in enumerate(note.body_lines):
        if FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for target in LINK_RE.findall(re.sub(r"`[^`]*`", "", line)):
            if re.match(r"^[a-z][a-z0-9+.-]*:", target) or target.startswith("#"):
                continue
            file_part = target.split("#", 1)[0]
            resolved = (note.path.parent / file_part).resolve()
            if not resolved.exists():
                errors.append(f"kırık bağlantı: {target}")
    return errors


ZWJ = chr(0x200D)  # emoji dizilerini birleştirir; düz yazıda görünür bir emoji parçasıdır


def check_invisible(note: Note) -> list[str]:
    """Kod bloklarında görünmez/birleşen karakter yasak (kaçış dizisi yazılır); düz yazıda BOM, sıfır genişlikli
    boşluk ve yön denetimi gibi biçim karakterleri yasak (`U+FEFF` diye yazılır)."""
    errors: list[str] = []
    in_fence = False
    for offset, line in enumerate(note.body_lines):
        if FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        number = note.body_start + offset + 1
        for ch in line:
            category = unicodedata.category(ch)
            invisible = category in ("Cf", "Zl", "Zp") or (category == "Zs" and ch != " ")
            invisible = invisible or (category == "Cc" and ch != "\t")
            combining = category == "Mn" and 0x0300 <= ord(ch) <= 0x036F
            if in_fence and (invisible or combining):
                errors.append(
                    f"{number}. satır: kod bloğunda görünmez karakter U+{ord(ch):04X}; "
                    f"yerine kaçış dizisi yazın: \\u{ord(ch):04x}"
                )
                break
            if not in_fence and category == "Cf" and ch != ZWJ:
                errors.append(f"{number}. satır: metinde görünmez karakter U+{ord(ch):04X}; `U+{ord(ch):04X}` diye yazın")
                break
    return errors


def run_process(command: list[str], cwd: Path) -> tuple[int, str]:
    try:
        done = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=TIMEOUT_S, check=False)
    except subprocess.TimeoutExpired:
        return 124, f"{TIMEOUT_S} saniyede bitmedi"
    return done.returncode, (done.stdout + done.stderr).strip()


def run_sql(code: str) -> tuple[int, str]:
    """SQL bloğunu bellek içi SQLite'ta çalıştırır; SELECT sonuçlarını `a|b` satırları olarak döndürür."""
    connection = sqlite3.connect(":memory:")
    output: list[str] = []
    statement = ""
    try:
        for line in code.split("\n"):
            statement += line + "\n"
            if sqlite3.complete_statement(statement):
                cursor = connection.execute(statement)
                if cursor.description:
                    output.extend("|".join("" if v is None else str(v) for v in row) for row in cursor.fetchall())
                statement = ""
        if statement.strip():
            return 1, "SQL ifadesi `;` ile bitmiyor"
    except sqlite3.Error as error:
        return 1, f"SQL hatası: {error}"
    finally:
        connection.close()
    return 0, "\n".join(output)


RUNNERS: dict[str, tuple[str, list[str]]] = {
    "python": ("ornek.py", [sys.executable, "-I"]),
    "py": ("ornek.py", [sys.executable, "-I"]),
    "js": ("ornek.mjs", ["node"]),
    "javascript": ("ornek.mjs", ["node"]),
    "ts": ("ornek.ts", ["node"]),
    "typescript": ("ornek.ts", ["node"]),
    "bash": ("ornek.sh", ["bash", "-eu"]),
    "sh": ("ornek.sh", ["bash", "-eu"]),
}


def check_code(note: Note) -> list[str]:
    errors: list[str] = []
    for index, block in enumerate(note.blocks):
        if "calistir" not in block.flags:
            continue
        where = f"{block.line}. satırdaki `{block.lang} calistir` bloğu"
        if block.lang == "sql":
            code, output = run_sql(block.code)
        elif block.lang in RUNNERS:
            filename, command = RUNNERS[block.lang]
            if shutil.which(command[0]) is None:
                errors.append(f"{where}: `{command[0]}` bulunamadı; çalıştırılamadı")
                continue
            with tempfile.TemporaryDirectory(prefix="bilgi-") as directory:
                (Path(directory) / filename).write_text(block.code + "\n", encoding="utf-8")
                code, output = run_process([*command, filename], Path(directory))
        else:
            errors.append(f"{where}: `{block.lang}` dili çalıştırılamıyor (desteklenenler: sql, {', '.join(RUNNERS)})")
            continue
        if code != 0:
            tail = "\n      ".join(output.split("\n")[-6:])
            errors.append(f"{where} hata verdi (çıkış {code}):\n      {tail}")
            continue
        following = note.blocks[index + 1] if index + 1 < len(note.blocks) else None
        if following and following.lang == "cikti":
            expected = "\n".join(line.rstrip() for line in following.code.strip().split("\n"))
            actual = "\n".join(line.rstrip() for line in output.strip().split("\n"))
            if expected != actual:
                errors.append(f"{where}: çıktı `cikti` bloğuyla aynı değil.\n      beklenen: {expected!r}\n      gerçek:   {actual!r}")
    return errors


def find_notes(targets: list[str]) -> list[Path]:
    roots = [ROOT / target for target in targets] if targets else [ROOT]
    notes: list[Path] = []
    for root in roots:
        if not root.exists():
            raise SystemExit(f"Bulunamadı: {root}")
        candidates = [root] if root.is_file() else sorted(root.rglob("*.md"))
        for path in candidates:
            parts = set(path.relative_to(ROOT).parts)
            if path.name in SKIP_FILES or parts & SKIP_DIRS:
                continue
            notes.append(path)
    return notes


def write_index(notes: list[Note]) -> None:
    groups: dict[str, list[Note]] = {}
    for note in notes:
        groups.setdefault(note.path.relative_to(ROOT).parts[0], []).append(note)
    lines = ["# Bilgi dizini", "", "Bu dosya `python araclar/dogrula.py --indeks` ile üretilir; elle düzenlemeyin.", ""]
    lines.append(f"Toplam **{len(notes)}** not, **{len(groups)}** küme.")
    for group in sorted(groups):
        lines += ["", f"## {group}", "", "| Not | Düzey | Özet |", "| --- | --- | --- |"]
        for note in sorted(groups[group], key=lambda item: item.path.name):
            summary = str(note.meta["ozet"]).replace("|", "\\|")
            lines.append(f"| [{note.meta['baslik']}]({note.rel}) | {note.meta['duzey']} | {summary} |")
    (ROOT / "INDEX.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    entries = [
        {
            "dosya": note.rel,
            "kume": note.path.relative_to(ROOT).parts[0],
            "baslik": note.meta["baslik"],
            "ozet": note.meta["ozet"],
            "etiketler": note.meta["etiketler"],
            "duzey": note.meta["duzey"],
            "guncellik": note.meta["guncellik"],
            "bolumler": [text for level, text, _ in note.headings if level == 2],
        }
        for note in sorted(notes, key=lambda item: item.rel)
    ]
    (ROOT / "indeks.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Bilgi notlarını doğrular.")
    parser.add_argument("hedef", nargs="*", help="küme klasörü ya da dosya (bilgi/ köküne göre); boşsa hepsi")
    parser.add_argument("--kod-yok", action="store_true", help="kod bloklarını çalıştırma")
    parser.add_argument("--indeks", action="store_true", help="INDEX.md ve indeks.json dosyalarını yeniden üret")
    args = parser.parse_args()

    notes: list[Note] = []
    failed = 0
    ran = 0
    for path in find_notes(args.hedef):
        try:
            note = parse_note(path)
            errors = check_meta(note)
            errors += check_structure(note) + check_links(note) + check_invisible(note)
            if not args.kod_yok:
                errors += check_code(note)
                ran += sum(1 for block in note.blocks if "calistir" in block.flags)
        except (ValueError, UnicodeDecodeError) as error:
            note, errors = Note(path=path), [str(error)]
        if errors:
            failed += 1
            print(f"✗ {path.relative_to(ROOT).as_posix()}")
            for error in errors:
                print(f"    - {error}")
        else:
            notes.append(note)
    total = len(notes) + failed
    print(f"\n{total} not denetlendi: {len(notes)} geçti, {failed} kaldı; {ran} kod bloğu çalıştırıldı.")
    if args.indeks:
        if failed or args.hedef:
            print("Dizin üretilmedi: önce bütün notlar (hedefsiz çalıştırmada) geçmeli.")
            return 1
        write_index(notes)
        print("INDEX.md ve indeks.json güncellendi.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
