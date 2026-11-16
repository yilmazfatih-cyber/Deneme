"""Tohum dilinin hata türü ve hata iletisinin biçimi (satır/sütun + şapka + ipucu).

Her aşama (sözcük çözümleyici, ayrıştırıcı, çözümleyici, yorumlayıcı, sanal makine) aynı
`TohumError` sınıfını kullanır; böylece hata iletileri tek yerden biçimlenir.
İleti kuralı: konum + ne beklendi + ne bulundu + (uygunsa) ipucu.
Genişletme: yeni bir hata türü için `KINDS` sözlüğüne bir satır ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Pos:
    """Kaynaktaki konum; satır ve sütun 1'den başlar (sütun = karakter sırası)."""

    line: int
    col: int

    def __str__(self) -> str:
        return f"{self.line}:{self.col}"


SYNTAX = "sozdizimi"
SCOPE = "kapsam"
RUNTIME = "calisma"
LIMIT = "sinir"

# Hata türü -> kullanıcıya görünen başlık. YENİ HATA TÜRÜ BURAYA.
KINDS = {
    SYNTAX: "Sözdizimi hatası",
    SCOPE: "Kapsam hatası",
    RUNTIME: "Çalışma hatası",
    LIMIT: "Sınır aşıldı",
}


class TohumError(Exception):
    """Tohum programındaki her hatanın türü.

    `kind`: SYNTAX/SCOPE/RUNTIME/LIMIT; `pos`: konum (yoksa None); `hint`: yol gösteren öneri.
    `at_eof`: hata dosya sonunda mı oluştu (REPL bunu "devam satırı iste" diye yorumlar).
    """

    def __init__(
        self,
        kind: str,
        message: str,
        pos: Pos | None = None,
        hint: str | None = None,
        *,
        at_eof: bool = False,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.pos = pos
        self.hint = hint
        self.at_eof = at_eof

    def headline(self) -> str:
        """Tek satırlık özet: 'Çalışma hatası (satır 3, sütun 5): …'."""
        title = KINDS.get(self.kind, "Hata")
        where = f" (satır {self.pos.line}, sütun {self.pos.col})" if self.pos else ""
        return f"{title}{where}: {self.message}"

    def __str__(self) -> str:
        return self.headline() + (f" İpucu: {self.hint}" if self.hint else "")

    def render(self, source: str | None = None) -> str:
        """Çok satırlı gösterim: başlık, ilgili kaynak satırı, şapka (^) ve ipucu."""
        lines = [self.headline()]
        if source is not None and self.pos is not None:
            src_lines = source.splitlines()
            if 1 <= self.pos.line <= len(src_lines):
                text = src_lines[self.pos.line - 1]
                gutter = f"{self.pos.line:>4} | "
                lines.append(gutter + text)
                # Sekmeler hizayı bozmasın diye şapkanın önüne aynı boşluk karakterleri konur.
                pad = "".join("\t" if ch == "\t" else " " for ch in text[: self.pos.col - 1])
                lines.append(" " * (len(gutter) - 2) + "| " + pad + "^")
        if self.hint:
            lines.append(f"İpucu: {self.hint}")
        return "\n".join(lines)


def syntax_error(
    message: str, pos: Pos, hint: str | None = None, *, at_eof: bool = False
) -> TohumError:
    return TohumError(SYNTAX, message, pos, hint, at_eof=at_eof)


def runtime_error(message: str, pos: Pos | None, hint: str | None = None) -> TohumError:
    return TohumError(RUNTIME, message, pos, hint)


def limit_error(message: str, pos: Pos | None, hint: str | None = None) -> TohumError:
    return TohumError(LIMIT, message, pos, hint)
