"""Alan türleri: Python değeri ↔ SQLite sütunu dönüşümü ve doğrulama.

    class Not(Model):
        baslik = TextField(max_length=200)
        okundu = BoolField(default=False)
        sahip  = ForeignKey("Kullanici", related_name="notlar")   # sütun: sahip_id
Her alan `to_db` ile denetlenir (yanlış tür → `ValidationError`, Türkçe ileti) ve `column_sql` ile
CREATE TABLE parçasını üretir. Varsayılan değer çağrılabilirse (ör. `datetime.now`) her kayıtta
çağrılır.
Genişletme: yeni bir tür için `Field`'dan türetip `sql_type`, `to_db`, `from_db`'yi yazın;
`tests/orm/` içinde gidiş-dönüş testi ekleyin.
"""

from __future__ import annotations

import datetime
from typing import TYPE_CHECKING, Any, Self, overload

if TYPE_CHECKING:
    from orm.model import Model

MISSING: Any = object()


class ValidationError(ValueError):
    """Alan değeri geçersiz (tür, uzunluk, boşluk)."""


class Field:
    sql_type = "TEXT"

    def __init__(
        self,
        *,
        null: bool = False,
        default: Any = MISSING,
        unique: bool = False,
        index: bool = False,
        primary_key: bool = False,
    ) -> None:
        self.null = null
        self.default = default
        self.unique = unique
        self.index = index
        self.primary_key = primary_key
        self.name = ""
        self.column = ""

    def __set_name__(self, owner: type, name: str) -> None:
        self.name = name
        self.column = name

    @overload
    def __get__(self, instance: None, owner: type) -> Self: ...

    @overload
    def __get__(self, instance: object, owner: type) -> Any: ...

    def __get__(self, instance: object | None, owner: type) -> Any:
        """Sınıftan erişimde alanın kendisi (`Not.baslik`), nesneden erişimde değeri."""
        if instance is None:
            return self
        return vars(instance).get(self.name)

    def has_default(self) -> bool:
        return self.default is not MISSING

    def default_value(self) -> Any:
        if self.default is MISSING:
            return None
        return self.default() if callable(self.default) else self.default

    def check(self, value: Any) -> Any:
        """Python değerini doğrular (alt sınıflar türe özgü denetimi `convert` içinde yapar)."""
        if value is None:
            if not self.null and not self.primary_key:
                raise ValidationError(f"'{self.name}' boş bırakılamaz.")
            return None
        return self.convert(value)

    def convert(self, value: Any) -> Any:
        return value

    def to_db(self, value: Any) -> Any:
        return self.check(value)

    def from_db(self, value: Any) -> Any:
        return value

    def column_sql(self) -> str:
        parts = [f'"{self.column}"', self.sql_type]
        if self.primary_key:
            parts.append("PRIMARY KEY AUTOINCREMENT")
        elif not self.null:
            parts.append("NOT NULL")
        if self.unique:
            parts.append("UNIQUE")
        if self.has_default() and not callable(self.default) and self.default is not None:
            parts.append(f"DEFAULT {sql_literal(self.to_db(self.default))}")
        return " ".join(parts)


