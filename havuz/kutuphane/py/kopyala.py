"""kopyala — bir modülü (ve testini, ortak vektör dosyasını, varsa bağımlı olduğu dosyayı) başka projeye kopyalar.

Kullanım (py/ klasöründen):
    python kopyala.py turkce ../../projem/yardimcilar                 # turkce.py + test_turkce.py + vektorler/
    python kopyala.py para ../../projem/uygulama/araclar --paket uygulama.araclar
    python kopyala.py csv ./hedef                                      # csv_tr.py olarak yazar (aşağıya bakın)

--paket verilirse testteki içe aktarma "from <paket>.<modul> import …" olur; verilmezse "from <modul> import …".
`csv` modülü pakete konmadan kopyalanırsa standart kütüphanedeki csv'yi gölgelememesi için `csv_tr.py` adını alır.
Genişletme: Yeni bir seçenek `_parser()` içine eklenir ve `copy_module` içinde kullanılır.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STDLIB_SHADOWED = {"csv"}


def _target_name(module: str, package: str | None) -> str:
    return f"{module}_tr" if module in STDLIB_SHADOWED and not package else module


def _local_dependencies(source: str) -> list[str]:
    """Modülün içe aktardığı kardeş modüller (from kutuphane.x import …); kütüphanede normalde hiç yoktur."""
    return re.findall(r"^from kutuphane\.(\w+) import", source, re.MULTILINE)


def _rewrite_test(text: str, module: str, package: str | None) -> str:
    name = _target_name(module, package)
    if package:
        text = re.sub(r"\bfrom kutuphane\.(\w+) import", rf"from {package}.\1 import", text)
        return re.sub(r"\bfrom kutuphane import (\w+)", rf"from {package} import \1", text)
    text = re.sub(rf"\bfrom kutuphane\.{module} import", f"from {name} import", text)
    text = re.sub(
        rf"\bfrom kutuphane import {module}\b",
        f"import {name} as {module}" if name != module else f"import {module}",
        text,
    )
    return text


def _write(path: Path, content: str, overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise FileExistsError(f"{path} zaten var. Üzerine yazmak için --uzerine-yaz ekleyin.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def copy_module(
    module: str,
    target: Path,
    *,
    package: str | None = None,
    with_test: bool = True,
    overwrite: bool = False,
) -> list[str]:
    """Modülü hedefe kopyalar; kopyalanan dosyaların listesini döndürür."""
    source = HERE / "kutuphane" / f"{module}.py"
    if not re.fullmatch("[a-z_]+", module) or not source.exists():
        raise FileNotFoundError(f'"{module}" diye bir modül yok. Var olanlar: {HERE / "kutuphane"}')
    copied: list[str] = []
    queue, seen = [module], set()
    while queue:
        name = queue.pop(0)
        if name in seen:
            continue
        seen.add(name)
        text = (HERE / "kutuphane" / f"{name}.py").read_text(encoding="utf-8")
        file_name = f"{_target_name(name, package)}.py"
        _write(target / file_name, text, overwrite)
        copied.append(file_name)
        queue.extend(_local_dependencies(text))
    if with_test:
        test = (HERE / "tests" / f"test_{module}.py").read_text(encoding="utf-8")
        _write(target / f"test_{module}.py", _rewrite_test(test, module, package), overwrite)
        copied.append(f"test_{module}.py")
        vector = HERE.parent / "vektorler" / f"{module}.json"
        if vector.exists():
            destination = target / "vektorler" / f"{module}.json"
            if destination.exists() and not overwrite:
                raise FileExistsError(f"{destination} zaten var. --uzerine-yaz ekleyin.")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(vector, destination)
            copied.append(f"vektorler/{module}.json")
    return copied


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Kütüphaneden bir modülü başka projeye kopyalar.")
    parser.add_argument(
        "modul", help="kutuphane/ altındaki dosya adı (uzantısız), ör. turkce, para"
    )
    parser.add_argument("hedef", help="kopyanın yazılacağı klasör (yoksa oluşturulur)")
    parser.add_argument(
        "--paket", help="hedef paket adı (ör. uygulama.araclar); testteki içe aktarmayı ayarlar"
    )
    parser.add_argument("--test-yok", action="store_true", help="testi ve vektörü kopyalamaz")
    parser.add_argument(
        "--uzerine-yaz", action="store_true", help="aynı adlı dosyanın üzerine yazar"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        copied = copy_module(
            args.modul,
            Path(args.hedef).resolve(),
            package=args.paket,
            with_test=not args.test_yok,
            overwrite=args.uzerine_yaz,
        )
    except (FileNotFoundError, FileExistsError) as error:
        print(error, file=sys.stderr)
        return 1
    print(f"Kopyalandı → {Path(args.hedef).resolve()}")
    for name in copied:
        print(f"  {name}")
    if args.modul in STDLIB_SHADOWED and not args.paket:
        print(
            f"Not: standart kütüphanedeki {args.modul} ile çakışmasın diye {args.modul}_tr.py adı verildi."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
