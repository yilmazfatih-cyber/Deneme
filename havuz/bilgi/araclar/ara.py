#!/usr/bin/env python3
"""Bilgi notlarında arama (BM25). Yalnız Python standart kütüphanesi kullanır; dizin dosyası gerekmez.

Notlar `##` başlıklarından bölümlere ayrılır; her bölüm ayrı bir belge gibi puanlanır. Böylece sonuç, okunacak
tam yeri gösterir. Türkçe için: büyük-küçük ve işaret duyarsız eşleşme + sözcüğün ilk 5 harfiyle kaba kök bulma
(Türkçe sondan eklemeli olduğu için "veritabanında" ile "veritabanı" böyle eşleşir).

Kullanım:
  python araclar/ara.py "oturum çerezi nasıl güvenli olur"
  python araclar/ara.py "n+1 sorgu" --adet 3 --tam        # bölümün tamamını yaz
  python araclar/ara.py "kalibrasyon" --json               # makine okur çıktı (bir araca bağlamak için)

Bir kod ajanına şunu söylemek yeterlidir: "Bir konuda emin değilsen önce
`python havuz/bilgi/araclar/ara.py \"<soru>\"` çalıştır ve çıkan bölümü oku."

Genişletme: sıralamayı değiştirmek için `score` işlevine, belirteçlemeyi değiştirmek için `tokenize` işlevine bakın.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_FILES = {"README.md", "BICIM.md", "INDEX.md", "AGENTS.md"}
SKIP_DIRS = {"araclar", "node_modules", ".venv", "__pycache__"}
K1, B = 1.4, 0.75
STEM_LENGTH = 5
TITLE_BOOST = 3  # başlıktaki sözcük, gövdedekinin üç katı sayılır

FOLD = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"})
STOPWORDS = frozenset(
    "ve ile bir bu su o da de mi mu ne icin gibi ama ya veya her cok daha en ise olan olarak nasil neden hangi "
    "the a an of to in is for and or".split()
)


def fold(text: str) -> str:
    """Türkçe kuralla küçült, işaretleri at: "ÇIĞ" → "cig", "İş" → "is"."""
    lowered = text.replace("İ", "i").replace("I", "ı").lower()
    return lowered.translate(FOLD).replace("̇", "")


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9+#]+", fold(text))
    return [word[:STEM_LENGTH] for word in words if word not in STOPWORDS and len(word) > 1]


@dataclass
class Section:
    file: str
    title: str
    heading: str
    line: int
    text: str
    tokens: Counter[str]
    length: int


def load_sections() -> list[Section]:
    sections: list[Section] = []
    for path in sorted(ROOT.rglob("*.md")):
        relative = path.relative_to(ROOT)
        if path.name in SKIP_FILES or set(relative.parts) & SKIP_DIRS:
            continue
        lines = path.read_text(encoding="utf-8").split("\n")
        title = next((line[2:].strip() for line in lines if line.startswith("# ")), path.stem)
        starts = [index for index, line in enumerate(lines) if line.startswith("## ")]
        starts = starts or [0]
        for position, start in enumerate(starts):
            end = starts[position + 1] if position + 1 < len(starts) else len(lines)
            heading = lines[start][3:].strip() if lines[start].startswith("## ") else title
            body = "\n".join(lines[start:end]).strip()
            tokens = Counter(tokenize(body))
            for token in tokenize(f"{title} {heading}"):
                tokens[token] += TITLE_BOOST
            sections.append(Section(relative.as_posix(), title, heading, start + 1, body, tokens, sum(tokens.values())))
    return sections


def score(query: list[str], section: Section, document_frequency: Counter[str], total: int, average: float) -> float:
    result = 0.0
    for token in query:
        frequency = section.tokens.get(token, 0)
        if frequency == 0:
            continue
        idf = math.log(1 + (total - document_frequency[token] + 0.5) / (document_frequency[token] + 0.5))
        result += idf * frequency * (K1 + 1) / (frequency + K1 * (1 - B + B * section.length / average))
    return result


def search(query_text: str, limit: int) -> list[tuple[float, Section]]:
    sections = load_sections()
    if not sections:
        return []
    document_frequency: Counter[str] = Counter()
    for section in sections:
        document_frequency.update(section.tokens.keys())
    average = sum(section.length for section in sections) / len(sections)
    query = tokenize(query_text)
    ranked = [(score(query, section, document_frequency, len(sections), average), section) for section in sections]
    return sorted((item for item in ranked if item[0] > 0), key=lambda item: -item[0])[:limit]


def snippet(text: str, width: int = 320) -> str:
    body = " ".join(line.strip() for line in text.split("\n")[1:] if line.strip() and not line.startswith("```"))
    return body if len(body) <= width else body[:width].rsplit(" ", 1)[0] + " …"


def main() -> int:
    parser = argparse.ArgumentParser(description="Bilgi notlarında arar.")
    parser.add_argument("sorgu", help="aranacak soru ya da sözcükler")
    parser.add_argument("--adet", type=int, default=5, help="kaç sonuç (varsayılan 5)")
    parser.add_argument("--tam", action="store_true", help="bölümün tamamını yaz")
    parser.add_argument("--json", action="store_true", help="JSON çıktı")
    args = parser.parse_args()

    results = search(args.sorgu, args.adet)
    if args.json:
        payload = [
            {"puan": round(points, 3), "dosya": s.file, "satir": s.line, "not": s.title, "bolum": s.heading, "metin": s.text}
            for points, s in results
        ]
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    if not results:
        print("Sonuç yok. Daha az ve daha genel sözcük deneyin; kümelere INDEX.md'den de bakabilirsiniz.")
        return 1
    for order, (points, section) in enumerate(results, start=1):
        print(f"{order}. {section.title} › {section.heading}   [{section.file}:{section.line}]  puan {points:.1f}")
        print(f"   {section.text if args.tam else snippet(section.text)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
