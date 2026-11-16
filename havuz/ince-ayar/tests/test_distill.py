"""Damıtma örneği: kayıp tanımı (sonlu durumlar ve elle hesap) ve minik modellerde öğrenme."""

from __future__ import annotations

import math
from pathlib import Path

import pytest
import torch

from ince_ayar.errors import UserError
from ince_ayar.tasks.chat.distill import check_same_vocabulary, distill, distillation_loss
from ince_ayar.tasks.chat.masking import encode_chat
from ince_ayar.tiny import create_tiny_chat_model, train_chat_tokenizer

TEXTS = ["Kargom ne zaman gelir?", "Üç iş günü içinde teslim edilir.", "İade on dört gündür."]
CHAT = [{"role": "user", "content": TEXTS[0]}, {"role": "assistant", "content": TEXTS[1]}]


def test_ayni_dagilimda_kayip_sifir_ve_maske_disi_sayilmaz() -> None:
    logits = torch.randn(1, 5, 7)
    labels = torch.tensor([[-100, -100, 3, 4, 5]])
    assert distillation_loss(logits, logits, labels).item() == pytest.approx(0.0, abs=1e-6)
    shifted = logits.clone()
    shifted[:, :1] += 10.0  # yalnız maskeli (kayba girmeyen) konum değişti
    assert distillation_loss(shifted, logits, labels).item() == pytest.approx(0.0, abs=1e-6)


def test_kayip_elle_hesapla_ayni() -> None:
    student = torch.tensor([[[0.0, 0.0], [1.0, 0.0]]])
    teacher = torch.tensor([[[0.0, 2.0], [0.0, 0.0]]])
    labels = torch.tensor([[-100, 1]])
    p = torch.softmax(teacher[0, 0] / 2, dim=-1)
    q = torch.softmax(student[0, 0] / 2, dim=-1)
    expected = 4 * float((p * (p.log() - q.log())).sum())
    assert distillation_loss(student, teacher, labels, temperature=2.0).item() == pytest.approx(
        expected
    )


def test_ogrenci_ogretmene_yaklasir(tmp_path: Path) -> None:
    from transformers import AutoModelForCausalLM, AutoTokenizer

    create_tiny_chat_model(TEXTS, tmp_path / "ogretmen", seed=1)
    create_tiny_chat_model(TEXTS, tmp_path / "ogrenci", seed=2)
    tokenizer = AutoTokenizer.from_pretrained(tmp_path / "ogretmen")
    check_same_vocabulary(tokenizer, AutoTokenizer.from_pretrained(tmp_path / "ogrenci"))
    teacher = AutoModelForCausalLM.from_pretrained(tmp_path / "ogretmen")
    student = AutoModelForCausalLM.from_pretrained(tmp_path / "ogrenci")
    encoded = encode_chat(tokenizer, CHAT)
    batch = {
        "input_ids": torch.tensor([encoded.input_ids]),
        "attention_mask": torch.ones(1, len(encoded.input_ids), dtype=torch.long),
        "labels": torch.tensor([encoded.labels]),
    }
    history = distill(student, teacher, [batch] * 8, learning_rate=5e-3)
    assert all(math.isfinite(value) for value in history)
    assert history[-1] < history[0] * 0.8


def test_farkli_sozluk_yol_gosteren_hata() -> None:
    first = train_chat_tokenizer(TEXTS, vocab_size=300)
    second = train_chat_tokenizer([*TEXTS, "bambaşka bir metin"], vocab_size=320)
    with pytest.raises(UserError, match="aynı tokenizer"):
        check_same_vocabulary(first, second)
