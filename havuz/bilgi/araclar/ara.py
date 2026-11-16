#!/usr/bin/env python3
"""Bilgi notlarında arama (BM25). Yalnız Python standart kütüphanesi kullanır; dizin dosyası gerekmez.

Notlar `##` başlıklarından bölümlere ayrılır (kod bloklarının içindeki `##` satırları sayılmaz); her bölüm ayrı bir
belge gibi puanlanır. Böylece sonuç, okunacak tam yeri gösterir.

Türkçe için:
  - büyük-küçük ve işaret duyarsız eşleşme ("ÇIĞ" = "çığ" = "cig"),
  - kaba kök: sözcüğün ilk 5 harfi ("veritabanında" ile "veritabanı" eşleşir),
  - ünsüz yumuşaması: kökün son harfi b→p, d→t, g→k ("kitabı" = "kitap", "köpeği" = "köpek"),
  - kısa sorgu sözcüğü (3–4 harf) önek olarak eşleşir ("göz" → "gözleri", "hata" → "hatası").

Kullanım:
  python araclar/ara.py "oturum çerezi nasıl güvenli olur"
  python araclar/ara.py "n+1 sorgu" --adet 3 --tam        # bölümün tamamını yaz
  python araclar/ara.py "kalibrasyon" --json               # makine okur çıktı (bir araca bağlamak için)

Bir kod ajanına şunu söylemek yeterlidir: "Bir konuda emin değilsen önce
`python havuz/bilgi/araclar/ara.py \\"<soru>\\"` çalıştır ve çıkan bölümü oku."

Genişletme: sıralamayı değiştirmek için `search` işlevine, belirteçlemeyi değiştirmek için `tokenize` işlevine bakın.
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
PREFIX_MIN = 3  # bundan kısa sorgu sözcükleri önek olarak genişletilmez ("js", "ui" gibi)
TITLE_BOOST = 3  # başlıktaki sözcük, gövdedekinin üç katı sayılır
FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")

FOLD = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"})
SOFTEN = {"b": "p", "d": "t", "g": "k"}  # kökün son harfinde ünsüz yumuşaması (kitabı → kitap)
COMBINING_DOT = chr(0x0307)  # "İ" yerel kuralsız küçültülünce oluşan birleşen nokta
STOPWORDS = frozenset(
    "ve ile bir bu su o da de mi mu ne icin gibi ama ya veya her cok daha en ise olan olarak nasil neden hangi "
    "the a an of to in is for and or".split()
)


def fold(text: str) -> str:
    """Türkçe kuralla küçült, işaretleri at: "ÇIĞ" → "cig", "İş" → "is"."""
    lowered = text.replace("İ", "i").replace("I", "ı").lower()
    return lowered.translate(FOLD).replace(COMBINING_DOT, "")


def stem(word: str) -> str:
    """Kaba kök: ilk 5 harf; son harfteki yumuşamış ünsüz sertleştirilir."""
    root = word[:STEM_LENGTH]
    if len(root) >= PREFIX_MIN and root[-1] in SOFTEN:
        root = root[:-1] + SOFTEN[root[-1]]
    return root


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9+#]+", fold(text))
    return [stem(word) for word in words if word not in STOPWORDS and len(word) > 1]


@dataclass
class Section:
    file: str
    title: str
    heading: str
    line: int
    text: str
    tokens: Counter[str]
    length: int


def section_starts(lines: list[str]) -> list[int]:
    """`## ` ile başlayan satırların dizinleri; kod bloklarının içindekiler sayılmaz."""
    starts: list[int] = []
    in_fence = False
    for index, line in enumerate(lines):
        if FENCE_RE.match(line):
            in_fence = not in_fence
        elif not in_fence and line.startswith("## "):
            starts.append(index)
    return starts


def load_sections() -> list[Section]:
    sections: list[Section] = []
    for path in sorted(ROOT.rglob("*.md")):
        relative = path.relative_to(ROOT)
        if path.name in SKIP_FILES or set(relative.parts) & SKIP_DIRS:
            continue
        lines = path.read_text(encoding="utf-8").split("\n")
        title = next((line[2:].strip() for line in lines if line.startswith("# ")), path.stem)
        starts = section_starts(lines) or [0]
        for position, start in enumerate(starts):
            end = starts[position + 1] if position + 1 < len(starts) else len(lines)
            heading = lines[start][3:].strip() if lines[start].startswith("## ") else title
            body = "\n".join(lines[start:end]).strip()
            tokens = Counter(tokenize(body))
            for token in tokenize(f"{title} {heading}"):
                tokens[token] += TITLE_BOOST
            sections.append(Section(relative.as_posix(), title, heading, start + 1, body, tokens, sum(tokens.values())))
    return sections


def expand(token: str, vocabulary: set[str]) -> list[str]:
    """Kısa sorgu sözcüğünü, onunla başlayan dizin sözcüklerine genişletir ("goz" → "gozle", "gozu"…)."""
    if len(token) >= STEM_LENGTH or len(token) < PREFIX_MIN:
        return [token]
    return sorted(term for term in vocabulary if term.startswith(token)) or [token]


def search(query_text: str, limit: int) -> list[tuple[float, Section]]:
    sections = load_sections()
    if not sections:
        return []
    vocabulary = {term for section in sections for term in section.tokens}
    average = sum(section.length for section in sections) / len(sections)
    total = len(sections)
    scores = [0.0] * total
    for token in tokenize(query_text):
        terms = expand(token, vocabulary)
        frequencies = [sum(section.tokens.get(term, 0) for term in terms) for section in sections]
        document_frequency = sum(1 for frequency in frequencies if frequency)
        if not document_frequency:
            continue
        idf = math.log(1 + (total - document_frequency + 0.5) / (document_frequency + 0.5))
        for index, (frequency, section) in enumerate(zip(frequencies, sections)):
            if frequency:
                norm = K1 * (1 - B + B * section.length / average)
                scores[index] += idf * frequency * (K1 + 1) / (frequency + norm)
    ranked = sorted(((score, section) for score, section in zip(scores, sections) if score > 0), key=lambda x: -x[0])
    return ranked[:limit]


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
