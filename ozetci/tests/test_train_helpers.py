import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))

from common import example_to_prompt_completion, format_target, sentences_as_bullets  # noqa: E402
from synth_noise import add_ocr_noise  # noqa: E402
import eval as ev  # noqa: E402

from ozetci.summarize.output_parse import parse_summary


def test_format_target_roundtrip():
    target = format_target("Fatura ödenmeli.", ["Tutar 1.250 TL"], ["Dekontu ilet"], lang="tr")
    s = parse_summary(target, "tr")
    assert s.text == "Fatura ödenmeli." and s.bullets == ["Tutar 1.250 TL"] and s.actions == ["Dekontu ilet"]
    en = format_target("Pay the invoice.", [], [], lang="en")
    assert parse_summary(en, "en").actions == [] and "- None" in en


def test_prompt_completion_shape():
    row = example_to_prompt_completion("metin " * 50, "ÖZET: x", "email", "tr", title="Konu")
    assert row["prompt"][0]["role"] == "system" and row["prompt"][1]["role"] == "user"
    assert row["completion"] == [{"role": "assistant", "content": "ÖZET: x"}]
    assert "Başlık: Konu" in row["prompt"][1]["content"]


def test_ocr_noise_changes_text_but_keeps_length_roughly():
    import random

    text = "İstanbul'da şiddetli yağış bekleniyor. Fatura tutarı 1.250 TL, son ödeme 15 Mart. " * 5
    noisy = add_ocr_noise(text, rate=0.05, rng=random.Random(1))
    assert noisy != text and 0.8 < len(noisy) / len(text) < 1.3


def test_rouge_and_hallucination():
    assert ev.rouge_l("fatura 15 mart ödenecek", "fatura 15 mart ödenecek") == 1.0
    assert ev.rouge_l("tamamen farklı", "fatura 15 mart") == 0.0
    assert ev.number_hallucination("Tutar 1.250 TL ve 99 adet", "Tutar 1.250 TL") == 0.5
    assert sentences_as_bullets("Bir iki üç. Dört beş altı yedi.") == ["Bir iki üç.", "Dört beş altı yedi."]


def test_ocr_noise_preserves_digits_and_amounts():
    import random

    text = "Fatura tutarı 1.250,75 TL, son ödeme 15/03/2025, sipariş no 2025-031. " * 10
    noisy = add_ocr_noise(text, rate=0.2, rng=random.Random(3))
    for tok in ("1.250,75", "15/03/2025", "2025-031"):
        assert noisy.count(tok) == 10


def test_eval_source_text_and_hallucination_turkish_formats():
    assert ev.source_text("ÖZET...\n\nMETİN:\nTutar 1.250 TL\n") == "Tutar 1.250 TL\n"
    assert ev.number_hallucination("Tutar 1.250 TL ve 15 Mart", "Tutar 1.250 TL, son ödeme 15 Mart") == 0.0
    assert ev.number_hallucination("Tutar 9.999 TL", "Tutar 1.250 TL") == 1.0
