"""ORM: CRUD, doğrulama, sorgu kurucu, Q, Türkçe arama, enjeksiyon, ilişkiler/N+1, işlemler,
migrasyon.
"""

from __future__ import annotations

import datetime
import sqlite3
from collections.abc import Iterator

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from orm import (
    BlobField,
    BoolField,
    Database,
    DateTimeField,
    ForeignKey,
    IntegerField,
    MigrationError,
    Model,
    Q,
    RealField,
    Reverse,
    TextField,
    ValidationError,
    lower_tr,
    plan_migration,
    upper_tr,
)


class Yazar(Model):
    table = "yazarlar"
    ad = TextField(unique=True, max_length=40)
    sehir = TextField(null=True)
    yas = IntegerField(default=30)
    kitaplar = Reverse("Kitap", "yazar")


class Kitap(Model):
    table = "kitaplar"
    baslik = TextField()
    yazar = ForeignKey("Yazar", on_delete="CASCADE")
    puan = RealField(default=0.0)
    okundu = BoolField(default=False)
    eklenme = DateTimeField(default=lambda: datetime.datetime(2026, 11, 16, 9, 0))
    kapak = BlobField(null=True)


@pytest.fixture
def db() -> Iterator[Database]:
    database = Database()
    database.migrate([Yazar, Kitap])
    yield database
    database.close()


def seed(db: Database) -> list[Yazar]:
    authors = [
        db.save(Yazar(ad=name, sehir=city, yas=age))
        for name, city, age in [
            ("Sait Faik", "İstanbul", 48),
            ("Sabahattin Ali", "Ankara", 41),
            ("Halide Edib", "İSTANBUL", 80),
            ("Orhan Veli", "IĞDIR", 36),
            ("Oğuz Atay", None, 43),
        ]
    ]
    for index, author in enumerate(authors):
        for number in range(3):
            db.save(Kitap(baslik=f"{author.ad} kitabı {number}", yazar=author, puan=index + number))
    return authors


def test_kaydet_guncelle_getir_sil(db: Database) -> None:
    author = db.save(Yazar(ad="Nazım Hikmet"))
    assert author.id == 1
    assert author.yas == 30  # varsayılan
    author.sehir = "Bursa"
    db.save(author)
    loaded = db.get(Yazar, 1)
    assert loaded is not None
    assert (loaded.ad, loaded.sehir, loaded == author) == ("Nazım Hikmet", "Bursa", True)
    db.delete(loaded)
    assert db.get(Yazar, 1) is None


def test_alan_dogrulama(db: Database) -> None:
    with pytest.raises(ValidationError, match="metin"):
        db.save(Yazar(ad=42))
    with pytest.raises(ValidationError, match="40 karakter"):
        db.save(Yazar(ad="x" * 41))
    with pytest.raises(ValidationError, match="boş"):
        db.save(Yazar(ad=None))
    with pytest.raises(ValidationError, match="tam sayı"):
        db.save(Yazar(ad="a", yas=True))
    with pytest.raises(TypeError, match="böyle alan yok"):
        Yazar(ad="a", soyad="b")


def test_turler_gidis_donus(db: Database) -> None:
    author = db.save(Yazar(ad="a"))
    book = db.save(Kitap(baslik="b", yazar=author, okundu=True, puan=4, kapak=b"\x00\xff"))
    loaded = db.get(Kitap, book.id)
    assert loaded is not None
    assert (loaded.okundu, loaded.puan, loaded.kapak) == (True, 4.0, b"\x00\xff")
    assert loaded.eklenme == datetime.datetime(2026, 11, 16, 9, 0)


def test_sorgu_kurucu(db: Database) -> None:
    seed(db)
    names = [a.ad for a in db.query(Yazar).filter(yas__gte=41).order_by("-yas").all()]
    assert names == ["Halide Edib", "Sait Faik", "Oğuz Atay", "Sabahattin Ali"]
    assert db.query(Yazar).exclude(sehir__isnull=True).count() == 4
    assert db.query(Yazar).filter(ad__in=["Sait Faik", "Yok"]).count() == 1
    assert db.query(Yazar).filter(ad__in=[]).count() == 0
    assert db.query(Yazar).filter(ad__startswith="Sa").count() == 2
    page = db.query(Yazar).order_by("ad").limit(2, offset=1).all()
    assert [a.ad for a in page] == ["Orhan Veli", "Oğuz Atay"]
    first = db.query(Yazar).order_by("yas").first()
    assert first is not None and first.ad == "Orhan Veli"
    assert not db.query(Yazar).filter(yas__gt=100).exists()
    assert db.query(Kitap).filter(puan__lt=1).update(okundu=True) == 1
    assert db.query(Kitap).filter(okundu=True).delete() == 1


