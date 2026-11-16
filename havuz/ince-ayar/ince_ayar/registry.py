"""Görev kaydı: `python -m ince_ayar <gorev> …` komutunun tanıdığı bütün görevler burada listelenir.

Kim kullanır: `ince_ayar/cli.py`. Bu dosya ve görevlerin `cli.py` dosyaları ağır kütüphane içe
aktarmaz; böylece yardım anında açılır.

Genişletme: yeni görev eklemek için
1. `ince_ayar/tasks/<ad>/` klasörünü en yakın görevi kopyalayarak açın (ör. sınıflandırma).
2. O klasörün `cli.py` dosyasında bir `TASK = TaskSpec(...)` tanımlayın.
3. Aşağıdaki sözlüğe `"<türkçe-ad>": <modül>.TASK` satırını ekleyin.
4. `yapilandirma/<türkçe-ad>/` altına üç hazır ayarı (`cpu-deneme`, `colab-t4`, `tek-gpu-24gb`) yazın.
5. `python scripts/check.py` — kural testleri eksik hazır ayarı ve yardım metnini yakalar.
"""

from __future__ import annotations

from ince_ayar.actions import TaskSpec
from ince_ayar.data import cli as data_cli
from ince_ayar.tasks.chat import cli as chat_cli
from ince_ayar.tasks.classification import cli as classification_cli
from ince_ayar.tasks.embedding import cli as embedding_cli
from ince_ayar.tasks.ner import cli as ner_cli

TASKS: dict[str, TaskSpec] = {
    "sohbet": chat_cli.TASK,
    "siniflandirma": classification_cli.TASK,
    "gomme": embedding_cli.TASK,
    "varlik": ner_cli.TASK,
    "veri": data_cli.TASK,
    # YENİ GÖREV BURAYA
}

# Hazır ayar dosyası olan (modelle çalışan) görevler; `veri` araçları yapılandırma istemez.
MODEL_TASKS = ("sohbet", "siniflandirma", "gomme", "varlik")
