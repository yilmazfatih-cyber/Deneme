"""Sağlayıcı katmanının ortak veri tipleri: mesaj, araç çağrısı, istek, yanıt, kullanım.

Bütün bağdaştırıcılar (OpenAI uyumlu, Anthropic, Sahte) bu tiplerle konuşur; sağlayıcıya özgü
biçime çevirme yalnız bağdaştırıcının içinde yapılır. Rol değerleri ("system", "user",
"assistant", "tool") tel biçimindeki adlarıyla kalır.
Kim kullanır: paketin tamamı.
Genişletme: yeni bir alan gerekiyorsa buraya varsayılan değerle ekleyin (eski kayıtlar bozulmasın).
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Rol = Literal["system", "user", "assistant", "tool"]
BitisNedeni = Literal["bitti", "uzunluk", "arac", "ret", "suzgec", "diger"]


class AracCagrisi(BaseModel):
    """Modelin bir aracı çağırma isteği."""

    kimlik: str
    ad: str
    argumanlar: dict[str, Any] = Field(default_factory=dict)
    ham_argumanlar: str | None = None  # modelin yazdığı ham metin (ayrıştırma hatası ayıklamak için)

    def json_argumanlar(self) -> str:
        """Argümanları tel biçimi için JSON dizgisine çevirir."""
        return json.dumps(self.argumanlar, ensure_ascii=False)


class Mesaj(BaseModel):
    """Konuşmadaki tek bir mesaj."""

    model_config = ConfigDict(extra="forbid")

    rol: Rol
    icerik: str = ""
    arac_cagrilari: list[AracCagrisi] = Field(default_factory=list)  # yalnız rol="assistant"
    arac_cagri_kimligi: str | None = None  # yalnız rol="tool": hangi çağrının sonucu
    ad: str | None = None  # yalnız rol="tool": aracın adı
    arac_hatasi: bool = False  # yalnız rol="tool": araç hata döndürdüyse True
    saglayici_verisi: dict[str, Any] | None = None  # bağdaştırıcının geri isteyeceği ham içerik

    @classmethod
    def sistem(cls, icerik: str) -> Mesaj:
        return cls(rol="system", icerik=icerik)

    @classmethod
    def kullanici(cls, icerik: str) -> Mesaj:
        return cls(rol="user", icerik=icerik)

    @classmethod
    def asistan(cls, icerik: str = "", arac_cagrilari: list[AracCagrisi] | None = None) -> Mesaj:
        return cls(rol="assistant", icerik=icerik, arac_cagrilari=arac_cagrilari or [])

    @classmethod
    def arac(cls, kimlik: str, icerik: str, ad: str | None = None, hata: bool = False) -> Mesaj:
        """Bir araç çağrısının sonucu (gözlem)."""
        return cls(rol="tool", icerik=icerik, arac_cagri_kimligi=kimlik, ad=ad, arac_hatasi=hata)


class AracTanimi(BaseModel):
    """Modele sunulan aracın tanımı (ad, açıklama, parametre JSON şeması)."""

    ad: str
    aciklama: str
    parametreler: dict[str, Any] = Field(
        default_factory=lambda: {"type": "object", "properties": {}}
    )


class YanitBicimi(BaseModel):
    """İstenen çıktı biçimi: serbest JSON ("json") ya da şemaya bağlı JSON ("json_sema")."""

    tur: Literal["json", "json_sema"]
    sema: dict[str, Any] | None = None
    ad: str = "yanit"


def yanit_bicimi_coz(
    bicim: YanitBicimi | type[BaseModel] | dict[str, Any] | str | None,
) -> YanitBicimi | None:
    """Kullanıcının verdiği biçimi (`"json"`, şema sözlüğü, Pydantic sınıfı) tek tipe indirger."""
    if bicim is None or isinstance(bicim, YanitBicimi):
        return bicim
    if isinstance(bicim, str):
        if bicim != "json":
            raise ValueError(f'yanit_bicimi dizgi ise yalnız "json" olabilir; gelen: {bicim!r}')
        return YanitBicimi(tur="json")
    if isinstance(bicim, dict):
        return YanitBicimi(tur="json_sema", sema=bicim, ad=str(bicim.get("title", "yanit")))
    if isinstance(bicim, type) and issubclass(bicim, BaseModel):
        return YanitBicimi(tur="json_sema", sema=bicim.model_json_schema(), ad=bicim.__name__)
    raise TypeError(
        "yanit_bicimi şunlardan biri olmalı: None, \"json\", JSON şeması (dict), Pydantic sınıfı."
    )


class SohbetIstegi(BaseModel):
    """Bağdaştırıcıya giden, doğrulanmış ve tek biçime indirgenmiş sohbet isteği."""

    mesajlar: list[Mesaj]
    araclar: list[AracTanimi] = Field(default_factory=list)
    yanit_bicimi: YanitBicimi | None = None
    sicaklik: float | None = 0.0
    azami_belirtec: int | None = None
    dur: list[str] = Field(default_factory=list)
    arac_secimi: str = "oto"  # "oto" | "yok" | "zorunlu" | belirli bir araç adı
    tohum: int | None = None
    ek: dict[str, Any] = Field(default_factory=dict)  # sağlayıcıya özgü ek gövde alanları


class Kullanim(BaseModel):
    """Bir çağrının belirteç (token) kullanımı."""

    girdi_belirteci: int = 0
    cikti_belirteci: int = 0
    tahmini: bool = False  # sağlayıcı bildirmediyse karakter sayısından tahmin edilmiştir
    onbellekten: bool = False  # yanıt disk önbelleğinden geldi (yeni maliyet yok)

    @property
    def toplam(self) -> int:
        return self.girdi_belirteci + self.cikti_belirteci

    def __add__(self, diger: Kullanim) -> Kullanim:
        return Kullanim(
            girdi_belirteci=self.girdi_belirteci + diger.girdi_belirteci,
            cikti_belirteci=self.cikti_belirteci + diger.cikti_belirteci,
            tahmini=self.tahmini or diger.tahmini,
            onbellekten=self.onbellekten and diger.onbellekten,
        )


class Yanit(BaseModel):
    """Modelin tek bir çağrıya verdiği yanıt."""

    metin: str = ""
    arac_cagrilari: list[AracCagrisi] = Field(default_factory=list)
    bitis_nedeni: BitisNedeni = "bitti"
    kullanim: Kullanim = Field(default_factory=Kullanim)
    model: str = ""
    gecikme_sn: float = 0.0
    dusunce: str = ""  # modelin "düşünme" metni (reasoning_content ya da <think> bloğu)
    saglayici_verisi: dict[str, Any] | None = None

    def mesaj(self) -> Mesaj:
        """Yanıtı konuşma geçmişine eklenecek asistan mesajına çevirir."""
        return Mesaj(
            rol="assistant",
            icerik=self.metin,
            arac_cagrilari=list(self.arac_cagrilari),
            saglayici_verisi=self.saglayici_verisi,
        )


class AkisParcasi(BaseModel):
    """Akışlı yanıtın bir parçası. Son parçada `son` doludur ve birikmiş tam yanıtı taşır."""

    metin: str = ""
    dusunce: str = ""
    son: Yanit | None = None


class ModelBilgisi(BaseModel):
    """Sunucunun bildirdiği bir model."""

    kimlik: str
    sahip: str = ""
    ham: dict[str, Any] = Field(default_factory=dict)


MesajGirdisi = Mesaj | dict[str, Any] | str


def mesajlari_coz(mesajlar: list[MesajGirdisi] | str) -> list[Mesaj]:
    """Esnek girdiyi `Mesaj` listesine çevirir.

    Kabul edilenler: tek dizgi (kullanıcı mesajı), `Mesaj`, `{"rol": ..., "icerik": ...}` ve
    OpenAI biçimi `{"role": ..., "content": ...}` sözlükleri.
    """
    if isinstance(mesajlar, str):
        return [Mesaj.kullanici(mesajlar)]
    sonuc: list[Mesaj] = []
    for m in mesajlar:
        if isinstance(m, Mesaj):
            sonuc.append(m)
        elif isinstance(m, str):
            sonuc.append(Mesaj.kullanici(m))
        elif "role" in m:
            sonuc.append(Mesaj(rol=m["role"], icerik=str(m.get("content") or "")))
        else:
            sonuc.append(Mesaj.model_validate(m))
    if not sonuc:
        raise ValueError("En az bir mesaj gerekli.")
    return sonuc
