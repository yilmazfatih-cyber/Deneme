"""Aşama 1 — Blok: tipli giriş/çıkış şemaları olan küçük iş birimi ve blok kaydı.

Gerçek karşılığı: autogpt_platform/backend/backend/blocks/_base.py (Block, BlockSchema)
ve blocks/__init__.py (load_all_blocks). Buradaki kod özgündür; yalnızca kavramlar aynıdır.

Temel fikir: her blok bir "kara kutu"dur. Girişleri bir şemaya göre doğrulanır,
run() bir üreteçtir ve (pin_adı, değer) çiftleri üretir (yield). Bir blok aynı
çıkış pininden birden çok değer üretebilir; yürütücü (aşama 3) her değeri ayrı ayrı
sonraki düğümlere taşır. Dallanma da böyle olur: bir blok yalnızca bir pini üretirse
öbür pine bağlı düğümler hiç çalışmaz.
"""

from __future__ import annotations

import copy
import enum
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterator

_YOK = object()  # "varsayılan değer yok" işareti (None geçerli bir varsayılan olabilir)


class BlockType(enum.Enum):
    STANDARD = "Standard"
    INPUT = "Input"  # grafın dışarıdan aldığı değer
    OUTPUT = "Output"  # grafın dışarıya verdiği değer
    AI = "AI"


class BlockError(Exception):
    """Blokla ilgili tüm hataların atası."""


class BlockInputError(BlockError):
    pass


class BlockOutputError(BlockError):
    pass


class BlockExecutionError(BlockError):
    pass


class BlockUnknownError(BlockError):
    """run() içinden beklenmeyen bir istisna çıktı (TypeError, AttributeError…)."""


@dataclass
class SchemaField:
    """Bir pin tanımı. `type` olarak object verilirse her değer kabul edilir (Any)."""

    type: Any = object
    description: str = ""
    default: Any = _YOK
    credentials_provider: str | None = None  # aşama 4: bu alan bir kimlik bilgisi referansıdır

    @property
    def required(self) -> bool:
        return self.default is _YOK


_JSON_TIPI = {str: "string", int: "integer", float: "number", bool: "boolean", list: "array", dict: "object"}


def tip_uyar_mi(deger: Any, beklenen: Any) -> bool:
    """Basit tip denetimi. bool, int'in alt sınıfıdır; onu ayrıca reddediyoruz."""
    if beklenen is object or deger is None:
        return True
    if beklenen is float:
        return isinstance(deger, (int, float)) and not isinstance(deger, bool)
    if beklenen is int:
        return isinstance(deger, int) and not isinstance(deger, bool)
    return isinstance(deger, beklenen)


def tipler_uyumlu(kaynak: Any, hedef: Any) -> bool:
    """Bir çıkış pini bir giriş pinine bağlanabilir mi? (aşama 2 kullanır)"""
    if object in (kaynak, hedef) or kaynak == hedef:
        return True
    return kaynak is int and hedef is float


class BlockSchema:
    """Alt sınıflar pinlerini sınıf niteliği olarak SchemaField ile tanımlar."""

    @classmethod
    def fields(cls) -> dict[str, SchemaField]:
        sonuc: dict[str, SchemaField] = {}
        for taban in reversed(cls.__mro__):
            for ad, deger in vars(taban).items():
                if isinstance(deger, SchemaField):
                    sonuc[ad] = deger
        return sonuc

    @classmethod
    def required_fields(cls) -> set[str]:
        return {ad for ad, f in cls.fields().items() if f.required}

    @classmethod
    def credentials_fields(cls) -> dict[str, SchemaField]:
        return {ad: f for ad, f in cls.fields().items() if f.credentials_provider}

    @classmethod
    def jsonschema(cls) -> dict[str, Any]:
        """Arayüz ve LLM'ler için JSON Şeması (gerçek sistem bunu Pydantic'ten üretir)."""
        ozellikler = {}
        for ad, f in cls.fields().items():
            ozellik: dict[str, Any] = {"description": f.description}
            if f.type in _JSON_TIPI:
                ozellik["type"] = _JSON_TIPI[f.type]
            if not f.required:
                ozellik["default"] = f.default
            ozellikler[ad] = ozellik
        return {"type": "object", "properties": ozellikler, "required": sorted(cls.required_fields())}

    @classmethod
    def with_defaults(cls, veri: dict[str, Any]) -> dict[str, Any]:
        # deepcopy: {} gibi değişebilir varsayılanlar yürütmeler arasında paylaşılmasın
        sonuc = {ad: copy.deepcopy(f.default) for ad, f in cls.fields().items() if not f.required}
        sonuc.update({k: v for k, v in veri.items() if v is not None or k not in sonuc})
        return sonuc

    @classmethod
    def validate(cls, veri: dict[str, Any]) -> str | None:
        """İlk hatayı metin olarak döndürür; geçerliyse None.

        Zorunlu bir alana gelen None "eksik" sayılır: gerçek validate_data da None değerleri
        atıp JSON Şemasıyla doğrular. Böylece None, run() içinde TypeError'a dönüşmez."""
        alanlar = cls.fields()
        eksik = sorted(ad for ad in cls.required_fields() if veri.get(ad) is None)
        if eksik:
            return f"eksik zorunlu alan(lar): {', '.join(eksik)}"
        for ad, deger in veri.items():
            if ad not in alanlar:
                return f"bilinmeyen alan: {ad}"
            if not tip_uyar_mi(deger, alanlar[ad].type):
                return f"'{ad}' için {alanlar[ad].type.__name__} beklenirdi, {type(deger).__name__} geldi"
        return None