def sql_literal(value: Any) -> str:
    """Yalnız şema (DEFAULT) için sabit; kullanıcı verisi ASLA böyle yazılmaz (parametre
    kullanılır).
    """
    if isinstance(value, bool):
        return str(int(value))
    if isinstance(value, int | float):
        return repr(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    raise ValidationError(
        f"Bu tür varsayılan değer olarak şemaya yazılamaz: {type(value).__name__}"
    )


class IntegerField(Field):
    sql_type = "INTEGER"

    def convert(self, value: Any) -> Any:
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValidationError(f"'{self.name}' tam sayı olmalı.")
        return value


class RealField(Field):
    sql_type = "REAL"

    def convert(self, value: Any) -> Any:
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise ValidationError(f"'{self.name}' sayı olmalı.")
        return float(value)


class TextField(Field):
    sql_type = "TEXT"

    def __init__(self, *, max_length: int | None = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.max_length = max_length

    def convert(self, value: Any) -> Any:
        if not isinstance(value, str):
            raise ValidationError(f"'{self.name}' metin olmalı.")
        if self.max_length is not None and len(value) > self.max_length:
            raise ValidationError(f"'{self.name}' en çok {self.max_length} karakter olabilir.")
        return value


class BoolField(Field):
    sql_type = "INTEGER"

    def convert(self, value: Any) -> Any:
        if not isinstance(value, bool):
            raise ValidationError(f"'{self.name}' True ya da False olmalı.")
        return int(value)

    def from_db(self, value: Any) -> Any:
        return None if value is None else bool(value)


class DateTimeField(Field):
    """ISO 8601 metni olarak saklanır ("2026-11-16T10:30:00+03:00"); sıralama metin sırasıyla doğru
    olur (aynı saat diliminde).
    """

    sql_type = "TEXT"

    def convert(self, value: Any) -> Any:
        if not isinstance(value, datetime.datetime):
            raise ValidationError(f"'{self.name}' bir datetime olmalı.")
        return value.isoformat()

    def from_db(self, value: Any) -> Any:
        return None if value is None else datetime.datetime.fromisoformat(value)


class BlobField(Field):
    sql_type = "BLOB"

    def convert(self, value: Any) -> Any:
        if not isinstance(value, bytes):
            raise ValidationError(f"'{self.name}' bayt dizisi olmalı.")
        return value


class ForeignKey(IntegerField):
    """Başka bir modele bağlantı. Sütun adı `<ad>_id`; `nesne.<ad>` ilgili kaydı TEMBEL yükler."""

    def __init__(
        self,
        to: type[Model] | str,
        *,
        on_delete: str = "CASCADE",
        related_name: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        if on_delete not in ("CASCADE", "SET NULL", "RESTRICT"):
            raise ValueError("on_delete CASCADE, SET NULL ya da RESTRICT olmalı.")
        self.to = to
        self.on_delete = on_delete
        self.related_name = related_name

    def __set_name__(self, owner: type, name: str) -> None:
        self.name = name
        self.column = f"{name}_id"
        self.owner = owner

    def resolve_model(self) -> type[Model]:
        """Hedef model (ad olarak verildiyse kayıt defterinden bulunur)."""
        if isinstance(self.to, str):
            from orm.model import REGISTRY

            if self.to not in REGISTRY:
                raise LookupError(
                    f"'{self.to}' adlı model yok (önce tanımlanmalı ya da adı doğru yazın)."
                )
            return REGISTRY[self.to]
        return self.to

    def column_sql(self) -> str:
        target = self.resolve_model()
        return (
            f'{super().column_sql()} REFERENCES "{target.table}"("id") ON DELETE {self.on_delete}'
        )

    @overload
    def __get__(self, instance: None, owner: type) -> Self: ...

    @overload
    def __get__(self, instance: object, owner: type) -> Any: ...

    def __get__(self, instance: object | None, owner: type) -> Any:
        if instance is None:
            return self
        from orm.model import Model  # döngüsel içe aktarmayı önlemek için yerel

        assert isinstance(instance, Model)
        cache = instance.__dict__.setdefault("_related", {})
        if self.name not in cache:
            key = instance.__dict__.get(self.column)
            cache[self.name] = (
                None if key is None else instance.database().get(self.resolve_model(), key)
            )
        return cache[self.name]

    def __set__(self, instance: Model, value: Any) -> None:
        from orm.model import Model

        if isinstance(value, Model):
            instance.__dict__[self.column] = value.id
            instance.__dict__.setdefault("_related", {})[self.name] = value
        else:
            instance.__dict__[self.column] = value
            instance.__dict__.setdefault("_related", {}).pop(self.name, None)
