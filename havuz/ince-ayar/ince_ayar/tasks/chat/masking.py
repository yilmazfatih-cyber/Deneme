"""Kayıp maskesi: sohbeti modelin kendi şablonuyla metne çevirir ve yalnız asistan yanıtlarını
(yanıtı kapatan bitiş belirteci dahil) etiketler; geri kalan her belirteç -100 olur.

Kim kullanır: `tasks/chat/data.py` (eğitim ve doğrulama örneklerini hazırlar).

Neden kendi gerçeklememiz: transformers'ın `return_assistant_tokens_mask` seçeneği şablonda
`{% generation %}` işareti ister; modellerin çoğunda bu yoktur ve TRL yalnız birebir tanıdığı
şablonları yamalar. Buradaki yöntem şablonu **değiştirmeden**, her şablonla çalışır:

1. Tam metin üretilir. Asistan içeriği bir yer tutucuyla değiştirilip yeniden üretilir; böylece
   içeriğin metindeki başlangıcı ve içerikten sonra gelen kuyruk bulunur.
2. Aralığın başı, "üretim istemi"nin (`add_generation_prompt=True`) bittiği yerdir. Böylece şablonun
   yanıtın önüne eklediği parçalar (ör. Qwen3'ün boş `<think>` bloğu) da öğrenilir.
3. Aralığın sonu, o tur son ileti olsaydı şablonun içerikten sonra yazacağı kapanıştır
   (ör. `<|im_end|>\n`). Model durmayı buradan öğrenir.
4. Metin `offset_mapping` ile belirteçlenir; tümüyle aralığın içinde kalan belirteçler etiketlenir.
5. Emniyet: etiketli belirteçler çözülür ve asistan içeriğini içerdiği doğrulanır.

Testler bu maskeyi TRL'nin kendi eğitim şablonlarıyla (Qwen, Llama 3, Gemma 3, Phi-3) üretilen
maskeyle karşılaştırır (`tests/test_chat_masking.py`).

Genişletme: araç çağrısı (tool) ve çok kipli içerik desteklenmez; eklenecekse önce
`data/records.py` şeması genişletilmelidir.
"""

from __future__ import annotations

import os
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

from ince_ayar.errors import UserError
from ince_ayar.messages import t
from ince_ayar.text_tr import collapse_spaces

IGNORE_INDEX = -100
SENTINEL = "INCEAYARYERTUTUCU7Q3Z"
MIN_DECODE_SIMILARITY = 0.9

Messages = list[dict[str, str]]


@dataclass(frozen=True)
class EncodedChat:
    """Bir sohbetin eğitime hazır hâli."""

    input_ids: list[int]
    labels: list[int]
    text: str
    spans: list[tuple[int, int]]  # asistan aralıkları (karakter): [baş, son)
    stop_ids: list[int]  # asistan turlarını kapatan özel belirteçler
    closed: bool  # her asistan turu özel bir bitiş belirteciyle kapanıyor mu
    merged_start: bool  # yanıtın ilk belirteci istemin son karakteriyle birleşmiş mi

    @property
    def label_count(self) -> int:
        return sum(1 for label in self.labels if label != IGNORE_INDEX)


def render(tokenizer: Any, messages: Messages, add_generation_prompt: bool = False) -> str:
    """Sohbeti modelin şablonuyla metne çevirir; şablon hatasını Türkçe açıklar."""
    if not getattr(tokenizer, "chat_template", None):
        raise UserError(t("sohbet.sablon_yok"))
    try:
        text = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=add_generation_prompt
        )
    except Exception as exc:  # jinja2.TemplateError ve şablonun kendi raise_exception çağrıları
        raise UserError(t("sohbet.sablon_hatasi", ayrinti=str(exc))) from exc
    return str(text)


def _closing_when_last(tokenizer: Any, messages: Messages, index: int) -> str:
    """Asistan turu son ileti olsaydı şablonun içerikten sonra yazacağı metin."""
    marked = [*messages[:index], {"role": "assistant", "content": SENTINEL}]
    rendered = render(tokenizer, marked)
    position = rendered.find(SENTINEL)
    return rendered[position + len(SENTINEL) :] if position >= 0 else ""


