"""Satırlar arası denetimler: tek tek geçerli olan ama birlikte sorun çıkaran örnekleri bulur.

Kim kullanır: `data/validate.py` (her `load_*` işlevi sonunda). Bulgular **uyarıdır**; eğitimi
durdurmaz ama çoğu zaman veri hatasına işaret eder: yinelenen örnek, çelişen etiket ("aynı metin,
iki ayrı etiket"), tek örnekli sınıf, büyük/küçük harfle ayrışmış etiket adı ("Olumlu"/"olumlu").

Genişletme: yeni bir denetim için `(satır, ileti)` listesi döndüren küçük bir işlev yazın ve ilgili
`check_*` işlevinin sonuna ekleyin. Aynı türden en çok `MAX_PER_KIND` uyarı gösterilir.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from ince_ayar.data.records import ChatExample, LabeledText, Pair, TaggedSentence
from ince_ayar.messages import t
from ince_ayar.text_tr import fold_for_match, lower_tr

MAX_PER_KIND = 5
IMBALANCE_RATIO = 10.0

Finding = tuple[int, str]


def _cap(findings: list[Finding], total: int) -> list[Finding]:
    """Aynı türden uyarıları kırpar; kaç tane daha olduğunu son satırda söyler."""
    if total <= MAX_PER_KIND:
        return findings
    return [*findings[:MAX_PER_KIND], (0, t("veri.uyari.benzerleri", sayi=total - MAX_PER_KIND))]


def _duplicates(keys: list[tuple[int, str]]) -> list[Finding]:
    """Aynı anahtara sahip satırları bulur: (satır, 'N. satırla aynı')."""
    first_seen: dict[str, int] = {}
    found: list[Finding] = []
    for line, key in keys:
        if key in first_seen:
            found.append((line, t("veri.uyari.yinelenen", ilk=first_seen[key])))
        else:
            first_seen[key] = line
    return _cap(found, len(found))


def check_chat(rows: list[ChatExample]) -> list[Finding]:
    findings = _duplicates(
        [(row.line, fold_for_match(row.prompt_text + "\n" + row.reference)) for row in rows]
    )
    padded = [
        (row.line, t("veri.uyari.bosluk"))
        for row in rows
        if any(m["role"] == "assistant" and m["content"] != m["content"].strip() for m in row.messages)
    ]
    return findings + _cap(padded, len(padded))


def check_classification(rows: list[LabeledText]) -> list[Finding]:
    findings: list[Finding] = []
    counts = Counter(row.label for row in rows)
    if len(counts) == 1 and rows:
        findings.append((0, t("veri.uyari.tek_sinif", etiket=next(iter(counts)))))
    for label, count in sorted(counts.items()):
        if count < 2:
            findings.append((0, t("veri.uyari.az_ornek", etiket=label, sayi=count)))
    if len(counts) > 1 and max(counts.values()) / min(counts.values()) >= IMBALANCE_RATIO:
        largest, smallest = counts.most_common()[0], counts.most_common()[-1]
        findings.append(
            (0, t("veri.uyari.dengesiz", buyuk=largest[0], buyuk_sayi=largest[1],
                  kucuk=smallest[0], kucuk_sayi=smallest[1]))
        )  # fmt: skip
    spellings: dict[str, set[str]] = defaultdict(set)
    for label in counts:
        spellings[lower_tr(label).strip()].add(label)
    for variants in spellings.values():
        if len(variants) > 1:
            findings.append((0, t("veri.uyari.etiket_yazimi", etiketler=", ".join(sorted(variants)))))
    return findings + _label_conflicts(rows)


def _label_conflicts(rows: list[LabeledText]) -> list[Finding]:
    """Aynı metne farklı etiket verilmiş satırlar (etiket gürültüsü) ve düz yinelemeler."""
    by_text: dict[str, list[LabeledText]] = defaultdict(list)
    for row in rows:
        by_text[fold_for_match(row.text)].append(row)
    conflicts: list[Finding] = []
    repeats: list[Finding] = []
    for group in by_text.values():
        first = group[0]
        for other in group[1:]:
            if other.label != first.label:
                conflicts.append(
                    (other.line, t("veri.uyari.celisen_etiket", ilk=first.line,
                                   etiket=other.label, ilk_etiket=first.label))
                )  # fmt: skip
            else:
                repeats.append((other.line, t("veri.uyari.yinelenen", ilk=first.line)))
    return _cap(conflicts, len(conflicts)) + _cap(repeats, len(repeats))


def check_pairs(rows: list[Pair]) -> list[Finding]:
    findings = _duplicates(
        [(row.line, fold_for_match(row.query) + "\n" + fold_for_match(row.positive)) for row in rows]
    )
    same = [
        (row.line, t("veri.uyari.sorgu_esit_olumlu"))
        for row in rows
        if fold_for_match(row.query) == fold_for_match(row.positive)
    ]
    return findings + _cap(same, len(same))


def check_tagged(rows: list[TaggedSentence]) -> list[Finding]:
    findings = _duplicates([(row.line, fold_for_match(" ".join(row.words))) for row in rows])
    types = {tag[2:] for row in rows for tag in row.tags if tag != "O"}
    if rows and not types:
        findings.append((0, t("veri.uyari.varlik_yok")))
    return findings
