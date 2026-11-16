"""docs/DIZIN.md üreteci: her modülün başlık yorumunu okuyup tek bir dizin tablosu yazar.

Kullanım (temel klasöründen):
    python scripts/build_index.py            docs/DIZIN.md dosyasını yeniden yazar
    python scripts/build_index.py --denetle  dosya güncel değilse çıkış kodu 1 (yazmaz)

Modüller içe aktarılmaz; başlıklar `ast` ile okunur (hızlı ve yan etkisiz). Başlık biçimi
AGENTS.md'deki "Modül başlığı" bölümünde anlatılır; kural testi (tests/test_kurallar.py) aynı
ayrıştırıcıyı kullanır.
Genişletme: yeni bir konu klasörü eklerseniz `TOPICS` sözlüğüne başlığını yazın.
"""

from __future__ import annotations

import argparse
import ast
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "algoritma"
INDEX_PATH = ROOT / "docs" / "DIZIN.md"

# Konu klasörü → dizindeki başlık. YENİ KONU BURAYA (sıra, dizindeki sıradır).
TOPICS: dict[str, str] = {
    "veri_yapilari": "Veri yapıları",
    "siralama": "Sıralama ve arama",
    "graf": "Graf",
    "dp": "Dinamik programlama",
    "dizgi": "Dizgi (metin)",
    "sayilar": "Sayılar ve cebir",
    "rastgele": "Rastgelelik ve örnekleme",
    "geometri": "Geometri",
    "eniyileme": "Arama ve en iyileme",
    "kodlama": "Sıkıştırma ve kodlama",
    "cesitli": "Çeşitli",
    "kaliplar": "Problem çözme kalıpları",
}

# Her modül başlığında bulunması zorunlu alanlar (satır başında, iki nokta ile biter).
REQUIRED_FIELDS: tuple[str, ...] = (
    "Fikir",
    "Karmaşıklık",
    "Ne zaman",
    "Ne zaman değil",
    "Bağımlılık",
    "Genişletme",
    "Örnek",
)


@dataclass(frozen=True)
class ModuleInfo:
    """Bir modülün dizine giren bilgileri."""

    topic: str
    name: str  # dosya adı (uzantısız)
    path: Path
    title: str  # başlığın ilk satırında ":" öncesi
    summary: str  # ilk satırda ":" sonrası
    fields: dict[str, str]  # alan adı → tek satıra indirgenmiş değer
    public_names: tuple[str, ...]
    line_count: int

    @property
    def dotted(self) -> str:
        return f"algoritma.{self.topic}.{self.name}"

    @property
    def relative(self) -> str:
        return f"algoritma/{self.topic}/{self.name}.py"


def parse_header(docstring: str) -> tuple[str, str, dict[str, str]]:
    """Başlık yorumunu (ad, özet, alanlar) olarak ayrıştırır.

    Alan, satır başında `Alan adı:` ile başlar; değeri aynı satırda ve/veya izleyen girintili
    satırlardadır. Çok satırlı değerler tek satıra indirgenir.
    """
    lines = docstring.strip().splitlines()
    first = lines[0].strip() if lines else ""
    title, _, summary = first.partition(": ")
    fields: dict[str, list[str]] = {}
    current: str | None = None
    for raw in lines[1:]:
        stripped = raw.strip()
        head, sep, rest = raw.partition(":")
        if sep and head in (*REQUIRED_FIELDS, "Kararlılık", "Özyineleme"):
            current = head
            fields[current] = [rest.strip()] if rest.strip() else []
        elif current is not None and stripped and raw.startswith(" "):
            fields[current].append(stripped)
        elif current is not None and stripped and not raw.startswith(" "):
            current = None
    joined = {key: " ".join(parts).strip() for key, parts in fields.items()}
    return title.strip(), summary.strip().rstrip("."), joined


def public_names_of(tree: ast.Module) -> tuple[str, ...]:
    """Modülün dışa açılan (alt çizgiyle başlamayan) üst düzey fonksiyon ve sınıf adları."""
    names: list[str] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and not node.name.startswith("_"):
            names.append(node.name)
    return tuple(names)


def collect_modules() -> list[ModuleInfo]:
    """Konu klasörlerindeki tüm modülleri (`__init__.py` hariç) sıralı döndürür."""
    modules: list[ModuleInfo] = []
    for topic in TOPICS:
        for path in sorted((PACKAGE / topic).glob("*.py")):
            if path.name == "__init__.py":
                continue
            source = path.read_text(encoding="utf-8")
            tree = ast.parse(source)
            title, summary, fields = parse_header(ast.get_docstring(tree) or "")
            modules.append(
                ModuleInfo(
                    topic=topic,
                    name=path.stem,
                    path=path,
                    title=title,
                    summary=summary,
                    fields=fields,
                    public_names=public_names_of(tree),
                    line_count=source.count("\n") + 1,
                )
            )
    return modules


def _cell(text: str) -> str:
    """Tablo hücresi için metni güvenli hâle getirir."""
    return text.replace("|", "\\|").replace("\n", " ").strip()


def render_index(modules: list[ModuleInfo]) -> str:
    """Dizin belgesinin tam metnini üretir."""
    out: list[str] = [
        "# Dizin — tüm algoritmalar ve veri yapıları",
        "",
        "> Bu dosya **betikle üretilir**: `python scripts/build_index.py`. Elle düzenlemeyin;",
        "> modül başlığını değiştirin ve betiği yeniden çalıştırın. Güncelliğini",
        "> `tests/test_kurallar.py` denetler.",
        "",
        f"Toplam **{len(modules)} modül**, {len(TOPICS)} konu. Hangisini seçeceğinizi "
        "bilmiyorsanız:",
        "[NASIL_SECILIR.md](NASIL_SECILIR.md).",
        "",
    ]
    for topic, heading in TOPICS.items():
        rows = [m for m in modules if m.topic == topic]
        out.append(f"## {heading} (`algoritma/{topic}/`) — {len(rows)} modül")
        out.append("")
        out.append("| Ad | Dosya | Dışa açılan adlar | Karmaşıklık | Ne zaman |")
        out.append("| --- | --- | --- | --- | --- |")
        for m in rows:
            names = ", ".join(f"`{n}`" for n in m.public_names)
            label = f"**{_cell(m.title)}** — {_cell(m.summary)}" if m.summary else _cell(m.title)
            complexity = _cell(m.fields.get("Karmaşıklık", ""))
            when = _cell(m.fields.get("Ne zaman", ""))
            out.append(
                f"| {label} | [`{m.name}.py`](../{m.relative}) | {names} | {complexity} | {when} |"
            )
        out.append("")
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description="docs/DIZIN.md üreteci")
    parser.add_argument("--denetle", action="store_true", help="yazma; güncel mi diye bak")
    args = parser.parse_args()
    text = render_index(collect_modules())
    if args.denetle:
        current = INDEX_PATH.read_text(encoding="utf-8") if INDEX_PATH.exists() else ""
        if current != text:
            print("docs/DIZIN.md güncel değil: `python scripts/build_index.py` çalıştırın.")
            return 1
        print("docs/DIZIN.md güncel.")
        return 0
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(text, encoding="utf-8")
    print(f"docs/DIZIN.md yazıldı ({text.count(chr(10)) + 1} satır).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
