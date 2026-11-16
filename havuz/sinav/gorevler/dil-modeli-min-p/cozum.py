"""Başvuru çözümü: SamplingConfig.min_p + min_p_filter + next_token + --min-p + test.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: sampling.py ya da komut satırı yardımcıları değişirse aranan metinleri güncelleyin.
"""

from pathlib import Path

from exam.edit import insert_before, read, replace, run, write

FILTER = '''def min_p_filter(logits: Tensor, p: float) -> Tensor:
    """Min-p: olasılığı en olası belirtecinkinin p katından küçük olanları -sonsuz yapar.

    En olası belirteç her zaman kalır. Toplu girdide (B, sözlük) her satır kendi içinde süzülür.
    """
    if p <= 0.0:
        return logits
    probs = torch.softmax(logits, dim=-1)
    threshold = probs.max(dim=-1, keepdim=True).values * p
    return logits.masked_fill(probs < threshold, float("-inf"))


'''

TEST = """

def test_min_p_keeps_tokens_above_fraction_of_the_best() -> None:
    logits = _logits([0.5, 0.3, 0.15, 0.05])
    kept = min_p_filter(logits, 0.2)  # eşik 0.5 * 0.2 = 0.1
    assert torch.isinf(kept[0, 3])
    assert not torch.isinf(kept[0, :3]).any()
    assert torch.equal(min_p_filter(logits, 0.0), logits)
    with pytest.raises(ValueError, match="min_p"):
        SamplingConfig(min_p=1.5)
"""


def coz(kopya: Path) -> None:
    sampling = kopya / "dil_modeli/sampling.py"
    replace(
        sampling,
        "    repetition_penalty: float = 1.0",
        "    min_p: float = 0.0  # en olasının olasılığının bu katından düşük olanları ele (0: kapalı)\n"
        "    repetition_penalty: float = 1.0",
    )
    replace(
        sampling,
        "        if self.repetition_penalty <= 0:",
        "        if not 0.0 <= self.min_p <= 1.0:\n"
        "            raise ValueError(\"'min_p' 0 ile 1 arasında olmalı (0: kapalı).\")\n"
        "        if self.repetition_penalty <= 0:",
    )
    insert_before(sampling, "def next_token(", FILTER)
    replace(
        sampling,
        "    # YENİ ÖRNEKLEME YÖNTEMİ BURAYA",
        "    logits = min_p_filter(logits, config.min_p)\n    # YENİ ÖRNEKLEME YÖNTEMİ BURAYA",
    )
    replace(
        kopya / "dil_modeli/cli_common.py",
        '    parser.add_argument(\n        "--yineleme-cezasi"',
        '    parser.add_argument(\n        "--min-p", type=float, default=0.0,'
        ' help="en olasının bu katından düşük olasılıkları ele (0: kapalı)"\n    )\n'
        '    parser.add_argument(\n        "--yineleme-cezasi"',
    )
    replace(
        kopya / "dil_modeli/cli_generate.py",
        "        top_p=args.top_p,\n",
        "        top_p=args.top_p,\n        min_p=args.min_p,\n",
    )
    tests = kopya / "tests/test_sampling.py"
    replace(tests, "    make_generator,\n", "    make_generator,\n    min_p_filter,\n")
    write(tests, read(tests) + TEST)
    python = str(kopya / ".venv/bin/python")
    run(
        [
            python,
            "-m",
            "ruff",
            "format",
            "-q",
            "dil_modeli/sampling.py",
            "dil_modeli/cli_common.py",
            "tests/test_sampling.py",
        ],
        kopya,
    )
