"""DNS iletisi (elle kurulmuş baytlar, sıkıştırma, işaretçi döngüsü, rastgele bayt) ve bölge
dosyası.
"""

from __future__ import annotations

import contextlib
import struct
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from dns.message import TYPES, DnsFormatError, Message, Question, Record, Soa, decode_name
from dns.zone import ZoneError, parse_zone

ZONE_FILE = Path(__file__).parents[2] / "dns" / "ornek.zone"


def test_elle_kurulmus_soru_baytlari() -> None:
    expected = bytes.fromhex("1234 0100 0001 0000 0000 0000".replace(" ", ""))
    expected += b"\x03www\x05ornek\x04test\x00" + b"\x00\x01\x00\x01"
    query = Message(0x1234, rd=True, questions=[Question("www.ornek.test", TYPES["A"])])
    assert query.encode() == expected
    assert Message.decode(expected) == query


def test_ad_sikistirma_isaretci_yazar() -> None:
    message = Message(1, qr=True, questions=[Question("www.ornek.test", TYPES["A"])])
    message.answers.append(Record("www.ornek.test", TYPES["A"], 60, "192.0.2.10"))
    message.answers.append(Record("posta.ornek.test", TYPES["A"], 60, "192.0.2.20"))
    data = message.encode()
    assert b"\xc0\x0c" in data  # yanıttaki ad sorudaki ada (konum 12) işaret eder
    assert b"\x05posta\xc0\x10" in data  # "ornek.test" son eki yeniden kullanılır
    assert data.count(b"ornek") == 1
    assert Message.decode(data) == message


def test_tum_kayit_turleri_gidis_donus() -> None:
    soa = Soa("ns1.ornek.test", "yonetici.ornek.test", 2026111601, 7200, 3600, 1209600, 300)
    records = [
        Record("ornek.test", TYPES["SOA"], 300, soa),
        Record("ornek.test", TYPES["NS"], 300, "ns1.ornek.test"),
        Record("ornek.test", TYPES["MX"], 300, (10, "posta.ornek.test")),
        Record("ornek.test", TYPES["TXT"], 300, (b"v=spf1 -all", "türkçe".encode())),
        Record("www.ornek.test", TYPES["AAAA"], 300, "2001:db8::10"),
        Record("blog.ornek.test", TYPES["CNAME"], 300, "www.ornek.test"),
        Record("x.ornek.test", 99, 300, b"\x01\x02"),  # bilinmeyen tür: ham bayt
    ]
    message = Message(7, qr=True, aa=True, answers=records)
    assert Message.decode(message.encode()) == message


def _name_at_12(raw: bytes) -> bytes:
    return struct.pack("!HHHHHH", 1, 0, 1, 0, 0, 0) + raw + b"\x00\x01\x00\x01"


@pytest.mark.parametrize(
    "packet",
    [
        b"\x00" * 11,  # başlıktan kısa
        _name_at_12(b"\xc0\x0c"),  # kendine işaret eden işaretçi (sonsuz döngü)
        _name_at_12(b"\xc0\x20"),  # ileri işaretçi
        _name_at_12(b"\x40abc\x00"),  # ayrılmış etiket türü
        _name_at_12(b"\x05ab"),  # kesik etiket
        _name_at_12(b"\x3f" + b"a" * 63) * 1,  # sıfırla bitmeyen ad
        _name_at_12((b"\x3f" + b"a" * 63) * 4 + b"\x00"),  # 255 baytı aşan ad
        _name_at_12(b"\x03a.b\x00"),  # etiket içinde nokta
        struct.pack("!HHHHHH", 1, 0, 0, 1, 0, 0)
        + b"\x00\x00\x01\x00\x01\x00\x00\x00\x3c\x00\x05\x01\x02",
        _name_at_12(b"\x00") + b"fazla",  # sonda fazladan bayt
    ],
)
def test_bozuk_iletiler_reddedilir(packet: bytes) -> None:
    with pytest.raises(DnsFormatError):
        Message.decode(packet)


def test_isaretci_zinciri_geriye_dogru_izlenir() -> None:
    data = b"\x00" * 12 + b"\x05ornek\x04test\x00" + b"\x03www\xc0\x0c"
    assert decode_name(data, 24) == ("www.ornek.test", 30)


names = st.lists(
    st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789-", min_size=1, max_size=20), max_size=4
)


@given(
    st.integers(0, 0xFFFF),
    st.lists(names, max_size=5),
    st.lists(st.tuples(*[st.integers(0, 255)] * 4), max_size=3),
)
def test_rastgele_ileti_gidis_donus(
    ident: int, owners: list[list[str]], addresses: list[tuple[int, ...]]
) -> None:
    message = Message(ident, qr=True)
    for labels in owners:
        name = ".".join(labels)
        message.questions.append(Question(name, TYPES["A"]))
        for octets in addresses:
            message.answers.append(Record(name, TYPES["A"], 60, ".".join(map(str, octets))))
    assert Message.decode(message.encode()) == message


@given(st.binary(max_size=200))
def test_rastgele_bayt_cozucuyu_cokertmez(data: bytes) -> None:
    with contextlib.suppress(DnsFormatError):
        Message.decode(data)


def test_udp_siniri_tc_ile_keser() -> None:
    message = Message(5, qr=True, questions=[Question("ornek.test", TYPES["TXT"])])
    message.answers = [Record("ornek.test", TYPES["TXT"], 60, (b"x" * 200,)) for _ in range(4)]
    short = Message.decode(message.encode(512))
    assert short.tc and not short.answers and short.questions == message.questions


def test_ornek_bolge_dosyasi() -> None:
    zone = parse_zone(ZONE_FILE.read_text(encoding="utf-8"))
    assert zone.origin == "ornek.test"
    assert zone.lookup("www.ornek.test", TYPES["A"])[0].ttl == 300
    assert zone.lookup("blog.ornek.test", TYPES["CNAME"])[0].data == "www.ornek.test"
    assert zone.lookup("ornek.test", TYPES["MX"])[0].data == (10, "posta.ornek.test")
    assert zone.lookup("xn--kpr-sna6a.ornek.test", TYPES["A"])[0].data == "192.0.2.30"  # köprü
    assert zone.soa is not None and zone.soa.data.minimum == 300


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("$ORIGIN a.test.\n@ IN SOA ns y 1 2 3 4 5\nwww IN A 999.1.1.1", "3. satır"),
        ("$ORIGIN a.test.\n@ IN SOA ns y 1 2 3 4 5\nwww IN HINFO x y", "desteklenmeyen"),
        ('$ORIGIN a.test.\n@ IN SOA ns y 1 2 3 4 5\nwww IN TXT "kapanmamış', "tırnak"),
        ("$ORIGIN a.test.\n@ IN SOA ( ns y 1 2 3 4 5 )", "desteklenmiyor"),
        ("$ORIGIN a.test.\nwww IN A 192.0.2.1", "SOA"),
        ("$ORIGIN a.test.\n@ IN SOA ns y 1 2 3\n", "SOA"),
    ],
)
def test_bolge_hatalari_satir_numarasiyla(text: str, message: str) -> None:
    with pytest.raises(ZoneError, match=message):
        parse_zone(text)