class EmptySchema(BlockSchema):
    pass


class BlockSchemaOutput(BlockSchema):
    """Her çıkış şemasında standart bir 'error' pini olur; böylece hata da bağlanabilir bir çıkıştır."""

    error = SchemaField(str, "Hata mesajı", default="")


class Block:
    """Tüm blokların atası. Alt sınıf sabit bir UUID ve iki şema tanımlar."""

    id: str = ""
    description: str = ""
    input_schema: type[BlockSchema] = EmptySchema
    output_schema: type[BlockSchema] = EmptySchema
    block_type: BlockType = BlockType.STANDARD
    static_output: bool = False  # True ise çıkış bağlantıları "statik"tir (değer tekrar kullanılır)
    test_input: list[dict[str, Any]] = []
    test_output: list[tuple[str, Any]] = []

    @property
    def name(self) -> str:
        return type(self).__name__

    def run(self, input_data: dict[str, Any], **kwargs: Any) -> Iterator[tuple[str, Any]]:
        raise NotImplementedError(f"{self.name}.run yazılmamış")

    def execute(self, input_data: dict[str, Any], **kwargs: Any) -> Iterator[tuple[str, Any]]:
        """Doğrulama sarmalayıcısı: giriş → run() → her çıkışı şemaya göre denetle.

        run()'dan çıkan her istisna BlockError ailesine çevrilir (gerçek Block.execute gibi:
        ValueError → BlockExecutionError, diğerleri → BlockUnknownError). Yürütücü böylece tek
        bir hata türünü yakalayıp düğümü FAILED yapabilir; hata grafı yarıda bırakmaz."""
        veri = self.input_schema.with_defaults(input_data)
        if hata := self.input_schema.validate(veri):
            raise BlockInputError(f"{self.name}: {hata}")
        cikislar = self.output_schema.fields()
        try:
            for pin, deger in self.run(veri, **kwargs):
                if pin == "error":
                    raise BlockExecutionError(f"{self.name}: {deger}")
                if pin not in cikislar:
                    raise BlockOutputError(f"{self.name}: tanımsız çıkış pini '{pin}'")
                if not tip_uyar_mi(deger, cikislar[pin].type):
                    raise BlockOutputError(f"{self.name}: '{pin}' pini yanlış tipte değer üretti")
                yield pin, deger
        except BlockError:
            raise
        except Exception as hata:
            sinif = BlockExecutionError if isinstance(hata, ValueError) else BlockUnknownError
            raise sinif(f"{self.name}: {type(hata).__name__}: {hata}") from hata


# ----------------------------------------------------------------- blok kaydı
def _tum_alt_siniflar(sinif: type) -> list[type]:
    sonuc = []
    for alt in sinif.__subclasses__():
        sonuc.append(alt)
        sonuc.extend(_tum_alt_siniflar(alt))
    return sonuc


def validate_block_classes(siniflar: list[type[Block]]) -> dict[str, type[Block]]:
    """Gerçek load_all_blocks'taki kuralların küçük hâli: ad, UUID, benzersizlik, 'error' tipi."""
    kayit: dict[str, type[Block]] = {}
    for sinif in siniflar:
        ad = sinif.__name__
        if ad.endswith("Base"):
            continue  # soyut ara sınıflar
        if not ad.endswith("Block"):
            raise ValueError(f"{ad}: blok sınıf adı 'Block' ile bitmeli (soyutsa 'Base')")
        try:
            uuid.UUID(sinif.id)
        except ValueError:
            raise ValueError(f"{ad}: id geçerli bir UUID değil: {sinif.id!r}") from None
        if sinif.id in kayit:
            raise ValueError(f"{ad}: id {sinif.id} zaten {kayit[sinif.id].__name__} tarafından kullanılıyor")
        hata_pini = sinif.output_schema.fields().get("error")
        if hata_pini and hata_pini.type is not str:
            raise ValueError(f"{ad}: 'error' çıkışı str olmalı")
        kayit[sinif.id] = sinif
    return kayit


