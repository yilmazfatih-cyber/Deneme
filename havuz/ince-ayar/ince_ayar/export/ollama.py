"""Ollama `Modelfile` üretimi: modelin sohbet şablonu ailesini tanır, Ollama'nın kendi şablonunu yazar.

Kim kullanır: `tasks/chat/export.py` (`sohbet disa-aktar`).

Aile tanıma şablon metnine değil **çıktısına** bakar: örnek bir sohbet modelin şablonuyla metne
çevrilir ve içindeki işaretlere göre aile seçilir (ChatML, Llama 3, Gemma 3, Phi-3). Şablonlar ve
durma dizileri Ollama deposundan değiştirilmeden alınmıştır (`ollama_sablonlari/KAYNAK.md`).
Tanınmayan ailede `TEMPLATE` yazılmaz; Ollama şablonu GGUF içindeki `tokenizer.chat_template`
bilgisinden çıkarmaya çalışır (bu durum **doğrulanmadı**).

DİKKAT: Bu makinede Ollama yoktur; üretilen `Modelfile` Ollama'da çalıştırılarak denenmemiştir.

Genişletme: yeni aile için Ollama deposundan `<ad>.gotmpl` ve `<ad>.json` dosyalarını
`ollama_sablonlari/` içine koyup `FAMILY_MARKERS` listesine `(ad, işaret)` ekleyin.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ince_ayar.tasks.chat.masking import render

TEMPLATE_DIR = Path(__file__).with_name("ollama_sablonlari")
# Sıra önemlidir: ilk eşleşen aile seçilir.
FAMILY_MARKERS: list[tuple[str, str]] = [
    ("chatml", "<|im_start|>assistant"),
    ("llama3-instruct", "<|start_header_id|>assistant<|end_header_id|>"),
    ("gemma3-instruct", "<start_of_turn>model"),
    ("phi-3", "<|assistant|>"),
    # YENİ AİLE BURAYA
]
PROBE = [{"role": "user", "content": "Merhaba"}, {"role": "assistant", "content": "Selam"}]


def detect_family(tokenizer: Any) -> str | None:
    """Tokenizer'ın sohbet şablonunu Ollama şablon ailelerinden birine eşler; bulamazsa None."""
    text = render(tokenizer, PROBE)
    for family, marker in FAMILY_MARKERS:
        if marker in text:
            return family
    return None


def family_template(family: str) -> tuple[str, dict[str, Any]]:
    """Ailenin Go şablonu ve parametreleri (durma dizileri, varsa sıcaklık)."""
    template = (TEMPLATE_DIR / f"{family}.gotmpl").read_text(encoding="utf-8")
    params = json.loads((TEMPLATE_DIR / f"{family}.json").read_text(encoding="utf-8"))
    return template, params


def _quote(text: str) -> str:
    if '"""' in text:
        raise ValueError('Modelfile metni üç tırnak (""") içeremez')
    return f'"""{text}"""'


def build_modelfile(
    gguf_name: str,
    family: str | None,
    system: str | None,
    context: int,
    eos_token: str | None,
    license_note: str,
) -> str:
    """Modelfile metnini üretir. `gguf_name`, Modelfile ile aynı klasördeki GGUF dosyasının adıdır."""
    lines = [
        "# Bu dosya `python -m ince_ayar sohbet disa-aktar` ile üretildi.",
        "# Kullanım:  ollama create MODEL_ADI -f Modelfile   sonra   ollama run MODEL_ADI",
        f"FROM ./{gguf_name}",
    ]
    if family is not None:
        template, params = family_template(family)
        lines.append(f"# Şablon ailesi: {family} (Ollama deposundaki şablonun aynısı)")
        lines.append(f"TEMPLATE {_quote(template)}")
        lines.extend(f'PARAMETER stop "{stop}"' for stop in params.get("stop", []))
        if "temperature" in params:
            lines.append(f"PARAMETER temperature {params['temperature']}")
    else:
        lines.append("# Şablon ailesi tanınmadı: Ollama şablonu GGUF içindeki bilgiden çıkarmaya")
        lines.append("# çalışır. Yanıtlar bozuksa TEMPLATE satırını elle ekleyin (doğrulanmadı).")
        if eos_token:
            lines.append(f'PARAMETER stop "{eos_token}"')
    lines.append(f"PARAMETER num_ctx {context}")
    if system:
        lines.append(f"SYSTEM {_quote(system)}")
    lines.append(f"LICENSE {_quote(license_note)}")
    return "\n".join(lines) + "\n"
