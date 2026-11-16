"""Kayıp maskesi testleri: yalnız asistan yanıtı (ve kapanış belirteci) etiketlenir.

Başvuru gerçeklemesi: TRL'nin kendi "eğitim şablonları" (`{% generation %}` işaretli) ile
transformers'ın `return_assistant_tokens_mask` çıktısı. Şablonlar kurulu `trl` paketinin içinden
okunur; ağ gerekmez.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import trl

from ince_ayar.errors import UserError
from ince_ayar.tasks.chat.masking import (
    IGNORE_INDEX,
    assistant_spans,
    describe_mask,
    encode_chat,
    generation_prompt,
)
from tests.conftest import make_chat_tokenizer

TEMPLATES = Path(trl.__file__).parent / "chat_templates"

SINGLE = [
    {"role": "system", "content": "Kısa yanıt ver."},
    {"role": "user", "content": "Kargom ne zaman gelir?"},
    {"role": "assistant", "content": "Üç iş günü içinde teslim edilir."},
]
MULTI = [
    {"role": "user", "content": "Merhaba, nasılsınız?"},
    {"role": "assistant", "content": "İyiyim, teşekkür ederim."},
    {"role": "user", "content": "Şifremi unuttum."},
    {"role": "assistant", "content": "E-postanızı denetleyin."},
]

# aile → (asıl şablon, eğitim şablonu, özel belirteçler, eos, bos)
FAMILIES: dict[str, tuple[str, str, list[str], str, str | None]] = {
    "qwen2_5": (
        "qwen2_5_base",
        "qwen2_5_base_training",
        ["<|endoftext|>", "<|im_start|>", "<|im_end|>"],
        "<|im_end|>",
        None,
    ),
    "qwen3": (
        "qwen3",
        "qwen3_training",
        ["<|endoftext|>", "<|im_start|>", "<|im_end|>", "<think>", "</think>"],
        "<|im_end|>",
        None,
    ),
    "llama3": (
        "llama3",
        "llama3_training",
        ["<|begin_of_text|>", "<|start_header_id|>", "<|end_header_id|>", "<|eot_id|>"],
        "<|eot_id|>",
        "<|begin_of_text|>",
    ),
    "gemma3": (
        "gemma3",
        "gemma3_training",
        ["<bos>", "<eos>", "<start_of_turn>", "<end_of_turn>"],
        "<eos>",
        "<bos>",
    ),
    "phi3": (
        "phi3",
        "phi3_training",
        ["<|endoftext|>", "<|system|>", "<|user|>", "<|assistant|>", "<|end|>"],
        "<|endoftext|>",
        None,
    ),
}


def _family_tokenizer(family: str) -> tuple[Any, str]:
    original, training, specials, eos, bos = FAMILIES[family]
    template = (TEMPLATES / f"{original}.jinja").read_text(encoding="utf-8")
    training_template = (TEMPLATES / f"{training}.jinja").read_text(encoding="utf-8")
    return make_chat_tokenizer(specials, template, eos=eos, bos=bos), training_template


def _labeled_text(tokenizer: Any, encoded: Any) -> str:
    ids = [i for i, label in zip(encoded.input_ids, encoded.labels, strict=True) if label != -100]
    return str(tokenizer.decode(ids))


def test_chatml_tek_tur_yalniz_yanit_etiketlenir(chatml_tokenizer: Any) -> None:
    encoded = encode_chat(chatml_tokenizer, SINGLE)
    assert _labeled_text(chatml_tokenizer, encoded) == "Üç iş günü içinde teslim edilir.<|im_end|>\n"
    assert encoded.closed
    assert encoded.stop_ids == [chatml_tokenizer.convert_tokens_to_ids("<|im_end|>")]
    assert not encoded.merged_start
    # etiketler girdiyle aynı konumda aynı belirteci taşır
    for token, label in zip(encoded.input_ids, encoded.labels, strict=True):
        assert label in (IGNORE_INDEX, token)


def test_belirtecleme_resmi_sablon_cagrisi_ile_ayni(chatml_tokenizer: Any) -> None:
    encoded = encode_chat(chatml_tokenizer, MULTI)
    official = chatml_tokenizer.apply_chat_template(MULTI, tokenize=True, return_dict=True)
    assert encoded.input_ids == list(official["input_ids"])


def test_cok_turda_her_asistan_yaniti_etiketlenir(chatml_tokenizer: Any) -> None:
    encoded = encode_chat(chatml_tokenizer, MULTI)
    expected = "İyiyim, teşekkür ederim.<|im_end|>\nE-postanızı denetleyin.<|im_end|>\n"
    assert _labeled_text(chatml_tokenizer, encoded) == expected
    assert len(encoded.spans) == 2
    text, spans = assistant_spans(chatml_tokenizer, MULTI)
    assert [text[a:b] for a, b in spans] == [
        "İyiyim, teşekkür ederim.<|im_end|>\n",
        "E-postanızı denetleyin.<|im_end|>\n",
    ]


def test_kullanici_ve_sistem_metni_asla_etiketlenmez(chatml_tokenizer: Any) -> None:
    encoded = encode_chat(chatml_tokenizer, SINGLE)
    labeled = _labeled_text(chatml_tokenizer, encoded)
    assert "Kargom" not in labeled
    assert "Kısa yanıt" not in labeled
    assert "assistant" not in labeled


@pytest.mark.parametrize("family", ["llama3", "gemma3", "phi3"])
@pytest.mark.parametrize("messages", [SINGLE, MULTI], ids=["tek", "cok"])
def test_maske_trl_egitim_sablonuyla_birebir_ayni(
    family: str, messages: list[dict[str, str]]
) -> None:
    tokenizer, training_template = _family_tokenizer(family)
    encoded = encode_chat(tokenizer, messages)
    reference = tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        return_dict=True,
        return_assistant_tokens_mask=True,
        chat_template=training_template,
    )
    assert encoded.input_ids == list(reference["input_ids"])
    mine = [1 if label != IGNORE_INDEX else 0 for label in encoded.labels]
    assert mine == list(reference["assistant_masks"])
    assert encoded.closed


@pytest.mark.parametrize("family", ["qwen2_5", "qwen3"])
def test_qwen_maskesi_trl_ile_yalniz_istem_satir_sonunda_ayrisir(family: str) -> None:
    """TRL, Qwen şablonlarında 'assistant' başlığından sonraki satır sonunu da etiketler.

    O satır sonu çıkarımda üretim isteminin parçasıdır (model onu üretmez); bizim maskemiz onu
    dışarıda bırakır. Başka hiçbir fark olmamalıdır.
    """
    tokenizer, training_template = _family_tokenizer(family)
    encoded = encode_chat(tokenizer, SINGLE)
    reference = tokenizer.apply_chat_template(
        SINGLE,
        tokenize=True,
        return_dict=True,
        return_assistant_tokens_mask=True,
        chat_template=training_template,
    )
    assert encoded.input_ids == list(reference["input_ids"])
    mine = [1 if label != IGNORE_INDEX else 0 for label in encoded.labels]
    theirs = list(reference["assistant_masks"])
    extra = [i for i, (m, r) in enumerate(zip(mine, theirs, strict=True)) if r and not m]
    missing = [i for i, (m, r) in enumerate(zip(mine, theirs, strict=True)) if m and not r]
    assert missing == []
    assert all(tokenizer.decode([encoded.input_ids[i]]).strip() == "" for i in extra)
    assert len(extra) <= 1


def test_qwen3_bos_dusunme_blogu_etikete_girer() -> None:
    """Qwen3 son asistan turunun önüne boş <think> bloğu koyar; model onu da üretmeyi öğrenmeli."""
    tokenizer, _ = _family_tokenizer("qwen3")
    encoded = encode_chat(tokenizer, MULTI)
    labeled = _labeled_text(tokenizer, encoded)
    assert labeled.startswith("İyiyim, teşekkür ederim.<|im_end|>")
    assert "<think>\n\n</think>\n\nE-postanızı denetleyin.<|im_end|>" in labeled


def test_gemma_sistem_iletisi_kullaniciya_katilir_ve_etiketlenmez() -> None:
    tokenizer, _ = _family_tokenizer("gemma3")
    encoded = encode_chat(tokenizer, SINGLE)
    assert _labeled_text(tokenizer, encoded) == "Üç iş günü içinde teslim edilir.<end_of_turn>\n"
    assert encoded.stop_ids == [tokenizer.convert_tokens_to_ids("<end_of_turn>")]


def test_kapanis_belirteci_olmayan_sablon_isaretlenir() -> None:
    template = (
        "{% for m in messages %}{% if m['role'] == 'assistant' %}Yanıt: {{ m['content'] }}\n"
        "{% else %}Soru: {{ m['content'] }}\n{% endif %}{% endfor %}"
        "{% if add_generation_prompt %}Yanıt: {% endif %}"
    )
    tokenizer = make_chat_tokenizer(["<|endoftext|>"], template, eos="<|endoftext|>")
    encoded = encode_chat(tokenizer, MULTI)
    assert not encoded.closed
    assert encoded.stop_ids == []
    assert "İyiyim, teşekkür ederim." in _labeled_text(tokenizer, encoded)


def test_onceki_iletiyi_tasiyan_sablonda_da_calisir() -> None:
    """Sistem iletisini son kullanıcı iletisine taşıyan (önek korumayan) şablon: yedek yol."""
    template = (
        "{% set sys = messages[0]['content'] if messages[0]['role'] == 'system' else '' %}"
        "{% for m in messages %}{% if m['role'] == 'user' %}<|u|>"
        "{% if loop.last or loop.index0 == messages|length - 2 %}{{ sys }} {% endif %}"
        "{{ m['content'] }}<|e|>{% elif m['role'] == 'assistant' %}<|a|>{{ m['content'] }}<|e|>"
        "{% endif %}{% endfor %}{% if add_generation_prompt %}<|a|>{% endif %}"
    )
    tokenizer = make_chat_tokenizer(["<|u|>", "<|a|>", "<|e|>"], template, eos="<|e|>")
    messages = [{"role": "system", "content": "Kibar ol."}, *MULTI]
    encoded = encode_chat(tokenizer, messages)
    assert _labeled_text(tokenizer, encoded) == "İyiyim, teşekkür ederim.<|e|>E-postanızı denetleyin.<|e|>"


def test_uretim_istemi_asistan_yanitini_icermez(chatml_tokenizer: Any) -> None:
    prompt_ids = generation_prompt(chatml_tokenizer, SINGLE)
    text = chatml_tokenizer.decode(prompt_ids)
    assert text.endswith("<|im_start|>assistant\n")
    assert "teslim edilir" not in text
    encoded = encode_chat(chatml_tokenizer, SINGLE)
    assert encoded.input_ids[: len(prompt_ids)] == prompt_ids
    # istemden sonraki her belirteç etiketlidir: model tam olarak üreteceği şeyi öğrenir
    assert all(label != IGNORE_INDEX for label in encoded.labels[len(prompt_ids) :])


def test_maske_gosterimi_insan_icin_okunur(chatml_tokenizer: Any) -> None:
    shown = describe_mask(chatml_tokenizer, encode_chat(chatml_tokenizer, SINGLE))
    assert "⟦Üç iş günü içinde teslim edilir.<|im_end|>\n⟧" in shown
    assert shown.startswith("<|im_start|>system")


def test_sablonsuz_tokenizer_yol_gosteren_hata_verir(chatml_tokenizer: Any) -> None:
    import copy

    bare = copy.deepcopy(chatml_tokenizer)
    bare.chat_template = None
    with pytest.raises(UserError, match="sohbet şablonu yok"):
        encode_chat(bare, SINGLE)


def test_sablonun_reddettigi_rol_turkce_aciklanir() -> None:
    template = (
        "{% for m in messages %}{% if m['role'] == 'system' %}"
        "{{ raise_exception('System role not supported') }}{% endif %}"
        "<|u|>{{ m['content'] }}<|e|>{% endfor %}"
    )
    tokenizer = make_chat_tokenizer(["<|u|>", "<|e|>"], template, eos="<|e|>")
    with pytest.raises(UserError, match="System role not supported"):
        encode_chat(tokenizer, SINGLE)