def load_all_blocks() -> dict[str, type[Block]]:
    """Block'tan türeyen (ve içe aktarılmış) her sınıfı bulur. Eklenti mantığı: dosyayı
    içe aktarmak bloğu kaydetmeye yeter, merkezi bir listeye ekleme yapılmaz."""
    return validate_block_classes(_tum_alt_siniflar(Block))


def get_block(block_id: str) -> Block | None:
    sinif = load_all_blocks().get(block_id)
    return sinif() if sinif else None


def run_block_self_test(blok: Block, **kwargs: Any) -> None:
    """Her blok kendi test_input / test_output örneklerini taşır (gerçekte: util/test.py)."""
    beklenen = list(blok.test_output)
    for giris in blok.test_input:
        for pin, deger in blok.execute(giris, **kwargs):
            if not beklenen:
                raise AssertionError(f"{blok.name}: fazladan çıkış {pin}={deger!r}")
            b_pin, b_deger = beklenen.pop(0)
            if (b_pin, b_deger) != (pin, deger):
                raise AssertionError(f"{blok.name}: {b_pin}={b_deger!r} beklenirdi, {pin}={deger!r} geldi")
    if beklenen:
        raise AssertionError(f"{blok.name}: üretilmeyen çıkışlar {beklenen}")


# ----------------------------------------------------------------- örnek bloklar
class AgentInputBlock(Block):
    id = "0a133f2e-46a3-495b-a269-5a92d387360a"
    description = "Grafın dışarıdan aldığı adlandırılmış giriş."
    block_type = BlockType.INPUT

    class input_schema(BlockSchema):
        name = SchemaField(str, "Girişin adı (çalıştırırken bu adla değer verilir)")
        value = SchemaField(object, "Değer", default=None)

    class output_schema(BlockSchemaOutput):
        result = SchemaField(object, "Girilen değer")

    test_input = [{"name": "x", "value": 5}]
    test_output = [("result", 5)]

    def run(self, input_data, **kwargs):
        yield "result", input_data["value"]


class AgentOutputBlock(Block):
    id = "3f772001-c5d4-4ebe-9c75-e85b3faef1c4"
    description = "Grafın sonucunu adlandırarak dışarı verir."
    block_type = BlockType.OUTPUT

    class input_schema(BlockSchema):
        name = SchemaField(str, "Çıkışın adı")
        value = SchemaField(object, "Değer")

    class output_schema(BlockSchemaOutput):
        output = SchemaField(object, "Değerin kendisi")

    test_input = [{"name": "y", "value": "ok"}]
    test_output = [("output", "ok")]

    def run(self, input_data, **kwargs):
        yield "output", input_data["value"]


class StoreValueBlock(Block):
    """Bir sabiti tutar; çıkış bağlantıları statiktir, her tüketimde son değeri verir."""

    id = "f2ce89e8-0ebc-4f4b-92fe-c0beb6a41051"
    description = "Değer saklar ve tekrar tekrar sunar."
    static_output = True

    class input_schema(BlockSchema):
        input = SchemaField(object, "Tetikleyici (data boşsa bu değer kullanılır)", default=None)
        data = SchemaField(object, "Saklanacak sabit", default=None)

    class output_schema(BlockSchemaOutput):
        output = SchemaField(object, "Saklanan değer")

    test_input = [{"input": "merhaba"}, {"input": "x", "data": "sabit"}]
    test_output = [("output", "merhaba"), ("output", "sabit")]

    def run(self, input_data, **kwargs):
        yield "output", input_data["data"] if input_data["data"] is not None else input_data["input"]


class AddNumbersBlock(Block):
    id = "30fa7e09-4c89-4a0a-97d4-eac9d9449e6e"
    description = "İki sayıyı toplar."

    class input_schema(BlockSchema):
        a = SchemaField(float, "Birinci sayı")
        b = SchemaField(float, "İkinci sayı")

    class output_schema(BlockSchemaOutput):
        result = SchemaField(float, "Toplam")

    test_input = [{"a": 2, "b": 3.5}]
    test_output = [("result", 5.5)]

    def run(self, input_data, **kwargs):
        yield "result", float(input_data["a"] + input_data["b"])