def test_q_ile_ve_veya_degil(db: Database) -> None:
    seed(db)
    condition = Q(sehir="Ankara") | (Q(yas__gt=45) & ~Q(ad="Halide Edib"))
    assert sorted(a.ad for a in db.query(Yazar).filter(condition)) == [
        "Sabahattin Ali",
        "Sait Faik",
    ]
    assert db.query(Yazar).filter(Q(yas=48), ad="Sait Faik").count() == 1


def test_turkce_buyuk_kucuk_harf_arama(db: Database) -> None:
    seed(db)
    istanbul = db.query(Yazar).filter(sehir__icontains="istanbul").all()
    assert sorted(a.ad for a in istanbul) == ["Halide Edib", "Sait Faik"]
    assert [a.ad for a in db.query(Yazar).filter(sehir__icontains="ığdır")] == ["Orhan Veli"]
    assert db.query(Yazar).filter(sehir__icontains="igdir").count() == 0  # ı ≠ i
    assert lower_tr("İSTANBUL IĞDIR") == "istanbul ığdır"
    assert upper_tr("istanbul ılık") == "İSTANBUL ILIK"
    assert "İSTANBUL".lower() != "istanbul"  # bu yüzden kendi işlevimiz var


def test_sql_enjeksiyonu_ve_like_kacisi(db: Database) -> None:
    seed(db)
    assert db.query(Yazar).filter(ad="x' OR '1'='1").count() == 0
    assert db.query(Yazar).filter(ad="Sait Faik'; DROP TABLE yazarlar; --").count() == 0
    db.save(Yazar(ad="yüzde%100"))
    assert [a.ad for a in db.query(Yazar).filter(ad__contains="%")] == ["yüzde%100"]
    assert db.query(Yazar).filter(ad__contains="_").count() == 0
    with pytest.raises(ValidationError, match="alanı yok"):
        db.query(Yazar).order_by("ad; DROP TABLE yazarlar")
    with pytest.raises(ValidationError, match="alanı yok"):
        db.query(Yazar).filter(**{"ad = 1 OR 1": 1}).all()
    with pytest.raises(ValidationError, match="arama eki"):
        db.query(Yazar).filter(ad__regex=".*").all()
    assert db.query(Yazar).count() == 6  # tablo yerinde


@settings(max_examples=40)
@given(st.text(max_size=60))
def test_rastgele_metin_gidis_donus(text: str) -> None:
    database = Database()
    database.migrate([Yazar, Kitap])
    saved = database.save(Yazar(ad=text[:40]))
    assert database.query(Yazar).filter(ad=text[:40]).first() == saved
    found = database.query(Yazar).filter(ad__contains=text[:5]).count()
    assert found == 1
    database.close()


def test_iliskiler_ve_silme_zinciri(db: Database) -> None:
    authors = seed(db)
    book = db.query(Kitap).first()
    assert book is not None
    assert book.yazar == authors[0]
    assert book.yazar_id == authors[0].id
    assert len(authors[1].kitaplar) == 3
    book.yazar = authors[1].id  # kimlikle de atanabilir
    db.save(book)
    assert len(authors[1].kitaplar) == 4
    deleted_id = authors[1].id
    db.delete(authors[1])  # ON DELETE CASCADE; nesnenin id'si None olur
    assert authors[1].id is None
    assert db.query(Kitap).filter(yazar_id=deleted_id).count() == 0
    with pytest.raises(sqlite3.IntegrityError):
        db.save(Kitap(baslik="sahipsiz", yazar_id=999))
    with pytest.raises(sqlite3.IntegrityError):
        db.save(Yazar(ad="Sait Faik"))  # benzersiz


