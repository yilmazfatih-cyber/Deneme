"""Küçük modeller için kısa, kesin, çıkarımsal yönergeler.

Kural: 1B altı bir model uzun ve soyut talimatları iyi izlemez. Her istem
(1) ne yapılacağını, (2) biçimi, (3) uydurma yasağını tek tek söyler.
"""

from __future__ import annotations

SYSTEM_TR = (
    "Sen bir belge özetleme yardımcısısın. Yalnızca verilen metindeki bilgiyi kullan; "
    "metinde olmayan hiçbir şeyi ekleme. Kısa ve açık Türkçe yaz."
)
SYSTEM_EN = (
    "You are a document summarization assistant. Use only information from the given text; "
    "never add anything that is not in the text. Write short, clear English."
)

FORMAT_TR = (
    "Şu biçimde yanıt ver:\n"
    "ÖZET: 2-4 cümlelik özet.\n"
    "MADDELER:\n- en önemli 3-6 bilgi, her biri tek satır\n"
    "EYLEMLER:\n- istenen işler, son tarihler, ödeme/toplantı gibi yapılacaklar (yoksa 'Yok')"
)
FORMAT_EN = (
    "Answer in this format:\n"
    "SUMMARY: 2-4 sentence summary.\n"
    "POINTS:\n- 3-6 most important facts, one per line\n"
    "ACTIONS:\n- requested tasks, deadlines, payments, meetings (write 'None' if there are none)"
)

KIND_HINT = {
    ("email", "tr"): "Aşağıdaki e-postayı özetle. Kimin kimden ne istediğini ve son tarihleri belirt.",
    ("email", "en"): "Summarize the e-mail below. State who asks whom for what, and any deadlines.",
    ("document", "tr"): "Aşağıdaki belgeyi özetle. Konuyu, önemli rakamları ve kararları belirt.",
    ("document", "en"): "Summarize the document below. State the topic, key figures and decisions.",
}

CHUNK_TR = (
    "Aşağıdaki bölümü 3-5 cümleyle özetle. Yalnızca metindeki bilgiyi kullan; "
    "rakamları, adları ve tarihleri koru. Başlık ve madde kullanma, düz paragraf yaz."
)
CHUNK_EN = (
    "Summarize the section below in 3-5 sentences. Use only information from the text; "
    "keep numbers, names and dates. No headings or bullets, write a plain paragraph."
)

MERGE_TR = (
    "Aşağıda uzun bir belgenin bölüm özetleri var. Bunları tek bir tutarlı özete dönüştür. "
    "Tekrarları birleştir, çelişki varsa belirt."
)
MERGE_EN = (
    "Below are section summaries of a long document. Turn them into one coherent summary. "
    "Merge repetitions; note contradictions if any."
)


def build_messages(text: str, kind: str, language: str, title: str | None = None, stage: str = "final") -> list[dict]:
    lang = "en" if language == "en" else "tr"
    system = SYSTEM_EN if lang == "en" else SYSTEM_TR
    if stage == "chunk":
        instruction = CHUNK_EN if lang == "en" else CHUNK_TR
        fmt = ""
    elif stage == "merge":
        instruction = MERGE_EN if lang == "en" else MERGE_TR
        fmt = FORMAT_EN if lang == "en" else FORMAT_TR
    else:
        instruction = KIND_HINT.get((kind if kind in ("email", "document") else "document", lang))
        fmt = FORMAT_EN if lang == "en" else FORMAT_TR
    head = f"{instruction}\n{fmt}".strip()
    title_line = f"\nBaşlık: {title}" if (title and lang == "tr") else (f"\nTitle: {title}" if title else "")
    user = f"{head}{title_line}\n\nMETİN:\n{text}\n" if lang == "tr" else f"{head}{title_line}\n\nTEXT:\n{text}\n"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]
