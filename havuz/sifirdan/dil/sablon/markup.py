"""Güvenli işaretleme (Markup), HTML kaçışı, hata türleri ve "tanımsız" değer.

`Markup`: kaçışı ZATEN yapılmış (güvenilir) HTML'dir; ikinci kez kaçışlanmaz. Sıradan `str`
çıktıya yazılırken her zaman kaçışlanır (`& < > " '`). `Markup + str` işleminde str kaçışlanır;
böylece güvenli metne güvensiz metin eklemek açık doğurmaz.
`Undefined`: şablonda olmayan bir ad; yazdırılırsa (katı kipte) hata, `if` içinde yanlış,
`default` süzgecinde yedek değer.
Genişletme: başka bir bağlam (ör. CSS) için ayrı bir `escape_css` işlevi ekleyin.
"""

from __future__ import annotations

HTML_ESCAPES = str.maketrans({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#34;", "'": "&#39;"})


class Markup(str):
    """Kaçışı yapılmış HTML. `Markup("<b>")` olduğu gibi yazılır."""

    __slots__ = ()

    def __add__(self, other: str) -> Markup:
        return Markup(str.__add__(self, escape(other)))

    def __radd__(self, other: str) -> Markup:
        return Markup(str.__add__(escape(other), self))

    def __html__(self) -> str:
        return str(self)


def escape(value: object) -> Markup:
    """Değeri HTML'e güvenle yazılabilir hâle getirir (Markup zaten güvenlidir)."""
    if isinstance(value, Markup):
        return value
    if value is None:
        return Markup("")
    return Markup(str(value).translate(HTML_ESCAPES))


class TemplateError(Exception):
    """Şablon hatası: şablon adı, satır, sütun, ne oldu ve (varsa) öneri."""

    def __init__(self, message: str, name: str, line: int, col: int, hint: str | None = None):
        self.message = message
        self.name = name
        self.line = line
        self.col = col
        self.hint = hint
        tail = f" İpucu: {hint}" if hint else ""
        super().__init__(f"Şablon hatası ({name}, satır {line}, sütun {col}): {message}.{tail}")

    def render(self, source: str) -> str:
        lines = [
            f"Şablon hatası ({self.name}, satır {self.line}, sütun {self.col}): {self.message}"
        ]
        rows = source.split("\n")
        if 1 <= self.line <= len(rows):
            lines.append(f"{self.line:>4} | {rows[self.line - 1]}")
            lines.append("     | " + " " * (self.col - 1) + "^")
        if self.hint:
            lines.append(f"İpucu: {self.hint}")
        return "\n".join(lines)


class RenderProblem(Exception):
    """Değerlendirme sırasında oluşan, konumu henüz eklenmemiş hata (çıktı düğümü konum ekler)."""

    def __init__(self, message: str, hint: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint


class Undefined:
    """Bağlamda olmayan bir ad ya da anahtar (ör. `kullanici.ad`)."""

    __slots__ = ("path",)

    def __init__(self, path: str) -> None:
        self.path = path

    def __bool__(self) -> bool:
        return False

    def __iter__(self) -> object:
        raise RenderProblem(f"tanımsız '{self.path}' üzerinde döngü kurulamaz")

    def __str__(self) -> str:
        raise RenderProblem(
            f"'{self.path}' tanımlı değil",
            f"render(...) çağrısına `{self.path.split('.')[0]}=…` verin ya da "
            f"`{{{{ {self.path} | default('') }}}}` yazın.",
        )