class TextFormatBlock(Block):
    """`values` sözlüğü dinamik pinlerle doldurulabilir: `values_#_tutar` → values["tutar"]."""

    id = "88dbc891-7552-4a07-8511-e47ab9ae1efb"
    description = "Şablondaki {alanları} values sözlüğüyle doldurur."

    class input_schema(BlockSchema):
        format = SchemaField(str, "Örn. 'Merhaba {ad}'")
        values = SchemaField(dict, "Şablon değerleri", default={})

    class output_schema(BlockSchemaOutput):
        output = SchemaField(str, "Doldurulmuş metin")

    test_input = [{"format": "Merhaba {ad}", "values": {"ad": "Ayşe"}}]
    test_output = [("output", "Merhaba Ayşe")]

    def run(self, input_data, **kwargs):
        try:
            yield "output", input_data["format"].format(**input_data["values"])
        except KeyError as eksik:
            yield "error", f"şablonda değeri olmayan alan: {eksik}"


class ConditionBlock(Block):
    """`result`'ı her seferinde, yes_output/no_output çiftinden ise YALNIZCA BİRİNİ üretir.
    Dallanmanın kendisi budur: üretilmeyen pine bağlı düğüme hiç değer gitmez."""

    id = "96b6b614-2fac-4a94-9fd6-a5946eeda3c6"
    description = "İki değeri karşılaştırır ve sonuca göre tek bir dala değer gönderir."
    _OPERATORLER = {
        "==": lambda a, b: a == b,
        "!=": lambda a, b: a != b,
        ">": lambda a, b: a > b,
        "<": lambda a, b: a < b,
        ">=": lambda a, b: a >= b,
        "<=": lambda a, b: a <= b,
    }

    class input_schema(BlockSchema):
        value1 = SchemaField(object, "Sol değer")
        operator = SchemaField(str, "==, !=, >, <, >=, <=")
        value2 = SchemaField(object, "Sağ değer")
        yes_value = SchemaField(object, "Doğruysa gönderilecek değer (boşsa value1)", default=None)
        no_value = SchemaField(object, "Yanlışsa gönderilecek değer (boşsa value1)", default=None)

    class output_schema(BlockSchemaOutput):
        result = SchemaField(bool, "Karşılaştırma sonucu")
        yes_output = SchemaField(object, "Koşul doğruysa")
        no_output = SchemaField(object, "Koşul yanlışsa")

    test_input = [{"value1": 10, "operator": ">", "value2": 5, "yes_value": "büyük"}]
    test_output = [("result", True), ("yes_output", "büyük")]

    def run(self, input_data, **kwargs):
        islem = self._OPERATORLER.get(input_data["operator"])
        if islem is None:
            yield "error", f"bilinmeyen operatör: {input_data['operator']}"
            return
        sonuc = bool(islem(input_data["value1"], input_data["value2"]))
        yield "result", sonuc
        if sonuc:
            evet = input_data["yes_value"]
            yield "yes_output", evet if evet is not None else input_data["value1"]
        else:
            hayir = input_data["no_value"]
            yield "no_output", hayir if hayir is not None else input_data["value1"]


class StepThroughItemsBlock(Block):
    """Listedeki her öğe için ayrı bir 'item' üretir → aşağı akışta N ayrı yürütme (fan-out)."""

    id = "0df93f28-a283-43e1-b433-d64d54354c1c"
    description = "Bir listenin öğelerini tek tek yayar."

    class input_schema(BlockSchema):
        items = SchemaField(list, "Gezilecek liste")

    class output_schema(BlockSchemaOutput):
        item = SchemaField(object, "Sıradaki öğe")
        key = SchemaField(int, "Öğenin sırası")

    test_input = [{"items": ["a", "b"]}]
    test_output = [("item", "a"), ("key", 0), ("item", "b"), ("key", 1)]

    def run(self, input_data, **kwargs):
        for sira, oge in enumerate(input_data["items"]):
            yield "item", oge
            yield "key", sira


@dataclass
class BlockInfo:
    """Arayüze gönderilen blok kataloğu satırı (gerçekte Block.get_info)."""

    id: str
    name: str
    description: str
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: dict[str, Any] = field(default_factory=dict)


def block_catalog() -> list[BlockInfo]:
    return [
        BlockInfo(s.id, s.__name__, s.description, s.input_schema.jsonschema(), s.output_schema.jsonschema())
        for s in sorted(load_all_blocks().values(), key=lambda s: s.__name__)
    ]
