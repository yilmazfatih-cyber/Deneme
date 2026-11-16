"""Model tabanı: sınıf öznitelikleri olarak yazılan alanları toplar; satır ↔ nesne dönüşümü.

    class Kullanici(Model):
        table = "kullanicilar"                 # yazılmazsa sınıf adının küçük harflisi
        ad = TextField(unique=True)
        notlar = Reverse("Not", "sahip")       # bire-çok: kullanici.notlar → liste (tembel)
Her modelin otomatik `id` birincil anahtarı vardır. Alanlar `__init_subclass__` ile bir kez, açıkça
toplanır (başka "sihir" yok); modeller `REGISTRY`'ye adlarıyla kaydedilir (ForeignKey("Kullanici")
böyle çözülür).
Genişletme: modele iş kuralı eklemek için sıradan yöntem yazın; doğrulama için `clean()` yöntemini
geçersiz kılın (kaydetmeden önce çağrılır).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, ClassVar, Self

from orm.fields import Field, ForeignKey, IntegerField, ValidationError

if TYPE_CHECKING:
    from orm.db import Database

REGISTRY: dict[str, type[Model]] = {}


class Reverse:
    """Bire-çok ters ilişki. Önceden yüklendiyse (`prefetch`) önbellekten, değilse sorguyla
    gelir.
    """

    def __init__(self, model: str, field: str) -> None:
        self.model_name = model
        self.field_name = field
        self.name = ""

    def __set_name__(self, owner: type, name: str) -> None:
        self.name = name

    def target(self) -> tuple[type[Model], ForeignKey]:
        model = REGISTRY[self.model_name]
        field = model.fields[self.field_name]
        assert isinstance(field, ForeignKey)
        return model, field

    def __get__(self, instance: Model | None, owner: type) -> Any:
        if instance is None:
            return self
        cache = instance.__dict__.setdefault("_related", {})
        if self.name in cache:
            return cache[self.name]
        model, field = self.target()
        return instance.database().query(model).filter(**{field.column: instance.id}).all()


class Model:
    table: ClassVar[str] = ""
    fields: ClassVar[dict[str, Field]] = {}
    id = IntegerField(primary_key=True, null=True)

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        collected: dict[str, Field] = {}
        for klass in reversed(cls.__mro__):
            for name, value in vars(klass).items():
                if isinstance(value, Field):
                    collected[name] = value
        cls.fields = {"id": collected.pop("id"), **collected}
        if not cls.__dict__.get("table"):
            cls.table = cls.__name__.lower()
        REGISTRY[cls.__name__] = cls

    def __init__(self, **values: Any) -> None:
        self._db: Database | None = None
        for name, field in self.fields.items():
            if isinstance(field, ForeignKey) and field.column in values:
                setattr(self, name, values.pop(field.column))
            elif name in values:
                setattr(self, name, values.pop(name))
            else:
                setattr(self, name, field.default_value())
        if values:
            unknown = ", ".join(sorted(values))
            raise TypeError(f"{type(self).__name__} modelinde böyle alan yok: {unknown}")

    def database(self) -> Database:
        if self._db is None:
            raise RuntimeError(
                "Bu nesne bir veritabanına bağlı değil; önce db.save(nesne) çağırın."
            )
        return self._db

    def clean(self) -> None:
        """Kaydetmeden önce çağrılır; iş kuralları için geçersiz kılın (hata: ValidationError)."""

    def to_row(self) -> dict[str, Any]:
        """Sütun adı → veritabanı değeri (id hariç); her alan burada doğrulanır."""
        self.clean()
        row: dict[str, Any] = {}
        for name, field in self.fields.items():
            if name == "id":
                continue
            raw = (
                self.__dict__.get(field.column)
                if isinstance(field, ForeignKey)
                else getattr(self, name)
            )
            row[field.column] = field.to_db(raw)
        return row

    @classmethod
    def from_row(cls, row: dict[str, Any], db: Database) -> Self:
        obj = cls.__new__(cls)
        obj._db = db
        for name, field in cls.fields.items():
            value = field.from_db(row[field.column])
            if isinstance(field, ForeignKey):
                obj.__dict__[field.column] = value
            else:
                setattr(obj, name, value)
        return obj

    def __eq__(self, other: object) -> bool:
        return (
            type(self) is type(other)
            and self.id is not None
            and self.id == getattr(other, "id", None)
        )

    def __hash__(self) -> int:
        return hash((type(self).__name__, self.id))

    def __repr__(self) -> str:
        return f"<{type(self).__name__} id={self.id}>"


def field_for(model: type[Model], name: str) -> Field:
    """Ad ya da sütun adıyla alanı bulur ("sahip" ya da "sahip_id"); yoksa açıklayıcı hata."""
    if name in model.fields:
        return model.fields[name]
    for field in model.fields.values():
        if field.column == name:
            return field
    known = ", ".join(model.fields)
    raise ValidationError(f"{model.__name__} modelinde '{name}' alanı yok (bilinenler: {known}).")
