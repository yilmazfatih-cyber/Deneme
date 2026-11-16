"""sema — bağımlılıksız küçük şema doğrulayıcı (Pydantic/Zod kurulamayan yerler için: tek dosyalık betikler,
eklentiler, ortam değişkeni okuma). Türkçe hata iletileri ve alan yolları; TypeScript eşiyle aynı iletiler.

Kullanım:
    Kisi = object_({"ad": string().trim().min(2), "yas": number().integer().min(0).optional(), "eposta": string().email()})
    sonuc = Kisi.safe_parse(govde)      # {"ok": True, "value": {...}} | {"ok": False, "issues": [{"path": [...], "message": "..."}]}
    ayar = object_({"PORT": number(coerce=True).default(8080), "DEBUG": boolean(coerce=True).default(False)})
    ayar.parse(dict(os.environ))        # "8080" → 8080, "evet" → True; geçersizse SchemaError (bütün sorunlar)

Davranış: Nesnede tanımsız alanlar varsayılan olarak ATILIR (`strict()` → hata, `passthrough()` → korunur). Hatalar
birikir. `transform` yalnız doğrulama başarılıysa çalışır. Zorlama: number → "12", "-3.5", "1e3" (nokta ondalık);
boolean → true/1/evet/yes/on, false/0/hayır/no/off/"". True sayı sayılmaz (Python'da bool, int'in alt türüdür).

Sınırlar: Bilerek küçüktür: tarih, kesişim, ayrık birleşim, özyinelemeli şema, tip çıkarımı (Python'da çıktı Any)
YOKTUR. Pydantic kurulabiliyorsa Pydantic kullanın (havuz standardı). `object_` adı, Python'un `object`'iyle
çakışmasın diye alt çizgilidir.

Genişletme: Yeni tür bir `Schema` alt sınıfıdır (`_run` yöntemi); TypeScript eşine aynı ileti metniyle eklenir ve
`vektorler/sema.json`'a örnek yazılır.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import Callable, Mapping, Sequence
from typing import Any

__all__ = [
    "ArraySchema",
    "NumberSchema",
    "ObjectSchema",
    "Schema",
    "SchemaError",
    "StringSchema",
    "array",
    "boolean",
    "literal",
    "number",
    "object_",
    "one_of",
    "record",
    "string",
    "union",
]


class _Undefined:
    """Alan hiç verilmedi (JS'teki undefined). None ise JSON null'dır."""

    def __repr__(self) -> str:
        return "<yok>"


UNDEFINED: Any = _Undefined()
_INVALID: Any = object()
Issue = dict[str, Any]
Path = list[str | int]
_NUMERIC = re.compile(r"[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?")
_TRUE_WORDS = ("true", "1", "evet", "yes", "on")
_FALSE_WORDS = ("false", "0", "hayır", "hayir", "no", "off", "")


class SchemaError(ValueError):
    """Doğrulama başarısız; `issues` bütün sorunları içerir."""

    def __init__(self, issues: list[Issue]) -> None:
        lines = [
            f"{'.'.join(map(str, i['path'])) if i['path'] else '(kök)'}: {i['message']}"
            for i in issues
        ]
        super().__init__("\n".join(lines))
        self.issues = issues


def _issue(issues: list[Issue], path: Path, message: str) -> Any:
    issues.append({"path": list(path), "message": message})
    return _INVALID


def _required(value: Any, path: Path, issues: list[Issue]) -> bool:
    if value is UNDEFINED:
        _issue(issues, path, "Zorunlu alan.")
        return False
    return True


Runner = Callable[[Any, Path, list[Issue]], Any]


class Schema:
    """Bütün şemaların temeli: parse / safe_parse ve ortak değiştiriciler."""

    def __init__(self, run: Runner, accepts_undefined: bool = False) -> None:
        self._run_fn = run
        self.accepts_undefined = accepts_undefined

    def _run(self, value: Any, path: Path, issues: list[Issue]) -> Any:
        return self._run_fn(value, path, issues)

    def parse(self, value: Any) -> Any:
        """Doğrular; geçersizse bütün sorunları içeren SchemaError fırlatır."""
        result = self.safe_parse(value)
        if not result["ok"]:
            raise SchemaError(result["issues"])
        return result["value"]

    def safe_parse(self, value: Any) -> dict[str, Any]:
        """Doğrular; hata fırlatmaz."""
        issues: list[Issue] = []
        out = self._run(value, [], issues)
        if out is _INVALID or issues:
            return {"ok": False, "issues": issues}
        return {"ok": True, "value": out}

    def optional(self) -> Schema:
        def run(value: Any, path: Path, issues: list[Issue]) -> Any:
            return UNDEFINED if value is UNDEFINED else self._run(value, path, issues)

        return Schema(run, True)

    def nullable(self) -> Schema:
        def run(value: Any, path: Path, issues: list[Issue]) -> Any:
            return None if value is None else self._run(value, path, issues)

        return Schema(run, self.accepts_undefined)

    def default(self, fallback: Any) -> Schema:
        """Değer yoksa `fallback` kullanılır."""

        def run(value: Any, path: Path, issues: list[Issue]) -> Any:
            return fallback if value is UNDEFINED else self._run(value, path, issues)

        return Schema(run, True)

    def refine(self, predicate: Callable[[Any], bool], message: str) -> Schema:
        """Ek kural: `predicate` False dönerse `message` ile hata."""

        def run(value: Any, path: Path, issues: list[Issue]) -> Any:
            out = self._run(value, path, issues)
            if out is _INVALID:
                return _INVALID
            return out if predicate(out) else _issue(issues, path, message)

        return Schema(run, self.accepts_undefined)

    def transform(self, fn: Callable[[Any], Any]) -> Schema:
        """Doğrulanmış değeri dönüştürür."""

        def run(value: Any, path: Path, issues: list[Issue]) -> Any:
            out = self._run(value, path, issues)
            return _INVALID if out is _INVALID else fn(out)

        return Schema(run, self.accepts_undefined)


Check = tuple[Callable[[Any], bool], str]


class StringSchema(Schema):
    def __init__(self, checks: Sequence[Check] = (), trim_first: bool = False) -> None:
        self._checks = tuple(checks)
        self._trim_first = trim_first

        def run(value: Any, path: Path, issues: list[Issue]) -> Any:
            if not _required(value, path, issues):
                return _INVALID
            if not isinstance(value, str):
                return _issue(issues, path, "Metin bekleniyordu.")
            text = value.strip() if trim_first else value
            for test, message in self._checks:
                if not test(text):
                    return _issue(issues, path, message)
            return text

        super().__init__(run)

    def _with(self, test: Callable[[str], bool], message: str) -> StringSchema:
        return StringSchema((*self._checks, (test, message)), self._trim_first)

    def trim(self) -> StringSchema:
        """Denetimden önce baştaki/sondaki boşlukları atar."""
        return StringSchema(self._checks, True)

    def min(self, length: int, message: str | None = None) -> StringSchema:
        return self._with(lambda v: len(v) >= length, message or f"En az {length} karakter olmalı.")

    def max(self, length: int, message: str | None = None) -> StringSchema:
        return self._with(
            lambda v: len(v) <= length, message or f"En çok {length} karakter olmalı."
        )

    def nonempty(self, message: str = "Boş bırakılamaz.") -> StringSchema:
        return self._with(lambda v: len(v) > 0, message)

    def regex(
        self, pattern: str | re.Pattern[str], message: str = "Biçim geçersiz."
    ) -> StringSchema:
        compiled = re.compile(pattern)
        return self._with(lambda v: compiled.search(v) is not None, message)

    def email(self, message: str = "Geçerli bir e-posta adresi değil.") -> StringSchema:
        return self._with(
            lambda v: re.fullmatch(r"[^\s@]+@[^\s@.]+(\.[^\s@.]+)+", v) is not None, message
        )

    def one_of(self, values: Sequence[str], message: str | None = None) -> StringSchema:
        text = message or f"Şunlardan biri olmalı: {', '.join(values)}."
        return self._with(lambda v: v in values, text)


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


class NumberSchema(Schema):
    def __init__(self, checks: Sequence[Check] = (), coerce: bool = False) -> None:
        self._checks = tuple(checks)
        self._coerce = coerce

        def run(value: Any, path: Path, issues: list[Issue]) -> Any:
            if not _required(value, path, issues):
                return _INVALID
            number = value
            if coerce and isinstance(value, str) and _NUMERIC.fullmatch(value.strip()):
                text = value.strip()
                number = int(text) if re.fullmatch("[+-]?[0-9]+", text) else float(text)
            if not _is_number(number):
                return _issue(issues, path, "Sayı bekleniyordu.")
            for test, message in self._checks:
                if not test(number):
                    return _issue(issues, path, message)
            return number

        super().__init__(run)

    def _with(self, test: Callable[[float], bool], message: str) -> NumberSchema:
        return NumberSchema((*self._checks, (test, message)), self._coerce)

    def integer(self, message: str = "Tam sayı olmalı.") -> NumberSchema:
        return self._with(lambda v: float(v).is_integer(), message)

    def min(self, minimum: float, message: str | None = None) -> NumberSchema:
        return self._with(lambda v: v >= minimum, message or f"En az {_text(minimum)} olmalı.")

    def max(self, maximum: float, message: str | None = None) -> NumberSchema:
        return self._with(lambda v: v <= maximum, message or f"En çok {_text(maximum)} olmalı.")

    def positive(self, message: str = "Sıfırdan büyük olmalı.") -> NumberSchema:
        return self._with(lambda v: v > 0, message)


def _text(value: Any) -> str:
    """İletide sayıyı JS gibi yazar: 5.0 → "5"."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


class ArraySchema(Schema):
    def __init__(self, item: Schema, checks: Sequence[Check] = ()) -> None:
        self._item = item
        self._checks = tuple(checks)

        def run(value: Any, path: Path, issues: list[Issue]) -> Any:
            if not _required(value, path, issues):
                return _INVALID
            if not isinstance(value, list | tuple):
                return _issue(issues, path, "Liste bekleniyordu.")
            for test, message in self._checks:
                if not test(value):
                    return _issue(issues, path, message)
            out = [
                item._run(element, [*path, index], issues) for index, element in enumerate(value)
            ]
            return _INVALID if any(element is _INVALID for element in out) else out

        super().__init__(run)

    def min(self, length: int, message: str | None = None) -> ArraySchema:
        test: Check = (lambda v: len(v) >= length, message or f"En az {length} öğe olmalı.")
        return ArraySchema(self._item, (*self._checks, test))

    def max(self, length: int, message: str | None = None) -> ArraySchema:
        test: Check = (lambda v: len(v) <= length, message or f"En çok {length} öğe olmalı.")
        return ArraySchema(self._item, (*self._checks, test))


class ObjectSchema(Schema):
    def __init__(self, shape: Mapping[str, Schema], mode: str = "strip") -> None:
        self._shape = dict(shape)

        def run(value: Any, path: Path, issues: list[Issue]) -> Any:
            if not _required(value, path, issues):
                return _INVALID
            if not isinstance(value, Mapping):
                return _issue(issues, path, "Nesne bekleniyordu.")
            valid = True
            out: dict[str, Any] = dict(value) if mode == "passthrough" else {}
            for key, schema in self._shape.items():
                present = key in value
                parsed = schema._run(value[key] if present else UNDEFINED, [*path, key], issues)
                if parsed is _INVALID:
                    valid = False
                elif parsed is not UNDEFINED:
                    out[key] = parsed
            if mode == "strict":
                for key in value:
                    if key not in self._shape:
                        _issue(issues, [*path, key], "Beklenmeyen alan.")
                        valid = False
            return out if valid else _INVALID

        super().__init__(run)

    def strict(self) -> ObjectSchema:
        """Şemada olmayan alan hata sayılır."""
        return ObjectSchema(self._shape, "strict")

    def passthrough(self) -> ObjectSchema:
        """Şemada olmayan alanlar olduğu gibi korunur."""
        return ObjectSchema(self._shape, "passthrough")


def string() -> StringSchema:
    return StringSchema()


def number(*, coerce: bool = False) -> NumberSchema:
    return NumberSchema((), coerce)


def boolean(*, coerce: bool = False) -> Schema:
    def run(value: Any, path: Path, issues: list[Issue]) -> Any:
        if not _required(value, path, issues):
            return _INVALID
        if isinstance(value, bool):
            return value
        if coerce and isinstance(value, str):
            word = value.strip().lower()  # harf: yalnız ASCII sözcüklerle karşılaştırılır
            if word in _TRUE_WORDS:
                return True
            if word in _FALSE_WORDS:
                return False
        return _issue(issues, path, "Evet/hayır (true/false) bekleniyordu.")

    return Schema(run)


def _same(a: Any, b: Any) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if a is None or b is None:
        return a is b
    return bool(a == b) and (isinstance(a, int | float) == isinstance(b, int | float))


def literal(expected: str | float | bool | None) -> Schema:
    def run(value: Any, path: Path, issues: list[Issue]) -> Any:
        if _same(value, expected):
            return expected
        return _issue(issues, path, f"{json.dumps(expected, ensure_ascii=False)} bekleniyordu.")

    return Schema(run)


def one_of(values: Sequence[str | int | float]) -> Schema:
    """Sabit seçeneklerden biri: one_of(["taslak", "yayında"])."""

    def run(value: Any, path: Path, issues: list[Issue]) -> Any:
        if not _required(value, path, issues):
            return _INVALID
        if any(_same(value, option) for option in values):
            return value
        joined = ", ".join(_text(v) for v in values)
        return _issue(issues, path, f"Şunlardan biri olmalı: {joined}.")

    return Schema(run)


def array(item: Schema) -> ArraySchema:
    return ArraySchema(item)


def object_(shape: Mapping[str, Schema]) -> ObjectSchema:
    return ObjectSchema(shape)


def union(options: Sequence[Schema]) -> Schema:
    """Seçeneklerden ilk tutan; hiçbiri tutmazsa tek bir ileti."""

    def run(value: Any, path: Path, issues: list[Issue]) -> Any:
        for option in options:
            scratch: list[Issue] = []
            out = option._run(value, path, scratch)
            if out is not _INVALID and not scratch:
                return out
        return _issue(issues, path, "Seçeneklerin hiçbirine uymuyor.")

    return Schema(run, any(option.accepts_undefined for option in options))


def record(value_schema: Schema) -> Schema:
    """Anahtarları metin, değerleri aynı şemaya uyan sözlük."""

    def run(value: Any, path: Path, issues: list[Issue]) -> Any:
        if not _required(value, path, issues):
            return _INVALID
        if not isinstance(value, Mapping):
            return _issue(issues, path, "Nesne bekleniyordu.")
        out = {
            key: value_schema._run(element, [*path, key], issues) for key, element in value.items()
        }
        return _INVALID if any(v is _INVALID for v in out.values()) else out

    return Schema(run)