def test_n_arti_bir_sorunu_ve_on_yukleme(db: Database) -> None:
    seed(db)
    with db.count_queries() as lazy:
        for author in db.query(Yazar).all():
            assert len(author.kitaplar) == 3
    assert lazy.count == 1 + 5  # her yazar için ayrı sorgu: N+1
    with db.count_queries() as eager:
        for author in db.query(Yazar).prefetch("kitaplar").all():
            assert len(author.kitaplar) == 3
    assert eager.count == 2
    with db.count_queries() as lazy_fk:
        titles = [book.yazar.ad for book in db.query(Kitap).all()]
    assert lazy_fk.count == 1 + 15
    with db.count_queries() as eager_fk:
        assert [book.yazar.ad for book in db.query(Kitap).prefetch("yazar").all()] == titles
    assert eager_fk.count == 2
    with pytest.raises(ValidationError, match="ilişki değil"):
        db.query(Kitap).prefetch("baslik")


def _failing_insert(db: Database, name: str) -> None:
    with db.transaction():
        db.save(Yazar(ad=name))
        raise RuntimeError("iptal")


def test_islem_geri_alma_ve_ic_ice(db: Database) -> None:
    with pytest.raises(RuntimeError):
        _failing_insert(db, "geri alınacak")
    assert db.query(Yazar).count() == 0
    with db.transaction():
        db.save(Yazar(ad="dış"))
        with pytest.raises(RuntimeError):
            _failing_insert(db, "iç")  # iç içe: yalnız iç kısım (SAVEPOINT) geri alınır
        db.save(Yazar(ad="dış-2"))
    assert sorted(a.ad for a in db.query(Yazar)) == ["dış", "dış-2"]


class UrunV1(Model):
    table = "urunler"
    ad = TextField()


class UrunV2(Model):
    table = "urunler"
    ad = TextField()
    fiyat = RealField(null=True)
    stok = IntegerField(default=0)
    kategori = TextField(null=True, index=True)


class UrunV3Kotu(Model):
    table = "urunler"
    ad = TextField()
    zorunlu = TextField()


class UrunV4Tur(Model):
    table = "urunler"
    ad = IntegerField()


class UrunV5Azalan(Model):
    table = "urunler"
    fiyat = RealField(null=True)


def test_migrasyon_adimlari() -> None:
    db = Database()
    first = db.migrate([UrunV1])
    assert [s.description for s in first] == ["urunler tablosu oluşturulacak"]
    db.save(UrunV1(ad="çay"))
    steps = db.migrate([UrunV2])
    assert [s.description for s in steps] == [
        "urunler.fiyat sütunu eklenecek",
        "urunler.stok sütunu eklenecek",
        "urunler.kategori sütunu eklenecek",
        "urunler.kategori dizini",
    ]
    loaded = db.query(UrunV2).first()
    assert loaded is not None and (loaded.ad, loaded.fiyat, loaded.stok) == ("çay", None, 0)
    assert db.migrate([UrunV2]) == []  # ikinci kez: değişiklik yok
    with pytest.raises(MigrationError, match="varsayılansız"):
        plan_migration(db, [UrunV3Kotu])
    with pytest.raises(MigrationError, match="değişimi"):
        plan_migration(db, [UrunV4Tur])
    with pytest.raises(MigrationError, match="allow_drop"):
        db.migrate([UrunV5Azalan])
    dropped = db.migrate([UrunV5Azalan], allow_drop=True)
    assert [s.description for s in dropped] == [
        "urunler.ad sütunu silinecek",
        "urunler.stok sütunu silinecek",
        "urunler.kategori dizini silinecek",
        "urunler.kategori sütunu silinecek",
    ]
    assert db.query(UrunV5Azalan).count() == 1  # satırlar duruyor
    db.close()


def test_kaydedilmemis_nesne_ve_bagsiz_iliski() -> None:
    db = Database()
    db.migrate([Yazar, Kitap])
    with pytest.raises(ValueError, match="Kaydedilmemiş"):
        db.delete(Yazar(ad="a"))
    with pytest.raises(RuntimeError, match="bağlı değil"):
        _ = Kitap(baslik="x", yazar_id=1).yazar
    db.close()
