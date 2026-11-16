"""Hesap hatası: ifadedeki konum (sütun, 1'den) + ne oldu + öneri; şapkalı gösterim.

Genişletme: yeni bir hata türü gerekmez; ileti ve ipucuyla `CalcError` fırlatın.
"""

from __future__ import annotations


class CalcError(ValueError):
    def __init__(self, message: str, pos: int, hint: str | None = None) -> None:
        self.message = message
        self.pos = pos  # 0'dan başlayan karakter konumu
        self.hint = hint
        tail = f" İpucu: {hint}" if hint else ""
        super().__init__(f"Hesap hatası (sütun {pos + 1}): {message}.{tail}")

    def render(self, expression: str) -> str:
        lines = [f"Hesap hatası (sütun {self.pos + 1}): {self.message}", f"  {expression}"]
        lines.append("  " + " " * self.pos + "^")
        if self.hint:
            lines.append(f"İpucu: {self.hint}")
        return "\n".join(lines)