def _turn_span(tokenizer: Any, messages: Messages, index: int, text: str) -> tuple[int, int]:
    """`index` numaralı asistan iletisinin tam metindeki [baş, son) karakter aralığı."""
    marked = [*messages[:index], {"role": "assistant", "content": SENTINEL}, *messages[index + 1 :]]
    marked_text = render(tokenizer, marked)
    position = marked_text.find(SENTINEL)
    if position < 0:
        raise UserError(t("sohbet.hizalama", sira=index))
    tail = marked_text[position + len(SENTINEL) :]
    content = messages[index]["content"]
    if text.endswith(tail) and len(text) - len(tail) >= position:
        content_end = len(text) - len(tail)
    else:
        found = [c for c in (content, content.strip()) if text.startswith(c, position)]
        if not found:
            raise UserError(t("sohbet.hizalama", sira=index))
        content_end = position + len(found[0])
    prompt = render(tokenizer, messages[:index], add_generation_prompt=True)
    if text.startswith(prompt) and len(prompt) <= content_end:
        start = len(prompt)
    elif text[:position] == marked_text[:position]:
        start = position
    else:
        raise UserError(t("sohbet.hizalama", sira=index))
    is_last = index == len(messages) - 1
    closing = tail if is_last else _closing_when_last(tokenizer, messages, index)
    shared = os.path.commonprefix([closing, text[content_end:]])
    return start, content_end + len(shared)


def assistant_spans(tokenizer: Any, messages: Messages) -> tuple[str, list[tuple[int, int]]]:
    """Tam metni ve her asistan iletisinin karakter aralığını döndürür."""
    text = render(tokenizer, messages)
    spans = [
        _turn_span(tokenizer, messages, index, text)
        for index, message in enumerate(messages)
        if message["role"] == "assistant"
    ]
    return text, spans


def _special_ids(tokenizer: Any) -> set[int]:
    return set(tokenizer.get_added_vocab().values()) | set(tokenizer.all_special_ids)


def _loose(text: str) -> str:
    return collapse_spaces(unicodedata.normalize("NFKC", text))


def _decodes_to(tokenizer: Any, token_ids: list[int], content: str) -> bool:
    """Emniyet denetimi: etiketli belirteçler asistan içeriğini (gevşek karşılaştırmayla) içeriyor mu."""
    decoded = _loose(tokenizer.decode(token_ids, skip_special_tokens=False))
    wanted = _loose(content)
    if wanted in decoded:
        return True
    return SequenceMatcher(None, wanted, decoded).ratio() >= MIN_DECODE_SIMILARITY


def encode_chat(tokenizer: Any, messages: Messages) -> EncodedChat:
    """Sohbeti belirteçler ve yalnız asistan yanıtlarını etiketler."""
    if not getattr(tokenizer, "is_fast", False):
        raise UserError(t("sohbet.hizli_tokenizer"))
    text, spans = assistant_spans(tokenizer, messages)
    encoding = tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
    input_ids: list[int] = list(encoding["input_ids"])
    offsets: list[tuple[int, int]] = [tuple(pair) for pair in encoding["offset_mapping"]]
    labels = [IGNORE_INDEX] * len(input_ids)
    special = _special_ids(tokenizer)
    stop_ids: list[int] = []
    closed = True
    merged_start = False
    contents = [m["content"] for m in messages if m["role"] == "assistant"]
    for (start, end), content in zip(spans, contents, strict=True):
        inside = [
            position
            for position, (left, right) in enumerate(offsets)
            if left >= start and right <= end and (right > left or left > start)
        ]
        if not inside or not _decodes_to(tokenizer, [input_ids[i] for i in inside], content):
            raise UserError(t("sohbet.maske_dogrulanamadi"))
        for position in inside:
            labels[position] = input_ids[position]
        merged_start = merged_start or any(left < start < right for left, right in offsets)
        closer = next(
            (input_ids[i] for i in reversed(inside) if tokenizer.decode([input_ids[i]]).strip()),
            None,
        )
        if closer is not None and closer in special:
            if closer not in stop_ids:
                stop_ids.append(closer)
        else:
            closed = False
    return EncodedChat(input_ids, labels, text, spans, stop_ids, closed, merged_start)


def generation_prompt(tokenizer: Any, messages: Messages) -> list[int]:
    """Son asistan yanıtı çıkarılmış sohbetin üretim istemi (çıkarımda modele verilen girdi)."""
    history = messages[:-1] if messages and messages[-1]["role"] == "assistant" else messages
    text = render(tokenizer, history, add_generation_prompt=True)
    return list(tokenizer(text, add_special_tokens=False)["input_ids"])


def describe_mask(tokenizer: Any, encoded: EncodedChat) -> str:
    """Maskeyi insan gözüyle denetlemek için: kayba giren kısım ⟦…⟧ içinde gösterilir."""
    pieces: list[str] = []
    cursor = 0
    for start, end in encoded.spans:
        pieces.append(encoded.text[cursor:start])
        pieces.append("⟦" + encoded.text[start:end] + "⟧")
        cursor = end
    pieces.append(encoded.text[cursor:])
    return "".join(pieces)
