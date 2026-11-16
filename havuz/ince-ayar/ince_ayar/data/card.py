"""Veri kümesi kartı üretir: verinin ne olduğu, nereden geldiği, lisansı ve dağılımı.

Kim kullanır: `python -m ince_ayar veri kart`. Şablon `data/veri_karti_sablonu.md` dosyasındadır;
sayılabilen her şey (örnek sayısı, dağılım, özet) otomatik dolar, insan bilgisi gerektiren yerler
"DOLDURUN" diye işaretlenir.

Genişletme: şablona yeni bir `{alan}` eklerseniz `CardInput` içine aynı adla alan ekleyin;
`tests/test_data_tools.py` şablondaki her alanın doldurulduğunu denetler.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

from ince_ayar.console import format_table
from ince_ayar.data.records import ChatExample, LabeledText, Pair, TaggedSentence
from ince_ayar.data.validate import Issue

TEMPLATE_PATH = Path(__file__).with_name("veri_karti_sablonu.md")
UNKNOWN = "**DOLDURUN**"


@dataclass(frozen=True)
class CardInput:
    ad: str
    gorev: str
    dosya: str
    ozet: str
    sayi: int
    dil: str
    lisans: str
    kaynak: str
    uretim: str
    dagilim: str
    uzunluk: str
    uyarilar: str


def render_card(data: CardInput, today: date) -> str:
    """Şablonu doldurur. `today` dışarıdan verilir ki çıktı test edilebilsin."""
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    return template.format(tarih=today.isoformat(), **asdict(data))


def _code_block(text: str) -> str:
    return f"```\n{text}\n```"


def describe_labels(labels: list[str]) -> str:
    """Etiket dağılımı tablosu (sınıflandırma ve varlık tanıma için)."""
    counts = Counter(labels)
    total = sum(counts.values()) or 1
    rows = [[label, count, f"{count / total:.1%}"] for label, count in counts.most_common()]
    return _code_block(format_table(["etiket", "örnek", "oran"], rows))


def describe_chat(rows: list[ChatExample]) -> str:
    turns = Counter(sum(1 for m in row.messages if m["role"] == "assistant") for row in rows)
    with_system = sum(1 for row in rows if row.messages[0]["role"] == "system")
    table = format_table(["asistan turu", "örnek"], [[k, v] for k, v in sorted(turns.items())])
    return _code_block(table) + f"\n\nSistem iletisi olan örnek: {with_system} / {len(rows)}"


def describe_classification(rows: list[LabeledText]) -> str:
    return describe_labels([row.label for row in rows])


def describe_pairs(rows: list[Pair]) -> str:
    with_negative = sum(1 for row in rows if row.negatives)
    unique_positive = len({row.positive for row in rows})
    return (
        f"Çift sayısı: {len(rows)} · farklı olumlu metin: {unique_positive} · "
        f"zor olumsuzu olan çift: {with_negative}"
    )


def describe_tagged(rows: list[TaggedSentence]) -> str:
    return describe_labels([tag[2:] for row in rows for tag in row.tags if tag.startswith("B-")])


def describe_provenance(extras: list[dict[str, object]]) -> str:
    """Satırlardaki `kaynak` kayıtlarını özetler (sentetik veri hattının yazdığı kayıt)."""
    seen: Counter[str] = Counter()
    for extra in extras:
        record = extra.get("kaynak")
        if isinstance(record, dict):
            model = record.get("ogretmen_model", "?")
            license_id = record.get("ogretmen_lisansi", "?")
            version = record.get("istem_surumu", "?")
            seen[f"öğretmen `{model}` (lisans: {license_id}), istem sürümü `{version}`"] += 1
    if not seen:
        return "Satırlarda `kaynak` kaydı yok (elle toplanmış ya da dışarıdan alınmış veri)."
    return "\n".join(f"- {count} örnek: {text}" for text, count in seen.most_common())


def describe_warnings(warnings: list[Issue]) -> str:
    if not warnings:
        return "Uyarı yok."
    return "\n".join(f"- {issue.render()}" for issue in warnings)
