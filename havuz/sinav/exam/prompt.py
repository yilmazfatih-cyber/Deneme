"""Görev klasöründeki GOREV.md: sahibi için kısa yönerge + ajana verilecek iki ileti.

1. ileti: `rehber/ISTEMLER.md` §1 "Oturum başlangıcı" — dosyadan OKUNUR (tek kaynak), yer tutucular
   temelin klasör adı ve denetim komutuyla doldurulur. Metnin özeti kayda yazılır; rapor, farklı
   başlangıç istemiyle sınanmış sonuçları ayrıca belirtir (adil karşılaştırma).
2. ileti: görevin kendi `GOREV.md` dosyası (gorevler/<kimlik>/GOREV.md).
Genişletme: ISTEMLER.md §1'in biçimi değişirse `start_prompt` içindeki ayıklamayı güncelleyin;
tests/test_gorevler.py hiçbir `<…>` yer tutucusu kalmadığını denetler.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from exam.paths import ISTEMLER


class PromptError(RuntimeError):
    """ISTEMLER.md §1 bulunamadı ya da yer tutucular doldurulamadı."""


def start_prompt(folder_name: str, check_text: str, source: Path = ISTEMLER) -> str:
    """ISTEMLER.md §1'deki ```text bloğunu alır, yer tutucuları doldurur."""
    text = source.read_text(encoding="utf-8")
    section = re.search(r"^## 1\..*?```text\n(.*?)```", text, re.DOTALL | re.MULTILINE)
    if not section:
        raise PromptError(f"{source}: '## 1.' başlıklı bölümde ```text bloğu bulunamadı.")
    prompt = section.group(1).rstrip()
    prompt = re.sub(r"<temel klasörü[^>]*>", folder_name, prompt)
    prompt = re.sub(r"<ör\.\s*npm run check>", check_text, prompt)
    leftover = re.findall(r"<[^<>]+>", prompt)
    if leftover:
        raise PromptError(f"Başlangıç isteminde doldurulamayan yer tutucu: {', '.join(leftover)}")
    return prompt


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def task_file(title: str, prompt: str, message: str, folder: str, task_id: str) -> str:
    """Görev klasörüne yazılacak GOREV.md metni."""
    return f"""# Görev: {title}

> **Sahibi için.** Kod ajanınızı BU klasörde başlatın (ör. `cd {folder}` sonra ajanınızın komutu).
> Aşağıdaki iki iletiyi sırayla verin: 1. iletiye yanıt gelince 2. iletiyi yapıştırın. Sonra ajan
> "bitti" diyene ya da süre sınırı dolana kadar araya girmeyin (kurallar: `havuz/sinav/README.md`).
> Bitince puanlayın: `python havuz/sinav/sinav.py puanla {folder} --etiket <model-adı>`
> Görev kimliği: `{task_id}`

## 1. ileti (oturum başlangıcı)

````text
{prompt}
````

## 2. ileti (görev)

````text
{message.strip()}
````
"""
