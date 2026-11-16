"""Temellerle ilgili her şey: bulma, kopyalama, bağımlılık kurma, denetim komutları, koruma kuralları.

Kopyalama ve kurulum havuzun ortak araçlarını yeniden kullanır (`havuz/araclar`): `yeni_proje.py`'nin
atlama kuralları ve `denetle.py`'nin Python ortamı kurma mantığı. Böylece görev klasörü, sahibinin
`yeni_proje.py` ile açacağı bir projeyle aynı olur.

Koruma kuralları (`protection`): `degismez` desenine uyan dosya hiç değişmemeli; `yalniz_ekleme`
desenine uyan dosyaya (testler, test verisi) yalnız ekleme yapılabilir; `yeni_yasak` desenine uyan dosya
yeni oluşturulamaz (denetimi gevşetmenin yolları: conftest.py, pytest.ini, .prettierignore…).
Genişletme: yeni temel için `_OZEL` sözlüğüne kural testleri ve test verisi desenlerini ekleyin.
"""

from __future__ import annotations

import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from exam.paths import ARACLAR

if str(ARACLAR) not in sys.path:  # havuz/araclar betik klasörüdür; paket değil
    sys.path.insert(0, str(ARACLAR))

import denetle
import ortak
import yeni_proje

Temel = ortak.Temel

# Bütünlük ve fark hesabında hiç bakılmayan klasörler (bağımlılık, önbellek, derleme çıktısı).
EXCLUDED_DIRS = frozenset(
    {
        "node_modules", ".venv", "venv", "__pycache__", ".mypy_cache", ".ruff_cache", ".pytest_cache",
        ".hypothesis", ".astro", "dist", "dist-alt", "dist-yerel", "dev-dist", "build", "coverage",
        "test-results", "playwright-report", ".data", ".git", ".vite", ".yz", "ciktilar", "calisma",
    }
)  # fmt: skip
EXCLUDED_SUFFIXES = (".egg-info", ".pyc", ".tsbuildinfo")

_ORTAK_DEGISMEZ = (
    "**/package.json", "**/package-lock.json", "**/pyproject.toml", "**/uv.lock",
    "**/requirements*.lock", "**/tsconfig*.json", "**/eslint.config.*", "**/.prettierrc*",
    "**/.prettierignore", "**/vitest.config.*", "**/vitest.*.config.*", "**/playwright*.config.*",
    "**/scripts/check.py", "**/.gitignore", "havuz.json", "**/conftest.py", "**/setup.cfg",
    "**/pytest.ini", "**/tox.ini", "**/ruff.toml", "**/.ruff.toml", "**/mypy.ini",
)  # fmt: skip
_ORTAK_EKLEME = (
    "**/test/**", "**/tests/**", "e2e/**", "**/*.test.*", "**/*.spec.*", "**/test_*.py",
    "**/*_test.py",
)  # fmt: skip
_ORTAK_YENI_YASAK = (
    "**/conftest.py", "**/pytest.ini", "**/setup.cfg", "**/tox.ini", "**/ruff.toml", "**/.ruff.toml",
    "**/mypy.ini", "**/.mypy.ini", "**/vitest.config.*", "**/vitest.workspace.*", "**/.prettierignore",
    "**/eslint.config.*", "**/.eslintrc*", "**/.gitignore", "**/sitecustomize.py",
    "**/usercustomize.py",
)  # fmt: skip

# Temele özgü: kural testleri ve denetim betikleri (değişmez), test verisi (yalnız ekleme).
_OZEL: dict[str, dict[str, tuple[str, ...]]] = {
    "uygulama": {
        "degismez": ("web/test/rules/**", "api/test/rules.test.ts", "scripts/test/**"),
        "ekleme": (),
    },
    "site": {
        "degismez": ("tests/rules/**", "scripts/check-site.ts", "scripts/audit/**"),
        "ekleme": (),
    },
    "kutuphane": {
        "degismez": ("ts/test/kurallar.test.ts", "py/tests/test_kurallar.py"),
        "ekleme": ("vektorler/**",),
    },
    "yz": {"degismez": ("tests/test_kurallar.py",), "ekleme": ("gorevler/**",)},
    "ml-temel": {"degismez": ("tests/test_rules.py",), "ekleme": ("ornekler/beklenen/**",)},
    "veri": {"degismez": ("tests/test_rules.py",), "ekleme": ()},
    "dil-modeli": {"degismez": ("tests/test_rules.py",), "ekleme": ("tarayici/sinama/**",)},
}


