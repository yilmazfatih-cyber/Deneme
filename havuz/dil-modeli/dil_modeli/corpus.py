"""Derlem okuma: .txt / .jsonl dosyalarını belge parçaları hâlinde, akışla verir.

Tokenizer eğitimi (`tokenizer_train.py`) ve veri hazırlama (`data.py`) aynı okuyucuyu kullanır;
böylece ikisi de aynı temizlenmiş metni görür. Dosyanın tümü belleğe alınmaz.

Belge tanımı: .jsonl dosyasında her satır bir belgedir (`{"text": "..."}`); .txt dosyasında
dosyanın tümü tek belgedir (`line_documents=True` ise her satır ayrı belge). Uzun belgeler
`chunk_chars` uzunluğunda parçalara bölünür; eğitim/doğrulama ayrımı parça bazında yapılır.

Genişletme: Yeni bir dosya türü için `_file_documents` içine bir dal ekleyin
("YENİ DOSYA TÜRÜ BURAYA") ve tests/test_data.py'ye örnek koyun.
"""

from __future__ import annotations

import json
import unicodedata
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO

TEXT_SUFFIXES = (".txt", ".md", ".jsonl")


@dataclass(frozen=True)
class Piece:
    """Bir belgenin parçası. `first`/`last` belge sınırı belirteçlerinin yerini belirler."""

    text: str
    first: bool
    last: bool


@dataclass(frozen=True)
class CorpusOptions:
    text_field: str = "text"  # .jsonl satırındaki metin alanı
    line_documents: bool = False  # .txt: her satır ayrı belge
    chunk_chars: int = 100_000  # uzun belgeler bu uzunlukta parçalanır
    encoding: str = "utf-8-sig"  # eski Türkçe dosyalar için "cp1254" deneyin
    normalize: bool = True  # Unicode NFC (ayrık yazılmış ğ, ü... tek karaktere toplanır)


def expand_inputs(inputs: Sequence[str | Path]) -> list[Path]:
    """Dosya ve klasör listesini sıralı dosya listesine açar."""
    files: list[Path] = []
    for item in inputs:
        path = Path(item)
        if path.is_dir():
            found = sorted(p for p in path.rglob("*") if p.is_file() and p.suffix in TEXT_SUFFIXES)
            if not found:
                raise FileNotFoundError(f"{path} klasöründe .txt / .md / .jsonl dosyası yok.")
            files.extend(found)
        elif path.is_file():
            files.append(path)
        else:
            raise FileNotFoundError(f"Girdi bulunamadı: {path}. Dosya yolunu denetleyin.")
    if not files:
        raise ValueError("En az bir girdi dosyası verin (--girdi metin.txt).")
    return files


def iter_pieces(paths: Sequence[Path], options: CorpusOptions | None = None) -> Iterator[Piece]:
    """Bütün dosyalardaki belgeleri sırayla, parça parça verir."""
    opts = options or CorpusOptions()
    if opts.chunk_chars < 1:
        raise ValueError("'chunk_chars' en az 1 olmalı.")
    for path in paths:
        try:
            with path.open("r", encoding=opts.encoding) as handle:
                yield from _file_documents(path, handle, opts)
        except UnicodeDecodeError:
            raise ValueError(
                f"{path} dosyası {opts.encoding} olarak okunamadı. Eski Türkçe metinler çoğunlukla "
                "Windows-1254 ile kayıtlıdır: --kodlama cp1254 seçeneğini deneyin."
            ) from None


def iter_texts(paths: Sequence[Path], options: CorpusOptions | None = None) -> Iterator[str]:
    """Yalnız metinleri verir (tokenizer eğitimi için)."""
    for piece in iter_pieces(paths, options):
        yield piece.text


def _file_documents(path: Path, handle: TextIO, opts: CorpusOptions) -> Iterator[Piece]:
    if path.suffix == ".jsonl":
        for number, line in enumerate(handle, start=1):
            if line.strip():
                yield from _document_pieces(_split(_json_text(path, number, line, opts), opts), opts)
    elif opts.line_documents:
        for line in handle:
            if line.strip():
                yield from _document_pieces(_split(line.rstrip("\n"), opts), opts)
    # YENİ DOSYA TÜRÜ BURAYA
    else:
        yield from _document_pieces(_stream_chunks(handle, opts.chunk_chars), opts)


def _json_text(path: Path, number: int, line: str, opts: CorpusOptions) -> str:
    try:
        record = json.loads(line)
    except json.JSONDecodeError as error:
        raise ValueError(f"{path}:{number} geçerli JSON değil ({error.msg}).") from None
    text = record.get(opts.text_field) if isinstance(record, dict) else None
    if not isinstance(text, str):
        raise ValueError(
            f"{path}:{number} satırında '{opts.text_field}' adlı metin alanı yok. "
            "Alan adı farklıysa --alan seçeneğiyle belirtin."
        )
    return text


def _document_pieces(chunks: Iterator[str], opts: CorpusOptions) -> Iterator[Piece]:
    """Bir belgenin parçalarını `first`/`last` işaretleriyle verir (bir parça geriden gelerek)."""
    previous: str | None = None
    first = True
    for chunk in chunks:
        if not chunk:
            continue
        if previous is not None:
            yield Piece(previous, first, False)
            first = False
        previous = unicodedata.normalize("NFC", chunk) if opts.normalize else chunk
    if previous is not None:
        yield Piece(previous, first, True)


def _split(text: str, opts: CorpusOptions) -> Iterator[str]:
    """Bellekteki uzun metni parçalara böler; kısa metin tek parça kalır."""
    start = 0
    while len(text) - start > opts.chunk_chars:
        cut = _cut_point(text, start, start + opts.chunk_chars)
        yield text[start:cut]
        start = cut
    yield text[start:]


def _stream_chunks(handle: TextIO, chunk_chars: int) -> Iterator[str]:
    """Dosyayı sabit boyutlu bloklarla okur; parçaları satır (yoksa boşluk) sonunda keser."""
    carry = ""
    while True:
        block = handle.read(chunk_chars)
        buffer = carry + block
        if len(block) < chunk_chars:  # dosyanın sonu: kalan her şey son parçadır
            if buffer:
                yield buffer
            return
        cut = _cut_point(buffer, 0, len(buffer))
        yield buffer[:cut]
        carry = buffer[cut:]


def _cut_point(text: str, start: int, end: int) -> int:
    """[start, end) aralığında parçanın biteceği yer: son satır sonu, yoksa son boşluk, yoksa `end`."""
    for separator in ("\n", " "):
        index = text.rfind(separator, start, end)
        if index > start:
            return index + 1
    return end
