"""Hugging Face klasörünü llama.cpp'nin dönüştürücüsüyle GGUF'a çevirir (Ollama için).

llama.cpp, BPE tokenizer'ın ön-bölme kuralını bir sınama metninin kimlik özetinden tanır;
bizim tokenizer'ımızın özeti listede olmadığı için dönüştürücü "BPE pre-tokenizer was not
recognized" hatası verir. Ön-bölme kuralımız birebir GPT-2 kuralı olduğundan bu betik, yalnız
tanınmayan durumda "gpt-2" döndürecek biçimde tanıma işlevini sarar ve dönüştürücüyü çalıştırır.
Dönüştürücü llama.cpp deposundan alınır (adımlar: docs/OLLAMA.md). Bu betik dönüştürücünün
`conversion/` paketine bölünmüş yeni düzeniyle denendi (Kasım 2026).

Kullanım:
    python scripts/gguf_donustur.py --donusturucu <llama.cpp>/convert_hf_to_gguf.py \
        calisma/hf-model --outfile calisma/model.gguf --outtype f16

Genişletme: Farklı bir ön-bölme kuralı kullanan tokenizer eklerseniz llama.cpp'deki karşılığını
`PRE_TOKENIZER` yerine yazın; karşılığı yoksa GGUF yolu o tokenizer için çalışmaz.
"""

from __future__ import annotations

import argparse
import runpy
import sys
from pathlib import Path
from typing import Any

PRE_TOKENIZER = "gpt-2"  # llama.cpp'de GPT-2 ön-bölme kuralının adı


def main() -> None:
    parser = argparse.ArgumentParser(
        description="HF klasörünü GGUF'a çevirir (llama.cpp dönüştürücüsüyle)."
    )
    parser.add_argument(
        "--donusturucu", type=Path, required=True, help="convert_hf_to_gguf.py yolu"
    )
    args, rest = parser.parse_known_args()
    script = args.donusturucu.resolve()
    folder = script.parent
    if not (folder / "conversion" / "base.py").is_file():
        raise SystemExit(
            f"{folder / 'conversion' / 'base.py'} bulunamadı. Dönüştürücünün yanındaki conversion/ "
            "(ve varsa gguf-py/) klasörünü de indirin; adımlar docs/OLLAMA.md içinde."
        )
    sys.path.insert(0, str(folder))
    if (folder / "gguf-py").is_dir():
        sys.path.insert(1, str(folder / "gguf-py"))
    import conversion.base as base  # dönüştürücünün kendi paketi (yukarıda yola eklendi)

    original = base.TextModel.get_vocab_base_pre

    def recognize(self: Any, tokenizer: Any) -> str:
        try:
            result: str = original(self, tokenizer)
        except NotImplementedError:
            print(f"Not: tokenizer özeti tanınmadı; ön-bölme '{PRE_TOKENIZER}' olarak yazılıyor.")
            return PRE_TOKENIZER
        return result

    base.TextModel.get_vocab_base_pre = recognize
    sys.argv = [str(script), *rest]
    runpy.run_path(str(script), run_name="__main__")


if __name__ == "__main__":
    main()
