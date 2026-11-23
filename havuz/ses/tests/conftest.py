"""pytest ayarları: işaretli testleri ortam değişkenine göre açar.

`model`: indirilmiş gerçek model ister → SES_MODEL=1 (ve SES_MODEL_DIZINI) ile koşar.
`ag`: ağ ister → SES_AG=1 ile koşar. İkisi de varsayılan olarak ATLANIR (denetim çevrimdışıdır).
Genişletme: yeni bir işaret → pyproject.toml [tool.pytest.ini_options] markers + aşağıdaki sözlük.
"""

import os

import pytest

_ACICILAR = {"model": "SES_MODEL", "ag": "SES_AG"}


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    for oge in items:
        for isaret, degisken in _ACICILAR.items():
            if isaret in oge.keywords and os.environ.get(degisken) != "1":
                oge.add_marker(pytest.mark.skip(reason=f"{degisken}=1 ile açılır"))
