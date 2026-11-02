"""Ortak test fikstürleri: bellek içi veritabanı ve örnek belgeler."""

from __future__ import annotations

from datetime import date

import pytest

from legalai.chunking import chunk_document
from legalai.db import Database
from legalai.models import DocType, Document, SourceId

TBK_SAMPLE = """TÜRK BORÇLAR KANUNU

Kanun Numarası : 6098

MADDE 1 - Sözleşme, tarafların iradelerini karşılıklı ve birbirine uygun olarak açıklamalarıyla kurulur.
İrade açıklaması, açık veya örtülü olabilir.

MADDE 2 - Taraflar sözleşmenin esaslı noktalarında uyuşmuşlarsa, ikinci derecedeki noktalar üzerinde
durulmamış olsa bile, sözleşme kurulmuş sayılır.

MADDE 299 - Kira sözleşmesi, kiraya verenin bir şeyin kullanılmasını veya kullanmayla birlikte ondan
yararlanılmasını kiracıya bırakmayı, kiracının da buna karşılık kararlaştırılan kira bedelini ödemeyi
üstlendiği sözleşmedir.

MADDE 344 - Tarafların yenilenen kira dönemlerinde uygulanacak kira bedeline ilişkin anlaşmaları, bir önceki
kira yılında tüketici fiyat endeksindeki oniki aylık ortalamalara göre değişim oranını geçmemek koşuluyla
geçerlidir. Bu kural, bir yıldan daha uzun süreli kira sözleşmelerinde de uygulanır.
"""

KARAR_SAMPLE = """T.C. YARGITAY 3. HUKUK DAİRESİ
Esas No: 2022/1234 Karar No: 2023/5678 Karar Tarihi: 15.03.2023

DAVA
Davacı kiraya veren, kira bedelinin tespiti istemiyle dava açmıştır.

GEREKÇE
Türk Borçlar Kanunu'nun 344. maddesi uyarınca kira artış oranı tüketici fiyat endeksindeki oniki aylık
ortalamalara göre değişim oranını geçemez. Somut olayda taraflar arasında yüzde yirmi beş artış kararlaştırılmış
olup bu oran yasal sınırı aşmaktadır. İhtiyati tedbir talebi ise bu aşamada değerlendirilmemiştir.

HÜKÜM
Yukarıda açıklanan nedenlerle kararın BOZULMASINA, 15.03.2023 tarihinde oy birliğiyle karar verildi.
"""


def make_doc(source: SourceId, external_id: str, title: str, text: str, **kw) -> Document:
    return Document(
        doc_id=f"{source}:{external_id}",
        source=source,
        external_id=external_id,
        url=kw.pop("url", f"https://example.gov.tr/{source}/{external_id}"),
        title=title,
        text=text,
        **kw,
    )


@pytest.fixture
def tbk_doc() -> Document:
    return make_doc(
        SourceId.MEVZUAT,
        "1.5.6098",
        "Türk Borçlar Kanunu",
        TBK_SAMPLE,
        doc_type=DocType.KANUN,
        law_no="6098",
        published_at=date(2011, 2, 4),
        url="https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6098&MevzuatTur=1&MevzuatTertip=5",
    )


@pytest.fixture
def karar_doc() -> Document:
    return make_doc(
        SourceId.YARGITAY,
        "abc123",
        "Yargıtay 3. Hukuk Dairesi E. 2022/1234 K. 2023/5678",
        KARAR_SAMPLE,
        doc_type=DocType.MAHKEME_KARARI,
        court="Yargıtay 3. Hukuk Dairesi",
        case_no="2022/1234",
        decision_no="2023/5678",
        decision_date=date(2023, 3, 15),
        published_at=date(2023, 3, 15),
        url="https://karararama.yargitay.gov.tr/getDokuman?id=abc123",
    )


@pytest.fixture
def db(tbk_doc: Document, karar_doc: Document) -> Database:
    database = Database(":memory:")
    for doc in (tbk_doc, karar_doc):
        database.upsert_document(doc, chunk_document(doc))
    return database