@dataclass(frozen=True)
class Protection:
    """Bir görevin koruma kuralları (desenler temel kopyasının köküne göredir)."""

    strict: tuple[str, ...]
    additive: tuple[str, ...]
    forbidden_new: tuple[str, ...]
    allowed: tuple[str, ...] = ()


def protection_for(
    foundation: str, allowed: tuple[str, ...], strict_extra: tuple[str, ...]
) -> Protection:
    special = _OZEL.get(foundation, {})
    return Protection(
        strict=_ORTAK_DEGISMEZ + special.get("degismez", ()) + strict_extra,
        additive=_ORTAK_EKLEME + special.get("ekleme", ()),
        forbidden_new=_ORTAK_YENI_YASAK,
        allowed=allowed,
    )


def find_foundation(name: str) -> ortak.Temel:
    """Havuzdaki temeli bulur; yoksa yol gösteren `SystemExit` (ortak.temel_sec)."""
    return ortak.temel_sec([name])[0]


def copy_foundation(foundation: ortak.Temel, target: Path) -> None:
    """Temeli `target`'a kopyalar; `yeni_proje.py` ile aynı klasörleri atlar."""
    ignore = yeni_proje.atlanacaklar(foundation.yol.resolve(), foundation.liste("kopyalamaHaric"))
    shutil.copytree(foundation.yol, target, ignore=ignore)


def at_copy(foundation: ortak.Temel, copy_root: Path) -> ortak.Temel:
    """Aynı havuz.json bildirimiyle, kopyadaki konumu gösteren `Temel` nesnesi."""
    return ortak.Temel(copy_root, foundation.bildirim)


def install_commands(copy: ortak.Temel) -> list[tuple[str | list[str], Path]]:
    """Kopyanın bağımlılıklarını kuracak (komut, klasör) çiftleri: `kur` + Python ortamı."""
    commands: list[tuple[str | list[str], Path]] = [(c, copy.yol) for c in copy.liste("kur")]
    if copy.python_var:
        commands += [(c, copy.python_klasoru) for c in denetle.python_kur(copy)]
    return commands


def check_commands(copy: ortak.Temel, override: tuple[str, ...] = ()) -> list[str]:
    """Temelin hızlı denetim komutları (havuz.json → `denetle`), görev isterse kendi listesi."""
    return list(override) or copy.liste("denetle")


def venv_root(copy: ortak.Temel) -> Path | None:
    """Python ortamının (.venv) bulunduğu klasör; Python'suz temelde None."""
    return copy.python_klasoru if copy.python_var else None


def command_env(
    copy: ortak.Temel, extra: dict[str, str] | None = None, *, venv: bool = True
) -> dict[str, str]:
    """Komut ortamı: Python temelinde `.venv/bin` PATH'in başında; renk kapalı; ek değişkenler.

    `venv=False`: kurulum için — sınavı çalıştıran Python'un sanal ortamı (VIRTUAL_ENV) karışmasın.
    """
    root = venv_root(copy) if venv else None
    env = ortak.ortam_venv_ile(root) if root else dict(os.environ)
    if not venv:
        env.pop("VIRTUAL_ENV", None)
    env.update({"NO_COLOR": "1", "FORCE_COLOR": "0", "CI": "1", "PYTHONUNBUFFERED": "1"})
    env.update(extra or {})
    return env


def check_text_for_agent(folder_name: str, commands: list[str]) -> str:
    """Ajana söylenecek denetim komutu: görev kökünden çalıştırılacak biçimde (`cd temel && …`)."""
    parts = []
    for command in commands:
        text = command.replace("python scripts/", ".venv/bin/python scripts/")
        if text.startswith("cd ") and " && " in text:
            sub, rest = text[3:].split(" && ", 1)
            parts.append(f"`cd {folder_name}/{sub} && {rest}`")
        else:
            parts.append(f"`cd {folder_name} && {text}`")
    return " ve ".join(parts)
